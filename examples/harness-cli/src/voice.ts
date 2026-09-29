import { execFile, spawn } from 'node:child_process'
import { readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join, relative } from 'node:path'
import { generateTranscription } from '@tanstack/ai'
import { grokTranscription } from '@tanstack/ai-grok'
import { openaiTranscription } from '@tanstack/ai-openai'

// Voice input for the terminal: ffmpeg records the microphone, a
// transcription model turns it into text, and spoken file names become
// `@path` attachments that the CLI sends with the message.

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'

/**
 * The audio inputs ffmpeg can record on Windows (DirectShow). Other systems
 * record the default input, so this is empty there.
 */
export function listMicrophones() {
  if (process.platform !== 'win32') return Promise.resolve<Array<string>>([])
  return new Promise<Array<string>>((resolve, reject) => {
    execFile(
      ffmpeg,
      ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'],
      (error, _stdout, stderr) => {
        if (error?.code === 'ENOENT')
          return reject(
            new Error('Voice needs ffmpeg on the PATH (or FFMPEG_PATH).'),
          )
        resolve(
          [...stderr.matchAll(/"([^"]+)" \(audio\)/g)].map(
            (match) => match[1] ?? '',
          ),
        )
      },
    )
  })
}

// The microphone `/mic <n>` picked. VOICE_DEVICE wins over it.
let picked: string | undefined

/** Record from this microphone from now on. */
export function chooseMicrophone(name: string) {
  picked = name
}

/**
 * The microphone to record from: VOICE_DEVICE, the one `/mic` picked, or the
 * first real microphone in the list (not a capture card or a virtual input).
 */
export async function currentMicrophone() {
  if (process.env.VOICE_DEVICE) return process.env.VOICE_DEVICE
  if (picked) return picked
  const names = await listMicrophones()
  const real = names.find(
    (name) => /microphone|mic\b/i.test(name) && !/virtual/i.test(name),
  )
  const name = real ?? names[0]
  if (!name)
    throw new Error('No microphone found. Set VOICE_DEVICE to its name.')
  return name
}

/** The ffmpeg input arguments for the microphone. */
async function microphoneInput() {
  if (process.platform === 'win32')
    return ['-f', 'dshow', '-i', `audio=${await currentMicrophone()}`]
  if (process.platform === 'darwin')
    return ['-f', 'avfoundation', '-i', `:${process.env.VOICE_DEVICE || '0'}`]
  return ['-f', 'pulse', '-i', process.env.VOICE_DEVICE || 'default']
}

export interface Recording {
  /** Stop, and give the recorded audio (16 kHz mono WAV). */
  stop: () => Promise<Uint8Array>
  /** Stop and drop the audio. */
  cancel: () => void
}

/** Start recording the microphone until `stop` or `cancel`. */
export async function startRecording(): Promise<Recording> {
  const file = join(tmpdir(), `harness-voice-${Date.now()}.wav`)
  const child = spawn(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      ...(await microphoneInput()),
      '-ac',
      '1',
      '-ar',
      '16000',
      '-y',
      file,
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  )
  let errors = ''
  child.stderr.on('data', (chunk: Buffer) => (errors += chunk.toString()))
  const exited = new Promise<number | null>((resolve, reject) => {
    child.on('error', (error: NodeJS.ErrnoException) =>
      reject(
        error.code === 'ENOENT'
          ? new Error('Voice needs ffmpeg on the PATH (or FFMPEG_PATH).')
          : error,
      ),
    )
    child.on('exit', resolve)
  })
  // ffmpeg stops at once when the device does not open.
  const early = await Promise.race([
    exited.then(() => 'exited' as const),
    new Promise<'running'>((resolve) =>
      setTimeout(() => resolve('running'), 400),
    ),
  ])
  if (early === 'exited')
    throw new Error(`The microphone did not open. ${errors.trim()}`.trim())
  return {
    stop: async () => {
      // `q` makes ffmpeg finish the file.
      child.stdin.end('q')
      await exited
      try {
        return new Uint8Array(await readFile(file))
      } finally {
        await rm(file, { force: true })
      }
    },
    cancel: () => {
      child.kill()
      void exited.finally(() => rm(file, { force: true }))
    },
  }
}

