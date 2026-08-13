import { expectTypeOf } from 'vitest'
import { z } from 'zod'
import { defineInterrupt, toolDefinition } from '../src'
import { defineInterrupt as defineClientInterrupt } from '../src/client'
import type { GenericInterruptRequest, InferSchemaType } from '../src'
import type { GenericInterruptRequest as ClientGenericInterruptRequest } from '../src/client'
import type {
  ApprovalCapabilityOf,
  ApprovalSchemaOf,
  ChatMiddlewareContext,
  ChatResumeToolState,
  InferToolInput,
  InferToolOutput,
  InputSchemaOf,
  NoSchema,
  RunErrorEvent,
} from '../src'
import type { InterruptSubmissionError } from '../src/interrupts'

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
})

expectTypeOf<InferToolInput<typeof transfer>>().toEqualTypeOf<{
  cents: number
}>()
expectTypeOf<
  InferToolOutput<ReturnType<typeof transfer.client>>
>().toEqualTypeOf<{
  receipt: string
}>()
expectTypeOf<
  ApprovalCapabilityOf<ReturnType<typeof transfer.server>>
>().toEqualTypeOf<true>()
expectTypeOf<
  ApprovalSchemaOf<ReturnType<typeof transfer.client>>
>().toEqualTypeOf<typeof transfer.approvalSchema>()

toolDefinition({
  name: 'invalid',
  description: 'Cannot declare an approval payload',
  // @ts-expect-error approvalSchema requires needsApproval: true
  approvalSchema: z.object({ note: z.string() }),
})

const noInputDefinition = toolDefinition({
  name: 'noInput',
  description: 'Approval without editable input',
  needsApproval: true,
})
const noInputClient = noInputDefinition.client()
const noInputServer = noInputDefinition.server(async () => ({ ok: true }))
expectTypeOf(noInputClient.inputSchema).toEqualTypeOf<undefined>()
expectTypeOf(noInputServer.inputSchema).toEqualTypeOf<undefined>()
expectTypeOf<
  InputSchemaOf<typeof noInputDefinition>
>().toEqualTypeOf<NoSchema>()
expectTypeOf<InputSchemaOf<typeof noInputClient>>().toEqualTypeOf<NoSchema>()
expectTypeOf<InputSchemaOf<typeof noInputServer>>().toEqualTypeOf<NoSchema>()

expectTypeOf<RunErrorEvent['tanstack:interruptErrors']>().toEqualTypeOf<
  ReadonlyArray<InterruptSubmissionError> | undefined
>()
expectTypeOf<ChatMiddlewareContext['parentRunId']>().toEqualTypeOf<
  string | undefined
>()
expectTypeOf<ChatResumeToolState['cancelledToolCallIds']>().toEqualTypeOf<
  ReadonlySet<string> | undefined
>()

const interruptWithPayload = defineInterrupt({
  id: 'with-payload',
  payloadSchema: z.object({ label: z.string() }),
  responseSchema: z.object({ accepted: z.boolean() }),
})
const interruptWithoutPayload = defineInterrupt({
  id: 'without-payload',
  responseSchema: z.object({ accepted: z.boolean() }),
})
const transformingInterrupt = defineInterrupt({
  id: 'transforming-payload',
  payloadSchema: z.string().transform((value) => value.length),
  responseSchema: z.object({ accepted: z.boolean() }),
})
const payloadRequest = interruptWithPayload.interrupt({
  key: 'one',
  payload: { label: 'hello' },
  reason: 'test',
  message: 'Test',
})
expectTypeOf(payloadRequest.payload).toEqualTypeOf<
  { label: string } | undefined
>()
const transformingRequest = transformingInterrupt.interrupt({
  key: 'transforming',
  payload: 'five',
  reason: 'test',
  message: 'Test',
})
expectTypeOf(transformingRequest.payload).toEqualTypeOf<number | undefined>()
// @ts-expect-error Payload must use the schema input type.
transformingInterrupt.interrupt({
  key: 'invalid-transforming',
  payload: 5,
  reason: 'test',
  message: 'Test',
})
const nestedTransformingRequest = transformingRequest.definition.interrupt({
  key: 'nested-transforming',
  payload: 'six',
  reason: 'test',
  message: 'Test',
})
expectTypeOf(nestedTransformingRequest.payload).toEqualTypeOf<
  number | undefined
