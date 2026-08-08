import { createFileRoute } from '@tanstack/react-router'
import { convertMessagesToModelMessages } from '@tanstack/ai'
import { z } from 'zod'
import type { UIMessage } from '@tanstack/ai'

const sourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('data'),
    value: z.string(),
    mimeType: z.string(),
  }),
  z.object({
    type: z.literal('url'),
    value: z.string(),
    mimeType: z.string().optional(),
  }),
])

const contentPartSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    content: z.string(),
    metadata: z.unknown().optional(),
  }),
  ...(['image', 'audio', 'video', 'document'] as const).map((type) =>
    z.object({
      type: z.literal(type),
      source: sourceSchema,
      metadata: z.unknown().optional(),
    }),
  ),
])

const messagePartSchema = z.discriminatedUnion('type', [
  ...contentPartSchema.options,
  z.object({
    type: z.literal('tool-call'),
    id: z.string(),
    name: z.string(),
    arguments: z.string(),
    input: z.unknown().optional(),
    state: z.enum([
      'awaiting-input',
      'input-streaming',
      'input-complete',
      'approval-requested',
      'approval-responded',
      'complete',
      'error',
    ]),
    approval: z
      .object({
        id: z.string(),
        needsApproval: z.boolean(),
        approved: z.boolean().optional(),
      })
      .optional(),
    output: z.unknown().optional(),
    metadata: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('tool-result'),
    toolCallId: z.string(),
    content: z.union([z.string(), z.array(contentPartSchema)]),
    state: z.enum(['streaming', 'complete', 'error']),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal('thinking'),
    content: z.string(),
    stepId: z.string().optional(),
    signature: z.string().optional(),
  }),
  z.object({
    type: z.literal('structured-output'),
    status: z.enum(['streaming', 'complete', 'error']),
    partial: z.unknown().optional(),
    data: z.unknown().optional(),
    raw: z.string(),
    reasoning: z.string().optional(),
    errorMessage: z.string().optional(),
  }),
  z.object({
    type: z.literal('ui-resource'),
    resource: z.object({
      uri: z.string(),
      mimeType: z.string(),
      text: z.string().optional(),
      blob: z.string().optional(),
    }),
    serverId: z.string().optional(),
    toolCallId: z.string(),
    toolName: z.string(),
    meta: z.record(z.string(), z.unknown()).optional(),
  }),
])

const requestBodySchema: z.ZodType<{ messages: Array<UIMessage> }> = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['system', 'user', 'assistant']),
      parts: z.array(messagePartSchema),
      createdAt: z.coerce.date().optional(),
    }),
  ),
})

/**
 * Provider-free harness for the UIMessage -> ModelMessage identity contract.
 * The route keeps this regression at the public server boundary without
 * starting a provider request or requiring an API key.
 */
export const Route = createFileRoute('/api/message-ids')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return new Response('Invalid JSON request body', { status: 400 })
        }

        const parsed = requestBodySchema.safeParse(body)
        if (!parsed.success) {
          return new Response('Invalid message data', { status: 400 })
        }

        return Response.json(
          convertMessagesToModelMessages(parsed.data.messages),
        )
      },
    },
  },
})
