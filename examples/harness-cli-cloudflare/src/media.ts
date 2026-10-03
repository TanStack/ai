import { defineAgent, keyedAdapter } from '@tanstack/ai'
import {
  createCloudflareImage,
  createCloudflareTTS,
} from '@tanstack/ai-cloudflare'
import { cloudflareByok } from '@tanstack/ai-cloudflare/byok'
import { z } from 'zod'
import { cloudflareRest } from './cloudflare-connect'

// Every agent here returns a short text. The harness keeps each file it makes
// and publishes a `harness.media` event, so the screen can show and save it.
//
// Each agent builds its Workers AI model just before the call, with your
// Cloudflare token and account, through your AI Gateway. Without them, the
// call stops, and the screen says to run /connect cloudflare.
const flux = keyedAdapter(cloudflareByok, (token) =>
  createCloudflareImage(
    '@cf/black-forest-labs/flux-1-schnell',
    cloudflareRest(token),
  ),
)
const aura = keyedAdapter(cloudflareByok, (token) =>
  createCloudflareTTS('@cf/deepgram/aura-2-en', cloudflareRest(token)),
)

/** Makes an image with Workers AI (FLUX.1 schnell). */
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
      adapter: await ctx.keys.adapter(flux),
      prompt: ctx.input.prompt,
    })
    if (result.images.length === 0)
      throw new Error('The image model returned no image.')
    return `Made the image with ${result.model}. The user has it.`
  },
})

/** Reads a text aloud with Workers AI (Deepgram Aura 2). */
export const speechAgent = defineAgent({
  name: 'speech',
  description:
    'Reads a text aloud and makes an audio file of it (text to speech). The user gets the audio.',
  produces: 'speech',
  inputSchema: z.object({
    text: z.string().describe('The exact words to say'),
    voice: z
      .string()
      .optional()
      .describe(
        'An Aura voice, for example luna, orion, or thalia. Default: luna',
      ),
  }),
  run: async (ctx) => {
    const result = await ctx.generateSpeech({
      adapter: await ctx.keys.adapter(aura),
      text: ctx.input.text,
      voice: ctx.input.voice ?? 'luna',
    })
    return `Read the text aloud with ${result.model}. The user has the audio.`
  },
})
