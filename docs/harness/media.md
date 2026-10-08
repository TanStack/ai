---
title: Send and show media
id: harness-media
order: 2
description: "Send images, audio, video, and documents to a harness turn, and show the media that your agents make. Upload from a web app, show files with signed URLs, and set limits."
keywords:
  - tanstack ai
  - harness
  - media
  - upload
  - signed url
  - images
---

Your users want to send a photo, a voice note, or a PDF with a message. Your agents make images and videos, and your UI must show them. The harness saves both in one media store for each thread.

A message holds only a small reference to a file. The harness gives the bytes to the model only at the model call, so the transcript stays small.

At the end of this page, a web app uploads a photo, sends it with a prompt, and shows the images that your agents make.

## 1. Serve media from your handler

`createHarnessHandler` serves the media routes next to the other routes. Set `mediaSecret` to sign media URLs:

```ts group=harness-media-server
import { createHarnessHandler, createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6-astra'),
})

const host = createHarnessHost({ persistence: memoryPersistence() })

export const handler = createHarnessHandler({
  host,
  harness: assistant,
  authorize: (request) =>
    request.headers.get('authorization') === `Bearer ${process.env.HARNESS_TOKEN}`
      ? { id: 'user-1' }
      : null,
  canAccess: (principal, threadId) => threadId.startsWith(principal.id),
  mediaSecret: process.env.MEDIA_SECRET,
})
```

The handler adds these routes:

- `POST media?threadId=&name=`: saves the raw request body as a file of the thread. The `Content-Type` header gives its type. The answer is the media record.
- `GET media-url?threadId=&id=`: gives `{ path, expiresAt }`, a signed path to the file. The path works for 1 hour.
- `GET media?threadId=&id=&exp=&sig=`: gives the bytes, with `Range` support for video. A request with a good signature does not need `authorize`, so the URL works in `<img>`, `<audio>`, and `<video>`.

The handler refuses a request with one of these codes:

- `413`: the file is bigger than the size limit.
- `415`: the harness does not take files of this type.
- `403`: the signature is bad, or the URL expired.

Without `mediaSecret`, the handler signs with a random key. Then a signed URL does not work after a restart. It also does not work when you make a new handler for each request. Use the same secret on every server behind one URL.

Each media answer has `X-Content-Type-Options: nosniff` and a sandbox `Content-Security-Policy`. So an HTML or text file cannot run as a page of your site.

## 2. Upload a file and send it

`client.upload` saves a file in the media store of the thread and gives back its record. `mediaPart(record)` makes the content part that sends the file:

```ts group=harness-media-client
import { createHarnessClient, mediaPart } from '@tanstack/ai-harness/client'
import type { assistant } from './harness'

const client = createHarnessClient<typeof assistant>({
  url: '/api/harness',
  threadId: 'user-1-thread',
  headers: { authorization: 'Bearer my-token' },
})

export async function askAboutPhoto(file: File) {
  const photo = await client.upload(file, { name: file.name, mimeType: file.type })
  await client.prompt([{ type: 'text', content: 'What is in this photo?' }, mediaPart(photo)])
}
```

- `upload` takes a `File`, a `Blob`, an `ArrayBuffer`, or a `Uint8Array`.
- If the handler refuses the file, `upload` throws, for example `Harness upload failed (413): The file is bigger than the limit of 104857600 bytes.`
- The transcript keeps a `harness-media:<id>` URL for the file. Only the model call gets the bytes.

With a [session view](./custom-ui), give the records to `send`: `view.send('What is in this photo?', [photo])`.

## 3. Show the media

Each media part of a session view has a `url`. The view gets a signed URL for each part, and gets a new one before it expires. This component shows one part:

```tsx
import type { MediaPart } from '@tanstack/ai-harness/view'

export function Media({ part }: { part: MediaPart }) {
  if (part.url === undefined) return <span>{part.name}</span>
  if (part.kind === 'image') return <img src={part.url} alt={part.name} />
  if (part.kind === 'audio') return <audio controls src={part.url} />
  if (part.kind === 'video') return <video controls src={part.url} />
  return (
    <a href={part.url} download={part.name}>
      {part.name}
    </a>
  )
}
```

