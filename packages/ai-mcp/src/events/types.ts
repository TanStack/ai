/** JSON value used in event arguments and payloads. */
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONObject
  | Array<JSONValue>

/** JSON object sent as event arguments or payload data. */
export interface JSONObject {
  [key: string]: JSONValue
}

/**
 * Delivery modes an event type may advertise.
 *
 * @experimental
 */
export type MCPEventDeliveryMode = 'poll' | 'push' | 'webhook'

/**
 * One event type from `events/list`.
 *
 * @experimental
 *
 * @example
 * ```ts
 * const events = await client.experimental_events.list()
 * const incident = events.find((event) => event.name === 'incident.created')
 * ```
 */
export interface MCPEventDefinition {
  name: string
  description?: string
  delivery: Array<MCPEventDeliveryMode>
  inputSchema: unknown
  payloadSchema: unknown
  _meta?: JSONObject
}

/**
 * Server-reported webhook delivery health on subscribe/refresh.
 *
 * @experimental
 */
export interface MCPEventDeliveryStatus {
  active?: boolean
  lastDeliveryAt?: string
  lastError?: string | null
  failedSince?: string
  throttled?: boolean
  retryAfterMs?: number
}

/**
 * Result of `events/subscribe` after the client stores a local key.
 *
 * @experimental
 */
export interface MCPEventSubscribeResult {
  key: string
  id: string
  refreshBefore: string | null
  cursor: string | null
  truncated: boolean
  deliveryStatus?: MCPEventDeliveryStatus
}

/**
 * One delivered event occurrence.
 *
 * @experimental
 */
export interface MCPEventOccurrence {
  eventId: string
  name: string
  timestamp: string
  data: JSONObject
  cursor?: string | null
}

/**
 * Stored subscription. Must stay server-side: it holds the HMAC secret.
 *
 * @experimental
 */
export interface MCPEventSubscription {
  key: string
  id?: string
  name: string
  arguments: JSONObject
  definition: MCPEventDefinition
  delivery: { mode: 'webhook'; url: string; secret: string }
  refreshBefore?: string | null
  cursor: string | null
  truncated: boolean
  ttlMs?: number | null
  maxAgeMs?: number
  status: 'pending' | 'active'
}

/**
 * Handler-safe view of a subscription. No secret.
 *
 * @experimental
 */
export interface MCPEventSubscriptionInfo {
  key: string
  id: string
  name: string
  arguments: JSONObject
  delivery: { mode: 'webhook'; url: string }
  refreshBefore: string | null
}

/**
 * Client store for webhook subscriptions.
 *
 * `update` must merge only the supplied fields.
 * `list` is optional so a cron job can refresh every subscription.
 *
 * @experimental
 *
 * @example
 * ```ts
 * import { inMemoryMCPEventStore } from '@tanstack/ai-mcp/events'
 *
 * const store = inMemoryMCPEventStore()
 * const mcp = await createMCPClient({
 *   transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
 *   experimental_events: { store },
 * })
 * ```
 */
export interface MCPEventStore {
  get: (key: string) => Promise<MCPEventSubscription | undefined>
  getById: (id: string) => Promise<MCPEventSubscription | undefined>
  set: (subscription: MCPEventSubscription) => Promise<void>
  update: (
    key: string,
    patch: Partial<Omit<MCPEventSubscription, 'key'>>,
  ) => Promise<void>
  delete: (key: string) => Promise<void>
  list?: () => AsyncIterable<MCPEventSubscription>
}

/**
 * Direct mode: the client talks to the MCP server and this store.
 *
 * @experimental
 */
export interface DirectMCPEventsOptions {
  store: MCPEventStore
  adapter?: never
  /**
   * Called before every subscribe. Throw to reject.
   * The SDK does not validate against `inputSchema`.
   *
   * @example
   * ```ts
   * experimental_events: {
   *   store,
   *   validateArguments: ({ arguments: args }) => {
   *     if (typeof args.repo !== 'string') throw new Error('repo required')
   *   },
   * }
   * ```
   */
  validateArguments?: (args: {
    definition: MCPEventDefinition
    arguments: JSONObject
  }) => void | PromiseLike<void>
}

