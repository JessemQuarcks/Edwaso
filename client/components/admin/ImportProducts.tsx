'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload } from 'lucide-react';
import { ApiError, errorMessage } from '@/lib/api';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormError from './FormError';
import type { ImportSummary } from '@/types/admin';

/** Upload a CSV, preview what it will change (dry run), then apply. */
export default function ImportProducts({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setFile(null);
    setSummary(null);
    setError('');
  }

  async function send(csv: File, dryRun: boolean): Promise<ImportSummary> {
    const body = new FormData();
    body.append('file', csv);
    const res = await fetch(`/api/admin/products/import${dryRun ? '?dryRun=1' : ''}`, { method: 'POST', body, credentials: 'same-origin' });
    const data = (await res.json().catch(() => ({}))) as ImportSummary & { message?: string };
    // 400 with row errors is a normal outcome of a check, not a failure.
    if (!res.ok && !Array.isArray(data.errors)) throw new ApiError(res.status, data.message ?? `Import failed (${res.status})`);
    return data;
  }

  async function check(selected: File) {
    setFile(selected);
    setSummary(null);
    setError('');
    setBusy(true);
    try {
      setSummary(await send(selected, true));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const result = await send(file, false);
      if (result.applied) {
        onImported();
        setOpen(false);
        reset();
      } else setSummary(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const ready = summary && summary.errors.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger className={buttonVariants({ variant: 'outline' })}>
        <Upload />
        Import
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import products from CSV</DialogTitle>
          <DialogDescription>
            Rows with a known SKU update that product; others create new ones (they need a name and price). Prices are in
            decimal, e.g. 49.99. Use <em>Export</em> for a template. Nothing changes until every row is valid.
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm transition-colors hover:bg-muted/50">
          <FileUp className="size-6 text-muted-foreground" />
          <span className="font-medium">{file ? file.name : 'Choose a CSV file'}</span>
          <span className="text-xs text-muted-foreground">Up to 1,000 rows, 2 MB</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void check(f);
              e.target.value = '';
            }}
          />
        </label>

        {busy && !summary && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking the file…
          </p>
        )}

        {summary && (
          <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              {ready ? <CheckCircle2 className="size-4 text-delta-good" /> : <AlertTriangle className="size-4 text-delta-bad" />}
              {summary.rows} rows: {summary.create} new, {summary.update} updated
              {summary.errors.length > 0 && `, ${summary.errors.length} with problems`}
            </p>
            {summary.errors.length > 0 && (
              <ul className="max-h-40 overflow-y-auto text-xs">
                {summary.errors.map((e) => (
                  <li key={e.row}>
                    <span className="font-medium">Row {e.row}:</span> {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <FormError message={error} />

        <DialogFooter>
          <Button onClick={() => void apply()} disabled={!ready || busy}>
            {busy && summary ? <Loader2 className="animate-spin" /> : <Upload />}
            Import {summary ? summary.create + summary.update : ''} products
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