>()
// @ts-expect-error Nested definitions keep the schema input payload type.
transformingRequest.definition.interrupt({
  key: 'invalid-nested-transforming',
  payload: 6,
  reason: 'test',
  message: 'Test',
})
// @ts-expect-error Request definition is readonly.
payloadRequest.definition = interruptWithoutPayload
// @ts-expect-error Request key is readonly.
payloadRequest.key = 'changed'
// @ts-expect-error Request reason is readonly.
payloadRequest.reason = 'changed'
// @ts-expect-error Request message is readonly.
payloadRequest.message = 'changed'
// @ts-expect-error Request payload is readonly.
payloadRequest.payload = { label: 'changed' }
const noPayloadRequest = interruptWithoutPayload.interrupt({
  key: 'two',
  reason: 'test',
  message: 'Test',
})
const clientInterrupt = defineClientInterrupt({
  id: 'client-interrupt',
  responseSchema: z.object({ ok: z.boolean() }),
})
expectTypeOf<
  InferSchemaType<typeof interruptWithPayload.payloadSchema>
>().toEqualTypeOf<{ label: string }>()
expectTypeOf<typeof payloadRequest.definition.payloadSchema>().toEqualTypeOf<
  typeof interruptWithPayload.payloadSchema
>()
expectTypeOf<typeof interruptWithPayload.id>().toEqualTypeOf<'with-payload'>()
expectTypeOf<
  keyof GenericInterruptRequest<typeof payloadRequest.definition>
>().toEqualTypeOf<
  'definition' | 'key' | 'payload' | 'reason' | 'message' | 'expiresAt'
>()
expectTypeOf<
  keyof GenericInterruptRequest<typeof noPayloadRequest.definition>
>().toEqualTypeOf<'definition' | 'key' | 'reason' | 'message' | 'expiresAt'>()
const clientRequest = clientInterrupt.interrupt({
  key: 'client',
  reason: 'test',
  message: 'Test',
})
expectTypeOf<
  keyof ClientGenericInterruptRequest<typeof clientRequest.definition>
>().toEqualTypeOf<'definition' | 'key' | 'reason' | 'message' | 'expiresAt'>()
const extraIdInput = {
  key: 'extra-id',
  reason: 'test',
  message: 'Test',
  id: 'ag-ui-id',
}
// @ts-expect-error Unknown id input field is not allowed.
interruptWithPayload.interrupt(extraIdInput)
const extraRunInput = {
  key: 'extra-run',
  reason: 'test',
  message: 'Test',
  runId: 'run-id',
}
// @ts-expect-error Unknown runId input field is not allowed.
interruptWithPayload.interrupt(extraRunInput)
const extraResponseInput = {
  key: 'extra-response',
  reason: 'test',
  message: 'Test',
  response: { accepted: true },
}
// @ts-expect-error Unknown response input field is not allowed.
interruptWithPayload.interrupt(extraResponseInput)
const missingResponseOptions = { id: 'missing-response' }
// @ts-expect-error responseSchema is required.
defineInterrupt(missingResponseOptions)
// @ts-expect-error A definition without a payload schema has no payload property.
noPayloadRequest.payload
interruptWithoutPayload.interrupt({
  key: 'three',
  // @ts-expect-error A payload key is forbidden without a payload schema.
  payload: undefined,
  reason: 'test',
  message: 'Test',
})

// @ts-expect-error Internal helpers are not exported from the root barrel.
import { createInterruptBinding } from '../src'
// @ts-expect-error Internal constants are not exported from the root barrel.
import { INTERRUPT_BINDING_KIND } from '../src'
// @ts-expect-error Internal descriptor types are not exported from the root barrel.
import type { InterruptBindingDescriptor } from '../src'
// @ts-expect-error Internal helpers are not exported from the client barrel.
import { createInterruptBinding as createClientInterruptBinding } from '../src/client'
