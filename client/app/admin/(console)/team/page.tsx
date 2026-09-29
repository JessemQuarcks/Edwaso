'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, Loader2, Lock, Send, X } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdmin } from '@/components/admin/AdminShell';
import FormError from '@/components/admin/FormError';
import TeamMembers from '@/components/admin/TeamMembers';
import type { Invite } from '@/types/admin';

type InviteRole = Invite['role'];

const ROLE_HELP: Record<InviteRole, string> = {
  staff: 'Manage products and orders.',
  admin: 'Everything staff can do, plus invite staff and view the audit log.',
};

// Native <select>, matching the storefront filter (see app/(shop)/page.tsx).
const SELECT_CLASS =
  'h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

export default function TeamPage() {
  const admin = useAdmin();
  const canInvite: InviteRole[] = admin.role === 'owner' ? ['staff', 'admin'] : admin.role === 'admin' ? ['staff'] : [];

  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('staff');
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setInvites((await adminApi<{ invites: Invite[] }>('/invites')).invites);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  const canManage = canInvite.length > 0;
  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);

  if (!canManage) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-20 text-center">
        <Lock className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Only owners and admins can manage the team.</p>
      </div>
    );
  }

  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      const res = await adminApi<{ inviteUrl: string }>('/invites', { method: 'POST', body: { email, role } });
      setLink({ email, url: res.inviteUrl });
      setCopied(false);
      setEmail('');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this invite? The link will stop working.')) return;
    try {
      await adminApi(`/invites/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      // Clipboard blocked; the link is selectable on screen.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <TeamMembers />

      <Card>
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
          <CardDescription>They get a one-time link, valid for 24 hours, to set a password and turn on two-factor.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={invite} className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor="invite-email">Work email</Label>
              <Input
                id="invite-email"
                type="email"
                required
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                className={SELECT_CLASS}
                value={role}
                onChange={(e) => setRole(e.target.value as InviteRole)}
              >
                {canInvite.map((r) => (
                  <option key={r} value={r}>
                    {r[0]!.toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={sending}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              Create invite
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">{ROLE_HELP[role]}</p>

          <FormError message={error} />

          {link && (
            <Alert>
              <Check />
              <AlertTitle>Invite link for {link.email}</AlertTitle>
              <AlertDescription className="flex flex-col gap-2">
                <span>
                  Send this link to them privately. It’s shown only once; if it gets lost, create a new invite.
                </span>
                <div className="flex w-full items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 font-mono text-xs select-all">
                    {link.url}
                  </code>
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
                    {copied ? <Check /> : <Copy />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invites</CardTitle>
          <CardDescription>
            {invites.length === 0 ? 'No outstanding invites.' : `${invites.length} waiting to be accepted.`}
          </CardDescription>
        </CardHeader>
        {invites.length > 0 && (
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Invited by</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((inv) => (
                    <TableRow key={inv._id}>
                      <TableCell className="font-medium">{inv.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {inv.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {typeof inv.invitedBy === 'string' ? '—' : inv.invitedBy.name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(inv.expiresAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive"
                          onClick={() => void revoke(inv._id)}
                          aria-label={`Revoke invite for ${inv.email}`}
                        >
                          <X />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
