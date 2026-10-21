---
title: Audio Recording
id: audio-recording
description: "Record the microphone in the browser with useAudioRecorder, then send the clip to a chat or a transcription. No transcoding and no extra dependencies."
keywords:
  - tanstack ai
  - audio recording
  - useAudioRecorder
  - createAudioRecorder
  - injectAudioRecorder
  - voice input
  - MediaRecorder
---

Your users want to talk instead of type. To do that, you must get the microphone, record, stop, and turn the bytes into something a model accepts. `useAudioRecorder` does all of it and gives you a clip that is ready to send to a chat or to a transcription.

## Record and transcribe

You need the `/api/transcribe` route from the [Transcription quick setup](./transcription#transcribe-your-first-file). This takes about 5 minutes.

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai

<!-- ::end:tabs -->

2. Add the transcription route. Copy it from [Transcription](./transcription#transcribe-your-first-file).

3. Add a record button that sends the clip to the route:

```tsx
import {
  fetchServerSentEvents,
  useAudioRecorder,
  useTranscription,
} from '@tanstack/ai-react'

export function VoiceNote() {
  const { isRecording, isSupported, start, stop } = useAudioRecorder()
  const { generate, result, isLoading } = useTranscription({
    connection: fetchServerSentEvents('/api/transcribe'),
  })

  async function toggle() {
    try {
      if (!isRecording) {
        await start()
        return
      }
      const rec = await stop()
      // Remove ";codecs=..." so the provider gets a clean audio type.
      const mimeType = rec.mimeType.split(';')[0]
      await generate({ audio: `data:${mimeType};base64,${rec.base64}` })
    } catch (error) {
      console.error(error)
    }
  }

  if (!isSupported) return <p>This browser cannot record audio.</p>

  return (
    <div>
      <button onClick={() => void toggle()}>
        {isRecording ? 'Stop' : 'Record'}
      </button>
      {isLoading && <p>Transcribing...</p>}
      {result && <p>{result.text}</p>}
    </div>
  )
}
```

Click **Record** and allow the microphone. Say something, then click **Stop**. Your words show up as text.

## How it works

- `start()` asks for the microphone with `getUserMedia` and starts a `MediaRecorder`.
- `stop()` ends the recording and resolves to an `AudioRecording`.
- The recording keeps the native format of the browser recorder, `audio/webm` or `audio/mp4`. Nothing is transcoded.

The sample sends the clip as a data URL. The data URL carries the real audio type to the provider. With plain base64, the OpenAI and Groq transcription adapters treat the bytes as `audio/mpeg`. That is the wrong type for webm or mp4 bytes.

An `AudioRecording` has these fields:

| Field | Type | Description |
| --- | --- | --- |
| `part` | `AudioPart` | A content part that is ready for chat: `{ type: 'audio', source: { type: 'data', value, mimeType } }` |
| `base64` | `string` | The recorded bytes as base64 |
| `blob` | `Blob` | The recorded bytes as a `Blob` |
| `mimeType` | `string` | The native recorder type, for example `audio/webm;codecs=opus` |
| `durationMs` | `number` | The length of the recording, in milliseconds |

## Send a recording in chat

`rec.part` is already a chat content part. Put it in `sendMessage`:

```tsx
import {
  fetchServerSentEvents,
  useAudioRecorder,
  useChat,
} from '@tanstack/ai-react'

export function VoiceComposer() {
  const { isRecording, start, stop } = useAudioRecorder()
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  async function toggle() {
    try {
      if (!isRecording) {
        await start()
        return
      }
      const rec = await stop()
      await sendMessage({ content: [rec.part] })
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <button onClick={() => void toggle()}>
      {isRecording ? 'Send' : 'Record'}
    </button>
  )
}
```

The chat model must accept audio input.

## Handle errors

Errors come through two channels. Handle one of them, not both:

- `onError(error)` runs when the user denies the microphone, or when the recorder fails.
- `start()` and `stop()` also reject.

When they reject:

- `start()` rejects when the user denies the microphone.
- `stop()` rejects when the recorder fails.
- `stop()` rejects with `Recording cancelled` if the recording is cancelled while a stop is in progress. This happens, for example, when the component unmounts during a recording.

If you handle errors through the promises, `await start()` and `await stop()` in `try`/`catch`. Do not discard the promises with `void`.

## Show the latest recording

The hook also has a reactive `recording` value. It holds the same value that `stop()` returns. You can show a preview from it without storing the return value of `stop()`. It is `null` until the first `stop()`.

```tsx
import { useAudioRecorder } from '@tanstack/ai-react'

export function Preview() {
  const { recording, isRecording, start, stop } = useAudioRecorder({
    onError: (error) => console.error(error),
  })

  return (
    <div>
      <button onClick={() => void (isRecording ? stop() : start())}>
        {isRecording ? 'Stop' : 'Record'}
      </button>
      {recording && (
        <audio
          src={`data:${recording.mimeType};base64,${recording.base64}`}
          controls
        />
      )}
    </div>
  )
}
```

## Change the recording before you use it

Pass `onComplete` to turn the raw recording into what your app needs: a URL after an upload, an encoded blob, or your own object. `stop()` and `recording` then hold your value. The function can be `async`.

```tsx
import { useAudioRecorder } from '@tanstack/ai-react'

export function Uploader() {
  const { recording, stop } = useAudioRecorder({
    onComplete: async (rec) => {
      const res = await fetch('/api/upload', { method: 'POST', body: rec.blob })
      const data: unknown = await res.json()
      if (typeof data === 'object' && data !== null && 'url' in data) {
        return String(data.url)
      }
      return null
    },
  })
  // recording and stop() now hold string | null
}
```

What the return value does:

- Return `undefined` (or nothing): the hook keeps the raw `AudioRecording`.
- Return any other value, `null` included: the hook uses that value, and the types of `stop()` and `recording` change to match.

The [generation hooks](./generation-hooks#result-transforms) have a similar `onResult` transform. Two things are different there: `onResult` is not async, and a `null` from `onResult` keeps the previous value.

## Other frameworks

Every framework has the same recorder:

| Framework | Import | Function | Reactive values |
| --- | --- | --- | --- |
| React | `@tanstack/ai-react` | `useAudioRecorder` | `isRecording`, `recording` (values) |
| Octane | `@tanstack/ai-octane` | `useAudioRecorder` | Same as React |
| Solid | `@tanstack/ai-solid` | `useAudioRecorder` | `isRecording()`, `recording()` (accessors) |
| Vue | `@tanstack/ai-vue` | `useAudioRecorder` | `isRecording.value`, `recording.value` (read-only refs) |
| Svelte | `@tanstack/ai-svelte` | `createAudioRecorder` | `recorder.isRecording`, `recorder.recording` (getters) |
| Angular | `@tanstack/ai-angular` | `injectAudioRecorder` | `isRecording()`, `recording()` (signals). Call it in an injection context. |
| Remix | `@tanstack/ai-remix` | `createAudioRecorder(handle, options)` | `recorder.isRecording`, `recorder.recording` |

Svelte 5 runes cannot register automatic cleanup. If a recording can still run when the component goes away, call `recorder.cancel()` in your cleanup:

```svelte
<script lang="ts">
  import {
    createAudioRecorder,
    createChat,
    fetchServerSentEvents,
  } from '@tanstack/ai-svelte'

  const recorder = createAudioRecorder()
  const chat = createChat({ connection: fetchServerSentEvents('/api/chat') })

  async function toggle() {
    if (!recorder.isRecording) {
      await recorder.start()
      return
    }
    const rec = await recorder.stop()
    await chat.sendMessage({ content: [rec.part] })
  }
</script>

<button onclick={toggle}>{recorder.isRecording ? 'Send' : 'Record'}</button>
```

## Advanced

### Options

`useAudioRecorder(options?)`, `createAudioRecorder`, and `injectAudioRecorder` take these options:

| Option | Type | Description |
| --- | --- | --- |
| `onComplete` | `(recording: AudioRecording) => T \| Promise<T>` | Changes the recording. Its awaited return value sets the type of `stop()` and `recording`. Return nothing to keep the raw recording. |
| `onError` | `(error: Error) => void` | Runs when the user denies the microphone, or when the recorder fails |
| `audio` | `MediaTrackConstraints \| boolean` | Goes to `getUserMedia({ audio })`. The default is `true`. |
| `mimeType` | `string` | The recorder type you prefer. If the browser does not support it, the browser default is used. |

The browser can ignore a `mimeType` it does not support. If a later step needs one exact format, read `recording.mimeType`.

### Return value

| Property | Type | Description |
| --- | --- | --- |
| `recording` | `T \| null` | The latest recording, after `onComplete`. Reactive. |
| `isRecording` | `boolean` | `true` while the recorder runs |
| `isSupported` | `boolean` | `true` if the browser can record |
| `start` | `() => Promise<void>` | Gets the microphone and starts recording |
| `stop` | `() => Promise<T>` | Stops, then resolves with the recording (after `onComplete`) |
| `cancel` | `() => void` | Discards the recording in progress and releases the microphone |

`T` is `AudioRecording`, unless `onComplete` returns another type. The shape of the reactive values changes by framework. See [Other frameworks](#other-frameworks).
