import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EventType, defineAgent, keyedAdapter } from '@tanstack/ai'
import { defineHarness } from '@tanstack/ai-harness'
import {
  compact,
  goal,
  modelPicker,
  permissions,
  projectInstructions,
  providerKeys,
  todos,
  usage,
  workspaceTools,
} from '@tanstack/ai-harness/plugins'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { anthropicByok } from '@tanstack/ai-anthropic/byok'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { codeMode } from '@tanstack/ai-code-mode/harness'
import { codexText } from '@tanstack/ai-codex'
import { falByok } from '@tanstack/ai-fal/byok'
import { mcpConnector } from '@tanstack/ai-mcp/connector'
import { createGrokText } from '@tanstack/ai-grok'
import { grokByok } from '@tanstack/ai-grok/byok'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { createOpenaiChat, openaiTranscription } from '@tanstack/ai-openai'
import { openaiByok } from '@tanstack/ai-openai/byok'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { openrouterSignIn } from '@tanstack/ai-openrouter/pkce'
import {
  defineSandbox,
  defineWorkspace,
  localSource,
} from '@tanstack/ai-sandbox'
import { codingAgents } from '@tanstack/ai-sandbox/harness'
import type { CodingAgentConfig } from '@tanstack/ai-sandbox/harness'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { z } from 'zod'
import {
  imageAgent,
  songAgent,
  soundAgent,
  speechAgent,
  videoAgent,
} from './media'
import { effortPicker } from './effort'
import { envKey } from './store'
import type { AnyTextAdapter, KeyedAdapter } from '@tanstack/ai'
import type { ByokProvider, ProviderId } from '@tanstack/ai/byok'

// The agent works in ./playground, so it cannot touch the rest of your disk.
const root = fileURLToPath(new URL('../playground', import.meta.url))

/**
 * The demo model's answer, in markdown, so the screen shows how it renders
 * markdown. Ask it for a chart, and it draws one in Mermaid.
 */
function demoReply(said: string) {
  const chart = /chart|mermaid|diagram/i.test(said)
    ? '\n\n```mermaid\ngraph LR\n  You --> Harness --> Model\n  Harness --> Tools\n```'
    : ''
  return (
    [
      `**(demo model)** You said: "${said}".`,
      '',
      '- Type `/connect` to connect a provider.',
      '- Type `/model` to pick a real model.',
    ].join('\n') + chart
  )
}

/** Without any model key, a stand-in model that explains how to add one. */
function demoModel(): AnyTextAdapter {
  let calls = 0
  return {
    kind: 'text',
    name: 'demo',
    model: 'demo',
    '~types': {
      providerOptions: {},
      inputModalities: ['text'],
      messageMetadataByModality: {
        text: undefined,
        image: undefined,
        audio: undefined,
        video: undefined,
        document: undefined,
      },
      toolCapabilities: [],
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined as never,
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    chatStream: (options) =>
      (async function* () {
        calls += 1
        const messageId = `demo-${calls}`
        const last = options.messages.at(-1)
        const said = typeof last?.content === 'string' ? last.content : ''
        const now = Date.now()
        yield {
          type: EventType.RUN_STARTED,
          runId: 'demo',
          threadId: 'demo',
          timestamp: now,
        }
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
          timestamp: now,
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: demoReply(said),
          timestamp: now,
        }
        yield { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: now }
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'demo',
          threadId: 'demo',
          timestamp: now,
          // ponytail: about 4 characters a token, so the footer counts in demo mode too.
          usage: {
            promptTokens: Math.ceil(
              JSON.stringify(options.messages).length / 4,
            ),
            completionTokens: 30,
            totalTokens:
              Math.ceil(JSON.stringify(options.messages).length / 4) + 30,
          },
          metadata: { tanstack: { finishReason: 'stop' } },
        }
      })(),
  }
}

/** Is a key for `provider` in the environment (the `.env` shortcut)? */
function hasEnvKey(provider: ByokProvider | ProviderId) {
  return typeof provider !== 'string' && envKey(provider) !== null
}

const openai = (model: Parameters<typeof createOpenaiChat>[0]) =>
  keyedAdapter(openaiByok, (key) => createOpenaiChat(model, key))
const anthropic = (model: Parameters<typeof createAnthropicChat>[0]) =>
  keyedAdapter(anthropicByok, (key) => createAnthropicChat(model, key))