/** Where the samples of a WAV file start: after its `data` chunk header. */
function wavDataStart(wav: Uint8Array) {
  // ffmpeg adds a LIST chunk, so the header is not always 44 bytes.
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  for (let offset = 12; offset + 8 <= wav.byteLength;) {
    const id = String.fromCharCode(...wav.subarray(offset, offset + 4))
    const size = view.getUint32(offset + 4, true)
    if (id === 'data') return offset + 8
    offset += 8 + size + (size % 2)
  }
  return wav.byteLength
}

/**
 * The loudness of a WAV recording: the root mean square of its 16-bit
 * samples, from 0 to 32768, without the constant offset some microphones add.
 */
export function loudness(wav: Uint8Array) {
  const start = wav.byteOffset + wavDataStart(wav)
  const count = Math.floor((wav.byteOffset + wav.byteLength - start) / 2)
  const samples = new Int16Array(wav.buffer.slice(start, start + count * 2))
  if (samples.length === 0) return 0
  let sum = 0
  let squares = 0
  for (const sample of samples) {
    sum += sample
    squares += sample * sample
  }
  const mean = sum / samples.length
  return Math.sqrt(Math.max(0, squares / samples.length - mean * mean))
}

/**
 * Is a recording too quiet to hold speech? Transcription models make up words
 * for silence, so a quiet recording is not sent. VOICE_MIN_LOUDNESS changes
 * the limit.
 */
export function isSilent(wav: Uint8Array) {
  return loudness(wav) < Number(process.env.VOICE_MIN_LOUDNESS || 300)
}

/**
 * The words in `audio`, with OpenAI, or Grok when only an xAI key is set.
 * `name` gives the format, for example `voice.wav`.
 */
export async function transcribe(audio: Uint8Array, name = 'voice.wav') {
  const file = new File([audio.slice()], name)
  if (process.env.OPENAI_API_KEY) {
    const result = await generateTranscription({
      adapter: openaiTranscription('gpt-4o-transcribe'),
      audio: file,
    })
    return result.text.trim()
  }
  if (process.env.XAI_API_KEY) {
    const result = await generateTranscription({
      adapter: grokTranscription('grok-stt'),
      audio: file,
    })
    return result.text.trim()
  }
  throw new Error(
    'Voice needs OPENAI_API_KEY or XAI_API_KEY for transcription.',
  )
}

const SKIP = new Set(['node_modules', '.git', 'dist'])

/** The files in `dir` and its folders, 3 levels deep. */
async function filesIn(dir: string, depth = 0): Promise<Array<string>> {
  if (depth > 3) return []
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files: Array<string> = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await filesIn(path, depth + 1)))
    else files.push(path)
  }
  return files
}

/** Spoken text in a form that file names match: "cat dot png" is "cat.png". */
function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+dot\s+/g, '.')
    .replace(/\s*\.\s*(?=[a-z0-9]{2,4}\b)/g, '.')
}

/** The media a turn made, newest last, for "the last image" and the like. */
export interface RecentMedia {
  kind: string
  path: string
}

const RECENT =
  /\b(last|latest|previous|that|this|the)\s+(image|picture|photo|video|clip|song|track|audio|sound)\b/

const KIND_OF_WORD: Record<string, string> = {
  image: 'image',
  picture: 'image',
  photo: 'image',
  video: 'video',
  clip: 'video',
  song: 'audio',
  track: 'audio',
  audio: 'audio',
  sound: 'audio',
}

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
  const spoken = normalize(text)
  const found = new Set<string>()
  for (const root of roots) {
    for (const file of await filesIn(root)) {
      const name = basename(file).toLowerCase()
      if (extname(name) !== '' && spoken.includes(name)) found.add(file)
    }
  }
  const match = RECENT.exec(spoken)
  const kind = match ? KIND_OF_WORD[match[2] ?? ''] : undefined
  const latest = kind
    ? [...recent].reverse().find((media) => media.kind === kind)
    : undefined
  if (latest) found.add(latest.path)
  const files = [...found].map((file) => relative(process.cwd(), file))
  const refs = files.map((file) => `@"${file}"`)
  return { text: [text, ...refs].join(' '), files }
}
