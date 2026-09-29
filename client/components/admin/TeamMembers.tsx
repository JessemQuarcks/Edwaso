'use client';

import { motion } from 'motion/react';
import { Ban, CircleCheck, MoreHorizontal, ShieldAlert, ShieldCheck, UserCog } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { useAdminQuery } from '@/lib/use-admin-query';
import { timeAgo } from '@/lib/admin-format';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import FormError from './FormError';
import { useAdmin } from './AdminShell';
import { useToast } from './Toaster';
import { Avatar } from './kit';
import { rowMotion } from './motion';
import type { AdminRole, TeamMember } from '@/types/admin';

/** Mirrors the API's rules (server/src/routes/admin/team.ts); the server enforces them. */
const MANAGES: Partial<Record<AdminRole, AdminRole[]>> = { owner: ['admin', 'staff'], admin: ['staff'] };

export default function TeamMembers() {
  const me = useAdmin();
  const toast = useToast();
  const { data, error, setData } = useAdminQuery<{ members: TeamMember[] }>('/team');

  async function update(member: TeamMember, change: { role?: AdminRole; status?: TeamMember['status'] }, message: string) {
    try {
      const res = await adminApi<{ member: TeamMember }>(`/team/${member._id}`, { method: 'PATCH', body: change });
      setData({ members: data!.members.map((m) => (m._id === member._id ? res.member : m)) });
      toast(message, { description: member.name });
    } catch (err) {
      toast('Couldn’t update team member', { description: errorMessage(err), variant: 'error' });
    }
  }

  const manageable = MANAGES[me.role] ?? [];

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Members</CardTitle>
        <CardDescription>
          Staff sign in at <code className="text-xs">/admin/login</code> with their own account, separate from any
          shopping account.
        </CardDescription>
      </CardHeader>
      <FormError message={error} />
      {!data ? (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Two-factor</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 pr-6" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.members.map((m, i) => {
                const isMe = m._id === me.id;
                const canManage = !isMe && manageable.includes(m.role);
                return (
                  <motion.tr key={m._id} {...rowMotion(i)} className="border-b">
                    <TableCell className="pl-6">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={m.name} />
                        <span className="min-w-0">
                          <span className="block max-w-56 truncate font-medium">
                            {m.name}
                            {isMe && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                          </span>
                          <span className="block max-w-56 truncate text-xs text-muted-foreground">{m.email}</span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.role === 'owner' ? 'default' : 'secondary'} className="capitalize">
                        {m.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-sm">
                        {m.totpEnabled ? (
                          <>
                            <ShieldCheck className="size-4 text-delta-good" /> On
                          </>
                        ) : (
                          <>
                            <ShieldAlert className="size-4 text-status-warning" /> Not set up
                          </>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {m.lastLoginAt ? timeAgo(m.lastLoginAt) : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.status === 'active' ? 'secondary' : 'destructive'} className="capitalize">
                        {m.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-6">
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                            aria-label={`Manage ${m.name}`}
                          >
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {me.role === 'owner' && m.role === 'staff' && (
                              <DropdownMenuItem onClick={() => void update(m, { role: 'admin' }, 'Promoted to admin')}>
                                <UserCog />
                                Make admin
                              </DropdownMenuItem>
                            )}
                            {me.role === 'owner' && m.role === 'admin' && (
                              <DropdownMenuItem onClick={() => void update(m, { role: 'staff' }, 'Changed to staff')}>
                                <UserCog />
                                Make staff
                              </DropdownMenuItem>
                            )}
                            {me.role === 'owner' && <DropdownMenuSeparator />}
                            {m.status === 'active' ? (
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => {
                                  if (confirm(`Disable ${m.name}? They’ll be signed out everywhere.`)) {
                                    void update(m, { status: 'disabled' }, 'Access disabled');
                                  }
                                }}
                              >
                                <Ban />
                                Disable access
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => void update(m, { status: 'active' }, 'Access restored')}>
                                <CircleCheck />
                                Restore access
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </motion.tr>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
