/** Shared entry-point plumbing: token resolution and step-summary output. */

import { execFile } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function resolveToken(): Promise<string> {
  const fromEnv = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  if (fromEnv) return fromEnv
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'])
    const token = stdout.trim()
    if (token) return token
  } catch {
    // fall through to the error below
  }
  throw new Error(
    'No GitHub token: set GITHUB_TOKEN, or authenticate the gh CLI (`gh auth login`).',
  )
}

export function isDryRun(): boolean {
  return (
    process.argv.includes('--dry-run') ||
    ['1', 'true'].includes((process.env.DRY_RUN ?? '').toLowerCase())
  )
}

/** Append markdown to the GitHub Actions step summary when running in CI. */
export async function writeStepSummary(markdown: string): Promise<void> {
  const path = process.env.GITHUB_STEP_SUMMARY
  if (path) await appendFile(path, `${markdown}\n`)
}
