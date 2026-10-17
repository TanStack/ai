/**
 * Tier F fixture artifacts (Draft 0.2 §8.2, §10.3). Known sources whose build
 * → render is snapshot- and interaction-tested without a model. The chord-card
 * and spend-monitor pair are the flagship cases (§13): exactly what Tier N
 * rendered worst (a domain figure) and adequately (a data monitor).
 *
 * These are *sources* (the model's output), not records; a store + builder turn
 * them into revisions via the §8.1 tools.
 */

import type { ArtifactKind } from './types'

export interface FrameFixture {
  id: string
  kind: ArtifactKind
  title: string
  fallbackText: string
  source: string
  /** Optional authoritative data (host-computed numbers, §7.3.4). */
  data?: unknown
  /** Optional live data-source binding (host streams values in real time). */
  dataSource?: { name: string; params?: Record<string, unknown> }
}

/* -------------------------------------------------------------------------- */
/* chord-card — html-fragment (the hand-tuned SVG domain figure, §7.1)        */
/* -------------------------------------------------------------------------- */

export const CHORD_CARD_FRAGMENT_SOURCE = /* html */ `
<style>
  .cc-wrap{padding:16px 18px;background:var(--ui-surface,#fff);border:1px solid var(--ui-border,#e5e7eb);border-radius:var(--ui-radius,14px);max-width:360px}
  .cc-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px}
  .cc-title{font-size:17px;font-weight:650;letter-spacing:-.01em}
  .cc-sub{font-size:12px;color:var(--ui-muted,#6b7280)}
  .cc-svg{display:block;margin:4px auto 10px}
  .cc-dot{cursor:pointer;transition:transform .08s ease}
  .cc-dot:hover{transform:scale(1.12);transform-origin:center}
  .cc-read{min-height:40px;padding:10px 12px;border-radius:10px;background:var(--ui-surface-2,#f8fafc);border:1px solid var(--ui-border,#eef2f7);font-size:13px;color:var(--ui-text,#111)}
  .cc-read b{font-weight:650}
  .cc-note{color:var(--ui-muted,#6b7280)}
  .cc-btn{margin-top:12px;width:100%;padding:9px 12px;border:0;border-radius:10px;background:var(--ui-accent,#2563eb);color:var(--ui-accent-text,#fff);font-size:13px;font-weight:600;cursor:pointer}
  .cc-btn:active{transform:translateY(1px)}
</style>
<div class="cc-wrap">
  <div class="cc-head">
    <div class="cc-title">Emaj7</div>
    <div class="cc-sub">open voicing · 0-2-1-1-0-0</div>
  </div>
  <svg class="cc-svg" width="240" height="250" viewBox="0 0 240 250" role="img" aria-label="Emaj7 chord diagram">
    <!-- fret grid -->
    <g stroke="var(--ui-border,#cbd5e1)" stroke-width="1.5">
      <line x1="30" y1="60" x2="210" y2="60"/>
      <line x1="30" y1="100" x2="210" y2="100"/>
      <line x1="30" y1="140" x2="210" y2="140"/>
      <line x1="30" y1="180" x2="210" y2="180"/>
      <line x1="30" y1="220" x2="210" y2="220"/>
    </g>
    <!-- nut -->
    <rect x="29" y="56" width="182" height="5" rx="2" fill="var(--ui-text,#111)"/>
    <!-- strings -->
    <g stroke="var(--ui-muted,#94a3b8)" stroke-width="1.5">
      <line x1="30"  y1="60" x2="30"  y2="220"/>
      <line x1="66"  y1="60" x2="66"  y2="220"/>
      <line x1="102" y1="60" x2="102" y2="220"/>
      <line x1="138" y1="60" x2="138" y2="220"/>
      <line x1="174" y1="60" x2="174" y2="220"/>
      <line x1="210" y1="60" x2="210" y2="220"/>
    </g>
    <!-- open/muted markers -->
    <circle cx="30"  cy="44" r="6" fill="none" stroke="var(--ui-text,#111)" stroke-width="1.6" class="cc-dot" data-string="0"/>
    <circle cx="174" cy="44" r="6" fill="none" stroke="var(--ui-text,#111)" stroke-width="1.6" class="cc-dot" data-string="4"/>
    <circle cx="210" cy="44" r="6" fill="none" stroke="var(--ui-text,#111)" stroke-width="1.6" class="cc-dot" data-string="5"/>
    <!-- fretted dots -->
    <g>
      <circle cx="66"  cy="120" r="11" fill="var(--ui-accent,#2563eb)" class="cc-dot" data-string="1"/>
      <text x="66"  y="124" text-anchor="middle" font-size="11" fill="var(--ui-accent-text,#fff)" pointer-events="none">2</text>
      <circle cx="102" cy="80"  r="11" fill="var(--ui-accent,#2563eb)" class="cc-dot" data-string="2"/>
      <text x="102" y="84"  text-anchor="middle" font-size="11" fill="var(--ui-accent-text,#fff)" pointer-events="none">1</text>
      <circle cx="138" cy="80"  r="11" fill="var(--ui-accent,#2563eb)" class="cc-dot" data-string="3"/>
      <text x="138" y="84"  text-anchor="middle" font-size="11" fill="var(--ui-accent-text,#fff)" pointer-events="none">1</text>
    </g>
    <!-- string note labels -->
    <g font-size="11" fill="var(--ui-muted,#6b7280)" text-anchor="middle">
      <text x="30"  y="238">E</text>
      <text x="66"  y="238">B</text>
      <text x="102" y="238">D#</text>
      <text x="138" y="238">G#</text>
      <text x="174" y="238">B</text>
      <text x="210" y="238">E</text>
    </g>
  </svg>
  <div class="cc-read" id="cc-read"><span class="cc-note">Tap a dot to inspect the note.</span></div>
  <button class="cc-btn" id="cc-save">Add to songbook</button>
</div>
<script>
(function () {
  var NOTES = ['E','B','D#','G#','B','E'];
  var ROLES = ['root','5th','maj7','3rd','5th','root'];
  var read = document.getElementById('cc-read');
  function render(sel) {
    if (sel == null || !NOTES[sel]) { read.innerHTML = '<span class="cc-note">Tap a dot to inspect the note.</span>'; return; }
    read.innerHTML = '<b>' + NOTES[sel] + '</b> — the <b>' + ROLES[sel] + '</b> of Emaj7 <span class="cc-note">(string ' + (6 - sel) + ')</span>';
  }
  var dots = document.querySelectorAll('.cc-dot');
  for (var i = 0; i < dots.length; i++) {
    dots[i].addEventListener('click', function () {
      var sel = parseInt(this.getAttribute('data-string'), 10);
      if (window.__ogui) window.__ogui.setState({ selected: sel });
      render(sel);
    });
  }
  if (window.__ogui) {
    window.__ogui.onState(function (s) { render(s && s.selected); });
    render((window.__ogui.getState() || {}).selected);
    document.getElementById('cc-save').addEventListener('click', function () {
      window.__ogui.emitIntent('addToSongbook', { chord: 'Emaj7', voicing: '0-2-1-1-0-0' }, { intentClass: 'action' });
    });
  }
})();
</script>
`.trim()

