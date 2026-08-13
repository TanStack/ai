import type { SandboxHandle } from '@tanstack/ai-sandbox'

/** Prefer the path the official installer writes; fall back to PATH. */
const GROK_PROBE =
  'sh -lc \'if test -x "$HOME/.grok/bin/grok"; then printf "%s" "$HOME/.grok/bin/grok"; elif command -v grok >/dev/null 2>&1; then command -v grok; fi\''

/**
 * Resolve the `grok` executable path inside a sandbox.
 *
 * Sandboxed providers often install the CLI under `$HOME/.grok/bin` without a
 * global PATH entry (non-root images cannot write `/usr/local/bin`). Probe the
 * sandbox before spawning the harness.
 */
export async function resolveGrokExecutable(
  sandbox: SandboxHandle,
  preferred?: string,
): Promise<string> {
  if (preferred !== undefined && preferred !== 'grok') return preferred
  if (sandbox.provider === 'local-process') return preferred ?? 'grok'

  const probe = await sandbox.process.exec(GROK_PROBE)
  const resolved = probe.stdout.trim()
  if (probe.exitCode === 0 && resolved !== '') return resolved
  return preferred ?? 'grok'
}
