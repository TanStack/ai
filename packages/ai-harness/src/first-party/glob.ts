/** A simple glob to RegExp: `**` any path, `*` any name part, `?` one character. */
export function globToRegExp(glob: string) {
  let pattern = ''
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob.charAt(index)
    if (char === '*' && glob[index + 1] === '*') {
      pattern += '.*'
      index += glob[index + 2] === '/' ? 2 : 1
    } else if (char === '*') pattern += '[^/]*'
    else if (char === '?') pattern += '[^/]'
    else pattern += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${pattern}$`)
}
