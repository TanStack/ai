import { EventType } from '../types'

const SHARED: ReadonlySet<string> = new Set([
  'type',
  'timestamp',
  'rawEvent',
  'metadata',
])

function keys(...fields: Array<string>): ReadonlySet<string> {
  return new Set([...SHARED, ...fields])
}

const SPEC_KEYS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [EventType.TEXT_MESSAGE_START, keys('messageId', 'role', 'name')],
  [EventType.TEXT_MESSAGE_CONTENT, keys('messageId', 'delta')],
  [EventType.TEXT_MESSAGE_END, keys('messageId')],
  [EventType.TEXT_MESSAGE_CHUNK, keys('messageId', 'role', 'delta', 'name')],
  [
    EventType.TOOL_CALL_START,
    keys('toolCallId', 'toolCallName', 'toolName', 'parentMessageId'),
  ],
  [EventType.TOOL_CALL_ARGS, keys('toolCallId', 'delta')],
  [EventType.TOOL_CALL_END, keys('toolCallId', 'input')],
  [
    EventType.TOOL_CALL_CHUNK,
    keys('toolCallId', 'toolCallName', 'parentMessageId', 'delta'),
  ],
  [
    EventType.TOOL_CALL_RESULT,
    keys('messageId', 'toolCallId', 'content', 'role'),
  ],
  [EventType.THINKING_START, keys('title')],
  [EventType.THINKING_END, SHARED],
  [EventType.THINKING_TEXT_MESSAGE_START, SHARED],
  [EventType.THINKING_TEXT_MESSAGE_CONTENT, keys('delta')],
  [EventType.THINKING_TEXT_MESSAGE_END, SHARED],
  [EventType.STATE_SNAPSHOT, keys('snapshot')],
  [EventType.STATE_DELTA, keys('delta')],
  [EventType.MESSAGES_SNAPSHOT, keys('messages')],
  [
    EventType.ACTIVITY_SNAPSHOT,
    keys('messageId', 'activityType', 'content', 'replace'),
  ],
  [EventType.ACTIVITY_DELTA, keys('messageId', 'activityType', 'patch')],
  [EventType.RAW, keys('event', 'source')],
  [EventType.CUSTOM, keys('name', 'value')],
  [EventType.RUN_STARTED, keys('threadId', 'runId', 'parentRunId', 'input')],
  [
    EventType.RUN_FINISHED,
    keys('threadId', 'runId', 'result', 'outcome', 'usage'),
  ],
  [EventType.RUN_ERROR, keys('message', 'code', 'usage')],
  [EventType.STEP_STARTED, keys('stepName')],
  [EventType.STEP_FINISHED, keys('stepName')],
  [EventType.REASONING_START, keys('messageId')],
  [EventType.REASONING_MESSAGE_START, keys('messageId', 'role')],
  [EventType.REASONING_MESSAGE_CONTENT, keys('messageId', 'delta')],
  [EventType.REASONING_MESSAGE_END, keys('messageId')],
  [EventType.REASONING_MESSAGE_CHUNK, keys('messageId', 'delta')],
  [EventType.REASONING_END, keys('messageId')],
  [
    EventType.REASONING_ENCRYPTED_VALUE,
    keys('subtype', 'entityId', 'encryptedValue'),
  ],
])

export function specKeysFor(type: string): ReadonlySet<string> {
  return SPEC_KEYS.get(type) ?? SHARED
}

export function isSpecTopLevelKey(type: string, key: string): boolean {
  return specKeysFor(type).has(key)
}
