import type {
  GenerationReplayInput,
  GenerationRunIdentity,
} from './middleware/types'
import type { StreamChunk } from '../types'

export function rejectEventsOnlyReplay(
  replay: GenerationReplayInput<unknown> | undefined,
): void {
  if (replay?.events && !('result' in replay)) {
    throw new Error(
      'Generation replay with events requires stream: true or a replay.result.',
    )
  }
}

export function generationIdentityFields(identity: GenerationRunIdentity): {
  threadId?: string
  runId?: string
} {
  return {
    ...(identity.threadId !== undefined ? { threadId: identity.threadId } : {}),
    ...(identity.runId !== undefined ? { runId: identity.runId } : {}),
  }
}

export async function* replayGenerationEvents(
  replay: GenerationReplayInput<unknown>,
): AsyncIterable<StreamChunk> {
  if (!replay.events) return
  for await (const event of replay.events) {
    yield event
  }
}
