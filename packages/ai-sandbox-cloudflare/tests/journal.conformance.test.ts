/**
 * Journal conformance for the Cloudflare provider.
 *
 * Every other remote provider registers the shared suite so its journal claims
 * are falsifiable — measured with credentials, a NAMED skip without them.
 * Cloudflare was the one provider that registered nothing, which is the silent
 * omission the suite's own module doc forbids: the provider row in
 * `docs/sandbox/providers.md` claimed coverage this directory did not have.
 *
 * The gate here is the RUNTIME, not credentials: `cloudflareSandbox` can only
 * create a sandbox through a `Sandbox` Durable Object binding backed by a
 * deployed container image, and that binding exists only inside a Workers
 * runtime. No environment variable makes it reachable from this Node test
 * process, so the suite is registered as an unconditional named skip — it
 * prints `↓` with this reason instead of not existing. Measuring for real
 * means running the suite from a Workers-runtime harness (e.g.
 * `@cloudflare/vitest-pool-workers` with a containers-enabled miniflare), and
 * this file is where that lands when it does.
 *
 * `followUnsupported` is declared because `CLOUDFLARE_CAPS.killableProcesses`
 * is `false` (see `handle.test.ts`, which measures WHY against the wrapper:
 * `kill()` is a no-op and no `AbortSignal` crosses the Workers RPC boundary).
 * If the capability ever flips, the always-running declaration check fails
 * this suite rather than quietly dropping the follow coverage.
 */
import { runJournalConformance } from '@tanstack/ai-sandbox/testkit'

runJournalConformance({
  name: 'cloudflare',
  // Unreachable while `unsupported` is declared; kept honest instead of stubbed.
  createHandle: () =>
    Promise.reject(
      new Error(
        'cloudflare journal conformance needs a Workers runtime with a Sandbox Durable Object binding',
      ),
    ),
  followUnsupported: {
    reason:
      "killableProcesses is false — kill() is a no-op and the caller's AbortSignal reaches neither exec nor spawn (Workers RPC cannot serialize one), so a spawned follower could never be reclaimed",
  },
  unsupported: {
    reason:
      'requires a Workers runtime with a Sandbox Durable Object binding backed by a deployed container image — no credential set makes that reachable from a Node vitest process',
  },
})
