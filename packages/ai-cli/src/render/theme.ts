/**
 * TanStack AI brand theme for the terminal UI. Single source of truth for
 * colors so every Ink component stays consistent.
 */

/** The TanStack AI package pink (Tailwind pink-500). */
export const PINK = '#EC4899'
export const WHITE = '#FFFFFF'
/** Dim/muted gray for secondary text. */
export const DIM = '#94A3B8'
export const SUCCESS = '#22C55E'
export const ERROR_RED = '#F43F5E'

/**
 * Sunset → sea palette sampled from the TanStack island logo, used for
 * gradient divider rules (warm amber/orange into pink into teal).
 */
export const SUNSET = [
  '#FBBF24',
  '#FB923C',
  '#F97316',
  '#F472B6',
  '#EC4899',
  '#22D3EE',
  '#2DD4BF',
] as const

/** Pick a gradient color for position `index` of `total` (banded, no interpolation). */
export function gradientColorAt(index: number, total: number): string {
  if (total <= 1) return SUNSET[0]
  const ratio = index / (total - 1)
  const slot = Math.min(
    SUNSET.length - 1,
    Math.round(ratio * (SUNSET.length - 1)),
  )
  return SUNSET[slot] ?? SUNSET[0]
}

/** Build a full-width gradient rule string of the given character. */
export function gradientRuleSegments(
  width: number,
  char = '─',
): Array<{ char: string; color: string }> {
  const w = Math.max(1, width)
  return Array.from({ length: w }, (_, i) => ({
    char,
    color: gradientColorAt(i, w),
  }))
}

/**
 * Detect whether the terminal can render inline raster graphics (so the logo
 * is shown only where it looks good — iTerm2, Kitty, WezTerm, Konsole/Sixel —
 * and omitted elsewhere rather than rendered as muddy block-art).
 */
export function supportsInlineGraphics(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!process.stdout.isTTY) return false
  if (env.TERM_PROGRAM === 'iTerm.app' || env.TERM_PROGRAM === 'WezTerm')
    return true
  if (env.KITTY_WINDOW_ID || env.WEZTERM_PANE || env.KONSOLE_VERSION)
    return true
  if (env.TERM?.includes('kitty')) return true
  return false
}
