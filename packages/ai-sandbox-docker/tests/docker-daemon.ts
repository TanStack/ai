/**
 * The Docker matrix's availability gate.
 *
 * WHAT THIS MATRIX IS THE AUTHORITY ON. Its image is `alpine:3`, so BusyBox 1.37,
 * where `find -newermt` and `find -printf` are unrecognised (exit 1, EMPTY stdout).
 * That is the trap `journalMtimeListCommand`'s `stat -c '%Y %n'` self-witness exists
 * to make impossible, and it is the only shell in this repository's test matrix that
 * sets it: on Windows the local-process provider execs through git-bash, whose `find`
 * and `stat` are GNU-flavoured, so a green local-process run says nothing about the
 * age gate's portability. `reaper-conformance.ts`'s module doc names this matrix as
 * the authority.
 *
 * NO DAEMON IS A NAMED SKIP, never a silent pass. An unreachable daemon is declared
 * `unsupported` with the reason, which the testkit renders as a named skip in the
 * reporter, so nobody mistakes a `0ms` green tick for coverage.
 *
 * KNOWN LIMIT: from inside the suite, a CI runner with no daemon is indistinguishable
 * from a laptop with no daemon, so if a runner image ever stops shipping Docker this
 * matrix degrades to skips and CI still reports green. The check that would catch it
 * belongs at the CI level (assert the suite ran), not here.
 */
import Dockerode from 'dockerode'

/**
 * Spread into a conformance config. Either nothing (run the suite) or the
 * `unsupported` declaration the testkit turns into a named skip.
 */
export type DockerDaemonGate =
  | Record<string, never>
  | { unsupported: { reason: string } }

/** The ping error as a message, without assuming it is an `Error`. */
function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

/** Ping the daemon and answer with the gate for `suite`. */
export async function dockerDaemonGate(
  suite: string,
): Promise<DockerDaemonGate> {
  const failure = await new Dockerode().ping().then(
    () => null,
    (reason: unknown) => describeError(reason),
  )
  if (failure === null) return {}
  return {
    unsupported: {
      reason: `${suite}: no Docker daemon reachable (${failure})`,
    },
  }
}

/** The boolean form, for `describe.skipIf` in the non-conformance provider suite. */
export async function dockerDaemonAvailable(suite: string): Promise<boolean> {
  const gate = await dockerDaemonGate(suite)
  return !('unsupported' in gate)
}
