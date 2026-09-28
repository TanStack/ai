import { runCli } from '@tanstack/ai-harness-cli'
import { composePersistence, memoryPersistence } from '@tanstack/ai-persistence'
import { fileCredentials } from './credentials'
import { assistant } from './harness'
import { runTui } from './tui'

// Everything in memory, except sign-ins, which are kept in a file.
const persistence = composePersistence(memoryPersistence(), {
  overrides: { credentials: fileCredentials() },
})

// A terminal shows the Ink screen from ./tui. Piped input uses line mode.
process.exitCode = await runCli(assistant, { persistence, ui: runTui })
