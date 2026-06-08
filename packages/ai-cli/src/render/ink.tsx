import { Box, Text, render } from 'ink'
import terminalImage from 'terminal-image'
import { DIM, PINK, SUCCESS, supportsInlineGraphics } from './theme'
import type { RenderedImage } from './lazy'

/**
 * Encode an image file into a terminal-renderable string. Only attempted on
 * terminals with inline raster graphics (iTerm2/Kitty/WezTerm), where it renders
 * crisply; elsewhere returns null so we show just the saved path instead of
 * heavily pixelated ANSI block-art. Returns null on any failure too.
 */
async function encodePreview(path: string): Promise<string | null> {
  if (!supportsInlineGraphics()) return null
  try {
    return await terminalImage.file(path, { height: 24 })
  } catch {
    return null
  }
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

  const { waitUntilExit } = render(
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
  await waitUntilExit()
}

/** Render a block of finished text (e.g. chat one-shot, summary). */
export async function renderTextInk(text: string): Promise<void> {
  const { waitUntilExit } = render(
    <Box>
      <Text>{text}</Text>
    </Box>,
  )
  await waitUntilExit()
}

/** Render a saved-artifact confirmation with the path and metadata. */
export async function renderArtifactPathInk(input: {
  label: string
  path: string
  meta?: Record<string, unknown>
}): Promise<void> {
  const { waitUntilExit } = render(
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
  await waitUntilExit()
}
