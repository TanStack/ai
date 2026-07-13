# AG-UI Interrupts: Full-Spec, Typed, Durable Resolution

Status: Approved design

Date: 2026-07-13

Implementation base: [TanStack AI PR #785](https://github.com/TanStack/ai/pull/785), commit `61026d52669fc261b7a051ba20ba4bd806ce84fd`

## Summary

TanStack AI will adopt AG-UI native interrupts as the only interrupt protocol emitted by new servers. The client API will expose bound interrupt objects whose methods stage typed responses, validate them, and submit a complete response batch only after every simultaneously open interrupt has been answered or cancelled.

The selected design is staged bound interrupts with auto-submit:

- A single interrupt auto-submits after `resolveInterrupt` or `cancelInterrupt`.
- A batch waits until every open interrupt has a staged resolution or cancellation, then submits exactly once.
- `resolveInterrupts(callback)` provides a synchronous root transaction for heterogeneous batches.
- Tool approvals infer edited arguments from `inputSchema` and custom approval data from `approvalSchema`.
- Generic AG-UI interrupts retain `unknown` payloads statically and validate them from `responseSchema` at runtime.
- The server validates the entire batch, reports all validation errors together, and executes no tools when any entry is invalid.
- Final response batches use a mandatory atomic compare-and-swap persistence operation. Exact replays are idempotent, conflicting responses are rejected, and the first valid writer wins.

This is a breaking protocol and API transition relative to the pre-PR approval flow and parts of PR #785's current surface. Compatibility is handled by a pre-1.0 deprecation period, retained legacy readers in new clients, coordinated client and server upgrades, and a manual migration guide. There will be no codemod.

## Normative basis and requirement labels

This design separates protocol requirements from TanStack guarantees:

| Label | Meaning |
| --- | --- |
| `[AG-UI]` | Required for AG-UI protocol conformance. The normative source is the interrupts document at immutable commit [`2ed25b2009ff900315ab686dc9f86147b48fe382`](https://github.com/ag-ui-protocol/ag-ui/blob/2ed25b2009ff900315ab686dc9f86147b48fe382/docs/concepts/interrupts.mdx). The PR-head type baseline is `@ag-ui/core@0.0.57`. |
| `[TanStack]` | A stronger TanStack API, validation, safety, persistence, or durability guarantee. It is not claimed as an AG-UI protocol requirement. |
| `[Compatibility]` | Temporary pre-1.0 behavior for old TanStack clients or servers. It is outside the native AG-UI interrupt protocol. |

The AG-UI requirements used here are: an interrupted run terminates with a nonempty interrupt outcome; required message and state snapshots precede that terminal event; the continuation uses the same thread and a new run; one resume array covers every open interrupt; pending interrupts block unrelated input; `responseSchema` describes resolved payloads; exact replay is idempotent; expiry rejects stale resumes; denial is a resolved payload; cancellation has no payload; and a resumed tool emits only its result against the original `toolCallId`.

TanStack additionally guarantees typed tool shorthands, client preflight validation, authoritative server validation, exhaustive batch errors, full-set atomic compare-and-swap persistence, first-writer conflict handling, local draft durability, recovery state, and cross-framework API parity. In particular, AG-UI describes validation against `responseSchema`, but this design's mandatory server-side validation of every entry, all-errors response, and no-write-on-any-invalid rule are explicit TanStack guarantees.

## Evidence and breaking-change analysis

The protocol requirements in this design follow the primary [AG-UI interrupts specification](https://docs.ag-ui.com/concepts/interrupts) and its [immutable source revision](https://github.com/ag-ui-protocol/ag-ui/blob/2ed25b2009ff900315ab686dc9f86147b48fe382/docs/concepts/interrupts.mdx). The installed `@ag-ui/core@0.0.57` types define an interrupt descriptor, `resolved` and `cancelled` resume statuses, a `resume` array on run input, and an interrupt outcome on `RUN_FINISHED`.

Before PR #785, TanStack AI used approval-specific custom events and `addToolApprovalResponse`. The old server emitted `approval-requested` and `tool-input-available` custom events, as shown in the [pre-PR chat implementation](https://github.com/TanStack/ai/blob/5fcaf90dc82bc20b8c7a75faa3c129da04858af5/packages/ai/src/activities/chat/index.ts#L1719-L1772). That flow represented approval state in message parts and resumed through updated conversation history.

PR #785 changes the lifecycle to native interrupt outcomes and resumable run state. That is a breaking protocol change for an old client connected to a new server: the old client depends on custom approval events that the new server will no longer emit. Emitting both paths is not safe because duplicate prompts, duplicate callbacks, and ordering ambiguity can cause two responses to the same logical decision. No capability negotiation exists to make dual emission reliable.

PR #785 also has correctness gaps that this design closes:

- [`addToolApprovalResponse`](https://github.com/TanStack/ai/blob/61026d52669fc261b7a051ba20ba4bd806ce84fd/packages/ai-client/src/chat-client.ts#L1514-L1534) currently maps denial to `cancelled`. AG-UI represents denial as a resolved response such as `{ "approved": false }`; cancellation abandons an interrupt and has no payload.
- The [resume request path](https://github.com/TanStack/ai/blob/61026d52669fc261b7a051ba20ba4bd806ce84fd/packages/ai-client/src/chat-client.ts#L1054-L1067) reuses the interrupted run ID. AG-UI ends the interrupted run and resumes in a new run on the same thread.
- The [interrupt construction path](https://github.com/TanStack/ai/blob/61026d52669fc261b7a051ba20ba4bd806ce84fd/packages/ai/src/activities/chat/index.ts#L1762-L1825) uses noncanonical reasons. Tool approvals must use `tool_call`; a TanStack-specific client-tool interruption must use a namespaced reason.
- The [resumed tool path](https://github.com/TanStack/ai/blob/61026d52669fc261b7a051ba20ba4bd806ce84fd/packages/ai/src/activities/chat/index.ts#L1837-L1873) can replay tool call start, arguments, and end events. A resumed edited tool call emits only the result against the original `toolCallId`.
- The [persistence middleware](https://github.com/TanStack/ai/blob/61026d52669fc261b7a051ba20ba4bd806ce84fd/packages/ai-persistence/src/middleware.ts#L93-L154) validates fail-fast and stores responses sequentially. A response batch needs exhaustive validation followed by one atomic commit.
- The [interrupt store contract](https://github.com/TanStack/ai/blob/61026d52669fc261b7a051ba20ba4bd806ce84fd/packages/ai-persistence/src/types.ts#L47-L73) exposes per-item `resolve` and `cancel`, so it cannot guarantee all-or-none batch persistence or first-writer conflict handling.

Because PR #785 has not established a stable released API for native interrupt resumption, its raw `resumeInterrupts` surface can be replaced by the safe bound API in this work. An explicitly unsafe raw escape hatch remains available.

## Goals

- Fully implement the AG-UI interrupt lifecycle, event ordering, resume batching, cancellation, expiry, and idempotency requirements.
- Make tool approvals ergonomic and type-safe from definition through every framework hook.
- Support edited tool arguments as an optional full replacement of the original arguments.
- Support branch-specific typed custom approval and rejection payloads.
- Support arbitrary AG-UI interrupt reasons and response schemas without pretending runtime JSON Schema creates static TypeScript types.
- Make multiple simultaneous interrupts safe and easy to resolve individually or as a root transaction.
- Validate every entry on the server and return all errors in one response.
- Preserve client response drafts across reloads while keeping final response authority on the server.
- Prevent partial response persistence, duplicate continuation scheduling, and last-writer overwrites.
- Give React, Preact, Solid, Vue, Svelte, and Angular equivalent behavior through the headless client.
- Provide a clear pre-1.0 deprecation and migration path.

## Non-goals

- A codemod for approval APIs.
- Static type inference from an interrupt's runtime JSON Schema.
- Protocol negotiation or dual emission of native and legacy approval events.
- Partial submission of a batch while sibling interrupts remain unanswered.
- Merging `editedArgs` into original arguments. Edited arguments are always a complete replacement.
- Deprecating `addToolResult`; it remains the direct client-tool result API.
- Combining client-tool execution and human tool approval into one interrupt type.
- Exactly-once external side effects for arbitrary tools. Tool implementations still need idempotency where crash recovery can re-enter external work.
- Changing general checkpoint, tool-result, or message persistence beyond the interrupt response transaction required here.

## Considered architectures

### 1. Staged bound interrupts with auto-submit, selected

Every exposed interrupt carries methods bound to the owning chat client. Item methods stage a decision. Once all currently open interrupts are covered, the client submits one batch. A singleton is therefore both staged and submitted by one call.

This design makes the common case concise, supports per-card user interfaces, and preserves the AG-UI all-open-interrupt batch invariant. It also provides a natural place for typed tool overloads, validation status, item errors, replacement, and clearing.

### 2. Pure response builders plus explicit submit

Item methods could return response objects and require a separate root submit call. This makes batching explicit but adds boilerplate to the singleton case, makes per-card code manage a second response collection, and does not match the requested binding behavior.

### 3. Root-only reducer

The hook could expose only `resolveInterrupts(interrupts => responses)`. This centralizes atomicity but makes independent interrupt components awkward, prevents direct item binding, and forces a heterogeneous response construction problem into every consumer.

The selected architecture keeps atomic submission centralized internally while exposing both convenient item bindings and an explicit root transaction.

## Public type model

The examples below describe the public contract. Implementation helper types may use different internal names, but they must preserve these inference and assignability rules.

### Common bound interrupt fields

```ts
type InterruptStatus =
  | 'pending'
  | 'validating'
  | 'staged'
  | 'submitting'
  | 'error'

interface InterruptCorrelation {
  threadId: string
  interruptedRunId: string
  generation: number
  submissionId?: string
  continuationRunId?: string
}

type ItemInterruptErrorCode =
  | 'invalid-payload'
  | 'invalid-edited-args'
  | 'invalid-tool-output'
  | 'invalid-response-schema'
  | 'unknown-interrupt'
  | 'expired'
  | 'stale'
  | 'conflict'
  | 'legacy-unsupported'

interface ItemInterruptError extends InterruptCorrelation {
  scope: 'item'
  interruptId: string
  code: ItemInterruptErrorCode
  message: string
  path?: readonly (string | number)[]
  source: 'client' | 'server'
  retryable: boolean
}

type BatchInterruptErrorCode =
  | 'incomplete-batch'
  | 'item-validation-failed'
  | 'unsupported-bulk-operation'
  | 'async-resolver'
  | 'inactive-transaction'
  | 'mixed-provenance'
  | 'transport'
  | 'server'
  | 'protocol'
  | 'invalid-response-schema'
  | 'expired'
  | 'stale'
  | 'conflict'
  | 'persistence-required'
  | 'atomic-commit-unsupported'
  | 'recovery-unavailable'
  | 'legacy-submit-failed'

interface BatchInterruptError extends InterruptCorrelation {
  scope: 'batch'
  code: BatchInterruptErrorCode
  message: string
  source: 'client' | 'server' | 'transport'
  retryable: boolean
  interruptIds: readonly string[]
}

type InterruptSubmissionError = ItemInterruptError | BatchInterruptError

interface BoundInterruptBase<TStagedResponse> {
  id: string
  reason: string
  message?: string
  toolCallId?: string
  responseSchema?: JSONSchema
  expiresAt?: string
  metadata?: Record<string, unknown>
  status: InterruptStatus
  provenance: 'native' | 'legacy'
  generation: number
  errors: readonly ItemInterruptError[]
  stagedResponse?: TStagedResponse
  clearResolution(): void
  cancelInterrupt(): void
}
```

The AG-UI fields retain the installed core package's actual exported types. A typed `JSONSchema` descriptor still does not create a static application payload type. `stagedResponse` is a read-only view of the local draft and never includes bound functions when persisted.

Every public variant has a TanStack-owned `kind` discriminator. Known tool variants also carry the configured tool's literal `toolName`; neither field is read from untrusted resume metadata.

```ts
declare const toolApprovalCapability: unique symbol

interface ToolApprovalCapabilityMarker<TNeedsApproval extends boolean> {
  readonly [toolApprovalCapability]: TNeedsApproval
}

type ApprovalCapabilityOf<TTool> =
  TTool extends ToolApprovalCapabilityMarker<infer TNeedsApproval>
    ? TNeedsApproval
    : false

type ToolName<TTools extends readonly AnyClientTool[]> = TTools[number]['name']

type ToolByName<
  TTools extends readonly AnyClientTool[],
  TName extends ToolName<TTools>,
> = Extract<TTools[number], { name: TName }>

type ApprovalToolName<TTools extends readonly AnyClientTool[]> = {
  [TName in ToolName<TTools>]: ApprovalCapabilityOf<
    ToolByName<TTools, TName>
  > extends true
    ? TName
    : never
}[ToolName<TTools>]

type ToolApprovalInterruptsFor<
  TTools extends readonly AnyClientTool[],
> = {
  [TName in ApprovalToolName<TTools>]: ToolApprovalInterrupt<
    ToolByName<TTools, TName>
  > & {
    kind: 'tool-approval'
    toolName: TName
  }
}[ApprovalToolName<TTools>]

type ClientToolExecutionInterruptsFor<
  TTools extends readonly AnyClientTool[],
> = {
  [TName in ToolName<TTools>]: ClientToolExecutionInterrupt<
    ToolByName<TTools, TName>
  > & {
    kind: 'client-tool-execution'
    toolName: TName
  }
}[ToolName<TTools>]

type ChatInterrupt<TTools extends readonly AnyClientTool[]> =
  | ToolApprovalInterruptsFor<TTools>
  | ClientToolExecutionInterruptsFor<TTools>
  | GenericAGUIInterrupt
```

A generic interrupt has `kind: 'generic'` and no `toolName`. A known tool interrupt narrows by `kind` and literal `toolName` to the configured tool's input, output, and approval payload types. `ToolApprovalInterruptsFor` contains only names whose preserved `TNeedsApproval` capability is the literal `true`; tools with literal `false`, absent approval capability, or a widened nonliteral capability cannot enter the approval variant. A native descriptor that cannot be matched safely remains generic even if it happens to contain a tool-like reason.

At submission, the server looks up the authoritative original call by `(threadId, interruptedRunId, interruptId)` and obtains its stored `toolCallId`, `toolName`, original arguments, schema hashes, and generation. It never selects a tool or arguments from client-supplied `kind`, `toolName`, `toolCallId`, or metadata. Any conflicting client correlation field is ignored for binding and reported as `stale` or `protocol` when it indicates a mismatched descriptor.

### Tool definition configuration

`approvalSchema` is legal only when `needsApproval` is statically `true`.

```ts
const transferFunds = toolDefinition({
  name: 'transferFunds',
  inputSchema: transferInputSchema,
  outputSchema: transferOutputSchema,
  needsApproval: true,
  approvalSchema: {
    approve: approvalPayloadSchema,
    reject: rejectionPayloadSchema,
  },
})
```

Supported forms are:

```ts
approvalSchema: sharedPayloadSchema

approvalSchema: {
  approve: approvalPayloadSchema,
  reject: rejectionPayloadSchema,
}
```

The branch object must contain at least one branch. A shared schema applies to both approval and rejection. In a branch object, an omitted branch forbids a custom payload for that decision. If `approvalSchema` is absent, both branches forbid a custom payload. `approvalSchema` by itself never enables approval; `needsApproval: true` is required.

Each shared or branch schema accepts the full existing `SchemaInput` family: Standard JSON Schema, Standard Schema, or TanStack's raw `JSONSchema`. Standard JSON Schema and raw JSON Schema are serialized into the AG-UI `responseSchema`. A Standard Schema validator that also exports Standard JSON Schema uses that export. A Standard Schema validator without JSON Schema export remains supported: matching TanStack clients and the server use the configured validator, while the wire schema expresses the branch envelope with an unconstrained nested payload. Generic clients therefore keep that nested payload as `unknown`, and server validation remains authoritative.

Schema inference rules are explicit:

- A Standard Schema or Standard JSON Schema input contributes its declared input type.
- A raw `JSONSchema` contributes `unknown`; TanStack does not infer a TypeScript type from JSON Schema syntax.
- An absent `inputSchema` forbids `editedArgs` in types and at runtime. The original stored arguments are used unchanged.
- A present raw `inputSchema` permits `editedArgs: unknown`, then validates the replacement at runtime.
- An absent `outputSchema` makes client-tool output `unknown` and performs no output-schema validation.
- A present raw `outputSchema` keeps output `unknown` and validates it at runtime.
- An absent approval branch schema forbids nested `payload`.
- A present raw approval schema requires `payload: unknown`; Standard Schema input that includes `undefined` makes the property optional, while other typed schema inputs require it.

The branch-map form is recognized only when its own keys are a nonempty subset of `approve` and `reject` and its values are `SchemaInput` values. A Standard Schema object is recognized by its standard marker first, and an object containing JSON Schema keywords is a shared raw schema. Ambiguous or malformed configuration fails tool-definition construction.

The tool-definition builder carries its `TNeedsApproval` generic through the non-runtime `ToolApprovalCapabilityMarker` and preserves that marker, the input schema, output schema, and approval schema generics through client and server tool transformations. The mapped union reads this type marker rather than the optional runtime `needsApproval` property. Configurations with `needsApproval: false` or without `needsApproval` reject `approvalSchema` at compile time and runtime.

### Typed tool approval signatures

A tool approval interrupt has this normative branch-aware public contract:

```ts
interface ToolApprovalInterrupt<
  TTool extends AnyClientTool,
> extends BoundInterruptBase<ToolApprovalDraft<
    ToolInputSchema<TTool>,
    ApproveSchema<TTool>,
    RejectSchema<TTool>
  >> {
  kind: 'tool-approval'
  reason: 'tool_call'
  toolName: TTool['name']
  toolCallId: string

  resolveInterrupt(
    approved: true,
    ...options: OptionsTuple<ApprovalFields<
      ToolInputSchema<TTool>,
      ApproveSchema<TTool>
    >>
  ): void

  resolveInterrupt(
    approved: false,
    ...options: OptionsTuple<RejectionFields<RejectSchema<TTool>>>
  ): void
}

type EditedArgsField<TInputSchema> = TInputSchema extends NoSchema
  ? { editedArgs?: never }
  : { editedArgs?: InferSchemaInput<TInputSchema> }

type PayloadField<TPayloadSchema> = TPayloadSchema extends NoSchema
  ? { payload?: never }
  : TPayloadSchema extends JSONSchema
    ? { payload: unknown }
    : undefined extends InferSchemaInput<TPayloadSchema>
      ? { payload?: InferSchemaInput<TPayloadSchema> }
      : { payload: InferSchemaInput<TPayloadSchema> }

type ApprovalFields<TInputSchema, TPayloadSchema> =
  EditedArgsField<TInputSchema> & PayloadField<TPayloadSchema>

type RejectionFields<TPayloadSchema> = PayloadField<TPayloadSchema> & {
  editedArgs?: never
}

declare const noSchema: unique symbol
type NoSchema = typeof noSchema

type RequiredKeys<T> = {
  [TKey in keyof T]-?: {} extends Pick<T, TKey> ? never : TKey
}[keyof T]

type OptionsTuple<TFields> = [RequiredKeys<TFields>] extends [never]
  ? [options?: TFields]
  : [options: TFields]

type ToolApprovalDraft<TInputSchema, TApproveSchema, TRejectSchema> =
  | ({ status: 'resolved'; approved: true } & ApprovalFields<
      TInputSchema,
      TApproveSchema
    >)
  | ({ status: 'resolved'; approved: false } & RejectionFields<
      TRejectSchema
    >)
  | {
      status: 'cancelled'
    }
```

`OptionsTuple<TFields>` makes the argument optional only when every property in `TFields` is optional; otherwise it requires exactly one options object. The resolver overloads and `ToolApprovalDraft` deliberately share `ApprovalFields` and `RejectionFields`, so `stagedResponse` cannot represent a payload that the resolver could not create.

The conditional option tuple has these rules:

- `editedArgs` is optional and exists only on the approval branch.
- `editedArgs` is inferred from the tool's `inputSchema` and is forbidden when that schema is absent.
- If an approval payload schema requires a value, the options object and its `payload` field are required.
- If an approval payload is optional, the options object is optional unless `editedArgs` is supplied.
- If a branch has no payload schema, that branch's options type has no `payload` field. Raw JSON Schema payloads are required but remain `unknown` statically.
- The rejection branch has no `editedArgs` field.
- Excess-property checks and runtime validation reject custom fields outside the nested `payload` object.

The intended calls are:

```ts
interrupt.resolveInterrupt(true)

interrupt.resolveInterrupt(true, {
  editedArgs: updatedInput,
  payload: { note: 'Reviewed' },
})

interrupt.resolveInterrupt(false, {
  payload: { reason: 'Insufficient evidence' },
})
```

The first argument always represents approval or denial. On the AG-UI wire, both are `resolved` entries. TanStack's response schema and resume payload use this envelope:

```ts
type ToolApprovalResumePayload =
  | {
      approved: true
      editedArgs?: unknown
      payload?: unknown
    }
  | {
      approved: false
      payload?: unknown
    }
```

`approvalSchema` governs only the nested `payload`. The generated `responseSchema` is a JSON Schema union of the approval and rejection envelopes. The approval branch includes optional `editedArgs` governed by `inputSchema`; the rejection branch forbids `editedArgs`. Branches without an approval schema forbid `payload`.

`editedArgs`, when present, fully replaces the original tool arguments. Neither client nor server performs a shallow or deep merge. The server validates the replacement against `inputSchema` before any response is committed or tool is executed.

### Generic AG-UI interrupts

An interrupt that is not a known tool approval or a known TanStack client-tool execution remains generic:

```ts
interface GenericAGUIInterrupt
  extends BoundInterruptBase<
    | { status: 'resolved'; payload: unknown }
    | { status: 'cancelled' }
  > {
  kind: 'generic'
  toolName?: never
  resolveInterrupt(payload: unknown): void
}
```

All standard descriptor fields are statically known. The response remains `unknown` because a JSON Schema received at runtime cannot safely produce a compile-time TypeScript type. The client validates against `responseSchema` as a preflight when a schema is present. The server repeats that validation authoritatively.

The user documentation will show how to convert the received JSON Schema into a schema supported by the user's chosen validation library, validate the payload, and narrow the result before calling `resolveInterrupt`. It will also show a Standard Schema compatible validation path. Documentation examples must not claim static inference from the wire schema.

### Client-tool execution interrupts

A client-owned tool that is awaiting browser execution is separate from human approval:

```ts
interface ClientToolExecutionInterrupt<TTool extends AnyClientTool>
  extends BoundInterruptBase<
    | { status: 'resolved'; payload: InferToolOutput<TTool> }
    | { status: 'cancelled' }
  > {
  kind: 'client-tool-execution'
  reason: 'tanstack:client_tool_execution'
  toolName: TTool['name']
  toolCallId: string
  resolveInterrupt(output: InferToolOutput<TTool>): void
}
```

The output is inferred from the tool's `outputSchema` and is validated before submission and again on the server when that schema exists. With no output schema, output is `unknown` and no schema validation is attempted. A raw output schema also remains `unknown` statically but is validated at runtime. `addToolResult` remains supported and delegates to this machinery when it targets a pending client-tool interrupt. It is not deprecated.

### Hook and headless-client surface

Every framework hook exposes the same logical surface from the headless client:

```ts
const {
  interrupts,
  resolveInterrupts,
  cancelInterrupts,
  retryInterrupts,
  interruptErrors,
  isResuming,
  resumeInterruptsUnsafe,
} = useChat(options)
```

The root operations are:

```ts
resolveInterrupts(decision: boolean): Promise<void>

resolveInterrupts(
  resolve: (interrupt: ChatInterrupt<TTools>) => undefined,
): Promise<void>

cancelInterrupts(): Promise<void>

retryInterrupts(): Promise<void>

resumeInterruptsUnsafe(
  entries: readonly RunAgentResumeItem[],
  state?: ChatResumeState,
): Promise<void>
```

The boolean overload is intentionally narrow. It is allowed only when every open interrupt is a tool approval and the selected decision branch requires no custom payload. It never edits arguments. The client rejects unsupported boolean bulk operations before staging anything. Heterogeneous batches and payload-bearing decisions use the callback overload.

Root promises resolve only after the server accepts the atomic response batch. They reject with a `BatchInterruptError` when validation, transport, protocol, expiry, staleness, or conflict prevents acceptance. Bound item methods are synchronous and return `void`; they update local state and may start asynchronous submission internally.

`resumeInterruptsUnsafe` is the raw protocol escape hatch. It bypasses the type-safe builder API but still passes through server validation, exact-set checks, expiry checks, and atomic persistence. Its name is deliberately explicit. Normal application code should use bound or root resolvers.

## Client staging and submission state machine

The client maintains one draft slot per open interrupt. A draft is a resolved response or a cancellation.

```text
pending -> staged -> submitting -> accepted
   ^          |          |
   |          |          +-> error
   +----------+
```

The state machine follows these rules:

1. `resolveInterrupt` constructs a candidate synchronously and starts client preflight. Synchronous validators finish in the call; an async Standard Schema validator sets status to `validating` and the submission gate waits for it.
2. `cancelInterrupt` stages `status: 'cancelled'` with no payload and needs no response-schema validation.
3. A valid candidate replaces the prior draft, clears superseded item errors, and sets status to `staged` while no submission is in flight.
4. An invalid replacement does not destroy the last valid draft. It sets status to `error`, records errors for the attempted candidate, preserves the previous `stagedResponse` for display, and blocks submission until the user supplies a valid replacement or clears it.
5. Async validation captures the item's draft generation. A result from an older candidate is discarded and cannot overwrite newer state.
6. `clearResolution()` removes the draft and candidate errors, increments the draft generation, and returns the item to `pending` while no submission is in flight.
7. With one open interrupt, a valid response or cancellation immediately starts submission after preflight completes.
8. With multiple open interrupts, item calls do not submit until every interrupt has a valid draft and no item is validating or in `error`.
9. When the final uncovered interrupt becomes valid, the client freezes the complete canonical batch, its draft generations, and fingerprint, then starts one submission.
10. During `submitting`, item replacement and clearing are rejected to avoid mutating the in-flight fingerprint.
11. A transport or retryable availability failure unfreezes interaction but retains the complete valid batch and its retry fingerprint. Items return to `staged`, root `interruptErrors` receives the failure, and `retryInterrupts()` is enabled.
12. Editing, replacing, cancelling, or clearing any item after that failure increments the batch generation, discards the frozen retry fingerprint, and clears the superseded transport error. `retryInterrupts()` then rejects until a new complete batch is frozen.
13. A server validation failure unfreezes the batch, maps every item error, and sets affected items to `error` without deleting their last candidate. A corrected valid candidate replaces it.
14. Pending interrupts block unrelated new user input as required by AG-UI.
15. After acceptance, the resolved descriptors and drafts leave the active `interrupts` collection and the continuation owns subsequent state.

The callback overload is a synchronous transaction. Its return type is `undefined`, not `void`, because TypeScript permits an async function where a callback merely returns `void`:

```ts
await resolveInterrupts((interrupt) => {
  if (interrupt.kind === 'tool-approval') {
    if (interrupt.toolName === 'transferFunds') {
      interrupt.resolveInterrupt(true, {
        payload: { note: 'Reviewed' },
      })
      return
    }

    interrupt.cancelInterrupt()
    return
  }

  if (interrupt.kind === 'client-tool-execution') {
    interrupt.cancelInterrupt()
    return
  }

  interrupt.resolveInterrupt(buildGenericResponse(interrupt))
})
```

The client invokes the callback exactly once for each interrupt in a stable snapshot. It passes transaction-scoped bound wrappers carrying a unique transaction token and draft-generation number. Item auto-submission is suppressed during the callback. On normal `undefined` return, every snapshot item must be covered; the complete batch is submitted once and the token is sealed.

If the callback throws, returns any non-`undefined` value, returns a promise or thenable, or leaves an interrupt uncovered, all staging changes made by that callback are rolled back, its token and generation are invalidated, and no network request starts. Every transaction-scoped item method checks that token before touching state. This prevents a bypassed async callback from returning a promise, awaiting, and then mutating live drafts after rollback. Such a late call is ignored, records a root `inactive-transaction` error, and never submits. The original non-transaction bound objects remain usable after the failed root operation.

`cancelInterrupts()` stages cancellation for every open interrupt and submits one batch. A cancellation counts as coverage but is never rewritten as an approval denial.

`retryInterrupts()` resubmits the same frozen complete batch only after a retryable transport or server availability failure. Expired, stale, and conflicting batches refresh authoritative state and cannot be retried blindly.

## Validation and error propagation

### JSON Schema contract

`[TanStack]` All serialized `responseSchema`, raw input, raw output, and raw approval schemas use JSON Schema Draft 2020-12. An absent `$schema` is interpreted as Draft 2020-12. A different declared dialect is rejected rather than silently reinterpreted.

Browser and server use Ajv 8's 2020 entry point plus `ajv-formats` in full mode with the same options: `allErrors: true`, strict schema checking, format validation enabled, type coercion disabled, defaults disabled, and data mutation disabled. Unknown formats are schema compilation errors. Only document-local references, including `#` and `#/$defs/...`, are supported. Network, file, and cross-document `$ref` resolution is disabled in both environments. Unresolved references and invalid schemas produce `invalid-response-schema`; a TanStack server rejects an invalid schema before emitting an interrupt descriptor.

Ajv `instancePath` values are decoded using RFC 6901 escaping. Normalized public paths are arrays of decoded string segments; validators that natively report numeric array indexes may use numbers. For `required` and `additionalProperties` errors, the missing or extra property is appended to the instance path. Multiple Ajv errors remain multiple errors and retain deterministic Ajv evaluation order within an item; items are ordered by interrupt ID in the aggregate response.

Standard Schema validators run through their own validation surface and their issue paths are normalized to the same public path form. Client preflight may await an async Standard Schema validator behind the synchronous staging API. Server validation may also await it before commit. The serialized envelope is additionally checked with the common Ajv configuration. Validation never coerces, fills defaults, strips properties, or mutates `editedArgs` or payloads.

If a client receives an invalid generic schema from a non-TanStack source, resolved submission is disabled for that item and it receives `invalid-response-schema`; cancellation remains available because it has no payload. `resumeInterruptsUnsafe` cannot bypass authoritative schema compilation.

Validation happens in two phases:

- Client preflight gives immediate feedback and avoids known-invalid requests.
- `[TanStack]` Server validation is mandatory and authoritative because clients, schemas, state, and expiry can be stale or bypassed. Exhaustive validation and no-write-on-any-invalid are stronger TanStack guarantees, not additional claims about the AG-UI base protocol.

The server validates every entry in the proposed batch before persisting or executing anything. It collects all failures rather than stopping at the first failure. Checks include:

- The response covers exactly the current open interrupt ID set.
- Every ID belongs to the interrupted run and has not expired.
- Each entry uses an allowed `resolved` or `cancelled` status.
- A cancelled entry has no payload.
- A resolved generic payload matches `responseSchema` when present.
- A tool approval envelope selects a valid branch.
- Approved `editedArgs`, when present, match `inputSchema` as a full replacement.
- Rejection never includes `editedArgs`.
- The nested custom payload matches the selected approval schema branch.
- A client-tool output matches `outputSchema`.

If any validation fails, the server performs no interrupt response write, schedules no continuation tools, and returns one AG-UI `RUN_ERROR`. It does not emit a second error event or a compensating `RUN_FINISHED`. Because `RUN_ERROR` is the protocol's error event and its schema permits extension fields, TanStack attaches a serialized `InterruptSubmissionError[]` at the top-level namespaced field `tanstack:interruptErrors`. Generic AG-UI consumers still receive the standard error message and code.

`scope: 'item'` errors populate only the matching bound item's `errors`; `scope: 'batch'` errors populate only root `interruptErrors`. An unknown interrupt ID, missing item, or invalid exact-set check is a batch error unless the authoritative state can correlate the problem to one still-current item. Every error carries thread, interrupted-run, and generation correlation; submission and continuation IDs are included when known. The promise rejection is a `BatchInterruptError` with `item-validation-failed` when only item errors caused failure, and its `interruptIds` lists every affected item.

Retryability is explicit, not inferred only from code. Transport and transient server availability errors are retryable when the frozen fingerprint remains intact. Client validation, invalid schema, incomplete batch, unsupported bulk, async resolver, inactive transaction, mixed provenance, persistence capability, expiry, staleness, and conflict errors are not retryable without a state or draft change. A server error may mark itself retryable only when it proves no commit occurred.

`interruptErrors` is cleared or replaced by the next relevant operation. A transport failure keeps the complete valid draft batch staged and adds a retryable root error. Stale, expired, and conflict responses replace local descriptors and drafts with authoritative server state before exposing the non-retryable error.

### Authoritative recovery state

`[TanStack]` Stale, expired, replayed, and conflicting submissions use one versioned recovery DTO:

```ts
interface InterruptRecoveryStateV1 {
  schemaVersion: 1
  state: 'pending' | 'committed' | 'expired' | 'missing' | 'legacy-committed'
  threadId: string
  interruptedRunId: string
  generation: number
  pendingInterrupts: readonly Interrupt[]
  committed?: {
    fingerprint: string
    resolutions: readonly RunAgentResumeItem[]
    continuationRunId?: string
    committedAt: string
  }
}
```

For every newly committed batch, `state: 'committed'` requires `committed.continuationRunId`; that is the winning continuation ID. `resolutions` is included only for authorized callers and is redacted according to the same policy as interrupt payload persistence. `legacy-committed` exists only for migrated pre-batch records whose historical continuation ID cannot be reconstructed. `pendingInterrupts` is nonempty only in `pending`; expired, missing, and committed states return an empty set.

The primary recovery wire path is the top-level `tanstack:interruptRecovery` field on the same `RUN_ERROR` that reports stale, expired, or conflict. The server obtains this DTO in the same persistence read or transaction that detects the condition, so its generation and winning commit are consistent with the error.

If the stream ends before that event or a transport cannot carry extension fields, the client calls an explicit recovery fetch contract:

```ts
type InterruptStateFetcher = (
  input: {
    threadId: string
    interruptedRunId: string
    knownGeneration: number
  },
  options: { signal: AbortSignal },
) => Promise<InterruptRecoveryStateV1>
```

Connection adapters expose the equivalent `loadInterruptState` method. Fetcher-mode clients receive `interruptStateFetcher` beside `fetcher`. Server integrations expose the matching authenticated `getInterruptRecoveryState` handler over their chosen transport; the HTTP helper returns the DTO as JSON. The standard fetch and connection bridges wire these contracts automatically. This is a TanStack recovery extension, not an AG-UI run request.

The client accepts only a matching thread and interrupted-run ID and a generation at least as new as its current generation. `pending` replaces descriptors, rebinds methods from the configured tool registry, and reconciles drafts. `committed` clears drafts and attaches to or reloads the winning continuation. `expired` clears drafts and reports expiry. `missing` and `legacy-committed` clear unsafe retry state and report a non-retryable protocol or migration error. If neither the event extension nor a configured recovery fetcher is available, state is not guessed: drafts remain quarantined, submission is disabled, and root receives `recovery-unavailable`.

## Client draft durability

Draft decisions are client state, not final server responses. `ChatPersistenceController` owns serialization, hydration, generation invalidation, and cleanup. The configured `persistence.server` `ChatStorageAdapter` remains an opaque get/set/remove transport keyed by thread ID; it never creates bound objects or decides reconciliation.

The stored DTO is versioned and contains raw JSON only:

```ts
interface ChatResumeSnapshotV2 {
  schemaVersion: 2
  resumeState: ChatResumeState
  interruptState?: {
    provenance: 'native' | 'legacy'
    phase: 'pending' | 'accepted'
    interruptedRunId: string
    generation: number
    descriptorsHash: string
    descriptors: readonly Interrupt[]
    drafts: readonly {
      interruptId: string
      responseSchemaHash: string
      response: RunAgentResumeItem
      savedAt: string
    }[]
    continuationRunId?: string
  }
}
```

The effective draft identity is `(threadId, interruptedRunId, generation, interruptId, responseSchemaHash)`. Functions, validators, tool implementations, `kind`, and hydrated error objects are never serialized. On hydration, the controller validates the DTO shape and version, obtains authoritative recovery state when native interrupts are present, then rebuilds bound variants from descriptors plus the configured tool registry. A draft survives only when the authoritative run, generation, exact interrupt ID, canonical response schema hash, and expiry match. Everything else is discarded.

After acceptance, the client clears active in-memory descriptors and drafts immediately, writes an `accepted` tombstone containing the continuation ID and no drafts, then queues adapter removal. If removal fails, the tombstone prevents an old pending UI from reappearing; a later authoritative recovery confirms the commit and cleanup retries. Thread reset and disposal also invalidate pending writes by generation.

The unversioned PR #785 snapshot shape is treated as version 1. Migration copies `resumeState` and raw `pendingInterrupts` into a version 2 native descriptor set with no drafts, generation `0`, and a mandatory recovery refresh before resolution. Invalid or uncorrelatable version 1 snapshots are removed and produce a root `protocol` error. Legacy CUSTOM-event state continues to hydrate from message history through the compatibility backend, not by pretending it is a native resume snapshot.

`pendingInterrupts` is a deprecated getter alias over the same hydrated `interrupts` array. It does not read a second snapshot, does not persist functions, and does not return raw descriptor DTOs.

This persistence allows a user to answer part of a multi-interrupt batch, reload, and continue. It does not make a partial response visible to the server. Only the final complete batch is committed server-side.

## Atomic server persistence and concurrency

Every persistence adapter must implement an atomic batch compare-and-swap operation. Sequential per-item `resolve` and `cancel` calls are not an acceptable fallback.

The store contract adds this normative operation:

```ts
commitInterruptResolutions({
  threadId,
  interruptedRunId,
  continuationRunId,
  expectedGeneration,
  expectedInterruptIds,
  resolutions,
  fingerprint,
}): Promise<
  | { status: 'committed'; continuationRunId: string }
  | { status: 'replayed'; continuationRunId: string }
  | { status: 'conflict'; authoritativeState: InterruptBatchState }
>
```

The commit invariant is:

```text
All currently pending interrupt responses are persisted, or none are.
```

The server computes a stable canonical fingerprint over the sorted complete resolution set. Property ordering and interrupt input order do not affect it. The transaction compares the exact expected pending ID set, records the response batch and continuation run ID together, and transitions every item atomically.

Concurrency semantics are:

- The first valid complete batch commits and becomes authoritative.
- An exact replay with the same fingerprint is accepted idempotently as `replayed` and returns the first continuation run ID.
- A later different batch for the same interrupted run returns `conflict` and the authoritative state.
- A replay attaches to or replays the existing continuation. It never schedules the tools a second time.
- A missing, extra, expired, already-transitioned, or otherwise stale expected ID set cannot commit.

Database adapters use a transaction with a uniqueness or version predicate. The memory adapter uses a per-interrupted-run critical section and versioned batch record. Custom persistence adapters must implement the atomic operation; servers reject safe interrupt resumption when the configured adapter cannot provide it.

The atomic response record prevents duplicate continuation scheduling at the resume gateway. Existing run locks and checkpoints remain responsible for continuation recovery. Arbitrary external tools must still be idempotent when exactly-once side effects matter across process crashes.

This operation applies only to final client interrupt responses. Client drafts, general messages, checkpoints, and tool-result persistence retain their existing ownership and contracts unless separately changed.

### Persistence availability and adapter work

`[TanStack]` Safe native interrupt resumption requires an `InterruptStore` with atomic batch capability. Without configured persistence, the server must not emit an interrupt outcome that it cannot later resolve safely. At the point an operation would interrupt, it emits `RUN_ERROR` with `persistence-required` instead. Development applications may configure the existing memory persistence explicitly; production and multi-process applications use a durable adapter. There is no hidden process-global fallback.

Built-in work is mandatory:

- Memory: update `packages/ai-persistence/src/memory.ts` with a per-interrupted-run critical section, generation counter, immutable batch record, canonical fingerprint, replay lookup, and recovery DTO projection. It is single-process and loses state on restart, which documentation must state.
- Drizzle: update schema and stores in `packages/ai-persistence-drizzle`, add a numbered migration and packaged migration asset, and perform interrupt row transitions plus batch insert in one database transaction.
- Prisma: update the packaged and development Prisma models in `packages/ai-persistence-prisma`, its stores and model CLI, and document the required user migration before deploying the new package.
- Cloudflare: add the equivalent D1 migration and packaged asset in `packages/ai-persistence-cloudflare`, use a D1 transaction for the CAS, and leave R2 artifact storage unchanged.

Durable schemas add an `interrupt_batches` record keyed by interrupted run ID with thread ID, generation, expected ID set, fingerprint, serialized resolutions, winning continuation run ID, and commit time. Interrupt rows gain a generation column. Indexes cover `(run_id, status, generation)`, `(thread_id, status)`, and unique continuation run ID. The CAS transaction checks generation and the exact pending set, transitions rows, and inserts the batch record together.

Migration behavior is deterministic. Existing pending interrupt rows backfill to generation `1` and can enter the new CAS. Existing resolved or cancelled rows remain historical and are marked as legacy committed; because no reliable winning continuation ID can be inferred, recovery returns `legacy-committed` and never replays them. New writes always have a batch record. Migrations must be idempotent under the repository migration tooling and safe on nonempty databases.

The shared persistence testkit gains interrupt batch conformance covering commit, rollback, replay, conflict, recovery, generation, and concurrent writers. Memory, Drizzle, Prisma, and Cloudflare must all run it. A custom adapter lacking the capability fails server construction when interrupt middleware is configured, or fails the first dynamically discovered interrupt with `atomic-commit-unsupported` before emitting an interrupt outcome. It never falls back to sequential writes.

## AG-UI wire lifecycle

### Interrupted run

The server emits any required state before terminating the run:

1. Emit `MESSAGES_SNAPSHOT` when continuation needs updated message state.
2. Emit `STATE_SNAPSHOT` when continuation needs updated agent state.
3. Emit one `RUN_FINISHED` whose outcome is `type: 'interrupt'` and whose interrupt list is nonempty.

The interrupted run is terminal. Its interrupt descriptors contain globally unique IDs, canonical or namespaced reasons, optional `responseSchema`, optional expiry, and enough metadata to bind known tools without weakening generic fallback behavior.

Tool approvals use reason `tool_call`. General requests use the canonical `input_required` or `confirmation` reason when their semantics match it. TanStack client-tool execution uses `tanstack:client_tool_execution`. Other TanStack-specific reasons use the `tanstack:` namespace. Unknown reasons remain generic.

### Resume request

The client starts a new continuation run on the same thread. It sends one `resume` array containing every open interrupt exactly once. No new user message is required.

- Approval is `status: 'resolved'` with `{ approved: true, ... }`.
- Denial is `status: 'resolved'` with `{ approved: false, ... }`.
- Cancellation is `status: 'cancelled'` with no payload.
- An approved edit is a complete `editedArgs` replacement in the resolved payload.

The client checks `expiresAt` before sending. The server checks expiry authoritatively. An expired or stale resume ends with `RUN_ERROR`, refreshes authoritative state, and executes nothing.

### Continuation run

The continuation has a new run ID and the same thread ID. After the batch commits, a resumed server tool emits only `TOOL_CALL_RESULT` for the original `toolCallId`. It does not replay `TOOL_CALL_START`, `TOOL_CALL_ARGS`, or `TOOL_CALL_END`. Subsequent model output and tool calls proceed normally in the new run.

Downstream behavior is defined per entry after the complete batch commits:

- Approved tool approval: invoke the authoritative tool once with `editedArgs` when supplied, otherwise with the stored original arguments. Persist its actual tool-result history part and emit one `TOOL_CALL_RESULT` with the original `toolCallId`.
- Denied tool approval: do not invoke the tool. Persist a terminal tool-result history part whose value is `{ status: 'denied', payload?: unknown }` and emit one result-only `TOOL_CALL_RESULT` whose string content is the canonical JSON serialization of that value. This gives the continued model a resolved tool outcome without confusing denial with cancellation.
- Cancelled tool approval: do not invoke the tool and emit no `TOOL_CALL_RESULT`. Persist the cancellation in the interrupt batch audit record and mark the original call not-executed when reconstructing provider history. This follows the AG-UI parallel-interrupt example, which emits results for approved calls and treats the cancelled call as not-executed.
- Client-tool execution: treat the resolved output as the actual result, persist one tool-result history part, and emit one result-only `TOOL_CALL_RESULT`. Cancellation is not-executed and emits no result.
- Generic interrupt: pass the resolved payload or cancellation state to the continuation handler and emit no tool event unless the application itself creates a later tool call.

A mixed batch may therefore produce actual approved results, synthetic denied results, and no event for cancelled entries. Denied synthetic results are available immediately after commit; approved tool results are emitted as executions finish, so cross-tool result order is not guaranteed. Correlation is solely by the original `toolCallId`, and every result-producing entry emits exactly once. The resumed model starts only after required terminal history records for the batch are available; cancelled calls are excluded from its actionable tool-call set.

Snapshots and persisted resume state must make a refresh capable of reconstructing the pending interrupt set before response, and the authoritative resolution or continuation after response.

## Compatibility, deprecation, and migration

`[Compatibility]` New servers emit only native AG-UI interrupts. New clients temporarily retain legacy custom-event readers and a real legacy submission backend so they can consume an older server during migration. Old clients cannot consume the new native-only server approval flow, so the recommended deployment is a coordinated server and client upgrade.

Every hydrated item has `provenance: 'native' | 'legacy'`. Native items submit an AG-UI `resume` batch. Legacy `approval-requested` and `tool-input-available` events normalize into bound objects with `provenance: 'legacy'`, but they submit through the old history protocol:

1. Stage all current legacy approval decisions with the same singleton and all-items-covered gate used by native items.
2. On completion, clone the current message history and update every matching approval part in one in-memory transaction.
3. Send that complete updated history in one legacy follow-up request, using no native `resume` array.
4. If history construction fails, change no live message. If transport fails, restore the staged batch and expose `legacy-submit-failed`.

This legacy backend supports the behavior the old protocol can represent: boolean approve or deny and existing client-tool results. Edited arguments, custom approval payloads, generic interrupts, native cancellation, expiry, atomic server CAS, and native conflict recovery are rejected with `legacy-unsupported`; they are not silently dropped. Multiple legacy approvals received together are updated in one history transaction and one request. Native and legacy provenance cannot coexist in one batch; if malformed input creates such a set, submission stops with `mixed-provenance`.

The following are deprecated immediately and scheduled for removal at 1.0:

- `addToolApprovalResponse`
- `pendingInterrupts`
- Legacy approval custom-event types
- Legacy approval custom-event readers

`pendingInterrupts` remains a deprecated alias of the new bound `interrupts` collection during the transition. It does not expose a second state store. `addToolApprovalResponse` selects the native bound backend or legacy history backend from provenance and emits a deprecation notice in development. `addToolResult` similarly preserves the legacy history path for an old client-tool event and the typed native path for a native client-tool interrupt. Legacy readers never cause new servers to dual-emit.

The raw PR #785 `resumeInterrupts` name is replaced by `resumeInterruptsUnsafe`. The normal API is `interrupts`, item resolvers, and root resolvers.

There is no codemod. The migration guide will cover:

1. Coordinated client and server package upgrades.
2. Replacing `pendingInterrupts` reads with `interrupts`.
3. Replacing `addToolApprovalResponse` with bound `resolveInterrupt` calls.
4. The distinction between denial and cancellation.
5. Adding `approvalSchema` only beside `needsApproval: true`.
6. Moving custom response data under nested `payload`.
7. Treating `editedArgs` as an optional full replacement.
8. Resolving simultaneous interrupts individually or with the root callback.
9. Validating generic `unknown` payloads from `responseSchema`.
10. Upgrading custom persistence adapters to atomic batch commit.
11. Using `resumeInterruptsUnsafe` only for raw protocol integration.

The implementation will include a changeset that calls out the breaking protocol/API transition under the repository's pre-1.0 release convention.

## Documentation Impact

Implementation adds two user-facing pages:

- `docs/chat/interrupts.md`: the native AG-UI lifecycle and complete client API, with server and client examples.
- `docs/migration/interrupts.md`: the manual pre-1.0 migration from custom approval events and PR #785 raw resume APIs. There is no codemod.

Implementation updates these existing pages:

- `docs/tools/tool-approval.md`: `needsApproval`, shared and branch-specific `approvalSchema`, nested payloads, full-replacement edits, denial, and cancellation.
- `docs/tools/client-tools.md`: separate client-tool execution interrupts and retained `addToolResult`.
- `docs/chat/persistence.md`: version 2 client resume snapshots and draft hydration.
- `docs/persistence/custom-stores.md`: mandatory atomic interrupt batch capability and conformance kit.
- `docs/persistence/migrations.md`: Drizzle, Prisma, and Cloudflare schema migration steps.
- `docs/persistence/delivery-durability.md`: replay, first-writer conflicts, process-memory limitations, and tool idempotency.
- `docs/architecture/approval-flow-processing.md`: native event flow, new-run continuation, and legacy compatibility boundary.
- `docs/reference/functions/toolDefinition.md`: the `approvalSchema` type surface and `SchemaInput` behavior.

`docs/config.json` adds navigation entries and `addedAt: "2026-07-13"` for both new pages. It refreshes `updatedAt` to `2026-07-13` for every content-updated page listed above, leaving `addedAt` intact. The page examples show both server and client, avoid type-assertion casts, and demonstrate user-library conversion and validation of generic JSON Schema payloads. They distinguish `[AG-UI]` protocol rules from TanStack guarantees in prose rather than presenting CAS or exhaustive server validation as base-protocol requirements.

This internal file, `docs/superpowers/specs/2026-07-13-ag-ui-interrupts-design.md`, stays ignored and is not added to `docs/config.json`.

## Framework parity

Interrupt state, staging, validation, persistence, batching, and submission live in `@tanstack/ai-client`. Framework packages only adapt reactivity and preserve generics.

React, Preact, Solid, Vue, Svelte, and Angular must expose equivalent:

- Bound `interrupts`
- Deprecated `pendingInterrupts` alias
- Item resolver, clearer, and canceller behavior
- Root resolve, cancel, and retry functions
- `interruptErrors`
- `isResuming`
- `resumeInterruptsUnsafe`
- Tool and approval-schema inference

Framework-specific tests must prove that updates to staged status, errors, and replacement are observable in the framework's native reactive model. Behavior must not be reimplemented independently in wrappers.

## Implementation sequence

1. Extend core tool-definition types to preserve approval schema generics and generate branch-aware response schemas.
2. Add the atomic interrupt batch persistence contract and implement it in built-in adapters.
3. Correct server interrupt reasons, run lifecycle, exhaustive validation, batch commit, continuation IDs, and result-only resumed tool events.
4. Build the headless client's bound interrupt normalization, type mapping, staging transaction, validation, error mapping, draft persistence, and retry behavior.
5. Add root operations, the unsafe escape hatch, and the `addToolResult` delegation path.
6. Thread the headless surface and generics through all framework packages.
7. Add legacy client readers and deprecation annotations without server dual emission.
8. Add unit, integration, persistence, type, framework, and end-to-end coverage.
9. Publish the dedicated interrupts documentation, manual migration guide, docs metadata updates, and changeset.

Protocol and persistence foundations precede client convenience APIs so tests can exercise one authoritative wire contract. Compatibility shims are added after the new internal model exists, ensuring they delegate to one implementation.

## Test Strategy

Tests are layered so type construction and state-machine failures are found before persistence races and end-to-end transport runs. Existing suites are extended where they already own the behavior; new focused files are added only where mixing concerns would obscure failures.

Suite ownership is exact:

- Core protocol and execution: `packages/ai/tests/interrupts.test.ts` and new `packages/ai/tests/interrupts-types.test-d.ts`.
- Headless API and state machine: new `packages/ai-client/tests/chat-client-interrupts.test.ts`, plus `packages/ai-client/tests/chat-client-resume.test.ts` and `packages/ai-client/tests/chat-persistence-controller.test.ts`.
- Persistence middleware and memory: `packages/ai-persistence/tests/interrupts.test.ts`, `packages/ai-persistence/tests/memory.conformance.test.ts`, and interrupt coverage added to `packages/ai-persistence/src/testkit/conformance.ts`.
- Durable adapters: `packages/ai-persistence-drizzle/tests/drizzle.conformance.test.ts`, `packages/ai-persistence-drizzle/tests/migrations.test.ts`, `packages/ai-persistence-prisma/tests/prisma.conformance.test.ts`, `packages/ai-persistence-prisma/tests/models.test.ts`, `packages/ai-persistence-cloudflare/tests/runtime.conformance.test.ts`, and `packages/ai-persistence-cloudflare/tests/migrations.test.ts`.
- Framework behavior and types: `packages/ai-react/tests/use-chat.test.ts`, `packages/ai-react/tests/use-chat-types.test.ts`, the equivalent `use-chat` files in `ai-preact`, `ai-solid`, and `ai-vue`, `packages/ai-svelte/tests/use-chat.test.ts`, `packages/ai-svelte/tests/create-chat-types.test.ts`, `packages/ai-angular/tests/inject-chat.test.ts`, and `packages/ai-angular/tests/inject-chat-types.test.ts`.
- Browser-to-server behavior: new `testing/e2e/tests/interrupts.spec.ts` with its route fixture under `testing/e2e/src/routes/`.
- Documentation and links: the repository `test:docs` target after the pages and `docs/config.json` entries in Documentation Impact are changed.

### Type tests

- `approvalSchema` is accepted only with `needsApproval: true`.
- A tool with preserved `TNeedsApproval: false` or no approval marker produces `never` when extracted by `{ kind: 'tool-approval'; toolName: thatName }`, while a literal-true tool appears in the mapped approval union.
- Shared schema types both branches.
- Branch schemas type approval and rejection independently.
- An omitted branch forbids custom payload.
- Required and optional payload schemas produce the correct options arity.
- Approved resolution accepts optional full-replacement `editedArgs` inferred from `inputSchema`.
- Rejection rejects `editedArgs`.
- Custom fields are accepted only under nested `payload`.
- Client-tool resolution infers `outputSchema`.
- Generic interrupt resolution accepts `unknown` without unsafe inferred narrowing.
- Generics survive definition, client tool, server tool, headless client, and every framework hook.

### Client unit tests

- Singleton resolve and cancel auto-submit.
- Multi-item resolution waits for all items.
- Staged responses can be replaced and cleared before submission.
- Root callback visits each item once, suppresses intermediate submission, and submits once.
- Root callback rollback covers throws, non-`undefined` returns, promises, and incomplete batches.
- A deliberately cast async callback returns a promise, awaits a deferred gate, then calls an item method; token invalidation prevents the delayed post-await call from changing drafts or submitting.
- Boolean bulk resolution accepts only the allowed homogeneous case.
- Invalid replacement preserves the prior valid draft, sets item error state, and blocks submission until corrected or cleared.
- Editing or clearing after transport failure invalidates the frozen retry fingerprint.
- Transport failure retains a retryable frozen batch.
- Stale, expired, and conflict responses refresh authoritative state.
- Item and root errors map correctly and clear when superseded.
- Drafts survive reload and invalid drafts are discarded during reconciliation.
- Pending interrupts block unrelated new input.
- `addToolResult` and deprecated compatibility entry points delegate without duplicate submission.

### Server and protocol tests

- Snapshots precede interrupt `RUN_FINISHED`.
- Interrupted and continuation run IDs differ while thread ID remains stable.
- Resume covers the exact open set.
- Approval, denial, and cancellation produce distinct correct wire entries.
- Canonical and namespaced reasons are used.
- Edited arguments fully replace original arguments.
- Resumed tools emit result only against the original `toolCallId`.
- Generic payloads, tool envelopes, edited arguments, and client-tool outputs validate against their schemas.
- All invalid items are returned in one `RUN_ERROR` and no tool executes.
- Expired and stale resumes fail without writes or execution.
- Stale, expired, and conflict failures carry a correlated recovery DTO; fallback recovery fetch applies only newer matching generations.
- Invalid Draft 2020-12 schemas, remote references, unknown formats, and normalized paths behave identically in browser and server.

### Persistence and concurrency tests

- All responses commit or none do.
- A failure in any validation leaves every interrupt pending.
- Exact replay returns the original continuation run ID and does not schedule twice.
- Two different concurrent batches produce one commit and one conflict.
- Property and input ordering do not change the canonical fingerprint.
- Missing, extra, stale, and expired ID sets cannot commit.
- Built-in memory and durable adapters meet identical semantics.
- A restart after commit reconnects to the authoritative continuation.
- Custom adapters without atomic batch support fail loudly.
- No configured persistence fails before an unresumable interrupt outcome can be emitted.
- Nonempty-database migrations backfill pending generation state and mark historical commits as legacy.

### Compatibility and framework tests

- New clients translate legacy approval custom events into the new bound model.
- New servers do not emit legacy approval events.
- Deprecated aliases share state with the new APIs.
- Every framework observes the same staging, error, replacement, resolve, cancel, and retry behavior.
- Framework type tests preserve tool-specific approval payload inference.

### End-to-end scenarios

- One approval with and without edited arguments.
- Three simultaneous approvals resolved one card at a time.
- A heterogeneous batch resolved through the root callback.
- Approve, deny, and cancel decisions in one batch.
- In a mixed batch, approved and denied entries each emit one result-only event, cancelled entries emit none, no tool start/args/end event is replayed, and history contains the specified actual, denied, and not-executed audit states.
- Generic runtime-schema validation failure followed by correction.
- Multiple invalid entries returned together and corrected in one follow-up.
- Reload after one of three local drafts, then complete the batch.
- Network failure, explicit retry, and exact replay.
- Two browser tabs submit different complete batches and observe first-writer conflict behavior.
- Client-tool execution remains separate and type-safe.

Validation runs narrow package and type tests first, then the repository's mandatory pre-PR gate:

```text
pnpm test:pr
pnpm --filter @tanstack/ai-e2e test:e2e
```

The end-to-end suite is mandatory because this changes observable behavior.

## Risks and mitigations

### Type complexity leaks into user errors

Branch-aware conditional types can produce unreadable diagnostics. Keep public helper aliases named, document the two schema forms, and add compile-failure tests for the most common mistakes.

### Runtime and static schema behavior diverge

Generate the response JSON Schema from the same normalized approval-schema representation used by TypeScript helper types. Test every shared, branch-specific, absent, required, and optional combination at both type and runtime levels.

### Partial persistence or duplicate continuations

Sequential writes and best-effort fallback are forbidden. Require atomic adapter support, fingerprint the complete batch, store the continuation run ID in the same transaction, and test races with deterministic barriers.

### Duplicate external tool side effects after crashes

The response gateway prevents duplicate scheduling for exact replays, while run locks and checkpoints govern recovery. Documentation must still require idempotency keys for tools whose external side effects cannot tolerate retry.

### Stale client drafts overwrite authoritative responses

Draft keys include the interrupted run and interrupt ID, and reload reconciliation checks the authoritative set, schema identity, and expiry. CAS rejects any different response after the first commit.

### Compatibility shims create two sources of truth

Legacy readers and deprecated methods normalize into the same bound model. New servers emit only native interrupts. There is one client state store and one submission pipeline.

### Structured validation errors exceed the base protocol

Use standard `RUN_ERROR` fields for generic clients and a namespaced TanStack extension for the exhaustive error array. Do not introduce a competing error event.

### Framework behavior drifts

Keep all behavioral state in the headless client and limit wrappers to reactive projection. Run shared contract tests against every framework adapter.

## Acceptance criteria

The work is complete when all of the following are true:

- Native AG-UI interrupt runs, resumes, snapshots, expiry, cancellation, and result-only tool continuation conform to the primary specification.
- The public bound and root APIs implement the exact staging and submission semantics in this design.
- Tool approvals are branch-aware and type-safe from `inputSchema` and `approvalSchema` across all frameworks.
- Generic interrupts remain runtime-validated with statically `unknown` payloads.
- Every server validation error is returned together, with no write or execution on any invalid batch.
- Final response persistence is atomic, exact replay is idempotent, conflicting replay is rejected, and the first valid writer wins.
- Client drafts survive safe reload and never become partial server responses.
- Legacy client readers and deprecated APIs delegate to the new model, while new servers emit no legacy approval events.
- `addToolResult` remains supported and client-tool execution remains a separate typed interrupt.
- The migration guide, feature documentation, changeset, type tests, protocol tests, framework tests, persistence tests, and end-to-end scenarios are complete.
- The mandatory local quality gates pass before commit and review.
