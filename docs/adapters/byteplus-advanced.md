---
title: "BytePlus: Advanced"
id: byteplus-advanced
order: 8
description: "Advanced BytePlus setup in TanStack AI: regions, reasoning and encrypted_content, structured output, Seedance options per model, Seedream reference images, Seed Speech details, and the API reference."
keywords:
  - tanstack ai
  - byteplus
  - modelark
  - seedance
  - seedream
  - seed speech
  - encrypted_content
  - adapter
---

This page has the details of the BytePlus adapter. To get a first chat working, start at [BytePlus](./byteplus).

## Regions

Each Ark key works in one region only. A key from one region does not authenticate in another region. The default base URL is the Asia-Pacific south-east endpoint, `https://ark.ap-southeast.bytepluses.com/api/v3`. To use another region, set `baseURL`:

```typescript
import { createBytePlusText } from "@tanstack/ai-byteplus";

const adapter = createBytePlusText("dola-seed-2-1-turbo-260628", process.env.ARK_API_KEY!, {
  baseURL: "https://ark.eu-west.bytepluses.com/api/v3",
});
```

The BytePlus docs say that the EU endpoint has chat and images only. Seedance video is in Asia-Pacific only.

### BYOK

The two products use two keys, so [BYOK](../advanced/byok) has two providers. Import both from `@tanstack/ai-byteplus/byok`:

- `byteplusByok`: the Ark key, for chat, video, and images.
- `byteplusVoiceByok`: the Seed Speech key, for text-to-speech and transcription.

## Reasoning and `encrypted_content`

Seed models think by default. The thinking text streams as `reasoning_content` deltas. The adapter sends it as reasoning, so `useChat` shows it apart from the answer.

What `reasoning` sends to Ark:

- `off` sends `thinking: { type: "disabled" }` and no effort.
- The other levels send `thinking: { type: "enabled" }` and `reasoning_effort`.
- `deepseek-v3-2-251201` is the one model that does not think by default.

Four models also send an `encrypted_content` value with their reasoning: `dola-seed-2-1-turbo-260628`, `seed-2-0-lite-260428`, `seed-2-0-mini-260428`, and `seed-2-0-pro-260328`. This value is a signature of the reasoning. BytePlus asks you to send it back, with no change, on the assistant message of the next turn.

The adapter does this for you. It reads the value from the stream and stores it as the `signature` of the thinking part. On the next request, it sends the value back. Anthropic thinking signatures work the same way.

- If you store and replay the history yourself, keep the `signature` of the thinking parts. Without it, you lose the reasoning cache hit. The request still works.
- A structured-output turn does not keep the value. Again, you lose the cache hit, and the request still works.

## Structured output

Ten of the 18 chat models accept `response_format: { type: "json_schema" }`:

- `dola-seed-2-1-turbo-260628`
- `seed-2-0-pro-260328`, `seed-2-0-lite-260228`, `seed-2-0-mini-260215`
- `seed-1-8-251228`, `seed-1-6-250915`, `seed-1-6-250615`
- `seed-1-6-flash-250715`, `seed-1-6-flash-250615`
- `glm-5-2-260617`

```typescript
import { chat } from "@tanstack/ai";
import { byteplusText } from "@tanstack/ai-byteplus";
import { z } from "zod";

const RecipeSchema = z.object({
  name: z.string().meta({ description: "Name of the dish" }),
  minutes: z.number().meta({ description: "Total cooking time in minutes" }),
  ingredients: z.array(z.string()),
});

const recipe = await chat({
  adapter: byteplusText("dola-seed-2-1-turbo-260628"),
  messages: [{ role: "user", content: "Give me a recipe for carbonara" }],
  outputSchema: RecipeSchema,
});

console.log(recipe.name, recipe.minutes);
```

On the other eight models, the adapter stops with an error:

- `chat({ outputSchema })` throws.
- The streaming form sends a `RUN_ERROR` that names the models that work.

There is no JSON-mode fallback. Ark also rejects `response_format: { type: "json_object" }` on these eight models.

Two results of live tests that the BytePlus tables do not show:

- `seed-2-0-lite-260428` rejects a JSON schema. For typed output, use `seed-2-0-lite-260228` or `dola-seed-2-1-turbo-260628`.
- `glm-4-7-251222` accepts a schema and then ignores it. It answers in prose with a `200`. The adapter does not allow a schema on this model, so you do not get output that you cannot parse.

