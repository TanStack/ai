# AG-UI Interrupts Full-Spec Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement native AG-UI interrupts with typed bound resolution APIs, exhaustive validation, durable atomic batching, recovery, compatibility shims, and equivalent behavior in every supported framework.

**Architecture:** Core owns the wire DTOs, Draft 2020-12 validation, tool approval type machinery, and a persistence capability interface so `@tanstack/ai` never imports a persistence package. Persistence implementations atomically open and compare-and-swap complete interrupt batches; the headless client owns hydration, staging, validation, retry, and draft durability, while framework packages expose thin reactive projections. Continuations use the same thread, a fresh `runId`, and the interrupted run as `parentRunId` and the CAS correlation key.

**Tech Stack:** TypeScript 5.9, pnpm 11.9.0, Nx, Vitest 4, Ajv 8 Draft 2020-12, ajv-formats, Standard Schema, Drizzle/SQLite, Prisma, Cloudflare D1, React, Preact, Solid, Vue, Svelte, Angular, Playwright, TanStack Start

---

## Scope, file structure, and dependency order

The user already approved this feature-wide scope even though it changes more than five files. Keep each task narrowly scoped where feasible, do not add a codemod, and do not expand into general checkpoint, message, or tool-result persistence beyond what the interrupt transaction requires.

Implementation must proceed in dependency order:

1. Core schema validation and tool-definition types establish one runtime/static contract.
2. Core wire DTOs and the core-owned interrupt persistence capability remove package-cycle pressure.
3. The persistence contract, memory reference implementation, and shared conformance suite define atomic semantics.
4. Drizzle, Prisma, and Cloudflare D1 implement the same atomic contract before server resumption depends on it.
5. Server middleware and the chat engine enforce authoritative validation, event ordering, and continuation semantics.
6. The headless client implements bound interrupts and draft durability against the settled wire contract.
7. Compatibility readers and framework wrappers delegate to that single headless state machine.
8. Browser E2E, documentation, release metadata, review, and quality gates close the work.

The planned file ownership is:

| Unit | Files | Responsibility |
| --- | --- | --- |
| Core validation | `packages/ai/src/activities/chat/tools/json-schema-validator.ts`, `packages/ai/src/activities/chat/tools/approval-schema.ts` | Compile Draft 2020-12 schemas, normalize issues, distinguish approval schema forms, generate response envelopes and schema identities. |
| Core public contract | `packages/ai/src/interrupts.ts`, `packages/ai/src/types.ts`, `packages/ai/src/activities/chat/tools/tool-definition.ts`, `packages/ai/src/activities/chat/middleware/types.ts` | Public interrupt errors/recovery DTOs, capability seam, conditional generics, continuation state. |
| Persistence core | `packages/ai-persistence/src/types.ts`, `packages/ai-persistence/src/interrupts.ts`, `packages/ai-persistence/src/memory.ts`, `packages/ai-persistence/src/testkit/conformance.ts` | Exact-set CAS contract, canonical fingerprint, memory critical section, reusable adapter tests. |
| Durable stores | `packages/ai-persistence-drizzle/**`, `packages/ai-persistence-prisma/**`, `packages/ai-persistence-cloudflare/**` | Transactional batches, migrations, packaged assets, API and migration tests. R2 remains unchanged. |
| Server lifecycle | `packages/ai-persistence/src/middleware.ts`, `packages/ai/src/activities/chat/index.ts` | Rebind current schemas, validate every entry, commit once, emit one structured error, snapshot before terminal, result-only continuation. |
| Headless client | `packages/ai-client/src/interrupt-manager.ts`, `packages/ai-client/src/chat-client.ts`, `packages/ai-client/src/chat-persistence-controller.ts`, `packages/ai-client/src/connection-adapters.ts`, `packages/ai-client/src/types.ts` | Bound union, staging transaction, recovery, raw V2 drafts, explicit recovery adapters, compatibility delegation. |
| Framework adapters | `packages/ai-{react,preact,solid,vue,svelte,angular}/src/**` | Reactive projection and generic preservation only. |
| Browser/docs/release | `testing/e2e/**`, `docs/**`, `.changeset/ag-ui-interrupts.md` | Approved scenarios, feature/migration guides, timestamps, breaking changeset. |

## Spec coverage matrix

| Approved requirement | Owning task(s) |
| --- | --- |
| Protocol wire types and structured item/root errors | 3, 8, 9 |
| Canonical `tool_call` and `tanstack:client_tool_execution` reasons | 9 |
| `MESSAGES_SNAPSHOT` / `STATE_SNAPSHOT` before interrupt terminal | 9, 16 |
| New continuation `runId`, same thread, interrupted run as `parentRunId` | 8, 9, 12, 16 |
| Result-only resumed tool events and mixed audit history | 9, 16 |
| Conditional `approvalSchema`, Standard Schema inference, `.client()` / `.server()` preservation | 2, 10, 15 |
| Tool approval, client-tool, and generic bound unions | 10 |
| Singleton auto-submit; multi-item wait; replacement; clear; callback rollback/late-call protection | 11 |
| Root boolean/callback/cancel/retry, statuses, errors, staged response, unsafe raw resume | 11, 12 |
| Draft 2020-12 Ajv validation and deterministic paths | 1, 2, 8, 10 |
| Versioned client draft persistence and recovery reconciliation | 13 |
| Exhaustive authoritative server validation, one error event, no write on invalid | 8 |
| Atomic CAS memory/Drizzle/Prisma/D1, exact replay, conflict, first writer, recovery | 4, 5, 6, 7 |
| Core-owned persistence capability without package cycles | 3, 8 |
| Validator rebind by registered tool name/schema hash; drift is stale | 8 |
| Explicit recovery handler/fetcher, never a guessed URL | 8, 13 |
| Generic continuation exposed to application middleware | 3, 8, 9 |
| Deprecations, legacy reader, no native dual writer, retained `addToolResult` | 12 |
| Sandbox legacy-event collision guard | 12 |
| React/Preact/Solid/Vue/Svelte/Angular parity | 14, 15 |
| Documentation timestamps, migration guide, breaking changeset, no codemod | 17 |
| All approved unit/type/framework/E2E scenarios | 1-17 |

### Task 0: Prepare the isolated Windows execution environment

**Prerequisites:** None. Run every later command from `F:\projects\tanstack\ai-interrupts-full-spec-design` in native Windows PowerShell.

**Files:**
- Read: `AGENTS.md`
- Read: `CLAUDE.md`
- Read: `docs/superpowers/specs/2026-07-13-ag-ui-interrupts-design.md`
- Read: `docs/superpowers/plans/2026-07-13-ag-ui-interrupts.md`

- [ ] **Step 1: Verify branch and working tree ownership**

Run:

```powershell
git status --short --branch
git branch --show-current
```

Expected: branch `codex/interrupts-full-spec-design`; only intentional plan/spec history is present before implementation. Preserve unrelated user changes if any appear.

- [ ] **Step 2: Install with the repository-enforced package manager**

Run:

```powershell
corepack pnpm --version
pnpm install
```

Expected: pnpm reports `11.9.0` and install completes successfully. PowerShell environment assignments are process-local, so every later command block that runs Vitest, Nx, or Playwright sets `$env:CI='true'` itself. Run `pnpm install` again after any merge from `main` before resuming work.

- [ ] **Step 3: Establish execution-time quality peers**

Use the `test-hygiene` skill for a peer review before modifying test helpers or fixtures. Use the `debugging-discipline` skill whenever a red test fails for a reason other than the named missing symbol/behavior, and retain the investigation ledger for Task 18. These are execution requirements, not optional final polish.

- [ ] **Step 4: Enforce subprocess hygiene**

Use one-shot commands only; never start watch mode, a development server, or a WSL shell. Await each pnpm/Nx/Vitest/Playwright process tree before starting the next memory-heavy command. Do not kill all Node processes and do not run `wsl --shutdown` while any command is active.

### Task 1: Add one Draft 2020-12 validator for browser and server

**Prerequisites:** Task 0.

**Files:**
- Create: `packages/ai/src/activities/chat/tools/json-schema-validator.ts`
- Modify: `packages/ai/src/index.ts:43-52`
- Modify: `packages/ai/src/client.ts:229-234,300-301`
- Modify: `packages/ai/package.json:82-94`
- Modify: `pnpm-lock.yaml`
- Test: `packages/ai/tests/interrupts.test.ts`

- [ ] **Step 1: Write focused failing validator tests**

Append these tests; they prove Ajv issue order, local references, repeated object reuse, cycle rejection, canonical JSON input, format handling, mutation safety, and RFC 6901 paths:

```ts
import {
  JsonSchemaCompilationError,
  compileJsonSchema202012,
} from '../src/activities/chat/tools/json-schema-validator'

it('normalizes every Draft 2020-12 issue without mutating input', () => {
  const validate = compileJsonSchema202012({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      'a/b': { type: 'string', minLength: 3 },
      email: { type: 'string', format: 'email' },
    },
    required: ['a/b', 'email'],
    additionalProperties: false,
  })
  const input = { 'a/b': 'x', email: 'bad', extra: true }

  expect(validate(input)).toEqual([
    expect.objectContaining({ keyword: 'additionalProperties', path: ['extra'] }),
    expect.objectContaining({ path: ['a/b'] }),
    expect.objectContaining({ path: ['email'] }),
  ])
  expect(input).toEqual({ 'a/b': 'x', email: 'bad', extra: true })
})

it('accepts #, local $defs, and repeated acyclic object identities', () => {
  const sharedProperty = { type: 'string', minLength: 2 } as const
  const sharedObject = {
    type: 'object',
    properties: { label: sharedProperty },
    required: ['label'],
    additionalProperties: false,
  } as const
  const root = {
    type: 'object',
    $defs: { entry: sharedObject },
    properties: {
      selfCopy: { $ref: '#' },
      first: { $ref: '#/$defs/entry' },
      second: sharedObject,
      third: sharedObject,
    },
    additionalProperties: false,
  } as const
  const validate = compileJsonSchema202012(root)

  expect(validate({
    first: { label: 'ok' },
    second: { label: 'yes' },
    third: { label: 'no' },
  })).toEqual([])
})

it('rejects unresolved local references, true cycles, Date, and Map', () => {
  expect(() => compileJsonSchema202012({ $ref: '#/$defs/missing' })).toThrow(
    JsonSchemaCompilationError,
  )

  const cyclic: Record<string, unknown> = { type: 'object' }
  cyclic['properties'] = { self: cyclic }
  expect(() => compileJsonSchema202012(cyclic)).toThrow(/cycles/)
  expect(() => compileJsonSchema202012(new Date())).toThrow(/plain JSON/)
  expect(() => compileJsonSchema202012(new Map())).toThrow(/plain JSON/)
})

it('accepts canonical JSON primitives and rejects non-JSON values', () => {
  const validate = compileJsonSchema202012({
    type: 'array',
    items: { type: ['string', 'number', 'boolean', 'null'] },
  })
  expect(validate(['text', 1, true, null])).toEqual([])
  expect(() => compileJsonSchema202012({ const: undefined })).toThrow(
    /JSON-compatible/,
  )
})

it('rejects other dialects, remote references, and unknown formats', () => {
  expect(() =>
    compileJsonSchema202012({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'string',
    }),
  ).toThrow(JsonSchemaCompilationError)
  expect(() =>
    compileJsonSchema202012({ $ref: 'https://example.com/schema.json' }),
  ).toThrow(/document-local/)
  expect(() =>
    compileJsonSchema202012({ type: 'string', format: 'private-id' }),
  ).toThrow(JsonSchemaCompilationError)
})
```

- [ ] **Step 2: Run the red test**

Run:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai test:lib -- --run tests/interrupts.test.ts
```

Expected: FAIL because `json-schema-validator.ts` and `compileJsonSchema202012` do not exist.

- [ ] **Step 3: Add dependencies and the minimal shared compiler**

Add runtime dependencies `"ajv": "^8.20.0"` and `"ajv-formats": "^3.0.1"`, run `pnpm install`, and implement this public shape:

```ts
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import type { ErrorObject } from 'ajv'
import type { JSONSchema } from '../../../types'

export interface JsonSchemaValidationIssue {
  keyword: string
  message: string
  path: readonly (string | number)[]
}

export class JsonSchemaCompilationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'JsonSchemaCompilationError'
  }
}

function decodePointer(pointer: string): Array<string> {
  if (pointer === '') return []
  return pointer
    .slice(1)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
}

function issuePath(error: ErrorObject): Array<string> {
  const path = decodePointer(error.instancePath)
  if (error.keyword === 'required') {
    path.push(String(error.params['missingProperty']))
  }
  if (error.keyword === 'additionalProperties') {
    path.push(String(error.params['additionalProperty']))
  }
  return path
}

const draft202012 = 'https://json-schema.org/draft/2020-12/schema'

function assertSupportedSchemaTree(schema: unknown): asserts schema is JSONSchema {
  const active = new WeakSet<object>()
  const visit = (value: unknown): void => {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      return
    }
    if (typeof value !== 'object') {
      throw new JsonSchemaCompilationError('Schema values must be JSON-compatible.')
    }
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    ) {
      throw new JsonSchemaCompilationError('Schema nodes must be plain JSON objects.')
    }
    if (active.has(value)) {
      throw new JsonSchemaCompilationError('Schema values must not contain cycles.')
    }
    active.add(value)
    if (Array.isArray(value)) {
      value.forEach(visit)
      active.delete(value)
      return
    }
    const record = value as Record<string, unknown>
    if (
      typeof record['$schema'] === 'string' &&
      record['$schema'] !== draft202012
    ) {
      throw new JsonSchemaCompilationError('Only Draft 2020-12 is supported.')
    }
    if (
      typeof record['$ref'] === 'string' &&
      !record['$ref'].startsWith('#')
    ) {
      throw new JsonSchemaCompilationError('Only document-local $ref values are supported.')
    }
    Object.values(record).forEach(visit)
    active.delete(value)
  }
  visit(schema)
}

export function compileJsonSchema202012(
  schema: unknown,
): (value: unknown) => readonly JsonSchemaValidationIssue[] {
  assertSupportedSchemaTree(schema)
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    validateFormats: true,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
  })
  addFormats(ajv, { mode: 'full' })
  let validate
  try {
    validate = ajv.compile(schema)
  } catch (cause) {
    throw new JsonSchemaCompilationError('Invalid Draft 2020-12 schema.', {
      cause,
    })
  }
  return (value) => {
    if (validate(value)) return []
    return (validate.errors ?? []).map((error) => ({
      keyword: error.keyword,
      message: error.message ?? 'Schema validation failed.',
      path: issuePath(error),
    }))
  }
}
```

The active recursion set is removed on unwind, so repeated acyclic object identities are legal while true cycles fail. Ajv owns local-reference resolution and issue evaluation order; do not sort `validate.errors`. Export the compiler and issue/error types from both core barrels; do not alter the provider-facing draft-07 conversion in `schema-converter.ts`.

- [ ] **Step 4: Run the green test and type check**

Run:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai test:lib -- --run tests/interrupts.test.ts
pnpm --filter @tanstack/ai test:types
```

Expected: both commands PASS; the test reports all three normalized paths in deterministic Ajv order.

- [ ] **Step 5: Refactor without changing behavior**

Extract pointer decoding and recursive `$ref` traversal into private pure functions, keep one Ajv option object, rerun both commands, and confirm no validator path mutates input or performs network/file resolution.

### Task 2: Make `approvalSchema` conditional, branch-aware, and generic-preserving

**Prerequisites:** Task 1.

**Files:**
- Create: `packages/ai/src/activities/chat/tools/approval-schema.ts`
- Create: `packages/ai/src/interrupt-serialization.ts`
- Modify: `packages/ai/src/activities/chat/tools/tool-definition.ts:12-227`
- Modify: `packages/ai/src/types.ts:133-153,601-735`
- Modify: `packages/ai/src/index.ts:43-52`
- Modify: `packages/ai/src/client.ts:229-234,300-301`
- Modify: `packages/ai/package.json:82-94`
- Modify: `pnpm-lock.yaml`
- Create: `packages/ai/tests/interrupts-types.test-d.ts`
- Modify: `packages/ai/tests/interrupts.test.ts`

- [ ] **Step 1: Write failing compile-time and runtime cases**

Create type tests covering shared/branch schemas, omitted branches, input/output inference, and both transformations:

```ts
import { expectTypeOf } from 'vitest'
import { z } from 'zod'
import {
  toolDefinition,
  type ApprovalCapabilityOf,
  type ApprovalSchemaOf,
  type InferToolInput,
  type InferToolOutput,
  type InputSchemaOf,
  type NoSchema,
} from '../src'

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
expectTypeOf<InferToolOutput<ReturnType<typeof transfer.client>>>().toEqualTypeOf<{
  receipt: string
}>()
expectTypeOf<ApprovalCapabilityOf<ReturnType<typeof transfer.server>>>().toEqualTypeOf<true>()
expectTypeOf<ApprovalSchemaOf<ReturnType<typeof transfer.client>>>().toEqualTypeOf<typeof transfer.approvalSchema>()

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
expectTypeOf<InputSchemaOf<typeof noInputDefinition>>().toEqualTypeOf<NoSchema>()
expectTypeOf<InputSchemaOf<typeof noInputClient>>().toEqualTypeOf<NoSchema>()
expectTypeOf<InputSchemaOf<typeof noInputServer>>().toEqualTypeOf<NoSchema>()
```

Add runtime assertions:

```ts
it('builds branch-aware approval envelopes and rejects malformed maps', () => {
  const normalized = normalizeApprovalSchema({
    approve: { type: 'object', required: ['note'] },
  })
  expect(normalized.responseSchema).toMatchObject({ oneOf: expect.any(Array) })
  expect(normalized.branches.reject).toBeNull()
  expect(() => normalizeApprovalSchema({})).toThrow(/approve or reject/)
  expect(() =>
    normalizeApprovalSchema({ approve: { unsupported: Symbol('bad') } }),
  ).toThrow(/SchemaInput/)
})
```

- [ ] **Step 2: Run the red targets**

Run:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai test:types
pnpm --filter @tanstack/ai test:lib -- --run tests/interrupts.test.ts
```

Expected: type check FAILS because `approvalSchema`, `ApprovalCapabilityOf`, and `ApprovalSchemaOf` are missing; runtime test FAILS because `normalizeApprovalSchema` is missing.

- [ ] **Step 3: Add the type marker and discriminated config**

Replace the config interface with a discriminated intersection and add an approval generic to definition/client/server forms:

```ts
export declare const toolApprovalCapability: unique symbol

export interface ToolApprovalCapabilityMarker<
  TNeedsApproval extends boolean,
  TApprovalSchema,
> {
  readonly [toolApprovalCapability]: {
    needsApproval: TNeedsApproval
    approvalSchema: TApprovalSchema
  }
}

export type ApprovalSchemaConfig =
  | SchemaInput
  | { approve: SchemaInput; reject?: SchemaInput }
  | { approve?: SchemaInput; reject: SchemaInput }

type ApprovalConfig<
  TNeedsApproval extends boolean,
  TApprovalSchema extends ApprovalSchemaConfig | undefined,
> = TNeedsApproval extends true
  ? { needsApproval: true; approvalSchema?: TApprovalSchema }
  : { needsApproval?: false; approvalSchema?: never }

export type ToolDefinitionConfig<
  TInput extends SchemaInput | undefined = undefined,
  TOutput extends SchemaInput | undefined = undefined,
  TName extends string = string,
  TNeedsApproval extends boolean = false,
  TApprovalSchema extends ApprovalSchemaConfig | undefined = undefined,
> = {
  name: TName
  description: string
  inputSchema?: TInput
  outputSchema?: TOutput
  lazy?: boolean
  metadata?: Record<string, unknown>
} & ApprovalConfig<TNeedsApproval, TApprovalSchema>

export type ApprovalCapabilityOf<TTool> =
  TTool extends ToolApprovalCapabilityMarker<infer TNeeds, unknown>
    ? TNeeds
    : false

export type ApprovalSchemaOf<TTool> =
  TTool extends ToolApprovalCapabilityMarker<boolean, infer TSchema>
    ? TSchema
    : undefined

export declare const noSchema: unique symbol
export type NoSchema = typeof noSchema

export type InputSchemaOf<TTool> =
  TTool extends { inputSchema: infer TInput }
    ? TInput extends undefined ? NoSchema : TInput
    : NoSchema

export type OutputSchemaOf<TTool> =
  TTool extends { outputSchema: infer TOutput }
    ? TOutput extends undefined ? NoSchema : TOutput
    : NoSchema
```

Apply `TInput extends SchemaInput | undefined = undefined` and `TOutput extends SchemaInput | undefined = undefined` verbatim to `ToolDefinitionConfig`, `ToolDefinition`, `ToolDefinitionInstance`, `ClientTool`, `ServerTool`, `toolDefinition()`, `.client()`, and `.server()`. Every returned intersection carries the exact `TInput`, `TOutput`, `TNeedsApproval`, and `TApprovalSchema` parameters. The runtime `inputSchema` and `outputSchema` fields remain `undefined` when omitted, while `InputSchemaOf`/`OutputSchemaOf` map only that literal absence to `NoSchema`. `InferToolInput` and `InferToolOutput` return `unknown` for a present raw JSON Schema but never widen an omitted schema into a present schema. The compile failures above prove `editedArgs` cannot appear for an omitted input schema before any client-manager work begins.

- [ ] **Step 4: Normalize schemas once and generate the wire envelope**

Implement `normalizeApprovalSchema` with this returned contract:

```ts
export interface NormalizedApprovalSchema {
  branches: {
    approve: NormalizedSchemaInput | null
    reject: NormalizedSchemaInput | null
  }
  responseSchema: JSONSchema
  responseSchemaHash: string
  approvalSchemaHash: string
}

export function normalizeApprovalSchema(
  approvalSchema: ApprovalSchemaConfig | undefined,
  inputSchema?: SchemaInput,
): NormalizedApprovalSchema
```

Add `@noble/hashes` as a runtime dependency and implement `interrupt-serialization.ts` in core. This is the only canonicalization, digest, clone, and deep-freeze implementation used later by persistence and the client:

```ts
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

function canonical(value: unknown, active: WeakSet<object>): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return JSON.stringify(value)
  }
  if (typeof value !== 'object') {
    throw new TypeError('Interrupt values must be JSON-compatible.')
  }
  if (active.has(value)) throw new TypeError('Interrupt values must not cycle.')
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new TypeError('Interrupt values must use plain JSON objects.')
  }

  active.add(value)
  let encoded: string
  if (Array.isArray(value)) {
    encoded = `[${value.map((item) => canonical(item, active)).join(',')}]`
  } else {
    const record = value as Record<string, unknown>
    encoded = `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key], active)}`)
      .join(',')}}`
  }
  active.delete(value)
  return encoded
}

export function canonicalInterruptJson(value: unknown): string {
  return canonical(value, new WeakSet<object>())
}

export function digestInterruptJson(canonicalJson: string): string {
  return `sha256:${bytesToHex(sha256(utf8ToBytes(canonicalJson)))}`
}

function freezeTree(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return
  Object.values(value).forEach(freezeTree)
  Object.freeze(value)
}

export function cloneAndDeepFreezeJson<T>(value: T): T {
  const clone: T = JSON.parse(canonicalInterruptJson(value))
  freezeTree(clone)
  return clone
}
```

Implement the approval normalizer with no undefined helper. `schemaToWire` checks Standard Schema first, retains its validator, uses its Standard JSON Schema export when present, and otherwise uses `{}` only for the nested wire payload while keeping the validator. Raw JSON Schema is recognized before a branch map by the keyword set:

```ts
const jsonSchemaKeywords = new Set([
  '$schema', '$id', '$ref', '$defs', 'type', 'properties', 'required',
  'additionalProperties', 'items', 'oneOf', 'anyOf', 'allOf', 'enum', 'const',
  'format', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern',
])

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isRawJsonSchema(value: unknown): value is JSONSchema {
  return isPlainRecord(value) &&
    Object.keys(value).some((key) => jsonSchemaKeywords.has(key))
}

function isApprovalBranchMap(
  value: unknown,
): value is { approve?: SchemaInput; reject?: SchemaInput } {
  if (!isPlainRecord(value)) return false
  const keys = Object.keys(value)
  return (
    keys.length > 0 &&
    keys.every((key) => key === 'approve' || key === 'reject') &&
    keys.every((key) => isSchemaInput(value[key]))
  )
}

function schemaToWire(schema: SchemaInput): NormalizedSchemaInput {
  if (isStandardSchema(schema)) {
    const jsonSchema = isStandardJSONSchema(schema)
      ? schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' })
      : undefined
    return { source: schema, validator: schema, jsonSchema }
  }
  if (isRawJsonSchema(schema)) {
    compileJsonSchema202012(schema)
    return { source: schema, jsonSchema: schema }
  }
  throw new TypeError('Expected a supported SchemaInput.')
}

function decisionEnvelope(input: {
  approved: boolean
  payload: NormalizedSchemaInput | null
  inputSchema: NormalizedSchemaInput | null
}): JSONSchema {
  const properties: Record<string, JSONSchema> = {
    approved: { const: input.approved },
  }
  const required = ['approved']
  if (input.approved && input.inputSchema) {
    properties['editedArgs'] = input.inputSchema.jsonSchema ?? {}
  }
  if (input.payload) {
    properties['payload'] = input.payload.jsonSchema ?? {}
    required.push('payload')
  }
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  }
}

export function normalizeApprovalSchema(
  approvalSchema: ApprovalSchemaConfig | undefined,
  inputSchema?: SchemaInput,
): NormalizedApprovalSchema {
  const normalizedInput = inputSchema ? schemaToWire(inputSchema) : null
  let approve: NormalizedSchemaInput | null = null
  let reject: NormalizedSchemaInput | null = null
  if (approvalSchema !== undefined) {
    if (isStandardSchema(approvalSchema) || isRawJsonSchema(approvalSchema)) {
      approve = schemaToWire(approvalSchema)
      reject = approve
    } else if (isApprovalBranchMap(approvalSchema)) {
      approve = approvalSchema.approve
        ? schemaToWire(approvalSchema.approve)
        : null
      reject = approvalSchema.reject
        ? schemaToWire(approvalSchema.reject)
        : null
    } else {
      throw new TypeError('approvalSchema must be a SchemaInput or nonempty approve/reject map.')
    }
  }
  const responseSchema: JSONSchema = {
    oneOf: [
      decisionEnvelope({ approved: true, payload: approve, inputSchema: normalizedInput }),
      decisionEnvelope({ approved: false, payload: reject, inputSchema: null }),
    ],
  }
  const responseCanonical = canonicalInterruptJson(responseSchema)
  const approvalCanonical = canonicalInterruptJson({
    approve: approve?.jsonSchema ?? null,
    reject: reject?.jsonSchema ?? null,
  })
  return {
    branches: { approve, reject },
    responseSchema,
    responseSchemaHash: digestInterruptJson(responseCanonical),
    approvalSchemaHash: digestInterruptJson(approvalCanonical),
  }
}

export function hashSchemaInput(schema: SchemaInput | undefined): string {
  if (schema === undefined) return digestInterruptJson('undefined')
  const normalized = schemaToWire(schema)
  const identity = normalized.jsonSchema ?? { standardValidator: 'unserialized' }
  return digestInterruptJson(canonicalInterruptJson(identity))
}
```

