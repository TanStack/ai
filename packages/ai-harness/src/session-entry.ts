import { isStandardSchema, validateWithStandardSchema } from '@tanstack/ai'
import type { InferSchemaType, SchemaInput } from '@tanstack/ai'
import type { SessionIndexEntry } from '@tanstack/ai-persistence'

/**
 * The type of the session metadata that `TSchema` checks. Without a schema,
 * or with a schema that gives no type (a plain JSON Schema), any record.
 */
export type MetadataOf<TSchema> = 0 extends 1 & TSchema
  ? Record<string, unknown>
  : TSchema extends SchemaInput
    ? unknown extends InferSchemaType<TSchema>
      ? Record<string, unknown>
      : InferSchemaType<TSchema>
    : Record<string, unknown>

/**
 * A change to a session index entry. Each field you pass replaces the stored
 * one, so `metadata` replaces the whole object.
 */
export interface SessionEntryChange<TMetadata = Record<string, unknown>> {
  title?: string
  pinned?: boolean
  metadata?: TMetadata
}

/**
 * A change, or a function that makes the change from the current entry. Use
 * the function to change part of `metadata`: when another host writes the
 * entry first, the function runs again on the new entry, so neither change
 * is lost. Return `undefined` to write nothing.
 */
export type SessionEntryUpdate<
  TMetadata = Record<string, unknown>,
  TChange = SessionEntryChange<TMetadata>,
> = TChange | ((entry: SessionIndexEntry<TMetadata>) => TChange | undefined)

/** Session metadata that a `metadataSchema` refused. Nothing was written. */
export class SessionMetadataError extends Error {
  readonly issues: ReadonlyArray<{ message: string; path?: Array<string> }>
  constructor(
    issues: ReadonlyArray<{ message: string; path?: Array<string> }>,
  ) {
    super(
      `The session metadata is not valid: ${issues.map((issue) => issue.message).join(', ')}`,
    )
    this.name = 'SessionMetadataError'
    this.issues = issues
  }
}

/**
 * @internal Throw when `schema` is not a Standard Schema: a plain JSON Schema
 * cannot check a write, so it would let any metadata in.
 */
export function assertMetadataSchema(owner: string, schema: unknown) {
  if (schema !== undefined && !isStandardSchema(schema)) {
    throw new Error(
      `${owner}: metadataSchema must be a Standard Schema (for example a zod object). A plain JSON Schema cannot check the metadata.`,
    )
  }
}

/** The output of `schema` for `metadata`. Throws when it refuses the value. */
async function checked(schema: SchemaInput, metadata: unknown) {
  const result = await validateWithStandardSchema<Record<string, unknown>>(
    schema,
    metadata,
  )
  if (!result.success) throw new SessionMetadataError(result.issues)
  return result.data
}

/**
 * @internal The entry after `update`. `undefined` when there is no entry or
 * the update writes nothing. The harness schema checks `metadata`, and the
 * entry keeps its output. `pluginSchema` checks the same value, but its
 * output is not kept: a plugin schema with fewer keys would drop the keys of
 * the harness.
 */
export async function changedEntry(
  entry: SessionIndexEntry | undefined,
  update:
    | SessionEntryUpdate<
        any,
        SessionEntryChange<any> & { usage?: SessionIndexEntry['usage'] }
      >
    | undefined,
  harnessSchema: SchemaInput | undefined,
  pluginSchema?: SchemaInput,
): Promise<SessionIndexEntry | undefined> {
  if (!entry) return undefined
  const change = typeof update === 'function' ? update(entry) : update
  if (!change) return undefined
  let { metadata } = change
  if (metadata !== undefined) {
    if (pluginSchema) await checked(pluginSchema, metadata)
    if (harnessSchema) metadata = await checked(harnessSchema, metadata)
  }
  return {
    ...entry,
    ...(change.title !== undefined ? { title: change.title } : {}),
    ...(change.pinned !== undefined ? { pinned: change.pinned } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
    ...(change.usage !== undefined ? { usage: change.usage } : {}),
    updatedAt: Date.now(),
  }
}
