import type {
  MessagePart,
  ToolApprovalInterrupt,
  ToolCallPart,
  ToolResultPart,
  UIMessage,
} from '../types'
import type {
  ChatUIInterrupt,
  ChatUIPartKey,
  ChatUISelectInput,
  ChatUISelectedMessage,
  ChatUISelectedPart,
  ChatUISelection,
} from './types'

const PART_KEY_BY_TYPE: Record<string, ChatUIPartKey> = {
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video',
  document: 'document',
  thinking: 'thinking',
  activity: 'activity',
  'tool-call': 'toolCall',
  'tool-result': 'toolResult',
  'structured-output': 'structuredOutput',
  'ui-resource': 'uiResource',
}

export function partTypeToKey(type: string): ChatUIPartKey | string {
  const mapped = PART_KEY_BY_TYPE[type]
  if (mapped) return mapped
  return type.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

export function collectInlineToolNames(
  toolInterrupts?: Record<string, unknown>,
  mappedToolNames?: ReadonlyArray<string>,
): Array<string> {
  const listPlaced = new Set(Object.keys(toolInterrupts ?? {}))
  return (mappedToolNames ?? []).filter((name) => !listPlaced.has(name))
}

export function resolveInterruptComponent(
  interrupt: ChatUIInterrupt,
  interruptsMap:
    | {
        tools?: Record<string, unknown>
        generic?: Record<string, unknown>
      }
    | undefined,
): unknown {
  if (!interruptsMap) return undefined
  if (interrupt.kind === 'tool-approval') {
    return interruptsMap.tools?.[interrupt.toolName]
  }
  const generic = interruptsMap.generic
  if (!generic) return undefined
  const definitionId =
    'definitionId' in interrupt && typeof interrupt.definitionId === 'string'
      ? interrupt.definitionId
      : undefined
  if (definitionId && definitionId !== 'fallback') {
    const registered = generic[definitionId]
    if (registered) return registered
  }
  return generic.fallback
}

function isToolCallPart(part: MessagePart): part is ToolCallPart {
  return part.type === 'tool-call'
}

function isToolResultPart(part: MessagePart): part is ToolResultPart {
  return part.type === 'tool-result'
}

function isToolApproval(
  interrupt: ChatUIInterrupt,
): interrupt is ToolApprovalInterrupt {
  return interrupt.kind === 'tool-approval'
}

export function selectChatUI(input: ChatUISelectInput): ChatUISelection {
  const messages = input.messages
  const interrupts = input.interrupts ?? []
  const inlineToolNames = new Set(input.inlineToolNames ?? [])

  const resultsByCallId = new Map<string, ToolResultPart>()
  const callIds = new Set<string>()
  for (const message of messages) {
    for (const part of message.parts) {
      if (isToolCallPart(part)) callIds.add(part.id)
      if (isToolResultPart(part)) resultsByCallId.set(part.toolCallId, part)
    }
  }

  const approvalByCallId = new Map<string, ToolApprovalInterrupt>()
  for (const interrupt of interrupts) {
    if (isToolApproval(interrupt)) {
      approvalByCallId.set(interrupt.toolCallId, interrupt)
    }
  }

  const selectedMessages: Array<ChatUISelectedMessage> = messages.map(
    (message) => ({
      message,
      parts: message.parts.map((part) =>
        toSelectedPart(part, resultsByCallId, approvalByCallId, callIds),
      ),
    }),
  )

  return {
    messages: selectedMessages,
    interrupts: interrupts.filter((interrupt) => {
      if (!isToolApproval(interrupt)) return true
      if (!inlineToolNames.has(interrupt.toolName)) return true
      return !callIds.has(interrupt.toolCallId)
    }),
  }
}

function toSelectedPart(
  part: MessagePart,
  resultsByCallId: Map<string, ToolResultPart>,
  approvalByCallId: Map<string, ToolApprovalInterrupt>,
  callIds: Set<string>,
): ChatUISelectedPart {
  if (isToolCallPart(part)) {
    const result = resultsByCallId.get(part.id)
    const interrupt = approvalByCallId.get(part.id)
    return {
      key: 'toolCall',
      part,
      ...(result ? { result } : {}),
      ...(interrupt ? { interrupt } : {}),
      input: part.input,
      output: part.output,
    }
  }

  if (isToolResultPart(part)) {
    return {
      key: 'toolResult',
      part,
      matched: callIds.has(part.toolCallId),
    }
  }

  return {
    key: partTypeToKey(part.type) as Exclude<
      ChatUIPartKey,
      'toolCall' | 'toolResult'
    >,
    part,
  }
}

export function automaticPartsForMessage(
  selected: ChatUISelectedMessage,
): Array<ChatUISelectedPart> {
  return selected.parts.filter(
    (part) => !(part.key === 'toolResult' && part.matched),
  )
}

export function selectMessageUI(
  message: UIMessage,
  input: Omit<ChatUISelectInput, 'messages'>,
): ChatUISelectedMessage {
  return (
    selectChatUI({ ...input, messages: [message] }).messages[0] ?? {
      message,
      parts: [],
    }
  )
}
