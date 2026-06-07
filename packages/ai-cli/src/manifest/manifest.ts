import { ExitCode } from '../core/exit-codes'
import { bundledProviders } from '../core/providers'
import type { CliManifest, CommandSpec, FlagSpec } from './types'

/** Schema version of the introspect document; bump on breaking surface changes. */
export const MANIFEST_VERSION = '1'

/** Flags accepted by every command. */
export const COMMON_FLAGS: Array<FlagSpec> = [
  {
    name: 'model',
    type: 'string',
    description: 'Model as a "provider/model" slug, e.g. openai/gpt-5.5.',
  },
  { name: 'apiKey', type: 'string', description: 'API key (overrides env vars).' },
  {
    name: 'json',
    type: 'boolean',
    description: 'Emit a single buffered JSON result to stdout.',
  },
  {
    name: 'stream',
    type: 'boolean',
    description: 'Emit the AG-UI event stream as NDJSON to stdout.',
  },
  {
    name: 'output',
    short: 'o',
    type: 'string',
    description: 'Write artifact to this path. "-" writes bytes to stdout.',
  },
  {
    name: 'preview',
    type: 'boolean',
    default: true,
    description: 'Inline-preview artifacts in a capable terminal (use --no-preview to disable).',
  },
  {
    name: 'config',
    type: 'json',
    description: 'Options as a JSON file path or inline JSON string.',
  },
  { name: 'verbose', type: 'boolean', description: 'Verbose debug logging to stderr.' },
  { name: 'quiet', type: 'boolean', description: 'Suppress non-error stderr output.' },
]

const ATTACHMENT_FLAG: FlagSpec = {
  name: 'attachment',
  type: 'string[]',
  repeatable: true,
  description: 'Attach a file (repeatable). "-" reads stdin.',
}

export const COMMANDS: Array<CommandSpec> = [
  {
    name: 'chat',
    description: 'Chat / agentic text generation with optional tools and structured output.',
    activity: 'chat',
    acceptsPrompt: true,
    producesArtifact: false,
    flags: [
      ATTACHMENT_FLAG,
      { name: 'system', type: 'string', description: 'System prompt (text or file path).' },
      {
        name: 'messages',
        type: 'json',
        description: 'Full message history as a JSON array (stateless multi-turn).',
      },
      { name: 'threadId', type: 'string', description: 'Correlation id passed through to telemetry/AG-UI.' },
      {
        name: 'maxSteps',
        type: 'number',
        description: 'Max agent-loop iterations (tool-calling).',
      },
      {
        name: 'mcp',
        type: 'string[]',
        repeatable: true,
        description: 'MCP server (command or URL) exposing tools (repeatable).',
      },
      { name: 'codeMode', type: 'boolean', description: 'Enable the sandboxed execute_typescript tool.' },
      {
        name: 'schema',
        type: 'json',
        description: 'JSON Schema for structured output (file path or inline). Result is under .data.',
      },
    ],
  },
  {
    name: 'image',
    description: 'Generate an image from a prompt.',
    activity: 'image',
    acceptsPrompt: true,
    producesArtifact: true,
    flags: [
      ATTACHMENT_FLAG,
      { name: 'size', type: 'string', description: 'Output size, e.g. 1024x1024.' },
      { name: 'count', type: 'number', default: 1, description: 'Number of images to generate.' },
    ],
  },
  {
    name: 'video',
    description: 'Generate a video from a prompt (async job; blocks until done by default).',
    activity: 'video',
    acceptsPrompt: true,
    producesArtifact: true,
    experimental: true,
    flags: [
      ATTACHMENT_FLAG,
      {
        name: 'wait',
        type: 'boolean',
        default: true,
        description: 'Poll until the job completes (use --no-wait to return the job id immediately).',
      },
      { name: 'size', type: 'string', description: 'Output size / resolution.' },
    ],
  },
  {
    name: 'audio',
    description: 'Generate audio (music / sound effects) from a prompt.',
    activity: 'audio',
    acceptsPrompt: true,
    producesArtifact: true,
    flags: [{ name: 'duration', type: 'number', description: 'Desired duration in seconds.' }],
  },
  {
    name: 'speech',
    aliases: ['tts'],
    description: 'Synthesize speech audio from text (text-to-speech).',
    activity: 'speech',
    acceptsPrompt: true,
    producesArtifact: true,
    flags: [
      { name: 'voice', type: 'string', description: 'Voice id.' },
      { name: 'format', type: 'string', description: 'Audio format: mp3, opus, aac, flac, wav, pcm.' },
      { name: 'speed', type: 'number', description: 'Playback speed 0.25–4.0.' },
    ],
  },
  {
    name: 'transcribe',
    aliases: ['stt'],
    description: 'Transcribe an audio file to text (speech-to-text).',
    activity: 'transcription',
    acceptsPrompt: false,
    producesArtifact: false,
    flags: [
      ATTACHMENT_FLAG,
      { name: 'language', type: 'string', description: 'ISO-639-1 language hint, e.g. en.' },
    ],
  },
  {
    name: 'summarize',
    description: 'Summarize input text.',
    activity: 'summarize',
    acceptsPrompt: true,
    producesArtifact: false,
    flags: [
      { name: 'maxLength', type: 'number', description: 'Maximum summary length.' },
      {
        name: 'style',
        type: 'string',
        description: 'Summary style: bullet-points, paragraph, concise.',
      },
      { name: 'focus', type: 'string[]', repeatable: true, description: 'Topic to focus on (repeatable).' },
    ],
  },
]

/** Convert a camelCase flag identifier to its kebab-case CLI spelling. */
export function toKebabFlag(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

/** Annotate a flag with its exact CLI spelling for the introspect document. */
function withFlagSpelling(flag: FlagSpec): FlagSpec {
  const kebab = toKebabFlag(flag.name)
  // Default-true booleans are negatable flags (`--no-x`).
  const spelling = flag.type === 'boolean' && flag.default === true ? `--no-${kebab}` : `--${kebab}`
  return { ...flag, flag: spelling }
}

/** Build the full serializable manifest. */
export function buildManifest(cliVersion: string): CliManifest {
  return {
    bin: 'ts-ai',
    manifestVersion: MANIFEST_VERSION,
    cliVersion,
    bundledProviders: bundledProviders(),
    commonFlags: COMMON_FLAGS.map(withFlagSpelling),
    commands: COMMANDS.map((c) => ({ ...c, flags: c.flags.map(withFlagSpelling) })),
    exitCodes: {
      success: ExitCode.Success,
      runtime: ExitCode.Runtime,
      usage: ExitCode.Usage,
      provider: ExitCode.Provider,
      providerNotInstalled: ExitCode.ProviderNotInstalled,
    },
  }
}

export function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find(
    (c) => c.name === name || (c.aliases?.includes(name) ?? false),
  )
}
