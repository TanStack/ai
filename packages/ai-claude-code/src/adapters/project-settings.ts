import type { SandboxFs } from '@tanstack/ai-sandbox'

const SETTING_FILES = ['settings.json', 'settings.local.json'] as const
const DISABLED_SUFFIX = '.tanstack-disabled'

/**
 * Move project Claude settings aside so headless `-p` does not refuse the
 * workspace. A cloned repo (for example TanStack/ai) often ships
 * `.claude/settings.json` with `permissions.allow`. Claude then prints a
 * trust warning and ignores those rules unless the host has accepted the
 * trust dialog for that cwd.
 */
export async function disableClaudeProjectSettings(
  fs: Pick<SandboxFs, 'exists' | 'rename'>,
  cwd: string,
): Promise<Array<string>> {
  const disabled: Array<string> = []
  for (const name of SETTING_FILES) {
    const from = `${cwd}/.claude/${name}`
    if (!(await fs.exists(from))) continue
    await fs.rename(from, `${from}${DISABLED_SUFFIX}`)
    disabled.push(from)
  }
  return disabled
}
