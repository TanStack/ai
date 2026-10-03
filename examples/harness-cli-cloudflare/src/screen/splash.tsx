import { useEffect, useState } from 'react'
import { Box, Text, render, useApp, useInput, useWindowSize } from 'ink'
import { ACCENT } from './theme'
import type { RenderOptions } from 'ink'

// The block letters, 6 rows each. All rows of a letter have one width.
const LETTERS: Record<string, Array<string>> = {
  T: [
    '████████╗',
    '╚══██╔══╝',
    '   ██║   ',
    '   ██║   ',
    '   ██║   ',
    '   ╚═╝   ',
  ],
  A: [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  N: [
    '███╗   ██╗',
    '████╗  ██║',
    '██╔██╗ ██║',
    '██║╚██╗██║',
    '██║ ╚████║',
    '╚═╝  ╚═══╝',
  ],
  S: ['███████╗', '██╔════╝', '███████╗', '╚════██║', '███████║', '╚══════╝'],
  C: [' ██████╗', '██╔════╝', '██║     ', '██║     ', '╚██████╗', ' ╚═════╝'],
  K: ['██╗  ██╗', '██║ ██╔╝', '█████╔╝ ', '██╔═██╗ ', '██║  ██╗', '╚═╝  ╚═╝'],
  I: ['██╗', '██║', '██║', '██║', '██║', '╚═╝'],
}

/** "TANSTACK AI" in block letters, one string for each row. */
const BIG = Array.from({ length: 6 }, (_, row) =>
  ['TANSTACK', 'AI']
    .map((word) =>
      [...word].map((letter) => LETTERS[letter]?.[row] ?? '').join(''),
    )
    .join('   '),
)
const SMALL = ['◆ TanStack AI']
const TAGLINE = 'H A R N E S S   O N   C L O U D F L A R E'

const SHADOW = new Set([...'╗║╝═╔╚'])
// The cream for the light, and a darker step of the orange for the shadow of
// the letters.
const CREAM = '#eeebd4'
const DEEP = '#8a4510'

// The timeline, in milliseconds: the letters wipe in, a light sweeps over
// them, and the tagline types in. Then the splash ends.
const REVEAL = 600
const SHINE = 500
const END = 1700

const easeOut = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3

/** One row of letters, cut into runs of one color. */
function Row(props: {
  text: string
  shown: number
  light: number
  revealing: boolean
}) {
  const { text, shown, light, revealing } = props
  const runs: Array<{ color: string | undefined; text: string }> = []
  for (const [column, char] of [...text].entries()) {
    const visible = column < shown && char !== ' '
    const lit =
      Math.abs(column - light) < 3 || (revealing && column >= shown - 2)
    const color = !visible
      ? undefined
      : lit
        ? CREAM
        : SHADOW.has(char)
          ? DEEP
          : ACCENT
    const shownChar = column < shown ? char : ' '
    const last = runs.at(-1)
    if (last && last.color === color) last.text += shownChar
    else runs.push({ color, text: shownChar })
  }
  return (
    <Text>
      {runs.map((run, index) => (
        <Text key={index} color={run.color}>
          {run.text}
        </Text>
      ))}
    </Text>
  )
}

function Splash() {
  const { exit } = useApp()
  const { columns, rows } = useWindowSize()
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const timer = setInterval(() => {
      const now = Date.now() - start
      setElapsed(now)
      if (now >= END) exit()
    }, 33)
    return () => clearInterval(timer)
  }, [])
  // Any key skips the splash.
  useInput(() => exit())

  const lines = columns >= (BIG[0]?.length ?? 0) + 4 ? BIG : SMALL
  const width = lines[0]?.length ?? 0
  const shown = Math.ceil(width * easeOut(elapsed / REVEAL))
  const light =
    elapsed < REVEAL ? -10 : -6 + (width + 12) * ((elapsed - REVEAL) / SHINE)
  const typed = Math.round(
    TAGLINE.length * easeOut((elapsed - REVEAL * 0.8) / 500),
  )
  // One line shorter than the screen, so Ink does not redraw it all.
  return (
    <Box
      width={columns}
      height={Math.max(1, rows - 1)}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      {lines.map((line, index) => (
        <Row
          key={index}
          text={line}
          shown={shown}
          light={light}
          revealing={elapsed < REVEAL}
        />
      ))}
      <Box marginTop={1}>
        <Text color={CREAM}>
          {TAGLINE.slice(0, typed).padEnd(TAGLINE.length)}
        </Text>
      </Box>
    </Box>
  )
}

/**
 * The boot animation: TanStack AI in block letters, for about 1.7 seconds.
 * A key skips it. A narrow screen gets one line of text instead.
 */
export async function showSplash(io: RenderOptions = {}) {
  const app = render(<Splash />, io)
  await app.waitUntilExit()
}
