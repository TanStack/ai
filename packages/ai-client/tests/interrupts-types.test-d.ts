import { expectTypeOf } from 'vitest'
import { defineInterrupt, toolDefinition } from '@tanstack/ai/client'
import { z } from 'zod'
import type { JSONSchema, ServerTool } from '@tanstack/ai'
import type {
  ClientTool,
  InterruptBinding,
  Interrupt as WireInterrupt,
  InputSchemaOf,
  NoSchema,
  OutputSchemaOf,
} from '@tanstack/ai/client'
import type {
  BoundInterrupts,
  ChatClient,
  ChatInterrupt,
  GenericAGUIInterrupt,
  GenericInterrupt,
  RegisteredGenericInterrupt,
  ToolApprovalInterrupt,
} from '../src/index'

const transfer = toolDefinition({
  name: 'transfer',
  description: 'Transfer funds',
  needsApproval: true,
  inputSchema: z.object({ cents: z.number() }),
  outputSchema: z.object({ receipt: z.string() }),
  approvalSchema: {
    approve: z.object({ note: z.string() }),
    reject: z.object({ reason: z.string() }),
  },
}).client()

const confirm = toolDefinition({
  name: 'confirm',
  description: 'Approval without custom schemas',
  needsApproval: true,
}).client()

const lookup = toolDefinition({
  name: 'lookup',
  description: 'Client lookup',
  outputSchema: z.object({ accountId: z.string() }),
}).client()

const raw = toolDefinition({
  name: 'raw',
  description: 'Raw JSON Schema remains unknown',
  outputSchema: { type: 'object' },
}).client()

type Tools = readonly [
  typeof transfer,
  typeof confirm,
  typeof lookup,
  typeof raw,
]
type Interrupt = ChatInterrupt<Tools>

declare const externalGeneric: GenericAGUIInterrupt
externalGeneric.cancel()
externalGeneric.clearResolution()
externalGeneric.resolveInterrupt({ accepted: true })

declare const unboundInterrupt: Extract<Interrupt, { kind: 'unbound' }>
// @ts-expect-error Unbound interrupts are owned by another system.
unboundInterrupt.cancel()
// @ts-expect-error Unbound interrupts are owned by another system.
unboundInterrupt.clearResolution()

expectTypeOf<InputSchemaOf<ServerTool>>().toEqualTypeOf<NoSchema>()
expectTypeOf<OutputSchemaOf<ServerTool>>().toEqualTypeOf<NoSchema>()
expectTypeOf<InputSchemaOf<ClientTool>>().toEqualTypeOf<NoSchema>()
expectTypeOf<OutputSchemaOf<ClientTool>>().toEqualTypeOf<NoSchema>()

const manuallyAnnotatedClientTool: ClientTool = {
  __toolSide: 'client',
  name: 'manual',
  description: 'Manually annotated schema-less tool',
}
expectTypeOf(manuallyAnnotatedClientTool.inputSchema).toEqualTypeOf<undefined>()

const manualJsonSchema = {
  type: 'object',
  properties: {},
} satisfies JSONSchema
const manuallyAnnotatedServerTool: ServerTool<typeof manualJsonSchema> = {
  __toolSide: 'server',
  name: 'manual-server',
  description: 'Manually annotated tool with an explicit schema generic',
  inputSchema: manualJsonSchema,
  execute: async () => undefined,
}
expectTypeOf(manuallyAnnotatedServerTool.inputSchema).toEqualTypeOf<
  typeof manualJsonSchema | undefined
>()

declare const approvalBinding: Extract<
  InterruptBinding,
  { kind: 'tool-approval' }
>
const canonicalApprovalDescriptor = {
  id: approvalBinding.interruptId,
  reason: 'tool_call' as const,
  toolCallId: approvalBinding.toolCallId,
  metadata: { 'tanstack:interruptBinding': approvalBinding },
} satisfies WireInterrupt
expectTypeOf(canonicalApprovalDescriptor.reason).toEqualTypeOf<'tool_call'>()

declare const clientToolBinding: Extract<
  InterruptBinding,
  { kind: 'client-tool-execution' }
>
const canonicalClientToolDescriptor = {
  id: clientToolBinding.interruptId,
  reason: 'tanstack:client_tool_execution' as const,
  toolCallId: clientToolBinding.toolCallId,
  metadata: { 'tanstack:interruptBinding': clientToolBinding },
} satisfies WireInterrupt
expectTypeOf(
  canonicalClientToolDescriptor.reason,
).toEqualTypeOf<'tanstack:client_tool_execution'>()

declare const transferApproval: Extract<
  Interrupt,
  { kind: 'tool-approval'; toolName: 'transfer' }
