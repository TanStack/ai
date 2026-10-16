/**
 * A simple glob to RegExp: `**` any path, `*` any name part, `?` one
 * character, `{a,b}` one of the parts. `src/**\/a.ts` also matches `src/a.ts`.
 */
export function globToRegExp(glob: string) {
  return new RegExp(`^${globPattern(glob)}$`)
}

// ponytail: no nested braces. `{a,{b,c}}` matches wrong. Add a brace parser when a rule needs it.
function globPattern(glob: string): string {
  let pattern = ''
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob.charAt(index)
    const braceEnd = char === '{' ? glob.indexOf('}', index) : -1
    if (char === '*' && glob[index + 1] === '*') {
      // `**/` is zero or more whole folders, so `**/x` never matches `ax`.
      if (glob[index + 2] === '/') {
        pattern += '(?:.*/)?'
        index += 2
      } else {
        pattern += '.*'
        index += 1
      }
    } else if (char === '*') pattern += '[^/]*'
    else if (char === '?') pattern += '[^/]'
    else if (braceEnd > index) {
      const parts = glob.slice(index + 1, braceEnd).split(',')
      pattern += `(?:${parts.map(globPattern).join('|')})`
      index = braceEnd
    } else pattern += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return pattern
}