Add the imported `isSchemaInput` guard to `schema-converter.ts` using the same Standard-first/raw-keyword checks, export it, and use it above. Add `NormalizedSchemaInput` with `source`, optional `validator`, and optional `jsonSchema`. Add runtime tests for every shared/branch/omitted form, malformed empty/unknown-key maps, Standard Schema with and without JSON export, raw schema compilation, response/approval hash stability, and rejection of function/Symbol/cyclic values. Never derive identity from function source text.

- [ ] **Step 5: Run green type/runtime checks**

Run:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai test:types
pnpm --filter @tanstack/ai test:lib -- --run tests/interrupts.test.ts
```

Expected: both PASS; `.client()` and `.server()` preserve `true`, input/output, and approval-schema generics; malformed branch objects throw synchronously.

- [ ] **Step 6: Focused refactor and recheck**

Make the type-level `ApproveSchema`/`RejectSchema` selectors read the same normalized forms used at runtime, name conditional helpers so diagnostics remain legible, and rerun both commands. Confirm no provider schema-converter code changed.

### Task 3: Define core wire DTOs, recovery DTO, and persistence capability

**Prerequisites:** Task 2.

**Files:**
- Create: `packages/ai/src/interrupts.ts`
- Modify: `packages/ai/src/types.ts:1081-1124,1371-1400,1480-1550`
- Modify: `packages/ai/src/activities/chat/middleware/types.ts:88-115,208-235`
- Modify: `packages/ai/src/index.ts:111-172`
- Modify: `packages/ai/src/client.ts:229-234,300-301`
- Modify: `packages/ai/tests/interrupts.test.ts`
- Modify: `packages/ai/tests/interrupts-types.test-d.ts`

- [ ] **Step 1: Write failing DTO and capability tests**

Add compile/runtime assertions for item/root errors, recovery correlation, generic continuation, and the core-owned capability:

```ts
import {
  InterruptPersistenceCapability,
  canonicalizeInterruptResolutions,
  type InterruptRecoveryStateV1,
  type InterruptSubmissionError,
} from '../src/interrupts'

it('correlates interrupt errors and recovery to the interrupted run', () => {
  const recovery = {
    schemaVersion: 1,
    state: 'committed',
    threadId: 'thread-1',
    interruptedRunId: 'run-old',
    generation: 2,
    pendingInterrupts: [],
    committed: {
      fingerprint: 'v1:abc',
      resolutions: [],
      continuationRunId: 'run-new',
      committedAt: '2026-07-13T10:00:00.000Z',
    },
  } satisfies InterruptRecoveryStateV1
  const error: InterruptSubmissionError = {
    scope: 'batch',
    code: 'conflict',
    message: 'Another response batch won.',
    source: 'server',
    retryable: false,
    interruptIds: ['interrupt-1'],
    threadId: 'thread-1',
    interruptedRunId: 'run-old',
    generation: 2,
  }

  expect(recovery.committed.continuationRunId).toBe('run-new')
  expect(error.interruptedRunId).toBe('run-old')
  expect(InterruptPersistenceCapability.capabilityName).toBe(
    'interrupt-persistence',
  )
})

it('canonicalizes and deeply freezes response batches in core', () => {
  const left = canonicalizeInterruptResolutions([
    { interruptId: 'b', status: 'cancelled' },
    { interruptId: 'a', status: 'resolved', payload: { z: 1, a: 2 } },
  ])
  const right = canonicalizeInterruptResolutions([
    { interruptId: 'a', status: 'resolved', payload: { a: 2, z: 1 } },
    { interruptId: 'b', status: 'cancelled' },
  ])
  expect(left.canonicalResolutions).toBe(right.canonicalResolutions)
  expect(left.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/)
  expect(left.fingerprint).toBe(right.fingerprint)
  expect(Object.isFrozen(left.resolutions)).toBe(true)
  expect(Object.isFrozen(left.resolutions[0])).toBe(true)
})
```

- [ ] **Step 2: Run the red targets**

Run:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai test:lib -- --run tests/interrupts.test.ts
pnpm --filter @tanstack/ai test:types
```

Expected: FAIL because `interrupts.ts`, `InterruptRecoveryStateV1`, and `InterruptPersistenceCapability` do not exist.

- [ ] **Step 3: Implement the core-owned seam and public DTOs**

Define the complete error code unions from the approved spec, `InterruptCorrelation`, item/root errors, and recovery DTO. The atomic gateway contract must include opening descriptors atomically as well as committing responses:

```ts
export interface OpenInterruptBatchInput {
  threadId: string
  interruptedRunId: string
  descriptors: readonly Interrupt[]
  bindings: readonly UnopenedInterruptBinding[]
}

export interface CommitInterruptResolutionsInput {
  threadId: string
  interruptedRunId: string
  continuationRunId: string
  expectedGeneration: number
  expectedInterruptIds: readonly string[]
  resolutions: readonly RunAgentResumeItem[]
  fingerprint: string
  canonicalResolutions: string
}

export interface InterruptCorrelation {
  threadId: string
  interruptedRunId: string
  generation: number
  submissionId?: string
  continuationRunId?: string
}

export type ItemInterruptErrorCode =
  | 'invalid-payload'
  | 'invalid-edited-args'
  | 'invalid-tool-output'
  | 'invalid-response-schema'
  | 'unknown-interrupt'
  | 'expired'
  | 'stale'
  | 'conflict'
  | 'legacy-unsupported'

export type BatchInterruptErrorCode =
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

export interface ItemInterruptError extends InterruptCorrelation {
  scope: 'item'
  interruptId: string
  code: ItemInterruptErrorCode
  message: string
  path?: readonly (string | number)[]
  source: 'client' | 'server'
  retryable: boolean
}

export interface BatchInterruptError extends InterruptCorrelation {
  scope: 'batch'
  code: BatchInterruptErrorCode
  message: string
  source: 'client' | 'server' | 'transport'
  retryable: boolean
  interruptIds: readonly string[]
}

export type InterruptSubmissionError = ItemInterruptError | BatchInterruptError

export type InterruptBinding =
  | {
      kind: 'tool-approval'
      interruptId: string
      interruptedRunId: string
      generation: number
      toolName: string
      toolCallId: string
      originalArgs: unknown
      inputSchemaHash: string
      approvalSchemaHash: string
      responseSchemaHash: string
      expiresAt?: string
    }
  | {
      kind: 'client-tool-execution'
      interruptId: string
      interruptedRunId: string
      generation: number
      toolName: string
      toolCallId: string
      outputSchemaHash: string
      responseSchemaHash: string
      expiresAt?: string
    }
  | {
      kind: 'generic'
      interruptId: string
      interruptedRunId: string
      generation: number
      responseSchemaHash: string
      expiresAt?: string
    }

export type UnopenedInterruptBinding = InterruptBinding extends infer TBinding
  ? TBinding extends InterruptBinding
    ? Omit<TBinding, 'interruptedRunId' | 'generation'>
    : never
  : never

export type InterruptCommitResult =
  | { status: 'committed'; continuationRunId: string }
  | { status: 'replayed'; continuationRunId: string }
  | { status: 'conflict'; authoritativeState: InterruptRecoveryStateV1 }

export interface InterruptRecoveryQuery {
  threadId: string
  interruptedRunId: string
  knownGeneration: number
}

export interface InterruptRecoveryStateV1 extends InterruptCorrelation {
  schemaVersion: 1
  state: 'pending' | 'committed' | 'expired' | 'missing' | 'legacy-committed'
  pendingInterrupts: readonly Interrupt[]
  committed?: {
    fingerprint: string
    resolutions?: readonly RunAgentResumeItem[]
    continuationRunId?: string
    committedAt: string
  }
}

export interface InterruptPersistenceGateway {
  openInterruptBatch(
    input: OpenInterruptBatchInput,
  ): Promise<{ generation: number; descriptors: readonly Interrupt[] }>
  commitInterruptResolutions(
    input: CommitInterruptResolutionsInput,
  ): Promise<InterruptCommitResult>
  getInterruptRecoveryState(
    input: InterruptRecoveryQuery,
  ): Promise<InterruptRecoveryStateV1>
}

export const InterruptPersistenceCapability =
  createCapability<InterruptPersistenceGateway>()('interrupt-persistence')

export const [getInterruptPersistence, provideInterruptPersistence] =
  InterruptPersistenceCapability
```

Add this core-owned response canonicalizer; persistence stores compare both the SHA-256 digest and canonical bytes on replay:

```ts
export function canonicalizeInterruptResolutions(
  resolutions: readonly RunAgentResumeItem[],
): {
  resolutions: readonly RunAgentResumeItem[]
  canonicalResolutions: string
  fingerprint: string
} {
  const sorted = [...resolutions].sort((left, right) =>
    left.interruptId.localeCompare(right.interruptId),
  )
  const frozen = cloneAndDeepFreezeJson(sorted)
  const canonicalResolutions = canonicalInterruptJson(frozen)
  return Object.freeze({
    resolutions: frozen,
    canonicalResolutions,
    fingerprint: digestInterruptJson(canonicalResolutions),
  })
}
```

Extend `RunErrorEvent` with optional top-level fields:

```ts
export interface RunErrorEvent extends AGUIRunErrorEvent {
  model?: string
  'tanstack:interruptErrors'?: readonly InterruptSubmissionError[]
  'tanstack:interruptRecovery'?: InterruptRecoveryStateV1
  error?: { message: string; code?: string | undefined } | undefined
}
```

Extend middleware context/config state without importing persistence:

```ts
export interface ChatMiddlewareContext<TContext = unknown> {
  runId: string
  parentRunId?: string
  threadId: string
}

export type ChatResumeGenericResolution =
  | { interruptId: string; status: 'resolved'; payload: unknown }
  | { interruptId: string; status: 'cancelled'; payload?: never }

export interface ChatResumeToolState {
  approvals?: ReadonlyMap<string, ToolApprovalResolution>
  clientToolResults?: ReadonlyMap<string, unknown>
  genericInterrupts?: ReadonlyMap<string, ChatResumeGenericResolution>
  deniedToolResults?: ReadonlyMap<string, unknown>
  cancelledToolCallIds?: ReadonlySet<string>
}
```

Add `parentRunId` when `TextEngine` constructs `middlewareCtx`. Deprecate `ApprovalRequestedEvent` and `ToolInputAvailableEvent` with removal-at-1.0 JSDoc, but keep them in `KnownCustomEvent` for compatibility. Export every new public DTO/capability from root and client barrels.

- [ ] **Step 4: Run green tests**

Run:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai test:lib -- --run tests/interrupts.test.ts
pnpm --filter @tanstack/ai test:types
```

Expected: both PASS; no dependency from `packages/ai` to any persistence package appears.

- [ ] **Step 5: Refactor and verify the seam**

Group wire-only types separately from capability methods in `interrupts.ts`, keep `parentRunId` optional for non-resume requests, and rerun the focused commands. Run `pnpm --filter @tanstack/ai test:lib -- --run tests/custom-events-integration.test.ts` and expect PASS to prove deprecated types remain readable.

### Task 4: Replace sequential persistence with the atomic reference contract

**Prerequisites:** Task 3.

**Files:**
- Modify: `packages/ai-persistence/src/types.ts:36-55,139,255-287`
- Modify: `packages/ai-persistence/src/interrupts.ts`
- Modify: `packages/ai-persistence/src/capabilities.ts`
- Modify: `packages/ai-persistence/src/memory.ts:65-126,355`
- Modify: `packages/ai-persistence/src/testkit/conformance.ts:114-184`
- Modify: `packages/ai-persistence/src/index.ts`
- Modify: `packages/ai-persistence/tests/interrupts.test.ts`
- Modify: `packages/ai-persistence/tests/memory.conformance.test.ts`
- Modify: `packages/ai-persistence/tests/with-persistence.test.ts`
- Modify: `packages/ai-persistence/tests/persistence-validation.test.ts`
- Modify: `packages/ai-persistence/tests/persistence-types.test-d.ts`

- [ ] **Step 1: Rewrite the shared conformance tests to fail on sequential stores**

Replace the interrupt conformance block with complete-batch cases. Use stable IDs per test so adapters can run the same suite:

```ts
it('commits all responses, replays exactly, and rejects a different writer', async () => {
  const store = persistence.stores.interrupts
  expect(store, 'interrupt conformance requires stores.interrupts').toBeDefined()
  if (!store) throw new Error('interrupt store missing')
  const opened = await store.openInterruptBatch({
    threadId: 'thread-cas',
    interruptedRunId: 'run-interrupted',
    descriptors: [
      { id: 'int-a', reason: 'confirmation' },
      { id: 'int-b', reason: 'input_required' },
    ],
    bindings: [
      { interruptId: 'int-a', kind: 'generic', responseSchemaHash: 'v1:a' },
      { interruptId: 'int-b', kind: 'generic', responseSchemaHash: 'v1:b' },
    ],
  })
  const resolutions = [
    { interruptId: 'int-b', status: 'cancelled' },
    { interruptId: 'int-a', status: 'resolved', payload: { ok: true } },
  ] as const
  const canonical = canonicalizeInterruptResolutions(resolutions)
  const input = {
    threadId: 'thread-cas',
    interruptedRunId: 'run-interrupted',
    continuationRunId: 'run-continuation-a',
    expectedGeneration: opened.generation,
    expectedInterruptIds: ['int-b', 'int-a'],
    resolutions: canonical.resolutions,
    fingerprint: canonical.fingerprint,
    canonicalResolutions: canonical.canonicalResolutions,
  }

  await expect(store.commitInterruptResolutions(input)).resolves.toEqual({
    status: 'committed',
    continuationRunId: 'run-continuation-a',
  })
  await expect(
    store.commitInterruptResolutions({
      ...input,
      continuationRunId: 'ignored-on-replay',
    }),
  ).resolves.toEqual({
    status: 'replayed',
    continuationRunId: 'run-continuation-a',
  })
  await expect(
    store.commitInterruptResolutions({
      ...input,
      continuationRunId: 'run-continuation-b',
      resolutions: [
        { interruptId: 'int-a', status: 'cancelled' },
        { interruptId: 'int-b', status: 'cancelled' },
      ],
      fingerprint: canonicalizeInterruptResolutions([
        { interruptId: 'int-a', status: 'cancelled' },
        { interruptId: 'int-b', status: 'cancelled' },
      ]).fingerprint,
      canonicalResolutions: canonicalizeInterruptResolutions([
        { interruptId: 'int-a', status: 'cancelled' },
        { interruptId: 'int-b', status: 'cancelled' },
      ]).canonicalResolutions,
    }),
  ).resolves.toMatchObject({ status: 'conflict' })
})
```

Define the testkit contract and fixtures in `src/testkit/conformance.ts`; the store is required and no case may return early:

```ts
export interface InterruptConformanceHarness {
  getStore(): InterruptStore | undefined
  advanceBy(milliseconds: number): void
  inspect(interruptedRunId: string): Promise<{
    statuses: readonly string[]
    batchCount: number
  }>
  failTransitionOnce(interruptId: string): void
  reopen?(): Promise<InterruptStore>
}

export async function openTwoInterrupts(store: InterruptStore) {
  return store.openInterruptBatch({
    threadId: 'thread-cas',
    interruptedRunId: 'run-interrupted',
    descriptors: [
      { id: 'int-a', reason: 'confirmation' },
      {
        id: 'int-b',
        reason: 'input_required',
        expiresAt: '2026-07-13T10:01:00.000Z',
      },
    ],
    bindings: [
      { interruptId: 'int-a', kind: 'generic', responseSchemaHash: 'sha256:a' },
      {
        interruptId: 'int-b',
        kind: 'generic',
        responseSchemaHash: 'sha256:b',
        expiresAt: '2026-07-13T10:01:00.000Z',
      },
    ],
  })
}

export function validTwoItemCommit(
  generation: number,
  continuationRunId = 'run-continuation-a',
): CommitInterruptResolutionsInput {
  const candidate = canonicalizeInterruptResolutions([
    { interruptId: 'int-b', status: 'cancelled' },
    { interruptId: 'int-a', status: 'resolved', payload: { ok: true } },
  ])
  return {
    threadId: 'thread-cas',
    interruptedRunId: 'run-interrupted',
    continuationRunId,
    expectedGeneration: generation,
    expectedInterruptIds: ['int-b', 'int-a'],
    resolutions: candidate.resolutions,
    fingerprint: candidate.fingerprint,
    canonicalResolutions: candidate.canonicalResolutions,
  }
}

export function runInterruptStoreConformance(
  createHarness: () => Promise<InterruptConformanceHarness>,
): void {
  it('requires the atomic interrupt capability', async () => {
    const harness = await createHarness()
    expect(
      harness.getStore(),
      'interrupt conformance requires stores.interrupts',
    ).toBeDefined()
    if (!harness.getStore()) throw new Error('interrupt store missing')
  })

  it('keeps canonical order stable and rejects malformed exact sets', async () => {
    const harness = await createHarness()
    const store = harness.getStore()
    if (!store) throw new Error('interrupt store missing')
    const opened = await openTwoInterrupts(store)
    const ordered = validTwoItemCommit(opened.generation)
    const reordered = canonicalizeInterruptResolutions([
      { interruptId: 'int-a', status: 'resolved', payload: { ok: true } },
      { interruptId: 'int-b', status: 'cancelled' },
    ])
    expect(reordered.fingerprint).toBe(ordered.fingerprint)
    expect(reordered.canonicalResolutions).toBe(ordered.canonicalResolutions)
    for (const expectedInterruptIds of [
      ['int-a'],
      ['int-a', 'int-b', 'int-c'],
      ['int-a', 'int-a'],
    ]) {
      await expect(store.commitInterruptResolutions({
        ...ordered,
        expectedInterruptIds,
      })).resolves.toMatchObject({ status: 'conflict' })
    }
    await expect(store.commitInterruptResolutions({
      ...ordered,
      expectedGeneration: opened.generation + 1,
    })).resolves.toMatchObject({ status: 'conflict' })
  })

  it('rolls back every row when a transition fails', async () => {
    const harness = await createHarness()
    const store = harness.getStore()
    if (!store) throw new Error('interrupt store missing')
    const opened = await openTwoInterrupts(store)
    harness.failTransitionOnce('int-b')
    await expect(
      store.commitInterruptResolutions(validTwoItemCommit(opened.generation)),
    ).rejects.toThrow()
    await expect(harness.inspect('run-interrupted')).resolves.toEqual({
      statuses: ['pending', 'pending'],
      batchCount: 0,
    })
  })

  it('projects pending, committed replay, restart, and one concurrent winner', async () => {
    const harness = await createHarness()
    const store = harness.getStore()
    if (!store) throw new Error('interrupt store missing')
    const opened = await openTwoInterrupts(store)
    await expect(store.getInterruptRecoveryState({
      threadId: 'thread-cas',
      interruptedRunId: 'run-interrupted',
      knownGeneration: opened.generation,
    })).resolves.toMatchObject({
      state: 'pending',
      generation: opened.generation,
    })

    const first = validTwoItemCommit(opened.generation, 'run-continuation-a')
    const secondCandidate = canonicalizeInterruptResolutions([
      { interruptId: 'int-a', status: 'cancelled' },
      { interruptId: 'int-b', status: 'cancelled' },
    ])
    const second = {
      ...first,
      continuationRunId: 'run-continuation-b',
      resolutions: secondCandidate.resolutions,
      fingerprint: secondCandidate.fingerprint,
      canonicalResolutions: secondCandidate.canonicalResolutions,
    }
    const results = await Promise.all([
      store.commitInterruptResolutions(first),
      store.commitInterruptResolutions(second),
    ])
    expect(results.map((result) => result.status).sort()).toEqual([
      'committed',
      'conflict',
    ])
    const winningRunId = results.find(
      (result) => result.status === 'committed',
    )?.continuationRunId
    expect(winningRunId).toBeDefined()
    const replayInput = winningRunId === 'run-continuation-a' ? first : second
    await expect(store.commitInterruptResolutions({
      ...replayInput,
      continuationRunId: 'ignored-replay-run',
    })).resolves.toEqual({
      status: 'replayed',
      continuationRunId: winningRunId,
    })

    const recoveredStore = harness.reopen ? await harness.reopen() : store
    await expect(recoveredStore.getInterruptRecoveryState({
      threadId: 'thread-cas',
      interruptedRunId: 'run-interrupted',
      knownGeneration: opened.generation,
    })).resolves.toMatchObject({
      state: 'committed',
      committed: { continuationRunId: winningRunId },
    })
  })

  it('marks an uncommitted expired batch expired', async () => {
    const harness = await createHarness()
    const store = harness.getStore()
    if (!store) throw new Error('interrupt store missing')
    const opened = await openTwoInterrupts(store)
    harness.advanceBy(60_001)
    await expect(
      store.commitInterruptResolutions(validTwoItemCommit(opened.generation)),
    ).resolves.toMatchObject({
      status: 'conflict',
      authoritativeState: { state: 'expired' },
    })
  })
}
```

Memory omits `reopen` to make process-local loss explicit. Drizzle, Prisma, and Cloudflare supply it and must recover the committed winner. Every harness supplies `failTransitionOnce`; it may wrap the store at the gateway boundary so production adapters do not expose a test-only option. No conformance case returns early.

- [ ] **Step 2: Run the red persistence targets**

Run:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai-persistence test:lib -- --run tests/interrupts.test.ts tests/memory.conformance.test.ts tests/with-persistence.test.ts tests/persistence-validation.test.ts
pnpm --filter @tanstack/ai-persistence test:types
```

Expected: FAIL because `openInterruptBatch`, `commitInterruptResolutions`, recovery, generation, and `fingerprintInterruptResolutions` are missing.

- [ ] **Step 3: Define the store records and capability alias**

Make `InterruptStore` extend the core gateway and retain read methods only; remove sequential `resolve`/`cancel` as a middleware path:

```ts
export interface InterruptRecord {
  interruptId: string
  runId: string
  threadId: string
  generation: number
  status: 'pending' | 'resolved' | 'cancelled'
  requestedAt: number
  resolvedAt?: number
  payload: unknown
  binding: InterruptBinding
  response?: unknown
}

export interface InterruptBatchRecord {
  threadId: string
  interruptedRunId: string
  generation: number
  expectedInterruptIds: readonly string[]
  fingerprint: string
  canonicalResolutions: string
  resolutions: readonly RunAgentResumeItem[]
  continuationRunId: string
  committedAt: number
}

export interface InterruptStore extends InterruptPersistenceGateway {
  get(interruptId: string): Promise<InterruptRecord | null>
  list(threadId: string): Promise<InterruptRecord[]>
  listPending(threadId: string): Promise<InterruptRecord[]>
  listByRun(runId: string): Promise<InterruptRecord[]>
  listPendingByRun(runId: string): Promise<InterruptRecord[]>
}
```

In `capabilities.ts`, stop constructing a second interrupt token. Re-export the core `InterruptPersistenceCapability`, `getInterruptPersistence`, and `provideInterruptPersistence`. Keep `InterruptsCapability`, `getInterrupts`, and `provideInterrupts` as deprecated aliases referencing those exact same values until 1.0.

- [ ] **Step 4: Implement exact-set helpers and consume the core identity**

Delete persistence-owned canonicalization and FNV. Import `canonicalizeInterruptResolutions` and `cloneAndDeepFreezeJson` from `@tanstack/ai`; persistence owns only exact-set checks:

```ts
export class InterruptStoreCorruptionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'InterruptStoreCorruptionError'
  }
}

export function hasExactInterruptIds(
  expected: readonly string[],
  actual: readonly string[],
): boolean {
  const left = [...new Set(expected)].sort()
  const right = [...new Set(actual)].sort()
  return left.length === expected.length &&
    right.length === actual.length &&
    left.length === right.length &&
    left.every((id, index) => id === right[index])
}

export function projectInterruptRecovery(input: {
  query: InterruptRecoveryQuery
  rows: readonly InterruptRecord[]
  batch: InterruptBatchRecord | null
  now: number
  includeResolutions: boolean
}): InterruptRecoveryStateV1 {
  const correlation = {
    schemaVersion: 1 as const,
    threadId: input.query.threadId,
    interruptedRunId: input.query.interruptedRunId,
    generation:
      input.batch?.generation ??
      input.rows[0]?.generation ??
      input.query.knownGeneration,
    pendingInterrupts: [] as readonly Interrupt[],
  }
  if (input.batch) {
    return cloneAndDeepFreezeJson({
      ...correlation,
      state: 'committed',
      committed: {
        fingerprint: input.batch.fingerprint,
        ...(input.includeResolutions && {
          resolutions: input.batch.resolutions,
        }),
        continuationRunId: input.batch.continuationRunId,
        committedAt: new Date(input.batch.committedAt).toISOString(),
      },
    })
  }
  if (input.rows.length === 0) {
    return cloneAndDeepFreezeJson({ ...correlation, state: 'missing' })
  }
  const pending = input.rows.filter((row) => row.status === 'pending')
  if (pending.length > 0) {
    const expired = pending.some(
      (row) =>
        row.binding.expiresAt !== undefined &&
        Date.parse(row.binding.expiresAt) <= input.now,
    )
    return cloneAndDeepFreezeJson({
      ...correlation,
      state: expired ? 'expired' : 'pending',
      pendingInterrupts: expired
        ? []
        : pending.map((row) => row.payload as Interrupt),
    })
  }
  return cloneAndDeepFreezeJson({
    ...correlation,
    state: 'legacy-committed',
  })
}
```