const grok = (model: Parameters<typeof createGrokText>[0]) =>
  keyedAdapter(grokByok, (key) => createGrokText(model, key))
const openrouter = (model: Parameters<typeof createOpenRouterText>[0]) =>
  keyedAdapter(openrouterByok, (key) => createOpenRouterText(model, key))

/**
 * The models `/model <name>` can switch to, by their real model id. Each one
 * is built for each turn with the user's own key: the key saved with
 * `/connect <provider>`, else the env var. A model without a key asks the
 * user to connect.
 */
const models = {
  'gpt-6-astra': openai('gpt-6-astra'),
  'gpt-6-sol': openai('gpt-6-sol'),
  'gpt-6-luna': openai('gpt-6-luna'),
  'claude-opus-5-5': anthropic('claude-opus-5-5'),
  'claude-fable-5-1': anthropic('claude-fable-5-1'),
  'claude-sonnet-5': anthropic('claude-sonnet-5'),
  'claude-haiku-4-5': anthropic('claude-haiku-4-5'),
  'grok-4.7': grok('grok-4.7'),
  'grok-4.6': grok('grok-4.6'),
  'openai/gpt-6-astra': openrouter('openai/gpt-6-astra'),
  'anthropic/claude-opus-5.5': openrouter('anthropic/claude-opus-5.5'),
  'google/gemini-3.1-pro-preview': openrouter('google/gemini-3.1-pro-preview'),
  'x-ai/grok-4.7': openrouter('x-ai/grok-4.7'),
}

// The first model with an env key starts, so a `.env` works as before. The
// saved keys belong to a session, so without an env key `gpt-6-astra`
// starts, and the first message asks the user to run /connect.
const envModel = Object.entries(models).find(([, model]) =>
  hasEnvKey(model.provider),
)
const startModel = envModel?.[0] ?? 'gpt-6-astra'
// Any of the models: the harness, /compact, and /goal take this common type.
const main: KeyedAdapter<AnyTextAdapter> =
  envModel?.[1] ?? models['gpt-6-astra']
// With no env key at all, `/model demo` answers without a key.
const choices = { ...models, ...(envModel ? {} : { demo: demoModel() }) }

/**
 * What the screen shows for each model: the provider that must be connected,
 * the size of its context window (from each provider's model-meta), and
 * whether `/effort` can set how hard it thinks.
 */
export const modelInfo: Record<
  string,
  { provider: string; contextWindow: number; effort: boolean }
> = {
  'gpt-6-astra': { provider: 'openai', contextWindow: 1_050_000, effort: true },
  'gpt-6-sol': { provider: 'openai', contextWindow: 1_050_000, effort: true },
  'gpt-6-luna': { provider: 'openai', contextWindow: 1_050_000, effort: true },
  'claude-opus-5-5': {
    provider: 'anthropic',
    contextWindow: 1_000_000,
    effort: true,
  },
  'claude-fable-5-1': {
    provider: 'anthropic',
    contextWindow: 1_000_000,
    effort: true,
  },
  'claude-sonnet-5': {
    provider: 'anthropic',
    contextWindow: 1_000_000,
    effort: true,
  },
  // Haiku has no effort setting (output_config) in its model-meta.
  'claude-haiku-4-5': {
    provider: 'anthropic',
    contextWindow: 200_000,
    effort: false,
  },
  'grok-4.7': { provider: 'grok', contextWindow: 500_000, effort: true },
  'grok-4.6': { provider: 'grok', contextWindow: 500_000, effort: true },
  'openai/gpt-6-astra': {
    provider: 'openrouter',
    contextWindow: 1_050_000,
    effort: true,
  },
  'anthropic/claude-opus-5.5': {
    provider: 'openrouter',
    contextWindow: 1_000_000,
    effort: true,
  },
  'google/gemini-3.1-pro-preview': {
    provider: 'openrouter',
    contextWindow: 1_048_576,
    effort: true,
  },
  'x-ai/grok-4.7': {
    provider: 'openrouter',
    contextWindow: 500_000,
    effort: true,
  },
}

