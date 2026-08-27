import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from '@standard-schema/spec'
import {
  canonicalInterruptJson,
  cloneAndDeepFreezeJson,
  digestInterruptJson,
} from './interrupt-serialization'
import {
  isStandardSchema,
  isStandardJSONSchema,
} from './activities/chat/tools/schema-converter'
import { INTERRUPT_BINDING_VERSION } from './interrupts'

export const INTERRUPT_PAYLOAD_METADATA_KEY =
  'tanstack:interruptPayload' as const
export const INTERRUPT_BINDING_KIND = 'generic' as const

type PortableSchema =
  | StandardJSONSchemaV1<any, any>
  | StandardSchemaV1<any, any>

type InferSchemaOutput<TSchema> =
  TSchema extends StandardSchemaV1<any, infer TOutput>
    ? TOutput
    : TSchema extends StandardJSONSchemaV1<any, infer TOutput>
      ? TOutput
      : never
type InferSchemaInput<TSchema> =
  TSchema extends StandardSchemaV1<infer TInput, any>
    ? TInput
    : TSchema extends StandardJSONSchemaV1<infer TInput, any>
      ? TInput
      : never
type DefinitionSchemaState = {
  responseSchemaCanonicalJson?: string
  responseSchemaHash?: string
  payloadSchemaCanonicalJson?: string
  payloadSchemaHash?: string
}
const definitionSchemaState = new WeakMap<object, DefinitionSchemaState>()

export interface InterruptDefinitionOptions<
  TId extends string,
  TPayloadSchema extends PortableSchema | undefined,
  TResponseSchema extends PortableSchema | undefined,
> {
  id: TId
  payloadSchema?: TPayloadSchema
  responseSchema?: TResponseSchema
}

export interface InterruptBindingDescriptor {
  v: typeof INTERRUPT_BINDING_VERSION
  kind: typeof INTERRUPT_BINDING_KIND
  definitionId: string
  key: string
  threadId?: string
  interruptedRunId?: string
  generation?: number
  batchIndex?: number
  responseSchemaCanonicalJson?: string
  payloadSchemaCanonicalJson?: string
  payloadSchemaHash?: string
  responseSchemaHash?: string
}

export interface InterruptPreEmissionData {
  descriptor: InterruptBindingDescriptor
  payload?: unknown
}

type InterruptInput<
  TPayloadSchema extends PortableSchema | undefined,
  TPayload = unknown,
> = {
  key: string
  reason: string
  message: string
  expiresAt?: string
} & ([TPayloadSchema] extends [undefined] ? {} : { payload?: TPayload })

type GenericInterruptRequestBase<
  TDefinition extends InterruptDefinition<any, any, any, any>,
> = {
  readonly definition: TDefinition
  readonly key: string
  readonly reason: string
  readonly message: string
  readonly expiresAt?: string
}

type GenericInterruptRequestFor<
  TDefinition extends InterruptDefinition<any, any, any, any>,
  TPayloadSchema extends PortableSchema | undefined,
  TPayload,
> = GenericInterruptRequestBase<TDefinition> &
  ([TPayloadSchema] extends [undefined]
    ? {}
    : { readonly payload: TPayload | undefined })

export type GenericInterruptRequest<
  TDefinition extends InterruptDefinition<any, any, any, any>,
> = [TDefinition] extends [never]
  ? never
  : TDefinition extends InterruptDefinition<
        any,
        infer TPayloadSchema,
        any,
        infer TPayload
      >
    ? GenericInterruptRequestFor<TDefinition, TPayloadSchema, TPayload>
    : GenericInterruptRequestBase<TDefinition>

type InterruptInputKey = 'key' | 'reason' | 'message' | 'expiresAt' | 'payload'
type RejectUnexpectedInputKeys<TInput> =
  Exclude<keyof TInput, InterruptInputKey> extends never
    ? unknown
    : { [K in Exclude<keyof TInput, InterruptInputKey>]: never }
type RejectUnexpectedPayload<TInput> = 'payload' extends keyof TInput
  ? { payload: never }
  : unknown
type ValidInterruptInput<
  TInput,
  TPayloadSchema extends PortableSchema | undefined,
  TPayload = unknown,
> =
  TInput extends InterruptInput<TPayloadSchema, TPayload>
    ? RejectUnexpectedInputKeys<TInput> &
        ([TPayloadSchema] extends [undefined]
          ? RejectUnexpectedPayload<TInput>
          : unknown)
    : never

