// TanStack AI's accent color, the dark-mode step, so it reads on dark terminals.
export const ACCENT = '#e06e49'

export const KIND_COLOR: Record<string, string> = {
  image: 'magenta',
  audio: 'cyan',
  video: 'blue',
  document: 'white',
}

export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/** 12400 is "12.4k", 1050000 is "1.05M". */
export function compact(count: number) {
  if (count >= 1_000_000) return `${Number((count / 1_000_000).toFixed(2))}M`
  if (count >= 1_000) return `${Number((count / 1_000).toFixed(1))}k`
  return String(count)
}
