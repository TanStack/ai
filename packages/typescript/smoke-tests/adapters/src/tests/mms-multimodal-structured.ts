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
 * JSON Schema prompt for structured image description
 */
const STRUCTURED_PROMPT = `Analyze this image and provide a structured description. Return ONLY valid JSON (no markdown code blocks) matching this schema:
{
  "description": "A brief description of what the image shows",
  "hasText": true/false,
  "textContent": "The text content visible in the image, if any",
  "mainSubject": "The main subject or focal point of the image",
  "colors": ["array", "of", "primary", "colors"]
}`

interface ImageDescription {
  description: string
  hasText: boolean
  textContent?: string
  mainSubject: string
  colors: Array<string>
}

/**
 * MMS: Multimodal Structured JPEG Test
 *
 * Tests multimodal image support with structured output by sending a JPEG image
 * and asking the model to describe it using a JSON schema.
 * The image shows a man pointing towards a React icon with text
 * "MY CODE" and "IS THIS AN EMAIL?" (meme format).
 */
export async function runMMS(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'mms-multimodal-structured-jpeg'
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

  // Build multimodal content with structured output request
  const contentParts: Array<ContentPart> = [
    {
      type: 'text',
      content: STRUCTURED_PROMPT,
    },
    {
      type: 'image',
      source: { type: 'data', value: imageBase64, mimeType },
    },
  ]

  return runTestCase({
    adapterContext,
    testName,
    description:
      'JPEG image with structured output returns valid JSON with description, hasText, mainSubject, colors',
    messages: [{ role: 'user' as const, content: contentParts }],
    validate: (run) => {
      const response = run.fullResponse

      // Try to parse as JSON
      let parsed: ImageDescription | null = null
      try {
        // Try to extract JSON from response (might be wrapped in markdown code blocks)
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
        const jsonStr =
          jsonMatch && jsonMatch[1] ? jsonMatch[1].trim() : response.trim()
        parsed = JSON.parse(jsonStr)
      } catch {
        // If direct parse fails, try the raw response
        try {
          parsed = JSON.parse(response)
        } catch {
          return {
            passed: false,
            error: `Failed to parse response as JSON: ${response.substring(0, 200)}`,
            meta: { responseLength: response.length },
          }
        }
      }

      // Validate structure
      const hasDescription =
        typeof parsed?.description === 'string' && parsed.description.length > 0
      const hasMainSubject =
        typeof parsed?.mainSubject === 'string' && parsed.mainSubject.length > 0
      const hasColors =
        Array.isArray(parsed?.colors) && parsed.colors.length > 0
      const hasTextBoolean = typeof parsed?.hasText === 'boolean'

      const passed =
        hasDescription && hasMainSubject && hasColors && hasTextBoolean

      return {
        passed,
        error: passed
          ? undefined
          : `Structured output missing required fields. hasDescription=${hasDescription}, hasMainSubject=${hasMainSubject}, hasColors=${hasColors}, hasTextBoolean=${hasTextBoolean}`,
        meta: {
          hasDescription,
          hasMainSubject,
          hasColors,
          hasTextBoolean,
          parsed,
          responseLength: response.length,
        },
      }
    },
  })
}

/**
 * MMT: Multimodal Structured PNG Test
 *
 * Tests multimodal image support with structured output by sending a PNG image
 * and asking the model to describe it using a JSON schema.
 * The image shows a beach scene with "AG UI READY" text.
 */
export async function runMMT(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'mmt-multimodal-structured-png'
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

  // Build multimodal content with structured output request
  const contentParts: Array<ContentPart> = [
    {
      type: 'text',
      content: STRUCTURED_PROMPT,
    },
    {
      type: 'image',
      source: { type: 'data', value: imageBase64, mimeType },
    },
  ]

  return runTestCase({
    adapterContext,
    testName,
    description:
      'PNG image with structured output returns valid JSON with description, hasText, mainSubject, colors',
    messages: [{ role: 'user' as const, content: contentParts }],
    validate: (run) => {
      const response = run.fullResponse

      // Try to parse as JSON
      let parsed: ImageDescription | null = null
      try {
        // Try to extract JSON from response (might be wrapped in markdown code blocks)
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
        const jsonStr =
          jsonMatch && jsonMatch[1] ? jsonMatch[1].trim() : response.trim()
        parsed = JSON.parse(jsonStr)
      } catch {
        // If direct parse fails, try the raw response
        try {
          parsed = JSON.parse(response)
        } catch {
          return {
            passed: false,
            error: `Failed to parse response as JSON: ${response.substring(0, 200)}`,
            meta: { responseLength: response.length },
          }
        }
      }

      // Validate structure
      const hasDescription =
        typeof parsed?.description === 'string' && parsed.description.length > 0
      const hasMainSubject =
        typeof parsed?.mainSubject === 'string' && parsed.mainSubject.length > 0
      const hasColors =
        Array.isArray(parsed?.colors) && parsed.colors.length > 0
      const hasTextBoolean = typeof parsed?.hasText === 'boolean'

      const passed =
        hasDescription && hasMainSubject && hasColors && hasTextBoolean

      return {
        passed,
        error: passed
          ? undefined
          : `Structured output missing required fields. hasDescription=${hasDescription}, hasMainSubject=${hasMainSubject}, hasColors=${hasColors}, hasTextBoolean=${hasTextBoolean}`,
        meta: {
          hasDescription,
          hasMainSubject,
          hasColors,
          hasTextBoolean,
          parsed,
          responseLength: response.length,
        },
      }
    },
  })
}