To build a model picker, use the exported `BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS`.

## Seedance video

### Run a Seedance job from the client

Let the server poll the job. Set `stream: true` and send the events to the browser:

```typescript
import {
  generateVideo,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { byteplusVideo } from "@tanstack/ai-byteplus";

export async function POST(request: Request) {
  const { input } = await generationParamsFromRequest("video", request);
  if (typeof input.prompt !== "string") {
    return new Response("Send a text prompt.", { status: 400 });
  }

  const stream = generateVideo({
    adapter: byteplusVideo("dreamina-seedance-2-5-260628"),
    prompt: input.prompt,
    size: "16:9_720p",
    duration: 5,
    stream: true,
    pollingInterval: 5000,
  });

  return toServerSentEventsResponse(stream);
}
```

On the client, `useGenerateVideo` tracks the job:

```tsx
import { fetchServerSentEvents, useGenerateVideo } from "@tanstack/ai-react";

export function SeedanceGenerator() {
  const { generate, result, videoStatus, isLoading, error } = useGenerateVideo({
    connection: fetchServerSentEvents("/api/generate/video"),
  });

  return (
    <div>
      <button
        onClick={() => generate({ prompt: "a guitar being played in a store" })}
        disabled={isLoading}
      >
        {isLoading ? "Generating..." : "Generate video"}
      </button>

      {isLoading && <p>Status: {videoStatus?.status ?? "starting"}</p>}
      {error && <p>Error: {error.message}</p>}
      {result && <video src={result.url} controls width={640} />}
    </div>
  );
}
```

The job record stays for seven days. The video URL expires 24 hours after the job completes.

### Seedance options per model

Seedance options are different for each model. Ark rejects an option that does not apply with a `400`, for example: "the specified parameter `draft` is not supported for model seedance-1-0-pro in t2v, must be empty".

| Option | Models that accept it |
| --- | --- |
| `service_tier` (`"default"` or `"flex"`) | Seedance 1.x only |
| `camera_fixed` | Seedance 1.x only |
| `frames` (`25 + 4n`, from `29` to `289`) | `seedance-1-0-pro-250528`, `seedance-1-0-pro-fast-251015` |
| `draft` (a cheap preview) | `seedance-1-5-pro-251215` only |
| `priority` (`0` to `9`) | Seedance 2.5 and the `dreamina-seedance-2-0-*` models |
| `duration: -1` (the model picks the length) | Seedance 2.5, Seedance 2.0, `seedance-1-5-pro-251215` |
| `output_format` (`"mp4"` or `"mov"`) | Seedance 2.5 (default `mp4`) |
| `seed`, `watermark`, `generate_audio`, `return_last_frame`, `callback_url` | All models |

- `watermark` is `false` by default for video. For Seedream images, it is `true`.
- All models accept `generate_audio`. Only Seedance 2.5, Seedance 2.0, and `seedance-1-5-pro-251215` add an audio track.

Resolutions also change by model:

- No Seedance model has a 2K tier.
- Only `dreamina-seedance-2-0-260128` has `4k`.
- Seedance 2.5 accepts `480p`, `720p`, and `1080p`.
- `seedance-1-0-pro-fast-251015` accepts `1080p`.

The adapter finds a combination that a model does not support before it sends the request, and throws a clear error.