/**
 * Transport context passed to a managed events adapter.
 *
 * @experimental
 */
export type MCPEventAdapterTransport =
  | { type: 'http'; url: string }
  | { type: 'sse'; url: string }
  | { type: 'custom' }

/**
 * Status values used by managed adapters such as Vercel Connect.
 *
 * @experimental
 */
export type ManagedMCPSubscriptionStatus =
  | 'pending'
  | 'active'
  | 'needs_auth'
  | 'stopped'
  | 'expired'
  | 'failed'

/**
 * One managed subscription record.
 *
 * @experimental
 */
export interface ManagedMCPSubscription {
  id: string
  name: string
  arguments: JSONObject
  status: ManagedMCPSubscriptionStatus
  expiresAt: string | null
  idempotencyKey?: string
  context?: JSONObject
}

/**
 * Input for a managed adapter `subscribe` call.
 *
 * @experimental
 */
export interface ManagedMCPSubscribeInput {
  name: string
  arguments: JSONObject
  context?: JSONObject
  idempotencyKey: string
  ttlMs: number | null
  options?: { signal?: AbortSignal; timeout?: number }
}

/**
 * Operations returned by `adapter.createAdapter`.
 *
 * @experimental
 */
export interface MCPEventOperations {
  subscribe: (
    input: ManagedMCPSubscribeInput,
  ) => Promise<ManagedMCPSubscription>
  getSubscription: (id: string) => Promise<ManagedMCPSubscription | undefined>
  listSubscriptions: () => Promise<Array<ManagedMCPSubscription>>
  unsubscribe: (id: string) => Promise<void>
}

/**
 * Hosted-backend adapter. `createAdapter` is synchronous and called once.
 *
 * @experimental
 *
 * @example
 * ```ts
 * const mcp = await createMCPClient({
 *   transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
 *   experimental_events: { adapter },
 * })
 * await mcp.experimental_events.subscribe({
 *   name: 'incident.created',
 *   arguments: { repo: 'acme/app' },
 *   idempotencyKey: 'incident:acme/app',
 *   ttlMs: 3_600_000,
 * })
 * ```
 */
export interface MCPEventAdapter {
  createAdapter: (context: {
    transport: MCPEventAdapterTransport
  }) => MCPEventOperations
}

/**
 * Managed mode: subscribe and list go through the adapter.
 *
 * @experimental
 */
export interface ManagedMCPEventsOptions {
  adapter: MCPEventAdapter
  store?: never
  validateArguments?: never
}

/**
 * `createMCPClient({ experimental_events })` option.
 * Omit it for discovery-only (`list()`).
 *
 * @experimental
 */
export type MCPEventsOptions = DirectMCPEventsOptions | ManagedMCPEventsOptions

/**
 * Lookup key for refresh and unsubscribe in direct mode.
 *
 * @experimental
 */
export type MCPEventSubscriptionRef = (
  | { key: string; id?: never }
  | { id: string; key?: never }
) & { signal?: AbortSignal }

/**
 * Options for a direct-mode subscribe call.
 *
 * @experimental
 *
 * @example
 * ```ts
 * const sub = await client.experimental_events.subscribe({
 *   name: 'incident.created',
 *   arguments: { repo: 'acme/app' },
 *   delivery: {
 *     mode: 'webhook',
 *     url: 'https://app.example.com/api/mcp-events',
 *   },
 * })
 * ```
 */
export interface SubscribeMCPEventOptions {
  name: string
  arguments?: JSONObject
  delivery: {
    mode: 'webhook'
    url: string
    secret?: string
    allowInsecureLocalhost?: boolean
  }
  cursor?: string | null
  ttlMs?: number | null
  maxAgeMs?: number
  signal?: AbortSignal
}

