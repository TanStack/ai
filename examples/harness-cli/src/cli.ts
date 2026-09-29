import { runCli } from '@tanstack/ai-harness-cli'
import { assistant } from './harness'
import { persistence } from './store'
import { runTui } from './tui'

// A terminal shows the Ink screen from ./tui. Piped input uses line mode.
process.exitCode = await runCli(assistant, { persistence, ui: runTui })
