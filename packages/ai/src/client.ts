import type {
  AudioGenerationOptions,
  ImageGenerationOptions,
  TTSOptions,
  TranscriptionOptions,
  VoiceGenerationOptions,
  VideoGenerationOptions,
  WorldGenerationOptions,
  LiveVideoGenerationOptions,
} from './types'

export type GenerationKind =
  | 'image'
  | 'audio'
  | 'tts'
  | 'voice'
  | 'video'
  | 'transcription'
  | 'world'
  | 'liveVideo'

type GenerationInputByKind = {
  image: Omit<ImageGenerationOptions, 'logger' | 'model'>
  audio: Omit<AudioGenerationOptions, 'logger' | 'model'>
  tts: Omit<TTSOptions, 'logger' | 'model'>
  voice: Omit<VoiceGenerationOptions, 'logger' | 'model'>
  video: Omit<VideoGenerationOptions, 'logger' | 'model'>
  transcription: Omit<TranscriptionOptions, 'logger' | 'model'>
  world: Omit<WorldGenerationOptions, 'logger' | 'model'>
  liveVideo: Omit<LiveVideoGenerationOptions, 'logger' | 'model'>
}

export interface GenerationParams<TKind extends GenerationKind> {
  input: GenerationInputByKind[TKind]
  forwardedProps: Record<string, unknown>
  threadId?: string
  runId?: string
}

const generationKinds = [
  'image',
  'audio',
  'tts',
  'voice',
  'video',
  'transcription',
  'world',
  'liveVideo',
] as const satisfies ReadonlyArray<GenerationKind>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwnKey(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isGenerationEnvelope(body: unknown): body is Record<string, unknown> {
  return (
    isRecord(body) &&
    (hasOwnKey(body, 'data') || hasOwnKey(body, 'forwardedProps'))
  )
}

function assertGenerationKind(kind: unknown): asserts kind is GenerationKind {
  if (!generationKinds.includes(kind as GenerationKind)) {
    throw new Error(
      `Unsupported generation kind: ${String(
        kind,
      )}. Expected one of ${generationKinds.join(', ')}.`,
    )
  }
}

/**
 * The input field(s) that identify a generation body for a kind. Most kinds
 * have exactly one; `voice` accepts either of its two creation modes, so any
 * one of its keys is enough.
 */
function requiredKeysForKind(kind: GenerationKind): Array<string> {
  // Enumerated rather than defaulted so a new generation kind has to declare
  // the field that identifies its body instead of silently inheriting
  // `prompt`.
  switch (kind) {
    case 'tts':
      return ['text']
    case 'transcription':
      return ['audio']
    case 'voice':
      return ['prompt', 'referenceAudio']
    case 'image':
    case 'audio':
    case 'video':
    case 'world':
    case 'liveVideo':
      return ['prompt']
  }
}

function assertInputForKind(
  kind: GenerationKind,
  input: unknown,
): asserts input is GenerationInputByKind[GenerationKind] {
  if (!isRecord(input)) {
    throw new Error(`Generation ${kind} input must be an object.`)
  }

  const requiredKeys = requiredKeysForKind(kind)

  if (!requiredKeys.some((key) => hasOwnKey(input, key))) {
    throw new Error(
      `Generation ${kind} input must include ${requiredKeys.join(' or ')}.`,
    )
  }
}

function isInputForKind(kind: GenerationKind, input: unknown): boolean {
  if (!isRecord(input)) return false

  return requiredKeysForKind(kind).some((key) => hasOwnKey(input, key))
}

function forwardedPropsFromEnvelope(
  envelope: Record<string, unknown>,
): Record<string, unknown> {
  if (!hasOwnKey(envelope, 'forwardedProps')) {
    return {}
  }

  if (!isRecord(envelope.forwardedProps)) {
    throw new Error('Generation envelope forwardedProps must be an object.')
  }

  return envelope.forwardedProps
}

function optionalStringField(
  envelope: Record<string, unknown>,
  key: 'threadId' | 'runId',
): string | undefined {
  if (!hasOwnKey(envelope, key)) {
    return undefined
  }

  const value = envelope[key]
  if (typeof value !== 'string') {
    throw new Error(`Generation envelope ${key} must be a string.`)
  }

  return value
}

function generationIdentityFields(envelope: Record<string, unknown>): {
  threadId?: string
  runId?: string
} {
  const identity: {
    threadId?: string
    runId?: string
  } = {}
  const threadId = optionalStringField(envelope, 'threadId')
  const runId = optionalStringField(envelope, 'runId')

  if (threadId !== undefined) identity.threadId = threadId
  if (runId !== undefined) identity.runId = runId

  return identity
}

export function generationParamsFromBody<TKind extends GenerationKind>(
  kind: TKind,
  body: unknown,
): GenerationParams<TKind> {
  assertGenerationKind(kind)

  if (isInputForKind(kind, body)) {
    assertInputForKind(kind, body)
    return {
      input: body as GenerationInputByKind[TKind],
      forwardedProps: {},
    }
  }

  if (!isGenerationEnvelope(body)) {
    assertInputForKind(kind, body)
    return {
      input: body as GenerationInputByKind[TKind],
      forwardedProps: {},
    }
  }

  if (!hasOwnKey(body, 'data')) {
    throw new Error(`Generation ${kind} envelope must include data.`)
  }

  const input = body.data
  assertInputForKind(kind, input)

  const forwardedProps = forwardedPropsFromEnvelope(body)

  return {
    input: input as GenerationInputByKind[TKind],
    forwardedProps,
    ...generationIdentityFields(body),
  }
}

export async function generationParamsFromRequest<TKind extends GenerationKind>(
  kind: TKind,
  request: Request,
): Promise<GenerationParams<TKind>> {
  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    throw new Error('Invalid JSON request body.', { cause: error })
  }

  if (!isRecord(body)) {
    throw new Error('Generation request body must be a JSON object.')
  }

  return generationParamsFromBody(kind, body)
}

