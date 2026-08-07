---
title: Audio Recording
id: audio-recording
description: "Record mic audio with useAudioRecorder and send it as a chat part or transcription input."
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

If you need voice input → `useAudioRecorder`. It wraps `getUserMedia` / `MediaRecorder` and returns native output (`audio/webm` or `audio/mp4`).

## 1. Record

```tsx group=audio-recording
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

`stop()` resolves to `AudioRecording`:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `part` | `AudioPart` | Ready chat content part |
| `base64` | `string` | Raw base64 bytes |
| `blob` | `Blob` | Raw recorded blob |
| `mimeType` | `string` | Native type, e.g. `audio/webm;codecs=opus` |
| `durationMs` | `number` | Length in ms |

## 2. Handle errors (pick one channel)

- `onError(error)` — permission denial and recorder errors
- `start()` / `stop()` **reject** — wrap in `try`/`catch` if you `await` them

Do not handle both. Browsers may ignore unsupported `mimeType` — read `recording.mimeType` for the real format.

## 3. Read latest recording reactively

`recording` is `null` until the first `stop()`:

```tsx group=audio-recording
function Preview() {
  const { recording, isRecording, start, stop } = useAudioRecorder()
  // recording is AudioRecording | null
}
```

Reactive shape by framework: Solid `recording()`, Vue `recording.value`, Svelte `recorder.recording`, Angular `recording()` (signal).

## 4. Transform on complete

`onComplete` re-types `stop()` and `recording`. Return `undefined` to keep the raw recording; any other return (including `null`) is used as-is:

```tsx group=audio-recording
function Uploader() {
  const { recording, stop } = useAudioRecorder({
    onComplete: async (rec) => {
      const res = await fetch('/api/upload', { method: 'POST', body: rec.blob })
      const { url } = await res.json()
      return url // string
    },
  })
}
```

Unlike generation-hook `onResult`, only `undefined` keeps the raw value here. See [Generation Hooks](./generation-hooks).

## 5. Send in chat

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

## 6. Transcribe

Wrap as a `data:` URL so the provider gets the real mime type. Raw base64 is assumed `audio/mpeg`. Server route: [Transcription](./transcription).

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

Svelte: call `cancel()` on cleanup if a recording may still be active.

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

| Framework | Import | Function | Reactive fields |
| --------- | ------ | -------- | --------------- |
| React | `@tanstack/ai-react` | `useAudioRecorder` | values |
| Solid | `@tanstack/ai-solid` | `useAudioRecorder` | accessors `()` |
| Vue | `@tanstack/ai-vue` | `useAudioRecorder` | `.value` refs |
| Svelte | `@tanstack/ai-svelte` | `createAudioRecorder` | getters on instance |
| Angular | `@tanstack/ai-angular` | `injectAudioRecorder` | signals `()` |

## Hook API

**Options**

| Option | Type | Description |
| ------ | ---- | ----------- |
| `onComplete` | `(recording) => T \| Promise<T>` | Transform; re-types `stop()` / `recording` |
| `onError` | `(error: Error) => void` | Permission / recorder errors |
| `audio` | `MediaTrackConstraints \| boolean` | Passed to `getUserMedia` (default `true`) |
| `mimeType` | `string` | Preferred type; falls back if unsupported |

**Returns**

| Property | Type | Description |
| -------- | ---- | ----------- |
| `recording` | `T \| null` | Latest recording (transformed if applicable) |
| `isRecording` | `boolean` | Capture active |
| `isSupported` | `boolean` | Browser support |
| `start` | `() => Promise<void>` | Acquire mic, begin |
| `stop` | `() => Promise<T>` | Stop; resolve with recording |
| `cancel` | `() => void` | Discard in-progress recording |
