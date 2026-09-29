import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkIcon } from 'lucide-react';
import AcceptInviteForm from '@/components/admin/AcceptInviteForm';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { getInvite } from '@/lib/admin-server';

export const metadata: Metadata = { title: 'Accept invite' };

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInvite(token);

  if (!invite) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <LinkIcon className="mb-2 size-6 text-muted-foreground" />
          <CardTitle className="text-xl">Invite link not valid</CardTitle>
          <CardDescription>
            It may have expired (links last 24 hours), been used already, or been replaced by a newer
            invite. Ask whoever invited you to send a new one.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/admin/login" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
            Go to sign in
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return <AcceptInviteForm token={token} invite={invite} />;
}