Before any store operation, recompute `canonicalizeInterruptResolutions(input.resolutions)` and require both its digest and canonical bytes to equal `input.fingerprint` and `input.canonicalResolutions`. Replay requires stored digest equality **and** stored canonical-byte equality, so a digest alone never proves identity. Memory and every durable adapter call `projectInterruptRecovery` from inside their run lock/transaction with rows and winner read from that same snapshot; its five branches are exercised by the shared conformance suite and the migrated-legacy tests.

- [ ] **Step 5: Implement the memory critical section and immutable winner**

Use maps keyed by `interruptedRunId` plus a per-key promise chain. `openInterruptBatch` writes every descriptor or none, stamps generation `1` and schema identity into returned descriptors, and returns an existing identical pending batch idempotently. `commitInterruptResolutions` executes inside the same critical section:

```ts
return this.withInterruptLock(input.interruptedRunId, async () => {
  const candidate = canonicalizeInterruptResolutions(input.resolutions)
  if (
    candidate.fingerprint !== input.fingerprint ||
    candidate.canonicalResolutions !== input.canonicalResolutions
  ) {
    throw new TypeError('Interrupt batch identity does not match its resolutions.')
  }
  const winner = this.batches.get(input.interruptedRunId)
  if (winner) {
    return winner.fingerprint === input.fingerprint &&
      winner.canonicalResolutions === input.canonicalResolutions
      ? { status: 'replayed', continuationRunId: winner.continuationRunId }
      : {
          status: 'conflict',
          authoritativeState: this.recoveryFromWinner(winner),
        }
  }
  const pending = this.pendingForRun(input.interruptedRunId)
  if (
    !hasExactInterruptIds(
      input.expectedInterruptIds,
      pending.map((record) => record.interruptId),
    ) ||
    pending.some((record) => record.generation !== input.expectedGeneration) ||
    pending.some((record) =>
      record.binding.expiresAt !== undefined &&
      Date.parse(record.binding.expiresAt) <= this.clock(),
    )
  ) {
    return {
      status: 'conflict',
      authoritativeState: this.recoveryForRun(input),
    }
  }
  const committedAt = this.clock()
  const nextInterrupts = new Map(this.interrupts)
  for (const resolution of candidate.resolutions) {
    const current = nextInterrupts.get(resolution.interruptId)
    if (
      !current ||
      current.runId !== input.interruptedRunId ||
      current.status !== 'pending' ||
      current.generation !== input.expectedGeneration
    ) {
      throw new Error(`Pending interrupt changed: ${resolution.interruptId}`)
    }
    nextInterrupts.set(
      resolution.interruptId,
      cloneAndDeepFreezeJson({
        ...current,
        status: resolution.status === 'cancelled' ? 'cancelled' : 'resolved',
        response: resolution,
        resolvedAt: committedAt,
      }),
    )
  }
  const immutableWinner = cloneAndDeepFreezeJson({
    ...input,
    resolutions: candidate.resolutions,
    canonicalResolutions: candidate.canonicalResolutions,
    fingerprint: candidate.fingerprint,
    committedAt,
  })
  const nextBatches = new Map(this.batches)
  nextBatches.set(input.interruptedRunId, immutableWinner)

  // Publish only after every row and winner has been validated and built.
  this.interrupts = nextInterrupts
  this.batches = nextBatches
  return {
    status: 'committed',
    continuationRunId: input.continuationRunId,
  }
})
```

`openInterruptBatch` runs under the same per-run lock: verify descriptor/binding exact IDs and correlations, build a cloned next interrupt map and frozen descriptor snapshot, and publish the map only after every record is built. `getInterruptRecoveryState` reads one locked snapshot and returns `pending`, `committed`, `expired`, `missing`, or `legacy-committed` without exposing mutable store objects.

- [ ] **Step 6: Reject non-atomic custom stores and export the new helpers**

Update `defineAIPersistence` validation so an interrupt store lacking all three gateway methods throws `atomic-commit-unsupported`; do not adapt `resolve`/`cancel` sequentially. Re-export new types/helpers and update `createInterruptController` to expose `openInterruptBatch`, `commitInterruptResolutions`, `getInterruptRecoveryState`, and pending reads only.

- [ ] **Step 7: Run green persistence checks and refactor**

Run:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai-persistence test:lib -- --run tests/interrupts.test.ts tests/memory.conformance.test.ts tests/with-persistence.test.ts tests/persistence-validation.test.ts
pnpm --filter @tanstack/ai-persistence test:types
```

Expected: PASS; the concurrency test has one winner, replay returns its continuation ID, and fault injection leaves every row pending. Refactor duplicated recovery construction into pure helpers and rerun both commands.

### Task 5: Implement transactional CAS and migrations for Drizzle SQLite

**Prerequisites:** Task 4.

**Files:**
- Modify: `packages/ai-persistence-drizzle/src/schema.ts:65-78,115-125`
- Modify: `packages/ai-persistence-drizzle/src/stores.ts:1-38,196-286`
- Modify: `packages/ai-persistence-drizzle/src/index.ts`
- Modify: `packages/ai-persistence-drizzle/src/sqlite.ts`
- Modify: `packages/ai-persistence-drizzle/src/migrations.ts`
- Create: `packages/ai-persistence-drizzle/drizzle/0001_tanstack_ai_interrupt_batches.sql`
- Create: `packages/ai-persistence-drizzle/drizzle/meta/0001_snapshot.json`
- Modify: `packages/ai-persistence-drizzle/drizzle/meta/_journal.json`
- Create: `packages/ai-persistence-drizzle/src/assets/0001_tanstack_ai_interrupt_batches.sql`
- Modify: `packages/ai-persistence-drizzle/tests/drizzle.conformance.test.ts`
- Modify: `packages/ai-persistence-drizzle/tests/migrations.test.ts`
- Modify: `packages/ai-persistence-drizzle/tests/migration-cli.test.ts`
- Modify: `packages/ai-persistence-drizzle/tests/api-types.test-d.ts`

- [ ] **Step 1: Add failing adapter and nonempty-migration tests**

Extend the shared conformance invocation and assert historical rows migrate deterministically:

```ts
it('backfills pending generation and identifies historical commits', () => {
  const db = new DatabaseSync(':memory:')
  applySqliteMigrations(db, [sqliteMigrations[0]])
  const binding = {
    kind: 'generic',
    interruptId: 'pending',
    interruptedRunId: 'run-p',
    generation: 1,
    responseSchemaHash: 'sha256:pending',
  }
  const descriptor = {
    id: 'pending',
    reason: 'confirmation',
    responseSchema: { type: 'object', required: ['approved'] },
  }
  const insert = db.prepare(`INSERT INTO interrupts (
    interrupt_id, run_id, thread_id, status, requested_at,
    resolved_at, payload_json, response_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  insert.run('pending', 'run-p', 'thread', 'pending', 1, null, JSON.stringify(descriptor), null)
  insert.run('done', 'run-d', 'thread', 'resolved', 1, 2, '{}', '{}')
  applySqliteMigrations(db, [sqliteMigrations[1]])

  expect(db.prepare('SELECT generation FROM interrupts WHERE interrupt_id = ?').get('pending')).toEqual({ generation: 1 })
  expect(db.prepare('SELECT generation FROM interrupts WHERE interrupt_id = ?').get('done')).toEqual({ generation: 0 })
  expect(db.prepare('SELECT COUNT(*) AS count FROM interrupt_batches').get()).toEqual({ count: 0 })
  const migrated = db.prepare(
    'SELECT status, generation, binding_json FROM interrupts WHERE interrupt_id = ?',
  ).get('pending')
  expect(migrated).toMatchObject({ status: 'pending', generation: 1 })
  expect(JSON.parse(String(migrated.binding_json))).toEqual({
    ...binding,
    responseSchemaHash: expect.stringMatching(/^legacy-json:/),
  })
  expect(
    db.prepare(
      'SELECT payload_json FROM interrupts WHERE interrupt_id = ? AND status = ?',
    ).get('pending', 'pending'),
  ).toEqual({ payload_json: JSON.stringify(descriptor) })
})

it('upgrades all legacy pending descriptors atomically', () => {
  const db = new DatabaseSync(':memory:')
  applySqliteMigrations(db, [sqliteMigrations[0]])
  db.prepare(`INSERT INTO interrupts (
    interrupt_id, run_id, thread_id, status, requested_at, payload_json
  ) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(
      'legacy-tool',
      'run-legacy',
      'thread',
      'pending',
      1,
      JSON.stringify({
        id: 'legacy-tool',
        reason: 'approval_required',
        toolCallId: 'call-legacy',
        responseSchema: {
          type: 'object',
          properties: { approved: { type: 'boolean' } },
          required: ['approved'],
        },
        metadata: { kind: 'approval', toolName: 'transfer', input: { cents: 5 } },
      }),
    )
  expect(() => applySqliteMigrations(db, [sqliteMigrations[1]])).not.toThrow()
  const rows = db.prepare(
    'SELECT status, generation, binding_json FROM interrupts WHERE run_id = ?',
  ).all('run-legacy')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ status: 'pending', generation: 1 })
  expect(JSON.parse(String(rows[0]?.binding_json))).toMatchObject({
    kind: 'generic',
    interruptId: 'legacy-tool',
    interruptedRunId: 'run-legacy',
    generation: 1,
  })
})
```

- [ ] **Step 2: Run the red Drizzle targets**

Run:

```powershell
pnpm --filter @tanstack/ai-persistence-drizzle test:lib -- --run tests/drizzle.conformance.test.ts tests/migrations.test.ts tests/migration-cli.test.ts
pnpm --filter @tanstack/ai-persistence-drizzle test:types
```

Expected: FAIL because the schema lacks generation/binding/batch columns and the store lacks atomic gateway methods.

- [ ] **Step 3: Add schema and an explicit transaction executor**

Add `generation`, `bindingJson`, and `responseSchemaHash` to `interrupts`; add an `interruptBatches` table keyed by interrupted run with a unique continuation ID. Do not claim atomicity from the schema-agnostic `DrizzleDb` alone:

```ts
export interface DrizzleTransactionExecutor {
  transaction<T>(work: (tx: DrizzleDb) => Promise<T>): Promise<T>
}

export function createInterruptStore(
  db: DrizzleDb,
  executor: DrizzleTransactionExecutor,
): InterruptStore

export function drizzlePersistence(
  db: DrizzleDb,
  options: { interruptTransactions: DrizzleTransactionExecutor },
)
```

The Node factory must serialize asynchronous transaction callbacks per connection:

```ts
export function createSerializedSqliteExecutor(
  database: DatabaseSync,
  db: DrizzleDb,
): DrizzleTransactionExecutor {
  let tail: Promise<void> = Promise.resolve()
  return {
    transaction<T>(work: (tx: DrizzleDb) => Promise<T>): Promise<T> {
      const run = tail.then(async () => {
        database.exec('BEGIN IMMEDIATE')
        try {
          const value = await work(db)
          database.exec('COMMIT')
          return value
        } catch (error) {
          database.exec('ROLLBACK')
          throw error
        }
      })
      tail = run.then(() => undefined, () => undefined)
      return run
    },
  }
}
```

`sqlitePersistence` constructs exactly one executor per `DatabaseSync`. `drizzlePersistence` requires `interruptTransactions` whenever interrupts are enabled and throws `atomic-commit-unsupported` during construction if it is absent.

- [ ] **Step 4: Implement the transaction and exact replay**

Implement `openInterruptBatch`, `commitInterruptResolutions`, and `getInterruptRecoveryState` through this executor. The commit body is:

```ts
return executor.transaction(async (tx) => {
  const existing = await tx.select().from(interruptBatches)
    .where(eq(interruptBatches.interruptedRunId, input.interruptedRunId)).get()
  if (existing) {
    if (
      existing.fingerprint === input.fingerprint &&
      existing.resolutionsJson === input.canonicalResolutions
    ) {
      return { status: 'replayed', continuationRunId: existing.continuationRunId }
    }
    return { status: 'conflict', authoritativeState: recoveryFromBatch(existing) }
  }
  const pending = await tx.select().from(interrupts).where(and(
    eq(interrupts.runId, input.interruptedRunId),
    eq(interrupts.status, 'pending'),
  )).all()
  const now = clock()
  if (
    !hasExactInterruptIds(input.expectedInterruptIds, pending.map((row) => row.interruptId)) ||
    pending.some((row) => row.generation !== input.expectedGeneration) ||
    pending.some((row) => isExpiredBindingJson(row.bindingJson, now))
  ) {
    return { status: 'conflict', authoritativeState: recoveryFromRows(input, pending, now) }
  }
  await tx.insert(interruptBatches).values({
    interruptedRunId: input.interruptedRunId,
    threadId: input.threadId,
    generation: input.expectedGeneration,
    expectedInterruptIdsJson: JSON.stringify([...input.expectedInterruptIds].sort()),
    fingerprint: input.fingerprint,
    resolutionsJson: input.canonicalResolutions,
    continuationRunId: input.continuationRunId,
    committedAt: now,
  }).run()
  for (const resolution of input.resolutions) {
    const result = await tx.update(interrupts).set({
      status: resolution.status === 'cancelled' ? 'cancelled' : 'resolved',
      responseJson: resolution,
      resolvedAt: now,
    }).where(and(
      eq(interrupts.interruptId, resolution.interruptId),
      eq(interrupts.runId, input.interruptedRunId),
      eq(interrupts.status, 'pending'),
      eq(interrupts.generation, input.expectedGeneration),
    )).run()
    if (result.changes !== 1) throw new Error('interrupt CAS row changed')
  }
  return { status: 'committed', continuationRunId: input.continuationRunId }
})
```

`openInterruptBatch` and recovery use the same executor and the shared projection:

```ts
async function openInterruptBatch(
  input: OpenInterruptBatchInput,
): Promise<{ generation: number; descriptors: readonly Interrupt[] }> {
  if (!hasExactInterruptIds(
    input.descriptors.map((descriptor) => descriptor.id),
    input.bindings.map((binding) => binding.interruptId),
  )) {
    throw new TypeError('Interrupt descriptors and bindings must have exact IDs.')
  }
  return executor.transaction(async (tx) => {
    const existing = await tx.select().from(interrupts).where(
      eq(interrupts.runId, input.interruptedRunId),
    ).all()
    if (existing.length > 0) {
      const existingIds = existing.map((row) => row.interruptId)
      if (!hasExactInterruptIds(existingIds, input.descriptors.map((item) => item.id))) {
        throw new Error('Interrupt batch already opened with a different set.')
      }
      return {
        generation: existing[0]?.generation ?? 1,
        descriptors: cloneAndDeepFreezeJson(
          existing.map((row) => JSON.parse(row.payloadJson) as Interrupt),
        ),
      }
    }

    const generation = 1
    const bindings = new Map(input.bindings.map((binding) => [
      binding.interruptId,
      cloneAndDeepFreezeJson({
        ...binding,
        interruptedRunId: input.interruptedRunId,
        generation,
      } satisfies InterruptBinding),
    ]))
    const descriptors = input.descriptors.map((descriptor) => {
      const binding = bindings.get(descriptor.id)
      if (!binding) throw new Error(`Missing binding for ${descriptor.id}`)
      return cloneAndDeepFreezeJson({
        ...descriptor,
        metadata: { ...descriptor.metadata, 'tanstack:binding': binding },
      })
    })
    await tx.insert(interrupts).values(descriptors.map((descriptor) => {
      const binding = bindings.get(descriptor.id)
      if (!binding) throw new Error(`Missing binding for ${descriptor.id}`)
      return {
        interruptId: descriptor.id,
        runId: input.interruptedRunId,
        threadId: input.threadId,
        generation,
        status: 'pending',
        requestedAt: clock(),
        payloadJson: JSON.stringify(descriptor),
        bindingJson: JSON.stringify(binding),
        responseSchemaHash: binding.responseSchemaHash,
      }
    })).run()
    return { generation, descriptors: cloneAndDeepFreezeJson(descriptors) }
  })
}

async function getInterruptRecoveryState(
  query: InterruptRecoveryQuery,
): Promise<InterruptRecoveryStateV1> {
  return executor.transaction(async (tx) => {
    const batchRow = await tx.select().from(interruptBatches).where(
      eq(interruptBatches.interruptedRunId, query.interruptedRunId),
    ).get()
    const rows = await tx.select().from(interrupts).where(
      eq(interrupts.runId, query.interruptedRunId),
    ).orderBy(interrupts.interruptId).all()
    return projectInterruptRecovery({
      query,
      batch: batchRow ? decodeInterruptBatchRow(batchRow) : null,
      rows: rows.map(decodeInterruptRow),
      now: clock(),
      includeResolutions: true,
    })
  })
}
```

Define the decoders beside the store; these names are used by the preceding methods:

```ts
function parseJsonRecord(value: string, label: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new TypeError(`${label} must contain a JSON object.`)
    }
    return parsed as Record<string, unknown>
  } catch (cause) {
    throw new InterruptStoreCorruptionError(`Invalid ${label}.`, { cause })
  }
}

function decodeInterruptRow(
  row: typeof interrupts.$inferSelect,
): InterruptRecord {
  const payload = parseJsonRecord(row.payloadJson, 'interrupt payload')
  const binding = parseJsonRecord(row.bindingJson, 'interrupt binding')
  if (
    binding['interruptId'] !== row.interruptId ||
    binding['interruptedRunId'] !== row.runId ||
    binding['generation'] !== row.generation
  ) {
    throw new InterruptStoreCorruptionError('Interrupt binding correlation mismatch.')
  }
  return cloneAndDeepFreezeJson({
    interruptId: row.interruptId,
    runId: row.runId,
    threadId: row.threadId,
    generation: row.generation,
    status: row.status,
    requestedAt: row.requestedAt,
    ...(row.resolvedAt !== null && { resolvedAt: row.resolvedAt }),
    payload,
    binding,
    ...(row.responseJson !== null && {
      response: JSON.parse(row.responseJson) as unknown,
    }),
  }) as InterruptRecord
}

function decodeInterruptBatchRow(
  row: typeof interruptBatches.$inferSelect,
): InterruptBatchRecord {
  const expectedInterruptIds: unknown = JSON.parse(row.expectedInterruptIdsJson)
  const resolutions: unknown = JSON.parse(row.resolutionsJson)
  if (!Array.isArray(expectedInterruptIds) || !Array.isArray(resolutions)) {
    throw new InterruptStoreCorruptionError('Invalid interrupt batch arrays.')
  }
  const resolutionIds = resolutions.map((entry) => {
    if (!entry || typeof entry !== 'object' || !('interruptId' in entry)) {
      throw new InterruptStoreCorruptionError('Invalid interrupt batch resolution.')
    }
    return String(entry.interruptId)
  })
  if (!hasExactInterruptIds(expectedInterruptIds.map(String), resolutionIds)) {
    throw new InterruptStoreCorruptionError('Interrupt batch ID set mismatch.')
  }
  return cloneAndDeepFreezeJson({
    threadId: row.threadId,
    interruptedRunId: row.interruptedRunId,
    generation: row.generation,
    expectedInterruptIds: expectedInterruptIds.map(String),
    fingerprint: row.fingerprint,
    canonicalResolutions: row.resolutionsJson,
    resolutions,
    continuationRunId: row.continuationRunId,
    committedAt: row.committedAt,
  }) as InterruptBatchRecord
}
```

Direct tests assert `pending`, `committed`, `expired`, `missing`, and resolved-without-batch `legacy-committed`; expiry is evaluated inside the executor transaction.

- [ ] **Step 5: Generate and package the numbered migration**

Run:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai-persistence-drizzle db:generate -- --name tanstack_ai_interrupt_batches
```

Expected: Drizzle creates the `0001` SQL/meta entries. Ensure the SQL represented by both the generated file and packaged asset contains:

```sql
ALTER TABLE `interrupts` ADD `generation` integer NOT NULL DEFAULT 1;
ALTER TABLE `interrupts` ADD `binding_json` text;
ALTER TABLE `interrupts` ADD `response_schema_hash` text NOT NULL DEFAULT '';
UPDATE `interrupts`
SET `binding_json` = json_object(
      'kind', 'generic',
      'interruptId', `interrupt_id`,
      'interruptedRunId', `run_id`,
      'generation', 1,
      'responseSchemaHash',
        'legacy-json:' || COALESCE(json(json_extract(`payload_json`, '$.responseSchema')), 'null'),
      'expiresAt', json_extract(`payload_json`, '$.expiresAt')
    ),
    `response_schema_hash` =
      'legacy-json:' || COALESCE(json(json_extract(`payload_json`, '$.responseSchema')), 'null')
WHERE `status` = 'pending';
UPDATE `interrupts` SET `generation` = 0 WHERE `status` <> 'pending';
CREATE TABLE `interrupt_batches` (
  `interrupted_run_id` text PRIMARY KEY NOT NULL,
  `thread_id` text NOT NULL,
  `generation` integer NOT NULL,
  `expected_interrupt_ids_json` text NOT NULL,
  `fingerprint` text NOT NULL,
  `resolutions_json` text NOT NULL,
  `continuation_run_id` text NOT NULL UNIQUE,
  `committed_at` integer NOT NULL
);
CREATE INDEX `interrupts_run_status_generation_idx` ON `interrupts` (`run_id`,`status`,`generation`);
CREATE INDEX `interrupts_thread_status_idx` ON `interrupts` (`thread_id`,`status`);
```

In `migrations.test.ts`, read the generated SQL, packaged asset, `_journal.json`, and snapshot. Assert: journal entry tag is `0001_tanstack_ai_interrupt_batches`; snapshot contains `interrupt_batches` and both indexes; packaged SQL bytes equal generated SQL bytes; and `sqliteMigrations[1]` has the same ID, filename, and SQL. In `migration-cli.test.ts`, assert the CLI writes `0000` then `0001` with those exact bytes. Do not rename only the SQL; regenerate journal and snapshot together.

- [ ] **Step 6: Run green adapter checks and refactor**

Run:

```powershell
pnpm --filter @tanstack/ai-persistence-drizzle test:lib -- --run tests/drizzle.conformance.test.ts tests/migrations.test.ts tests/migration-cli.test.ts
pnpm --filter @tanstack/ai-persistence-drizzle test:types
```

Expected: PASS; migration reruns are idempotent, CLI copies both files, and the conformance race has one winner. Extract row-to-recovery mapping, rerun both commands, and confirm no transaction accepts a partial expected set.

### Task 6: Implement Prisma CAS and keep all schema copies identical

**Prerequisites:** Task 4. May run after Task 5 once shared types settle.

**Files:**
- Modify: `packages/ai-persistence-prisma/src/stores.ts:200-300`
- Modify: `packages/ai-persistence-prisma/prisma/schema.prisma`
- Modify: `packages/ai-persistence-prisma/prisma/tanstack-ai.prisma`
- Modify: `packages/ai-persistence-prisma/src/assets/tanstack-ai.prisma`
- Modify: `packages/ai-persistence-prisma/tests/prisma.conformance.test.ts`
- Modify: `packages/ai-persistence-prisma/tests/models.test.ts`
- Modify: `packages/ai-persistence-prisma/tests/models-cli.test.ts`
- Modify: `packages/ai-persistence-prisma/tests/api-types.test-d.ts`

- [ ] **Step 1: Add failing schema-copy and transaction tests**

Add assertions that all model fragments contain the batch model and are byte-identical where they are intended to be copied:

```ts
expect(prismaModels).toContain('model InterruptBatch')
expect(prismaModels).toContain('generation Int @default(1)')
expect(prismaModels).toContain('continuationRunId        String @unique')
expect(copiedModels).toBe(prismaModels)
```

Run shared conformance with two Prisma clients submitting different complete batches concurrently.

- [ ] **Step 2: Run the red Prisma targets**

