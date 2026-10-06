import React, { useEffect, useState } from 'react'
import { Box, Text, render, useApp, useInput, useWindowSize } from 'ink'
import { ACCENT, GOLD, NIGHT } from './theme'
import { POSES, STAND, SYMBOL } from './batman-art'
import type { RenderOptions } from 'ink'

const TAGLINE = 'I   A M   T H E   N I G H T'
const SUB = 'TanStack AI harness  ·  Gotham terminal'
const FILL = new Set('8')

const SYMBOL_MS = 1800
const POSE_MS = 340
const HOLD_MS = 700
const END = SYMBOL_MS + POSE_MS * POSES.length * 2 + HOLD_MS

const easeOut = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3

const BAT_SEEDS = [0.1, 0.28, 0.47, 0.63, 0.81, 0.94, 0.17, 0.55]

function batLine(width: number, elapsed: number, reverse: boolean) {
  const marks = new Map<number, string>()
  const span = Math.max(10, width + 10)
  for (const [index, seed] of BAT_SEEDS.entries()) {
    const speed = 28 + (index % 4) * 9
    let x = Math.floor((elapsed / speed + seed * span) % span) - 5
    if (reverse) x = width - x - 2
    if (x >= 0 && x <= width - 2) marks.set(x, index % 3 === 0 ? '✦' : '🦇')
  }
  let out = ''
  for (let i = 0; i < width;) {
    const mark = marks.get(i)
    if (mark) {
      out += mark
      i += 2
    } else {
      out += ' '
      i += 1
    }
  }
  return out
}

function hop(frame: ReadonlyArray<string>, up: boolean) {
  if (up || frame.length === 0) return frame
  const blank = ' '.repeat(frame[0]?.length ?? 0)
  return [blank, ...frame.slice(0, -1)]
}

/** One row of ASCII, cut into runs of one color. */
function Row(props: {
  text: string
  shown: number
  light: number
  revealing: boolean
  fill?: Set<string>
}) {
  const { text, shown, light, revealing, fill } = props
  const runs: Array<{ color: string | undefined; text: string }> = []
  for (const [column, char] of [...text].entries()) {
    const visible = column < shown && char !== ' '
    const lit =
      Math.abs(column - light) < 3 || (revealing && column >= shown - 2)
    const color = !visible ? undefined : lit || fill?.has(char) ? GOLD : ACCENT
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
  useInput(() => exit())

  const canSymbol = columns >= (SYMBOL[0]?.length ?? 0) + 2
  const canPoses = columns >= (POSES[0]?.[0]?.length ?? 0) + 2
  const showSymbol = canSymbol && elapsed < SYMBOL_MS
  const poseSource = canPoses ? POSES : [STAND]
  const poseAt = Math.max(0, elapsed - (canSymbol ? SYMBOL_MS : 0))
  const poseIndex = Math.floor(poseAt / POSE_MS) % poseSource.length
  const pose = hop(
    poseSource[poseIndex] ?? STAND,
    Math.floor(poseAt / 170) % 2 === 0,
  )
  const art = showSymbol ? SYMBOL : pose
  const width = art[0]?.length ?? 0
  const revealFor = showSymbol ? SYMBOL_MS * 0.55 : 280
  const local = showSymbol ? elapsed : poseAt % POSE_MS
  const shown = Math.ceil(width * easeOut(Math.min(1, local / revealFor)))
  const light =
    -6 + (width + 12) * easeOut(Math.min(1, local / (revealFor + 400)))
  const revealing = local < revealFor
  const typed = Math.round(TAGLINE.length * easeOut(elapsed / 900))
  const inner = Math.max(8, columns)
  const showBats = rows >= (art.length ?? 0) + 6

  return (
    <Box
      width={columns}
      height={Math.max(1, rows - 1)}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      {showBats ? (
        <Text color={ACCENT}>{batLine(inner, elapsed, false)}</Text>
      ) : null}
      <Box
        marginTop={showBats ? 1 : 0}
        flexDirection="column"
        alignItems="center"
      >
        {art.map((line, index) => (
          <Row
            key={`${showSymbol ? 'symbol' : poseIndex}-${index}`}
            text={line}
            shown={shown}
            light={light}
            revealing={revealing}
            fill={showSymbol ? FILL : undefined}
          />
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={GOLD} bold>
          {TAGLINE.slice(0, Math.max(0, typed)).padEnd(TAGLINE.length)}
        </Text>
      </Box>
      <Text dimColor>{elapsed > 700 ? SUB : ''}</Text>
      {showBats ? (
        <Box marginTop={1}>
          <Text color={NIGHT}>{batLine(inner, elapsed + 400, true)}</Text>
        </Box>
      ) : null}
    </Box>
  )
}

/**
 * The boot animation: the bat symbol, then three Batman poses. About 4.5
 * seconds. A key skips it. A narrow screen gets the standing pose only.
 */
export async function showSplash(io: RenderOptions = {}) {
  const app = render(<Splash />, io)
  await app.waitUntilExit()
}
