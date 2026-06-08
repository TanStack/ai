import { dirname, resolve } from 'node:path'
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

/**
 * The full welcome header: optional logo, the big two-color wordmark (or a
 * compact fallback on narrow terminals), a sunset gradient rule, and tagline.
 */
export function WelcomeHeader({ logo }: { logo: string | null }) {
  const cols = columns()
  const ruleWidth = Math.min(cols, WORDMARK_WIDTH)
  const wide = cols >= WORDMARK_WIDTH

  return (
    <Box flexDirection="column" marginBottom={1}>
      {logo ? (
        <Box marginBottom={1} flexDirection="column">
          <Text>{logo}</Text>
        </Box>
      ) : null}

      {wide ? (
        <Box flexDirection="column">
          {TANSTACK_LINES.map((line, i) => (
            <Text key={i}>
              <Text color={WHITE}>{line}</Text>
              <Text> </Text>
              <Text color={PINK} bold>
                {AI_LINES[i]}
              </Text>
            </Text>
          ))}
        </Box>
      ) : (
        <Text>
          <Text color={WHITE} bold>
            TanStack{' '}
          </Text>
          <Text color={PINK} bold>
            AI
          </Text>
        </Text>
      )}

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