Reference media uses the shared [role hints](../media/video-generation#role-hints): `start_frame`, `end_frame`, and `reference`.

- Seedance 2.5 and Seedance 2.0 take reference images, video, and audio.
- Seedance 2.5 also accepts audio-only reference input. It takes up to 30 images, 10 videos, and 10 audio clips. Seedance 2.0 takes 9, 3, and 3.
- The 1.x models take start and end frames only. `seedance-1-0-pro-fast-251015` takes a start frame only.

### Seedance 2.5

`dreamina-seedance-2-5-260628` is the newest Seedance model. Use it for long clips (up to 30 seconds), audio-only reference input, and `output_format: "mov"`.

```typescript
import { generateVideo } from "@tanstack/ai";
import { byteplusVideo } from "@tanstack/ai-byteplus";

const { jobId } = await generateVideo({
  adapter: byteplusVideo("dreamina-seedance-2-5-260628"),
  prompt: "a guitar being played in a store",
  size: "16:9_1080p",
  duration: 10,
  modelOptions: {
    generate_audio: true,
    priority: 5,
    output_format: "mp4",
  },
});

console.log(jobId);
```

| Capability | Seedance 2.5 |
| --- | --- |
| Duration | 4 to 30 seconds, or `-1` (the model picks; required for video edit tasks) |
| Resolution | `480p`, `720p`, `1080p` (default `720p`). No 4k. |
| Reference media | 1 to 30 images, 0 to 10 videos, 0 to 10 audio clips. Audio only is allowed. |
| First and last frame | Yes |
| `priority`, `generate_audio` | Yes |
| `service_tier`, `camera_fixed`, `frames`, `draft` | No |

The account can need to activate the model, or buy a resource pack, in the Ark Console. Until then, a call fails with `404 ModelNotOpen`.

`byteplusVideo()` accepts any string, so you can use an id that BytePlus releases before this package lists it. For an unknown id, the adapter skips its local checks and lets Ark validate the request. Known ids keep their checks.

### Seedance through BytePlus or fal

You can also reach Seedance through [`@tanstack/ai-fal`](./fal). This adapter talks to BytePlus directly, so you get:

- BytePlus billing and rate limits.
- The model ids of BytePlus.
- All the Seedance fields above (`camera_fixed`, `draft`, `priority`, reference media roles). fal has a smaller, shared set.

Use the account that you already have. You do not need both packages for Seedance.

## Seedream reference images

To edit an image, or to guide the result with images, put image parts in the `prompt` array. Seedream takes up to 14 reference images, and `dola-seedream-5-0-pro-260628` takes up to 10:

```typescript
import { generateImage } from "@tanstack/ai";
import { byteplusImage } from "@tanstack/ai-byteplus";

const result = await generateImage({
  adapter: byteplusImage("seedream-5-0-260128"),
  prompt: [
    { type: "text", content: "Put this guitar on a concert stage" },
    {
      type: "image",
      source: { type: "url", value: "https://example.com/guitar.png" },
    },
  ],
});

console.log(result.images.length);
```

Two Seedream behaviors to know:

- The adapter never sets `watermark` for you, so the BytePlus default (`true`) applies.
- Seedream has no `n` option. When you ask for more than one image, the adapter uses the group-image mode (`sequential_image_generation: "auto"` with `max_images`). The model then decides how many images the prompt needs. A request for four can return two. The adapter logs a warning when this occurs.

## Seed Speech

### Voice ids

Seed Speech has no top-level `speaker` field. The voice goes inside a `references` entry. The adapter turns `voice` into `references: [{ speaker: "en_female_stokie_uranus_bigtts" }]` for you.

`modelOptions.references` replaces that entry. It does not merge with it. So if you send `references` for voice cloning, the adapter drops `voice`. To keep a stock voice with your clips, add a `speaker` entry yourself.

The end of a voice id tells you its generation:

- `_uranus_bigtts`: TTS 2.0 voices, the newest generation.
- `_mars_bigtts` and `_moon_bigtts`: TTS 1.0 voices.
- `*_emo_v2_*`: TTS 1.0 voices that also accept emotion tags.

The full list is in the [BytePlus voice list](https://docs.byteplus.com/en/docs/byteplusvoice/voicelist). It changes more often than this package, so the adapter accepts any string. `speaker` also takes a voice that you cloned with Voice Replication.

### Speech options

Use `modelOptions` for these:

- `ogg_opus` output and an exact `sample_rate`.
- `references`: voice cloning, with up to three 30-second audio clips. Refer to them from the text as `@Audio1` to `@Audio3`.
- `watermark`, `speech_rate`, and the raw `enable_subtitle` timings.

```typescript
import { generateSpeech } from "@tanstack/ai";
import { byteplusSpeech, type BytePlusTTSResult } from "@tanstack/ai-byteplus";

const result: BytePlusTTSResult = await generateSpeech({
  adapter: byteplusSpeech("seed-audio-1.0"),
  text: "welcome to the guitar store",
  modelOptions: {
    format: "ogg_opus",
    sample_rate: 48000,
    speech_rate: 20,
    enable_subtitle: true,
  },
});

for (const sentence of result.subtitle?.sentences ?? []) {
  console.log(sentence.text, sentence.start_time);
}
```

### Timings

The shared `timestamps: true` option is easier than `modelOptions.enable_subtitle`. It sets the same flag. Then it maps the timings to `result.alignment` (per word) and `result.segments` (per sentence), in seconds:

```typescript
import { generateSpeech } from "@tanstack/ai";
import { byteplusSpeech } from "@tanstack/ai-byteplus";

const result = await generateSpeech({
  adapter: byteplusSpeech("seed-audio-1.0"),
  text: "welcome to the guitar store",
  timestamps: true,
});

console.log(result.alignment?.unit); // "word"
console.log(result.alignment?.endSeconds.at(-1)); // where speech stops
```

### Dialogue

Seed Audio 1.0 makes a dialogue with several voices in one request. Pass `turns`, and the adapter builds the `references` array and the role prompt for you. A request can have up to three different voices:

```typescript
import { generateSpeech } from "@tanstack/ai";
import { byteplusSpeech } from "@tanstack/ai-byteplus";

// Replace SECOND_VOICE with another voice id from the BytePlus voice list.
const SECOND_VOICE = "your-second-voice-id";

const result = await generateSpeech({
  adapter: byteplusSpeech("seed-audio-1.0"),
  turns: [
    { text: "Do you sell picks?", voice: "en_female_stokie_uranus_bigtts" },
    { text: "By the till.", voice: SECOND_VOICE },
  ],
  timestamps: true,
});

for (const segment of result.segments ?? []) {
  console.log(segment.startSeconds, segment.text);
}
```

### Watermarks

For speech, `watermark` is an object. It has two markers, and both are off by default:

- `aigc_watermark`: adds a sound marker at the end of the clip.
- `aigc_metadata`: writes the source of the audio into the audio header. It writes nothing unless `enable` is `true`.

```typescript
import { generateSpeech } from "@tanstack/ai";
import { byteplusSpeech } from "@tanstack/ai-byteplus";

const result = await generateSpeech({
  adapter: byteplusSpeech("seed-audio-1.0"),
  text: "welcome to the guitar store",
  modelOptions: {
    watermark: {
      aigc_watermark: true,
      aigc_metadata: { enable: true, content_producer: "guitar-store" },
    },
  },
});

console.log(result.format);
```

`watermark: true` is short for `{ aigc_watermark: true }`. Images and video use a boolean `watermark`. Only speech takes the object.

### Limits

- One request makes 120 seconds of audio at most. The limit applies to `originalDuration`, the length before `speech_rate`. BytePlus also bills on this length.
- The raw `subtitle` timings are in milliseconds. `duration` and `originalDuration` are in seconds. `alignment` and `segments` are always in seconds.
- The `url` on the result expires about two hours after generation. Keep the base64 `audio`, not the link.

## Transcription options

Set these in `modelOptions` of `byteplusTranscription`:

- `enable_itn`: writes spoken numbers and dates as digits.
- `enable_punc`: adds punctuation.
- `enable_ddc`: removes filler words.
- `enable_speaker_info`: adds speaker labels, which come back as `segment.speaker`.

## API reference

Each factory pair has the same shape. The short factory reads the key from the environment. The `create*` factory takes an explicit API key. Both take `model` as the first argument.

| Factories | Creates | Key |
| --- | --- | --- |
| `byteplusText(model, config?)` / `createBytePlusText(model, apiKey, config?)` | Chat adapter | `ARK_API_KEY` or `BYTEPLUS_API_KEY` |
| `byteplusVideo(model, config?)` / `createBytePlusVideo(model, apiKey, config?)` | Seedance video adapter (experimental) | `ARK_API_KEY` |
| `byteplusImage(model, config?)` / `createBytePlusImage(model, apiKey, config?)` | Seedream image adapter | `ARK_API_KEY` |
| `byteplusSpeech(model, config?)` / `createBytePlusSpeech(model, apiKey, config?)` | Seed Speech text-to-speech adapter | `BYTEPLUS_VOICE_API_KEY` |
| `byteplusTranscription(model, config?)` / `createBytePlusTranscription(model, apiKey, config?)` | Seed Speech transcription adapter | `BYTEPLUS_VOICE_API_KEY` |

- `config.baseURL` sets the region endpoint of the Ark adapters.
- `adapter.inputModalities` lists the input kinds of the selected chat model. It is `undefined` for a model that this package does not know.
- BytePlus has no provider tools. Define your tools with `toolDefinition()`. Ark uses the OpenAI tool-call format, so the usual [tools flow](../tools/tools.md) works.
