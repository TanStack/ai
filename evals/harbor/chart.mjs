// Render the findings as PNG bar charts. Headless Chromium (Playwright, already
// in the repo) draws an HTML chart and screenshots it -- no new deps, real color
// and fonts (ImageMagick's SVG path mangles both here).
//
//   node chart.mjs            # writes results/charts/*.png from results/*.jsonl
//
// Charts:
//   A terminal-bench input tokens per arm (the Strands-regime replication)
//   B optimize() effect vs baseline across three workloads (the honest story)
//   C code mode vs tool-calls input (code mode is the big lever)

import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PW = path.join(HERE, '..', '..', 'node_modules', '.pnpm', 'playwright-core@1.57.0', 'node_modules', 'playwright-core', 'index.js')

function avgByArm(file) {
  const rows = readFileSync(path.join(HERE, file), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const by = {}
  for (const r of rows) (by[r.arm] ??= []).push(r)
  const out = {}
  for (const [arm, g] of Object.entries(by)) {
    out[arm] = {
      input: Math.round(g.reduce((s, r) => s + (r.tokens?.input ?? 0), 0) / g.length),
      solved: g.filter((r) => r.outcome === 'solved').length,
      trials: g.length,
    }
  }
  return out
}

// --- HTML chart template (horizontal bars) ---------------------------------
function barChartHTML(title, subtitle, rows, { unit = 'input tokens / task', max } = {}) {
  const top = max ?? Math.max(...rows.map((r) => Math.abs(r.value)))
  const bars = rows
    .map((r) => {
      const w = Math.max(0.4, (Math.abs(r.value) / top) * 100)
      const label = r.value >= 1000 ? `${(r.value / 1000).toFixed(0)}k` : `${r.value}`
      return `
      <div class="row">
        <div class="name">${r.label}</div>
        <div class="track"><div class="bar" style="width:${w}%;background:${r.color}"></div>
          <div class="val">${label}${r.note ? ` <span class="note">${r.note}</span>` : ''}</div>
        </div>
      </div>`
    })
    .join('')
  return `<!doctype html><meta charset="utf8">
  <style>
    body{margin:0;font:14px -apple-system,Helvetica,Arial,sans-serif;color:#0f172a;background:#fff}
    .card{width:760px;padding:28px 32px}
    h1{font-size:19px;margin:0 0 2px}
    .sub{color:#64748b;font-size:13px;margin:0 0 20px}
    .row{display:flex;align-items:center;margin:9px 0}
    .name{width:150px;font-weight:600;font-size:13px;text-align:right;padding-right:14px;color:#334155}
    .track{position:relative;flex:1;display:flex;align-items:center}
    .bar{height:26px;border-radius:5px}
    .val{margin-left:10px;font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
    .note{color:#64748b;font-weight:500;font-size:12px}
    .unit{color:#94a3b8;font-size:12px;margin-top:16px}
  </style>
  <div class="card"><h1>${title}</h1><p class="sub">${subtitle}</p>${bars}
  <div class="unit">${unit} · gemini-3.8-flash</div></div>`
}

async function render(browser, html, outPath) {
  const pg = await browser.newPage({ viewport: { width: 760, height: 10 }, deviceScaleFactor: 2 })
  await pg.setContent(html, { waitUntil: 'networkidle' })
  const el = await pg.$('.card')
  await el.screenshot({ path: outPath })
  await pg.close()
}

const BLUE = '#2563eb', GRAY = '#94a3b8', GREEN = '#16a34a', RED = '#dc2626', AMBER = '#d97706'

async function main() {
  const outDir = path.join(HERE, 'results', 'charts')
  mkdirSync(outDir, { recursive: true })

  const tb = avgByArm('results/terminal-bench.jsonl')
  const mw = avgByArm('results/multi-write.jsonl')
  const cm = avgByArm('results/code-mode.jsonl')

  const pw = (await import(PW)).default
  const browser = await pw.chromium.launch()

  // A. terminal-bench per-arm input (the replication)
  await render(browser, barChartHTML(
    'Disposable shell logs: size-based truncation replicates the Strands win',
    'Terminal-bench-style suite. Answer is a summary line in the tail, so clipping is nearly free.',
    [
      { label: 'baseline', value: tb.baseline.input, color: GRAY },
      { label: 'global (Strands)', value: tb.global.input, color: BLUE },
      { label: 'universal', value: tb.universal.input, color: BLUE },
      { label: 'adorned', value: tb.adorned.input, color: GREEN },
    ],
  ), path.join(outDir, 'terminal-bench.png'))

  // B. the honest story: optimize effect flips sign with the workload
  const pct = (base, opt) => Math.round(((opt - base) / base) * 100)
  const tbPct = pct(tb.baseline.input, tb.adorned.input)
  const cmPct = pct(cm['cm-baseline'].input, cm['cm-adorned'].input)
  const mwPct = pct(mw.baseline.input, mw.adorned.input)
  await render(browser, barChartHTML(
    'optimize() helps or hurts depending on the workload',
    'Change in input tokens vs baseline, best adornment per regime. Negative = cheaper. The sign flips.',
    [
      { label: 'shell logs (disposable)', value: tbPct, color: GREEN, note: '← huge win' },
      { label: 'code-mode logs', value: cmPct, color: GREEN, note: '← huge win' },
      { label: 'file edits (load-bearing)', value: mwPct, color: RED, note: '← backfires' },
    ],
    { unit: '% change in input tokens vs baseline', max: Math.max(100, Math.abs(tbPct), Math.abs(cmPct), Math.abs(mwPct)) },
  ), path.join(outDir, 'effect-by-workload.png'))

  // C. code mode vs tool calls on the same multi-file edit
  await render(browser, barChartHTML(
    'Code mode is the bigger lever than truncation',
    'Same multi-file edit. Code mode keeps file contents in the sandbox, out of the model context.',
    [
      { label: 'tool-calls baseline', value: mw.baseline.input, color: GRAY },
      { label: 'tool-calls adorned', value: mw.adorned.input, color: RED, note: '← truncation backfired' },
      { label: 'code mode', value: mw['cm-baseline'].input, color: GREEN, note: '← ~10x cheaper' },
    ],
  ), path.join(outDir, 'code-mode-vs-tools.png'))

  await browser.close()
  console.log('wrote', outDir)
}

main().catch((e) => { console.error(e); process.exit(1) })