/**
 * Direct and discovery events API on `client.experimental_events`.
 *
 * @experimental
 */
export interface MCPEvents {
  list: (options?: {
    signal?: AbortSignal
  }) => Promise<Array<MCPEventDefinition>>
  subscribe: (
    options: SubscribeMCPEventOptions,
  ) => Promise<MCPEventSubscribeResult>
  refresh: (
    options: MCPEventSubscriptionRef,
  ) => Promise<MCPEventSubscribeResult>
  unsubscribe: (options: MCPEventSubscriptionRef) => Promise<void>
}

/**
 * Managed events API: MCP `list()` plus adapter operations. No `refresh`.
 *
 * @experimental
 */
export interface ManagedMCPEvents extends MCPEventOperations {
  list: (options?: {
    signal?: AbortSignal
  }) => Promise<Array<MCPEventDefinition>>
}

/** Minimal Standard Schema used for MCP `events/*` results. */
export interface MCPStandardSchema<T> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    validate: (
      value: unknown,
    ) => { value: T } | { issues: Array<{ message: string }> }
  }
}

/**
 * The only seam between `client.ts` and `events/*`.
 *
 * @experimental
 */
export interface MCPEventsContext {
  request: (
    method: 'events/list' | 'events/subscribe' | 'events/unsubscribe',
    params: Record<string, unknown>,
    schema: MCPStandardSchema<unknown>,
    signal?: AbortSignal,
  ) => Promise<unknown>
  assertOpen: () => void
  readonly supportsEvents: boolean
  readonly transport: MCPEventAdapterTransport
}

/**
 * Receiver options for `createMCPEventWebhook`.
 *
 * @experimental
 *
 * @example
 * ```ts
 * import { createMCPEventWebhook } from '@tanstack/ai-mcp/events'
 *
 * const webhook = createMCPEventWebhook({
 *   store,
 *   onEvent: async ({ event }) => {
 *     await queue.send({ eventId: event.eventId, data: event.data })
 *   },
 * })
 * ```
 */
export interface MCPEventWebhookOptions {
  store: MCPEventStore
  onEvent: (args: {
    subscription: MCPEventSubscriptionInfo
    event: MCPEventOccurrence
    messageId: string
  }) => Promise<void> | void
  onGap?: (args: {
    subscription: MCPEventSubscriptionInfo
    messageId: string
    gap: { cursor: string; truncated: true }
  }) => Promise<void> | void
  onTerminated?: (args: {
    subscription: MCPEventSubscriptionInfo
    messageId: string
    termination: { code: number; message: string; data?: unknown }
  }) => Promise<void> | void
  /**
   * Throw to reject the event with HTTP 400.
   */
  validatePayload?: (args: {
    definition: MCPEventDefinition
    data: JSONObject
  }) => void | PromiseLike<void>
  /**
   * Called on failed checks. Never receives secrets.
   */
  onError?: (error: MCPEventWebhookError) => void
  toleranceSeconds?: number
  maxBodyBytes?: number
  now?: () => number
}

/**
 * Receiver error passed to `onError`. Messages never include the secret.
 *
 * @experimental
 */
export class MCPEventWebhookError extends Error {
  readonly stage:
    | 'headers'
    | 'routing'
    | 'signature'
    | 'timestamp'
    | 'body'
    | 'envelope'
    | 'payload'
    | 'handler'
    | 'store'
  readonly subscriptionKey?: string

  constructor(
    stage: MCPEventWebhookError['stage'],
    message: string,
    options?: { subscriptionKey?: string; cause?: unknown },
  ) {
    super(
      message,
      options?.cause === undefined ? undefined : { cause: options.cause },
    )
    this.name = 'MCPEventWebhookError'
    this.stage = stage
    this.subscriptionKey = options?.subscriptionKey
  }
}

export type MCPEventWebhookStage = MCPEventWebhookError['stage']