// `/connect openrouter` signs in with the browser: no key to paste, and one
// sign-in covers GPT, Claude, Gemini, and more. OpenAI, Anthropic, xAI, and
// fal have no browser sign-in for other apps, so `/connect openai` opens the
// page to make a key, then asks for it (the screen hides it as you type).
export const keyProviders = [
  { ...openrouterByok, signIn: openrouterSignIn() },
  { ...openaiByok, keyUrl: 'https://platform.openai.com/api-keys' },
  { ...anthropicByok, keyUrl: 'https://console.anthropic.com/settings/keys' },
  { ...grokByok, keyUrl: 'https://console.x.ai' },
  { ...falByok, keyUrl: 'https://fal.ai/dashboard/keys' },
]

/** Is `command` on the PATH? Checks the Windows extensions too. */
function onPath(command: string) {
  const extensions =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')
      : ['']
  return (process.env.PATH ?? '')
    .split(delimiter)
    .some((dir) =>
      extensions.some((extension) =>
        existsSync(join(dir, `${command}${extension.toLowerCase()}`)),
      ),
    )
}

/**
 * A top-level setting of your ~/.codex/config.toml (the lines before the
 * first `[section]`), so the example runs Codex the way you set it up.
 */
function codexSetting(key: string) {
  const config = join(homedir(), '.codex', 'config.toml')
  if (!existsSync(config)) return undefined
  const [topLevel = ''] = readFileSync(config, 'utf8').split(/^\s*\[/m)
  return new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, 'm').exec(topLevel)?.[1]
}

const CODEX_SANDBOX_MODES = [
  'read-only',
  'workspace-write',
  'danger-full-access',
] as const

/**
 * The Codex sandbox: CODEX_SANDBOX_MODE, else `sandbox_mode` in your Codex
 * config, else workspace-write. On Windows, workspace-write can block the
 * folder (Access is denied).
 */
function codexSandbox() {
  const mode = process.env.CODEX_SANDBOX_MODE ?? codexSetting('sandbox_mode')
  return (
    CODEX_SANDBOX_MODES.find((known) => known === mode) ?? 'workspace-write'
  )
}

/** A typed agent you can run with `/agent haiku {"topic":"rain"}`. */
const haiku = defineAgent({
  name: 'haiku',
  description: 'Writes a haiku about a topic',
  inputSchema: z.object({ topic: z.string() }),
  run: async (ctx) =>
    ctx.chat({
      adapter: await ctx.keys.adapter(main),
      messages: [
        {
          role: 'user',
          content: `Write one haiku about ${ctx.input.topic}. Only the haiku.`,
        },
      ],
      stream: false,
    }),
})

// The model calls the media agents as tools, and the harness keeps each file
// they make. Each one uses the key its provider needs. Without the key, the
// tool says which /connect to run:
// - OpenAI: images, speech, and video with Sora.
// - xAI Grok: video with Grok Imagine (it wins over Sora).
// - fal: songs and sound effects.
const media = [imageAgent, speechAgent, videoAgent, songAgent, soundAgent]

// Notion and Linear through their MCP servers. `/connect notion` signs in
// through the browser. No app setup or API key is needed.
const notion = mcpConnector({
  id: 'notion',
  label: 'Notion',
  url: 'https://mcp.notion.com/mcp',
})
const linear = mcpConnector({
  id: 'linear',
  label: 'Linear',
  url: 'https://mcp.linear.app/mcp',
})

// The lead model can hand coding work to your local Claude Code and Codex.
// Each one turns on when its CLI is on the PATH (CODING_AGENTS=0 turns both
// off). They work in ./playground with your own `claude login` and
// `codex login`, so the API keys are removed from their processes.
const useCodingAgents = process.env.CODING_AGENTS !== '0'
const codingAgentList: Record<string, CodingAgentConfig> = {}
if (useCodingAgents && onPath('claude')) {
  codingAgentList.claude_code = {
    adapter: claudeCodeText('claude-opus-4-8', {
      authMode: 'host',
      permissionMode: 'acceptEdits',
    }),
    description:
      'Claude Code, the local coding agent. Larger changes, refactors, and reviews in ./playground.',
  }
}
if (useCodingAgents && onPath('codex')) {
  codingAgentList.codex = {
    // A ChatGPT login supports only some models, so the model and the sandbox
    // come from your Codex config unless CODEX_MODEL or CODEX_SANDBOX_MODE is
    // set.
    adapter: codexText(
      process.env.CODEX_MODEL ?? codexSetting('model') ?? 'gpt-5.3-codex',
      {
        authMode: 'host',
        sandboxMode: codexSandbox(),
        approvalPolicy: 'never',
      },
    ),
    description:
      'Codex, the local coding agent. Quick fixes, scripts, and tests in ./playground.',
  }
}
const coding =
  Object.keys(codingAgentList).length > 0
    ? [
        codingAgents({
          sandbox: defineSandbox({
            id: 'playground',
            provider: localProcessSandbox({
              dir: root,
              scrubEnv: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
            }),
            workspace: defineWorkspace({ source: localSource(root) }),
          }),
          agents: codingAgentList,
        }),
      ]
    : []

