---
title: Audio Recording
id: audio-recording
description: "Record microphone audio in the browser with useAudioRecorder and send it to a chat or transcription as a ready-to-use content part, with an optional transform."
keywords:
  - tanstack ai
  - audio recording
  - useAudioRecorder
  - createAudioRecorder
  - injectAudioRecorder
  - voice input
  - MediaRecorder
---

# Audio Recording

You have a chat or generation UI and you want users to talk instead of type. By
the end of this guide you'll capture microphone audio in the browser with
`useAudioRecorder`, read the latest recording reactively, and send it straight
into a chat message or a transcription request — with no transcoding and no
extra dependencies.

`useAudioRecorder` wraps the browser's `getUserMedia` / `MediaRecorder` and
returns the recorder's native output (`audio/webm` or `audio/mp4`).

## Record audio

Start with a button; end with a working recorder that toggles capture and hands
you the result.

```tsx
import { useAudioRecorder } from '@tanstack/ai-react'

function RecordButton() {
  const { isRecording, isSupported, start, stop } = useAudioRecorder({
    onError: (error) => console.error(error),
  })

  if (!isSupported) return <p>Recording is not supported in this browser.</p>

  return (
    <button onClick={() => (isRecording ? void stop() : void start())}>
      {isRecording ? 'Stop' : 'Record'}
    </button>
  )
}
```

`stop()` resolves to an `AudioRecording`:

| Field        | Type        | Description                                                                  |
| ------------ | ----------- | ---------------------------------------------------------------------------- |
| `part`       | `AudioPart` | Ready-to-use content part: `{ type: 'audio', source: { type: 'data', value, mimeType } }` |
| `base64`     | `string`    | Raw base64 of the recorded bytes                                             |
| `blob`       | `Blob`      | The raw recorded blob                                                        |
| `mimeType`   | `string`    | Native recorder type, e.g. `audio/webm;codecs=opus`                          |
| `durationMs` | `number`    | Recording length in milliseconds                                             |

## Handling errors

Failures reach you through **two** channels — pick one, don't handle both:

- `onError(error)` fires for permission denial and recorder errors.
- `start()` and `stop()` also **reject**. `start()` rejects on permission
  denial; `stop()` rejects on a recorder error or with `Recording cancelled` if
  the recording is cancelled while a stop is in flight (for example when the
  component unmounts mid-recording).

So if you `await start()` / `await stop()`, wrap them in `try`/`catch` rather
than discarding the promise with `void`. The recorder's native `mimeType` may
differ from a requested `mimeType` (browsers ignore unsupported types), so read
`recording.mimeType` if a downstream step requires a specific format.

## Read the latest recording reactively

The same value is also exposed as the reactive `recording` field, so you can
render a preview without capturing `stop()`'s return value yourself. It's `null`
until the first `stop()`:

```tsx
const { recording, isRecording, start, stop } = useAudioRecorder()
// recording is AudioRecording | null
```

> Across frameworks `recording` follows the same shape as the other reactive
> fields: an accessor in Solid (`recording()`), a readonly ref in Vue
> (`recording.value`), a getter in Svelte (`recorder.recording`), and a
> `Signal` in Angular (`recording()`).

## Transform the recording

Pass `onComplete` to turn the raw recording into whatever your app needs — a URL
after upload, an encoded blob, or a custom object. Both `stop()` and the
reactive `recording` field then resolve to your transformed value, and the
transform can be `async`:

```tsx
const { recording, stop } = useAudioRecorder({
  onComplete: async (rec) => {
    const res = await fetch('/api/upload', { method: 'POST', body: rec.blob })
    const { url } = await res.json()
    return url // `recording` and `stop()` now resolve to string
  },
})
```

Return nothing (`undefined`) to keep the raw `AudioRecording`; any returned
value — including `null` — is used as-is and re-types `stop()` and `recording`.
This is similar to the `onResult` transform on the
[generation hooks](./generation-hooks), but is async-capable. (Unlike
`onResult`, where `null` means "keep the previous value," only `undefined` keeps
the raw recording here.)

## Send a recording in chat

The recording's `part` is already a chat content part, so it drops straight into
`sendMessage`:

