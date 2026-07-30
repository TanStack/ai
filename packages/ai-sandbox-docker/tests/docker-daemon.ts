/**
 * The Docker matrix's availability gate, and the reason it is not just a
 * `describe.skipIf`.
 *
 * WHAT THE DOCKER MATRIX IS THE AUTHORITY ON. Its image is `alpine:3` — BusyBox
 * 1.37, where `find -newermt` and `find -printf` are unrecognised (exit 1, EMPTY
 * stdout). That is the trap `journalMtimeListCommand`'s `stat -c '%Y %n'`
 * self-witness exists to make impossible, and it is the only shell in this
 * repository's test matrix that sets it: on Windows the local-process provider
 * execs through git-bash, whose `find`/`stat` are GNU-flavoured, so a green
 * local-process run says nothing about the age gate's portability. See
 * `reaper-conformance.ts`'s module doc, which names this matrix as the authority.
 *
 * WHY `it.skip` ALONE IS NOT SAFE. It always exits 0, and from inside the suite a
 * CI runner with no daemon is indistinguishable from a developer's laptop with no
 * daemon. So a change to the runner image — Docker removed, the socket moved, the
 * daemon not started — would silently reduce that authority to a `↓` line and
 * still report green. The age gate would then be covered by nothing at all, and
 * nobody would be told.
 *
 * THE GATE. `REQUIRE_DOCKER` distinguishes the two environments, because only the
 * environment can:
 *
 * - **unset** (a laptop) — an unreachable daemon is declared `unsupported`, which
 *   renders as a NAMED skip carrying the reason. Visible in the reporter, never a
 *   silent `✓ 0ms` that reads as coverage.
 * - **set** (CI, wired in `.github/workflows/pr.yml`) — an unreachable daemon is a
 *   HARD FAILURE naming the ping error. This throws during module evaluation, so
 *   Vitest fails the file at collection and the run exits non-zero.
 *
 * `'0'` and the empty string count as unset, so `REQUIRE_DOCKER=0` is a usable
 * local override rather than a surprise.
 */
import Dockerode from 'dockerode'

/**
 * Spread into a conformance config. Either nothing (run the suite) or the
 * `unsupported` declaration the testkit turns into a named skip.
 */
export type DockerDaemonGate =
  | Record<string, never>
  | { unsupported: { reason: string } }

const REQUIRE_DOCKER = 'REQUIRE_DOCKER'

function dockerIsRequired(): boolean {
  const value = process.env[REQUIRE_DOCKER]
  return value !== undefined && value !== '' && value !== '0'
}

/** The ping error as a message, without assuming it is an `Error`. */
function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

/**
 * Ping the daemon and answer with the gate for `suite`.
 *
 * Throws instead of answering when `REQUIRE_DOCKER` is set and the ping failed —
 * see the module doc for why that is the only way a runner-image regression is
 * distinguishable from a laptop.
 */
export async function dockerDaemonGate(
  suite: string,
): Promise<DockerDaemonGate> {
  const failure = await new Dockerode().ping().then(
    () => null,
    (reason: unknown) => describeError(reason),
  )
  if (failure === null) return {}
  if (dockerIsRequired()) {
    throw new Error(
      `${suite}: no Docker daemon is reachable, and ${REQUIRE_DOCKER} is set. ` +
        `This matrix is the authority on the age gate's portability (BusyBox 1.37 via alpine:3) ` +
        `and must not degrade to a skip in CI. Docker ping failed: ${failure}`,
    )
  }
  return { unsupported: { reason: 'no Docker daemon reachable' } }
}

/**
 * The boolean form, for `describe.skipIf` in the non-conformance provider suite.
 *
 * Same `REQUIRE_DOCKER` contract: it throws rather than answering `false` when a
 * daemon was required, so no gate in this package can silently demote.
 */
export async function dockerDaemonAvailable(suite: string): Promise<boolean> {
  const gate = await dockerDaemonGate(suite)
  return !('unsupported' in gate)
}
