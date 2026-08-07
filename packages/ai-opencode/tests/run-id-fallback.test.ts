/**
 * The OpenCode adapter does not journal yet (Phase 3), so its `runId`
 * resolution is routed through `resolveDurableRunId` with `durable: false`
 * purely so it inherits the caller-supplied-runId requirement automatically
 * once it does gain journaling, rather than re-deriving that enforcement
 * later. This asserts today's non-durable behavior is unchanged: a missing
 * `runId` still falls back to a generated id instead of throwing.
 */
import { describe, expect, it } from 'vitest'
import { resolveDurableRunId } from '@tanstack/ai-sandbox'

describe('opencode runId resolution', () => {
  it('still generates an id when none is supplied, since this adapter is not durable', () => {
    expect(
      resolveDurableRunId(undefined, {
        durable: false,
        adapter: 'opencode',
        fallback: () => 'generated-1',
      }),
    ).toBe('generated-1')
  })
})
