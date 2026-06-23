---
title: Audio Recording
---

`useAudioRecorder` records an audio message in the browser and hands you a
ready-to-use audio content part. Drop it into a chat message, or feed it to the
generation hooks as a prompt input. It returns the recorder's native output
(`audio/webm` or `audio/mp4`) — no transcoding, no extra dependencies.

## Recording

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

The resolved recording has:

- `part` — an audio content part: `{ type: 'audio', source: { type: 'data', value, mimeType } }`
- `base64` — the raw base64 bytes
- `blob`, `mimeType`, `durationMs`

The same value is also available reactively as `content` — see [Reactive content](#reactive-content) below.

## Reactive content

`content` holds the latest resolved recording (or `null` before the first
`stop()`). Read it directly without awaiting `stop()`:

```tsx
const { content, isRecording, start, stop } = useAudioRecorder()
// content is AudioRecording | null — the latest recording
```

In other frameworks `content` follows the same reactivity shape as the other
fields: an accessor in Solid (`content()`), a readonly ref in Vue
(`content.value`), a getter in Svelte (`recorder.content`), and a `Signal` in
Angular (`content()`).

## Transforming the recording

Pass `onComplete` to convert the recording into any value. `stop()` resolves to
the transformed value, and `content` reflects it too:

```tsx
const { content, stop } = useAudioRecorder({
  onComplete: async (recording) => {
    const res = await fetch('/api/upload', { method: 'POST', body: recording.blob })
    const { url } = await res.json()
    return url // content and stop() now resolve to string
  },
})
```

Without `onComplete` you get the raw `AudioRecording` from both `stop()` and
`content`.

## Sending a recording in chat

```tsx
import { useAudioRecorder, useChat, fetchServerSentEvents } from '@tanstack/ai-react'

function VoiceComposer() {
  const { isRecording, start, stop } = useAudioRecorder()
  const { sendMessage, messages } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  const toggle = async () => {
    if (!isRecording) {
      await start()
      return
    }
    const recording = await stop()
    await sendMessage({ content: [recording.part] })
  }

  return <button onClick={() => void toggle()}>{isRecording ? 'Send' : 'Record'}</button>
}
```

## Transcribing a recording

```tsx
import { useAudioRecorder, useTranscription, fetchServerSentEvents } from '@tanstack/ai-react'

function Transcriber() {
  const { isRecording, start, stop } = useAudioRecorder()
  const { generate, result } = useTranscription({
    connection: fetchServerSentEvents('/api/transcribe'),
  })

  const toggle = async () => {
    if (!isRecording) {
      await start()
      return
    }
    const recording = await stop()
    await generate({ audio: recording.base64 })
  }

  return (
    <div>
      <button onClick={() => void toggle()}>{isRecording ? 'Stop' : 'Record'}</button>
      {result ? <p>{result.text}</p> : null}
    </div>
  )
}
```

## Svelte

Svelte uses the `createAudioRecorder` factory. Because Svelte 5 runes can't
register automatic teardown, call `cancel()` from your component cleanup if a
recording may still be active.

```svelte
<script lang="ts">
  import { createAudioRecorder, createChat, fetchServerSentEvents } from '@tanstack/ai-svelte'

  const recorder = createAudioRecorder()
  const chat = createChat({ connection: fetchServerSentEvents('/api/chat') })

  async function toggle() {
    if (!recorder.isRecording) {
      await recorder.start()
      return
    }
    const recording = await recorder.stop()
    await chat.sendMessage({ content: [recording.part] })
  }
</script>

<button onclick={toggle}>{recorder.isRecording ? 'Send' : 'Record'}</button>
```

Solid (`useAudioRecorder`, `isRecording()` is an accessor), Vue
(`useAudioRecorder`, `isRecording` is a ref), and Angular
(`injectAudioRecorder`, `isRecording` is a `Signal<boolean>`, must be called in
an injection context) expose the same API with framework-idiomatic reactivity.
