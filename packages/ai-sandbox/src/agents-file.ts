/**
 * Universal AGENTS.md writer with per-CLI symlink projection.
 *
 * The known-names set below lists the canonical instruction-file names for
 * each AI coding assistant CLI. Keep the list in one place so it is easy to
 * extend. The copy fallback ensures correctness on platforms without symlink
 * support (e.g. Windows).
 *
 * External per-CLI convention: each assistant looks for its own instruction
 * file by name (CLAUDE.md for Claude Code, GEMINI.md for Gemini CLI, …).
 * We write a single authoritative AGENTS.md and point each name at it.
 */
import type { SandboxHandle } from './contracts'

/** CLI instruction-file names that should resolve to AGENTS.md. */
const SYMLINK_NAMES: ReadonlyArray<string> = ['CLAUDE.md', 'GEMINI.md']

/** Escape a string for safe use as a single-quoted shell argument. */
function sqEscape(value: string): string {
  return value.replace(/'/g, `'\\''`)
}

/**
 * Write `AGENTS.md` under `root` and create per-CLI symlinks (or copies as a
 * fallback when `ln -s` is unavailable).
 *
 * @param handle - The sandbox handle providing `fs` and `process`.
 * @param root   - Absolute path inside the sandbox under which to write.
 * @param content - Markdown content for the instruction file.
 */
export async function writeAgentsFile(
  handle: SandboxHandle,
  root: string,
  content: string,
): Promise<void> {
  const agentsPath = `${root}/AGENTS.md`
  await handle.fs.write(agentsPath, content)

  for (const name of SYMLINK_NAMES) {
    const lnCmd = `ln -s '${sqEscape('AGENTS.md')}' '${sqEscape(name)}'`
    const result = await handle.process.exec(lnCmd, { cwd: root })
    if (result.exitCode !== 0) {
      // Symlinks are not supported on this platform — fall back to a copy.
      await handle.fs.write(`${root}/${name}`, content)
    }
  }
}
