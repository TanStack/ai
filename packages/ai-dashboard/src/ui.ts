// The dashboard web app: one static page, no build step. It renders every
// value with textContent, never as HTML, so session content cannot inject
// markup.

export const MANIFEST_JSON = JSON.stringify({
  name: 'TanStack AI Dashboard',
  short_name: 'Harness',
  start_url: '/',
  display: 'standalone',
  background_color: '#0b0d12',
  theme_color: '#0b0d12',
  icons: [],
})

// Caches the app shell only. API calls always go to the network.
export const SERVICE_WORKER = `
const SHELL = ['/', '/manifest.webmanifest']
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open('harness-shell-v1').then((cache) => cache.addAll(SHELL)))
})
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.pathname.startsWith('/api/')) return
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
})
`

const SCRIPT = `
const $ = (tag, props = {}, ...children) => {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (key === 'onclick' || key === 'onsubmit') node[key] = value
    else if (key === 'class') node.className = value
    else node.setAttribute(key, value)
  }
  for (const child of children) node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  return node
}
const fromHash = new URLSearchParams(location.hash.slice(1)).get('token')
if (fromHash) { localStorage.setItem('harness-token', fromHash); history.replaceState(null, '', '/') }
let token = localStorage.getItem('harness-token')
let current = null
let source = null

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...(options.headers || {}) },
  })
  if (response.status === 401) { localStorage.removeItem('harness-token'); token = null; render(); throw new Error('unauthorized') }
  return response.json()
}

function login() {
  const input = $('input', { type: 'password', placeholder: 'Owner token', autocomplete: 'off' })
  return $('form', { class: 'card', onsubmit: (event) => {
    event.preventDefault(); token = input.value.trim(); localStorage.setItem('harness-token', token); render()
  } }, $('h2', {}, 'Sign in'), input, $('button', {}, 'Sign in'))
}

async function refresh() {
  if (!token) return
  const [pairings, hosts, sessions] = await Promise.all([api('/api/pairings'), api('/api/hosts'), api('/api/sessions')])
  const side = document.getElementById('side')
  side.replaceChildren(
    $('h3', {}, 'Pairing requests'),
    ...(pairings.length ? pairings.map((pairing) => $('div', { class: 'row' },
      $('span', {}, pairing.name + ' ', $('code', {}, pairing.code)),
      $('button', { onclick: async () => { await api('/api/pair/approve', { method: 'POST', body: JSON.stringify({ code: pairing.code }) }); refresh() } }, 'Approve'))) : [$('p', { class: 'muted' }, 'None')]),
    $('h3', {}, 'Hosts'),
    ...(hosts.length ? hosts.map((host) => $('div', { class: 'row' },
      $('span', { class: host.online ? 'dot on' : 'dot' }), $('span', {}, host.name + ' (' + host.harnesses.join(', ') + ')'))) : [$('p', { class: 'muted' }, 'No hosts yet')]),
    $('h3', {}, 'Sessions'),
    ...(sessions.length ? sessions.map((session) => $('button', { class: 'session ' + session.status, onclick: () => open(session) },
      session.threadId + ' | ' + (session.harness || '') + ' | ' + session.status)) : [$('p', { class: 'muted' }, 'No sessions yet')]),
  )
}

function open(session) {
  current = { ...session, messages: [], interrupts: [], questions: new Map(), running: false }
  if (source) source.close()
  const path = '/api/sessions/' + encodeURIComponent(session.hostId) + '/' + encodeURIComponent(session.threadId)
  current.path = path
  source = new EventSource(path + '/events?token=' + encodeURIComponent(token))
  source.onmessage = (message) => { apply(JSON.parse(message.data)); draw() }
  draw()
}

function apply(frame) {
  if (frame.type !== 'harness.event' || !current) return
  const event = frame.event
  if (event.subagentRunId) return
  if (event.type === 'TEXT_MESSAGE_CONTENT') {
    const last = current.messages[current.messages.length - 1]
    if (last && last.kind === 'assistant' && last.op === frame.operationId) last.text += event.delta
    else current.messages.push({ kind: 'assistant', op: frame.operationId, text: event.delta })
  } else if (event.type === 'TOOL_CALL_START') {
    current.messages.push({ kind: 'tool', text: 'tool ' + event.toolCallName })
  } else if (event.type === 'RUN_ERROR') {
    current.messages.push({ kind: 'error', text: event.message })
  } else if (event.type === 'RUN_FINISHED' && event.outcome && event.outcome.type === 'interrupt') {
    current.interrupts = event.outcome.interrupts
  } else if (event.type === 'CUSTOM') {
    if (event.name === 'harness.operation.started') current.running = true
    if (event.name === 'harness.operation.finished') current.running = false
    if (event.name === 'harness.question') current.questions.set(event.value.questionId, event.value)
    if (event.name === 'harness.question.answered') current.questions.delete(event.value.questionId)
    if (event.name === 'harness.auth_required') current.messages.push({ kind: 'notice', text: 'Sign in to ' + event.value.connector + (event.value.url ? ': ' + event.value.url : '') })
  }
}

async function send(input) {
  if (input.op === 'prompt' || input.op === 'steer') current.messages.push({ kind: 'user', text: input.message })
  const receipt = await api(current.path + '/input', { method: 'POST', body: JSON.stringify({ input }) })
  if (receipt.status === 'queued') current.messages.push({ kind: 'notice', text: 'Queued: the host is offline.' })
  draw()
}

function draw() {
  const main = document.getElementById('main')
  if (!current) { main.replaceChildren($('p', { class: 'muted' }, 'Pick a session.')); return }
  const log = $('div', { class: 'log' }, ...current.messages.map((message) => $('div', { class: 'msg ' + message.kind }, message.text)))
  const actions = []
  if (current.interrupts.length) {
    const decide = (approved) => { const resume = current.interrupts.map((interrupt) => ({ interruptId: interrupt.id, status: 'resolved', payload: approved })); current.interrupts = []; send({ op: 'resolve', resume }) }
    actions.push($('div', { class: 'card' }, $('strong', {}, 'Waiting for approval: '), current.interrupts.map((interrupt) => interrupt.message || interrupt.toolCallId || interrupt.id).join(', '),
      $('div', { class: 'row' }, $('button', { onclick: () => decide(true) }, 'Approve'), $('button', { class: 'ghost', onclick: () => decide(false) }, 'Reject'))))
  }
  for (const question of current.questions.values()) {
    const answer = $('input', { placeholder: 'Your answer' })
    const isBoolean = question.schema && question.schema.type === 'boolean'
    actions.push($('div', { class: 'card' }, $('strong', {}, question.message),
      isBoolean
        ? $('div', { class: 'row' }, $('button', { onclick: () => send({ op: 'answer', questionId: question.questionId, value: true }) }, 'Yes'), $('button', { class: 'ghost', onclick: () => send({ op: 'answer', questionId: question.questionId, value: false }) }, 'No'))
        : $('form', { class: 'row', onsubmit: (event) => { event.preventDefault(); send({ op: 'answer', questionId: question.questionId, value: answer.value }) } }, answer, $('button', {}, 'Answer'))))
  }
  const box = $('input', { placeholder: current.running ? 'Steer the running turn' : 'Send a message' })
  const form = $('form', { class: 'row prompt', onsubmit: (event) => {
    event.preventDefault(); const text = box.value.trim(); if (!text) return; box.value = ''
    send({ op: current.running ? 'steer' : 'prompt', message: text })
  } }, box, $('button', {}, 'Send'), $('button', { type: 'button', class: 'ghost', onclick: () => send({ op: 'cancel' }) }, 'Stop'))
  main.replaceChildren($('h2', {}, current.threadId + (current.running ? ' (working)' : '')), log, ...actions, form)
  log.scrollTop = log.scrollHeight
}

function render() {
  const app = document.getElementById('app')
  if (!token) { app.replaceChildren(login()); return }
  app.replaceChildren($('aside', { id: 'side' }), $('main', { id: 'main' }))
  draw(); refresh().catch(() => {})
}
setInterval(() => refresh().catch(() => {}), 5000)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
render()
`