```tsx
import {
  useAudioRecorder,
  useChat,
  fetchServerSentEvents,
} from '@tanstack/ai-react'

function VoiceComposer() {
  const { isRecording, start, stop } = useAudioRecorder()
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  const toggle = async () => {
    try {
      if (!isRecording) {
        await start()
        return
      }
      const rec = await stop()
      await sendMessage({ content: [rec.part] })
    } catch (error) {
      // start()/stop() reject on permission denial, recorder error, or cancel.
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

## Transcribe a recording

Wrap the recording as a `data:` URL so the provider receives the recorder's
native content type — passing raw `base64` makes the transcription adapter
assume `audio/mpeg` and mislabel the webm/mp4 bytes. See
[Transcription](./transcription) for the matching server route.

```tsx
import {
  useAudioRecorder,
  useTranscription,
  fetchServerSentEvents,
} from '@tanstack/ai-react'

function Transcriber() {
  const { isRecording, start, stop } = useAudioRecorder()
  const { generate, result } = useTranscription({
    connection: fetchServerSentEvents('/api/transcribe'),
  })

  const toggle = async () => {
    try {
      if (!isRecording) {
        await start()
        return
      }
      const rec = await stop()
      // Wrap as a data URL so the provider gets the recorder's real content
      // type. Passing raw base64 makes the transcription adapter assume
      // `audio/mpeg`, which mislabels the native webm/mp4 bytes. Strip the
      // `;codecs=...` parameter for a clean type.
      const mimeType = rec.mimeType.split(';')[0]
      await generate({ audio: `data:${mimeType};base64,${rec.base64}` })
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <div>
      <button onClick={() => void toggle()}>
        {isRecording ? 'Stop' : 'Record'}
      </button>
      {result ? <p>{result.text}</p> : null}
    </div>
  )
}
```

## Other frameworks

The same recorder ships for every framework with idiomatic reactivity. Svelte
uses the `createAudioRecorder` factory; because Svelte 5 runes can't register
automatic teardown, call `cancel()` from your component cleanup if a recording
may still be active:

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

| Framework | Import                  | Function             | Reactive fields                                      |
| --------- | ----------------------- | -------------------- | ---------------------------------------------------- |
| React     | `@tanstack/ai-react`    | `useAudioRecorder`   | `isRecording`, `recording` (values)                  |
| Solid     | `@tanstack/ai-solid`    | `useAudioRecorder`   | `isRecording()`, `recording()` (accessors)           |
| Vue       | `@tanstack/ai-vue`      | `useAudioRecorder`   | `isRecording.value`, `recording.value` (readonly refs) |
| Svelte    | `@tanstack/ai-svelte`   | `createAudioRecorder`| `recorder.isRecording`, `recorder.recording` (getters) |
| Angular   | `@tanstack/ai-angular`  | `injectAudioRecorder`| `isRecording()`, `recording()` (signals; call in an injection context) |

## Hook API

`useAudioRecorder(options?)` — and the `createAudioRecorder` /
`injectAudioRecorder` equivalents — accept:

| Option       | Type                                                | Description                                                                                          |
| ------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `onComplete` | `(recording: AudioRecording) => T \| Promise<T>`    | Optional transform. Its (awaited) return re-types `stop()` and `recording`. Return nothing to keep the raw recording |
| `onError`    | `(error: Error) => void`                            | Called on permission denial or recorder error                                                       |
| `audio`      | `MediaTrackConstraints \| boolean`                  | Passed to `getUserMedia({ audio })`. Defaults to `true`                                             |
| `mimeType`   | `string`                                            | Preferred recorder mime type; falls back to the browser default if unsupported                      |

And return:

| Property      | Type                  | Description                                                          |
| ------------- | --------------------- | ------------------------------------------------------------------- |
| `recording`   | `T \| null`           | Latest recording (transformed if `onComplete` provided), reactive   |
| `isRecording` | `boolean`             | Whether capture is currently active                                 |
| `isSupported` | `boolean`             | Whether the browser supports recording                              |
| `start`       | `() => Promise<void>` | Acquire the mic and begin recording                                 |
| `stop`        | `() => Promise<T>`    | Stop, and resolve with the recording (transformed if applicable)    |
| `cancel`      | `() => void`          | Discard the in-progress recording and release the mic               |

> Reactive shapes (`recording`, `isRecording`) vary per framework — see the
> table in [Other frameworks](#other-frameworks). `T` is `AudioRecording`
> unless an `onComplete` transform changes it.