const tools = [
  ...media.map((agent) => agent.name),
  ...Object.keys(codingAgentList),
]

/**
 * A feature that a key for any one of `providers` turns on. `on` is the
 * state at startup, from the env vars only. The screen follows the saved
 * keys live.
 */
function keyFeature(
  name: string,
  providers: Array<ByokProvider>,
  needs: string,
) {
  return {
    name,
    on: providers.some(hasEnvKey),
    needs,
    providers: providers.map((provider) => provider.id),
  }
}

/**
 * What this session can do, and what turns each one on, for the screen.
 * `providers` are the ids of the key providers a feature needs (any one).
 */
export const features = [
  keyFeature(
    'voice',
    [openaiByok, grokByok],
    'an OpenAI or xAI key (/connect openai or /connect grok), and ffmpeg',
  ),
  keyFeature('images', [openaiByok], 'an OpenAI key (/connect openai)'),
  keyFeature('speech', [openaiByok], 'an OpenAI key (/connect openai)'),
  keyFeature(
    'video',
    [grokByok, openaiByok],
    'an xAI or OpenAI key (/connect grok or /connect openai)',
  ),
  keyFeature('songs', [falByok], 'a fal key (/connect fal)'),
  {
    name: 'claude code',
    on: 'claude_code' in codingAgentList,
    needs: '`claude` on the PATH',
    providers: [],
  },
  {
    name: 'codex',
    on: 'codex' in codingAgentList,
    needs: '`codex` on the PATH',
    providers: [],
  },
  { name: 'notion', on: true, needs: '', providers: [] },
  { name: 'linear', on: true, needs: '', providers: [] },
]

export const assistant = defineHarness({
  name: 'example/coder',
  description:
    'A coding agent in the terminal: files, voice, media, Notion, Linear, and local coding agents',
  adapter: main,
  systemPrompts: [
    'You are a careful coding agent that works in ./playground. Read files before you edit them. Keep answers short.',
    `Your agent tools: ${tools.join(', ') || 'none'}. The user gets each file a media tool makes, so do not paste file contents or links.`,
    'When the user asks to run Codex or Claude Code (by voice too: "run a Codex agent"), call that tool with a clear task, then give its answer back in a few lines.',
    'The user can send files and voice messages. When they send an image and ask for a new version, a style, or an edit of it, call the image tool with useAttachedImages.',
    'You can read Notion and Linear when they are connected. If a tool says to sign in or that a key is missing, tell the user the /connect command it names, for example /connect notion or /connect openai.',
  ],
  agents: [haiku],
  subagents: { agents: media },
  // Audio files the user sends become text for models that cannot read audio.
  // ponytail: `media.transcribe` takes a plain adapter, not a keyed one, so
  // this needs OPENAI_API_KEY in the env. A key saved with /connect does not
  // turn it on. Voice messages on the screen use the saved key (src/voice.ts).
  ...(process.env.OPENAI_API_KEY
    ? { media: { transcribe: openaiTranscription('gpt-4o-transcribe') } }
    : {}),
  plugins: () => [
    notion,
    linear,
    permissions(),
    workspaceTools({ root }),
    todos(),
    providerKeys({ providers: keyProviders }),
    modelPicker({ choices, default: startModel }),
    effortPicker({
      providerOf: (model) =>
        modelInfo[model]?.effort ? modelInfo[model].provider : undefined,
    }),
    projectInstructions({ root }),
    compact({ adapter: main }),
    usage(),
    // /goal keeps the agent working until the main model says the goal is met.
    goal({ judge: main }),
    // Read-only tools (file reads, read-only Notion and Linear tools) move
    // behind execute_typescript, so the model can call several in one program.
    // The program runs in a QuickJS isolate. Any @tanstack/ai-isolate-* driver
    // works here.
    codeMode({ driver: createQuickJSIsolateDriver() }),
    ...coding,
  ],
})