/* -------------------------------------------------------------------------- */
/* chord-card — react-tsx (same figure, component form, host UI)              */
/* -------------------------------------------------------------------------- */

export const CHORD_CARD_TSX_SOURCE = /* tsx */ `
import { useHostState, useIntent } from '@ogui/bridge';
import { Button, Card } from '@host/ui';

const NOTES = ['E', 'B', 'D#', 'G#', 'B', 'E'];
const ROLES = ['root', '5th', 'maj7', '3rd', '5th', 'root'];
const OPEN = [0, 4, 5];
const DOTS = [
  { s: 1, cx: 66, cy: 120, finger: '2' },
  { s: 2, cx: 102, cy: 80, finger: '1' },
  { s: 3, cx: 138, cy: 80, finger: '1' },
];
const STRINGS = [30, 66, 102, 138, 174, 210];

export default function ChordCard() {
  const [state, setState] = useHostState({ selected: null });
  const fire = useIntent();
  const sel = state.selected;
  return (
    <Card title="Emaj7" subtitle="open voicing · 0-2-1-1-0-0">
      <svg width="240" height="250" viewBox="0 0 240 250" style={{ display: 'block', margin: '4px auto 10px' }} role="img" aria-label="Emaj7 chord diagram">
        <g stroke="var(--ui-border,#cbd5e1)" strokeWidth={1.5}>
          {[60, 100, 140, 180, 220].map((y) => <line key={y} x1={30} y1={y} x2={210} y2={y} />)}
        </g>
        <rect x={29} y={56} width={182} height={5} rx={2} fill="var(--ui-text,#111)" />
        <g stroke="var(--ui-muted,#94a3b8)" strokeWidth={1.5}>
          {STRINGS.map((x) => <line key={x} x1={x} y1={60} x2={x} y2={220} />)}
        </g>
        {OPEN.map((s) => (
          <circle key={s} cx={STRINGS[s]} cy={44} r={6} fill="none" stroke="var(--ui-text,#111)" strokeWidth={1.6}
            style={{ cursor: 'pointer' }} onClick={() => setState({ selected: s })} />
        ))}
        {DOTS.map((d) => (
          <g key={d.s} style={{ cursor: 'pointer' }} onClick={() => setState({ selected: d.s })}>
            <circle cx={d.cx} cy={d.cy} r={11} fill="var(--ui-accent,#2563eb)" />
            <text x={d.cx} y={d.cy + 4} textAnchor="middle" fontSize={11} fill="var(--ui-accent-text,#fff)">{d.finger}</text>
          </g>
        ))}
        <g fontSize={11} fill="var(--ui-muted,#6b7280)" textAnchor="middle">
          {NOTES.map((n, i) => <text key={i} x={STRINGS[i]} y={238}>{n}</text>)}
        </g>
      </svg>
      <div style={{ minHeight: 40, padding: '10px 12px', borderRadius: 10, background: 'var(--ui-surface-2,#f8fafc)', border: '1px solid var(--ui-border,#eef2f7)', fontSize: 13 }}>
        {sel == null
          ? <span style={{ color: 'var(--ui-muted,#6b7280)' }}>Tap a dot to inspect the note.</span>
          : <span><b>{NOTES[sel]}</b> — the <b>{ROLES[sel]}</b> of Emaj7 <span style={{ color: 'var(--ui-muted,#6b7280)' }}>(string {6 - sel})</span></span>}
      </div>
      <Button style={{ marginTop: 12, width: '100%' }} onClick={() => fire('addToSongbook', { chord: 'Emaj7', voicing: '0-2-1-1-0-0' }, { intentClass: 'action' })}>
        Add to songbook
      </Button>
    </Card>
  );
}
`.trim()

