import { expectTypeOf } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '../src'
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
