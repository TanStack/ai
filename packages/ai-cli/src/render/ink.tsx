import { Box, Text, render } from 'ink'
import terminalImage from 'terminal-image'
import type { RenderedImage } from './lazy'

/**
 * Encode an image file into a terminal-renderable string (native iTerm2/Kitty
 * graphics where supported, ANSI block-art otherwise). Returns null on failure
 * so a missing preview never breaks the run.
 */
async function encodePreview(path: string): Promise<string | null> {
  try {
    return await terminalImage.file(path, { height: 20 })
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
      <Text color="green">
        ✓ Generated {input.images.length} image(s) with {input.model}
      </Text>
      {input.images.map((image, index) => (
        <Box key={image.path} flexDirection="column">
          {previews[index] ? <Text>{previews[index]}</Text> : null}
          <Text dimColor>{image.path}</Text>
          {image.revisedPrompt ? <Text dimColor>“{image.revisedPrompt}”</Text> : null}
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
      <Text color="green">✓ {input.label}</Text>
      <Text dimColor>{input.path}</Text>
      {input.meta
        ? Object.entries(input.meta).map(([key, value]) => (
            <Text key={key} dimColor>
              {key}: {String(value)}
            </Text>
          ))
        : null}
    </Box>,
  )
  await waitUntilExit()
}
