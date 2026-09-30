import { createFileRoute } from '@tanstack/react-router'
import { chat, toolDefinition } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { cloudflareBindingFetch } from '@tanstack/ai-cloudflare'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

type RunCall = {
  model: string
  inputs: Record<string, unknown>
  options: Record<string, unknown>
}

function sse(events: Array<Record<string, unknown>>) {
  return new Response(
    events
      .map(
        (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      )
      .join(''),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )
}

/** A Claude answer, as Anthropic Messages streams it. */
const claudeAnswer = [
  {
    type: 'message_start',
    message: {
      id: 'msg_binding',
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'claude-opus-5-5',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 0 },
    },
  },
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'Hi from Claude.' },
  },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 4 },
  },
  { type: 'message_stop' },
]

/** A GPT answer, as OpenAI Responses streams it. */
const gptAnswer = [
  {
    type: 'response.created',
    response: {
      id: 'resp_binding',
      object: 'response',
      status: 'in_progress',
      model: 'gpt-6.1-sol',
      output: [],
    },
  },
  {
    type: 'response.completed',
    response: {
      id: 'resp_binding',
      object: 'response',
      status: 'completed',
      model: 'gpt-6.1-sol',
      output: [
        {
          id: 'msg_binding',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [
            { type: 'output_text', text: 'Hi from GPT.', annotations: [] },
          ],
        },
      ],
      usage: { input_tokens: 5, output_tokens: 4, total_tokens: 9 },
    },
  },
]

/** A stand-in for `env.AI` that records each `run` call. */
function fakeWorkersAi() {
  const calls: Array<RunCall> = []
  const binding = {
    run: async (
      model: string,
      inputs: Record<string, unknown>,
      options: Record<string, unknown>,
    ) => {
      calls.push({ model, inputs, options })
      return model.startsWith('anthropic/') ? sse(claudeAnswer) : sse(gptAnswer)
    },
  }
  return { calls, binding }
}

const lookup = toolDefinition({
  name: 'lookup',
  description: 'Look something up',
  inputSchema: z.object({ query: z.string() }),
})

async function answerText(stream: AsyncIterable<{ type: string }>) {
  let text = ''
  for await (const chunk of stream) {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT' && 'delta' in chunk) {
      text += String(chunk.delta)
    }
  }
  return text
}

/**
 * The real Anthropic and OpenAI adapters, sending through
 * `cloudflareBindingFetch` to a fake `env.AI`. Returns what each `run` call
 * got and the streamed answers.
 */
export const Route = createFileRoute('/api/cloudflare-binding-wire')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const workersAi = fakeWorkersAi()
          // The real binding exists only inside a Worker. The stand-in has the
          // one method the fetch calls.
          const binding = workersAi.binding as unknown as Parameters<
            typeof cloudflareBindingFetch
          >[0]['binding']

          const claudeText = await answerText(
            chat({
              adapter: anthropicText('claude-opus-5-5', {
                apiKey: 'cloudflare-binding',
                fetch: cloudflareBindingFetch({
                  binding,
                  vendor: 'anthropic',
                  gateway: { id: 'e2e-gateway' },
                }),
              }),
              systemPrompts: ['Be brief.'],
              messages: [{ role: 'user', content: 'Hi' }],
              tools: [lookup],
              reasoning: 'high',
            }),
          )

          const gptText = await answerText(
            chat({
              adapter: openaiText('gpt-6.1-sol', {
                apiKey: 'cloudflare-binding',
                fetch: cloudflareBindingFetch({ binding, vendor: 'openai' }),
              }),
              systemPrompts: ['Be brief.'],
              messages: [{ role: 'user', content: 'Hi' }],
              tools: [lookup],
              reasoning: 'high',
            }),
          )

          return Response.json({
            ok: true,
            claudeText,
            gptText,
            calls: workersAi.calls.map((call) => ({
              model: call.model,
              modelInBody: 'model' in call.inputs,
              betasInBody: 'betas' in call.inputs,
              systemSent: JSON.stringify(call.inputs).includes('Be brief.'),
              toolNames: Array.isArray(call.inputs.tools)
                ? call.inputs.tools.map((tool: { name?: string }) => tool.name)
                : [],
              outputConfig: call.inputs.output_config,
              reasoning: call.inputs.reasoning,
              returnRawResponse: call.options.returnRawResponse,
              gateway: call.options.gateway,
            })),
          })
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    },
  },
})