/**
 * Extracting a class method preserves the intentional bivariant assignment
 * behavior of the public `interrupt` callback without exposing a method
 * signature in an interface.
 */
declare abstract class InterruptRequestMethodSignature<
  TId extends string,
  TPayloadSchema extends PortableSchema | undefined,
  TResponseSchema extends PortableSchema | undefined,
  TPayload,
  TPayloadInput,
> {
  abstract call<TInput>(
    input: TInput & ValidInterruptInput<TInput, TPayloadSchema, TPayloadInput>,
  ): GenericInterruptRequestFor<
    InterruptDefinition<
      TId,
      TPayloadSchema,
      TResponseSchema,
      TPayload,
      TPayloadInput
    >,
    TPayloadSchema,
    TPayload
  >
}

type InterruptRequestMethod<
  TId extends string,
  TPayloadSchema extends PortableSchema | undefined,
  TResponseSchema extends PortableSchema | undefined,
  TPayload,
  TPayloadInput,
> = InterruptRequestMethodSignature<
  TId,
  TPayloadSchema,
  TResponseSchema,
  TPayload,
  TPayloadInput
>['call']

type DefinedInterruptDefinition<
  TId extends string,
  TPayloadSchema extends PortableSchema | undefined,
  TResponseSchema extends PortableSchema | undefined,
  TPayload = unknown,
  TPayloadInput = TPayload,
> = Omit<
  InterruptDefinition<
    TId,
    TPayloadSchema,
    TResponseSchema,
    TPayload,
    TPayloadInput
  >,
  'interrupt'
> & {
  interrupt: InterruptRequestMethod<
    TId,
    TPayloadSchema,
    TResponseSchema,
    TPayload,
    TPayloadInput
  >
}

export interface InterruptDefinition<
  TId extends string,
  TPayloadSchema extends PortableSchema | undefined,
  TResponseSchema extends PortableSchema | undefined,
  TPayload = unknown,
  TPayloadInput = TPayload,
> {
  readonly id: TId
  readonly payloadSchema: TPayloadSchema
  readonly responseSchema: TResponseSchema
  interrupt: InterruptRequestMethod<
    TId,
    TPayloadSchema,
    TResponseSchema,
    TPayload,
    TPayloadInput
  >
}

export function createInterruptBinding(
  request: GenericInterruptRequest<InterruptDefinition<any, any, any, any>>,
  fields: Pick<
    InterruptBindingDescriptor,
    'threadId' | 'interruptedRunId' | 'generation' | 'batchIndex'
  > = {},
): InterruptPreEmissionData {
  const schemaState = definitionSchemaState.get(request.definition)
  if (!schemaState) {
    throw new TypeError('Interrupt definition schema state is unavailable.')
  }
  const { threadId, interruptedRunId, generation, batchIndex } = fields
  return {
    descriptor: {
      v: INTERRUPT_BINDING_VERSION,
      kind: INTERRUPT_BINDING_KIND,
      definitionId: request.definition.id,
      key: request.key,
      ...(threadId !== undefined ? { threadId } : {}),
      ...(interruptedRunId !== undefined ? { interruptedRunId } : {}),
      ...(generation !== undefined ? { generation } : {}),
      ...(batchIndex !== undefined ? { batchIndex } : {}),
      ...(schemaState.responseSchemaCanonicalJson
        ? {
            responseSchemaCanonicalJson:
              schemaState.responseSchemaCanonicalJson,
          }
        : {}),
      ...(schemaState.payloadSchemaCanonicalJson
        ? { payloadSchemaCanonicalJson: schemaState.payloadSchemaCanonicalJson }
        : {}),
      ...(schemaState.payloadSchemaHash
        ? { payloadSchemaHash: schemaState.payloadSchemaHash }
        : {}),
      ...(schemaState.responseSchemaHash
        ? { responseSchemaHash: schemaState.responseSchemaHash }
        : {}),
    },
    ...('payload' in request && request.payload !== undefined
      ? { payload: request.payload }
      : {}),
  }
}

type ParsedInterruptInput = {
  key: string
  reason: string
  message: string
  expiresAt?: string
  payload?: unknown
}

type InterruptRequestFactory = (
  input: ParsedInterruptInput,
  payloadIsParsed: boolean,
) => GenericInterruptRequest<InterruptDefinition<any, any, any, any>>

