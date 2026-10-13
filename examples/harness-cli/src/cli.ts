import { runCli } from '@tanstack/ai-harness-cli'
import { assistant } from './harness'
import { runTui } from './tui'

// A terminal shows the Ink screen of ./tui. Piped input uses line mode, and
// `-p "prompt"` and `--serve` work as in every runCli app.
process.exitCode = await runCli(assistant, { ui: runTui })
