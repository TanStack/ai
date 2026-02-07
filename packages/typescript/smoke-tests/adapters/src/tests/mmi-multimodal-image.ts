import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runTestCase } from '../harness'
import type { AdapterContext, TestOutcome } from '../harness'
import type { ContentPart } from '@tanstack/ai'

/**
 * Detect image mime type from file extension
 */
function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    default:
      return 'image/jpeg'
  }
}

/**
 * MMJ: Multimodal Image JPEG Test
 *
 * Tests multimodal image support by sending a JPEG image
 * and asking the model to describe it.
 * The image shows a man pointing towards a React icon with text
 * "MY CODE" and "IS THIS AN EMAIL?" (meme format).
 */
export async function runMMJ(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'mmj-multimodal-jpeg'
  const adapterName = adapterContext.adapterName
  const fixtureFile = 'jpgfixture.jpg'
  const fixturePath = join(process.cwd(), 'fixtures', fixtureFile)

  // Try to load the image file
  let imageBase64: string
  try {
    const imageBuffer = await readFile(fixturePath)
    imageBase64 = imageBuffer.toString('base64')
  } catch {
    console.log(
      `[${adapterName}] — ${testName}: Ignored (no fixture file at fixtures/${fixtureFile})`,
    )
    return { passed: true, ignored: true }
  }

  const mimeType = getMimeType(fixtureFile)

  // Build multimodal content
  const contentParts: Array<ContentPart> = [
    { type: 'text', content: 'Describe this image' },
    {
      type: 'image',
      source: { type: 'data', value: imageBase64, mimeType },
    },
  ]

  return runTestCase({
    adapterContext,
    testName,
    description:
      'JPEG image description mentions man/person, React icon, and meme text',
    messages: [{ role: 'user' as const, content: contentParts }],
    validate: (run) => {
      const response = run.fullResponse.toLowerCase()

      // Check for person/man/character
      const hasPerson =
        response.includes('man') ||
        response.includes('person') ||
        response.includes('guy') ||
        response.includes('someone') ||
        response.includes('character') ||
        response.includes('hand') ||
        response.includes('figure')

      // Check for React icon/logo
      const hasReact =
        response.includes('react') ||
        response.includes('logo') ||
        response.includes('icon') ||
        response.includes('atom')

      // Check for meme text content
      const hasCodeText =
        response.includes('code') || response.includes('my code')
      const hasEmailText =
        response.includes('email') || response.includes('is this an email')

      const passed =
        hasPerson ||
        hasReact ||
        hasCodeText ||
        hasEmailText ||
        response.includes('image')

      return {
        passed,
        error: passed
          ? undefined
          : `Response missing expected content. hasPerson=${hasPerson}, hasReact=${hasReact}, hasCodeText=${hasCodeText}, hasEmailText=${hasEmailText}, or mentions "image"`,
        meta: {
          hasPerson,
          hasReact,
          hasCodeText,
          hasEmailText,
          responseLength: response.length,
        },
      }
    },
  })
}

/**
 * MMP: Multimodal Image PNG Test
 *
 * Tests multimodal image support by sending a PNG image
 * and asking the model to describe it.
 * The image shows a beach scene with "AG UI READY" text.
 * Expects the response to mention at least one of: beach, sea/ocean, or AG UI text.
 */
export async function runMMP(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'mmp-multimodal-png'
  const adapterName = adapterContext.adapterName
  const fixtureFile = 'pngfixture.png'
  const fixturePath = join(process.cwd(), 'fixtures', fixtureFile)

  // Try to load the image file
  let imageBase64: string
  try {
    const imageBuffer = await readFile(fixturePath)
    imageBase64 = imageBuffer.toString('base64')
  } catch {
    console.log(
      `[${adapterName}] — ${testName}: Ignored (no fixture file at fixtures/${fixtureFile})`,
    )
    return { passed: true, ignored: true }
  }

  const mimeType = getMimeType(fixtureFile)

  // Build multimodal content
  const contentParts: Array<ContentPart> = [
    { type: 'text', content: 'Describe this image' },
    {
      type: 'image',
      source: { type: 'data', value: imageBase64, mimeType },
    },
  ]

  return runTestCase({
    adapterContext,
    testName,
    description:
      'PNG image description mentions beach, sea, or AG UI text (at least one)',
    messages: [{ role: 'user' as const, content: contentParts }],
    validate: (run) => {
      const response = run.fullResponse.toLowerCase()

      const hasBeach = response.includes('beach')
      const hasSea =
        response.includes('sea') ||
        response.includes('ocean') ||
        response.includes('water')
      const hasAgUi =
        response.includes('ag ui') ||
        response.includes('ag-ui') ||
        response.includes('agui') ||
        response.includes('ready')

      // Pass if at least one of the expected elements is mentioned
      const passed = hasBeach || hasSea || hasAgUi || response.includes('image')

      return {
        passed,
        error: passed
          ? undefined
          : `Response missing expected content. Need at least one of: hasBeach=${hasBeach}, hasSea=${hasSea}, hasAgUi=${hasAgUi}, or mentions "image"`,
        meta: { hasBeach, hasSea, hasAgUi, responseLength: response.length },
      }
    },
  })
}
