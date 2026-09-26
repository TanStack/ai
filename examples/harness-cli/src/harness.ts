import { fileURLToPath } from 'node:url'
import { EventType, defineAgent } from '@tanstack/ai'
import { defineHarness } from '@tanstack/ai-harness'
import {
  compact,
  modelPicker,
  permissions,
  projectInstructions,
  todos,
  usage,
  workspaceTools,
} from '@tanstack/ai-harness/plugins'
import { anthropicText } from '@tanstack/ai-anthropic'
import { codeMode } from '@tanstack/ai-code-mode/harness'
import { mcpConnector } from '@tanstack/ai-mcp/connector'
import { grokVideo } from '@tanstack/ai-grok'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { openaiText, openaiVideo } from '@tanstack/ai-openai'
import { z } from 'zod'
import { imageAgent, videoAgent } from './media'
import type { AnyTextAdapter } from '@tanstack/ai'

// The agent works in ./playground, so it cannot touch the rest of your disk.
const root = fileURLToPath(new URL('../playground', import.meta.url))
const mediaDir = fileURLToPath(new URL('../playground/media', import.meta.url))

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

function pickModels(): {
  main: AnyTextAdapter
  choices: Record<string, AnyTextAdapter>
} {
  if (process.env.OPENAI_API_KEY) {
    const smart = openaiText('gpt-5.6')
    return { main: smart, choices: { smart, fast: openaiText('gpt-5.6-luna') } }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const smart = anthropicText('claude-opus-5-5')
    return {
      main: smart,
      choices: { smart, fast: anthropicText('claude-sonnet-5') },
    }
  }
  const demo = demoModel()
  return { main: demo, choices: { demo } }
}

const { main, choices } = pickModels()

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

// The model calls the media agents as tools. Images use OpenAI. Videos use
// Grok Imagine when XAI_API_KEY is set, else OpenAI Sora.
const media = process.env.OPENAI_API_KEY
  ? [
      imageAgent(mediaDir),
      videoAgent(
        mediaDir,
        process.env.XAI_API_KEY
          ? grokVideo('grok-imagine-video')
          : openaiVideo('sora-2'),
      ),
    ]
  : []

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

export const assistant = defineHarness({
  name: 'example/coder',
  description: 'A small coding agent that works in ./playground',
  adapter: main,
  systemPrompts: [
    'You are a careful coding agent. Read files before you edit them. Keep answers short.',
    'You can read Notion and Linear when they are connected, and make images and videos with the image and video tools. Media files are saved under ./playground/media.',
  ],
  agents: [haiku],
  subagents: { agents: media },
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
    // Read-only tools (file reads, read-only Notion and Linear tools) move
    // behind execute_typescript, so the model can call several in one program.
    // The program runs in a QuickJS isolate. Any @tanstack/ai-isolate-* driver
    // works here.
    codeMode({ driver: createQuickJSIsolateDriver() }),
  ],
})