export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0b0d12">
<link rel="manifest" href="/manifest.webmanifest">
<title>TanStack AI Dashboard</title>
<style>
  :root { color-scheme: dark; --bg: #0b0d12; --panel: #141821; --line: #252b38; --text: #e6e9ef; --muted: #8b93a7; --accent: #6ea8fe; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.45 system-ui, sans-serif; background: var(--bg); color: var(--text); }
  #app { display: grid; grid-template-columns: 300px 1fr; min-height: 100vh; }
  aside { border-right: 1px solid var(--line); padding: 16px; overflow-y: auto; }
  main { padding: 16px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  h2, h3 { margin: 0 0 8px; } h3 { font-size: 13px; text-transform: uppercase; color: var(--muted); margin-top: 16px; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .muted { color: var(--muted); }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px; max-width: 420px; }
  input { flex: 1; min-width: 0; padding: 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--text); font: inherit; }
  button { padding: 9px 14px; border-radius: 8px; border: 0; background: var(--accent); color: #06121f; font: inherit; font-weight: 600; cursor: pointer; }
  button.ghost { background: transparent; color: var(--text); border: 1px solid var(--line); }
  button.session { display: block; width: 100%; text-align: left; background: var(--panel); color: var(--text); border: 1px solid var(--line); margin-bottom: 6px; font-weight: 400; }
  button.session.waiting { border-color: #f5b041; } button.session.running { border-color: var(--accent); }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #555; display: inline-block; } .dot.on { background: #3ecf8e; }
  .log { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; min-height: 200px; max-height: 65vh; }
  .msg { white-space: pre-wrap; padding: 10px 12px; border-radius: 10px; background: var(--panel); max-width: 80ch; }
  .msg.user { align-self: flex-end; background: #1d3557; } .msg.tool, .msg.notice { color: var(--muted); background: transparent; padding: 2px 12px; }
  .msg.error { border: 1px solid #e5484d; }
  code { background: var(--panel); padding: 2px 6px; border-radius: 6px; }
  @media (max-width: 720px) { #app { grid-template-columns: 1fr; } aside { border-right: 0; border-bottom: 1px solid var(--line); } }
</style>
</head>
<body>
<div id="app"></div>
<script>${SCRIPT}</script>
</body>
</html>`
