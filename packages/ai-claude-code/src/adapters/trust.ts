import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

/** Claude stores project keys with forward slashes, even on Windows. */
export function claudeProjectKey(cwd: string): string {
  return path.resolve(cwd).replace(/\\/g, '/')
}

export function withTrustDialogAccepted(
  config: Record<string, unknown>,
  cwd: string,
): Record<string, unknown> {
  const key = claudeProjectKey(cwd)
  const projectsRaw = config.projects
  const projects =
    projectsRaw !== null &&
    typeof projectsRaw === 'object' &&
    !Array.isArray(projectsRaw)
      ? { ...(projectsRaw as Record<string, unknown>) }
      : {}
  const existingRaw = projects[key]
  const existing =
    existingRaw !== null &&
    typeof existingRaw === 'object' &&
    !Array.isArray(existingRaw)
      ? { ...(existingRaw as Record<string, unknown>) }
      : {}
  projects[key] = { ...existing, hasTrustDialogAccepted: true }
  return { ...config, projects }
}

/**
 * Mark a host cwd as trusted in `~/.claude.json` so headless `-p` can use
 * the repo's `.claude/settings.json`. Skip virtual sandbox roots.
 */
export async function acceptClaudeTrustDialog(cwd: string): Promise<void> {
  if (cwd === '' || cwd === '/workspace' || cwd.startsWith('/workspace/')) {
    return
  }
  const file = path.join(os.homedir(), '.claude.json')
  let current: Record<string, unknown> = {}
  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      current = parsed as Record<string, unknown>
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return
  }
  await fs.writeFile(
    file,
    `${JSON.stringify(withTrustDialogAccepted(current, cwd), null, 2)}\n`,
    'utf8',
  )
}