export { EventType } from '@ag-ui/core'

export {
  defineAgent,
  type DefinedAgent,
  type SubagentChoiceOptions,
  type SubagentRunContext,
} from './activities/chat/agents/define-agent'
export {
  subagentRoute,
  type SubagentRouteOptions,
} from './activities/chat/agents/route'
export type {
  SubagentOrder,
  SubagentRouterPick,
  SubagentRouterPlan,
  SubagentStep,
  SubagentStepsPlan,
} from './activities/chat/agents/spawn'

export {
  toolDefinition,
  type AnyClientTool,
  type ClientTool,
  type InferToolInput,
  type InferToolName,
  type InferToolOutput,
  type ApprovalCapabilityOf,
  type ApprovalSchemaConfig,
  type ApprovalSchemaOf,
  type InputSchemaOf,
  type OutputSchemaOf,
  type NoSchema,
  type ToolDefinition,
  type ToolDefinitionConfig,
  type ToolDefinitionInstance,
} from './activities/chat/tools/tool-definition'

export {
  hashSchemaInput,
  normalizeApprovalSchema,
  type NormalizedApprovalSchema,
  type NormalizedSchemaInput,
} from './activities/chat/tools/approval-schema'

export {
  canonicalInterruptJson,
  cloneAndDeepFreezeJson,
  digestInterruptJson,
} from './interrupt-serialization'

export {
  convertSchemaToJsonSchema,
  isStandardSchema,
  parseWithStandardSchema,
  validateWithStandardSchema,
} from './activities/chat/tools/schema-converter'

export {
  convertMessagesToModelMessages,
  generateMessageId,
  modelMessageToUIMessage,
  modelMessagesToUIMessages,
  normalizeToUIMessage,
  uiMessageToModelMessages,
} from './activities/chat/messages'

export {
  BatchStrategy,
  CompositeStrategy,
  defaultJSONParser,
  ImmediateStrategy,
  parsePartialJSON,
  PartialJSONParser,
  PunctuationStrategy,
  StreamProcessor,
  WordBoundaryStrategy,
} from './activities/chat/stream/index'
export type {
  ChunkRecording,
  ChunkStrategy,
  InternalToolCallState,
  JSONParser,
  ProcessorResult,
  ProcessorState,
  StreamProcessorEvents,
  StreamProcessorOptions,
  ToolCallState,
  ToolResultState,
} from './activities/chat/stream/index'

