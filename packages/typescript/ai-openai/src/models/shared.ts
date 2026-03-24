export type OpenAIRegistryStatus =
  | 'active'
  | 'preview'
  | 'deprecated'
  | 'legacy'
  | 'chatgpt_only'

export type OpenAIRegistryInput = 'text' | 'image' | 'audio' | 'video'
export type OpenAIRegistryOutput = 'text' | 'image' | 'audio' | 'video'

export type OpenAIRegistryTool =
  | 'web_search'
  | 'file_search'
  | 'image_generation'
  | 'code_interpreter'
  | 'mcp'
  | 'computer_use'
  | 'shell'
  | 'local_shell'
  | 'apply_patch'
  | 'hosted_shell'
  | 'skills'
  | 'tool_search'
  | 'custom'

export interface OpenAIRegistryLifecycle {
  status: OpenAIRegistryStatus
  replacedBy?: string
  deprecatedAt?: string
  sunsetAt?: string
}

export interface OpenAIRegistryLimits {
  contextWindow?: number
  maxOutputTokens?: number
  knowledgeCutoff?: string
}

export interface OpenAIRegistryBilling {
  input?: number
  cachedInput?: number
  output?: number
  text?: {
    input?: number
    cachedInput?: number
    output?: number
  }
  image?: {
    input?: number
    cachedInput?: number
    output?: number
  }
  audio?: {
    input?: number
    cachedInput?: number
    output?: number
  }
  video?: {
    input?: number
    cachedInput?: number
    output?: number
  }
  notes?: ReadonlyArray<string>
}

export interface OpenAIRegistryDocs {
  source?: string
  limits?: OpenAIRegistryLimits
  tools?: ReadonlyArray<OpenAIRegistryTool>
  billing?: OpenAIRegistryBilling
  apiEndpoints?: ReadonlyArray<string>
  notes?: ReadonlyArray<string>
}

export type RegistryId<TRegistry extends Record<string, unknown>> = Extract<
  keyof TRegistry,
  string
>

export type RegistrySnapshotId<TRegistry extends Record<string, unknown>> = {
  [TModel in RegistryId<TRegistry>]: TRegistry[TModel] extends {
    snapshots: ReadonlyArray<infer TSnapshot extends string>
  }
    ? TSnapshot
    : never
}[RegistryId<TRegistry>]

export type RegistryModelId<TRegistry extends Record<string, unknown>> =
  | RegistryId<TRegistry>
  | RegistrySnapshotId<TRegistry>

type RegistryEntryForModel<
  TRegistry extends Record<string, unknown>,
  TModel extends RegistryModelId<TRegistry>,
> = TModel extends RegistryId<TRegistry>
  ? TRegistry[TModel]
  : {
      [TBase in RegistryId<TRegistry>]: TRegistry[TBase] extends {
        snapshots: ReadonlyArray<infer TSnapshot extends string>
      }
        ? TModel extends TSnapshot
          ? TRegistry[TBase]
          : never
        : never
    }[RegistryId<TRegistry>]

export type RegistryPropertyByName<
  TRegistry extends Record<string, unknown>,
  TKey extends keyof RegistryEntryForModel<TRegistry, RegistryModelId<TRegistry>>,
> = {
  [TModel in RegistryModelId<TRegistry>]: RegistryEntryForModel<
    TRegistry,
    TModel
  >[TKey]
}

export type RegistryEntryByModel<
  TRegistry extends Record<string, unknown>,
  TModel extends RegistryModelId<TRegistry>,
> = RegistryEntryForModel<TRegistry, TModel>

export type RegistryInputByName<
  TRegistry extends Record<string, { input: ReadonlyArray<unknown> }>,
> = {
  [TModel in RegistryModelId<TRegistry>]: RegistryEntryForModel<
    TRegistry,
    TModel
  >['input']
}

export type RegistrySizeByName<
  TRegistry extends Record<string, { sizes: ReadonlyArray<unknown> }>,
> = {
  [TModel in RegistryModelId<TRegistry>]: RegistryEntryForModel<
    TRegistry,
    TModel
  >['sizes'][number]
}

function getSnapshots(meta: unknown): Array<string> {
  if (
    typeof meta === 'object' &&
    meta !== null &&
    'snapshots' in meta &&
    Array.isArray((meta as { snapshots?: Array<string> }).snapshots)
  ) {
    return (meta as { snapshots?: Array<string> }).snapshots ?? []
  }
  return []
}

export function supportedIds<const TRegistry extends Record<string, unknown>>(
  registry: TRegistry,
): ReadonlyArray<RegistryModelId<TRegistry>> {
  return Object.entries(registry).flatMap(([id, meta]) => [
    id,
    ...getSnapshots(meta),
  ]) as unknown as ReadonlyArray<RegistryModelId<TRegistry>>
}

export function snapshotIds<const TRegistry extends Record<string, unknown>>(
  registry: TRegistry,
): ReadonlyArray<RegistrySnapshotId<TRegistry>> {
  return Object.values(registry).flatMap(
    getSnapshots,
  ) as unknown as ReadonlyArray<RegistrySnapshotId<TRegistry>>
}

export function idsByStatus<
  const TRegistry extends Record<string, { lifecycle: OpenAIRegistryLifecycle }>,
  TStatus extends OpenAIRegistryStatus,
>(
  registry: TRegistry,
  status: TStatus,
): ReadonlyArray<
  {
    [TModel in RegistryId<TRegistry>]: TRegistry[TModel]['lifecycle']['status'] extends TStatus
      ? TModel
      : never
  }[RegistryId<TRegistry>]
> {
  return Object.entries(registry)
    .filter(([, meta]) => meta.lifecycle.status === status)
    .map(([id]) => id) as unknown as ReadonlyArray<
    {
      [TModel in RegistryId<TRegistry>]: TRegistry[TModel]['lifecycle']['status'] extends TStatus
        ? TModel
        : never
    }[RegistryId<TRegistry>]
  >
}
