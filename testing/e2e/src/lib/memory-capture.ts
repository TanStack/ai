/**
 * Per-testId capture for the `memory` mode of `/middleware-test`. A recorder
 * middleware placed AFTER `memoryMiddleware` records the config the model
 * actually sees (post-injection system prompts + tool names) plus a flag for
 * each deferred `save`. The page fetches it via
 * `GET /api/middleware-test?testId=...&kind=memory` and surfaces it in the DOM
 * for the Playwright spec. Mirrors `phase-capture.ts`.
 */

export interface MemoryConfigRecord {
  /** System-prompt strings present in the config at `init` (post memory injection). */
  systemPrompts: Array<string>
  /** Tool names present in the config at `init` (post memory injection). */
  toolNames: Array<string>
}

export interface MemoryCapture {
  /** One entry per `onConfig(init)` observed by the recorder. */
  configs: Array<MemoryConfigRecord>
  /** Count of `save` calls the fake adapter observed. */
  saveCount: number
}

const captures: Map<string, MemoryCapture> = new Map()

function bucketFor(captureId: string): MemoryCapture {
  let bucket = captures.get(captureId)
  if (!bucket) {
    bucket = { configs: [], saveCount: 0 }
    captures.set(captureId, bucket)
  }
  return bucket
}

export function resetMemoryCapture(captureId: string): void {
  captures.set(captureId, { configs: [], saveCount: 0 })
}

export function getMemoryCapture(captureId: string): MemoryCapture {
  return bucketFor(captureId)
}

export function recordMemoryConfig(
  captureId: string,
  record: MemoryConfigRecord,
): void {
  bucketFor(captureId).configs.push(record)
}

export function recordMemorySave(captureId: string): void {
  bucketFor(captureId).saveCount += 1
}
