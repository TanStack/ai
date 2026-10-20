---
title: Send and show media
id: harness-media
order: 2
description: "Send images, audio, video, and documents to a harness turn, and keep the media that your agents make. Set limits, and choose what the model reads."
keywords:
  - tanstack ai
  - harness
  - media
  - upload
  - images
---

Your users want to send a photo, a voice note, or a PDF with a message. Your agents make images and videos, and your UI must show them. The harness saves both in one media store for each thread.

A message holds only a small reference to a file. The harness gives the bytes to the model only at the model call, so the transcript stays small.

## Send a file with a prompt

A session saves a file with `putMedia`. `mediaPart(record)` makes the content part that sends the file:

```ts group=harness-media-code
import { readFile } from 'node:fs/promises'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { mediaPart } from '@tanstack/ai-harness/media'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(assistant, { threadId: 'thread-1' })

const scan = await session.putMedia({
  body: await readFile('./receipt.png'),
  mimeType: 'image/png',
  name: 'receipt.png',
})
const turn = await session.send([
  { type: 'text', content: 'What is the total on this receipt?' },
  mediaPart(scan),
])
console.log(turn.text)
```

- The transcript keeps a `harness-media:<id>` URL for the file. Only the model call gets the bytes.
- The host keeps up to 32 MB of base64 text in memory, for all its sessions together, so the next turn does not encode a file again. Above that, a turn encodes the oldest files again.
- If the harness refuses the file, `putMedia` throws a `MediaError`. Its `status` is `413` for a file over the size limit, and `415` for a kind that the harness does not take.

The session also has:

- `getMedia({ id })`: the record, or `null` when the thread has no file with this id.
- `loadMedia({ id, range })`: the bytes, or one range of them. `range` is optional.
- `mediaUrl({ id })`: `{ url }`, with a data URL for a file up to 1 MB. A bigger file gets `{}`. Use `loadMedia` for it, and serve the bytes from your own route.

