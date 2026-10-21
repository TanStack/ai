---
title: ElevenLabs
id: elevenlabs-adapter
order: 9
description: "Use ElevenLabs in TanStack AI with @tanstack/ai-elevenlabs: realtime voice agents, text-to-speech, music and sound effects, transcription, and voice design."
keywords:
  - tanstack ai
  - elevenlabs
  - realtime voice ai
  - conversational ai
  - voice chat
  - voice agents
  - adapter
---

ElevenLabs gives you voice: realtime voice agents, text-to-speech, music and sound effects, transcription, and voice design. It has no text chat. For `chat()` and `summarize()`, use a text adapter such as [OpenAI](./openai) or [Anthropic](./anthropic).

The quick setup below builds a live voice conversation with an ElevenLabs agent.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-client @tanstack/ai-elevenlabs
vue: @tanstack/ai @tanstack/ai-client @tanstack/ai-elevenlabs
solid: @tanstack/ai @tanstack/ai-client @tanstack/ai-elevenlabs
svelte: @tanstack/ai @tanstack/ai-client @tanstack/ai-elevenlabs
preact: @tanstack/ai @tanstack/ai-client @tanstack/ai-elevenlabs
angular: @tanstack/ai @tanstack/ai-client @tanstack/ai-elevenlabs
vanilla: @tanstack/ai @tanstack/ai-client @tanstack/ai-elevenlabs
octane: @tanstack/ai @tanstack/ai-client @tanstack/ai-elevenlabs

<!-- ::end:tabs -->

`@tanstack/ai` and `@tanstack/ai-client` are peer dependencies of the adapter. Step 4 also uses the React package, `@tanstack/ai-react`.

## 2. Set the API key and the agent