Run:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai-persistence-prisma db:generate
pnpm --filter @tanstack/ai-persistence-prisma test:lib -- --run tests/prisma.conformance.test.ts tests/models.test.ts tests/models-cli.test.ts
pnpm --filter @tanstack/ai-persistence-prisma test:types
```

Expected: tests FAIL because `InterruptBatch`, generation, and gateway methods are absent.

- [ ] **Step 3: Update the three Prisma schema sources**

Add the same fields to `Interrupt` in all copies and this provider-neutral model:

```prisma
model InterruptBatch {
  interruptedRunId        String @id @map("interrupted_run_id")
  threadId                 String @map("thread_id")
  generation               Int
  expectedInterruptIdsJson String @map("expected_interrupt_ids_json")
  fingerprint              String
  resolutionsJson          String @map("resolutions_json")
  continuationRunId        String @unique @map("continuation_run_id")
  committedAt              BigInt @map("committed_at")

  @@map("interrupt_batches")
}
```

Add `generation Int @default(1)`, `bindingJson String?`, `responseSchemaHash String @default("")`, plus run/status/generation and thread/status indexes to `Interrupt`.

- [ ] **Step 4: Implement `$transaction` CAS**

Use an interactive transaction with the exact-set decision inside it:

```ts
return prisma.$transaction(async (tx) => {
  const winner = await tx.interruptBatch.findUnique({
    where: { interruptedRunId: input.interruptedRunId },
  })
  if (winner) {
    if (
      winner.fingerprint === input.fingerprint &&
      winner.resolutionsJson === input.canonicalResolutions
    ) {
      return { status: 'replayed', continuationRunId: winner.continuationRunId }
    }
    return { status: 'conflict', authoritativeState: recoveryFromPrismaBatch(winner) }
  }

  const pending = await tx.interrupt.findMany({
    where: {
      runId: input.interruptedRunId,
      status: 'pending',
      generation: input.expectedGeneration,
    },
    orderBy: { interruptId: 'asc' },
  })
  const now = clock()
  if (
    !hasExactInterruptIds(input.expectedInterruptIds, pending.map((row) => row.interruptId)) ||
    pending.some((row) => bindingExpired(row.bindingJson, now))
  ) {
    return { status: 'conflict', authoritativeState: recoveryFromPrismaRows(input, pending, now) }
  }
  await tx.interruptBatch.create({
    data: {
      interruptedRunId: input.interruptedRunId,
      threadId: input.threadId,
      generation: input.expectedGeneration,
      expectedInterruptIdsJson: JSON.stringify([...input.expectedInterruptIds].sort()),
      fingerprint: input.fingerprint,
      resolutionsJson: input.canonicalResolutions,
      continuationRunId: input.continuationRunId,
      committedAt: BigInt(now),
    },
  })
  for (const resolution of input.resolutions) {
    const updated = await tx.interrupt.updateMany({
      where: {
        interruptId: resolution.interruptId,
        runId: input.interruptedRunId,
        status: 'pending',
        generation: input.expectedGeneration,
      },
      data: {
        status: resolution.status === 'cancelled' ? 'cancelled' : 'resolved',
        responseJson: JSON.stringify(resolution),
        resolvedAt: BigInt(now),
      },
    })
    if (updated.count !== 1) throw new Error('interrupt CAS row changed')
  }
  return {
    status: 'committed',
    continuationRunId: input.continuationRunId,
  }
})
```

Add these two gateway methods beside the commit method:

```ts
async function openInterruptBatch(
  input: OpenInterruptBatchInput,
): Promise<{ generation: number; descriptors: readonly Interrupt[] }> {
  if (!hasExactInterruptIds(
    input.descriptors.map((descriptor) => descriptor.id),
    input.bindings.map((binding) => binding.interruptId),
  )) {
    throw new TypeError('Interrupt descriptors and bindings must have exact IDs.')
  }
  return prisma.$transaction(async (tx) => {
    const existing = await tx.interrupt.findMany({
      where: { runId: input.interruptedRunId },
      orderBy: { interruptId: 'asc' },
    })
    if (existing.length > 0) {
      if (!hasExactInterruptIds(
        existing.map((row) => row.interruptId),
        input.descriptors.map((descriptor) => descriptor.id),
      )) {
        throw new Error('Interrupt batch already opened with a different set.')
      }
      return {
        generation: existing[0]?.generation ?? 1,
        descriptors: cloneAndDeepFreezeJson(
          existing.map((row) => JSON.parse(row.payloadJson) as Interrupt),
        ),
      }
    }

    const generation = 1
    const unopened = new Map(
      input.bindings.map((binding) => [binding.interruptId, binding]),
    )
    const descriptors = input.descriptors.map((descriptor) => {
      const binding = unopened.get(descriptor.id)
      if (!binding) throw new Error(`Missing binding for ${descriptor.id}`)
      const authoritativeBinding = {
        ...binding,
        interruptedRunId: input.interruptedRunId,
        generation,
      } satisfies InterruptBinding
      return {
        descriptor: cloneAndDeepFreezeJson({
          ...descriptor,
          metadata: {
            ...descriptor.metadata,
            'tanstack:binding': authoritativeBinding,
          },
        }),
        binding: authoritativeBinding,
      }
    })
    await tx.interrupt.createMany({
      data: descriptors.map(({ descriptor, binding }) => ({
        interruptId: descriptor.id,
        runId: input.interruptedRunId,
        threadId: input.threadId,
        generation,
        status: 'pending',
        requestedAt: BigInt(clock()),
        payloadJson: JSON.stringify(descriptor),
        bindingJson: JSON.stringify(binding),
        responseSchemaHash: binding.responseSchemaHash,
      })),
    })
    return {
      generation,
      descriptors: cloneAndDeepFreezeJson(
        descriptors.map(({ descriptor }) => descriptor),
      ),
    }
  })
}

async function getInterruptRecoveryState(
  query: InterruptRecoveryQuery,
): Promise<InterruptRecoveryStateV1> {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.interruptBatch.findUnique({
      where: { interruptedRunId: query.interruptedRunId },
    })
    const rawRows = await tx.interrupt.findMany({
      where: { runId: query.interruptedRunId },
      orderBy: { interruptId: 'asc' },
    })
    const rows = []
    for (const row of rawRows) {
      if (row.status === 'pending' && row.bindingJson === null) {
        const descriptor: Interrupt = JSON.parse(row.payloadJson)
        const responseSchemaHash = `legacy-json:${canonicalInterruptJson(
          descriptor.responseSchema ?? null,
        )}`
        const binding = cloneAndDeepFreezeJson({
          kind: 'generic',
          interruptId: row.interruptId,
          interruptedRunId: row.runId,
          generation: row.generation,
          responseSchemaHash,
          ...(descriptor.expiresAt !== undefined && {
            expiresAt: descriptor.expiresAt,
          }),
        } satisfies InterruptBinding)
        await tx.interrupt.update({
          where: { interruptId: row.interruptId },
          data: {
            bindingJson: JSON.stringify(binding),
            responseSchemaHash,
          },
        })
        rows.push(decodePrismaInterruptRow({ ...row, bindingJson: JSON.stringify(binding) }))
      } else {
        rows.push(decodePrismaInterruptRow(row))
      }
    }
    return projectInterruptRecovery({
      query,
      batch: batch ? decodePrismaBatchRow(batch) : null,
      rows,
      now: clock(),
      includeResolutions: true,
    })
  })
}
```

Define the Prisma decoders used above:

```ts
type PrismaInterruptRow = {
  interruptId: string
  runId: string
  threadId: string
  generation: number
  status: string
  requestedAt: bigint
  resolvedAt: bigint | null
  payloadJson: string
  bindingJson: string | null
  responseJson: string | null
}

function decodePrismaInterruptRow(row: PrismaInterruptRow): InterruptRecord {
  if (row.bindingJson === null) {
    throw new InterruptStoreCorruptionError('Pending interrupt has no binding.')
  }
  const payload: unknown = JSON.parse(row.payloadJson)
  const binding: unknown = JSON.parse(row.bindingJson)
  if (
    !binding ||
    typeof binding !== 'object' ||
    !('interruptId' in binding) ||
    binding.interruptId !== row.interruptId ||
    !('interruptedRunId' in binding) ||
    binding.interruptedRunId !== row.runId ||
    !('generation' in binding) ||
    binding.generation !== row.generation
  ) {
    throw new InterruptStoreCorruptionError('Interrupt binding correlation mismatch.')
  }
  if (
    row.status !== 'pending' &&
    row.status !== 'resolved' &&
    row.status !== 'cancelled'
  ) {
    throw new InterruptStoreCorruptionError('Invalid interrupt status.')
  }
  return cloneAndDeepFreezeJson({
    interruptId: row.interruptId,
    runId: row.runId,
    threadId: row.threadId,
    generation: row.generation,
    status: row.status,
    requestedAt: Number(row.requestedAt),
    ...(row.resolvedAt !== null && { resolvedAt: Number(row.resolvedAt) }),
    payload,
    binding,
    ...(row.responseJson !== null && {
      response: JSON.parse(row.responseJson) as unknown,
    }),
  }) as InterruptRecord
}

type PrismaInterruptBatchRow = {
  interruptedRunId: string
  threadId: string
  generation: number
  expectedInterruptIdsJson: string
  fingerprint: string
  resolutionsJson: string
  continuationRunId: string
  committedAt: bigint
}

function decodePrismaBatchRow(
  row: PrismaInterruptBatchRow,
): InterruptBatchRecord {
  const expected: unknown = JSON.parse(row.expectedInterruptIdsJson)
  const resolutions: unknown = JSON.parse(row.resolutionsJson)
  if (!Array.isArray(expected) || !Array.isArray(resolutions)) {
    throw new InterruptStoreCorruptionError('Invalid interrupt batch arrays.')
  }
  const resolutionIds = resolutions.map((entry) => {
    if (!entry || typeof entry !== 'object' || !('interruptId' in entry)) {
      throw new InterruptStoreCorruptionError('Invalid interrupt resolution.')
    }
    return String(entry.interruptId)
  })
  if (!hasExactInterruptIds(expected.map(String), resolutionIds)) {
    throw new InterruptStoreCorruptionError('Interrupt batch ID set mismatch.')
  }
  return cloneAndDeepFreezeJson({
    interruptedRunId: row.interruptedRunId,
    threadId: row.threadId,
    generation: row.generation,
    expectedInterruptIds: expected.map(String),
    fingerprint: row.fingerprint,
    canonicalResolutions: row.resolutionsJson,
    resolutions,
    continuationRunId: row.continuationRunId,
    committedAt: Number(row.committedAt),
  }) as InterruptBatchRecord
}
```

The in-transaction legacy branch is the Prisma data migration path: it reconstructs a safe generic authoritative binding from the stored descriptor and persists it before returning `pending`; it never guesses a current tool binding.

Catch a `P2002` unique race outside the commit transaction, reload the authoritative batch, and compare both fingerprint and canonical `resolutionsJson`; replay always returns the stored continuation ID. Invoke the shared conformance kit with a controllable clock, a faulting gateway wrapper, and a `reopen` that constructs a new Prisma client. Add a direct test that inserts a pending row with `bindingJson: null`, calls recovery, asserts the row was atomically upgraded to `kind: 'generic'`, and can then commit; add expiry-inside-transaction and resolved-without-batch `legacy-committed` tests. All three Prisma schema copies use the field-level `String @unique @map("continuation_run_id")` form shown above; no test or copy uses `@@unique([continuationRunId])`.

- [ ] **Step 5: Generate the client and run green checks**

Run:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai-persistence-prisma db:generate
pnpm --filter @tanstack/ai-persistence-prisma test:lib -- --run tests/prisma.conformance.test.ts tests/models.test.ts tests/models-cli.test.ts
pnpm --filter @tanstack/ai-persistence-prisma test:types
```

Expected: PASS; copied model output contains the new model, and concurrent writers produce one commit and one conflict.

- [ ] **Step 6: Refactor and recheck**

Centralize JSON serialization/deserialization for IDs, resolutions, and bindings, rerun the same commands, and verify docs in Task 17 instruct applications to generate and deploy their own Prisma migration before using the new package.

### Task 7: Implement an atomic Cloudflare D1 conditional batch

**Prerequisites:** Tasks 4 and 5 for shared schema/migration shape.

**Files:**
- Modify: `packages/ai-persistence-cloudflare/src/d1.ts`
- Modify: `packages/ai-persistence-cloudflare/src/migrations.ts`
- Create: `packages/ai-persistence-cloudflare/migrations/0001_tanstack_ai_interrupt_batches.sql`
- Create: `packages/ai-persistence-cloudflare/src/assets/0001_tanstack_ai_interrupt_batches.sql`
- Modify: `packages/ai-persistence-cloudflare/tests/runtime.conformance.test.ts`
- Modify: `packages/ai-persistence-cloudflare/tests/migrations.test.ts`
- Modify: `packages/ai-persistence-cloudflare/tests/migration-cli.test.ts`
- Modify: `packages/ai-persistence-cloudflare/tests/api-types.test-d.ts`

- [ ] **Step 1: Add failing D1 race, rollback, and migration tests**

Invoke `runInterruptStoreConformance` with `createD1Stores(database).interrupts`, an injected clock, and a reopen callback that reuses the Miniflare database through a new store instance. Add this D1-only rollback assertion:

```ts
const store = createD1Stores(database, {
  interruptTestHook: { failStatementForInterruptId: 'int-b' },
}).interrupts
if (!store) throw new Error('interrupt store missing')
await openTwoInterrupts(store)
await expect(store.commitInterruptResolutions(validTwoItemCommit())).rejects.toThrow(
  /forced D1 statement failure/,
)
expect(await database.prepare('SELECT COUNT(*) AS count FROM interrupt_batches').first()).toEqual({ count: 0 })
expect(await database.prepare("SELECT COUNT(*) AS count FROM interrupts WHERE status = 'pending'").first()).toEqual({ count: 2 })
```

The fixture functions `openTwoInterrupts` and `validTwoItemCommit` are exported by the shared conformance testkit created in Task 4; they contain the literal two descriptors/bindings and core-canonicalized commit input. Migration tests assert `0001` is bundled and copied after `0000`.

- [ ] **Step 2: Run the red Cloudflare targets**

Run:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai-persistence-cloudflare test:lib -- --run tests/runtime.conformance.test.ts tests/migrations.test.ts tests/migration-cli.test.ts
pnpm --filter @tanstack/ai-persistence-cloudflare test:types
```

Expected: FAIL because `createD1Stores` delegates interrupts to a Drizzle store without an atomic executor and migration `0001` is missing.

- [ ] **Step 3: Add and register the D1 migration**

Both D1 migration locations contain these statements, including the same authoritative generic binding reconstruction for PR-head pending descriptors:

```sql
ALTER TABLE `interrupts` ADD `generation` integer NOT NULL DEFAULT 1;
ALTER TABLE `interrupts` ADD `binding_json` text;
ALTER TABLE `interrupts` ADD `response_schema_hash` text NOT NULL DEFAULT '';
UPDATE `interrupts`
SET `binding_json` = json_object(
      'kind', 'generic',
      'interruptId', `interrupt_id`,
      'interruptedRunId', `run_id`,
      'generation', 1,
      'responseSchemaHash',
        'legacy-json:' || COALESCE(json(json_extract(`payload_json`, '$.responseSchema')), 'null'),
      'expiresAt', json_extract(`payload_json`, '$.expiresAt')
    ),
    `response_schema_hash` =
      'legacy-json:' || COALESCE(json(json_extract(`payload_json`, '$.responseSchema')), 'null')
WHERE `status` = 'pending';
UPDATE `interrupts` SET `generation` = 0 WHERE `status` <> 'pending';
CREATE TABLE `interrupt_batches` (
  `interrupted_run_id` text PRIMARY KEY NOT NULL,
  `thread_id` text NOT NULL,
  `generation` integer NOT NULL,
  `expected_interrupt_ids_json` text NOT NULL,
  `fingerprint` text NOT NULL,
  `resolutions_json` text NOT NULL,
  `continuation_run_id` text NOT NULL UNIQUE,
  `committed_at` integer NOT NULL
);
CREATE INDEX `interrupts_run_status_generation_idx`
  ON `interrupts` (`run_id`,`status`,`generation`);
CREATE INDEX `interrupts_thread_status_idx`
  ON `interrupts` (`thread_id`,`status`);
```

The D1 migration test first inserts PR-head `approval_required` and `client_tool_input` descriptors with no reserved binding, applies `0001`, and asserts both remain `pending` with generation `1`, a `kind: 'generic'` binding correlated to the stored row/run, and a `legacy-json:` response-schema identity. Apply the migration in one D1 migration transaction and assert the table, columns, indexes, and both upgraded rows appear together. Import the raw asset and append:

```ts
{
  id: '0001_tanstack_ai_interrupt_batches',
  filename: '0001_tanstack_ai_interrupt_batches.sql',
  sql: interruptBatchesMigrationSql,
}
```

Keep `src/r2.ts` and R2 migrations unchanged.

- [ ] **Step 4: Override the D1 interrupt store with one conditional batch**

Implement `createD1InterruptStore(d1, clock)` and return it from `createD1Stores`. The open and recovery methods are:

```ts
async function openInterruptBatch(
  input: OpenInterruptBatchInput,
): Promise<{ generation: number; descriptors: readonly Interrupt[] }> {
  const descriptorIds = input.descriptors.map((descriptor) => descriptor.id)
  const bindingIds = input.bindings.map((binding) => binding.interruptId)
  if (!hasExactInterruptIds(descriptorIds, bindingIds)) {
    throw new TypeError('Interrupt descriptors and bindings must have exact IDs.')
  }
  const existing = await d1.prepare(
    'SELECT * FROM interrupts WHERE run_id = ? ORDER BY interrupt_id',
  ).bind(input.interruptedRunId).all<D1InterruptRow>()
  if (existing.results.length > 0) {
    if (!hasExactInterruptIds(
      existing.results.map((row) => row.interrupt_id),
      descriptorIds,
    )) {
      throw new Error('Interrupt batch already opened with a different set.')
    }
    return {
      generation: existing.results[0]?.generation ?? 1,
      descriptors: cloneAndDeepFreezeJson(
        existing.results.map((row) => JSON.parse(row.payload_json) as Interrupt),
      ),
    }
  }

  const generation = 1
  const bindings = new Map(input.bindings.map((binding) => [
    binding.interruptId,
    cloneAndDeepFreezeJson({
      ...binding,
      interruptedRunId: input.interruptedRunId,
      generation,
    } satisfies InterruptBinding),
  ]))
  const descriptors = input.descriptors.map((descriptor) => {
    const binding = bindings.get(descriptor.id)
    if (!binding) throw new Error(`Missing binding for ${descriptor.id}`)
    return cloneAndDeepFreezeJson({
      ...descriptor,
      metadata: { ...descriptor.metadata, 'tanstack:binding': binding },
    })
  })
  const results = await d1.batch(descriptors.map((descriptor) => {
    const binding = bindings.get(descriptor.id)
    if (!binding) throw new Error(`Missing binding for ${descriptor.id}`)
    return d1.prepare(`INSERT INTO interrupts (
      interrupt_id, run_id, thread_id, generation, status, requested_at,
      payload_json, binding_json, response_schema_hash
    ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`).bind(
      descriptor.id,
      input.interruptedRunId,
      input.threadId,
      generation,
      clock(),
      JSON.stringify(descriptor),
      JSON.stringify(binding),
      binding.responseSchemaHash,
    )
  }))
  if (results.some((result) => result.meta.changes !== 1)) {
    throw new Error('D1 did not open every interrupt row.')
  }
  return { generation, descriptors: cloneAndDeepFreezeJson(descriptors) }
}

async function getInterruptRecoveryState(
  query: InterruptRecoveryQuery,
): Promise<InterruptRecoveryStateV1> {
  const [batchResult, rowsResult] = await d1.batch([
    d1.prepare(
      'SELECT * FROM interrupt_batches WHERE interrupted_run_id = ?',
    ).bind(query.interruptedRunId),
    d1.prepare(
      'SELECT * FROM interrupts WHERE run_id = ? ORDER BY interrupt_id',
    ).bind(query.interruptedRunId),
  ])
  const batchRow = batchResult.results[0] as D1InterruptBatchRow | undefined
  const rows = rowsResult.results as D1InterruptRow[]
  return projectInterruptRecovery({
    query,
    batch: batchRow ? decodeD1BatchRow(batchRow) : null,
    rows: rows.map(decodeD1InterruptRow),
    now: clock(),
    includeResolutions: true,
  })
}
```

Add the row contracts and decoders used by those methods:

```ts
interface D1InterruptRow {
  interrupt_id: string
  run_id: string
  thread_id: string
  generation: number
  status: 'pending' | 'resolved' | 'cancelled'
  requested_at: number
  resolved_at: number | null
  payload_json: string
  binding_json: string
  response_json: string | null
}

interface D1InterruptBatchRow {
  interrupted_run_id: string
  thread_id: string
  generation: number
  expected_interrupt_ids_json: string
  fingerprint: string
  resolutions_json: string
  continuation_run_id: string
  committed_at: number
}

function decodeD1InterruptRow(row: D1InterruptRow): InterruptRecord {
  const payload: unknown = JSON.parse(row.payload_json)
  const binding: unknown = JSON.parse(row.binding_json)
  if (
    !binding ||
    typeof binding !== 'object' ||
    !('interruptId' in binding) ||
    binding.interruptId !== row.interrupt_id ||
    !('interruptedRunId' in binding) ||
    binding.interruptedRunId !== row.run_id ||
    !('generation' in binding) ||
    binding.generation !== row.generation
  ) {
    throw new InterruptStoreCorruptionError('Interrupt binding correlation mismatch.')
  }
  return cloneAndDeepFreezeJson({
    interruptId: row.interrupt_id,
    runId: row.run_id,
    threadId: row.thread_id,
    generation: row.generation,
    status: row.status,
    requestedAt: row.requested_at,
    ...(row.resolved_at !== null && { resolvedAt: row.resolved_at }),
    payload,
    binding,
    ...(row.response_json !== null && {
      response: JSON.parse(row.response_json) as unknown,
    }),
  }) as InterruptRecord
}

function decodeD1BatchRow(row: D1InterruptBatchRow): InterruptBatchRecord {
  const expected: unknown = JSON.parse(row.expected_interrupt_ids_json)
  const resolutions: unknown = JSON.parse(row.resolutions_json)
  if (!Array.isArray(expected) || !Array.isArray(resolutions)) {
    throw new InterruptStoreCorruptionError('Invalid interrupt batch arrays.')
  }
  const resolutionIds = resolutions.map((entry) => {
    if (!entry || typeof entry !== 'object' || !('interruptId' in entry)) {
      throw new InterruptStoreCorruptionError('Invalid interrupt resolution.')
    }
    return String(entry.interruptId)
  })
  if (!hasExactInterruptIds(expected.map(String), resolutionIds)) {
    throw new InterruptStoreCorruptionError('Interrupt batch ID set mismatch.')
  }
  return cloneAndDeepFreezeJson({
    interruptedRunId: row.interrupted_run_id,
    threadId: row.thread_id,
    generation: row.generation,
    expectedInterruptIds: expected.map(String),
    fingerprint: row.fingerprint,
    canonicalResolutions: row.resolutions_json,
    resolutions,
    continuationRunId: row.continuation_run_id,
    committedAt: row.committed_at,
  }) as InterruptBatchRecord
}
```

Recovery reads winner and rows in one D1 batch snapshot. Commit builds the dynamic `IN` list from the already unique expected IDs and submits this insert followed by one gated update per resolution:

```sql
INSERT INTO interrupt_batches (
  interrupted_run_id, thread_id, generation,
  expected_interrupt_ids_json, fingerprint, resolutions_json,
  continuation_run_id, committed_at
)
SELECT ?, ?, ?, ?, ?, ?, ?, ?
WHERE (
  SELECT COUNT(*) FROM interrupts
  WHERE run_id = ? AND status = 'pending' AND generation = ?
) = ?
AND NOT EXISTS (
  SELECT 1 FROM interrupts
  WHERE run_id = ? AND status = 'pending' AND generation = ?
    AND interrupt_id NOT IN (?, ?)
)
AND NOT EXISTS (
  SELECT 1 FROM interrupts
  WHERE run_id = ? AND status = 'pending' AND generation = ?
    AND json_extract(binding_json, '$.expiresAt') IS NOT NULL
    AND unixepoch(json_extract(binding_json, '$.expiresAt')) * 1000 <= ?
);
```

Each update includes `WHERE interrupt_id = ? AND run_id = ? AND status = 'pending' AND generation = ? AND EXISTS (SELECT 1 FROM interrupt_batches WHERE interrupted_run_id = ? AND fingerprint = ? AND resolutions_json = ? AND continuation_run_id = ?)`. Inspect every batch result: the insert and every expected update must report one change. Zero insert changes or a uniqueness race triggers an authoritative batch read; replay requires both fingerprint and canonical `resolutions_json`, otherwise conflict. Any other zero update or statement error throws, and D1 rolls the batch back. The shared conformance suite plus D1 migration tests cover open, commit, all five recovery projections, expiry in the SQL predicate, exact replay, conflict, forced rollback, restart, and migrated pending/resolved rows.

- [ ] **Step 5: Run green D1 checks and refactor**

Run:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai-persistence-cloudflare test:lib -- --run tests/runtime.conformance.test.ts tests/migrations.test.ts tests/migration-cli.test.ts
pnpm --filter @tanstack/ai-persistence-cloudflare test:types
```

Expected: PASS; forced failure rolls back, exact replay returns the first continuation ID, and different writers observe one conflict. Extract D1 row decoding/recovery helpers and rerun both commands.

### Task 8: Build the authoritative resume gateway and explicit recovery handler

**Prerequisites:** Tasks 3-7. All built-in stores must satisfy conformance before server execution depends on them.

**Files:**
- Modify: `packages/ai-persistence/src/middleware.ts:93-214,675-711,764-911`
- Modify: `packages/ai-persistence/src/capabilities.ts`
- Create: `packages/ai-persistence/src/recovery.ts`
- Modify: `packages/ai-persistence/src/index.ts`
- Modify: `packages/ai-persistence/tests/interrupts.test.ts`
- Modify: `packages/ai-persistence/tests/with-persistence.test.ts`
- Modify: `packages/ai-persistence/tests/persistence-validation.test.ts`
- Modify: `packages/ai/tests/interrupts.test.ts`

- [ ] **Step 1: Write failing exhaustive-validation and recovery tests**

Add one batch containing three independent invalid entries and prove all are reported while the store remains pending. Reuse the existing local `mockAdapter` and `collect` test utilities already defined at the top of `tests/interrupts.test.ts`. Define the tool and fixture in that file:

```ts
const transferInput = z.object({ cents: z.number().int().positive() })
const transferApprove = z.object({ note: z.string().min(1) })
const transferReject = z.object({ reason: z.string().min(1) })
const transferTool = toolDefinition({
  name: 'transfer',
  description: 'Transfer funds',
  needsApproval: true,
  inputSchema: transferInput,
  approvalSchema: {
    approve: transferApprove,
    reject: transferReject,
  },
}).server(async ({ cents }) => ({ receipt: `receipt-${cents}` }))

async function openApprovalBatch(
  persistence: AIPersistence,
  interruptedRunId: string,
): Promise<void> {
  const store = persistence.stores.interrupts
  if (!store) throw new Error('interrupt store missing')
  const approval = normalizeApprovalSchema(
    transferTool.approvalSchema,
    transferTool.inputSchema,
  )
  await store.openInterruptBatch({
    threadId: 'thread-1',
    interruptedRunId,
    descriptors: [
      {
        id: 'approve',
        reason: 'tool_call',
        toolCallId: 'call-approve',
        responseSchema: approval.responseSchema,
      },
      {
        id: 'deny',
        reason: 'tool_call',
        toolCallId: 'call-deny',
        responseSchema: approval.responseSchema,
      },
      {
        id: 'generic',
        reason: 'input_required',
        responseSchema: {
          type: 'object',
          properties: { email: { type: 'string', format: 'email' } },
          required: ['email'],
          additionalProperties: false,
        },
      },
    ],
    bindings: [
      {
        kind: 'tool-approval',
        interruptId: 'approve',
        toolName: 'transfer',
        toolCallId: 'call-approve',
        originalArgs: { cents: 1 },
        inputSchemaHash: hashSchemaInput(transferTool.inputSchema),
        approvalSchemaHash: approval.approvalSchemaHash,
        responseSchemaHash: approval.responseSchemaHash,
      },
      {
        kind: 'tool-approval',
        interruptId: 'deny',
        toolName: 'transfer',
        toolCallId: 'call-deny',
        originalArgs: { cents: 2 },
        inputSchemaHash: hashSchemaInput(transferTool.inputSchema),
        approvalSchemaHash: approval.approvalSchemaHash,
        responseSchemaHash: approval.responseSchemaHash,
      },
      {
        kind: 'generic',
        interruptId: 'generic',
        responseSchemaHash: digestInterruptJson(canonicalInterruptJson({
          type: 'object',
          properties: { email: { type: 'string', format: 'email' } },
          required: ['email'],
          additionalProperties: false,
        })),
      },
    ],
  })
}
```

