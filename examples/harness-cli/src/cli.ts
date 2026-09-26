import { runCli } from '@tanstack/ai-harness-cli'
import { composePersistence, memoryPersistence } from '@tanstack/ai-persistence'
import { fileCredentials } from './credentials'
import { assistant } from './harness'

// Everything in memory, except sign-ins, which are kept in a file.
const persistence = composePersistence(memoryPersistence(), {
  overrides: { credentials: fileCredentials() },
})

process.exitCode = await runCli(assistant, { persistence })
