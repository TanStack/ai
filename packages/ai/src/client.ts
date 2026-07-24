import type {
  AudioGenerationOptions,
  ImageGenerationOptions,
  TTSOptions,
  TranscriptionOptions,
  VideoGenerationOptions,
} from './types'

export type GenerationKind =
  | 'image'
  | 'audio'
  | 'tts'
  | 'video'
  | 'transcription'

type GenerationInputByKind = {
  image: Omit<ImageGenerationOptions, 'logger' | 'model'>
  audio: Omit<AudioGenerationOptions, 'logger' | 'model'>
  tts: Omit<TTSOptions, 'logger' | 'model'>
  video: Omit<VideoGenerationOptions, 'logger' | 'model'>
  transcription: Omit<TranscriptionOptions, 'logger' | 'model'>
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
  'video',
  'transcription',
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

function assertInputForKind(
  kind: GenerationKind,
  input: unknown,
): asserts input is GenerationInputByKind[GenerationKind] {
  if (!isRecord(input)) {
    throw new Error(`Generation ${kind} input must be an object.`)
  }

  const requiredKey =
    kind === 'tts' ? 'text' : kind === 'transcription' ? 'audio' : 'prompt'

  if (!hasOwnKey(input, requiredKey)) {
    throw new Error(`Generation ${kind} input must include ${requiredKey}.`)
  }
}

function isInputForKind(kind: GenerationKind, input: unknown): boolean {
  if (!isRecord(input)) return false

  const requiredKey =
    kind === 'tts' ? 'text' : kind === 'transcription' ? 'audio' : 'prompt'

  return hasOwnKey(input, requiredKey)
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

export enum EventType {
  TEXT_MESSAGE_START = 'TEXT_MESSAGE_START',
  TEXT_MESSAGE_CONTENT = 'TEXT_MESSAGE_CONTENT',
  TEXT_MESSAGE_END = 'TEXT_MESSAGE_END',
  TEXT_MESSAGE_CHUNK = 'TEXT_MESSAGE_CHUNK',
  TOOL_CALL_START = 'TOOL_CALL_START',
  TOOL_CALL_ARGS = 'TOOL_CALL_ARGS',
  TOOL_CALL_END = 'TOOL_CALL_END',
  TOOL_CALL_CHUNK = 'TOOL_CALL_CHUNK',
  TOOL_CALL_RESULT = 'TOOL_CALL_RESULT',
  THINKING_START = 'THINKING_START',
  THINKING_END = 'THINKING_END',
  THINKING_TEXT_MESSAGE_START = 'THINKING_TEXT_MESSAGE_START',
  THINKING_TEXT_MESSAGE_CONTENT = 'THINKING_TEXT_MESSAGE_CONTENT',
  THINKING_TEXT_MESSAGE_END = 'THINKING_TEXT_MESSAGE_END',
  STATE_SNAPSHOT = 'STATE_SNAPSHOT',
  STATE_DELTA = 'STATE_DELTA',
  MESSAGES_SNAPSHOT = 'MESSAGES_SNAPSHOT',
  ACTIVITY_SNAPSHOT = 'ACTIVITY_SNAPSHOT',
  ACTIVITY_DELTA = 'ACTIVITY_DELTA',
  RAW = 'RAW',
  CUSTOM = 'CUSTOM',
  RUN_STARTED = 'RUN_STARTED',
  RUN_FINISHED = 'RUN_FINISHED',
  RUN_ERROR = 'RUN_ERROR',
  STEP_STARTED = 'STEP_STARTED',
  STEP_FINISHED = 'STEP_FINISHED',
  REASONING_START = 'REASONING_START',
  REASONING_MESSAGE_START = 'REASONING_MESSAGE_START',
  REASONING_MESSAGE_CONTENT = 'REASONING_MESSAGE_CONTENT',
  REASONING_MESSAGE_END = 'REASONING_MESSAGE_END',
  REASONING_MESSAGE_CHUNK = 'REASONING_MESSAGE_CHUNK',
  REASONING_END = 'REASONING_END',
  REASONING_ENCRYPTED_VALUE = 'REASONING_ENCRYPTED_VALUE',
}

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
export type { WireMessage } from './utilities/ag-ui-wire'

export type {
  AudioPart,
  ContentPart,
  ContentPartDataSource,
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
