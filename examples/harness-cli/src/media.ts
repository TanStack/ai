import { EventType, defineAgent } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { z } from 'zod'
import type { AnyVideoAdapter } from '@tanstack/ai'

/**
 * Makes an image with OpenAI. The harness keeps the file and publishes a
 * `harness.media` event, so the screen can show it and save it.
 */
export const imageAgent = defineAgent({
  name: 'image',
  description:
    'Generates one image from a detailed visual prompt. The user gets the image.',
  produces: 'image',
  inputSchema: z.object({
    prompt: z.string().describe('A detailed description of the image'),
  }),
  run: async (ctx) => {
    const result = await ctx.generateImage({
      adapter: openaiImage('gpt-image-2.5-flare'),
      prompt: ctx.input.prompt,
      size: '1024x1024',
    })
    if (result.images.length === 0)
      throw new Error('The image model returned no image.')
    return `Made the image with ${result.model}. The user has it.`
  },
})

/**
 * Makes a short video with `adapter`. The harness keeps only streamed video,
 * so this uses `stream: true`: one stream from the job start to the file.
 */
export function videoAgent(adapter: AnyVideoAdapter) {
  return defineAgent({
    name: 'video',
    description:
      'Generates one short video clip from a detailed visual prompt. Takes a minute or two. The user gets the video.',
    produces: 'video',
    inputSchema: z.object({
      prompt: z
        .string()
        .describe('A detailed description of the scene and the motion'),
    }),
    run: async (ctx) => {
      const stream = ctx.generateVideo({
        adapter,
        prompt: ctx.input.prompt,
        stream: true,
      })
      for await (const chunk of stream) {
        // The stream reports a failed or stopped job as an event, not a throw.
        if (chunk.type === EventType.RUN_ERROR) throw new Error(chunk.message)
      }
      return `Made the video with ${adapter.model}. The user has it.`
    },
  })
}
