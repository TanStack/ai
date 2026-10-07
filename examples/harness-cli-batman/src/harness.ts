import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
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
} from '@tanstack/ai-harness/plugins'
import { workspaceTools } from '@tanstack/ai-harness/plugins/coding'
import { ANTHROPIC_MODELS, createAnthropicChat } from '@tanstack/ai-anthropic'
import { anthropicByok } from '@tanstack/ai-anthropic/byok'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { codeMode } from '@tanstack/ai-code-mode/harness'
import { codexText } from '@tanstack/ai-codex'
import { falByok } from '@tanstack/ai-fal/byok'
import { mcpConnector } from '@tanstack/ai-mcp/connector'
import { GROK_CHAT_MODELS, createGrokText } from '@tanstack/ai-grok'
import { grokByok } from '@tanstack/ai-grok/byok'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { getModel, supportedReasoningLevels } from '@tanstack/ai-models'
import {
  OPENAI_CHAT_MODELS,
  createOpenaiChat,
  openaiTranscription,
} from '@tanstack/ai-openai'
import { openaiByok } from '@tanstack/ai-openai/byok'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { OPENROUTER_CHAT_MODELS } from '@tanstack/ai-openrouter/model-meta'
import { openrouterSignIn } from '@tanstack/ai-openrouter/pkce'
import {
  defineSandbox,
  defineWorkspace,
  localSource,
} from '@tanstack/ai-sandbox'
import { codingAgents } from '@tanstack/ai-sandbox/harness'
import type { CodingAgentConfig } from '@tanstack/ai-sandbox/harness'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { skills } from '@tanstack/ai-skills/harness'
import { z } from 'zod'
import {
  imageAgent,
  songAgent,
  soundAgent,
  speechAgent,
  videoAgent,
} from './media'
import { effortPicker } from './effort'
import { SAVE_DIR } from './credentials'
import { SCREEN_COMMANDS } from './screen/commands'
import { envKey, providerKey } from './store'
import type { AnyTextAdapter, KeyedAdapter } from '@tanstack/ai'
import type { ModelRecord } from '@tanstack/ai-models'
import type { ByokProvider } from '@tanstack/ai/byok'

// The agent works in the folder where you started the app (src/workdir.ts).
// A path outside it asks you first.
const root = process.cwd()

/**
 * The demo model's answer, in markdown, so the screen shows how it renders
 * markdown. Ask it for a chart, and it draws one in Mermaid.
 */
