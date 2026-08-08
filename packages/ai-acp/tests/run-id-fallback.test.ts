import { describe, expect, it } from 'vitest'
import { resolveDurableRunId } from '@tanstack/ai-sandbox'

// This package (`@tanstack/ai-acp`) does not journal yet — see
// `packages/ai-sandbox/src/durability.ts`'s `resolveDurableRunId` and the
// Phase 3 plan's Task 5, which routes this adapter's `runId` fallback through
// the shared helper with `durable: false` hardcoded, NOT derived from
// whether a `SandboxDurabilityCapability` is wired. That is deliberate: since
// `compatible.ts` never journals, wiring durability elsewhere in an app must
// not suddenly force every ACP-backed run to supply a `runId`, or a caller
// gets a loud, unexplained failure for a guarantee this adapter cannot keep
// anyway. Once this adapter gains journaling, `durable` flips to a real
// capability check and this test's second case starts asserting the throw.
describe('acp runId resolution (packages/ai-acp/src/adapters/compatible.ts)', () => {
  it('still generates an id when none is supplied, since this adapter is not durable', () => {
    expect(
      resolveDurableRunId(undefined, {
        durable: false,
        adapter: 'acp',
        fallback: () => 'generated-1',
      }),
    ).toBe('generated-1')
  })

  it('passes a caller-supplied runId through unchanged', () => {
    expect(
      resolveDurableRunId('caller-run', {
        durable: false,
        adapter: 'acp',
        fallback: () => 'generated-1',
      }),
    ).toBe('caller-run')
  })
})
