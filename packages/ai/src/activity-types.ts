import { EventType } from './types'
import { parseWithStandardSchema } from './activities/chat/tools/schema-converter'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ActivityPart, ActivitySnapshotEvent } from './types'
import type {
  InferSchemaInput,
  InferSchemaOutput,
  PortableSchema,
} from './interrupt-definition'

/** A typed activity type. Make one with {@link defineActivityType}. */
export interface ActivityTypeDefinition<
  TType extends string,
  TContentInput,
  TContent,
> {
  /** The type name. It is the `activityType` of each part of this type. */
  readonly activityType: TType
  /** The schema that checks the content of each snapshot. */
  readonly contentSchema: PortableSchema
  /**
   * Returns `true` when `value` is an activity part or record of this type,
   * and narrows `content` to the content of this type. A record has no
   * `type`, so `type` is optional here.
   */
  is: (value: unknown) => value is ActivityOfDefinition<TContent>
  /**
   * Checks `content` with the schema and returns an `ACTIVITY_SNAPSHOT`
   * chunk that replaces the activity message `id`.
   *
   * @throws TypeError when the content fails the check, or when the schema
   * validates only async.
   */
  snapshot: (id: string, content: TContentInput) => ActivitySnapshotEvent
}

/** Any activity type definition. Use it as a type constraint. */
export type AnyActivityTypeDefinition = ActivityTypeDefinition<string, any, any>

/** The content that `snapshot()` of a definition accepts. */
export type ActivityContentInput<TDef extends AnyActivityTypeDefinition> =
  TDef extends ActivityTypeDefinition<any, infer TContentInput, any>
    ? TContentInput
    : never

/** The content of a definition after the schema check. */
export type ActivityContentOf<TDef extends AnyActivityTypeDefinition> =
  TDef extends ActivityTypeDefinition<any, any, infer TContent>
    ? TContent
    : never

/**
 * The activity part of a definition. A union of definitions gives one part
 * for each definition, so `===` on `activityType` narrows `content`.
 */
export type ActivityPartOf<TDef extends AnyActivityTypeDefinition> =
  TDef extends AnyActivityTypeDefinition
    ? Omit<ActivityPart, 'activityType' | 'content'> & {
        activityType: TDef['activityType']
        content: ActivityContentOf<TDef>
      }
    : never

/** The type of `activityType` on an `OtherActivityPart`. */
export type OtherActivityType = `tanstack:other-activity:${string}`

/**
 * An activity part of a type that is not built in and not declared. `===` on
 * a name never selects it, but the `default` or final `else` branch keeps it.
 * Read its typed content with the `is()` of its definition.
 */
export type OtherActivityPart = Omit<ActivityPart, 'activityType'> & {
  // ponytail: TypeScript cannot express "any string except the built-in
  // names", so the fallback uses a name pattern that no real activity type
  // has. It keeps `===` narrowing for built-ins, makes a typo a compile error,
  // and keeps the `default` branch usable. The runtime value is the real name.
  activityType: OtherActivityType
}

/**
 * What `is()` narrows to: an activity part, or a stored activity record,
 * which has no `type`.
 */
type ActivityOfDefinition<TContent> = Omit<
  OtherActivityPart,
  'type' | 'content'
> & { type?: 'activity'; content: TContent }

/**
 * Defines a typed activity type. An activity is a message with one part that
 * the client shows, for example a progress card or a pending approval.
 *
 * - `activityType`: the type name, for example `'deploy.progress'`.
 * - `contentSchema`: a Standard Schema for the content. It gives the content
 *   type and checks the content of each snapshot.
 *
 * `snapshot(id, content)` throws a `TypeError` that names the activity type
 * when the content fails the check, or when the schema validates only async.
 *
 * @example
 * ```ts
 * const deployProgress = defineActivityType({
 *   activityType: 'deploy.progress',
 *   contentSchema: z.object({ step: z.number(), total: z.number() }),
 * })
 *
 * // Server: a chunk that replaces the activity message `deploy-1`.
 * deployProgress.snapshot('deploy-1', { step: 1, total: 3 })
 *
 * // Client: read the typed content.
 * if (deployProgress.is(part)) part.content.step
 * ```
 */
export function defineActivityType<
  const TType extends string,
  const TSchema extends PortableSchema,
>(options: { activityType: TType; contentSchema: TSchema }) {
  const { activityType, contentSchema } = options
  const definition: ActivityTypeDefinition<
    TType,
    InferSchemaInput<TSchema>,
    InferSchemaOutput<TSchema>
  > = {
    activityType,
    contentSchema,
    is(value): value is ActivityOfDefinition<InferSchemaOutput<TSchema>> {
      if (typeof value !== 'object' || value === null) return false
      if (!('activityType' in value) || value.activityType !== activityType) {
        return false
      }
      // A stored activity record has no `type`.
      return !('type' in value) || value.type === 'activity'
    },
    snapshot(id, content) {
      try {
        return {
          type: EventType.ACTIVITY_SNAPSHOT,
          messageId: id,
          activityType,
          content: parseWithStandardSchema(contentSchema, content),
          replace: true,
          timestamp: Date.now(),
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new TypeError(
          `Content check failed for activity type '${activityType}': ${reason}`,
          { cause: error },
        )
      }
    },
  }
  return definition
}

/**
 * A Standard Schema that only carries a content type. Our own code sends the
 * built-in activities, so it lets every value pass. Core needs no schema
 * library for it.
 */
function typeOnlySchema<TContent>() {
  const schema: StandardSchemaV1<TContent> = {
    '~standard': {
      version: 1,
      vendor: 'tanstack-ai',
      // The value is trusted. The cast only gives it the content type.
      validate: (value) => ({ value: value as TContent }),
    },
  }
  return schema
}

/** Content of the built-in `sandbox.status` activity. */
export type SandboxStatusContent = {
  status: 'starting' | 'ready' | 'failed'
  provider: string
  sandboxId?: string
  resumed?: boolean
  error?: string
}

/** Content of the built-in `sandbox.approval` activity. */
export type SandboxApprovalContent = {
  approvalId: string
  title: string
  status: 'pending' | 'granted' | 'denied'
  detail?: Record<string, unknown>
}

const sandboxStatusSchema: StandardSchemaV1<SandboxStatusContent> =
  typeOnlySchema()
const sandboxApprovalSchema: StandardSchemaV1<SandboxApprovalContent> =
  typeOnlySchema()

/**
 * Built-in activity for the start of a sandbox. There is one row for each run,
 * with the id `sandbox-<runId>`.
 */
export const sandboxStatusActivity = defineActivityType({
  activityType: 'sandbox.status',
  contentSchema: sandboxStatusSchema,
})

/**
 * Built-in activity for an action that waits for a user decision. The id is
 * `sandbox.approval:<approvalId>`.
 */
export const sandboxApprovalActivity = defineActivityType({
  activityType: 'sandbox.approval',
  contentSchema: sandboxApprovalSchema,
})

/** The activity parts of the built-in types, one member for each type. */
export type BuiltInActivityPart = ActivityPartOf<
  typeof sandboxStatusActivity | typeof sandboxApprovalActivity
>

/**
 * An activity part on a client message: one member for each built-in type,
 * one for each declared definition, and `OtherActivityPart` for all other
 * types. `part.activityType === 'sandbox.status'` narrows `content`.
 */
export type TypedActivityPart<
  TActivities extends ReadonlyArray<AnyActivityTypeDefinition> | undefined =
    undefined,
> =
  | BuiltInActivityPart
  | ActivityPartOf<NonNullable<TActivities>[number]>
  | OtherActivityPart