const interruptRequestFactories = new WeakMap<object, InterruptRequestFactory>()
const interruptRequestInputs = new WeakMap<
  object,
  Readonly<ParsedInterruptInput>
>()

/**
 * Returns the schema input captured for a newly emitted request. This is
 * internal because continuation state can cross a client boundary and must be
 * parsed again when it returns to the server.
 */
export function getInterruptRequestInput(
  request: GenericInterruptRequest<InterruptDefinition<any, any, any, any>>,
): Readonly<ParsedInterruptInput> {
  const input = interruptRequestInputs.get(request)
  if (!input) {
    throw new TypeError('Interrupt request input is unavailable.')
  }
  return input
}

/**
 * Rebuild a request from a persisted display payload that has already passed
 * the definition's payload schema. This is internal because callers must not
 * bypass public input validation for new requests.
 */
export function rehydrateInterruptRequest(
  definition: InterruptDefinition<any, any, any, any>,
  input: ParsedInterruptInput,
): GenericInterruptRequest<InterruptDefinition<any, any, any, any>> {
  const factory = interruptRequestFactories.get(definition)
  if (!factory) {
    throw new TypeError('Interrupt definition request factory is unavailable.')
  }
  return factory(input, true)
}

interface CanonicalSchemaJson {
  json: Record<string, unknown>
  canonicalJson: string
}

