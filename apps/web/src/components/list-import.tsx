'use client';

import { useState, type ChangeEvent } from 'react';
import { errorMessage } from '@/lib/use-resource';
import { fileKind, parsePasted, parseVcf, rowsToContacts, type ImportPreview } from '@/lib/import-contacts';
import { Button, ErrorAlert, Field, SelectField } from '@/components/ui';
import { t } from '@/i18n';

export interface AddResult { added: number; alreadyIn: number; created: number; invalid: string[]; invalidCount: number }
type Body = { contacts?: { phone: string; name?: string }[]; fromAll?: boolean; recentDays?: number; fromListId?: string };
type Mode = 'file' | 'paste' | 'segment';

const MAX_FILE = 5 * 1024 * 1024;
const MAX_CONTACTS = 5000;
const CHUNK = 200; // keeps each request short (serverless time limit)

const sum = (a: AddResult, b: AddResult): AddResult => ({
  added: a.added + b.added, alreadyIn: a.alreadyIn + b.alreadyIn, created: a.created + b.created,
  invalid: [...a.invalid, ...b.invalid].slice(0, 20), invalidCount: a.invalidCount + b.invalidCount,
});

/** Three ways to fill a list: a file (CSV / Excel / vCard), pasted text, or existing customers. */
export function ListImport({ currentListId, otherLists, post, onFinished }: {
  currentListId: string;
  otherLists: { id: string; name: string }[];
  post: (body: Body) => Promise<AddResult>;
  onFinished: (total: AddResult) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>('file');
  const [cc, setCc] = useState('509');
  const [raw, setRaw] = useState<{ kind: 'rows'; rows: unknown[][] } | { kind: 'text'; text: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [segment, setSegment] = useState('all');
  const busy = progress !== null;

  function build(src: typeof raw, code: string): ImportPreview | null {
    if (!src) return null;
    return src.kind === 'rows' ? rowsToContacts(src.rows, code) : parsePasted(src.text, code);
  }
  function load(src: typeof raw) { setRaw(src); setPreview(build(src, cc)); setErr(null); }
  function changeCc(v: string) { setCc(v); setPreview(build(raw, v)); }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr(null); setPreview(null); setRaw(null);
    if (file.size > MAX_FILE) { setErr(t('lists.fileTooBig')); return; }
    try {
      const kind = fileKind(file.name);
      if (kind === 'xlsx') {
        // The "universal" build parses on the main thread: the browser build spawns a blob Web Worker, which our CSP blocks.
        const { default: readXlsx } = await import('read-excel-file/universal');
        const sheets = await readXlsx(file); // [{ sheet, data }]: use the first sheet that has rows
        load({ kind: 'rows', rows: (sheets.find((s) => s.data.length)?.data ?? []) as unknown[][] });
      } else if (kind === 'vcf') load({ kind: 'rows', rows: parseVcf(await file.text()) });
      else load({ kind: 'text', text: await file.text() });
    } catch { setErr(t('lists.fileError')); }
  }

  async function run(chunks: Body[], count: number) {
    let total: AddResult = { added: 0, alreadyIn: 0, created: 0, invalid: [], invalidCount: 0 };
    setErr(null); setProgress({ done: 0, total: count });
    try {
      let done = 0;
      for (const body of chunks) {
        total = sum(total, await post(body));
        done += body.contacts?.length ?? count;
        setProgress({ done: Math.min(done, count), total: count });
      }
      setPreview(null); setRaw(null);
      await onFinished(total);
    } catch (e) { setErr(errorMessage(e)); }
    setProgress(null);
  }

  function importContacts() {
    if (!preview?.contacts.length) return;
    if (preview.contacts.length > MAX_CONTACTS) { setErr(t('lists.tooMany')); return; }
    const chunks: Body[] = [];
    for (let i = 0; i < preview.contacts.length; i += CHUNK) chunks.push({ contacts: preview.contacts.slice(i, i + CHUNK) });
    void run(chunks, preview.contacts.length);
  }

  function importSegment() {
    const body: Body = segment === 'all' ? { fromAll: true } : segment === 'recent' ? { recentDays: 30 } : { fromListId: segment };
    void run([body], 1);
  }

  const tab = (m: Mode, label: string) => (
    <button type="button" onClick={() => { setMode(m); setErr(null); }} disabled={busy}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${mode === m ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>
  );

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">{t('lists.import')}</h2>
      <div className="mt-3 flex flex-wrap gap-2" role="tablist">
        {tab('file', t('lists.modeFile'))}{tab('paste', t('lists.modePaste'))}{tab('segment', t('lists.modeSegment'))}
      </div>

      {mode !== 'segment' && (
        <div className="mt-4 space-y-3">
          {mode === 'file' ? (
            <div>
              <input type="file" accept=".csv,.tsv,.txt,.xlsx,.vcf,text/csv,text/plain,text/vcard" onChange={onFile} disabled={busy}
                aria-label={t('lists.modeFile')} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium" />
              <p className="mt-2 text-xs text-slate-500">{t('lists.fileHelp')} {t('lists.fileColumns')}</p>
            </div>
          ) : (
            <div>
              <textarea rows={5} disabled={busy} placeholder={'+50937001234, Jean\n+50938005678, Marie'} aria-label={t('lists.modePaste')}
                onChange={(e) => (e.target.value.trim() ? load({ kind: 'text', text: e.target.value }) : (setRaw(null), setPreview(null)))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <p className="mt-1 text-xs text-slate-500">{t('lists.pasteHint')}</p>
            </div>
          )}
          <Field id="cc" label={t('lists.countryCode')} hint={t('lists.countryCodeHint')} value={cc} inputMode="numeric" maxLength={5} disabled={busy}
            onChange={(e) => changeCc(e.target.value.replace(/[^\d+]/g, ''))} />

          {preview && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium">{t('lists.previewTitle')}</p>
              <p className="mt-1 text-slate-600">{t('lists.previewSummary', { valid: String(preview.contacts.length), total: String(preview.total), dups: String(preview.duplicates), invalid: String(preview.invalid.length) })}</p>
              {preview.contacts.length === 0 && <p className="mt-1 text-amber-700">{t('lists.previewNone')}</p>}
              <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                {preview.contacts.slice(0, 5).map((c) => <li key={c.phone}>{c.phone}{c.name ? ` · ${c.name}` : ''}</li>)}
              </ul>
              {preview.invalid.length > 0 && <p className="mt-2 text-xs text-amber-700">{t('lists.previewInvalid', { list: preview.invalid.slice(0, 8).join(', ') })}</p>}
              <Button type="button" className="mt-3" disabled={busy || preview.contacts.length === 0} onClick={importContacts}>
                {progress ? t('lists.importing', { done: String(progress.done), total: String(progress.total) }) : t('lists.importNow', { count: String(preview.contacts.length) })}
              </Button>
            </div>
          )}
        </div>
      )}

      {mode === 'segment' && (
        <div className="mt-4 space-y-3">
          <SelectField id="segment" label={t('lists.modeSegment')} value={segment} onChange={(e) => setSegment(e.target.value)} disabled={busy}>
            <option value="all">{t('lists.segAll')}</option>
            <option value="recent">{t('lists.segRecent', { days: '30' })}</option>
            {otherLists.filter((l) => l.id !== currentListId).map((l) => <option key={l.id} value={l.id}>{t('lists.segList', { name: l.name })}</option>)}
          </SelectField>
          <Button type="button" disabled={busy} onClick={importSegment}>{t('lists.segAdd')}</Button>
        </div>
      )}
      <div className="mt-3"><ErrorAlert message={err} /></div>
    </div>
  );
}
