import { connectDB } from './config/db.js';
import { createApp, REQUIRED_ENV } from './app.js';

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key} (see .env.example)`);
    process.exit(1);
  }
}

const port = Number(process.env.PORT ?? 5000);

try {
  await connectDB();
  createApp().listen(port, () => console.log(`API listening on http://localhost:${port}`));
} catch (err) {
  console.error('Failed to start:', (err as Error).message);
  process.exit(1);
}