/* -------------------------------------------------------------------------- */
/* spend-monitor — react-tsx (TanStack Table + Charts, host data)             */
/* -------------------------------------------------------------------------- */

export const SPEND_MONITOR_TSX_SOURCE = /* tsx */ `
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { Chart } from '@tanstack/react-charts';
import { useHostState, useIntent } from '@ogui/bridge';
import { Card, Button } from '@host/ui';

type Row = { category: string; spend: number; budget: number };

const columns = [
  { accessorKey: 'category', header: 'Category' },
  { accessorKey: 'spend', header: 'Spend', cell: (c: any) => '$' + c.getValue().toLocaleString() },
  { accessorKey: 'budget', header: 'Budget', cell: (c: any) => '$' + c.getValue().toLocaleString() },
  {
    id: 'pct', header: '% used',
    accessorFn: (r: Row) => Math.round((r.spend / r.budget) * 100),
    cell: (c: any) => {
      const v = c.getValue();
      return <span style={{ color: v >= 100 ? 'var(--ui-negative,#dc2626)' : v >= 85 ? 'var(--ui-accent,#2563eb)' : 'var(--ui-positive,#16a34a)' }}>{v}%</span>;
    },
  },
];

export default function SpendMonitor({ data }: { data: { rows: Row[]; total: number; currency?: string } }) {
  const rows = (data && data.rows) || [];
  const [state, setState] = useHostState({ sorting: [] as any[] });
  const fire = useIntent();
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting: state.sorting },
    onSortingChange: (updater) => setState({ sorting: typeof updater === 'function' ? updater(state.sorting) : updater }),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const series = [{ label: 'Spend', data: rows.map((r) => ({ primary: r.category, secondary: r.spend })) }];

  return (
    <Card title="Spend monitor" subtitle={'This cycle · total $' + ((data && data.total) || 0).toLocaleString()}>
      <div style={{ height: 160, margin: '4px 0 12px' }}>
        <Chart options={{ data: series, primaryAxis: { getValue: (d: any) => d.primary }, secondaryAxes: [{ getValue: (d: any) => d.secondary }] }} />
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} onClick={h.column.getToggleSortingHandler()}
                  style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--ui-border,#e5e7eb)', color: 'var(--ui-muted,#6b7280)', cursor: 'pointer', fontWeight: 600 }}>
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {{ asc: ' ↑', desc: ' ↓' }[h.column.getIsSorted() as string] ?? ''}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id}>
              {r.getVisibleCells().map((c) => (
                <td key={c.id} style={{ padding: '6px 8px', borderBottom: '1px solid var(--ui-surface-2,#f1f5f9)' }}>
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Button style={{ marginTop: 12 }} onClick={() => fire('exportReport', { rows }, { intentClass: 'action' })}>
        Export report
      </Button>
    </Card>
  );
}
`.trim()

