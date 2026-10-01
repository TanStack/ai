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
  todos,
  usage,
  workspaceTools,
} from '@tanstack/ai-harness/plugins'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { createCloudflareText } from '@tanstack/ai-cloudflare'
import { cloudflareByok } from '@tanstack/ai-cloudflare/byok'
import { codeMode } from '@tanstack/ai-code-mode/harness'
import { codexText } from '@tanstack/ai-codex'
import { createCloudflareIsolateDriver } from '@tanstack/ai-isolate-cloudflare'
import { mcpConnector } from '@tanstack/ai-mcp/connector'
import { getModels, supportedReasoningLevels } from '@tanstack/ai-models'
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
import { cloudflareConnect, cloudflareRest } from './cloudflare-connect'
import { imageAgent, speechAgent } from './media'
import { effortPicker } from './effort'
import { SAVE_DIR, currentWorker } from './worker-config'
import { SCREEN_COMMANDS } from './screen/commands'
import { envKey } from './store'
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
function hasEnvKey(provider: ByokProvider) {
  return envKey(provider) !== null
}

/** A model `/model` can pick. */
export interface ModelEntry {
  /** The id the Cloudflare adapter takes, for example `anthropic/claude-sonnet-5`. */
  id: string
  /** The key provider to connect: `cloudflare` for every model here. */
  provider: string
  record: ModelRecord
  adapter: KeyedAdapter<AnyTextAdapter>
}

/**
 * A Cloudflare model, built just before each call with your token and the
 * connected account, so every call goes through your AI Gateway.
 */
function cloudflareModel(id: string, record: ModelRecord): ModelEntry {
  return {
    id,
    provider: cloudflareByok.id,
    record,
    adapter: keyedAdapter(cloudflareByok, (token) =>
      createCloudflareText(id, cloudflareRest(token)),
    ),
  }
}

/**
 * The id that `createCloudflareText` takes for an AI Gateway catalog model:
 * `anthropic/...` and `openai/...` for the models without a vendor, the
 * catalog id for the rest.
 */
function gatewayId(record: ModelRecord) {
  if (record.id.includes('/')) return record.id
  return record.api === 'anthropic-messages'
    ? `anthropic/${record.id}`
    : `openai/${record.id}`
}

/** Sorted by id, the newest version of each family first. */
const newestFirst = (a: ModelEntry, b: ModelEntry) =>
  b.id.localeCompare(a.id, 'en', { numeric: true })

/**
 * The models `/model` can switch to, from the `@tanstack/ai-models` catalog:
 * the Workers AI models, and the AI Gateway models (Claude, GPT, Grok, Qwen,
 * and more). The catalog gives the context size, the reasoning levels, and
 * the price. The gateway models are by vendor in the picker.
 */
export const modelProviders = [
  {
    id: 'workers-ai',
    label: 'Workers AI',
    byVendor: false,
    models: getModels('cloudflare-workers-ai')
      .map((record) => cloudflareModel(record.id, record))
      .sort(newestFirst),
  },
  {
    id: 'ai-gateway',
    label: 'AI Gateway',
    byVendor: true,
    // The `workers-ai/...` routes are the Workers AI models again.
    models: getModels('cloudflare-ai-gateway')
      .filter((record) => !record.id.startsWith('workers-ai/'))
      .map((record) => cloudflareModel(gatewayId(record), record))
      .sort(newestFirst),
  },
]

/** Each model by its id: its catalog record and its adapter. */
export const modelInfo: Record<string, ModelEntry> = Object.fromEntries(
  modelProviders.flatMap((provider) =>
    provider.models.map((model) => [model.id, model]),
  ),
)

// A new session starts on Claude Sonnet through the gateway. A resumed session
// keeps the model it had. `/model demo` answers without any key.
const startModel = 'anthropic/claude-sonnet-5'
// The start model: the harness, /compact, /goal, and /agent haiku use it.
const main: KeyedAdapter<AnyTextAdapter> = modelInfo[startModel].adapter
const choices = {
  ...Object.fromEntries(
    Object.values(modelInfo).map((model) => [model.id, model.adapter]),
  ),
  demo: demoModel(),
}

/** Does the model think, so `/effort` changes it? */
export function reasons(model: string) {
  const record = modelInfo[model]?.record
  return record
    ? supportedReasoningLevels(record).some((level) => level !== 'off')
    : false
}

// `/connect cloudflare` opens the page to make a token, then asks for it (the
// screen hides it as you type), finds your account, and asks for the gateway.
export const keyProviders = [cloudflareByok]

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
// they make: images and speech with Workers AI, through your gateway.
const media = [imageAgent, speechAgent]

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
    [cloudflareByok],
    'your Cloudflare account (/connect cloudflare), and ffmpeg',
  ),
  keyFeature(
    'images',
    [cloudflareByok],
    'your Cloudflare account (/connect cloudflare)',
  ),
  keyFeature(
    'speech',
    [cloudflareByok],
    'your Cloudflare account (/connect cloudflare)',
  ),
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
    'A coding agent in the terminal, on Cloudflare: files, voice, media, Notion, Linear, and local coding agents',
  adapter: main,
  systemPrompts: [
    'You are a careful coding agent that works in the workspace, the folder where the user started you. Read files before you edit them. Keep answers short.',
    `Your agent tools: ${tools.join(', ') || 'none'}. The user gets each file a media tool makes, so do not paste file contents or links.`,
    'When the user asks to run Codex or Claude Code (by voice too: "run a Codex agent"), call that tool with a clear task, then give its answer back in a few lines.',
    'The user can send files and voice messages.',
    'You can read Notion and Linear when they are connected. If a tool says to sign in or that a key is missing, tell the user the /connect command it names, for example /connect notion or /connect cloudflare.',
  ],
  agents: [haiku],
  subagents: { agents: media },
  plugins: () => [
    notion,
    linear,
    permissions(),
    workspaceTools({ root, outside: 'ask' }),
    todos(),
    cloudflareConnect(),
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
    // runs in a new isolate in your Worker (/code-mode), and its tool calls
    // come back here to run.
    codeMode({
      driver: createCloudflareIsolateDriver({
        workerUrl: `${currentWorker().url.replace(/\/+$/, '')}/code-mode`,
        authorization: `Bearer ${currentWorker().secret}`,
      }),
      lazy: true,
      lazyToolsConfig: { includeDescription: 'first-sentence' },
    }),
    ...coding,
  ],
})
