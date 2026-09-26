import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defineAgent, getVideoJobStatus } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { z } from 'zod'
import type { AnyVideoAdapter } from '@tanstack/ai'

/** A short file name from a prompt: `a-fox-in-the-snow-1714000000000`. */
function fileName(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${slug || 'media'}-${Date.now()}`
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed (${response.status}).`)
  return Buffer.from(await response.arrayBuffer())
}

/** Makes an image with OpenAI and saves it as a PNG in `mediaDir`. */
export function imageAgent(mediaDir: string) {
  return defineAgent({
    name: 'image',
    description:
      'Generates one image from a detailed visual prompt and saves it as a PNG file. Returns the file path.',
    produces: 'image',
    inputSchema: z.object({
      prompt: z.string().describe('A detailed description of the image'),
    }),
    run: async (ctx) => {
      const result = await ctx.generateImage({
        adapter: openaiImage('gpt-image-2'),
        prompt: ctx.input.prompt,
        size: '1024x1024',
      })
      const image = result.images[0]
      if (!image) throw new Error('The image model returned no image.')
      let bytes: Buffer
      if (image.b64Json) bytes = Buffer.from(image.b64Json, 'base64')
      else if (image.url) bytes = await download(image.url)
      else throw new Error('The image model returned no image data.')
      await mkdir(mediaDir, { recursive: true })
      const path = join(mediaDir, `${fileName(ctx.input.prompt)}.png`)
      await writeFile(path, bytes)
      return { saved: path, model: result.model }
    },
  })
}

/** Makes a short video with `adapter` and saves it as an MP4 in `mediaDir`. */
export function videoAgent(mediaDir: string, adapter: AnyVideoAdapter) {
  return defineAgent({
    name: 'video',
    description:
      'Generates one short video clip from a detailed visual prompt and saves it as an MP4 file. Takes a minute or two. Returns the file path.',
    produces: 'video',
    inputSchema: z.object({
      prompt: z
        .string()
        .describe('A detailed description of the scene and the motion'),
    }),
    run: async (ctx) => {
      const { jobId } = await ctx.generateVideo({
        adapter,
        prompt: ctx.input.prompt,
      })
      // Video models work in the background, so poll until the job is done.
      const deadline = Date.now() + 10 * 60_000
      let url: string | undefined
      while (!url) {
        if (ctx.abortSignal?.aborted) throw new Error('Stopped.')
        if (Date.now() > deadline)
          throw new Error('The video took longer than 10 minutes.')
        await new Promise((resolve) => setTimeout(resolve, 4000))
        const status = await getVideoJobStatus({ adapter, jobId })
        if (status.status === 'failed')
          throw new Error(status.error ?? 'The video job failed.')
        if (status.status === 'completed') url = status.url
      }
      await mkdir(mediaDir, { recursive: true })
      const path = join(mediaDir, `${fileName(ctx.input.prompt)}.mp4`)
      await writeFile(path, await download(url))
      return { saved: path, model: adapter.model }
    },
  })
}
