import { dirname, resolve } from 'node:path'
import { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import pkg from '../../package.json'
import {
  DIM,
  PINK,
  WHITE,
  gradientRuleSegments,
  supportsInlineGraphics,
} from './theme'

// Pre-rendered figlet ("ANSI Shadow") wordmark, embedded as constants so there
// is no runtime figlet dependency. TANSTACK renders white, AI renders pink.
const TANSTACK_LINES = [
  '████████╗ █████╗ ███╗   ██╗███████╗████████╗ █████╗  ██████╗██╗  ██╗',
  '╚══██╔══╝██╔══██╗████╗  ██║██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝',
  '   ██║   ███████║██╔██╗ ██║███████╗   ██║   ███████║██║     █████╔╝ ',
  '   ██║   ██╔══██║██║╚██╗██║╚════██║   ██║   ██╔══██║██║     ██╔═██╗ ',
  '   ██║   ██║  ██║██║ ╚████║███████║   ██║   ██║  ██║╚██████╗██║  ██╗',
  '   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝',
]
const AI_LINES = [
  ' █████╗ ██╗',
  '██╔══██╗██║',
  '███████║██║',
  '██╔══██║██║',
  '██║  ██║██║',
  '╚═╝  ╚═╝╚═╝',
]
const WORDMARK_WIDTH =
  (TANSTACK_LINES[0]?.length ?? 0) + 1 + (AI_LINES[0]?.length ?? 0)

const TAGLINE = 'Type-safe AI in your terminal'

/**
 * Load the island logo as a terminal-renderable string, but only on terminals
 * that support inline raster graphics — elsewhere it returns null and the
 * wordmark stands alone (no muddy block-art).
 */
export async function loadLogo(): Promise<string | null> {
  if (!supportsInlineGraphics()) return null
  const binPath = process.argv[1]
  if (!binPath) return null
  try {
    const { default: terminalImage } = await import('terminal-image')
    const logoPath = resolve(dirname(binPath), '../../assets/logo.png')
    return await terminalImage.file(logoPath, { height: 12 })
  } catch {
    return null
  }
}

function columns(): number {
  return process.stdout.columns && process.stdout.columns > 0
    ? process.stdout.columns
    : 80
}

function GradientRule({ width }: { width: number }) {
  return (
    <Text>
      {gradientRuleSegments(width).map((seg, i) => (
        <Text key={i} color={seg.color}>
          {seg.char}
        </Text>
      ))}
    </Text>
  )
}

/** Width of the moving pink sweep band, in columns. */
const SWEEP_BAND = 7
const DONE_FRONT = WORDMARK_WIDTH + SWEEP_BAND

/**
 * Color for a single wordmark column given the sweep front position. Behind the
 * band, columns settle to their final color (white for TANSTACK, pink for AI);
 * the band itself is pink; columns ahead of it are still white.
 */
function colorForColumn(col: number, aiStart: number, front: number): string {
  if (col <= front - SWEEP_BAND) return col >= aiStart ? PINK : WHITE
  if (col <= front) return PINK
  return WHITE
}

/** Run-length group a line's columns into colored segments to minimize nodes. */
function lineSegments(
  line: string,
  aiStart: number,
  front: number,
): Array<{ text: string; color: string }> {
  const segs: Array<{ text: string; color: string }> = []
  let color = ''
  let buf = ''
  for (let c = 0; c < line.length; c++) {
    const next = colorForColumn(c, aiStart, front)
    if (next !== color) {
      if (buf) segs.push({ text: buf, color })
      buf = line[c] ?? ''
      color = next
    } else {
      buf += line[c] ?? ''
    }
  }
  if (buf) segs.push({ text: buf, color })
  return segs
}

/**
 * The big two-color wordmark. When `animate` is set (and the terminal is wide
 * enough), a pink band sweeps left→right across the letters, leaving TANSTACK
 * white and AI pink. Otherwise it renders the settled final state.
 */
function Wordmark({ animate }: { animate: boolean }) {
  const wide = columns() >= WORDMARK_WIDTH
  const [front, setFront] = useState(animate && wide ? 0 : DONE_FRONT)

  useEffect(() => {
    if (!animate || !wide) return
    const id = setInterval(() => {
      setFront((f) => {
        const n = f + 2
        if (n >= DONE_FRONT) {
          clearInterval(id)
          return DONE_FRONT
        }
        return n
      })
    }, 35)
    return () => clearInterval(id)
  }, [animate, wide])

  if (!wide) {
    return (
      <Text>
        <Text color={WHITE} bold>
          TanStack{' '}
        </Text>
        <Text color={PINK} bold>
          AI
        </Text>
      </Text>
    )
  }

  const aiStart = (TANSTACK_LINES[0]?.length ?? 0) + 1
  return (
    <Box flexDirection="column">
      {TANSTACK_LINES.map((tan, i) => {
        const line = `${tan} ${AI_LINES[i] ?? ''}`
        return (
          <Text key={i}>
            {lineSegments(line, aiStart, front).map((seg, j) => (
              <Text key={j} color={seg.color} bold={seg.color === PINK}>
                {seg.text}
              </Text>
            ))}
          </Text>
        )
      })}
    </Box>
  )
}

/**
 * The full welcome header: optional logo, the big two-color wordmark (animated
 * sweep when `animate` is set, compact fallback on narrow terminals), a sunset
 * gradient rule, and tagline.
 */
export function WelcomeHeader({
  logo,
  animate = false,
}: {
  logo: string | null
  animate?: boolean
}) {
  const ruleWidth = Math.min(columns(), WORDMARK_WIDTH)

  return (
    <Box flexDirection="column" marginBottom={1}>
      {logo ? (
        <Box marginBottom={1} flexDirection="column">
          <Text>{logo}</Text>
        </Box>
      ) : null}

      <Wordmark animate={animate} />

      <Box marginTop={1} flexDirection="column">
        <GradientRule width={ruleWidth} />
        <Text>
          <Text color={DIM}>{TAGLINE} · </Text>
          <Text color={PINK}>v{pkg.version}</Text>
        </Text>
      </Box>
    </Box>
  )
}

/** Compact one-line brand mark for sub-screens (chat REPL header, etc.). */
export function BrandMark({ suffix }: { suffix?: string }) {
  return (
    <Text>
      <Text color={WHITE} bold>
        TanStack{' '}
      </Text>
      <Text color={PINK} bold>
        AI
      </Text>
      {suffix ? <Text color={DIM}> · {suffix}</Text> : null}
    </Text>
  )
}
