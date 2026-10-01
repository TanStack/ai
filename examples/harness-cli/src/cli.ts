import './env'
import { runCli } from '@tanstack/ai-harness-cli'
import { assistant } from './harness'
import { hasSession, listSessions, newSessionId } from './sessions'
import { persistence } from './store'
import { runTui, takeNextSession } from './tui'

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

const first = await firstSession(process.argv.slice(2))
let threadId = first.threadId

// A terminal shows the Ink screen from ./tui. Piped input uses line mode.
// `/resume` closes the screen, and the loop opens the session it picked.
for (;;) {
  process.exitCode = await runCli(assistant, {
    persistence,
    ui: runTui,
    // The last `--thread` wins.
    argv: [...first.argv, '--thread', threadId],
  })
  const next = takeNextSession()
  if (next === undefined) break
  threadId = next
}
if (await hasSession(threadId)) {
  process.stderr.write(
    `Continue this session with: pnpm start --resume ${threadId}\n`,
  )
}