`url` is `undefined` until the view has the first signed URL, so the component shows the name first. To find the media parts in the messages, see [Show media](./custom-ui#show-media).

Open your page, upload a photo, and ask about it. The answer streams in. Each image that an agent makes shows in the message.

## Send a file from code

On a server or in a script, a session saves a file with `putMedia`:

```ts group=harness-media-code
import { readFile } from 'node:fs/promises'
import { createHarnessHost, defineHarness, mediaPart } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6-astra'),
})

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(assistant, { threadId: 'thread-1' })

const scan = await session.putMedia(await readFile('./receipt.png'), {
  mimeType: 'image/png',
  name: 'receipt.png',
})
const turn = await session.prompt([
  { type: 'text', content: 'What is the total on this receipt?' },
  mediaPart(scan),
])
console.log(turn.text)
```

If the harness refuses the file, `putMedia` throws a `MediaError`. Its `status` is `413` or `415`, the same as the HTTP routes.

The session also has:

- `getMedia(id)`: the record, or `null` when the thread has no file with this id.
- `loadMedia(id, range?)`: the bytes, or one range of them.
- `mediaUrl(id)`: a data URL for a file up to 1 MB. A session has no server, so a bigger file has no URL. Use `loadMedia` for it.

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
  adapter: openaiText('gpt-6-astra'),
  subagents: { agents: [illustrator, animator] },
})
```

For each saved file, the turn publishes a `harness.media` event (`HARNESS_EVENTS.media`). Its value is the media record:

```ts group=harness-media-agents
import { HARNESS_EVENTS, createHarnessHost, isMediaRecord } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(studio, { threadId: 'thread-1' })

const turn = session.prompt('Draw a lighthouse at night.')
for await (const { event } of turn.events()) {
  if (event.type === 'CUSTOM' && event.name === HARNESS_EVENTS.media && isMediaRecord(event.value)) {
    console.log(`${event.value.kind} saved: ${event.value.name}`)
  }
}
```

A media record has:

- `kind`, `mimeType`, `name`, and `size`: the file.
- `source`: `'user'` for a file that a user sent, and `'generated'` for a file that an agent made.
- `runId` and `subagentRunId`: the turn and the child agent run that made the file.

At the end of a turn, the harness adds its records to the last assistant message, in `metadata.harness.media`. So the media comes back after a restart. Read the records with `mediaOfMessage(message)`. A failed or cancelled turn keeps its media in the store only.

- If the harness cannot save a file, the agent still gets its result. The turn publishes a `harness.plugin.warning` event.
- An agent that you run from code (`session.agents`, or `ctx.agents` in a plugin) also saves its media and publishes the event. This media is not added to the transcript.

## Limit files, and choose what the model reads

Set the `media` option on `defineHarness`:

```ts
import { defineHarness } from '@tanstack/ai-harness'
import { openaiText, openaiTranscription } from '@tanstack/ai-openai'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6-astra'),
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

These adapters know what their model reads: OpenAI, Anthropic, Gemini, Mistral, Groq, BytePlus, Grok, OpenRouter, and LLM Gateway. Other adapters, for example Ollama and your own adapters, do not know. For them, set `accepts`. If the harness knows neither list, it sends every file to the model.

If the model cannot read a file, the turn stops before the model call. For example, `gpt-6-astra` reads text and images. Without `transcribe`, an audio file gives this error:

```text
gpt-6-astra cannot read audio files. Add media.transcribe, or send a text summary.
```

In a child agent, `ctx.chat` gets the bytes of the files too. There, only `accepts` limits the kinds, because the harness does not know the adapter of the child.

## Keep media across restarts

The host keeps media in three stores of its persistence:

- `artifacts`: the media records.
- `blobs`: the bytes.
- `generationRuns`: the runs that made the generated media.

If a store is missing, the host keeps media in memory. `memoryPersistence()` has all three, but in memory only. To keep media across restarts, give the host these stores on your own database. See [Keep generated files](../persistence/keep-generated-files).

## What you have now

- Files that users upload from a web app and send with a prompt.
- Signed URLs that work in `<img>`, `<audio>`, and `<video>`.
- Media from your agents, saved and shown with no change to the agent code.
- Limits, and a clear error when the model cannot read a file.

Next: show media in your own screen with [Build your own UI](./custom-ui#show-media).
