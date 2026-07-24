/**
 * Minimal path glob matcher (no dependency): supports `**`, `*`, and `?`.
 * `**` spans path segments; `*` and `?` stay within one segment.
 */

const REGEX_SPECIALS = /[.+^${}()|[\]\\]/g

export function globToRegExp(glob: string): RegExp {
  let out = '^'
  let i = 0
  while (i < glob.length) {
    const c = glob[i]!
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**` — optionally followed by `/`; matches any depth (including none)
        i += 2
        if (glob[i] === '/') i++
        out += out === '^' || out.endsWith('/') ? '(?:.*/)?' : '.*'
        // when `**` is the trailing token (e.g. `docs/**`) match everything below
        if (i >= glob.length) out += '.*'
      } else {
        out += '[^/]*'
        i++
      }
    } else if (c === '?') {
      out += '[^/]'
      i++
    } else {
      out += c.replace(REGEX_SPECIALS, '\\$&')
      i++
    }
  }
  return new RegExp(out + '$')
}

export function matchesGlob(path: string, glob: string): boolean {
  return globToRegExp(glob).test(path)
}

export function matchesAnyGlob(path: string, globs: Array<string>): boolean {
  return globs.some((g) => matchesGlob(path, g))
}