>
transferApproval.resolveInterrupt(true, {
  editedArgs: { cents: 100 },
  payload: { note: 'approved' },
})
transferApproval.resolveInterrupt(false, { payload: { reason: 'declined' } })
// @ts-expect-error rejection never permits edited arguments
transferApproval.resolveInterrupt(false, { editedArgs: { cents: 1 } })
// @ts-expect-error approve payload is inferred from the approve branch
transferApproval.resolveInterrupt(true, { payload: { reason: 'wrong branch' } })

declare const confirmation: Extract<
  Interrupt,
  { kind: 'tool-approval'; toolName: 'confirm' }
>
confirmation.resolveInterrupt(true)
confirmation.resolveInterrupt(false)
// @ts-expect-error omitted input schema forbids edits
confirmation.resolveInterrupt(true, { editedArgs: { value: 1 } })
// @ts-expect-error omitted approval branch forbids payload
confirmation.resolveInterrupt(false, { payload: { reason: 'no schema' } })

// `client-tool-execution` is intentionally NOT part of the public interrupt
// union. Client tools resolve through their `.client()` implementation or
// `addToolResult`, never as a bound interrupt.
expectTypeOf<
  Extract<Interrupt, { kind: 'client-tool-execution' }>
>().toEqualTypeOf<never>()

expectTypeOf<BoundInterrupts<Tools>>().toEqualTypeOf<
  readonly ChatInterrupt<Tools>[]
>()

declare const client: ChatClient<Tools>
client.updateOptions({
  onInterruptStateChange: (state) => {
    expectTypeOf(state.interrupts).toEqualTypeOf(state.pendingInterrupts)
  },
})
client.resolveInterrupts((interrupt) => {
  interrupt.cancel()
  return undefined
})
client.resumeInterruptsUnsafe([
  { interruptId: 'generic-1', status: 'cancelled' },
])
// @ts-expect-error the low-level recovery escape hatch uses the locked name
client.unsafeResumeInterrupts([])
expectTypeOf<Extract<Interrupt, { kind: 'tool-approval' }>>().toMatchTypeOf<
  ToolApprovalInterrupt<Tools[number]>
>()

const reviewPlan = defineInterrupt({
  id: 'review-plan',
  payloadSchema: z.object({ title: z.string() }),
  responseSchema: z.string().transform((value) => Number(value)),
})

const acknowledge = defineInterrupt({
  id: 'acknowledge',
  responseSchema: z.object({ accepted: z.boolean() }),
})

const payloadOnlyReview = defineInterrupt({
  id: 'payload-only-review',
  payloadSchema: z.object({
    title: z.string().transform((value) => value.toUpperCase()),
  }),
})

type RegisteredInterrupts = readonly [
  typeof reviewPlan,
  typeof acknowledge,
  typeof payloadOnlyReview,
]
type RegisteredClientInterrupt = ChatInterrupt<Tools, RegisteredInterrupts>

declare const reviewInterrupt: Extract<
  RegisteredClientInterrupt,
  { definitionId: 'review-plan' }
>
expectTypeOf(reviewInterrupt).toMatchTypeOf<
  RegisteredGenericInterrupt<RegisteredInterrupts>
>()
expectTypeOf(reviewInterrupt).toEqualTypeOf<
  GenericInterrupt<typeof reviewPlan>
>()
expectTypeOf(reviewInterrupt.payload).toEqualTypeOf<
  { title: string } | undefined
>()
reviewInterrupt.resolveInterrupt('42')
// @ts-expect-error response schema input is a string, not its transformed output
reviewInterrupt.resolveInterrupt(42)

declare const acknowledgement: Extract<
  RegisteredClientInterrupt,
  { definitionId: 'acknowledge' }
>
expectTypeOf(acknowledgement.payload).toEqualTypeOf<undefined>()
acknowledgement.resolveInterrupt({ accepted: true })
// @ts-expect-error response input must match the registered schema
acknowledgement.resolveInterrupt({ accepted: 'yes' })

declare const payloadOnlyInterrupt: Extract<
  RegisteredClientInterrupt,
  { definitionId: 'payload-only-review' }
>
expectTypeOf(payloadOnlyReview.responseSchema).toEqualTypeOf<undefined>()
expectTypeOf(payloadOnlyInterrupt.payload).toEqualTypeOf<
  { title: string } | undefined
>()
expectTypeOf(payloadOnlyInterrupt.resolveInterrupt)
  .parameter(0)
  .toEqualTypeOf<unknown>()
payloadOnlyInterrupt.resolveInterrupt({ accepted: true, comment: 'continue' })
