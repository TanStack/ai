---
title: fal.ai
id: fal-adapter
description: "Use fal.ai in TanStack AI with @tanstack/ai-fal: 600+ hosted models for images, video, live video, speech, transcription, music, and sound effects."
keywords:
  - tanstack ai
  - fal.ai
  - fal
  - image generation
  - video generation
  - flux
  - nano banana
  - adapter
---

fal.ai gives you 600+ hosted media models behind one key: images, video, live video, speech, transcription, music, and sound effects. It has no text chat and no tools. For `chat()`, use a text adapter such as [OpenAI](./openai) or [Anthropic](./anthropic).

The quick setup below generates an image on your server and shows it in React. For a full app, see the [media example](https://github.com/TanStack/ai/tree/main/examples/ts-react-media).

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-fal
vue: @tanstack/ai-fal
solid: @tanstack/ai-fal
svelte: @tanstack/ai-fal
preact: @tanstack/ai-fal
angular: @tanstack/ai-fal
vanilla: @tanstack/ai-fal
octane: @tanstack/ai-fal

<!-- ::end:tabs -->

## 2. Set the API key

Create a key at [fal.ai](https://fal.ai). Put it in the environment of your server:

```bash
FAL_KEY=your-fal-api-key
```

All fal adapters read `FAL_KEY`. To pass the key in code, set `apiKey` in the config:

```typescript
import { falImage } from "@tanstack/ai-fal";

const adapter = falImage("fal-ai/nano-banana-pro", {
  apiKey: process.env.FAL_KEY!,
});
```

## 3. Generate an image on the server

Add a `POST` route at `/api/generate/image`:

```typescript
import {
  generateImage,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { falImage } from "@tanstack/ai-fal";

export async function POST(request: Request) {
  const { input } = await generationParamsFromRequest("image", request);
  if (typeof input.prompt !== "string") {
    return new Response("Send a text prompt.", { status: 400 });
  }

  const stream = generateImage({
    adapter: falImage("fal-ai/nano-banana-pro"),
    prompt: input.prompt,
    stream: true,
  });

  return toServerSentEventsResponse(stream);
}
```

## 4. Show the image

```tsx
import { fetchServerSentEvents, useGenerateImage } from "@tanstack/ai-react";

export function ImageGenerator() {
  const { generate, result, isLoading, error } = useGenerateImage({
    connection: fetchServerSentEvents("/api/generate/image"),
  });

  return (
    <div>
      <button
        onClick={() => generate({ prompt: "A futuristic cityscape at sunset" })}
        disabled={isLoading}
      >
        {isLoading ? "Generating..." : "Generate"}
      </button>
      {error && <p role="alert">{error.message}</p>}
      {result?.images.map((image, index) => (
        <img
          key={index}
          src={image.url || `data:image/png;base64,${image.b64Json}`}
          alt="Generated image"
        />
      ))}
    </div>
  );
}
```

Click the button. The image shows up below it. For the other frameworks, see [Generation Hooks](../media/generation-hooks).

## Model options

Each fal model has its own options. Write the model id as a string literal, and TypeScript completes `size` and `modelOptions` for that model:

```typescript
import { generateImage } from "@tanstack/ai";
import { falImage } from "@tanstack/ai-fal";

const result = await generateImage({
  adapter: falImage("fal-ai/z-image/turbo"),
  prompt: "A serene mountain landscape",
  numberOfImages: 1,
  size: "landscape_16_9",
  modelOptions: {
    acceleration: "high",
    enable_prompt_expansion: true,
  },
});

console.log(result.images);
```

- Pass the id directly, not through a `string` variable. A variable loses the types of the model.
- Any string works as a model id. A model that is newer than the fal SDK types runs, but has no autocomplete.

For the `size` formats, see [Image sizes](#image-sizes).

## Video

> Video generation is an [experimental feature](../media/video-generation).

Video runs as a job. `generateVideo()` starts the job, and `getVideoJobStatus()` reads its status:

```typescript
import { generateVideo, getVideoJobStatus } from "@tanstack/ai";
import { falVideo } from "@tanstack/ai-fal";

const adapter = falVideo("fal-ai/kling-video/v2.6/pro/text-to-video");

const job = await generateVideo({
  adapter,
  prompt: "A timelapse of a flower blooming",
  size: "16:9",
  duration: "5",
});

const status = await getVideoJobStatus({
  adapter,
  jobId: job.jobId,
});

console.log(status.status); // "pending" | "processing" | "completed"
```

To animate an image, use an image-to-video model and set the start image in `modelOptions`:

```typescript
import { generateVideo } from "@tanstack/ai";
import { falVideo } from "@tanstack/ai-fal";

const job = await generateVideo({
  adapter: falVideo("fal-ai/kling-video/v2.6/pro/image-to-video"),
  prompt: "Animate this scene with gentle wind",
  duration: "5",
  modelOptions: {
    start_image_url: "https://example.com/image.jpg",
    generate_audio: true,
  },
});

console.log(job.jobId);
```

The `duration` values of each model are in [Video durations](#video-durations). To poll from a React component, see [Video Generation](../media/video-generation).

## Live video

`falLiveVideo("minimax/h3-max/director")` starts a live video stream that you can steer. The browser connects through a proxy on your server. See [Live Generation](../media/live-generation#fal-h3-max-director).

## Speech

`falSpeech` gets the audio from the fal CDN and returns it as base64:

```typescript
import { generateSpeech } from "@tanstack/ai";
import { falSpeech } from "@tanstack/ai-fal";

const result = await generateSpeech({
  adapter: falSpeech("fal-ai/gemini-3.1-flash-tts"),
  text: "[warm, enthusiastic] Welcome to TanStack AI! [pause] Let's build something great.",
  voice: "Kore",
});

console.log(result.format, result.contentType);
```

`fal-ai/gemini-3.1-flash-tts` is the TTS model of Google. It supports 80+ languages. You can put speaker tags and style tags, such as `[pause]`, in the text. Its `modelOptions` have no autocomplete yet.

Other models put the voice in `modelOptions`:

```typescript
import { generateSpeech } from "@tanstack/ai";
import { falSpeech } from "@tanstack/ai-fal";

const result = await generateSpeech({
  adapter: falSpeech("fal-ai/elevenlabs/tts/eleven-v3"),
  text: "Welcome to TanStack AI.",
  modelOptions: {
    voice: "Rachel",
    stability: 0.5,
  },
});

console.log(result.audio); // Base64-encoded audio
```

See [Text-to-Speech](../media/text-to-speech).

## Transcription

```typescript
import { generateTranscription } from "@tanstack/ai";
import { falTranscription } from "@tanstack/ai-fal";

const result = await generateTranscription({
  adapter: falTranscription("fal-ai/whisper"),
  audio: "https://example.com/recording.mp3",
  language: "en",
});

console.log(result.text);
console.log(result.language);

// When the model returns timestamps, they are in result.segments
for (const segment of result.segments ?? []) {
  console.log(`[${segment.start}s to ${segment.end}s] ${segment.text}`);
}
```

`audio` takes a URL string, a `Blob`, a `File`, or an `ArrayBuffer`. The adapter wraps an `ArrayBuffer` in a `Blob` for the upload.

## Music and sound effects

`falAudio` returns a URL in `result.audio.url`. If you need the bytes, fetch the URL:

```typescript
import { generateAudio } from "@tanstack/ai";
import { falAudio } from "@tanstack/ai-fal";

const music = await generateAudio({
  adapter: falAudio("fal-ai/minimax-music/v2.6"),
  prompt: "City Pop, 80s retro, groovy synth bass, warm female vocal, 104 BPM, nostalgic urban night",
});

const sfx = await generateAudio({
  adapter: falAudio("fal-ai/elevenlabs/sound-effects/v2"),
  prompt: "Thunderclap with rain",
  duration: 5,
});

console.log(music.audio.url, sfx.audio.url);
```

Some music models take lyrics in `modelOptions`:

```typescript
import { generateAudio } from "@tanstack/ai";
import { falAudio } from "@tanstack/ai-fal";

const song = await generateAudio({
  adapter: falAudio("fal-ai/diffrhythm"),
  prompt: "An upbeat electronic track with synths",
  modelOptions: {
    lyrics: "[verse]\nHello world\n[chorus]\nLa la la",
  },
});

console.log(song.audio.url);
```

See [Audio Generation](../media/audio-generation).

## Files

`falFiles` uploads media to fal storage, so a request can point to the file by URL. fal storage is upload-only. See [Files API](../advanced/files-api).

## Models and options

fal has hundreds of models. These are popular picks. Any fal model id works.

### Image models

| Model | Description |
|-------|-------------|
| `fal-ai/nano-banana-pro` | Fast, high-quality images, up to 4K |
| `fal-ai/flux-2/klein/9b` | Realistic images, clear text |
| `fal-ai/z-image/turbo` | A very fast 6B-parameter model |
| `xai/grok-imagine-image` | xAI images with prompt enhancement |

### Video models

| Model | Mode | Description |
|-------|------|-------------|
| `fal-ai/kling-video/v2.6/pro/text-to-video` | Text-to-video | High-quality text-to-video |
| `fal-ai/kling-video/v2.6/pro/image-to-video` | Image-to-video | Animate images with Kling |
| `fal-ai/veo3.1` | Text-to-video | Google Veo text-to-video |
| `fal-ai/veo3.1/image-to-video` | Image-to-video | Google Veo image-to-video |
| `xai/grok-imagine-video/text-to-video` | Text-to-video | xAI video from text |
| `xai/grok-imagine-video/image-to-video` | Image-to-video | xAI video from an image |
| `fal-ai/ltx-2/text-to-video/fast` | Text-to-video | Fast text-to-video |
| `fal-ai/ltx-2/image-to-video/fast` | Image-to-video | Fast image-to-video |

### Live models

| Model | Description |
|-------|-------------|
| `minimax/h3-max/director` | A live stream that you can steer. Use `falLiveVideo()` with `generateLiveVideo()`. |

### Text-to-speech models

| Model | Description |
|-------|-------------|
| `fal-ai/gemini-3.1-flash-tts` | Google TTS with 80+ languages and style tags |
| `fal-ai/elevenlabs/tts/eleven-v3` | ElevenLabs v3, expressive, several voices |
| `fal-ai/elevenlabs/tts/turbo-v2.5` | ElevenLabs, low latency |
| `fal-ai/minimax/speech-2.6-hd` | MiniMax HD speech |
| `fal-ai/minimax/speech-2.6-turbo` | MiniMax, low latency |
| `fal-ai/kokoro/american-english` | Kokoro. Also `british-english`, `french`, `spanish`, `italian`, `japanese`, `mandarin-chinese`, `hindi`, `brazilian-portuguese` |
| `fal-ai/inworld-tts` | Inworld TTS-1.5 Max |
| `fal-ai/chatterbox/text-to-speech/multilingual` | Chatterbox, many languages |
| `fal-ai/dia-tts` | Dia, expressive dialogue |
| `fal-ai/orpheus-tts` | Orpheus, open source |
| `fal-ai/f5-tts` | F5-TTS, voice cloning |
| `fal-ai/vibevoice/7b` | VibeVoice 7B, conversation |

### Transcription models

| Model | Description |
|-------|-------------|
| `fal-ai/whisper` | OpenAI Whisper on fal |
| `fal-ai/wizper` | A faster Whisper with word timestamps |
| `fal-ai/speech-to-text/turbo` | Fast speech-to-text with speaker labels |
| `fal-ai/elevenlabs/speech-to-text` | ElevenLabs speech-to-text |

### Music and audio models

| Model | Mode | Description |
|-------|------|-------------|
| `fal-ai/minimax-music/v2.6` | Music | MiniMax Music 2.6, vocals and instruments from a prompt |
| `fal-ai/minimax-music/v2.5` | Music | MiniMax Music 2.5 |
| `fal-ai/minimax-music/v2` | Music | MiniMax Music v2, takes `lyrics_prompt` |
| `fal-ai/diffrhythm` | Music | DiffRhythm, prompt and lyrics |
| `fal-ai/lyria2` | Music | Google Lyria 2 |
| `fal-ai/stable-audio-25/text-to-audio` | Music or audio | Stability AI Stable Audio 2.5 |
| `fal-ai/mmaudio-v2/text-to-audio` | Audio | MMAudio v2 |
| `fal-ai/elevenlabs/sound-effects/v2` | Sound effects | ElevenLabs sound effects |
| `fal-ai/beatoven/sound-effect-generation` | Sound effects | Beatoven sound effects |
| `fal-ai/thinksound` | Audio | Thinksound audio |

Some very new models, for example `fal-ai/gemini-3.1-flash-tts`, `fal-ai/minimax-music/v2.6`, and `fal-ai/beatoven/sound-effect-generation`, are not in the type map of `@fal-ai/client` yet. They work as plain string ids, with no autocomplete for `modelOptions`.

## Advanced

### Image sizes

`size` maps to `image_size`, or to `aspect_ratio` and `resolution`:

| Form | `size` | Sent to fal as |
|--------|---------|---------|
| Named | `"landscape_16_9"` | `image_size: "landscape_16_9"` |
| Width x height | `"1536x1024"` | `image_size: "1536x1024"` |
| Ratio and resolution | `"16:9_4K"` | `aspect_ratio: "16:9"`, `resolution: "4K"` |
| Ratio only | `"16:9"` | `aspect_ratio: "16:9"` |

Named sizes change by model.

### Video durations

`duration` gets its type for each model from the `EndpointTypeMap` of `@fal-ai/client`. Popular models also have `availableDurations()` and `snapDuration()`, for a UI slider:

| Model | `duration` type | `availableDurations()` |
| --- | --- | --- |
| `fal-ai/kling-video/v1.6/{standard,pro}/text-to-video`, `fal-ai/kling-video/v2.6/pro/{text,image}-to-video` | `"5"` or `"10"` | discrete |
| `fal-ai/kling-video/v3/pro/{text,image}-to-video` | `"3"` to `"15"` | discrete |
| `fal-ai/pika/v2.2/text-to-video` | `"5"` or `"10"` | discrete |
| `fal-ai/ltx-2.3/{text,image}-to-video` (and `/fast`) | `"6"`, `"8"`, or `"10"` | discrete |
| `fal-ai/luma-dream-machine/ray-2` | `"5s"` or `"9s"` | discrete |
| `fal-ai/veo3.1`, `fal-ai/veo3.1/fast` (and `/image-to-video`), `fal-ai/veo3` (and `/image-to-video`) | `"4s"`, `"6s"`, or `"8s"` | discrete |
| `fal-ai/wan-25-preview/text-to-video` | `"2"` to `"15"` | discrete |
| `fal-ai/minimax/video-01` | not accepted | `{ kind: "none" }` |
| `fal-ai/hunyuan-video-v1.5/text-to-video` | not accepted (uses `num_frames`) | `{ kind: "none" }` |

```typescript
import { generateVideo } from "@tanstack/ai";
import { falVideo } from "@tanstack/ai-fal";

const adapter = falVideo("fal-ai/veo3.1");
adapter.availableDurations(); // { kind: "discrete", values: ["4s", "6s", "8s"] }
adapter.snapDuration(7); // "6s"

await generateVideo({
  adapter,
  prompt: "A timelapse of a city skyline at dusk",
  duration: adapter.snapDuration(7),
});
```

Other models still get the `duration` type from the SDK when the endpoint has the field. For these models, `availableDurations()` returns `{ kind: "none" }`.

### Configuration

Each factory takes an optional `FalClientConfig`:

- `apiKey`: your fal key. If you do not set a config, the adapter reads `FAL_KEY`.
- `proxyUrl`: a proxy URL on your server, for calls from the browser.
- `fetch`: a custom `fetch` for the fal requests. The adapter wraps it to read the billed units.

```typescript
import { falImage } from "@tanstack/ai-fal";

const adapter = falImage("fal-ai/nano-banana-pro", {
  apiKey: process.env.FAL_KEY!,
  proxyUrl: "https://your-server.com/api/fal/proxy",
});
```

### Live video proxy

`generateLiveVideo()` returns the WMA app id on `result.model` (`fal-ai/minimax-h3-max-director`). In the browser:

- Open that id with `wma(live.model)` through a proxy on your server. The proxy attaches `FAL_KEY`.
- Do not send `live.token` as `Key` credentials.
- In the proxy, call `allowedFalLiveVideoProxyTarget()`. It lets the proxy forward only to WMA `/ice`, `/session`, `/session/heartbeat`, and Director `/ice`.

### API reference

Each factory takes `model` first and an optional `config` (`apiKey`, `proxyUrl`, `fetch`). Without `apiKey`, it reads `FAL_KEY`.

| Factory | Returns | Use it with |
| --- | --- | --- |
| `falImage(model, config?)` | `FalImageAdapter` | `generateImage()` |
| `falVideo(model, config?)` | `FalVideoAdapter` | `generateVideo()`, `getVideoJobStatus()` |
| `falLiveVideo(model, config?)` / `createFalLiveVideo(model, apiKey, config?)` | `FalLiveVideoAdapter` | `generateLiveVideo()` |
| `falSpeech(model, config?)` | `FalSpeechAdapter` | `generateSpeech()`. The audio comes back as base64 in `result.audio`. |
| `falTranscription(model, config?)` | `FalTranscriptionAdapter` | `generateTranscription()` |
| `falAudio(model, config?)` | `FalAudioAdapter` | `generateAudio()`. The result has a URL at `result.audio.url`. |
| `falFiles(config?)` | `FalFilesAdapter` | The [Files API](../advanced/files-api) |

Helpers:

- `getFalApiKeyFromEnv()`: reads `FAL_KEY`. Throws if it is not set.
- `configureFalClient(config?)`: configures `@fal-ai/client`. The adapter constructors call it for you. It sets the credentials from the API key, and the proxy when you set `proxyUrl`.