Obtain the no-execution adapter as `const { adapter: shouldNotRunAdapter, calls: adapterCalls } = mockAdapter([])` and assert `adapterCalls` rather than assuming `chatStream` is a spy:

```ts
it('reports every invalid response and commits nothing', async () => {
  const persistence = memoryPersistence()
  const {
    adapter: shouldNotRunAdapter,
    calls: adapterCalls,
  } = mockAdapter([])
  await openApprovalBatch(persistence, 'run-old')
  const stream = chat({
    adapter: shouldNotRunAdapter,
    messages: [],
    threadId: 'thread-1',
    runId: 'run-new',
    parentRunId: 'run-old',
    resume: [
      {
        interruptId: 'approve',
        status: 'resolved',
        payload: { approved: true, editedArgs: { cents: 'wrong' } },
      },
      {
        interruptId: 'deny',
        status: 'resolved',
        payload: { approved: false, editedArgs: { cents: 1 } },
      },
      {
        interruptId: 'generic',
        status: 'resolved',
        payload: { email: 42 },
      },
    ],
    tools: [transferTool],
    middleware: [withChatPersistence(persistence)],
  })
  const chunks = await collect(stream)
  const errors = chunks.filter((chunk) => chunk.type === 'RUN_ERROR')

  expect(errors).toHaveLength(1)
  expect(errors[0]?.['tanstack:interruptErrors']).toEqual([
    expect.objectContaining({ interruptId: 'approve', code: 'invalid-edited-args' }),
    expect.objectContaining({ interruptId: 'deny', code: 'invalid-edited-args' }),
    expect.objectContaining({ interruptId: 'generic', code: 'invalid-payload' }),
  ])
  expect(await persistence.stores.interrupts?.listPendingByRun('run-old')).toHaveLength(3)
  expect(adapterCalls).toHaveLength(0)
})
```

Add the exact-set aggregate test:

```ts
it('returns item and batch exact-set errors together', async () => {
  const persistence = memoryPersistence()
  const store = persistence.stores.interrupts
  if (!store) throw new Error('interrupt store missing')
  const responseSchema = {
    type: 'object',
    properties: { value: { type: 'string' } },
    required: ['value'],
    additionalProperties: false,
  } as const
  await store.openInterruptBatch({
    threadId: 'thread-1',
    interruptedRunId: 'run-old',
    descriptors: ['a', 'b', 'c'].map((id) => ({
      id,
      reason: 'input_required',
      responseSchema,
    })),
    bindings: ['a', 'b', 'c'].map((interruptId) => ({
      kind: 'generic' as const,
      interruptId,
      responseSchemaHash: digestInterruptJson(
        canonicalInterruptJson(responseSchema),
      ),
    })),
  })
  const { adapter, calls } = mockAdapter([])
  const chunks = await collect(chat({
    adapter,
    messages: [],
    threadId: 'thread-1',
    runId: 'run-new',
    parentRunId: 'run-old',
    resume: [
      { interruptId: 'a', status: 'resolved', payload: { value: 1 } },
      { interruptId: 'a', status: 'cancelled' },
      { interruptId: 'x', status: 'resolved', payload: { value: 'extra' } },
    ],
    middleware: [withChatPersistence(persistence)],
  }))
  const runErrors = chunks.filter((chunk) => chunk.type === 'RUN_ERROR')
  expect(runErrors).toHaveLength(1)
  expect(runErrors[0]?.['tanstack:interruptErrors']).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        scope: 'item',
        interruptId: 'a',
        code: 'invalid-payload',
      }),
      expect.objectContaining({
        scope: 'item',
        interruptId: 'x',
        code: 'unknown-interrupt',
      }),
      expect.objectContaining({
        scope: 'batch',
        code: 'protocol',
        interruptIds: ['a'],
      }),
      expect.objectContaining({
        scope: 'batch',
        code: 'protocol',
        interruptIds: ['x'],
      }),
      expect.objectContaining({
        scope: 'batch',
        code: 'incomplete-batch',
        interruptIds: ['b', 'c'],
      }),
    ]),
  )
  expect(await store.listPendingByRun('run-old')).toHaveLength(3)
  expect(calls).toHaveLength(0)
})
```

Add a table whose setup functions are concrete closures in the same test file:

```ts
async function createInvalidGatewayFixture(interruptId: string) {
  const persistence = memoryPersistence()
  const store = persistence.stores.interrupts
  if (!store) throw new Error('interrupt store missing')
  const { adapter, calls: adapterCalls } = mockAdapter([])
  const approval = normalizeApprovalSchema(
    transferTool.approvalSchema,
    transferTool.inputSchema,
  )
  const isTool = interruptId === 'tool' || interruptId === 'drift'
  const descriptor: Interrupt = isTool
    ? {
        id: interruptId,
        reason: 'tool_call',
        toolCallId: `call-${interruptId}`,
        responseSchema: approval.responseSchema,
        ...(interruptId === 'expired' && {
          expiresAt: '2026-07-13T09:59:00.000Z',
        }),
      }
    : {
        id: interruptId,
        reason: 'confirmation',
        responseSchema: { type: 'object' },
        ...(interruptId === 'expired' && {
          expiresAt: '2026-07-13T09:59:00.000Z',
        }),
      }
  const binding: UnopenedInterruptBinding = isTool
    ? {
        kind: 'tool-approval',
        interruptId,
        toolName: interruptId === 'tool' ? 'removed-tool' : 'transfer',
        toolCallId: `call-${interruptId}`,
        originalArgs: { cents: 1 },
        inputSchemaHash:
          interruptId === 'drift'
            ? 'sha256:deployed-different-schema'
            : hashSchemaInput(transferTool.inputSchema),
        approvalSchemaHash: approval.approvalSchemaHash,
        responseSchemaHash: approval.responseSchemaHash,
      }
    : {
        kind: 'generic',
        interruptId,
        responseSchemaHash: digestInterruptJson(
          canonicalInterruptJson(descriptor.responseSchema ?? null),
        ),
        ...(descriptor.expiresAt !== undefined && {
          expiresAt: descriptor.expiresAt,
        }),
      }
  await store.openInterruptBatch({
    threadId: 'thread-1',
    interruptedRunId: 'run-old',
    descriptors: [descriptor],
    bindings: [binding],
  })
  return {
    persistence,
    store,
    adapter,
    adapterCalls,
    threadId: 'thread-1',
    interruptedRunId: 'run-old',
    tools: interruptId === 'drift' ? [transferTool] : [],
  }
}

it.each([
  ['cancelled payload', { interruptId: 'a', status: 'cancelled', payload: {} }, 'protocol'],
  ['expired', { interruptId: 'expired', status: 'cancelled' }, 'expired'],
  ['unknown tool after deploy', { interruptId: 'tool', status: 'cancelled' }, 'stale'],
  ['schema hash drift', { interruptId: 'drift', status: 'cancelled' }, 'stale'],
] as const)('%s performs no write or execution', async (_name, resumeItem, code) => {
  const fixture = await createInvalidGatewayFixture(resumeItem.interruptId)
  const chunks = await collect(chat({
    adapter: fixture.adapter,
    messages: [],
    threadId: fixture.threadId,
    runId: 'run-new',
    parentRunId: fixture.interruptedRunId,
    resume: [resumeItem],
    tools: fixture.tools,
    middleware: [withChatPersistence(fixture.persistence)],
  }))
  expect(chunks).toContainEqual(
    expect.objectContaining({
      type: 'RUN_ERROR',
      'tanstack:interruptErrors': expect.arrayContaining([
        expect.objectContaining({ code }),
      ]),
    }),
  )
  expect(await fixture.store.listPendingByRun(fixture.interruptedRunId)).toHaveLength(1)
  expect(fixture.adapterCalls).toHaveLength(0)
})
```

Separate tests cover missing `parentRunId`, exact replay, a conflicting second batch, and a persistence object with no interrupt store, because those cases use different request/setup shapes. Each asserts one terminal, the named code, zero adapter calls, and unchanged pending rows. Recovery handler tests use the full/redacted authorization contract from Step 6.

- [ ] **Step 2: Run the red gateway tests**

Run:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai-persistence test:lib -- --run tests/interrupts.test.ts tests/with-persistence.test.ts tests/persistence-validation.test.ts
```

Expected: FAIL because middleware still uses fail-fast `validatePendingResumes`, sequential `applyPendingResumes`, and same-run lookup.

- [ ] **Step 3: Provide the core capability and atomically open descriptors**

In middleware `setup`, call `provideInterruptPersistence(ctx, persistence.stores.interrupts)` only after store validation proves all atomic methods exist. In `onChunk`, replace the per-descriptor `create` loop with one call:

```ts
if (
  chunk.type === EventType.RUN_FINISHED &&
  chunk.outcome?.type === 'interrupt'
) {
  const gateway = getInterruptPersistence(ctx)
  const bindings = chunk.outcome.interrupts.map(readServerBinding)
  const opened = await gateway.openInterruptBatch({
    threadId: ctx.threadId,
    interruptedRunId: ctx.runId,
    descriptors: chunk.outcome.interrupts,
    bindings,
  })
  await interruptRun(runs, ctx.runId)
  return {
    ...chunk,
    outcome: { type: 'interrupt', interrupts: [...opened.descriptors] },
  }
}
```

`readServerBinding` accepts only the reserved server-produced metadata shape created in Task 9; missing/malformed bindings fail before this terminal chunk is yielded. `openInterruptBatch` is all-or-none, so an exception cannot leave a partial descriptor set.

- [ ] **Step 4: Rebind configured tool validators and collect every error**

Replace `validatePendingResumes` with an async exhaustive function. The authoritative lookup key is stored tool name plus schema hashes, never client metadata:

```ts
async function validateInterruptResumeBatch(input: {
  pending: readonly InterruptRecord[]
  resume: readonly RunAgentResumeItem[]
  tools: readonly Tool[]
  now: number
  correlation: InterruptCorrelation
}): Promise<ValidatedInterruptBatch> {
  const itemErrors: ItemInterruptError[] = []
  const batchErrors: BatchInterruptError[] = []
  const pendingIds = new Set(input.pending.map((record) => record.interruptId))
  const resumeById = new Map<string, RunAgentResumeItem>()
  for (const entry of input.resume) {
    if (resumeById.has(entry.interruptId)) {
      batchErrors.push(batchError('protocol', [entry.interruptId], 'Duplicate response.', input.correlation))
      continue
    }
    resumeById.set(entry.interruptId, entry)
    if (!pendingIds.has(entry.interruptId)) {
      itemErrors.push(itemError(entry.interruptId, 'unknown-interrupt', 'Unknown interrupt.', input.correlation))
      batchErrors.push(batchError('protocol', [entry.interruptId], 'Extra response.', input.correlation))
    }
  }
  const missing = [...pendingIds].filter((id) => !resumeById.has(id)).sort()
  if (missing.length > 0) {
    batchErrors.push(batchError('incomplete-batch', missing, 'Missing responses.', input.correlation))
  }

  for (const record of [...input.pending].sort((a, b) =>
    a.interruptId.localeCompare(b.interruptId),
  )) {
    const entry = resumeById.get(record.interruptId)
    if (!entry) continue
    const rebound = rebindAuthoritativeValidator(record.binding, input.tools)
    if (rebound.status === 'stale') {
      itemErrors.push(staleSchemaError(record, input.correlation))
      continue
    }
    itemErrors.push(...await validateOneResume(record, entry, rebound, input))
  }
  itemErrors.sort((left, right) => left.interruptId.localeCompare(right.interruptId))
  return itemErrors.length > 0 || batchErrors.length > 0
    ? { ok: false, itemErrors, batchErrors, errors: [...itemErrors, ...batchErrors] }
    : { ok: true, state: buildResumeState(input.pending, resumeById) }
}
```

`batchError` and `itemError` are constructors that copy the full correlation and set `source: 'server'`/`retryable: false`. `validateOneResume` is exhaustive: cancelled entries reject any payload; tool approval validates the response envelope, then edited arguments and selected nested payload; rejection forbids edits; client-tool execution validates output; generic validates the descriptor response schema. Standard Schema validators are awaited and their returned issue order is preserved. Only the outer `itemErrors` array is sorted by interrupt ID. Missing tool/hash drift returns one `stale` item error and never an unconstrained validator.

- [ ] **Step 5: Commit once using `parentRunId` as the CAS key**

In `onConfig`, reject `resume` without `ctx.parentRunId`; load only `listPendingByRun(ctx.parentRunId)`, validate every item, and compute the fingerprint only after validation. Commit exactly once with the candidate continuation `ctx.runId`:

```ts
const candidate = canonicalizeInterruptResolutions(config.resume)
const committed = await store.commitInterruptResolutions({
  threadId: ctx.threadId,
  interruptedRunId: ctx.parentRunId,
  continuationRunId: ctx.runId,
  expectedGeneration: pending[0]?.generation ?? 0,
  expectedInterruptIds: pending.map((record) => record.interruptId),
  resolutions: candidate.resolutions,
  fingerprint: candidate.fingerprint,
  canonicalResolutions: candidate.canonicalResolutions,
})
```

On `committed`, return `resumeToolState` containing approvals with edited arguments/custom payload, client results, denied results, cancelled tool-call IDs, and generic resolutions. Later application middleware can read `genericInterrupts` and continue its own workflow without a tool event. On `replayed`, throw an internal replay signal carrying the winning continuation ID; Task 9 converts it to an accepted terminal replay result without executing tools twice. On `conflict`, throw a serializable interrupt submission failure with authoritative recovery.

- [ ] **Step 6: Create a direct and authenticated HTTP recovery helper**

Implement both an in-process function and an explicit handler factory:

```ts
export async function getInterruptRecoveryState(
  persistence: AIPersistence,
  input: InterruptRecoveryQuery,
): Promise<InterruptRecoveryStateV1> {
  const store = persistence.stores.interrupts
  if (!store) throw new Error('Interrupt persistence is not configured.')
  return store.getInterruptRecoveryState(input)
}

export function createInterruptRecoveryHandler(options: {
  persistence: AIPersistence
  authorize: (
    request: Request,
    input: InterruptRecoveryQuery,
  ) => RecoveryAuthorization | Promise<RecoveryAuthorization>
}): (request: Request) => Promise<Response> {
  return async (request) => {
    const input = parseInterruptRecoveryQuery(await request.json())
    const authorization = await options.authorize(request, input)
    if (!authorization.allowed) {
      return new Response('Forbidden', { status: 403 })
    }
    const state = await getInterruptRecoveryState(options.persistence, input)
    return Response.json(projectRecoveryState(state, authorization))
  }
}

export type RecoveryAuthorization =
  | { allowed: false }
  | { allowed: true; includeResolutions: boolean }

function projectRecoveryState(
  state: InterruptRecoveryStateV1,
  authorization: Extract<RecoveryAuthorization, { allowed: true }>,
): InterruptRecoveryStateV1 {
  if (
    authorization.includeResolutions ||
    state.state !== 'committed' ||
    !state.committed
  ) {
    return cloneAndDeepFreezeJson(state)
  }
  const { resolutions: _redacted, ...committed } = state.committed
  return cloneAndDeepFreezeJson({ ...state, committed })
}
```

Test `{ allowed: false }` → 403, `{ allowed: true, includeResolutions: false }` → committed DTO without `resolutions`, and `includeResolutions: true` → full frozen resolutions. The helper does not register a route or infer a URL.

- [ ] **Step 7: Run green gateway checks and refactor**

Run:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai-persistence test:lib -- --run tests/interrupts.test.ts tests/memory.conformance.test.ts tests/with-persistence.test.ts tests/persistence-validation.test.ts
pnpm --filter @tanstack/ai-persistence test:types
```

Expected: PASS; three invalid entries arrive in one error, nothing writes or executes, and schema drift is stale. Split exact-set, validator-rebind, and resume-state builders into pure private helpers, rerun both commands, and confirm core still has no persistence-package import.

### Task 9: Correct the AG-UI interrupt lifecycle and resumed tool audit

**Prerequisites:** Task 8.

**Files:**
- Modify: `packages/ai/src/activities/chat/index.ts:504-980,1409-1640,1673-1888,2821-2860`
- Modify: `packages/ai/src/activities/chat/tools/tool-calls.ts:425-448,681-890`
- Modify: `packages/ai/src/types.ts:590-735,980-1010,1081-1124`
- Modify: `packages/ai/src/utilities/chat-params.ts:45-104`
- Modify: `packages/ai/tests/interrupts.test.ts`
- Modify: `packages/ai/tests/chat.test.ts:423-870`
- Modify: `packages/ai/tests/chat-params.test.ts`
- Modify: `packages/ai/tests/stream-processor.test.ts:1197-1376,2177-2220`

- [ ] **Step 1: Write failing wire-order and continuation-audit tests**

Add a protocol test that records exact chunk order and a continuation test with approved, denied, and cancelled tool approvals:

```ts
expect(interruptedChunks.map((chunk) => chunk.type).slice(-3)).toEqual([
  EventType.MESSAGES_SNAPSHOT,
  EventType.STATE_SNAPSHOT,
  EventType.RUN_FINISHED,
])
expect(interruptOutcome.interrupts).toEqual([
  expect.objectContaining({ reason: 'tool_call' }),
  expect.objectContaining({ reason: 'tanstack:client_tool_execution' }),
])

const resumedToolEvents = continuationChunks.filter((chunk) =>
  chunk.type.startsWith('TOOL_CALL_'),
)
expect(resumedToolEvents.map((chunk) => chunk.type)).toEqual([
  EventType.TOOL_CALL_RESULT,
  EventType.TOOL_CALL_RESULT,
])
expect(resumedToolEvents.map((chunk) => chunk.toolCallId)).toEqual([
  'approved-call',
  'denied-call',
])
expect(continuationChunks).not.toContainEqual(
  expect.objectContaining({ toolCallId: 'cancelled-call' }),
)
```

Assert the continuation has a new run ID, its `parentRunId` equals the interrupted run, its thread is unchanged, approved edits replace rather than merge, denied history is `{ status: 'denied', payload }`, cancellation is persisted in the interrupt audit and marks the original call not-executed during provider-history reconstruction, generic continuation reaches application middleware, and `onError` runs once for interrupt submission failure. Add a run with an approval-producing tool but no interrupt persistence capability and assert one `RUN_ERROR` with `persistence-required`, no snapshots, and no interrupt `RUN_FINISHED`.

- [ ] **Step 2: Run the red core lifecycle tests**

Run:

```powershell
pnpm --filter @tanstack/ai test:lib -- --run tests/interrupts.test.ts tests/chat.test.ts tests/chat-params.test.ts
```

Expected: FAIL on old reasons `approval_required` / `client_tool_input`, replayed start/args/end events, missing snapshots, and missing structured error handling.

- [ ] **Step 3: Build canonical descriptors and reserved bindings**

Change `buildActionableInterrupts` to use normalized tool schemas and server-owned binding metadata:

```ts
const approvalSchema = normalizeApprovalSchema(
  tool.approvalSchema,
  tool.inputSchema,
)
interrupts.push({
  id: approval.approvalId,
  reason: 'tool_call',
  message: `Approval required to run ${approval.toolName}`,
  toolCallId: approval.toolCallId,
  responseSchema: approvalSchema.responseSchema,
  metadata: {
    'tanstack:binding': {
      kind: 'tool-approval',
      toolName: approval.toolName,
      toolCallId: approval.toolCallId,
      originalArgs: approval.input,
      responseSchemaHash: approvalSchema.responseSchemaHash,
      inputSchemaHash: hashSchemaInput(tool.inputSchema),
      approvalSchemaHash: approvalSchema.approvalSchemaHash,
    },
  },
})
```

Client-tool descriptors use `tanstack:client_tool_execution`, the original call ID, and output/response schema identities. Generic reasons retain `input_required`, `confirmation`, or an unknown namespaced/custom reason. Invalid raw schemas fail before a descriptor is emitted.

Before returning any nonempty actionable descriptor set, require the core-owned `InterruptPersistenceCapability` from Task 3. If the capability is absent, throw `InterruptSubmissionFailure` with batch code `persistence-required` before emitting snapshots or an interrupt terminal. This check lives in core lifecycle code; merely omitting `withChatPersistence` must never create an unresumable native interrupt.

- [ ] **Step 4: Emit required snapshots immediately before the terminal**

Add `state?: unknown` to chat text options and pass the parsed AG-UI state from `chatParamsFromRequestBody`. Before every interrupt terminal path, yield:

```ts
yield* this.pipeThroughMiddleware({
  type: EventType.MESSAGES_SNAPSHOT,
  messages: uiMessagesToWire(modelMessagesToUIMessages(this.messages)),
  timestamp: Date.now(),
})
if (this.params.state !== undefined) {
  yield* this.pipeThroughMiddleware({
    type: EventType.STATE_SNAPSHOT,
    snapshot: this.params.state,
    timestamp: Date.now(),
  })
}
yield* this.pipeThroughMiddleware(this.buildInterruptFinishedChunk(
  finishEvent,
  executionResult.needsApproval,
  executionResult.needsClientExecution,
))
```

Because middleware processes a chunk before the generator yields it, Task 8's atomic descriptor open must finish before `RUN_FINISHED` becomes observable. If it fails, snapshots may precede the single `RUN_ERROR`, but no interrupt terminal is emitted.

- [ ] **Step 5: Carry rich approval decisions into tool execution**

Change `executeToolCalls` from `Map<string, boolean>` to `ReadonlyMap<string, ToolApprovalResolution>`. Select the authoritative stored original input unless an approved decision contains `editedArgs`; use edits as a complete replacement and validate them before execution. A denial produces one synthetic result:

```ts
if (!decision.approved) {
  results.push({
    toolCallId: toolCall.id,
    toolName,
    result: {
      status: 'denied',
      ...(decision.payload !== undefined && { payload: decision.payload }),
    },
    state: 'output-available',
  })
  continue
}
input = decision.editedArgs === undefined ? input : decision.editedArgs
```

Filter `cancelledToolCallIds` before execution and result construction. Record those call IDs as not-executed in the interrupt audit/provider-history reconstruction path without producing a result chunk. Client-tool resolved output follows the existing result path; generic resolutions remain only in middleware continuation state and create no tool chunk.

- [ ] **Step 6: Make resumed tool output result-only**

Delete the `argsMap` branch that synthesizes `TOOL_CALL_START`, `TOOL_CALL_ARGS`, and `TOOL_CALL_END` in `buildToolResultChunks`. Always emit one `TOOL_CALL_RESULT` for actual approved/client results and synthetic denied results, correlated to the original `toolCallId`. Persist corresponding actual/denied history before the resumed model begins; cancelled calls remain in the interrupt audit record and are excluded from actionable provider history.

- [ ] **Step 7: Emit exactly one structured terminal on gateway failures and replay**

Introduce an internal `InterruptSubmissionFailure` carrying serialized errors/recovery and an `InterruptReplaySignal` carrying the winning continuation ID. In the `TextEngine.run()` catch, call middleware `onError` once, then yield one `RUN_ERROR` for submission failure and return without rethrowing or adding `RUN_FINISHED`:

```ts
if (error instanceof InterruptSubmissionFailure) {
  await this.runInterruptOnErrorOnce(error)
  yield {
    type: EventType.RUN_ERROR,
    threadId: this.middlewareCtx.threadId,
    runId: this.middlewareCtx.runId,
    timestamp: Date.now(),
    message: error.message,
    code: 'INTERRUPT_SUBMISSION_FAILED',
    'tanstack:interruptErrors': error.errors,
    ...(error.recovery && {
      'tanstack:interruptRecovery': error.recovery,
    }),
  }
  return
}
```

For exact replay, emit a successful `RUN_FINISHED` whose standard `result` is canonical JSON `{ "type": "tanstack:interrupt-replay", "continuationRunId": "winning-run" }`; do not execute tools. The client recognizes this result and joins/reloads the winner. `runStreamingText` disposes MCP resources in `finally` but does not translate or duplicate these terminal signals.

- [ ] **Step 8: Run green lifecycle checks and audit legacy emission**

Run:

```powershell
pnpm --filter @tanstack/ai test:lib -- --run tests/interrupts.test.ts tests/chat.test.ts tests/chat-params.test.ts tests/stream-processor.test.ts
pnpm --filter @tanstack/ai test:types
```

Expected: PASS; snapshots precede a nonempty interrupt outcome, continuations use a new run with `parentRunId`, and resumed tools emit results only. Confirm native server paths emit no `approval-requested` or `tool-input-available` custom event; deprecated readers remain tested for old streams.

- [ ] **Step 9: Focused refactor and recheck**

Extract descriptor/binding construction and terminal-error serialization into focused helpers, rerun the same commands, and verify every terminal path calls exactly one of `onFinish`, `onAbort`, or `onError`.

### Task 10: Define and hydrate the typed bound interrupt union

**Prerequisites:** Tasks 2, 3, and 9.

**Files:**
- Create: `packages/ai-client/src/interrupt-manager.ts`
- Modify: `packages/ai-client/src/types.ts:1-110,397-585`
- Modify: `packages/ai-client/src/index.ts`
- Create: `packages/ai-client/tests/chat-client-interrupts.test.ts`
- Create: `packages/ai-client/tests/interrupts-types.test-d.ts`