function schemaJson(schema: unknown, name: string): CanonicalSchemaJson {
  if (!isStandardJSONSchema(schema)) {
    throw new TypeError(
      `${name} must be a Standard Schema with a JSON Schema converter.`,
    )
  }
  try {
    const exported = schema['~standard'].jsonSchema.input({
      target: 'draft-07',
    })
    if (exported === undefined) {
      throw new TypeError('The exported schema is undefined.')
    }
    if (typeof exported === 'function') {
      throw new TypeError('The exported schema must not be a function.')
    }
    if (Array.isArray(exported)) {
      throw new TypeError('The exported schema must be a plain JSON object.')
    }
    if (
      !exported ||
      typeof exported !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(exported))
    ) {
      throw new TypeError('The exported schema must be a plain JSON object.')
    }
    const converted: Record<string, unknown> = {}
    const entries = Object.entries(exported)
    for (const [key, value] of entries) {
      if (key !== '$schema') converted[key] = value
    }
    const canonicalJson = canonicalInterruptJson(converted)
    return { json: converted, canonicalJson }
  } catch (error) {
    throw new TypeError(
      `${name} could not export compatible JSON Schema: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/** Same hash the producer stamps on a first-party generic binding. */
export function hashInterruptDefinitionSchema(schema: unknown): string {
  return digestInterruptJson(
    schemaJson(schema, 'Interrupt schema').canonicalJson,
  )
}

function validateJson(value: unknown, label: string): void {
  try {
    canonicalInterruptJson(value)
  } catch (error) {
    throw new TypeError(
      `${label} must be JSON-compatible: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function validateNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string.`)
  }
  return value
}

function validateExpiresAt(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new TypeError('Interrupt expiresAt must be a valid date string.')
  }
  return value
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  )
}

function parseInterruptPayload(
  schema: PortableSchema,
  value: unknown,
): unknown {
  if (!isStandardSchema(schema)) return value
  const result = schema['~standard'].validate(value)
  if (isPromiseLike(result)) {
    throw new TypeError(
      'Interrupt payloadSchema validation must be synchronous.',
    )
  }
  if (result.issues !== undefined) {
    throw new TypeError(
      `Interrupt payload is invalid: ${result.issues.map((issue) => issue.message).join(' ')}`,
    )
  }
  return result.value
}

export function defineInterrupt<
  const TId extends string,
  const TPayloadSchema extends PortableSchema,
  const TResponseSchema extends PortableSchema,
>(options: {
  id: TId
  payloadSchema: TPayloadSchema
  responseSchema: TResponseSchema
}): DefinedInterruptDefinition<
  TId,
  TPayloadSchema,
  TResponseSchema,
  InferSchemaOutput<TPayloadSchema>,
  InferSchemaInput<TPayloadSchema>
>
export function defineInterrupt<
  const TId extends string,
  const TPayloadSchema extends PortableSchema,
>(options: {
  id: TId
  payloadSchema: TPayloadSchema
  responseSchema?: never
}): DefinedInterruptDefinition<
  TId,
  TPayloadSchema,
  undefined,
  InferSchemaOutput<TPayloadSchema>,
  InferSchemaInput<TPayloadSchema>
>
export function defineInterrupt<
  const TId extends string,
  const TResponseSchema extends PortableSchema,
>(options: {
  id: TId
  responseSchema: TResponseSchema
  payloadSchema?: never
}): DefinedInterruptDefinition<
  TId,
  undefined,
  TResponseSchema,
  undefined,
  undefined
>
export function defineInterrupt<
  const TId extends string,
  const TPayloadSchema extends PortableSchema | undefined,
  const TResponseSchema extends PortableSchema | undefined,
>(
  options: InterruptDefinitionOptions<TId, TPayloadSchema, TResponseSchema>,
): InterruptDefinition<
  TId,
  TPayloadSchema,
  TResponseSchema,
  InferSchemaOutput<TPayloadSchema>,
  InferSchemaInput<TPayloadSchema>
> {
  validateNonEmptyString(options.id, 'Interrupt definition id')
  const hasResponseSchema = options.responseSchema !== undefined
  const responseJson = hasResponseSchema
    ? schemaJson(options.responseSchema, 'responseSchema')
    : undefined
  const hasPayloadSchema = Object.prototype.hasOwnProperty.call(
    options,
    'payloadSchema',
  )
  const payloadJson = hasPayloadSchema
    ? schemaJson(options.payloadSchema, 'payloadSchema')
    : undefined
  const schemaState: DefinitionSchemaState = {
    ...(responseJson
      ? {
          responseSchemaCanonicalJson: responseJson.canonicalJson,
          responseSchemaHash: digestInterruptJson(responseJson.canonicalJson),
        }
      : {}),
    ...(payloadJson
      ? {
          payloadSchemaCanonicalJson: payloadJson.canonicalJson,
          payloadSchemaHash: digestInterruptJson(payloadJson.canonicalJson),
        }
      : {}),
  }
  const definition = {
    id: options.id,
    payloadSchema: options.payloadSchema,
    responseSchema: options.responseSchema,
    interrupt(input: InterruptInput<TPayloadSchema>) {
      return createRequest(input, false)
    },
  } as InterruptDefinition<
    TId,
    TPayloadSchema,
    TResponseSchema,
    InferSchemaOutput<TPayloadSchema>,
    InferSchemaInput<TPayloadSchema>
  >
  const parsePayload = (payload: unknown): unknown => {
    const payloadSchema = options.payloadSchema
    if (payloadSchema === undefined) {
      throw new TypeError(
        'This interrupt definition does not accept a payload.',
      )
    }
    return parseInterruptPayload(payloadSchema, payload)
  }
  const createRequest: InterruptRequestFactory = (input, payloadIsParsed) => {
    const keys = Object.keys(input)
    for (const key of keys) {
      if (!['key', 'payload', 'reason', 'message', 'expiresAt'].includes(key)) {
        throw new TypeError(`Interrupt input field ${key} is not allowed.`)
      }
    }
    const key = validateNonEmptyString(input.key, 'Interrupt key')
    const reason = validateNonEmptyString(input.reason, 'Interrupt reason')
    const message = validateNonEmptyString(input.message, 'Interrupt message')
    if ('payload' in input) {
      if (!hasPayloadSchema) {
        throw new TypeError(
          'This interrupt definition does not accept a payload.',
        )
      }
      if (input.payload !== undefined) {
        validateJson(input.payload, 'Interrupt payload')
      }
    }
    const parsedPayload =
      'payload' in input
        ? payloadIsParsed
          ? input.payload
          : parsePayload(input.payload)
        : undefined
    const payload =
      parsedPayload === undefined
        ? undefined
        : cloneAndDeepFreezeJson(parsedPayload)
    const expiresAt =
      input.expiresAt === undefined
        ? undefined
        : validateExpiresAt(input.expiresAt)
    const request = Object.freeze({
      definition,
      key,
      ...(hasPayloadSchema && payload !== undefined ? { payload } : {}),
      reason,
      message,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    })
    if (!payloadIsParsed) {
      interruptRequestInputs.set(
        request,
        cloneAndDeepFreezeJson({
          key,
          reason,
          message,
          ...(expiresAt !== undefined ? { expiresAt } : {}),
          ...(parsedPayload !== undefined ? { payload: parsedPayload } : {}),
        }),
      )
    }
    return request
  }
  definitionSchemaState.set(definition, schemaState)
  interruptRequestFactories.set(definition, createRequest)
  return Object.freeze(definition)
}
