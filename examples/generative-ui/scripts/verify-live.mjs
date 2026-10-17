// Verifies the live data-source transport: GET /api/live?source=spendFeed opens
// an SSE stream that emits distinct values over time (the feed the client pushes
// into a mounted frame for real-time views). Run while `pnpm dev` is up:
//   node scripts/verify-live.mjs
const BASE = process.env.APP_URL || 'http://localhost:3000'
const SOURCE = process.env.LIVE_SOURCE || 'spendFeed'
const WANT = Number(process.env.LIVE_COUNT || 3)

function ok(label, cond) {
  console.log(`${cond ? '✓' : '✗'} ${label}`)
  if (!cond) process.exitCode = 1
}

const url = `${BASE}/api/live?source=${encodeURIComponent(SOURCE)}&params=${encodeURIComponent(JSON.stringify({ intervalMs: 400 }))}`
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 8000)

const events = []
try {
  const res = await fetch(url, { headers: { accept: 'text/event-stream' }, signal: controller.signal })
  ok('GET /api/live responds 200 text/event-stream', res.ok && (res.headers.get('content-type') || '').includes('text/event-stream'))

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (events.length < WANT) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const line = chunk.split('\n').find((l) => l.startsWith('data:'))
      if (line) {
        try { events.push(JSON.parse(line.slice(5).trim())) } catch { /* skip */ }
      }
    }
  }
  try { await reader.cancel() } catch { /* ignore */ }
} catch (err) {
  if (err?.name !== 'AbortError') throw err
} finally {
  clearTimeout(timeout)
  controller.abort()
}

ok(`received ${events.length} live emissions (wanted ${WANT})`, events.length >= WANT)
ok('each emission carries a running total', events.every((e) => typeof e?.total === 'number'))
const totals = events.map((e) => e?.total)
ok(`total changes over time (${totals.join(' → ')})`, new Set(totals).size > 1)
ok('each emission lists recent transactions', events.every((e) => Array.isArray(e?.recent)))

console.log(process.exitCode ? '\nFAIL' : '\nPASS — live data streams into the host for real-time views')