- [ ] **Step 1: Write failing type and hydration tests before implementation**

Define an approval tool with distinct branches and assert the exact resolver calls:

```ts
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

declare const interrupt: Extract<
  ChatInterrupt<readonly [typeof transfer]>,
  { kind: 'tool-approval'; toolName: 'transfer' }
>

interrupt.resolveInterrupt(true, {
  editedArgs: { cents: 500 },
  payload: { note: 'Reviewed' },
})
interrupt.resolveInterrupt(false, { payload: { reason: 'Policy' } })
// @ts-expect-error rejection never accepts editedArgs
interrupt.resolveInterrupt(false, { editedArgs: { cents: 1 }, payload: { reason: 'Policy' } })
// @ts-expect-error custom data belongs under payload
interrupt.resolveInterrupt(true, { editedArgs: { cents: 1 }, note: 'Reviewed' })

const noInput = toolDefinition({
  name: 'noInput',
  description: 'No editable input',
  needsApproval: true,
}).client()
declare const noInputInterrupt: Extract<
  ChatInterrupt<readonly [typeof noInput]>,
  { kind: 'tool-approval'; toolName: 'noInput' }
>
noInputInterrupt.resolveInterrupt(true)
// @ts-expect-error omitted inputSchema forbids editedArgs
noInputInterrupt.resolveInterrupt(true, { editedArgs: {} })

declare const generic: Extract<
  ChatInterrupt<readonly [typeof transfer]>,
  { kind: 'generic' }
>
generic.resolveInterrupt({ applicationValue: 'runtime-validated' })
```

In `chat-client-interrupts.test.ts`, construct the manager with the literal `transfer` tool and hydrate one descriptor whose metadata binding contains matching `toolCallId`, `interruptedRunId`, `generation`, tool name, and hashes. Clone the case while changing each field independently and assert only the fully matching case becomes `tool-approval`; every mismatch becomes `generic`. Add matching/mismatched client-tool, unknown reason, invalid generic schema, and expired descriptor cases before production code.

- [ ] **Step 2: Run the red client type target**

Run both suites red:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai-client test:types
pnpm --filter @tanstack/ai-client test:lib -- --run tests/chat-client-interrupts.test.ts
```

Expected: FAIL because `ChatInterrupt`, bound variants, `InterruptManager`, and hydration do not exist.

- [ ] **Step 3: Add the public base and mapped union**

Define the public surface in `types.ts` and keep behavior private to the manager:

```ts
export interface BoundInterruptBase<TDraft> {
  id: string
  reason: string
  message?: string
  toolCallId?: string
  responseSchema?: JSONSchema
  expiresAt?: string
  metadata?: Record<string, unknown>
  kind: 'tool-approval' | 'client-tool-execution' | 'generic'
  status: 'pending' | 'validating' | 'staged' | 'submitting' | 'error'
  provenance: 'native' | 'legacy'
  generation: number
  errors: readonly ItemInterruptError[]
  stagedResponse?: TDraft
  clearResolution(): void
  cancelInterrupt(): void
}

export interface GenericAGUIInterrupt extends BoundInterruptBase<
  | { status: 'resolved'; payload: unknown }
  | { status: 'cancelled' }
> {
  kind: 'generic'
  toolName?: never
  resolveInterrupt(payload: unknown): void
}

export type BoundInterrupts<
  TTools extends readonly AnyClientTool[],
> = readonly ChatInterrupt<TTools>[]

declare const noSchema: unique symbol
type NoSchema = typeof noSchema
type InputSchemaOf<TTool> = TTool extends { inputSchema?: infer TSchema }
  ? TSchema extends undefined ? NoSchema : TSchema
  : NoSchema
type OutputSchemaOf<TTool> = TTool extends { outputSchema?: infer TSchema }
  ? TSchema extends undefined ? NoSchema : TSchema
  : NoSchema
type ApproveSchemaOf<TTool> = ApprovalSchemaOf<TTool> extends {
  approve?: infer TSchema
} ? TSchema extends undefined ? NoSchema : TSchema
  : ApprovalSchemaOf<TTool> extends undefined ? NoSchema
  : ApprovalSchemaOf<TTool>
type RejectSchemaOf<TTool> = ApprovalSchemaOf<TTool> extends {
  reject?: infer TSchema
} ? TSchema extends undefined ? NoSchema : TSchema
  : ApprovalSchemaOf<TTool> extends undefined ? NoSchema
  : ApprovalSchemaOf<TTool>
type EditedArgsField<TSchema> = TSchema extends NoSchema
  ? { editedArgs?: never }
  : { editedArgs?: InferSchemaType<TSchema> }
type PayloadField<TSchema> = TSchema extends NoSchema
  ? { payload?: never }
  : TSchema extends JSONSchema
    ? { payload: unknown }
    : undefined extends InferSchemaType<TSchema>
      ? { payload?: InferSchemaType<TSchema> }
      : { payload: InferSchemaType<TSchema> }
type RequiredKeys<T> = {
  [TKey in keyof T]-?: Record<string, never> extends Pick<T, TKey>
    ? never
    : TKey
}[keyof T]
type OptionsTuple<T> = [RequiredKeys<T>] extends [never]
  ? [options?: T]
  : [options: T]

export interface ToolApprovalInterrupt<TTool extends AnyClientTool>
  extends BoundInterruptBase<
    | ({ status: 'resolved'; approved: true } &
        EditedArgsField<InputSchemaOf<TTool>> &
        PayloadField<ApproveSchemaOf<TTool>>)
    | ({ status: 'resolved'; approved: false } &
        PayloadField<RejectSchemaOf<TTool>>)
    | { status: 'cancelled' }
  > {
  kind: 'tool-approval'
  reason: 'tool_call'
  toolName: TTool['name']
  toolCallId: string
  resolveInterrupt(
    approved: true,
    ...options: OptionsTuple<
      EditedArgsField<InputSchemaOf<TTool>> & PayloadField<ApproveSchemaOf<TTool>>
    >
  ): void
  resolveInterrupt(
    approved: false,
    ...options: OptionsTuple<PayloadField<RejectSchemaOf<TTool>>>
  ): void
}

export interface ClientToolExecutionInterrupt<TTool extends AnyClientTool>
  extends BoundInterruptBase<
    | { status: 'resolved'; payload: InferSchemaType<OutputSchemaOf<TTool>> }
    | { status: 'cancelled' }
  > {
  kind: 'client-tool-execution'
  reason: 'tanstack:client_tool_execution'
  toolName: TTool['name']
  toolCallId: string
  resolveInterrupt(output: InferSchemaType<OutputSchemaOf<TTool>>): void
}

type ToolByName<TTools extends readonly AnyClientTool[], TName extends string> =
  Extract<TTools[number], { name: TName }>
type ToolNames<TTools extends readonly AnyClientTool[]> = TTools[number]['name']
type ApprovalNames<TTools extends readonly AnyClientTool[]> = {
  [TName in ToolNames<TTools>]: ApprovalCapabilityOf<
    ToolByName<TTools, TName>
  > extends true ? TName : never
}[ToolNames<TTools>]
type ToolApprovalInterruptsFor<TTools extends readonly AnyClientTool[]> = {
  [TName in ApprovalNames<TTools>]: ToolApprovalInterrupt<ToolByName<TTools, TName>>
}[ApprovalNames<TTools>]
type ClientToolExecutionInterruptsFor<TTools extends readonly AnyClientTool[]> = {
  [TName in ToolNames<TTools>]: ClientToolExecutionInterrupt<ToolByName<TTools, TName>>
}[ToolNames<TTools>]
export type ChatInterrupt<TTools extends readonly AnyClientTool[]> =
  | ToolApprovalInterruptsFor<TTools>
  | ClientToolExecutionInterruptsFor<TTools>
  | GenericAGUIInterrupt
```

Use this contiguous type block verbatim and add the shared/branch/omitted/raw/optional assertions named in Step 1. `OutputSchemaOf<NoSchema>` maps to `unknown` for client-tool execution rather than exposing the private sentinel.

- [ ] **Step 4: Hydrate only trusted known-tool matches**

Create `InterruptManager<TTools>` with injected tools, submit, recovery, state-change, and draft-persistence callbacks. Hydration follows this decision:

```ts
function classifyDescriptor<TTools extends readonly AnyClientTool[]>(
  descriptor: Interrupt,
  registry: ToolRegistry<TTools>,
  correlation: {
    interruptedRunId: string
    generation: number
  },
): HydratedKind<TTools> {
  const binding = readUntrustedDescriptorBinding(descriptor.metadata)
  if (
    descriptor.reason === 'tool_call' &&
    descriptor.toolCallId &&
    binding?.kind === 'tool-approval' &&
    descriptor.toolCallId === binding.toolCallId &&
    binding.interruptedRunId === correlation.interruptedRunId &&
    binding.generation === correlation.generation
  ) {
    const tool = registry.approvalTools.get(binding.toolName)
    if (tool && registry.matchesHashes(tool, binding)) {
      return { kind: 'tool-approval', tool, binding }
    }
  }
  if (
    descriptor.reason === 'tanstack:client_tool_execution' &&
    descriptor.toolCallId &&
    binding?.kind === 'client-tool-execution' &&
    descriptor.toolCallId === binding.toolCallId &&
    binding.interruptedRunId === correlation.interruptedRunId &&
    binding.generation === correlation.generation
  ) {
    const tool = registry.tools.get(binding.toolName)
    if (tool && registry.matchesHashes(tool, binding)) {
      return { kind: 'client-tool-execution', tool, binding }
    }
  }
  return { kind: 'generic' }
}
```

`InterruptManager.hydrate` passes its own authoritative correlation into this function; it never reads the expected run/generation from the descriptor alone. Bind methods to manager/item IDs, compile generic response schemas with Task 1, retain configured Standard Schema validators for known tools, and expose core-cloned/deep-frozen snapshots.

- [ ] **Step 5: Run the already-red hydration tests green**

Run the tests written in Step 1:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai-client test:lib -- --run tests/chat-client-interrupts.test.ts
```

Expected: PASS; forged/mismatched descriptors are generic and an invalid generic schema can only be cancelled.

- [ ] **Step 6: Run green type checks and refactor**

Run:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai-client test:types
pnpm --filter @tanstack/ai-client test:lib -- --run tests/chat-client-interrupts.test.ts
```

Expected: PASS. Extract type helpers (`NoSchema`, branch selectors, required-key tuple) into one contiguous section and registry hashing into one private class; rerun both commands.

### Task 11: Implement staging, callback transactions, bulk operations, and retry

**Prerequisites:** Task 10.

**Files:**
- Modify: `packages/ai-client/src/interrupt-manager.ts`
- Modify: `packages/ai-client/src/types.ts`
- Modify: `packages/ai-client/tests/chat-client-interrupts.test.ts`

- [ ] **Step 1: Add failing state-machine tests**

Cover singleton resolve/cancel auto-submit; three-item wait; replacement; clear; async validator generations; invalid replacement preserving the previous valid draft; submitting mutation rejection; root boolean eligibility; callback visit-once/submit-once; throw/non-`undefined`/thenable/incomplete rollback; late post-await token use; transport frozen retry; mutation invalidating retry; server item/root errors; acceptance removal; and status/error notifications.

Use a deferred async-callback regression:

```ts
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const testTools = [transferTool, auditTool, notificationTool] as const
type TestTools = typeof testTools

function createThreeInterruptManager(options: {
  submit: InterruptManagerOptions<TestTools>['submit']
}) {
  const manager = new InterruptManager({
    tools: testTools,
    submit: options.submit,
    onStateChange: vi.fn(),
  })
  manager.hydrate({
    threadId: 'thread-1',
    interruptedRunId: 'run-old',
    generation: 1,
    descriptors: threeApprovalDescriptors,
  })
  return manager
}

it('invalidates a callback token before a late async item call', async () => {
  const gate = deferred<void>()
  const submit = vi.fn()
  const manager = createThreeInterruptManager({ submit })
  let captured: ChatInterrupt<TestTools> | undefined

  await expect(
    manager.resolveInterrupts(((interrupt: ChatInterrupt<TestTools>) => {
      captured = interrupt
      return gate.promise.then(() => {
        interrupt.cancelInterrupt()
      })
    }) as (interrupt: ChatInterrupt<TestTools>) => undefined),
  ).rejects.toMatchObject({ code: 'async-resolver' })

  gate.resolve()
  await gate.promise
  captured?.cancelInterrupt()
  expect(submit).not.toHaveBeenCalled()
  expect(manager.interruptErrors).toContainEqual(
    expect.objectContaining({ code: 'inactive-transaction' }),
  )
})
```

Define `transferTool`, `auditTool`, and `notificationTool` immediately above this block with literal names and payload-less approval branches. Define `threeApprovalDescriptors` as three native `tool_call` descriptors whose reserved bindings and schema hashes match those tools. `InterruptManagerOptions`, `hydrate`, and `onStateChange` are the concrete public-to-package-private constructor seam established in Task 10; use these exact names in implementation and tests so the fixture does not depend on hidden maps.

- [ ] **Step 2: Run the red state-machine test**

Run:

```powershell
pnpm --filter @tanstack/ai-client test:lib -- --run tests/chat-client-interrupts.test.ts
```

Expected: FAIL because bound methods do not yet stage, gate, roll back, freeze, or retry.

- [ ] **Step 3: Implement synchronous candidate staging with async validation generations**

Item methods return `void`. Each candidate increments an item generation, sets `validating` when a Standard Schema result is thenable, and ignores a result whose captured generation is stale. A valid candidate replaces the draft; an invalid candidate keeps the last valid `stagedResponse`, sets item errors/status, and blocks submission. Cancellation is payloadless and needs no schema validation. `clearResolution` removes draft/errors and returns to pending. Replacement/clear/cancel while submitting throws a non-retryable protocol error.

- [ ] **Step 4: Freeze and submit only a complete valid batch**

Implement one submission gate:

```ts
private maybeSubmit(): void {
  if (this.transaction || this.submission || this.items.size === 0) return
  const items = [...this.items.values()]
  if (items.some((item) => item.status === 'validating' || item.status === 'error')) return
  if (items.some((item) => item.draft === undefined)) return
  const entries = items
    .map((item) => item.draft?.response)
    .filter((entry): entry is RunAgentResumeItem => entry !== undefined)
    .sort((a, b) => a.interruptId.localeCompare(b.interruptId))
  const candidate = canonicalizeInterruptResolutions(entries)
  const frozen = cloneAndDeepFreezeJson({
    generation: this.batchGeneration,
    entries: candidate.resolutions,
    fingerprint: candidate.fingerprint,
    canonicalResolutions: candidate.canonicalResolutions,
  })
  void this.submitFrozenBatch(frozen)
}
```

A singleton reaches this gate after its first valid decision. Multiple items wait for complete coverage. During submission every item is `submitting`. Acceptance removes active descriptors/drafts. A retryable transport/availability failure restores `staged`, retains the exact frozen batch, and appends a root transport/server error.

- [ ] **Step 5: Implement root boolean and synchronous callback transactions**

The boolean overload first verifies every open item is a tool approval and the chosen branch has no required payload; only then stage all and submit once. For callbacks, capture one stable item snapshot, clone all drafts/errors/statuses, install a unique token, suppress auto-submit, and invoke once per item. Require literal runtime return `undefined`; reject thenables and other values. On throw, invalid return, or incomplete coverage, restore the clone, seal the token, increment generation, and start no request. Transaction-scoped item methods check the active token and generation; late calls add `inactive-transaction` without mutation.

- [ ] **Step 6: Implement cancel-all, exact retry, and error mapping**

`cancelInterrupts()` stages payloadless cancellation for the stable full set and submits once. `retryInterrupts()` is allowed only while an intact retryable frozen batch exists. Any edit/clear/cancel after failure increments batch generation, clears the frozen fingerprint and superseded transport error, and disables retry. Map item server errors by `interruptId`; map batch/transport errors only to `interruptErrors`. Expired/stale/conflict results invoke recovery instead of retry.

- [ ] **Step 7: Run green state-machine tests and refactor**

Run:

```powershell
pnpm --filter @tanstack/ai-client test:lib -- --run tests/chat-client-interrupts.test.ts
pnpm --filter @tanstack/ai-client test:types
```

Expected: PASS; one interrupt submits immediately, three wait, callback failures roll back, and late async calls cannot submit. Refactor snapshots, token sealing, and status notifications into focused private helpers and rerun both commands.

### Task 12: Integrate the manager into ChatClient and legacy compatibility

**Prerequisites:** Task 11.

**Files:**
- Modify: `packages/ai-client/src/chat-client.ts:41-146,191-275,510-706,967-1070,1403-1585`
- Modify: `packages/ai-client/src/connection-adapters.ts:353-450,1171-1205`
- Modify: `packages/ai-client/src/types.ts:397-585`
- Modify: `packages/ai-client/src/index.ts`
- Modify: `packages/ai-client/tests/chat-client-interrupts.test.ts`
- Modify: `packages/ai-client/tests/chat-client-resume.test.ts`
- Modify: `packages/ai-client/tests/chat-client-client-tool-status.test.ts`
- Modify: `packages/ai-client/tests/connection-adapters.test.ts`

- [ ] **Step 1: Add failing transport/integration/compatibility tests**

Prove that a native resume sends no messages, uses a fresh run ID with `parentRunId` equal to the interrupted run, parses item/root error extensions, recognizes the replay terminal, and blocks unrelated input. Add legacy approval/custom-tool events and assert one history request with no native resume. Add the sandbox collision case:

```ts
client.processChunk({
  type: EventType.CUSTOM,
  name: 'approval-requested',
  value: { approvalId: 'sandbox-approval', operation: 'process.exec' },
  timestamp: Date.now(),
})
expect(client.getInterrupts()).toEqual([])
```

Also assert `addToolApprovalResponse({ approved: false })` stages a resolved denial, `cancelInterrupt` emits `cancelled`, `addToolResult` delegates to a matching client-tool interrupt, mixed provenance stops, and native server events never cause a legacy follow-up.

- [ ] **Step 2: Run the red integration tests**

Run:

```powershell
pnpm --filter @tanstack/ai-client test:lib -- --run tests/chat-client-interrupts.test.ts tests/chat-client-resume.test.ts tests/chat-client-client-tool-status.test.ts tests/connection-adapters.test.ts
```

Expected: FAIL because ChatClient still owns raw `pendingInterrupts`, reuses the interrupted run ID, and sends compatibility responses directly.

- [ ] **Step 3: Make InterruptManager the single normalized owner**

Replace `private pendingInterrupts` and `pendingInterruptRunId` with one manager. `observeInterruptState` hydrates native outcomes with `{ threadId, interruptedRunId, generation }`; RUN_ERROR extensions flow to manager error/recovery handling. Expose:

```ts
getInterrupts(): BoundInterrupts<TTools>
getInterruptErrors(): readonly InterruptSubmissionError[]
getIsResuming(): boolean

/** @deprecated Use getInterrupts(). Removed in 1.0. */
getPendingInterrupts(): BoundInterrupts<TTools>

resolveInterrupts(
  decisionOrResolver: boolean | ((interrupt: ChatInterrupt<TTools>) => undefined),
): Promise<void>

cancelInterrupts(): Promise<void>
retryInterrupts(): Promise<void>
resumeInterruptsUnsafe(
  entries: readonly RunAgentResumeItem[],
  state?: ChatResumeState,
): Promise<void>

/** @deprecated Use resumeInterruptsUnsafe(). Removed in 1.0. */
resumeInterrupts(
  entries: readonly RunAgentResumeItem[],
  state?: ChatResumeState,
): Promise<boolean>
```

Add one immutable state notification so frameworks never compose three independently timed reads:

```ts
export interface ChatInterruptState<TTools extends readonly AnyClientTool[]> {
  interrupts: BoundInterrupts<TTools>
  interruptErrors: readonly InterruptSubmissionError[]
  isResuming: boolean
}

onInterruptStateChange?: (
  state: ChatInterruptState<TTools>,
) => void
```

Emit it after every hydration, draft/error/status transition, submission start/end, recovery replacement, reset, and disposal. `getInterrupts`, `getInterruptErrors`, and `getIsResuming` return the exact current immutable snapshot fields.

Create one fresh deeply frozen `BoundInterrupts<TTools>` array per notification. `getInterrupts()`, deprecated `getPendingInterrupts()`, hook `interrupts`, and hook `pendingInterrupts` all return that exact array object. Do not maintain a second raw descriptor store or project legacy DTOs into the deprecated alias.

- [ ] **Step 4: Send continuations with new run correlation**

When manager submits a native batch, generate a new run ID, keep the same thread, set `parentRunId` to the interrupted run, send the complete `resume` array, and send `[]` messages. `resumeInterruptsUnsafe` uses the same correlation/submission path but accepts raw entries. Keep expiry, exact set, server validation, and CAS enforced.

- [ ] **Step 5: Handle replay and structured failures**

Parse `tanstack:interruptErrors` and `tanstack:interruptRecovery` from RUN_ERROR. For a committed recovery DTO or canonical interrupt-replay result, attach only to the winning continuation:

```ts
private async attachWinningContinuation(
  threadId: string,
  continuationRunId: string,
): Promise<void> {
  const controller = new AbortController()
  const chunks =
    this.connection && 'joinRun' in this.connection
      ? this.connection.joinRun(continuationRunId, controller.signal)
      : this.options.continuationLoader
        ? this.options.continuationLoader(
            { threadId, continuationRunId },
            { signal: controller.signal },
          )
        : undefined
  if (!chunks) {
    this.interruptManager.quarantineForRecovery({
      code: 'recovery-unavailable',
      message: 'The winning continuation cannot be joined by this client.',
      continuationRunId,
    })
    return
  }
  await this.consumeReadOnlyContinuation(chunks, continuationRunId)
}

private processIncomingChunk(chunk: StreamChunk): void {
  this.callbacksRef.current.onChunk(chunk)
  this.devtoolsBridge.observeChunk(chunk)
  this.processor.processChunk(chunk)
  this.updateRunLifecycle(chunk)
  this.observeInterruptState(chunk)
}

