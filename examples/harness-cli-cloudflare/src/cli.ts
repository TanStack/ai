import './env'
import './workdir'
import { Writable } from 'node:stream'
import { createInterface } from 'node:readline/promises'
import { runCli } from '@tanstack/ai-harness-cli'
import { checkWorker } from './cloudflare-stores'
import { assistant } from './harness'
import { hasSession, listSessions, newSessionId } from './sessions'
import { workerPersistence } from './store'
import { runTui, takeNext } from './tui'
import { loadWorker, saveWorker, setCurrentWorker } from './worker-config'

/**
 * Ask for the Worker URL and secret until the Worker answers, then save
 * them. The secret does not show as you type.
 */
async function askWorker() {
  let muted = false
  const output = new Writable({
    write: (chunk, _encoding, done) => {
      if (!muted) process.stdout.write(chunk)
      done()
    },
  })
  const lines = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  })
  try {
    process.stdout.write('Connect your Worker (see the README to deploy it).\n')
    for (;;) {
      const url = (
        await lines.question(
          'Worker URL, for example https://tanstack-harness.you.workers.dev: ',
        )
      )
        .trim()
        .replace(/\/+$/, '')
      process.stdout.write('Worker secret (HARNESS_SECRET): ')
      muted = true
      const secret = (await lines.question('')).trim()
      muted = false
      process.stdout.write('\n')
      const worker = { url, secret }
      const problem = await checkWorker(worker)
      if (problem === undefined) {
        await saveWorker(worker)
        return worker
      }
      process.stdout.write(`${problem} Try again.\n`)
    }
  } finally {
    lines.close()
  }
}

/**
 * The session to open first: `--resume <id>`, `--resume` alone for the
 * newest saved session, `--thread <id>`, else a new session. The other
 * options go to runCli.
 */
async function firstSession(argv: Array<string>) {
  const at = argv.findIndex(
    (arg) => arg === '--resume' || arg.startsWith('--resume='),
  )
  if (at === -1) {
    const thread = argv.indexOf('--thread')
    const given = thread === -1 ? undefined : argv[thread + 1]
    return { argv, threadId: given ?? newSessionId() }
  }
  const [flag = ''] = argv.splice(at, 1)
  const next = argv[at]
  const id = flag.startsWith('--resume=')
    ? flag.slice('--resume='.length)
    : next !== undefined && !next.startsWith('-')
      ? argv.splice(at, 1)[0]
      : (await listSessions(1))[0]?.id
  if (id === undefined || !(await hasSession(id))) {
    process.stderr.write(
      id === undefined
        ? 'No saved session yet.\n'
        : `No saved session ${id}.\n`,
    )
    process.exit(1)
  }
  return { argv, threadId: id }
}

// The first start asks for the Worker. Piped input cannot answer, so it
// needs a start in a terminal first.
const saved = await loadWorker()
if (!saved && !process.stdin.isTTY) {
  process.stderr.write('No Worker yet. Run pnpm start in a terminal first.\n')
  process.exit(1)
}
setCurrentWorker(saved ?? (await askWorker()))

const first = await firstSession(process.argv.slice(2))
let threadId = first.threadId

// A terminal shows the Ink screen from ./tui. Piped input uses line mode.
// `/resume` closes the screen, and the loop opens the session it picked.
// `/connect worker` closes it too, asks for the new Worker, and opens the
// session again, in the new Worker.
for (;;) {
  process.exitCode = await runCli(assistant, {
    persistence: workerPersistence(),
    ui: runTui,
    // The last `--thread` wins.
    argv: [...first.argv, '--thread', threadId],
  })
  const next = takeNext()
  if (next === undefined) break
  if (next.askWorker) setCurrentWorker(await askWorker())
  threadId = next.threadId
}
if (await hasSession(threadId)) {
  process.stderr.write(
    `Continue this session here or on another PC with: pnpm start --resume ${threadId}\n`,
  )
}