export const SPEND_MONITOR_DATA = {
  currency: 'USD',
  total: 7420,
  rows: [
    { category: 'Compute', spend: 3120, budget: 3000 },
    { category: 'Storage', spend: 980, budget: 1500 },
    { category: 'Bandwidth', spend: 1460, budget: 1600 },
    { category: 'AI tokens', spend: 1860, budget: 2000 },
  ],
}

/* -------------------------------------------------------------------------- */
/* live-spend-monitor — react-tsx bound to a live data source                 */
/* -------------------------------------------------------------------------- */

/**
 * The flagship live case: a view bound to a host data source via `dataSource`.
 * It reads the streamed value with `useHostData()` — the SAME value the host
 * pushes over the bridge (`host.data` / MCP Apps `tool-result`) on every change
 * — so the total and transaction feed update in place, in real time, without
 * the artifact ever being regenerated. `props.data` seeds the first paint.
 */
export const LIVE_SPEND_MONITOR_TSX_SOURCE = /* tsx */ `
import { useHostData } from '@ogui/bridge';
import { Card } from '@host/ui';

type Txn = { id: string; label: string; amount: number };
type Feed = { total: number; recent: Txn[]; currency?: string };

export default function LiveSpendMonitor({ data }: { data?: Feed }) {
  const live = useHostData() as Feed | undefined;
  const feed = live || data || { total: 0, recent: [] };
  const total = feed.total || 0;
  const recent = feed.recent || [];
  return (
    <Card title="Live spend monitor" subtitle="streaming · updates in real time">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '2px 0 14px' }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em' }}>
          {'$' + Math.round(total).toLocaleString()}
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--ui-positive,#16a34a)' }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--ui-positive,#16a34a)', display: 'inline-block' }} />
          live
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {recent.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--ui-muted,#6b7280)' }}>Waiting for transactions…</div>
          : recent.map((t) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '7px 10px', borderRadius: 8, background: 'var(--ui-surface-2,#f8fafc)', border: '1px solid var(--ui-border,#eef2f7)' }}>
              <span>{t.label}</span>
              <span style={{ fontWeight: 600 }}>{'+$' + (t.amount || 0).toLocaleString()}</span>
            </div>
          ))}
      </div>
    </Card>
  );
}
`.trim()

/** First-paint seed for the live monitor; the feed takes over once connected. */
export const LIVE_SPEND_MONITOR_DATA = {
  currency: 'USD',
  total: 0,
  recent: [] as Array<{ id: string; label: string; amount: number }>,
}

/** All Tier F fixtures, keyed by id (parallel to Draft 0.1 CANONICAL_FIXTURES). */
export const FRAME_FIXTURES: Record<string, FrameFixture> = {
  'chord-card-fragment': {
    id: 'chord-card-fragment',
    kind: 'html-fragment',
    title: 'Emaj7 — open voicing',
    fallbackText: 'Emaj7 open voicing, fingered 0-2-1-1-0-0 (low to high): open E, B at 2nd fret, D# at 1st, G# at 1st, open B, open E.',
    source: CHORD_CARD_FRAGMENT_SOURCE,
  },
  'chord-card-tsx': {
    id: 'chord-card-tsx',
    kind: 'react-tsx',
    title: 'Emaj7 — open voicing',
    fallbackText: 'Emaj7 open voicing, fingered 0-2-1-1-0-0 (low to high): open E, B at 2nd fret, D# at 1st, G# at 1st, open B, open E.',
    source: CHORD_CARD_TSX_SOURCE,
  },
  'spend-monitor': {
    id: 'spend-monitor',
    kind: 'react-tsx',
    title: 'Spend monitor',
    fallbackText: 'Spend this cycle totals $7,420. Compute $3,120/$3,000 (104%, over), Storage $980/$1,500, Bandwidth $1,460/$1,600, AI tokens $1,860/$2,000.',
    source: SPEND_MONITOR_TSX_SOURCE,
    data: SPEND_MONITOR_DATA,
  },
  'live-spend-monitor': {
    id: 'live-spend-monitor',
    kind: 'react-tsx',
    title: 'Live spend monitor',
    fallbackText: 'A live spend monitor: a running total and a feed of recent transactions that update in real time as the host streams new data.',
    source: LIVE_SPEND_MONITOR_TSX_SOURCE,
    data: LIVE_SPEND_MONITOR_DATA,
    dataSource: { name: 'spendFeed' },
  },
}