private async consumeReadOnlyContinuation(
  chunks: AsyncIterable<StreamChunk>,
  continuationRunId: string,
): Promise<void> {
  for await (const chunk of chunks) {
    const chunkRunId = getChunkRunId(chunk)
    if (chunkRunId !== undefined && chunkRunId !== continuationRunId) {
      throw new Error('Continuation loader returned a different run.')
    }
    this.processIncomingChunk(chunk)
  }
}
```

Replace the duplicated incoming-chunk statements in the existing connect/subscription loops with `processIncomingChunk(chunk)`. The read-only loader never calls `connect`, `sendMessage`, `reload`, the model endpoint, or the interrupt recovery loader. Tests provide a non-resumable connection plus a spy `continuationLoader`, assert the loader receives the stored winning ID, and assert no new model run is scheduled. A client with neither `joinRun` nor `continuationLoader` remains quarantined with `recovery-unavailable`.

- [ ] **Step 6: Normalize legacy readers without a dual writer**

Recognize legacy `approval-requested` only when its value has `toolCallId`, `toolName`, and `approval: { id, needsApproval: true }`; recognize `tool-input-available` only with its full historical tool shape. This prevents sandbox's path-only approval event from colliding. Hydrate `provenance: 'legacy'` and reject edits, custom payloads, generic responses, native cancellation, expiry, and conflict recovery as `legacy-unsupported`.

When all legacy items are covered, clone current message history, update every matching approval/result part in the clone, and send one follow-up history request with no `resume`. On construction failure, change no live message. On transport failure, keep staged responses and report `legacy-submit-failed`. Reject mixed native/legacy sets before any mutation.

- [ ] **Step 7: Deprecate approval APIs and preserve client-tool results**

Add removal-at-1.0 JSDoc to `addToolApprovalResponse`, `pendingInterrupts`/`getPendingInterrupts`, raw `resumeInterrupts`, and legacy custom-event reader types. Implement `addToolApprovalResponse` by finding the bound item and calling `resolveInterrupt(response.approved)`; false is denial, not cancellation. Implement old `resumeInterrupts` as a compatibility wrapper over `resumeInterruptsUnsafe` while retaining its historical return type. Keep `addToolResult` supported and delegate to `resolveInterrupt(output)` for a matching native client-tool item or the legacy history backend for an old event.

- [ ] **Step 8: Run green integration checks and refactor**

Run:

```powershell
pnpm --filter @tanstack/ai-client test:lib -- --run tests/chat-client-interrupts.test.ts tests/chat-client-resume.test.ts tests/chat-client-client-tool-status.test.ts tests/connection-adapters.test.ts
pnpm --filter @tanstack/ai-client test:types
```

Expected: PASS; native continuation context has a new run ID/old parent, denial and cancellation differ, sandbox events do not hydrate, and `addToolResult` remains supported. Remove duplicated approval batching logic from ChatClient and rerun both commands.

### Task 13: Persist raw V2 drafts and recover through explicit adapters

**Prerequisites:** Tasks 11 and 12.

**Files:**
- Modify: `packages/ai-client/src/chat-persistence-controller.ts`
- Modify: `packages/ai-client/src/connection-adapters.ts:353-450,574-700,1171-1205`
- Modify: `packages/ai-client/src/types.ts:18-110,397-435`
- Modify: `packages/ai-client/src/chat-client.ts:250-275,485-520,698-706,1393-1410`
- Modify: `packages/ai-client/src/index.ts`
- Modify: `packages/ai-client/tests/chat-persistence-controller.test.ts`
- Modify: `packages/ai-client/tests/chat-client-resume.test.ts`
- Modify: `packages/ai-client/tests/connection-adapters.test.ts`

- [ ] **Step 1: Add failing V1/V2 reconciliation and recovery tests**

Test a partial one-of-three draft reload, V1 migration, mismatched thread/run/generation/ID/schema hash, expiry, committed winner, accepted tombstone after failed removal, reset/dispose stale-write suppression, event-extension recovery, fallback fetch, unauthorized/newer generation checks, and no-loader quarantine.

Use an assertion that persisted values contain no functions or hydrated fields:

```ts
const stored = JSON.parse(JSON.stringify(resumeAdapter.setItem.mock.calls.at(-1)?.[1]))
expect(stored.schemaVersion).toBe(2)
expect(stored.interruptState.drafts).toHaveLength(1)
expect(JSON.stringify(stored)).not.toContain('resolveInterrupt')
expect(JSON.stringify(stored)).not.toContain('errors')
expect(JSON.stringify(stored)).not.toContain('kind')
```

- [ ] **Step 2: Run the red durability tests**

Run:

```powershell
pnpm --filter @tanstack/ai-client test:lib -- --run tests/chat-client-resume.test.ts tests/chat-persistence-controller.test.ts tests/connection-adapters.test.ts
```

Expected: FAIL because snapshots are unversioned, store raw pending descriptors only, and no recovery loader exists.

- [ ] **Step 3: Define the raw V2 snapshot and V1 migration**

Add the exact JSON DTO:

```ts
export interface ChatResumeSnapshotV2 {
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

Treat the PR-head unversioned `{ resumeState, pendingInterrupts }` shape as V1. Convert it to V2 generation `0`, native descriptors, no drafts, and `requiresRecovery: true` internally. Remove invalid/unrelatable V1 storage and report a root protocol error. Never serialize methods, validators, configured tools, kind, or error objects.

- [ ] **Step 4: Reconcile drafts only after authoritative recovery**

On native hydration, call recovery before binding. Accept only matching `(threadId, interruptedRunId)` and a generation not older than local. For `pending`, bind returned descriptors against the current tool registry, then retain a draft only when generation, interrupt ID, canonical response-schema hash, and expiry all match. For `committed`, clear drafts and attach/join the winning continuation. For `expired`, `missing`, and `legacy-committed`, clear unsafe retry state and expose the specified non-retryable error. Without extension or loader, quarantine drafts, disable submission, and expose `recovery-unavailable`.

- [ ] **Step 5: Add explicit connection and fetcher recovery contracts**

Extend connection adapters with an optional method:

```ts
export interface InterruptRecoveryConnection {
  loadInterruptState(
    input: InterruptRecoveryQuery,
    options: { signal: AbortSignal },
  ): Promise<InterruptRecoveryStateV1>
}

export type InterruptContinuationLoader = (
  input: {
    threadId: string
    continuationRunId: string
  },
  options: { signal: AbortSignal },
) => AsyncIterable<StreamChunk>
```

Add `interruptStateFetcher?: InterruptStateFetcher` and `continuationLoader?: InterruptContinuationLoader` beside `fetcher` in fetcher mode. Provide explicit helpers that require caller-supplied URLs:

```ts
export function createInterruptStateFetcher(
  url: string | (() => string),
  options: FetchConnectionOptions = {},
): InterruptStateFetcher {
  return async (input, { signal }) => {
    const response = await (options.fetchClient ?? fetch)(
      typeof url === 'function' ? url() : url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...mergeHeaders(options.headers) },
        credentials: options.credentials ?? 'same-origin',
        signal,
        body: JSON.stringify(input),
      },
    )
  if (!response.ok) throw new Error(`Interrupt recovery failed: ${response.status}`)
  return parseInterruptRecoveryState(await response.json())
  }
}

export function createInterruptContinuationLoader(
  url: string | (() => string),
  options: FetchConnectionOptions = {},
): InterruptContinuationLoader {
  return async function* loadContinuation(input, { signal }) {
    const requestUrl = withSearchParams(
      typeof url === 'function' ? url() : url,
      {
        runId: input.continuationRunId,
        offset: '-1',
      },
    )
    yield* resumableServerSentEvents(
      options.fetchClient ?? fetch,
      requestUrl,
      {
        method: 'GET',
        headers: mergeHeaders(options.headers),
        credentials: options.credentials ?? 'same-origin',
      },
      signal,
    )
  }
}
```

Implement `parseInterruptRecoveryState(value: unknown)` beside the fetcher with explicit object, version, state, correlation, generation, descriptor, and committed-shape checks; it returns `InterruptRecoveryStateV1` only after narrowing and throws a protocol error otherwise. `mergeHeaders`, `withSearchParams`, and `resumableServerSentEvents` are existing functions in this module. `fetchServerSentEvents` already provides `joinRun`; raw-stream/fetcher adapters expose only explicitly supplied `loadInterruptState` and `continuationLoader`. They never derive either path from the chat URL, and continuation loading is always a read-only GET of the winning run.

- [ ] **Step 6: Write accepted tombstones before cleanup**

After acceptance, remove active descriptors/drafts, persist `{ phase: 'accepted', continuationRunId, drafts: [] }`, then queue `removeItem`. If removal fails, the tombstone prevents stale pending UI on reload and cleanup retries after authoritative committed recovery. Thread reset and controller disposal increment generations so old async reads/writes cannot restore state.

- [ ] **Step 7: Run green durability checks and refactor**

Run:

```powershell
pnpm --filter @tanstack/ai-client test:lib -- --run tests/chat-client-interrupts.test.ts tests/chat-client-resume.test.ts tests/chat-persistence-controller.test.ts tests/connection-adapters.test.ts
pnpm --filter @tanstack/ai-client test:types
```

Expected: PASS; one draft survives a safe reload, drifted drafts are removed, committed state attaches to the winning run, and no URL is guessed. Extract V1 parsing, V2 cloning, and reconciliation predicates into pure functions and rerun both commands.

### Task 14: Write every framework behavior and type contract red

**Prerequisites:** Tasks 12 and 13. This task changes tests only; no framework source or public type is modified until every runtime and type suite has failed for the intended missing API.

**Files:**

- Modify: `packages/ai-react/tests/use-chat.test.ts`
- Modify: `packages/ai-react/tests/use-chat-types.test.ts`
- Modify: `packages/ai-preact/tests/use-chat.test.ts`
- Modify: `packages/ai-preact/tests/use-chat-types.test.ts`
- Modify: `packages/ai-solid/tests/use-chat.test.ts`
- Modify: `packages/ai-solid/tests/use-chat-types.test.ts`
- Modify: `packages/ai-vue/tests/use-chat.test.ts`
- Modify: `packages/ai-vue/tests/use-chat-types.test.ts`
- Modify: `packages/ai-svelte/tests/use-chat.test.ts`
- Modify: `packages/ai-svelte/tests/create-chat-types.test.ts`
- Modify: `packages/ai-angular/tests/inject-chat.test.ts`
- Modify: `packages/ai-angular/tests/inject-chat-types.test.ts`

- [ ] **Step 1: Write the bound-state behavior contract in all six runtime suites**

In each framework test utility, capture the `ChatClientOptions.onInterruptStateChange` callback and return root spies for `resolveInterrupts`, `cancelInterrupts`, `retryInterrupts`, and `resumeInterruptsUnsafe`. The callback accepts one `ChatInterruptState<TTools>` object. Use two bound items so calling one synchronous item resolver cannot represent the singleton auto-submit case:

```ts
it('reactively projects immutable interrupt state and delegates root methods', async () => {
  const { result } = renderHook(() => useChat({ tools: [transferTool] }))
  const first = createBoundToolInterrupt({
    id: 'approval-1',
    status: 'staged',
    stagedResponse: {
      status: 'resolved',
      approved: true,
      editedArgs: { amount: 10 },
    },
  })
  const second = createBoundToolInterrupt({
    id: 'approval-2',
    status: 'pending',
  })
  const staged: ChatInterruptState<readonly [typeof transferTool]> = {
    interrupts: Object.freeze([first, second]),
    interruptErrors: [],
    isResuming: false,
  }
  act(() => chatClientCallbacks.onInterruptStateChange?.(staged))

  expect(result.current.interrupts).toBe(staged.interrupts)
  expect(result.current.pendingInterrupts).toBe(staged.interrupts)
  expect(result.current.interrupts[0]?.resolveInterrupt(true)).toBeUndefined()
  expect(first.resolveInterrupt).toHaveBeenCalledWith(true)

  const invalid = createBoundToolInterrupt({
    id: 'approval-1',
    status: 'error',
    stagedResponse: first.stagedResponse,
    errors: [
      itemError('approval-1', 'invalid-edited-args', ['amount']),
    ],
  })
  const transport = batchError('transport', ['approval-1', 'approval-2'])
  const failed: ChatInterruptState<readonly [typeof transferTool]> = {
    interrupts: Object.freeze([invalid, second]),
    interruptErrors: [transport],
    isResuming: true,
  }
  act(() => chatClientCallbacks.onInterruptStateChange?.(failed))
  expect(result.current.interrupts[0]?.status).toBe('error')
  expect(result.current.interrupts[0]?.errors).toEqual(invalid.errors)
  expect(result.current.interruptErrors).toEqual([transport])
  expect(result.current.isResuming).toBe(true)

  const resolver = (item: ChatInterrupt<readonly [typeof transferTool]>) => {
    item.cancelInterrupt()
    return undefined
  }
  await act(() => result.current.resolveInterrupts(resolver))
  expect(chatClientRootSpies.resolveInterrupts).toHaveBeenCalledWith(resolver)
  expect(resolver(second)).toBeUndefined()
  await act(() => result.current.cancelInterrupts())
  await act(() => result.current.retryInterrupts())
  expect(chatClientRootSpies.cancelInterrupts).toHaveBeenCalledOnce()
  expect(chatClientRootSpies.retryInterrupts).toHaveBeenCalledOnce()
})
```

Define `transferTool` with `toolDefinition({ name: 'transfer', needsApproval: true, inputSchema: z.object({ amount: z.number() }) })`. The test-only `createBoundToolInterrupt`, `itemError`, and `batchError` functions return fully correlated frozen public DTOs; their bound methods are `vi.fn<() => void>()`. They live in each package's existing `tests/test-utils.ts`, not in production. React and Preact use the displayed `renderHook`/their imported `act`; Solid reads `result.current.interrupts()`; Vue reads `result.current.interrupts.value` after `flushPromises()`; Svelte reads `chat.interrupts` after `await tick()`; Angular reads `result.interrupts()` after `TestBed.flushEffects()`. Each file performs every displayed identity, status, error, draft, root-error, and root-spy assertion with that exact native accessor.

- [ ] **Step 2: Add branch-aware type failures to all six type suites**

In each type-test file define this local tool and run the assertions against that framework's public result:

```ts
const transferTool = toolDefinition({
  name: 'transfer',
  description: 'Transfer funds',
  inputSchema: z.object({ amount: z.number(), recipient: z.string() }),
  needsApproval: true,
  approvalSchema: {
    approve: z.object({ note: z.string() }),
    reject: z.object({ reason: z.string() }),
  },
})
const tools = [transferTool] as const

function assertInterruptTypes(
  interrupt: ChatInterrupt<readonly [typeof transferTool]> | undefined,
): void {
  if (!interrupt) return
  if (interrupt.kind === 'tool-approval' && interrupt.toolName === 'transfer') {
    interrupt.resolveInterrupt(true, {
      editedArgs: { amount: 12, recipient: 'Ada' },
      payload: { note: 'Reviewed' },
    })
    interrupt.resolveInterrupt(false, {
      payload: { reason: 'Limit exceeded' },
    })
    // @ts-expect-error approval cannot use the rejection payload
    interrupt.resolveInterrupt(true, { payload: { reason: 'wrong branch' } })
    // @ts-expect-error editedArgs preserve the input schema
    interrupt.resolveInterrupt(true, {
      editedArgs: { amount: '12', recipient: 'Ada' },
      payload: { note: 'Reviewed' },
    })
    // @ts-expect-error rejection never accepts editedArgs
    interrupt.resolveInterrupt(false, {
      editedArgs: { amount: 12, recipient: 'Ada' },
      payload: { reason: 'No' },
    })
  }
  if (interrupt.kind === 'generic') {
    type GenericPayload = Parameters<typeof interrupt.resolveInterrupt>[0]
    expectTypeOf<GenericPayload>().toEqualTypeOf<unknown>()
    interrupt.resolveInterrupt({ applicationValue: 'runtime validated' })
  }
}
```

Call `assertInterruptTypes` with these exact public expressions: React `renderHook(() => useChat({ tools })).result.current.interrupts[0]`; Preact `renderHook(() => useChat({ tools })).result.current.interrupts[0]`; Solid `useChat({ tools }).interrupts()[0]` inside its existing root; Vue `useChat({ tools }).interrupts.value[0]` inside its effect scope; Svelte `createChat({ tools }).interrupts[0]` inside its rune fixture; Angular `injectChat({ tools }).interrupts()[0]` inside its injection context.

- [ ] **Step 3: Run all twelve framework suites red**

Run sequentially to cap native Windows memory use:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai-react test:lib -- --run tests/use-chat.test.ts
pnpm --filter @tanstack/ai-react test:types
pnpm --filter @tanstack/ai-preact test:lib -- --run tests/use-chat.test.ts
pnpm --filter @tanstack/ai-preact test:types
pnpm --filter @tanstack/ai-solid test:lib -- --run tests/use-chat.test.ts
pnpm --filter @tanstack/ai-solid test:types
pnpm --filter @tanstack/ai-vue test:lib -- --run tests/use-chat.test.ts
pnpm --filter @tanstack/ai-vue test:types
pnpm --filter @tanstack/ai-svelte test:lib -- --run tests/use-chat.test.ts
pnpm --filter @tanstack/ai-svelte test:types
pnpm --filter @tanstack/ai-angular test:lib -- --run tests/inject-chat.test.ts
pnpm --filter @tanstack/ai-angular test:types
```

Expected: all runtime and type suites FAIL because `interrupts`, `resolveInterrupts`, `cancelInterrupts`, `retryInterrupts`, `interruptErrors`, `isResuming`, `resumeInterruptsUnsafe`, and branch-specific inference are not exposed. Save the failing command/output in the task transcript; do not modify framework source in Task 14.

- [ ] **Step 4: Confirm the red commit boundary**

Run `git diff --name-only` and confirm Task 14 changed only the twelve named runtime/type test files and the six existing test-utility files. Do not commit. Framework source and public type declarations remain untouched until Task 15, so every type-red assertion predates the implementation it drives.

### Task 15: Implement reactive and typed framework parity

**Prerequisites:** Task 14.

**Files:**

- Modify: `packages/ai-react/src/use-chat.ts:52,87-212,426-444`
- Modify: `packages/ai-react/src/types.ts:102-173`
- Modify: `packages/ai-preact/src/use-chat.ts:51,86-190,349-367`
- Modify: `packages/ai-preact/src/types.ts:102-173`
- Modify: `packages/ai-solid/src/use-chat.ts:60-70,83-166,323-344`
- Modify: `packages/ai-solid/src/types.ts:8-76,138-159`
- Modify: `packages/ai-vue/src/use-chat.ts:60-64,83-162,328-349`
- Modify: `packages/ai-vue/src/types.ts:116-159`
- Modify: `packages/ai-svelte/src/create-chat.svelte.ts:79-82,98-178,333-376`
- Modify: `packages/ai-svelte/src/types.ts:116-161`
- Modify: `packages/ai-angular/src/inject-chat.ts:57-65,75-114,250-268`
- Modify: `packages/ai-angular/src/types.ts:98-141`

- [ ] **Step 1: Add the public generic control fields**

Import all interrupt types from `@tanstack/ai-client` and add this shape to each framework return type:

```ts
export interface InterruptControls<TTools extends readonly AnyClientTool[]> {
  interrupts: BoundInterrupts<TTools>
  /** @deprecated Use `interrupts`. Removed in 1.0. */
  pendingInterrupts: BoundInterrupts<TTools>
  resolveInterrupts: ResolveInterrupts<TTools>
  cancelInterrupts(): Promise<void>
  retryInterrupts(): Promise<void>
  interruptErrors: readonly InterruptSubmissionError[]
  isResuming: boolean
  resumeInterruptsUnsafe(
    entries: readonly RunAgentResumeItem[],
    state?: ChatResumeState,
  ): Promise<void>
  /** @deprecated Use a bound resolver. Removed in 1.0. */
  addToolApprovalResponse(response: {
    id: string
    approved: boolean
  }): Promise<void>
  /** @deprecated Use `resumeInterruptsUnsafe`. Removed in 1.0. */
  resumeInterrupts(
    entries: readonly RunAgentResumeItem[],
    state?: ChatResumeState,
  ): Promise<boolean>
}
```

React/Preact expose the plain fields. Solid wraps `interrupts`, `pendingInterrupts`, `interruptErrors`, and `isResuming` in accessors. Vue uses readonly refs, Svelte uses getters, and Angular uses readonly signals. Root methods remain functions in every package. No framework declares its own interrupt conditional type.

- [ ] **Step 2: Wire React in the existing instance-holder order**

Place state before `useMemo`, put the callback inside the existing `new ChatClient` options after `getActiveInstance` exists, and synchronize after the instance is active:

```ts
const [interruptState, setInterruptState] = useState<
  ChatInterruptState<TTools>
>(() => ({
  interrupts: Object.freeze([]),
  interruptErrors: Object.freeze([]),
  isResuming: false,
}))

const syncInterruptState = useCallback((target: ChatClient<TTools, TContext>) => {
  setInterruptState(target.getInterruptState())
}, [])

// Inside the existing useMemo, immediately after getActiveInstance:
const handleInterruptStateChange = (next: ChatInterruptState<TTools>) => {
  if (!getActiveInstance()) return
  setInterruptState(next)
  optionsRef.current.onInterruptStateChange?.(next)
}

// Inside the existing new ChatClient options, beside onResumeStateChange:
onInterruptStateChange: handleInterruptStateChange,

useEffect(() => {
  syncInterruptState(client)
}, [client, syncInterruptState])

const resolveInterrupts = useCallback<ResolveInterrupts<TTools>>(
  (decisionOrResolver) => client.resolveInterrupts(decisionOrResolver),
  [client],
)
const cancelInterrupts = useCallback(() => client.cancelInterrupts(), [client])
const retryInterrupts = useCallback(() => client.retryInterrupts(), [client])
const resumeInterruptsUnsafe = useCallback(
  (entries: readonly RunAgentResumeItem[], state?: ChatResumeState) =>
    client.resumeInterruptsUnsafe(entries, state),
  [client],
)
```

Keep the existing `instanceHolder.current = instance` and `activeClientRef.current = instance` assignments before the memo returns. Add `syncInterruptState` to the memo dependency list. Return `interrupts: interruptState.interrupts` and `pendingInterrupts: interruptState.interrupts`, preserving exact array identity.

- [ ] **Step 3: Wire Preact, Solid, Vue, Svelte, and Angular with concrete native state**

In Preact, add the callback to its existing constructor closure and set the initial snapshot in the existing post-construction effect:

```ts
const [interruptState, setInterruptState] = useState<ChatInterruptState<TTools>>({
  interrupts: Object.freeze([]),
  interruptErrors: Object.freeze([]),
  isResuming: false,
})
// inside the existing new ChatClient options:
onInterruptStateChange: (next) => {
  if (activeClientRef.current !== instance) return
  setInterruptState(next)
  optionsRef.current.onInterruptStateChange?.(next)
},
// inside the existing useEffect([client]):
setInterruptState(client.getInterruptState())
```

In Solid, add one signal before `createMemo`, update it in the constructor callback, and initialize it after `client()` exists:

```ts
const [interruptState, setInterruptState] =
  createSignal<ChatInterruptState<TTools>>({
    interrupts: Object.freeze([]),
    interruptErrors: Object.freeze([]),
    isResuming: false,
  })
// inside new ChatClient:
onInterruptStateChange: (next) => {
  setInterruptState(next)
  options.onInterruptStateChange?.(next)
},
setInterruptState(client().getInterruptState())
const resolveInterrupts: ResolveInterrupts<TTools> = (value) =>
  client().resolveInterrupts(value)
```

In Vue, Svelte, and Angular use these exact declarations/callbacks:

```ts
// Vue
const interruptState = shallowRef<ChatInterruptState<TTools>>({
  interrupts: Object.freeze([]),
  interruptErrors: Object.freeze([]),
  isResuming: false,
})
// in new ChatClient:
onInterruptStateChange: (next) => {
  interruptState.value = next
  options.onInterruptStateChange?.(next)
},
interruptState.value = client.getInterruptState()

// Svelte
let interruptState = $state<ChatInterruptState<TTools>>({
  interrupts: Object.freeze([]),
  interruptErrors: Object.freeze([]),
  isResuming: false,
})
// in new ChatClient:
onInterruptStateChange: (next) => {
  interruptState = next
  options.onInterruptStateChange?.(next)
},
interruptState = client.getInterruptState()

// Angular
const interruptState = signal<ChatInterruptState<TTools>>({
  interrupts: Object.freeze([]),
  interruptErrors: Object.freeze([]),
  isResuming: false,
})
// in new ChatClient:
onInterruptStateChange: (next) => {
  interruptState.set(next)
  options.onInterruptStateChange?.(next)
},
interruptState.set(client.getInterruptState())
```

For each constructor, add `onInterruptStateChange` beside the existing `onResumeStateChange`; preserve every existing callback. Delegate `resolveInterrupts`, `cancelInterrupts`, `retryInterrupts`, and `resumeInterruptsUnsafe` directly to that package's existing `client`/`client()`. Vue returns `readonly(interruptState)` projections, Svelte getters return fields from `interruptState`, and Angular uses `computed(() => interruptState().interrupts)`; deprecated `pendingInterrupts` reads the identical field in all cases.

- [ ] **Step 4: Run all runtime and type suites green**

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai-react test:lib -- --run tests/use-chat.test.ts
pnpm --filter @tanstack/ai-react test:types
pnpm --filter @tanstack/ai-preact test:lib -- --run tests/use-chat.test.ts
pnpm --filter @tanstack/ai-preact test:types
pnpm --filter @tanstack/ai-solid test:lib -- --run tests/use-chat.test.ts
pnpm --filter @tanstack/ai-solid test:types
pnpm --filter @tanstack/ai-vue test:lib -- --run tests/use-chat.test.ts
pnpm --filter @tanstack/ai-vue test:types
pnpm --filter @tanstack/ai-svelte test:lib -- --run tests/use-chat.test.ts
pnpm --filter @tanstack/ai-svelte test:types
pnpm --filter @tanstack/ai-angular test:lib -- --run tests/inject-chat.test.ts
pnpm --filter @tanstack/ai-angular test:types
```

Expected: every command PASS; each `@ts-expect-error` is consumed, generic payload is `unknown`, callbacks observe staged/error/replaced states, root callback side effects return `undefined`, and `pendingInterrupts === interrupts` in plain-value packages (or their unwrapped values are strictly equal in reactive packages).

### Task 16: Exercise the full interrupt lifecycle in a deterministic browser fixture

**Prerequisites:** Tasks 5-9 and 13-15.

**Files:**

- Create: `testing/e2e/src/lib/interrupts-v2-fixture.ts`
- Create: `testing/e2e/src/routes/api.interrupts-v2.ts`
- Create: `testing/e2e/src/routes/api.interrupts-v2.recovery.ts`
- Create: `testing/e2e/src/routes/interrupts-v2.tsx`
- Create: `testing/e2e/tests/interrupts.spec.ts`
- Modify (generated by the router command): `testing/e2e/src/routeTree.gen.ts`

- [ ] **Step 1: Write the browser scenarios against stable selectors**

Create one serial `interrupts.spec.ts` describe block only where a test deliberately shares a thread; all unrelated tests retain Playwright's normal parallelism and use a unique ID:

```ts
import { expect, test } from '@playwright/test'

function interruptUrl(testId: string, scenario: string): string {
  const search = new URLSearchParams({ testId, scenario })
  return `/interrupts-v2?${search.toString()}`
}

test('waits for all three cards before one atomic submission', async ({ page }) => {
  const testId = `interrupts-v2-batch-${test.info().workerIndex}-${Date.now()}`
  await page.goto(interruptUrl(testId, 'three-tool-approvals'))
  await page.getByTestId('start-run').click()
  await expect(page.getByTestId('interrupt-card')).toHaveCount(3)

  await page.getByTestId('interrupt-card').nth(0).getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByTestId('continuation-count')).toHaveText('0')
  await page.getByTestId('interrupt-card').nth(1).getByRole('button', { name: 'Deny' }).click()
  await expect(page.getByTestId('continuation-count')).toHaveText('0')
  await page.getByTestId('interrupt-card').nth(2).getByRole('button', { name: 'Cancel' }).click()

  await expect(page.getByTestId('continuation-count')).toHaveText('1')
  await expect(page.getByTestId('submitted-decisions')).toHaveText(
    'approve,deny,cancel',
  )
})
```

Add the singleton omitted/edit, mixed audit history, reload, race, and payloadless scenarios with selectors for decision, staged status, continuation count, result-only event names, and stored history. Add these four tests verbatim for the previously ambiguous cases:

```ts
test('root callback performs synchronous side effects and returns undefined', async ({ page }) => {
  const testId = `interrupt-callback-${test.info().workerIndex}-${Date.now()}`
  await page.goto(interruptUrl(testId, 'heterogeneous-callback'))
  await page.getByTestId('start-run').click()
  await expect(page.getByTestId('interrupt-card')).toHaveCount(3)
  await page.getByTestId('resolve-callback').click()
  await expect(page.getByTestId('callback-return-values')).toHaveText(
    'undefined,undefined,undefined',
  )
  await expect(page.getByTestId('continuation-count')).toHaveText('1')
  await expect(page.getByTestId('submitted-decisions')).toHaveText(
    'approve,deny,generic',
  )
})

test('shows every item error and the root aggregate in one response', async ({ page }) => {
  const testId = `interrupt-errors-${test.info().workerIndex}-${Date.now()}`
  await page.goto(interruptUrl(testId, 'two-invalid'))
  await page.getByTestId('start-run').click()
  await page.getByTestId('invalid-first').click()
  await page.getByTestId('invalid-second').click()
  await expect(page.getByTestId('interrupt-error-first')).toContainText(
    'invalid-edited-args',
  )
  await expect(page.getByTestId('interrupt-error-second')).toContainText(
    'invalid-payload',
  )
  await expect(page.getByTestId('interrupt-errors-root')).toContainText(
    'item-validation-failed',
  )
  await expect(page.getByTestId('interrupt-errors-root')).toContainText(
    'approval-1,question-1',
  )
  await page.getByTestId('correct-first').click()
  await expect(page.getByTestId('interrupt-error-first')).toHaveText('')
  await expect(page.getByTestId('interrupt-error-second')).toContainText(
    'invalid-payload',
  )
  await page.getByTestId('correct-second').click()
  await expect(page.getByTestId('continuation-count')).toHaveText('1')
})

test('joins the original continuation after a committed response is truncated', async ({
  page,
  request,
}) => {
  const testId = `interrupt-retry-${test.info().workerIndex}-${Date.now()}`
  await page.goto(interruptUrl(testId, 'commit-then-truncate'))
  await page.getByTestId('start-run').click()
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByTestId('retry-banner')).toBeVisible()
  const committed = await request.get(
    `/api/interrupts-v2?testId=${encodeURIComponent(testId)}&stats=1`,
  )
  expect(await committed.json()).toMatchObject({
    continuationCount: 1,
    continuationRunIds: [expect.any(String)],
    truncatedResponses: 1,
  })
  await page.getByTestId('retry-interrupts').click()
  await expect(page.getByTestId('continuation-count')).toHaveText('1')
  const replayed = await request.get(
    `/api/interrupts-v2?testId=${encodeURIComponent(testId)}&stats=1`,
  )
  const replayStats = await replayed.json()
  expect(replayStats).toMatchObject({
    continuationCount: 1,
    replayCount: 1,
    truncatedResponses: 1,
  })
  expect(replayStats.joinedContinuationRunId).toBe(
    replayStats.continuationRunIds[0],
  )
})

test('keeps client-tool execution typed, visible, and resolvable by its bound method', async ({
  page,
}) => {
  const testId = `interrupt-client-tool-${test.info().workerIndex}-${Date.now()}`
  await page.goto(interruptUrl(testId, 'client-tool-and-approval'))
  await page.getByTestId('start-run').click()
  await expect(
    page.getByTestId('interrupt-kind-client-tool-execution'),
  ).toHaveCount(1)
  await expect(page.getByTestId('interrupt-kind-tool-approval')).toHaveCount(1)
  await page.getByTestId('resolve-client-tool-bound').click()
  await expect(page.getByTestId('client-tool-status')).toHaveText('staged')
  await page.getByTestId('approve-server-tool').click()
  await expect(page.getByTestId('continuation-count')).toHaveText('1')
  await expect(page.getByTestId('client-tool-output')).toHaveText(
    '{"browserValue":"done"}',
  )
})
```

The retry scenario does not abort the request before the server sees it. The route consumes the first resume through authoritative commit and continuation scheduling, then intentionally returns a truncated stream once. The second request is an exact replay and the client joins the stored continuation ID.

- [ ] **Step 2: Run the focused E2E test red**

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai-e2e test:e2e -- tests/interrupts.spec.ts
```

Expected: FAIL because `/interrupts-v2`, its chat endpoint, its recovery endpoint, and all stable selectors do not exist.

- [ ] **Step 3: Build a deterministic adapter and per-test authoritative store**

In `interrupts-v2-fixture.ts`, create a synthetic `AnyTextAdapter` that emits exact AG-UI chunks rather than depending on a live provider or timing. Its first run emits the scenario descriptors; its resumed run records response order and emits one final text result. Key server state by `testId` so Playwright workers and aimock sequences cannot collide:

```ts
import { memoryPersistence } from '@tanstack/ai-persistence'
import type { AIPersistence } from '@tanstack/ai-persistence'

type InterruptFixture = {
  persistence: AIPersistence
  continuationCount: number
  continuationRunIds: string[]
  decisions: string[]
  truncateCommittedResponseOnce: boolean
  truncatedResponses: number
  replayCount: number
  joinedContinuationRunId?: string
}

const fixtures = new Map<string, InterruptFixture>()

export function getInterruptFixture(testId: string): InterruptFixture {
  const existing = fixtures.get(testId)
  if (existing) return existing
  const created: InterruptFixture = {
    persistence: memoryPersistence(),
    continuationCount: 0,
    continuationRunIds: [],
    decisions: [],
    truncateCommittedResponseOnce: true,
    truncatedResponses: 0,
    replayCount: 0,
  }
  fixtures.set(testId, created)
  return created
}
```

Define the fixture's server tools with real `toolDefinition` schemas: one shared approval schema, one `{ approve, reject }` branch schema, one editable input schema, and one client tool. Cancellation remains payloadless. Define a generic descriptor with its own Draft 2020-12 `responseSchema`. The synthetic stream must include stable `threadId`, `runId`, `interruptId`, `toolCallId`, `parentRunId`, and three distinct responses so the test asserts wire semantics rather than UI-only state.

- [ ] **Step 4: Add separate chat and recovery endpoints**

`api.interrupts-v2.ts` uses the real `AIPersistence` middleware and exposes POST chat, GET continuation replay, and GET test statistics:

```ts
import {
  chat,
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
  type StreamChunk,
} from '@tanstack/ai'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { createFileRoute } from '@tanstack/react-router'
import {
  createInterruptFixtureAdapter,
  getInterruptFixture,
  interruptFixtureTools,
} from '../lib/interrupts-v2-fixture'

async function collectChunks(
  stream: AsyncIterable<StreamChunk>,
): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function replayChunks(chunks: readonly StreamChunk[]): AsyncIterable<StreamChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

function truncatedSseResponse(): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: RUN_STARTED\ndata: {'))
        queueMicrotask(() => controller.error(new Error('fixture truncation')))
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}

export const Route = createFileRoute('/api/interrupts-v2')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const testId = url.searchParams.get('testId')
        if (!testId) return new Response('Missing testId', { status: 400 })
        const fixture = getInterruptFixture(testId)
        if (url.searchParams.get('stats') === '1') {
          return Response.json({
            continuationCount: fixture.continuationCount,
            continuationRunIds: fixture.continuationRunIds,
            truncatedResponses: fixture.truncatedResponses,
            replayCount: fixture.replayCount,
            joinedContinuationRunId: fixture.joinedContinuationRunId,
          })
        }
        const runId = url.searchParams.get('runId')
        if (!runId) return new Response('Missing runId', { status: 400 })
        const chunks = fixture.continuationChunks.get(runId)
        if (!chunks) return new Response('Unknown run', { status: 404 })
        fixture.joinedContinuationRunId = runId
        return toServerSentEventsResponse(replayChunks(chunks))
      },
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const testId = url.searchParams.get('testId')
        const scenario = url.searchParams.get('scenario')
        if (!testId || !scenario) {
          return new Response('Missing fixture correlation', { status: 400 })
        }
        const fixture = getInterruptFixture(testId)
        const params = await chatParamsFromRequestBody(await request.json())
        const stream = chat({
          ...params,
          adapter: createInterruptFixtureAdapter(scenario, fixture),
          tools: interruptFixtureTools,
          middleware: [withChatPersistence(fixture.persistence)],
        }) as AsyncIterable<StreamChunk>

        if (
          scenario === 'commit-then-truncate' &&
          params.resume &&
          fixture.truncateCommittedResponseOnce
        ) {
          fixture.truncateCommittedResponseOnce = false
          const chunks = await collectChunks(stream)
          fixture.truncatedResponses += 1
          fixture.continuationCount += 1
          fixture.continuationRunIds.push(params.runId)
          fixture.continuationChunks.set(params.runId, chunks)
          return truncatedSseResponse()
        }
        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

