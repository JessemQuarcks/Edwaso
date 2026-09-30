'use client';

import { Fragment, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Download, ScrollText, X } from 'lucide-react';
import { useAdminQuery, useDebounced } from '@/lib/use-admin-query';
import { useUrlState } from '@/lib/use-url-state';
import { formatDateTime } from '@/lib/admin-format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import FormError from '@/components/admin/FormError';
import { useAdmin } from '@/components/admin/AdminShell';
import { EmptyState, Pagination, SearchInput, SELECT_CLASS } from '@/components/admin/kit';
import { EASE_OUT } from '@/components/admin/motion';
import type { AuditEntry, AuditResponse } from '@/types/admin';

const LIMIT = 50;

/** Where an entity's detail page lives, so entries can link to what they changed. */
const ENTITY_LINK: Record<string, (id: string) => string> = {
  Order: (id) => `/admin/orders/${id}`,
  Product: (id) => `/admin/products/${id}`,
};

export default function AuditPage() {
  return (
    <Suspense>
      <Audit />
    </Suspense>
  );
}

function Audit() {
  const admin = useAdmin();
  const [url, setUrl] = useUrlState({ action: '', q: '', from: '', to: '', page: '1' });
  const [search, setSearch] = useState(url.q);
  const debounced = useDebounced(search);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (debounced !== url.q) setUrl({ q: debounced, page: '1' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const params = new URLSearchParams({ page: url.page, limit: String(LIMIT) });
  if (url.action) params.set('action', url.action);
  if (url.q) params.set('q', url.q);
  if (url.from) params.set('from', new Date(`${url.from}T00:00:00`).toISOString());
  if (url.to) params.set('to', new Date(`${url.to}T23:59:59.999`).toISOString());
  const canView = admin.role !== 'staff';
  const { data, error, loading } = useAdminQuery<AuditResponse>(canView ? `/audit?${params}` : null);

  if (!canView) {
    return (
      <Card>
        <EmptyState icon={ScrollText} title="The audit log is for owners and admins" />
      </Card>
    );
  }

  // Action filter options: each group ("order.") and each exact action.
  const groups = [...new Set((data?.actions ?? []).map((a) => `${a.split('.')[0]}.`))];
  const exportParams = new URLSearchParams(params);
  exportParams.delete('page');
  exportParams.delete('limit');
  const filtered = !!(url.action || url.q || url.from || url.to);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Filter by person’s email" className="w-full sm:w-64" />
          <select aria-label="Action" className={SELECT_CLASS} value={url.action} onChange={(e) => setUrl({ action: e.target.value, page: '1' })}>
            <option value="">All actions</option>
            {groups.map((g) => (
              <optgroup key={g} label={g.replace('.', '')}>
                <option value={g}>All {g.replace('.', '')} actions</option>
                {data?.actions
                  .filter((a) => a.startsWith(g))
                  .map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <Input type="date" aria-label="From" className="w-40" value={url.from} onChange={(e) => setUrl({ from: e.target.value, page: '1' })} />
          <Input type="date" aria-label="To" className="w-40" value={url.to} onChange={(e) => setUrl({ to: e.target.value, page: '1' })} />
          {filtered && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setUrl({ action: '', q: '', from: '', to: '', page: '1' }); }}>
              <X /> Clear
            </Button>
          )}
        </div>
        <a href={`/api/admin/audit/export?${exportParams}`} className={buttonVariants({ variant: 'outline' })} download>
          <Download /> Export CSV
        </a>
      </div>

      <FormError message={error} />

      <Card className="gap-0 py-0">
        {!data ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : data.entries.length === 0 ? (
          <EmptyState icon={ScrollText} title="Nothing matches" />
        ) : (
          <div className={cn('overflow-x-auto transition-opacity', loading && 'opacity-50')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 pl-6" />
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>On</TableHead>
                  <TableHead className="pr-6">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody key={params.toString()}>
                {data.entries.map((e) => {
                  const expanded = open === e._id;
                  const hasDetail = e.before !== undefined || e.after !== undefined || (e.meta && Object.keys(e.meta).length > 0);
                  return (
                    <Fragment key={e._id}>
                      <TableRow
                        className={cn(hasDetail && 'cursor-pointer')}
                        onClick={() => hasDetail && setOpen(expanded ? null : e._id)}
                        aria-expanded={hasDetail ? expanded : undefined}
                      >
                        <TableCell className="pl-6">
                          {hasDetail && <ChevronRight className={cn('size-4 text-muted-foreground transition-transform', expanded && 'rotate-90')} />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(e.createdAt)}</TableCell>
                        <TableCell className="max-w-56 truncate">{e.actorEmail ?? <span className="text-muted-foreground">System / CLI</span>}</TableCell>
                        <TableCell>
                          <Badge variant={/failed|locked|delete|disable/.test(e.action) ? 'destructive' : 'secondary'} className="font-mono text-[11px]">
                            {e.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {e.entity && e.entityId && ENTITY_LINK[e.entity] ? (
                            <Link href={ENTITY_LINK[e.entity]!(e.entityId)} onClick={(ev) => ev.stopPropagation()} className="hover:underline">
                              {e.entity} …{e.entityId.slice(-6)}
                            </Link>
                          ) : (
                            (e.entity ?? '—')
                          )}
                        </TableCell>
                        <TableCell className="pr-6 font-mono text-xs text-muted-foreground">{e.ip ?? '—'}</TableCell>
                      </TableRow>
                      <AnimatePresence initial={false}>
                        {expanded && (
                          <tr>
                            <td colSpan={6} className="p-0">
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }} className="overflow-hidden">
                                <Diff entry={e} />
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} limit={LIMIT} noun="entries" onPage={(p) => setUrl({ page: String(p) })} />}
      </Card>
    </div>
  );
}

const show = (v: unknown) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v));

/** Changed fields side by side; anything else as JSON. */
function Diff({ entry }: { entry: AuditEntry }) {
  const before = (entry.before ?? {}) as Record<string, unknown>;
  const after = (entry.after ?? {}) as Record<string, unknown>;
  const isObj = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);
  const keys =
    isObj(entry.before) || isObj(entry.after)
      ? [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
          (k) => !['_id', '__v', 'createdAt', 'updatedAt'].includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k])
        )
      : [];

  return (
    <div className="flex flex-col gap-3 border-b bg-muted/40 px-6 py-4 text-sm">
      {keys.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="w-40 pb-1 font-medium">Field</th>
              <th className="pb-1 font-medium">Before</th>
              <th className="pb-1 font-medium">After</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k} className="align-top">
                <td className="py-1 font-mono">{k}</td>
                <td className="py-1 pr-3 font-mono break-all text-delta-bad">{show(before[k])}</td>
                <td className="py-1 font-mono break-all text-delta-good">{show(after[k])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {entry.meta && Object.keys(entry.meta).length > 0 && (
        <pre className="overflow-x-auto rounded-md bg-background p-3 font-mono text-xs">{JSON.stringify(entry.meta, null, 2)}</pre>
      )}
      {keys.length === 0 && !entry.meta && <p className="text-muted-foreground">No field-level changes recorded.</p>}
      {entry.entityId && <p className="text-xs text-muted-foreground">Entity id: {entry.entityId}</p>}
    </div>
  );
}
