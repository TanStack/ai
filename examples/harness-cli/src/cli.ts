import { runCli } from '@tanstack/ai-harness-cli'
import { assistant } from './harness'

process.exitCode = await runCli(assistant)
