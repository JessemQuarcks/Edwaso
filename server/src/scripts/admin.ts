// Admin account CLI. Run from server/: `npm run admin -- <command> [options]`.
//
//   create --email <email> [--name <name>] [--role owner|admin|staff]
//   reset-password --email <email>     issue a temporary password, sign out everywhere
//   reset-2fa --email <email>          clear two-factor so it can be enrolled again
//   unlock --email <email>             clear a failed-login lockout
//   list                               list staff accounts
//   migrate-roles                      convert legacy `isAdmin` users to `role`
//
// Passwords are typed at a hidden prompt, never passed as arguments (they would end up in
// shell history and the process list).
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import AdminSession from '../models/AdminSession.js';
import AuditLog from '../models/AuditLog.js';
import User, { ADMIN_MIN_PASSWORD, ADMIN_ROLES, type Role, type UserDoc } from '../models/User.js';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'owner' },
  },
});
const command = positionals[0];

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

// ---- prompts ----

let pipedLines: string[] | undefined;

async function readPipedLine(): Promise<string> {
  if (!pipedLines) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    pipedLines = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
  }
  return pipedLines.shift() ?? '';
}

async function prompt(question: string, hidden = false): Promise<string> {
  if (!process.stdin.isTTY) return readPipedLine();
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // readline has no public "mute" option; swallowing its echo is the standard workaround.
  const internal = rl as unknown as { _writeToOutput: (s: string) => void };
  let muted = false;
  internal._writeToOutput = (s: string) => {
    if (!muted) process.stdout.write(s);
  };
  const answer = new Promise<string>((resolve) => {
    rl.question(question, (value) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(value);
    });
  });
  muted = hidden;
  return answer;
}

const temporaryPassword = (): string => randomBytes(12).toString('base64url');

async function choosePassword(): Promise<{ password: string; temporary: boolean }> {
  const password = await prompt(`Password (min ${ADMIN_MIN_PASSWORD} chars, blank to generate a temporary one): `, true);
  if (!password) return { password: temporaryPassword(), temporary: true };
  if (password.length < ADMIN_MIN_PASSWORD) fail(`Password must be at least ${ADMIN_MIN_PASSWORD} characters`);
  if (password.length > 72) fail('Password must be at most 72 characters');
  if ((await prompt('Repeat password: ', true)) !== password) fail('Passwords do not match');
  return { password, temporary: false };
}

// ---- helpers ----

async function findStaff(): Promise<UserDoc> {
  const email = values.email?.trim().toLowerCase();
  if (!email) fail('--email is required');
  const user = await User.findOne({ email });
  if (!user) fail(`No account with email ${email}`);
  if (!ADMIN_ROLES.includes(user.role)) fail(`${email} is a customer account, not a staff account`);
  return user;
}

/** Bumps tokenVersion and deletes every admin session for the user. */
async function signOutEverywhere(user: UserDoc): Promise<void> {
  user.tokenVersion += 1;
  await AdminSession.deleteMany({ user: user._id });
}

const cliAudit = (action: string, user: UserDoc) =>
  AuditLog.create({ action, entity: 'User', entityId: user.id, meta: { email: user.email, via: 'cli' } });

// ---- commands ----

async function create(): Promise<void> {
  const email = values.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('--email must be a valid email address');
  const role = values.role as Role;
  if (!ADMIN_ROLES.includes(role)) fail(`--role must be one of ${ADMIN_ROLES.join(', ')}`);
  if (await User.exists({ email })) {
    fail(`An account already uses ${email}. Staff accounts need their own email, separate from any shopping account.`);
  }
  const name = values.name?.trim() || (await prompt('Name: ')).trim() || 'Admin';
  const { password, temporary } = await choosePassword();

  const user = await User.create({ name, email, password, role, mustChangePassword: temporary });
  await cliAudit('cli.admin_create', user);

  console.log(`\nCreated ${role} account for ${email}.`);
  if (temporary) console.log(`Temporary password (shown once, must be changed at first sign-in): ${password}`);
  console.log('Sign in at /admin/login. You will be asked to set up two-factor authentication.');
}

async function resetPassword(): Promise<void> {
  const user = await findStaff();
  const password = temporaryPassword();
  user.password = password;
  user.mustChangePassword = true;
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  await signOutEverywhere(user);
  await user.save();
  await cliAudit('cli.password_reset', user);
  console.log(`Temporary password for ${user.email} (shown once): ${password}`);
  console.log('All of their sessions have been signed out.');
}

async function reset2fa(): Promise<void> {
  const user = await findStaff();
  user.totpEnabled = false;
  user.totpSecret = undefined;
  user.totpLastStep = undefined;
  user.recoveryCodes = [];
  await signOutEverywhere(user);
  await user.save();
  await cliAudit('cli.2fa_reset', user);
  console.log(`Two-factor cleared for ${user.email}. They will enrol again at next sign-in.`);
}

async function unlock(): Promise<void> {
  const user = await findStaff();
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  await user.save();
  await cliAudit('cli.unlock', user);
  console.log(`Unlocked ${user.email}.`);
}

async function list(): Promise<void> {
  const staff = await User.find({ role: { $in: ADMIN_ROLES } }).sort({ role: 1, email: 1 });
  if (staff.length === 0) return console.log('No staff accounts. Create one with: npm run admin -- create --email ...');
  console.table(
    staff.map((u) => ({
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      '2fa': u.totpEnabled ? 'on' : 'not enrolled',
      lastLogin: u.lastLoginAt?.toISOString() ?? '-',
    }))
  );
}

// Legacy users have `isAdmin: boolean` and no `role`. Uses the raw collection because
// Mongoose's strict mode would strip `isAdmin` (no longer in the schema) from the query.
async function migrateRoles(): Promise<void> {
  const users = User.collection;
  const admins = await users.updateMany(
    { isAdmin: true, role: { $exists: false } },
    // Legacy admins may still have the old seeded password: force a change and 2FA enrolment.
    { $set: { role: 'admin', mustChangePassword: true }, $unset: { isAdmin: '' } }
  );
  const customers = await users.updateMany(
    { role: { $exists: false } },
    { $set: { role: 'customer' }, $unset: { isAdmin: '' } }
  );
  const leftovers = await users.updateMany({ isAdmin: { $exists: true } }, { $unset: { isAdmin: '' } });
  console.log(
    `Migrated ${admins.modifiedCount} admin(s) and ${customers.modifiedCount} customer(s); ` +
      `cleaned ${leftovers.modifiedCount} leftover flag(s).`
  );
  if (admins.modifiedCount > 0) {
    console.log('Migrated admins must change their password and enrol 2FA at next sign-in.');
  }
}

const COMMANDS: Record<string, () => Promise<void>> = {
  create,
  'reset-password': resetPassword,
  'reset-2fa': reset2fa,
  unlock,
  list,
  'migrate-roles': migrateRoles,
};

const run = command ? COMMANDS[command] : undefined;
if (!run) fail(`Usage: npm run admin -- <${Object.keys(COMMANDS).join('|')}> [--email ...]`);

await connectDB();
try {
  await run();
} finally {
  await mongoose.disconnect();
}
