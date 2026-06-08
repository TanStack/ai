import { useEffect } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'
import terminalImage from 'terminal-image'
import { DIM, PINK, SUCCESS } from './theme'
import { forceExit, isCtrlC } from './exit'
import type { ReactNode } from 'react'
import type { RenderedImage } from './lazy'

/**
 * Encode an image file into a terminal-renderable string — native iTerm2/Kitty
 * graphics where supported, ANSI block-art otherwise (blocky, but a preview is
 * better than none). Returns null only on failure.
 */
async function encodePreview(path: string): Promise<string | null> {
  try {
    return await terminalImage.file(path, { height: 24 })
  } catch {
    return null
  }
}

/**
 * Wrap a finished result. On an interactive terminal it stays on screen until
 * the user presses Esc/Enter (so a hub action's output isn't instantly cleared,
 * and one-shot renders don't hang); otherwise it unmounts immediately.
 */
function ResultView({ children }: { children: ReactNode }) {
  const { exit } = useApp()
  const interactive = Boolean(process.stdin.isTTY)

  useInput(
    (input, key) => {
      if (isCtrlC(input, key)) forceExit()
      if (key.escape || key.return) exit()
    },
    { isActive: interactive },
  )
  useEffect(() => {
    if (!interactive) exit()
  }, [interactive, exit])

  return (
    <Box flexDirection="column">
      {children}
      {interactive ? (
        <Box marginTop={1}>
          <Text color={DIM}>Press Esc to continue</Text>
        </Box>
      ) : null}
    </Box>
  )
}

async function renderResult(content: ReactNode): Promise<void> {
  const { waitUntilExit } = render(<ResultView>{content}</ResultView>, {
    exitOnCtrlC: false,
  })
  await waitUntilExit()
}

/** Render generated images with an inline preview + the saved path(s). */
export async function renderImageResultInk(input: {
  model: string
  images: Array<RenderedImage>
  preview: boolean
}): Promise<void> {
  const previews = input.preview
    ? await Promise.all(input.images.map((image) => encodePreview(image.path)))
    : input.images.map(() => null)

  await renderResult(
    <Box flexDirection="column" gap={1}>
      <Text>
        <Text color={SUCCESS}>✓ </Text>
        Generated {input.images.length} image(s) with{' '}
        <Text color={PINK}>{input.model}</Text>
      </Text>
      {input.images.map((image, index) => (
        <Box key={image.path} flexDirection="column">
          {previews[index] ? <Text>{previews[index]}</Text> : null}
          <Text color={DIM}>{image.path}</Text>
          {image.revisedPrompt ? (
            <Text color={DIM}>“{image.revisedPrompt}”</Text>
          ) : null}
        </Box>
      ))}
    </Box>,
  )
}

/** Render a block of finished text (e.g. chat one-shot, summary). */
export async function renderTextInk(text: string): Promise<void> {
  await renderResult(<Text>{text}</Text>)
}

/** Render a saved-artifact confirmation with the path and metadata. */
export async function renderArtifactPathInk(input: {
  label: string
  path: string
  meta?: Record<string, unknown>
}): Promise<void> {
  await renderResult(
    <Box flexDirection="column">
      <Text>
        <Text color={SUCCESS}>✓ </Text>
        {input.label}
      </Text>
      <Text color={DIM}>{input.path}</Text>
      {input.meta
        ? Object.entries(input.meta).map(([key, value]) => (
            <Text key={key} color={DIM}>
              {key}: {String(value)}
            </Text>
          ))
        : null}
    </Box>,
  )
}