function demoReply(said: string) {
  const chart = /chart|mermaid|diagram/i.test(said)
    ? '\n\n```mermaid\ngraph LR\n  You --> Batman --> Model\n  Batman --> Tools\n  Batman --> Gotham\n```'
    : ''
  return (
    [
      `🦇 **(demo, the night shift)** You said: "${said}".`,
      '',
      'The cave has no key yet. Light the signal:',
      '- Type `/connect` to connect a provider.',
      '- Type `/model` to pick a real model.',
      '',
      '_I am the night. I am Batman._',
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
function hasEnvKey(provider: ByokProvider) {
  return envKey(provider) !== null
}

const openai = (model: (typeof OPENAI_CHAT_MODELS)[number]) =>
  keyedAdapter(openaiByok, (key) => createOpenaiChat(model, key))
const anthropic = (model: (typeof ANTHROPIC_MODELS)[number]) =>
  keyedAdapter(anthropicByok, (key) => createAnthropicChat(model, key))
const grok = (model: (typeof GROK_CHAT_MODELS)[number]) =>
  keyedAdapter(grokByok, (key) => createGrokText(model, key))
const openrouter = (model: (typeof OPENROUTER_CHAT_MODELS)[number]) =>
  keyedAdapter(openrouterByok, (key) => createOpenRouterText(model, key))

/** A model `/model` can pick. */
export interface ModelEntry {
  id: string
  /** The key provider to connect, for example `openai` or `grok`. */
  provider: string
  record: ModelRecord
  adapter: KeyedAdapter<AnyTextAdapter>
}

/**
 * The models of one provider: each chat model its adapter knows that the
 * `@tanstack/ai-models` catalog has too. The catalog gives the context size,
 * the reasoning levels, and the price. Sorted by id, the newest version of
 * each family first (`claude-opus-5-5` before `claude-opus-4-8`).
 */
function providerModels<TModel extends string>(
  catalogId: string,
  byok: ByokProvider,
  ids: ReadonlyArray<TModel>,
  adapter: (model: TModel) => KeyedAdapter<AnyTextAdapter>,
  start: TModel,
) {
  const models = ids.flatMap((id): Array<ModelEntry> => {
    const record = getModel(catalogId, id)
    return record
      ? [{ id, provider: byok.id, record, adapter: adapter(id) }]
      : []
  })
  return {
    id: byok.id,
    label: byok.label,
    byok,
    start,
    models: models.sort((a, b) =>
      b.id.localeCompare(a.id, 'en', { numeric: true }),
    ),
  }
}

/**
 * The models `/model` can switch to, by provider and by their real model id.
 * Each one is built for each turn with the user's own key: the key saved
 * with `/connect <provider>`, else the env var. A model without a key asks
 * the user to connect.
 */
export const modelProviders = [
  providerModels(
    'openai',
    openaiByok,
    OPENAI_CHAT_MODELS,
    openai,
    'gpt-6-astra',
  ),
  providerModels(
    'anthropic',
    anthropicByok,
    ANTHROPIC_MODELS,
    anthropic,
    'claude-opus-5-5',
  ),
  providerModels('xai', grokByok, GROK_CHAT_MODELS, grok, 'grok-4.7'),
  providerModels(
    'openrouter',
    openrouterByok,
    OPENROUTER_CHAT_MODELS,
    openrouter,
    'openai/gpt-6-astra',
  ),
]

/**
 * Each model by its id: the provider that must be connected, its catalog
 * record (context size, reasoning levels, price), and its adapter. The ids
 * of the providers do not overlap: OpenRouter ids start with the vendor.
 */
export const modelInfo: Record<string, ModelEntry> = Object.fromEntries(
  modelProviders.flatMap((provider) =>
    provider.models.map((model) => [model.id, model]),
  ),
)

// A new session starts on the first provider with a key: one saved with
// /connect, or one in the env (a `.env` file). Without any key, `gpt-6-astra`
// starts, and the first message asks the user to run /connect. A resumed
// session keeps the model it had.
const keyed = await Promise.all(
  modelProviders.map(async (provider) =>
    (await providerKey(provider.byok, 'startup')) === null ? [] : [provider],
  ),
)
const startProvider = keyed.flat()[0]
const startModel = startProvider?.start ?? 'gpt-6-astra'
// The start model: the harness, /compact, /goal, and /agent haiku use it.
const main: KeyedAdapter<AnyTextAdapter> = modelInfo[startModel].adapter
// With no key at all, `/model demo` answers without a key.
const choices = {
  ...Object.fromEntries(
    Object.values(modelInfo).map((model) => [model.id, model.adapter]),
  ),
  ...(startProvider ? {} : { demo: demoModel() }),
}

/** Does the model think, so `/effort` changes it? */
export function reasons(model: string) {
  const record = modelInfo[model]?.record
  return record
    ? supportedReasoningLevels(record).some((level) => level !== 'off')
    : false
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
// off). They work in your folder with your own `claude login` and
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
      'Claude Code, the local coding agent. Larger changes, refactors, and reviews in the workspace.',
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
      'Codex, the local coding agent. Quick fixes, scripts, and tests in the workspace.',
  }
}
const coding =
  Object.keys(codingAgentList).length > 0
    ? [
        codingAgents({
          sandbox: defineSandbox({
            id: 'workspace',
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
  name: 'gotham/batman',
  description:
    'Batman in the terminal: files, voice, media, Notion, Linear, and local coding agents',
  adapter: main,
  systemPrompts: [
    'You are Batman, the Dark Knight, working as a careful coding agent in the workspace, the folder where the user started you. Speak like Batman: short, grave, direct. Call the user Commissioner when it fits. Use a bat emoji when you start a reply. Read files before you edit them. Keep answers short.',
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
    workspaceTools({ root, outside: 'ask' }),
    todos(),
    providerKeys({ providers: keyProviders }),
    modelPicker({ choices, default: startModel }),
    effortPicker({ reasons }),
    projectInstructions({ root }),
    compact({ adapter: main }),
    usage(),
    // /goal keeps the agent working until the main model says the goal is met.
    goal({ judge: main }),
    // Skills: each folder holds skill folders with a SKILL.md. Each skill is a
    // /<name> command, and the model sees the list. A skill you add while the
    // app runs shows at once. The repo folders (where you run the app) win
    // over the global one. A skill named like a screen command is
    // /skill:<name>.
    skills({
      dirs: ['./.agents/skills', './.claude/skills', join(SAVE_DIR, 'skills')],
      reserved: SCREEN_COMMANDS.map((command) => command.name),
    }),
    // Read-only tools (file reads, read-only Notion and Linear tools) move
    // behind execute_typescript, so the model can call several in one program.
    // The tools are lazy: the model gets their names, asks discover_tools for
    // the signatures it needs, then calls them in the program. The program
    // runs in a QuickJS isolate. Any @tanstack/ai-isolate-* driver works here.
    codeMode({
      driver: createQuickJSIsolateDriver(),
      lazy: true,
      lazyToolsConfig: { includeDescription: 'first-sentence' },
    }),
    ...coding,
  ],
})
