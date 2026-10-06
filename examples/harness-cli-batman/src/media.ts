import { EventType, defineAgent, keyedAdapter } from "@tanstack/ai";
import { mediaIdOf } from "@tanstack/ai-harness";
import { falAudio } from "@tanstack/ai-fal";
import { falByok } from "@tanstack/ai-fal/byok";
import { createGrokVideo } from "@tanstack/ai-grok";
import { grokByok } from "@tanstack/ai-grok/byok";
import { createOpenaiImage, createOpenaiSpeech, createOpenaiVideo } from "@tanstack/ai-openai";
import { openaiByok } from "@tanstack/ai-openai/byok";
import { z } from "zod";
import { mediaBytes } from "./store";
import type {
  AnyVideoAdapter,
  ImagePart,
  MediaInputMetadata,
  ModelMessage,
  UIMessage,
} from "@tanstack/ai";

// Every agent here returns a short text. The harness keeps each file it makes
// and publishes a `harness.media` event, so the screen can show and save it.
//
// Each agent builds its model with the user's key just before the call: the
// key saved with `/connect <provider>`, else the env var. Without a key, the
// call stops, and the screen says which `/connect` to run.
const gptImage = keyedAdapter(openaiByok, (key) => createOpenaiImage("gpt-image-2.5-flare", key));
const openaiVoice = keyedAdapter(openaiByok, (key) => createOpenaiSpeech("tts-1-hd", key));
const sora = keyedAdapter(openaiByok, (key) => createOpenaiVideo("sora-2", key));
const grokImagine = keyedAdapter(grokByok, (key) => createGrokVideo("grok-imagine-video-1.5", key));
const falMusic = keyedAdapter(falByok, (key) =>
  falAudio("fal-ai/elevenlabs/music", { apiKey: key }),
);
const falSound = keyedAdapter(falByok, (key) =>
  falAudio("fal-ai/stable-audio-25/text-to-audio", { apiKey: key }),
);

/**
 * The images in the latest user message that has files: the ones the user
 * sent with `@path`, or with a voice message that named a file.
 */
async function attachedImages(messages: ReadonlyArray<UIMessage | ModelMessage>) {
  for (const message of [...messages].reverse()) {
    if (message.role !== "user" || !("content" in message)) continue;
    if (!Array.isArray(message.content)) continue;
    const images: Array<ImagePart<MediaInputMetadata>> = [];
    for (const part of message.content) {
      const id = mediaIdOf(part);
      if (id === undefined || part.type !== "image") continue;
      const bytes = await mediaBytes(id);
      const mimeType = part.source.mimeType ?? "image/png";
      if (bytes) {
        images.push({
          type: "image",
          source: {
            type: "data",
            value: Buffer.from(bytes).toString("base64"),
            mimeType,
          },
        });
      }
    }
    if (images.length > 0) return images;
  }
  return [];
}

/** Makes an image with OpenAI. It can start from the images the user sent. */
export const imageAgent = defineAgent({
  name: "image",
  description:
    "Generates one image from a detailed visual prompt. Set useAttachedImages when the user sent images to use as references (a new version, a style, an edit). The user gets the image.",
  produces: "image",
  inputSchema: z.object({
    prompt: z.string().describe("A detailed description of the image"),
    useAttachedImages: z
      .boolean()
      .optional()
      .describe("Use the images the user sent as references"),
  }),
  run: async (ctx) => {
    const references = ctx.input.useAttachedImages ? await attachedImages(ctx.messages) : [];
    const adapter = await ctx.keys.adapter(gptImage);
    // With references, the prompt is the text plus the images (an edit).
    const result =
      references.length > 0
        ? await ctx.generateImage({
            adapter,
            prompt: [{ type: "text", content: ctx.input.prompt }, ...references],
            size: "1024x1024",
          })
        : await ctx.generateImage({
            adapter,
            prompt: ctx.input.prompt,
            size: "1024x1024",
          });
    if (result.images.length === 0) throw new Error("The image model returned no image.");
    const from = references.length > 0 ? ` from ${references.length} reference image(s)` : "";
    return `Made the image${from} with ${result.model}. The user has it.`;
  },
});

/**
 * Makes a short video: with Grok Imagine when the user has an xAI key, else
 * with Sora. The harness keeps only streamed video, so this uses
 * `stream: true`: one stream from the job start to the file.
 */
export const videoAgent = defineAgent({
  name: "video",
  description:
    "Generates one short video clip from a detailed visual prompt. Takes a minute or two. The user gets the video.",
  produces: "video",
  inputSchema: z.object({
    prompt: z.string().describe("A detailed description of the scene and the motion"),
  }),
  run: async (ctx) => {
    const hasGrokKey = (await ctx.keys.get(grokByok)) !== null;
    const adapter: AnyVideoAdapter = hasGrokKey
      ? await ctx.keys.adapter(grokImagine)
      : await ctx.keys.adapter(sora);
    const stream = ctx.generateVideo({
      adapter,
      prompt: ctx.input.prompt,
      stream: true,
    });
    for await (const chunk of stream) {
      // The stream reports a failed or stopped job as an event, not a throw.
      if (chunk.type === EventType.RUN_ERROR) throw new Error(chunk.message);
    }
    return `Made the video with ${adapter.model}. The user has it.`;
  },
});

/** Reads a text aloud with OpenAI text to speech. */
export const speechAgent = defineAgent({
  name: "speech",
  description:
    "Reads a text aloud and makes an audio file of it (text to speech). The user gets the audio.",
  produces: "speech",
  inputSchema: z.object({
    text: z.string().describe("The exact words to say"),
    voice: z
      .enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"])
      .optional()
      .describe("The voice. Default: alloy"),
  }),
  run: async (ctx) => {
    const result = await ctx.generateSpeech({
      adapter: await ctx.keys.adapter(openaiVoice),
      text: ctx.input.text,
      voice: ctx.input.voice ?? "alloy",
    });
    return `Read the text aloud with ${result.model}. The user has the audio.`;
  },
});

/** Makes a song with vocals and music through fal (ElevenLabs Music). */
export const songAgent = defineAgent({
  name: "song",
  description:
    "Composes a song or an instrumental track from a description (genre, mood, instruments, and lyrics if the user gave any). Takes up to a minute. The user gets the audio.",
  produces: "audio",
  inputSchema: z.object({
    prompt: z.string().describe("The style, mood, instruments, and the lyrics, if any"),
    seconds: z.number().min(10).max(120).optional().describe("The length in seconds. Default: 30"),
  }),
  run: async (ctx) => {
    const result = await ctx.generateAudio({
      adapter: await ctx.keys.adapter(falMusic),
      prompt: ctx.input.prompt,
      duration: ctx.input.seconds ?? 30,
    });
    return `Composed the song with ${result.model}. The user has the audio.`;
  },
});

/** Makes a sound effect through fal (Stable Audio). */
export const soundAgent = defineAgent({
  name: "sound_effect",
  description:
    "Makes a short sound effect or ambience from a description, for example rain on a window. The user gets the audio.",
  produces: "audio",
  inputSchema: z.object({
    prompt: z.string().describe("The sound to make"),
    seconds: z.number().min(1).max(30).optional().describe("The length in seconds. Default: 8"),
  }),
  run: async (ctx) => {
    const result = await ctx.generateAudio({
      adapter: await ctx.keys.adapter(falSound),
      prompt: ctx.input.prompt,
      duration: ctx.input.seconds ?? 8,
    });
    return `Made the sound effect with ${result.model}. The user has the audio.`;
  },
});
