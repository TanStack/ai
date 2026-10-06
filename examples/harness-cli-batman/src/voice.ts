import { execFile, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import { generateTranscription } from "@tanstack/ai";
import { createGrokTranscription } from "@tanstack/ai-grok";
import { grokByok } from "@tanstack/ai-grok/byok";
import { createOpenaiTranscription } from "@tanstack/ai-openai";
import { openaiByok } from "@tanstack/ai-openai/byok";
import { SAVE_DIR } from "./credentials";
import { providerKey } from "./store";

// Voice input for the terminal: ffmpeg records the microphone, a
// transcription model turns it into text, and spoken file names become
// `@path` attachments that the CLI sends with the message.

const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const RATE = 16000;
const TRANSCRIBE_MS = 45_000;
const MAX_SPOKEN_FILES = 400;
// The microphone you picked, kept next to the sign-ins.
const saved = join(SAVE_DIR, "voice.json");

/**
 * Can the session of `threadId` turn speech into text? It needs an OpenAI or
 * an xAI key: saved with `/connect`, or in the env.
 */
export async function canTranscribe(threadId: string) {
  const keys = await Promise.all([
    providerKey(openaiByok, threadId),
    providerKey(grokByok, threadId),
  ]);
  return keys.some((key) => key !== null);
}

/**
 * The audio inputs ffmpeg can record on Windows (DirectShow). Other systems
 * record the default input, so this is empty there.
 */
export function listMicrophones() {
  if (process.platform !== "win32") return Promise.resolve<Array<string>>([]);
  return new Promise<Array<string>>((resolve, reject) => {
    execFile(
      ffmpeg,
      ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"],
      (error, _stdout, stderr) => {
        if (error?.code === "ENOENT")
          return reject(new Error("Voice needs ffmpeg on the PATH (or FFMPEG_PATH)."));
        resolve([...stderr.matchAll(/"([^"]+)" \(audio\)/g)].map((match) => match[1] ?? ""));
      },
    );
  });
}

// The microphone `/mic <n>` picked, or the first recording found.
let picked: string | undefined;

/** Record from this microphone from now on, also after a restart. */
export async function chooseMicrophone(name: string) {
  picked = name;
  await mkdir(dirname(saved), { recursive: true });
  await writeFile(saved, JSON.stringify({ microphone: name }, null, 2));
}

/** The microphone to record from, when one is set: VOICE_DEVICE, then yours. */
export async function currentMicrophone() {
  if (process.env.VOICE_DEVICE) return process.env.VOICE_DEVICE;
  if (picked) return picked;
  try {
    const parsed: unknown = JSON.parse(await readFile(saved, "utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "microphone" in parsed &&
      typeof parsed.microphone === "string"
    )
      picked = parsed.microphone;
  } catch {
    // No saved microphone yet.
  }
  return picked;
}

/**
 * The inputs a first recording listens on: every microphone, without capture
 * cards and virtual inputs (they are often silent).
 */
async function candidateMicrophones() {
  const names = await listMicrophones();
  const real = names.filter((name) => !/hdmi|cam link|virtual|stereo mix|line in/i.test(name));
  return real.length > 0 ? real : names;
}

/** The ffmpeg input arguments for one microphone. */
function microphoneInput(name: string | undefined) {
  if (process.platform === "win32") return ["-f", "dshow", "-i", `audio=${name}`];
  if (process.platform === "darwin") return ["-f", "avfoundation", "-i", `:${name ?? "0"}`];
  return ["-f", "pulse", "-i", name ?? "default"];
}

/** The root mean square of 16-bit samples, without a constant offset. */
function rms(samples: Int16Array) {
  if (samples.length === 0) return 0;
  let sum = 0;
  let squares = 0;
  for (const sample of samples) {
    sum += sample;
    squares += sample * sample;
  }
  const mean = sum / samples.length;
  return Math.sqrt(Math.max(0, squares / samples.length - mean * mean));
}

function samplesOf(pcm: Uint8Array) {
  return new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + (pcm.byteLength & ~1)));
}

/**
 * How much speech a clip holds, from its 100 ms windows:
 * - `peak`: the loudness of the loud part (90th percentile), 0 to 32768.
 * - `floor`: the loudness of the quiet part (20th percentile), the noise.
 * Speech makes the peak much louder than the floor. Steady noise and a few
 * clicks do not, so they read as silence.
 */
export function speechStats(pcm: Uint8Array) {
  const samples = samplesOf(pcm);
  const size = RATE / 10;
  const windows: Array<number> = [];
  for (let start = 0; start + size <= samples.length; start += size)
    windows.push(rms(samples.subarray(start, start + size)));
  windows.sort((a, b) => a - b);
  const at = (share: number) =>
    windows[Math.min(windows.length - 1, Math.floor(windows.length * share))] ?? 0;
  return { peak: at(0.9), floor: at(0.2) };
}

/** How clearly a clip holds speech: the peak over the noise floor. */
function speechScore(stats: { peak: number; floor: number }) {
  return stats.peak / Math.max(stats.floor, 30);
}

/** A 16 kHz mono 16-bit WAV file for raw samples. */
function wavFile(pcm: Uint8Array) {
  const header = new DataView(new ArrayBuffer(44));
  const text = (offset: number, value: string) => {
    for (let index = 0; index < 4; index++)
      header.setUint8(offset + index, value.charCodeAt(index));
  };
  text(0, "RIFF");
  header.setUint32(4, 36 + pcm.byteLength, true);
  text(8, "WAVE");
  text(12, "fmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, RATE, true);
  header.setUint32(28, RATE * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  text(36, "data");
  header.setUint32(40, pcm.byteLength, true);
  const file = new Uint8Array(44 + pcm.byteLength);
  file.set(new Uint8Array(header.buffer));
  file.set(pcm, 44);
  return file;
}

// Every ffmpeg recorder that runs. They are stopped when the app exits, so no
// recorder keeps the microphone open after it.
const recorders = new Set<ChildProcess>();
process.once("exit", () => {
  for (const child of recorders) child.kill();
});

/** One ffmpeg process that streams raw samples from one microphone. */
function capture(name: string | undefined) {
  const child = spawn(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      ...microphoneInput(name),
      "-ac",
      "1",
      "-ar",
      String(RATE),
      "-f",
      "s16le",
      "pipe:1",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  recorders.add(child);
  child.on("exit", () => recorders.delete(child));
  const chunks: Array<Buffer> = [];
  let level = 0;
  let errors = "";
  child.stdout.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
    level = rms(samplesOf(chunk));
  });
  child.stderr.on("data", (chunk: Buffer) => (errors += chunk.toString()));
  const exited = new Promise<void>((resolve, reject) => {
    child.on("error", (error: NodeJS.ErrnoException) =>
      reject(
        error.code === "ENOENT"
          ? new Error("Voice needs ffmpeg on the PATH (or FFMPEG_PATH).")
          : error,
      ),
    );
    child.on("exit", () => resolve());
  });
  let running = true;
  void exited.then(
    () => (running = false),
    () => (running = false),
  );
  return {
    name: name ?? "the default input",
    exited,
    isRunning: () => running,
    errors: () => errors.trim(),
    level: () => level,
    pcm: () => new Uint8Array(Buffer.concat(chunks)),
    stop: async () => {
      // `q` makes ffmpeg stop cleanly. Kill it if it does not. Do not wait
      // forever: on Windows, dshow sometimes ignores stdin and kill.
      try {
        child.stdin.end("q");
      } catch {
        // stdin can already be closed when ffmpeg exited.
      }
      const timer = setTimeout(() => child.kill(), 1500);
      await Promise.race([
        exited.catch(() => {}),
        new Promise<void>((resolve) => setTimeout(resolve, 2500)),
      ]);
      clearTimeout(timer);
    },
    kill: () => child.kill(),
  };
}

/** A voice message from the microphone. */
export interface VoiceClip {
  /** 16 kHz mono WAV. */
  audio: Uint8Array;
  /** The loud part and the noise floor, from 0 to 32768. */
  peak: number;
  floor: number;
  microphone: string;
  /** True when this recording picked the microphone (the clearest one). */
  pickedMicrophone: boolean;
}

export interface Recording {
  /** The microphone, or "all microphones" while the first recording picks one. */
  microphone: string;
  /** The loudness right now, from 0 to 32768, for a level meter. */
  level: () => number;
  /** Stop, and give the voice message. */
  stop: () => Promise<VoiceClip>;
  /** Stop and drop the audio. */
  cancel: () => void;
}

/**
 * Start recording until `stop` or `cancel`. With no microphone set yet, it
 * listens on every microphone, keeps the one that heard speech the clearest,
 * and remembers it.
 */
export async function startRecording(): Promise<Recording> {
  const chosen = await currentMicrophone();
  const names =
    chosen !== undefined || process.platform !== "win32" ? [chosen] : await candidateMicrophones();
  if (names.length === 0) throw new Error("No microphone found. Set VOICE_DEVICE to its name.");
  const captures = names.map(capture);
  // ffmpeg stops at once when a device does not open.
  await new Promise((resolve) => setTimeout(resolve, 400));
  const live = captures.filter((item) => item.isRunning());
  if (live.length === 0) {
    const errors = captures.map((item) => item.errors()).filter(Boolean);
    throw new Error(`The microphone did not open. ${errors.join(" ")}`.trim());
  }
  const picking = chosen === undefined && live.length > 1;
  return {
    microphone: picking ? "all microphones" : (live[0]?.name ?? ""),
    level: () => Math.max(...live.map((item) => item.level())),
    stop: async () => {
      await Promise.all(live.map((item) => item.stop()));
      const clips = live.map((item) => {
        const pcm = item.pcm();
        return { name: item.name, pcm, ...speechStats(pcm) };
      });
      const best = clips.reduce((clearest, clip) =>
        speechScore(clip) > speechScore(clearest) ? clip : clearest,
      );
      const clip: VoiceClip = {
        audio: wavFile(best.pcm),
        peak: best.peak,
        floor: best.floor,
        microphone: best.name,
        pickedMicrophone: false,
      };
      // Keep that microphone only when it heard speech: in silence, the
      // clearest one means nothing.
      if (picking && !isSilent(clip)) {
        await chooseMicrophone(best.name);
        clip.pickedMicrophone = true;
      }
      return clip;
    },
    cancel: () => {
      for (const item of live) item.kill();
    },
  };
}

/**
 * Is a clip silent? Transcription models make up words for silence, so a
 * silent clip is not sent. A clip is silent when its loud part is under
 * VOICE_MIN_LOUDNESS (default 300), for example a muted microphone.
 */
export function isSilent(clip: Pick<VoiceClip, "peak">) {
  return clip.peak < Number(process.env.VOICE_MIN_LOUDNESS || 300);
}

/**
 * The words in `audio`, with OpenAI, or Grok when there is only an xAI key.
 * The key is the one the session of `threadId` uses: saved with `/connect`,
 * else the env var. `name` gives the format, for example `voice.wav`.
 * VOICE_LANGUAGE (an ISO-639-1 code such as `en`) tells the model which
 * language to expect.
 */
export async function transcribe(
  audio: Uint8Array,
  options: {
    name: string;
    threadId: string;
    abortSignal?: AbortSignal;
  },
) {
  const file = new File([audio.slice()], options.name, { type: "audio/wav" });
  const language = process.env.VOICE_LANGUAGE ? { language: process.env.VOICE_LANGUAGE } : {};
  const openaiKey = await providerKey(openaiByok, options.threadId);
  if (openaiKey !== null) {
    const result = await generateTranscription({
      adapter: createOpenaiTranscription("gpt-4o-transcribe", openaiKey),
      audio: file,
      timeout: TRANSCRIBE_MS,
      abortSignal: options.abortSignal,
      ...language,
    });
    return result.text.trim();
  }
  const grokKey = await providerKey(grokByok, options.threadId);
  if (grokKey !== null) {
    const result = await generateTranscription({
      adapter: createGrokTranscription("grok-stt", grokKey),
      audio: file,
      timeout: TRANSCRIBE_MS,
      abortSignal: options.abortSignal,
      ...language,
    });
    return result.text.trim();
  }
  throw new Error(
    "Voice needs an OpenAI or xAI key for the transcript. Run /connect openai or /connect grok.",
  );
}

const SKIP = new Set(["node_modules", ".git", "dist"]);

/** The files in `dir` and its folders, 3 levels deep. Stops at MAX_SPOKEN_FILES. */
async function filesIn(dir: string, depth = 0, acc: Array<string> = []): Promise<Array<string>> {
  if (depth > 3 || acc.length >= MAX_SPOKEN_FILES) return acc;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (acc.length >= MAX_SPOKEN_FILES) break;
    if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await filesIn(path, depth + 1, acc);
    else acc.push(path);
  }
  return acc;
}

/** Spoken text in a form that file names match: "cat dot png" is "cat.png". */
function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+dot\s+/g, ".")
    .replace(/\s*\.\s*(?=[a-z0-9]{2,4}\b)/g, ".");
}