export { uiMessagesToWire } from './utilities/ag-ui-wire'
export {
  mergeMetadata,
  tanstackMetadata,
  withTanstackMetadata,
} from './utilities/merge-metadata'
export { fromSpecTokenUsage, toSpecTokenUsage } from './utilities/ag-ui-usage'
export type { SpecTokenUsage } from './utilities/ag-ui-usage'
export { normalizeStreamChunk } from './utilities/normalize-stream-chunk'
export { restoreInboundChunk } from './utilities/restore-inbound-chunk'
export type { AdapterYieldChunk } from './utilities/adapter-yield-chunk'
export { getChunkRunId, getChunkThreadId } from './utilities/chunk-ids'
export type { WireMessage } from './utilities/ag-ui-wire'

export type {
  AudioPart,
  ContentPart,
  ContentPartDataSource,
  ContentPartFileSource,
  SubagentHandleData,
  SubagentStatus,
  ContentPartSource,
  ContentPartUrlSource,
  CustomEvent,
  DocumentPart,
  ImagePart,
  MediaInputMetadata,
  MediaInputRole,
  MediaPrompt,
  MediaPromptPart,
  MessagePart,
  ModelMessage,
  PersistedArtifactActivity,
  PersistedArtifactRef,
  PersistedArtifactRole,
  Interrupt,
  RunAgentResumeItem,
  RunErrorEvent,
  RunFinishedEvent,
  RunFinishedOutcome,
  SchemaInput,
  StreamChunk,
  StructuredOutputPart,
  TextPart,
  TanStackMessageMetadata,
  TanStackRunMetadata,
  ThinkingPart,
  ToolCall,
  ToolCallPart,
  ToolResultPart,
  UIMessage,
  UIResourcePart,
  VideoPart,
  InferSchemaType,
} from './types'

// Enumerated, not `export *` — see the matching note in `index.ts`. The
// interrupt protocol surface is a commitment, so it is published field by
// field.
export {
  INTERRUPT_BINDING_VERSION,
  canonicalizeInterruptResolutions,
} from './interrupts'
export {
  defineInterrupt,
  hashInterruptDefinitionSchema,
  INTERRUPT_PAYLOAD_METADATA_KEY,
} from './interrupt-definition'
export {
  INTERRUPT_CONTINUATION_METADATA_KEY,
  INTERRUPT_CONTINUATION_VERSION,
  genericInterruptContinuationFromDescriptor,
  readGenericInterruptContinuation,
  wrapGenericInterruptContinuation,
} from './generic-interrupt-continuation'
export type {
  GenericInterruptContinuation,
  GenericInterruptContinuationReadResult,
} from './generic-interrupt-continuation'
export type {
  GenericInterruptRequest,
  InterruptDefinition,
} from './interrupt-definition'
export type {
  BatchInterruptError,
  BatchInterruptErrorCode,
  InterruptBinding,
  InterruptCorrelation,
  InterruptSubmissionError,
  ItemInterruptError,
  ItemInterruptErrorCode,
  ToolApprovalResolution,
  UnopenedInterruptBinding,
} from './interrupts'

export {
  INTERRUPT_BINDING_METADATA_KEY,
  readInterruptBinding,
  readUnopenedInterruptBinding,
  withInterruptBinding,
  withoutInterruptBinding,
} from './interrupt-resume'

export type {
  AudioVisualization,
  RealtimeAdapter,
  RealtimeConnection,
  RealtimeError,
  RealtimeErrorCode,
  RealtimeEvent,
  RealtimeEventHandler,
  RealtimeEventPayloads,
  RealtimeMessage,
  RealtimeMessagePart,
  RealtimeMode,
  RealtimeSessionConfig,
  RealtimeStatus,
  RealtimeToken,
  RealtimeAudioPart,
  RealtimeImagePart,
  RealtimeTextPart,
  RealtimeToolCallPart,
  RealtimeToolResultPart,
  VADConfig,
} from './realtime/types'