1. Get an API key from the [ElevenLabs dashboard](https://elevenlabs.io/).
2. In the **Conversational AI** section of the dashboard, create an agent. Set its voice, personality, knowledge, and tools there.
3. Put both values in the environment of your server:

```bash
ELEVENLABS_API_KEY=your-elevenlabs-api-key
ELEVENLABS_AGENT_ID=your-agent-id
```

All adapters read `ELEVENLABS_API_KEY`. If you pass `agentId` in code, `ELEVENLABS_AGENT_ID` is optional.

## 3. Create a voice token on the server

The browser must not see your API key. So the server makes a signed WebSocket URL, and the browser connects with it. The URL is valid for 30 minutes.

```typescript
import { realtimeToken } from "@tanstack/ai";
import { elevenlabsRealtimeToken } from "@tanstack/ai-elevenlabs";

export async function POST() {
  const token = await realtimeToken({
    adapter: elevenlabsRealtimeToken({
      agentId: process.env.ELEVENLABS_AGENT_ID!,
    }),
  });

  return Response.json(token);
}
```

Serve this handler at `/api/realtime-token`.

## 4. Talk to the agent

`useRealtimeChat` gets the token, opens the microphone, and plays the voice of the agent:

```tsx
import { useRealtimeChat } from "@tanstack/ai-react";
import { elevenlabsRealtime } from "@tanstack/ai-elevenlabs";

export function VoiceChat() {
  const { status, messages, connect, disconnect, pendingAssistantTranscript } =
    useRealtimeChat({
      getToken: () =>
        fetch("/api/realtime-token", { method: "POST" }).then((r) => r.json()),
      adapter: elevenlabsRealtime(),
    });

  return (
    <div>
      <button onClick={status === "idle" ? connect : disconnect}>
        {status === "idle" ? "Start conversation" : "End conversation"}
      </button>
      {messages.map((message) => (
        <p key={message.id}>
          <strong>{message.role}: </strong>
          {message.parts.map((part, index) => (
            <span key={index}>
              {part.type === "text" ? part.content : null}
              {part.type === "audio" ? part.transcript : null}
            </span>
          ))}
        </p>
      ))}
      {pendingAssistantTranscript && <p>AI: {pendingAssistantTranscript}...</p>}
    </div>
  );
}
```

Click **Start conversation** and speak. The agent answers out loud, and the transcript shows up below the button. For the other frameworks and for the full realtime API, see [Realtime Voice Chat](../media/realtime-chat).

## Client tools

The agent can call tools that run in the browser. Define them with `toolDefinition()` and pass them to the hook:

```typescript
import { toolDefinition } from "@tanstack/ai";
import { useRealtimeChat } from "@tanstack/ai-react";
import { elevenlabsRealtime } from "@tanstack/ai-elevenlabs";
import { z } from "zod";

const getWeatherDef = toolDefinition({
  name: "getWeather",
  description: "Get weather for a location",
  inputSchema: z.object({
    location: z.string(),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    conditions: z.string(),
  }),
});

const getWeather = getWeatherDef.client(async ({ location }) => {
  const res = await fetch(`/api/weather?location=${location}`);
  return res.json();
});

export function useWeatherVoiceChat() {
  return useRealtimeChat({
    getToken: () =>
      fetch("/api/realtime-token", { method: "POST" }).then((r) => r.json()),
    adapter: elevenlabsRealtime(),
    tools: [getWeather],
  });
}
```

The adapter turns each result into a string and sends it to the agent.

## Text-to-speech

`elevenlabsSpeech` makes one audio clip from text. `voice` is an ElevenLabs voice id:

```typescript
import { generateSpeech } from "@tanstack/ai";
import { elevenlabsSpeech } from "@tanstack/ai-elevenlabs";

const result = await generateSpeech({
  adapter: elevenlabsSpeech("eleven_v4"),
  text: "Hello from ElevenLabs!",
  voice: "21m00Tcm4TlvDq8ikWAM",
  format: "mp3",
});

console.log(result.audio); // Base64-encoded audio
```

- `format` takes `mp3` (the default), `pcm`, `opus`, or `wav`. The adapter throws for `aac` and `flac` before it calls the API.
- For a dialogue with several voices, or for timings, see [Dialogue and timings](#dialogue-and-timings).

See [Text-to-Speech](../media/text-to-speech).

## Music and sound effects

`elevenlabsAudio` makes music or a sound effect. The model picks which one:

```typescript
import { generateAudio } from "@tanstack/ai";
import { elevenlabsAudio } from "@tanstack/ai-elevenlabs";

const music = await generateAudio({
  adapter: elevenlabsAudio("music_v2_5"),
  prompt: "An upbeat synthwave track for a product launch",
});

const sfx = await generateAudio({
  adapter: elevenlabsAudio("eleven_text_to_sound_v2"),
  prompt: "A glass shattering on concrete",
});

console.log(music.audio, sfx.audio);
```

See [Audio Generation](../media/audio-generation).

## Transcription

```typescript
import { generateTranscription } from "@tanstack/ai";
import { elevenlabsTranscription } from "@tanstack/ai-elevenlabs";

const result = await generateTranscription({
  adapter: elevenlabsTranscription("scribe_v2"),
  audio: "https://example.com/recording.mp3",
});

console.log(result.text);
```

See [Transcription](../media/transcription).

## Voice design

`elevenlabsVoiceDesign` makes a new voice from a description. Use the voice id that it returns in `generateSpeech()`:

```typescript
import { generateVoice } from "@tanstack/ai";
import { elevenlabsVoiceDesign } from "@tanstack/ai-elevenlabs";

const result = await generateVoice({
  adapter: elevenlabsVoiceDesign("eleven_ttv_v3"),
  prompt: "A warm, gravelly narrator in his sixties with a slight Irish lilt",
  name: "Irish Narrator",
});

const [voice] = result.voices;
if (!voice) throw new Error("The provider returned no voices.");

console.log(voice.voiceId);
console.log(voice.saved); // true, because a name was given
```

- Without a `name`, you get preview voices to listen to.
- With a `name`, ElevenLabs keeps the best voice in your voice library.

For reference audio and the other options, see [Voice Creation](../media/voice-creation).

## Models and options

| Activity | Factory | Models |
| --- | --- | --- |
| Text-to-speech | `elevenlabsSpeech` | `eleven_v4`, `eleven_v4_turbo`, `eleven_v3`, `eleven_v3_conversational`, `eleven_multilingual_v2`, `eleven_flash_v2_5`, `eleven_flash_v2` |
| Music | `elevenlabsAudio` | `music_v2_5`, `music_v2` |
| Sound effects | `elevenlabsAudio` | `eleven_text_to_sound_v2` |
| Transcription | `elevenlabsTranscription` | `scribe_v2`, `scribe_v2_medical` |
| Voice design | `elevenlabsVoiceDesign` | `eleven_ttv_v3`, `eleven_multilingual_ttv_v2` |

The adapter also accepts the deprecated ids `eleven_turbo_v2`, `eleven_turbo_v2_5`, `eleven_monolingual_v1`, `scribe_v1`, and `music_v1`. Use the newest model in the same row.

The package exports the lists as `ELEVENLABS_TTS_MODELS`, `ELEVENLABS_AUDIO_MODELS`, `ELEVENLABS_TRANSCRIPTION_MODELS`, and `ELEVENLABS_VOICE_MODELS`.

## Advanced

### Agent overrides

To change the agent for one session, set `overrides` when you make the token. Your dashboard settings do not change:

```typescript
import { realtimeToken } from "@tanstack/ai";
import { elevenlabsRealtimeToken } from "@tanstack/ai-elevenlabs";

const token = await realtimeToken({
  adapter: elevenlabsRealtimeToken({
    agentId: process.env.ELEVENLABS_AGENT_ID!,
    overrides: {
      voiceId: "custom-voice-id",
      systemPrompt: "You are a helpful voice assistant.",
      firstMessage: "Hello! How can I help you today?",
      language: "en",
    },
  }),
});

console.log(token.expiresAt);
```

| Option | Type | Description |
| --- | --- | --- |
| `agentId` | `string` | The agent id from the dashboard. If you do not set it, the adapter reads `ELEVENLABS_AGENT_ID`. |
| `overrides.voiceId` | `string` | A voice id that replaces the default voice of the agent. |
| `overrides.systemPrompt` | `string` | A system prompt that replaces the default prompt of the agent. |
| `overrides.firstMessage` | `string` | The first thing the agent says when the session starts. |
| `overrides.language` | `string` | A language code, for example `"en"`, `"es"`, or `"fr"`. |

### Client adapter options

`elevenlabsRealtime(options?)` runs in the browser:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `connectionMode` | `"websocket"` or `"webrtc"` | auto-detect | The transport of the connection. |
| `debug` | `boolean` or `DebugConfig` | `false` | Debug logs. `true` turns on all categories. A `DebugConfig` selects categories or a sink. |

### Without React

Use `RealtimeClient` from `@tanstack/ai-client`:

```typescript
import { RealtimeClient } from "@tanstack/ai-client";
import { elevenlabsRealtime } from "@tanstack/ai-elevenlabs";

const client = new RealtimeClient({
  getToken: () =>
    fetch("/api/realtime-token", { method: "POST" }).then((r) => r.json()),
  adapter: elevenlabsRealtime(),
  onMessage: (message) => {
    console.log(`${message.role}:`, message.parts);
  },
  onStatusChange: (status) => {
    console.log("Status:", status);
  },
  onModeChange: (mode) => {
    console.log("Mode:", mode);
  },
});

await client.connect();
```

### Audio levels for a visualizer

The hook gives you the audio data of the microphone and the speaker:

```typescript
import { useRealtimeChat } from "@tanstack/ai-react";
import { elevenlabsRealtime } from "@tanstack/ai-elevenlabs";

export function useVoiceLevels() {
  const {
    inputLevel, // 0 to 1, microphone volume
    outputLevel, // 0 to 1, speaker volume
    getInputFrequencyData, // Uint8Array frequency spectrum
    getOutputFrequencyData,
  } = useRealtimeChat({
    getToken: () =>
      fetch("/api/realtime-token", { method: "POST" }).then((r) => r.json()),
    adapter: elevenlabsRealtime(),
  });

  return { inputLevel, outputLevel, getInputFrequencyData, getOutputFrequencyData };
}
```

ElevenLabs gives volume levels and frequency data, but no time-domain data. `getInputTimeDomainData()` and `getOutputTimeDomainData()` return fixed placeholder arrays. The default sample rate is 16 kHz.

### ElevenLabs and OpenAI realtime

| | ElevenLabs | OpenAI |
|---|---|---|
| Configuration | Agent-based. Set voice, personality, and knowledge in the dashboard, or with `overrides` on the token. | Session-based. Set `instructions`, `voice`, and more for each session in the `useRealtimeChat` options. |
| Token | Signed WebSocket URL, valid for 30 minutes | Ephemeral API token, valid for about 10 minutes |
| Transport | WebSocket (default) or WebRTC | WebRTC |
| Audio | The `@elevenlabs/client` SDK records and plays the audio | TanStack AI runs the WebRTC connection and the audio tracks |
| Voice activity detection | ElevenLabs does it on its server | `server`, `semantic`, and `manual` modes |
| Session changes | Fixed when the session starts | `updateSession()` changes the session while it runs |
| Image input | Not supported | `sendImage()` |
| Time-domain data | Not available | Available for waveforms |

### Dialogue and timings

ElevenLabs has a dialogue endpoint that takes up to 10 different voices. Each endpoint also has a version with timestamps. `turns` and `timestamps` pick the endpoint for you:

```typescript
import { generateSpeech } from "@tanstack/ai";
import { elevenlabsSpeech } from "@tanstack/ai-elevenlabs";

const result = await generateSpeech({
  adapter: elevenlabsSpeech("eleven_v4"),
  turns: [
    { text: "Knock knock.", voice: "bYTqZQo3Jz7LQtmGTgwi" },
    { text: "Who is there?", voice: "6lCwbsX1yVjD49QmpkTR" },
  ],
  timestamps: true,
});

// Character timings for the whole clip.
console.log(result.alignment?.unit); // "character"

// One entry per turn, with the voice that spoke it.
for (const segment of result.segments ?? []) {
  console.log(segment.turnIndex, segment.voice, segment.text);
}
```

Only the dialogue endpoint returns `segments`. A request with one voice and `timestamps: true` returns `alignment` only.

### Speech output format

- `wav` output is 44.1 kHz, 16-bit mono PCM with a RIFF header.
- `modelOptions.outputFormat` overrides `format`. The adapter then returns the format of ElevenLabs as it is, with no WAV header.

### List voices

`elevenlabsSpeech` reads the voices of your account. This includes the voices that `generateVoice()` saved:

```typescript
import { listVoices } from "@tanstack/ai";
import { elevenlabsSpeech } from "@tanstack/ai-elevenlabs";

const { voices } = await listVoices({
  adapter: elevenlabsSpeech("eleven_v4"),
  origins: ["generated", "cloned"],
});

console.log(voices.length);
```

`GET /v1/voices` has no origin filter, so the adapter gets all voices and filters them in memory. The `famous` and `high_quality` categories both come back as `professional`.

### Behind a proxy

To send each request through a gateway, such as Cloudflare AI Gateway or a company proxy, set `baseURL` and `defaultHeaders`. All TanStack AI adapters use these two option names, so one gateway configuration works for all of them.

```typescript
import { createElevenLabsSpeech } from "@tanstack/ai-elevenlabs";

const adapter = createElevenLabsSpeech("eleven_v4", process.env.ELEVENLABS_API_KEY!, {
  baseURL: "https://gateway.example.com/elevenlabs",
  defaultHeaders: { "cf-aig-authorization": `Bearer ${process.env.GATEWAY_TOKEN}` },
});
```

- This works for the speech, audio, transcription, and voice design adapters.
- `baseUrl` and `headers` are aliases. If you set both forms, `baseURL` and `defaultHeaders` win.

### Limits

- Realtime does not take images during a conversation.
- Realtime fixes the session configuration when the connection starts.
- Realtime needs an agent that you made in the ElevenLabs dashboard.

### API reference

| Factory | Use it with |
| --- | --- |
| `elevenlabsRealtimeToken(options)` | `realtimeToken()` on the server. Returns a `RealtimeTokenAdapter`. |
| `elevenlabsRealtime(options?)` | `useRealtimeChat()` or `RealtimeClient` in the browser. Returns a `RealtimeAdapter`. |
| `elevenlabsSpeech(model, config?)` / `createElevenLabsSpeech(model, apiKey, config?)` | `generateSpeech()` and `listVoices()` |
| `elevenlabsAudio(model, config?)` / `createElevenLabsAudio(model, apiKey, config?)` | `generateAudio()`, for music and sound effects |
| `elevenlabsTranscription(model, config?)` / `createElevenLabsTranscription(model, apiKey, config?)` | `generateTranscription()` |
| `elevenlabsVoiceDesign(model, config?)` / `createElevenLabsVoiceDesign(model, apiKey, config?)` | `generateVoice()` |

The short factories read `ELEVENLABS_API_KEY`. The `create*` factories take an explicit API key.