/** The media a turn made, newest last, for "the last image" and the like. */
export interface RecentMedia {
  kind: string;
  path: string;
}

const RECENT =
  /\b(last|latest|previous|that|this|the)\s+(image|picture|photo|video|clip|song|track|audio|sound)\b/;

const KIND_OF_WORD: Record<string, string> = {
  image: "image",
  picture: "image",
  photo: "image",
  video: "video",
  clip: "video",
  song: "audio",
  track: "audio",
  audio: "audio",
  sound: "audio",
};

/**
 * Turn the files a user names in a voice message into `@path` attachments.
 * A file counts when its name is in the text ("use cat dot png as a
 * reference"), or when the text says "the last image" and the screen saved
 * one. The CLI reads each `@path` and sends the file with the message.
 */
export async function withSpokenFiles(
  text: string,
  roots: ReadonlyArray<string>,
  recent: ReadonlyArray<RecentMedia> = [],
) {
  const spoken = normalize(text);
  const match = RECENT.exec(spoken);
  const wantsNamedFile = /\.[a-z0-9]{2,4}\b/.test(spoken);
  if (!wantsNamedFile && !match) return { text, files: [] };
  const found = new Set<string>();
  if (wantsNamedFile) {
    for (const root of roots) {
      for (const file of await filesIn(root)) {
        const name = basename(file).toLowerCase();
        if (extname(name) !== "" && spoken.includes(name)) found.add(file);
      }
    }
  }
  const kind = match ? KIND_OF_WORD[match[2] ?? ""] : undefined;
  const latest = kind ? [...recent].reverse().find((media) => media.kind === kind) : undefined;
  if (latest) found.add(latest.path);
  const files = [...found].map((file) => relative(process.cwd(), file));
  const refs = files.map((file) => `@"${file}"`);
  return { text: [text, ...refs].join(" "), files };
}