When the authoritative gateway returns the replay terminal, `createInterruptFixtureAdapter` increments `replayCount` but does not increment `continuationCount` or append another continuation run. Add `continuationChunks: Map<string, readonly StreamChunk[]>` to `InterruptFixture`.

`api.interrupts-v2.recovery.ts` accepts only `InterruptRecoveryQuery` and uses the fixture persistence selected by the explicit `testId` query:

```ts
import { createInterruptRecoveryHandler } from '@tanstack/ai-persistence'
import { createFileRoute } from '@tanstack/react-router'
import { getInterruptFixture } from '../lib/interrupts-v2-fixture'

export const Route = createFileRoute('/api/interrupts-v2/recovery')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const testId = new URL(request.url).searchParams.get('testId')
        if (!testId) return new Response('Missing testId', { status: 400 })
        const fixture = getInterruptFixture(testId)
        const handleRecovery = createInterruptRecoveryHandler({
          persistence: fixture.persistence,
          authorize: () => ({ allowed: true, includeResolutions: true }),
        })
        return handleRecovery(request)
      },
    },
  },
})
```

Never infer `/recovery` or a continuation replay URL from the chat URL in library code; the test page explicitly configures recovery and the SSE connection itself supplies `joinRun`.

- [ ] **Step 5: Build the test page using only public APIs**

Configure `useChat` with the fixture's typed tool tuple, `fetchServerSentEvents(() => `/api/interrupts-v2?testId=${encodeURIComponent(testId)}&scenario=${encodeURIComponent(scenario)}`)`, `createInterruptStateFetcher(() => `/api/interrupts-v2/recovery?testId=${encodeURIComponent(testId)}`)`, and a local draft store. Read `testId` and `scenario` from the page search params before constructing the adapters. This is an explicit caller-supplied chat/recovery correlation; `testId` is fixture routing data and is not added to `InterruptRecoveryQuery`. Because `fetchServerSentEvents` preserves existing query parameters when it appends `runId`, the same explicit connection also supplies `joinRun`. Render every `interrupts` item with its `kind`, `errors`, current staged response, edit fields, and per-item resolve/clear controls. Render root controls for callback resolution, retry, and approve/deny/cancel all. Use only public bound methods:

```tsx
{interrupts.map((interrupt) => (
  <section data-testid="interrupt-card" key={interrupt.id}>
    <output data-testid="interrupt-errors">
      {interrupt.errors.map((issue) => issue.message).join('|')}
    </output>
    {interrupt.kind === 'tool-approval' ? (
      <button onClick={() => interrupt.resolveInterrupt(true)}>Approve</button>
    ) : (
      <button
        onClick={() =>
          interrupt.resolveInterrupt({ approved: true, payload: genericDraft })
        }
      >
        Approve
      </button>
    )}
  </section>
))}
```

Declare `genericDraft` as `unknown` from the page's JSON editor state and let the built-in validator surface errors. Resolve the server-emitted `client-tool-execution` item through its typed bound `resolveInterrupt(output)` method in the scenario above. Add one separate assertion that the retained `addToolResult` API delegates to the same staged item, rather than creating a duplicate interrupt or a second submission.

- [ ] **Step 6: Regenerate the route tree and run E2E green**

The E2E package has no standalone route-generator script; its one-shot Vite build invokes the configured TanStack Router plugin and refreshes `routeTree.gen.ts`. Run:

```powershell
pnpm --filter @tanstack/ai-e2e build
pnpm --filter @tanstack/ai-e2e test:types
$env:CI='true'
pnpm --filter @tanstack/ai-e2e test:e2e -- tests/interrupts.spec.ts
```

Expected: the build exits 0 and changes only `routeTree.gen.ts` as generated route output; type checks and all 11 scenarios PASS with no retries required locally. As the focused refactor, remove only duplicated fixture builders, keep selectors and assertions explicit, and rerun all three commands.

### Task 17: Publish the API, validation recipe, migration guide, and changesets

**Prerequisites:** Tasks 1-16. Document only the settled and tested public surface.

**Files:**

- Create: `docs/chat/interrupts.md`
- Create: `docs/migration/interrupts.md`
- Modify: `docs/tools/tool-approval.md`
- Modify: `docs/tools/client-tools.md`
- Modify: `docs/chat/persistence.md`
- Modify: `docs/persistence/custom-stores.md`
- Modify: `docs/persistence/migrations.md`
- Modify: `docs/persistence/delivery-durability.md`
- Modify: `docs/architecture/approval-flow-processing.md`
- Modify: `docs/reference/functions/toolDefinition.md`
- Modify: `docs/config.json`
- Create: `.changeset/ag-ui-interrupts.md`

- [ ] **Step 1: Make the documentation link test fail for the planned pages**

Add `chat/interrupts` and `migration/interrupts` to the appropriate `docs/config.json` groups before creating the files. Also add a canonical `/chat/interrupts` link to `docs/tools/tool-approval.md` and a `/migration/interrupts` link to `docs/chat/persistence.md`; do not create the destination files yet. Then run:

```powershell
pnpm test:docs
```

Expected: FAIL with missing-page/link errors for both new destinations. `scripts/verify-links.ts` validates Markdown links, not navigation-only `docs/config.json` entries, so the two deliberate links are required for this red step. Do not weaken the verifier.

- [ ] **Step 2: Write the end-to-end interrupt guide with server and client halves**

`docs/chat/interrupts.md` must cover:

- AG-UI descriptor/result lifecycle and the PR-head breaking change;
- tool versus generic interrupt discrimination;
- `responseSchema` as the wire/runtime-validation foundation;
- `approvalSchema`, `{ approve, reject }`, optional `editedArgs`, grouped `payload`, and payloadless cancellation;
- one-item auto-submit, multi-item staging, root callback transactions, bulk operations, `clearResolution`, retry, and `interrupt.errors`/root `interruptErrors`;
- native recovery, V2 raw-draft persistence, idempotency, and tab conflicts;
- the separate client-tool `addToolResult` path.

Use a current model only when a provider-backed server example is necessary:

```ts
const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  tools: [transferTool],
  middleware: [withChatPersistence(persistence)],
  threadId,
})
```

The matching client example must show the inferred branch payload and no type casts:

```ts
const {
  interrupts,
  resolveInterrupts,
  cancelInterrupts,
  retryInterrupts,
  interruptErrors,
  isResuming,
  resumeInterruptsUnsafe,
} = useChat({ tools: [transferTool] as const })

const interrupt = interrupts.find(
  (item) => item.kind === 'tool-approval' && item.toolName === 'transfer',
)
if (
  interrupt?.kind === 'tool-approval' &&
  interrupt.toolName === 'transfer'
) {
  interrupt.resolveInterrupt(true, {
    editedArgs: { amount: 12, recipient: 'Ada' },
    payload: { note: 'Reviewed' },
  })
}
```

Keep `as const` (a const assertion) but use no `as SomeType` assertion in docs.

- [ ] **Step 3: Document converting received JSON Schema before app-level validation**

Generic payloads stay `unknown` statically. Show users how to turn the received Draft 2020-12 schema into their chosen runtime validator before resolving. Use a real Zod 4 conversion example and narrow the conversion result without a type assertion:

```ts
import { z } from 'zod'
import type { GenericAGUIInterrupt } from '@tanstack/ai-client'

function resolveGenericEditorValue(
  interrupt: GenericAGUIInterrupt,
  editorValue: string,
): readonly string[] {
  if (!interrupt.responseSchema) return ['This interrupt has no response schema.']

  let candidateResponse: unknown
  try {
    candidateResponse = JSON.parse(editorValue)
  } catch {
    return ['Enter valid JSON.']
  }

  const responseValidator = z.fromJSONSchema(interrupt.responseSchema)
  const parsed = responseValidator.safeParse(candidateResponse)
  if (!parsed.success) {
    return parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    )
  }
  interrupt.resolveInterrupt(parsed.data)
  return []
}
```

Explain that the conversion library returns a runtime schema rather than a wire-derived static application type, the client still performs canonical built-in Draft 2020-12 validation, and server validation remains authoritative.

- [ ] **Step 4: Write the migration and specialized pages**

`docs/migration/interrupts.md` maps every deprecated surface to the new API:

```ts
// Deprecated
await addToolApprovalResponse({ id: approval.id, approved: true })

// Current
interrupt.resolveInterrupt(true)
```

State explicitly that there is no codemod. Add recipes for batched staging, branch payloads, optional edits, generic unknown payloads, legacy persistence behavior, and opt-in native recovery.

Update the specialized pages as follows:

| Page | Required content |
| --- | --- |
| `tools/tool-approval.md` | shorthand, approve/reject payloads, and payloadless cancel examples |
| `tools/client-tools.md` | approval interrupts and client execution are separate axes |
| `chat/persistence.md` | raw drafts only, V2 envelope, recovery before rebinding |
| `persistence/custom-stores.md` | atomic `acceptInterruptBatch` capability and receipt contract |
| `persistence/migrations.md` | new table/columns/indexes for every adapter |
| `persistence/delivery-durability.md` | idempotency key, accepted tombstone, replay rules |
| `architecture/approval-flow-processing.md` | descriptor → validate-all → CAS → continuation → history |
| `reference/functions/toolDefinition.md` | conditional `approvalSchema` signature and inferred overloads |

- [ ] **Step 5: Update docs metadata exactly once**

In `docs/config.json`:

- give both new pages `addedAt: "2026-07-13"`;
- set `updatedAt: "2026-07-13"` on each existing page receiving a content change while preserving its existing `addedAt`;
- add the currently unlisted `architecture/approval-flow-processing` entry under the existing `Advanced` section with its repository creation date `addedAt: "2026-04-15"` and `updatedAt: "2026-07-13"`;
- do not change timestamps for unrelated pages or factual-only fixes.

- [ ] **Step 6: Add one release changeset and run docs green**

Create `.changeset/ag-ui-interrupts.md` with minor bumps for `@tanstack/ai`, `@tanstack/ai-client`, `@tanstack/ai-react`, `@tanstack/ai-preact`, `@tanstack/ai-solid`, `@tanstack/ai-vue`, `@tanstack/ai-svelte`, and `@tanstack/ai-angular`; add patch bumps for `@tanstack/ai-persistence`, `@tanstack/ai-persistence-drizzle`, `@tanstack/ai-persistence-prisma`, and `@tanstack/ai-persistence-cloudflare`. Describe the breaking migration and deprecated compatibility surfaces. Do not edit existing changesets.

Run:

```powershell
pnpm test:docs
pnpm test:types
```

Expected: PASS; all links resolve, examples are syntactically valid under doc checks, timestamps are valid, and public declarations build. Refactor repeated explanation into links to `chat/interrupts` without removing the server/client halves from the main guide.

### Task 18: Converge review to zero, run CI parity, and make the only implementation commit

**Prerequisites:** Tasks 0-17 are green. Do not start this task while an implementation or test process is still active.

**Files:**

- Review: every file changed by Tasks 1-17
- Modify: only files required to fix findings

- [ ] **Step 1: Format the actual diff and inspect its shape**

Use the repository formatter on changed supported files only, then inspect rather than blindly accepting bulk edits:

```powershell
$changed = git ls-files --modified --others --exclude-standard
pnpm exec prettier --experimental-cli --ignore-unknown --write $changed
git diff --check
git status --short
git diff --stat
```

Expected: Prettier succeeds, `git diff --check` is silent, and the status contains only the paths named in this plan plus generated lockfile, migration, and route-tree files. If PowerShell argument expansion exceeds its limit, format one package group at a time; do not switch shells.

- [ ] **Step 2: Perform the focused self-review ledger**

Review the diff against the approved spec and record a pass/fix entry for every row below in the task transcript; do not commit a report file:

| Ledger item | Required evidence |
| --- | --- |
| Protocol | canonical reasons, descriptor/result/error DTOs, one structured failure event |
| Types | conditional schema availability, three branches, optional edits, generic `unknown`, builder preservation |
| Client | singleton auto-submit, batch wait, replacement/clear, callback rollback and late-call guard, retry statuses |
| Validation | same Draft 2020-12 compiler client/server, all items validated, deterministic paths, no mutation |
| Persistence | exact-set CAS, first writer wins, idempotent replay, committed recovery, migrations/assets |
| Recovery | explicit handler/fetcher, current tool/schema rebinding, V2 draft quarantine and tombstones |
| Continuation | same thread, new run, `parentRunId`, generic middleware seam, result-only history |
| Compatibility | all three old APIs deprecated, legacy read only, no dual writer, sandbox guard, no codemod |
| Frameworks | runtime and type parity across all six packages |
| Documentation | server/client halves, schema conversion, no assertion casts, dates, current model, changeset |

Search for omissions and accidental placeholders:

```powershell
rg -n "TO[D]O|FIXME|IMPLEMENT_ME|throw new Error\(['\"]Not implemented" packages testing/e2e docs
rg -n "addToolApprovalResponse|pendingInterrupts|resumeInterrupts" packages/ai-client packages/ai-react packages/ai-preact packages/ai-solid packages/ai-vue packages/ai-svelte packages/ai-angular docs
rg -n "responseSchema|approvalSchema|parentRunId|interruptErrors|clearResolution|retryInterrupts" packages testing/e2e docs
```

Expected: no implementation placeholders; every legacy hit has a deprecation/compatibility purpose; every required new symbol has implementation, test, and documentation hits. Also search touched docs/model examples for repository-disallowed model names and replace any such existing line being edited with `gpt-5.5`.

- [ ] **Step 3: Run the execution-time test-hygiene and debugging audits**

Ask a `test-hygiene` peer to review new/modified tests for reusable fixtures, type-safe mocks, semantic assertions, deterministic timing, and absence of sleep-based synchronization. Fix every actionable finding and rerun the narrow owning test.

Ask a `debugging-discipline` peer to audit any unexpected-failure entries retained from Task 0 onward. Each entry must show reproduced symptom, repository prior-art search, root cause, smallest fix, and regression test. If there were no unexpected failures, record that fact in the task transcript; do not fabricate an investigation.

- [ ] **Step 4: Run the unbiased code-review/fix loop to zero**

Use the `cr-loop` skill after implementation and self-review. Give reviewers the approved spec, this plan, and the complete diff; require coverage across protocol, type inference, browser state, security/validation, transactional persistence, concurrency/replay, framework parity, tests, and docs. Use xhigh reasoning for investigation and review agents as required by repository instructions.

Classify every finding with file/line evidence. Fix all actionable findings, rerun the smallest owning command after each fix batch, and repeat independent review until the convergence report has zero actionable findings. Do not dismiss a finding merely because an existing test passes.

- [ ] **Step 5: Run the complete focused package matrix sequentially**

Set CI once and run native PowerShell one-shot commands. Await each process before starting the next:

```powershell
$env:CI='true'
pnpm --filter @tanstack/ai test:lib -- --run tests/interrupts.test.ts tests/tool-definition.test.ts tests/chat-resume-interrupts.test.ts tests/ag-ui-event-order.test.ts
pnpm --filter @tanstack/ai test:types
pnpm --filter @tanstack/ai-persistence test:lib -- --run tests/interrupts.test.ts tests/interrupt-conformance.test.ts tests/middleware.test.ts
pnpm --filter @tanstack/ai-persistence test:types
pnpm --filter @tanstack/ai-persistence-drizzle test:lib
pnpm --filter @tanstack/ai-persistence-drizzle test:types
pnpm --filter @tanstack/ai-persistence-prisma test:lib
pnpm --filter @tanstack/ai-persistence-prisma test:types
pnpm --filter @tanstack/ai-persistence-cloudflare test:lib
pnpm --filter @tanstack/ai-persistence-cloudflare test:types
pnpm --filter @tanstack/ai-client test:lib -- --run tests/interrupt-manager.test.ts tests/chat-client-interrupts.test.ts tests/chat-client-resume.test.ts tests/chat-persistence-controller.test.ts tests/connection-adapters.test.ts
pnpm --filter @tanstack/ai-client test:types
pnpm --filter @tanstack/ai-react test:lib -- --run tests/use-chat.test.ts
pnpm --filter @tanstack/ai-react test:types
pnpm --filter @tanstack/ai-preact test:lib -- --run tests/use-chat.test.ts
pnpm --filter @tanstack/ai-preact test:types
pnpm --filter @tanstack/ai-solid test:lib -- --run tests/use-chat.test.ts
pnpm --filter @tanstack/ai-solid test:types
pnpm --filter @tanstack/ai-vue test:lib -- --run tests/use-chat.test.ts
pnpm --filter @tanstack/ai-vue test:types
pnpm --filter @tanstack/ai-svelte test:lib -- --run tests/use-chat.test.ts
pnpm --filter @tanstack/ai-svelte test:types
pnpm --filter @tanstack/ai-angular test:lib -- --run tests/inject-chat.test.ts
pnpm --filter @tanstack/ai-angular test:types
pnpm test:docs
pnpm --filter @tanstack/ai-e2e test:types
pnpm --filter @tanstack/ai-e2e test:e2e -- tests/interrupts.spec.ts
```

Expected: every command exits 0. On any unexpected failure, stop the matrix, apply `debugging-discipline`, fix the root cause, rerun the owning command, then restart from the first command whose output could be affected.

- [ ] **Step 6: Run the mandatory repository-wide pre-PR gates**

These commands are mandatory even after the focused matrix:

```powershell
$env:CI='true'
pnpm test:pr
pnpm --filter @tanstack/ai-e2e test:e2e
```

Expected: both exit 0. `pnpm test:pr` is the canonical CI-equivalent Nx affected target set, and the full E2E command is mandatory for this behavior change. Do not commit, push, or rely on remote CI if either fails.

- [ ] **Step 7: Complete the verification checklist and inspect process hygiene**

Use the `completion-checklist` and `verification-before-completion` skills against fresh Step 5/6 output. Then, at quiescence only, inspect for task-owned processes:

```powershell
Get-Process node,esbuild,vitest -ErrorAction SilentlyContinue |
  Select-Object Id, ProcessName, StartTime, Path
git diff --check
git status --short --branch
```

Expected: no task-owned orphan process remains, `git diff --check` is silent, and the branch is `codex/interrupts-full-spec-design`. Never blanket-kill `node.exe`; identify ownership and wait for active commands. Do not run `wsl --shutdown` as part of this task.

- [ ] **Step 8: Stage and create the single final implementation commit**

Only after every review and gate is green, stage the planned implementation scope and inspect the staged diff:

```powershell
$implementationFiles = git ls-files --modified --others --exclude-standard
$implementationFiles
git add -- $implementationFiles
git diff --cached --check
git diff --cached --stat
git status --short
git commit -m "feat: implement durable AG-UI interrupts"
git status --short --branch
```

Before `git add`, compare the printed list with the reviewed Task 1-17 status and remove any preserved user-owned path from `$implementationFiles`. Expected: one final commit succeeds, no generated plan/review/report artifact is accidentally staged, and the working tree is clean except for any explicitly preserved user-owned file. Do not add a co-author trailer. Do not push and do not open a PR in this execution; hand the verified local branch and commit back to the user.
