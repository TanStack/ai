/**
 * Call-site type-safety guard for `summarize({ adapter: grokSummarize(...) })`.
 *
 * Why this lives here: the assignability of a provider's summarize adapter to
 * the `summarize()` `adapter` param is only checked when `summarize()` is
 * actually *called* — merely constructing the adapter (as the rest of
 * `grok-adapter.test.ts` does) never instantiates the
 * `TAdapter extends SummarizeAdapter<string, object>` constraint. This file is
 * an *included*-package guard so the per-provider adapter -> activity contract
 * is exercised by CI without depending on the (excluded) example/testing apps.
 * See issue #820 (the CI gap this closes).
 *
 * These are POSITIVE assertions: `grokSummarize(...)` must be assignable to the
 * `summarize()` `adapter` param for every current Grok model. They originally
 * tracked the known options-shape bug (#821) with `@ts-expect-error`; that fix
 * landed (#854 removed the index signature from the Grok options), so a
 * regression now surfaces as a real type error here instead of silently.
 *
 * Compile-time only: `_callSiteTypeChecks` is never invoked, so no adapter is
 * constructed and no network call is made — the assertions exist purely to make
 * the call-site constraint visible to `tsc`.
 */
import { describe, expect, it } from 'vitest'
import { summarize } from '@tanstack/ai'
import { grokSummarize } from '../src/adapters/summarize'

// Never invoked — compile-time call-site assertions only.
function _callSiteTypeChecks() {
  void summarize({ adapter: grokSummarize('grok-4.3'), text: '' })
  void summarize({ adapter: grokSummarize('grok-build-0.1'), text: '' })
}

describe('grokSummarize -> summarize() call-site contract', () => {
  it('keeps the compile-time guard wired (see _callSiteTypeChecks)', () => {
    expect(typeof _callSiteTypeChecks).toBe('function')
  })
})
