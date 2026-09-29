import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EventType, defineAgent } from '@tanstack/ai'
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
import { anthropicText } from '@tanstack/ai-anthropic'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { codeMode } from '@tanstack/ai-code-mode/harness'
import { codexText } from '@tanstack/ai-codex'
import { mcpConnector } from '@tanstack/ai-mcp/connector'
import { grokText, grokVideo } from '@tanstack/ai-grok'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import {
  openaiText,
  openaiTranscription,
  openaiVideo,
} from '@tanstack/ai-openai'
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
import type { AnyTextAdapter } from '@tanstack/ai'

// The agent works in ./playground, so it cannot touch the rest of your disk.
const root = fileURLToPath(new URL('../playground', import.meta.url))

/** Without an API key, a stand-in model that explains how to add one. */
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
          delta: `(demo model) You said: "${said}". Set OPENAI_API_KEY or ANTHROPIC_API_KEY to talk to a real model.`,
          timestamp: now,
        }
        yield { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: now }
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'demo',
          threadId: 'demo',
          timestamp: now,
          metadata: { tanstack: { finishReason: 'stop' } },
        }
      })(),
  }
}

/**
 * The models `/model <name>` can switch to: one or two per provider with a
 * key. The first one is the default.
 */
function pickModels() {
  const choices: Record<string, AnyTextAdapter> = {}
  if (process.env.OPENAI_API_KEY) {
    choices.gpt = openaiText('gpt-6-astra')
    choices['gpt-fast'] = openaiText('gpt-6-luna')
  }
  if (process.env.ANTHROPIC_API_KEY) {
    choices.claude = anthropicText('claude-opus-5-5')
    choices['claude-fast'] = anthropicText('claude-sonnet-5')
  }
  if (process.env.XAI_API_KEY) choices.grok = grokText('grok-4.7')
  const [main = demoModel()] = Object.values(choices)
  if (Object.keys(choices).length === 0) choices.demo = main
  return { main, choices }
}

const { main, choices } = pickModels()

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
  run: (ctx) =>
    ctx.chat({
      adapter: main,
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
// they make. Each one turns on with the key its provider needs:
// - OPENAI_API_KEY: images, speech, and video with Sora.
// - XAI_API_KEY: video with Grok Imagine (it wins over Sora).
// - FAL_KEY: songs and sound effects.
const video = process.env.XAI_API_KEY
  ? videoAgent(grokVideo('grok-imagine-video-1.5'))
  : process.env.OPENAI_API_KEY
    ? videoAgent(openaiVideo('sora-2'))
    : undefined
const media = [
  ...(process.env.OPENAI_API_KEY ? [imageAgent, speechAgent] : []),
  ...(video ? [video] : []),
  ...(process.env.FAL_KEY ? [songAgent, soundAgent] : []),
]

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

/** What this session can do, and what turns each one on, for the screen. */
export const features = [
  {
    name: 'voice',
    on: Boolean(process.env.OPENAI_API_KEY || process.env.XAI_API_KEY),
    needs: 'OPENAI_API_KEY or XAI_API_KEY, and ffmpeg',
  },
  {
    name: 'images',
    on: Boolean(process.env.OPENAI_API_KEY),
    needs: 'OPENAI_API_KEY',
  },
  {
    name: 'speech',
    on: Boolean(process.env.OPENAI_API_KEY),
    needs: 'OPENAI_API_KEY',
  },
  {
    name: 'video',
    on: video !== undefined,
    needs: 'XAI_API_KEY or OPENAI_API_KEY',
  },
  { name: 'songs', on: Boolean(process.env.FAL_KEY), needs: 'FAL_KEY' },
  {
    name: 'claude code',
    on: 'claude_code' in codingAgentList,
    needs: '`claude` on the PATH',
  },
  {
    name: 'codex',
    on: 'codex' in codingAgentList,
    needs: '`codex` on the PATH',
  },
  { name: 'notion', on: true, needs: '' },
  { name: 'linear', on: true, needs: '' },
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
    'You can read Notion and Linear when they are connected. If a tool says to sign in, tell the user to run /connect notion or /connect linear.',
  ],
  agents: [haiku],
  subagents: { agents: media },
  // Audio files the user sends become text for models that cannot read audio.
  ...(process.env.OPENAI_API_KEY
    ? { media: { transcribe: openaiTranscription('gpt-4o-transcribe') } }
    : {}),
  plugins: () => [
    notion,
    linear,
    permissions(),
    workspaceTools({ root }),
    todos(),
    modelPicker({ choices, default: Object.keys(choices)[0] }),
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