Over HTTP, `createHarnessClient` gets a signed URL from the handler instead. The request for that URL still needs the login of the user, for example the cookies that an `<img>` on the same site sends. A request with no user gets `401`, unless `access.getGuestUser` gives a guest that `isAllowed` lets read. See [Serve media to a request with no login](./access#serve-media-to-a-request-with-no-login).

## Media that agents make

The harness saves the result of each of these calls in an agent. You do not change the agent code:

- `ctx.generateImage`
- `ctx.generateSpeech`
- `ctx.generateAudio`
- `ctx.generateVideo` with `stream: true`

Without `stream: true`, `ctx.generateVideo` only starts a job, and the harness does not save the video.

```ts group=harness-media-agents
import { defineAgent } from '@tanstack/ai'
import { defineHarness } from '@tanstack/ai-harness'
import { openaiImage, openaiText, openaiVideo } from '@tanstack/ai-openai'
import { z } from 'zod'

const illustrator = defineAgent({
  name: 'illustrator',
  description: 'Draws an image from a prompt',
  inputSchema: z.object({ prompt: z.string() }),
  run: (ctx) =>
    ctx.generateImage({
      adapter: openaiImage('gpt-image-2.5-flare'),
      prompt: ctx.input.prompt,
    }),
})

const animator = defineAgent({
  name: 'animator',
  description: 'Makes a short video from a prompt',
  inputSchema: z.object({ prompt: z.string() }),
  run: (ctx) =>
    ctx.generateVideo({
      adapter: openaiVideo('sora-2'),
      prompt: ctx.input.prompt,
      stream: true,
    }),
})

export const studio = defineHarness({
  name: 'acme/studio',
  adapter: openaiText('gpt-6.1-sol'),
  subagents: { agents: [illustrator, animator] },
})
```

Want to show each picture the moment it is ready? Give the turn an `onMedia` listener. When the turn ends, its result has every file too:

```ts group=harness-media-agents
import { createHarnessHost } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(studio, { threadId: 'thread-1' })

const turn = session.send('Draw a lighthouse at night.')
turn.onMedia(({ media }) => {
  console.log(`${media.kind} saved: ${media.name}`)
})

const { media } = await turn
console.log(`The turn made ${media.length} files.`)
```

- `onMedia` also works on an agent run that you start from code with `session.agents`.
- `session.onMedia` gets the files of every turn and agent run of the session.
- Each file also sends a `harness.media` event (`HARNESS_EVENTS.media`) with the record as its value. Use it when you read the raw events.

A media record has:

- `kind`, `mimeType`, `name`, and `size`: the file.
- `source`: `'user'` for a file that a user sent, and `'generated'` for a file that an agent made.
- `runId` and `subagentRunId`: the turn and the child agent run that made the file.

At the end of a turn, the harness adds its records to the last assistant message, in `metadata.harness.media`. So the media comes back after a restart. Read the records with `mediaOfMessage(message)` from `@tanstack/ai-harness/media`. A failed or cancelled turn keeps its media in the store only.

- If the harness cannot save a file, the agent still gets its result. The turn publishes a `harness.plugin.warning` event.
- An agent that you run from code (`session.agents`, or `ctx.agents` in a plugin) also saves its media and publishes the event. This media is not added to the transcript.

## Limit files, and choose what the model reads

Set the `media` option on `defineHarness`:

```ts
import { defineHarness } from '@tanstack/ai-harness'
import { openaiText, openaiTranscription } from '@tanstack/ai-openai'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
  media: {
    maxBytes: 20 * 1024 * 1024,
    kinds: ['image', 'audio'],
    transcribe: openaiTranscription('gpt-4o-transcribe'),
  },
})
```

- `maxBytes`: the biggest file that a user can send. Default 100 MB.
- `kinds`: the kinds of file that a user can send: `image`, `audio`, `video`, and `document` (a PDF or a text file). Default: all four.
- `accepts`: the kinds that the model reads. It narrows the list that the adapter gives.
- `transcribe`: a transcription adapter. Audio that the model cannot read becomes text before the model call.

These adapters know what their model reads: OpenAI, Anthropic, Gemini, Bedrock, Mistral, Groq, BytePlus, Grok, OpenRouter, and LLM Gateway. Other adapters, for example Ollama and your own adapters, do not know. For them, set `accepts`. If the harness knows neither list, it sends every file to the model.

If the model cannot read a file, the turn stops before the model call. For example, `gpt-6.1-sol` reads text and images. Without `transcribe`, an audio file gives this error:

```text
gpt-6.1-sol cannot read audio files. Add media.transcribe, or send a text summary.
```

In a child agent, `ctx.chat` gets the bytes of the files too. There, only `accepts` limits the kinds, because the harness does not know the adapter of the child.

## Files inside a client message

A browser can put a file in the message itself, as base64 bytes or as a URL. Base64 bytes make the transcript, the log, and each model call big. A URL can point to a server that the model provider then fetches. So the harness checks each part of an input from a client before the turn starts.

The browser sends the bytes in the message:

```ts group=harness-media-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import type { assistant } from './harness'

const client = createHarnessClient<typeof assistant>({
  url: '/api/harness',
  threadId: 'user-1-thread',
})

async function toBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
}

export async function askAbout(file: File) {
  const receipt = await client.send([
    { type: 'text', content: 'What is on this receipt?' },
    {
      type: 'image',
      source: { type: 'data', value: await toBase64(file), mimeType: file.type },
    },
  ])
  if (receipt.status === 'rejected') console.log(receipt.reason)
}
```

On the server, the harness does this for each part:

- Base64 bytes (a `data` source, or a base64 `data:` URL) go to the media store. The message keeps a `harness-media:` reference, the same as a file from `putMedia`. `maxBytes`, `kinds`, and the model check apply.
- An `http:` or `https:` URL is refused. Set `externalUrls` to allow it.
- A provider file handle (`source: { type: 'file' }`) is refused. The adapter reads the file with your provider key, so a client that knows the file id of another user could make the model read it. Set `allowProviderFiles: true` to allow it.
- A URL with another scheme, for example `file:`, is always refused.

`POST run` (the route of `useChat`) checks the parts of the last user message the same way.

Three options control this:

```ts group=harness-media-inline
import { defineHarness } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
  media: {
    externalUrls: (url) => url.hostname === 'cdn.acme.com',
    allowProviderFiles: false,
    maxBodyBytes: 8 * 1024 * 1024,
  },
})
```

- `externalUrls`: `true` allows every `http:` and `https:` URL. A function decides for each URL. Default `false`.
- `allowProviderFiles`: `true` allows provider file handles. Default `false`.
- `maxBodyBytes`: the largest request body or socket frame, in bytes. Default 32 MiB. A bigger body answers `413`. A bigger frame closes the socket. The socket checks a frame only after your WebSocket server read it, so also set the frame limit of your server, for example `maxPayload` of `ws`.

If the harness refuses a part, no turn starts. The receipt is `rejected`, and its `reason` tells you why:

| `reason`                | Why                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `media_too_large`       | The bytes are bigger than `maxBytes`.                                                                          |
| `media_not_allowed`     | The kind is not in `kinds`, or the type has no kind.                                                           |
| `media_invalid`         | The bytes are not base64.                                                                                      |
| `media_url_not_allowed` | `externalUrls` refuses the URL, the scheme is bad, or it is a file handle and `allowProviderFiles` is not set. |

`POST run` has no receipt. It answers with the `reason` as `error`, and with `413` for `media_too_large`, `415` for `media_not_allowed`, or `400` for the other two.

Server code that calls `session.send` directly is not checked, so it can send file handles. The checks are for inputs from a client.

## Keep media across restarts

The host keeps media in three stores of its persistence:

- `artifacts`: the media records.
- `blobs`: the bytes.
- `generationRuns`: the runs that made the generated media.

If a store is missing, the host keeps media in memory. `memoryPersistence()` has all three, but in memory only. To keep media across restarts, give the host these stores on your own database. See [Keep generated files](../persistence/keep-generated-files).

## What you have now

- Files that you send with a prompt, as small references in the transcript.
- Media from your agents, saved with no change to the agent code.
- Limits, and a clear error when the model cannot read a file.
- Media that stays after a restart.

Next: show media in your own screen with [Build your own UI](./custom-ui#show-media).
