/**
 * Git commit and push helpers. All git I/O goes through an injected runner
 * so tests never spawn git.
 */

export type GitRunner = (
  args: Array<string>,
  cwd: string,
  /** Written to the child's stdin. `git apply -` reads its patch this way. */
  stdin?: string,
) => Promise<{ stdout: string; stderr: string; code: number }>

function gitFailed(
  args: Array<string>,
  result: { stdout: string; stderr: string; code: number },
) {
  const detail = result.stderr.trim() || result.stdout.trim()
  const suffix = detail.length > 0 ? `: ${detail}` : ''
  throw new Error(`git ${args.join(' ')} exited ${result.code}${suffix}`)
}

/**
 * The commit checked out in `cwd`.
 *
 * The sweep fetches a PR head before it reads the PR over REST, so this is
 * what binds the two together: the security scan covers the file list at the
 * REST head SHA, and the agent only runs when this tree is that same commit.
 *
 * @param cwd git working tree
 * @param runner injected git runner
 */
export async function headSha(cwd: string, runner: GitRunner) {
  const args = ['rev-parse', 'HEAD']
  const result = await runner(args, cwd)
  if (result.code !== 0) {
    gitFailed(args, result)
  }
  return result.stdout.trim()
}

/**
 * Stage every change in `cwd` and commit with `identity`.
 *
 * Runs `git add -A`, then `git -c user.name= -c user.email= commit -m`.
 * Returns `{ committed: false }` when commit exits 1 because there is
 * nothing to commit. Other non-zero exits throw.
 *
 * @param cwd git working tree
 * @param message commit message
 * @param runner injected git runner
 * @param identity author and committer name and email
 */
export async function commitAll(
  cwd: string,
  message: string,
  runner: GitRunner,
  identity: { name: string; email: string },
) {
  const addArgs = ['add', '-A']
  const add = await runner(addArgs, cwd)
  if (add.code !== 0) {
    gitFailed(addArgs, add)
  }

  const commitArgs = [
    '-c',
    `user.name=${identity.name}`,
    '-c',
    `user.email=${identity.email}`,
    'commit',
    '-m',
    message,
  ]
  const commit = await runner(commitArgs, cwd)
  if (commit.code === 0) {
    return { committed: true }
  }

  const output = `${commit.stdout}\n${commit.stderr}`
  const isEmptyCommit =
    commit.code === 1 && output.includes('nothing to commit')
  if (isEmptyCommit) {
    return { committed: false }
  }

  gitFailed(commitArgs, commit)
}

/**
 * Stage everything in `cwd` and return it as a patch.
 *
 * This is how the agent's edits cross from the review job to the publish job.
 * A patch is inert: the publish job applies it, it never runs it.
 *
 * @param cwd git working tree
 * @param runner injected git runner
 */
export async function stagedPatch(cwd: string, runner: GitRunner) {
  const addArgs = ['add', '-A']
  const add = await runner(addArgs, cwd)
  if (add.code !== 0) {
    gitFailed(addArgs, add)
  }
  const diffArgs = ['diff', '--cached', '--binary']
  const diff = await runner(diffArgs, cwd)
  if (diff.code !== 0) {
    gitFailed(diffArgs, diff)
  }
  return diff.stdout
}

/**
 * Apply a patch from the review job to `cwd`.
 *
 * Returns false when it does not apply — a branch that moved, or a patch that
 * was never coherent. A refusal is normal, so it must not throw and kill the
 * rest of the publish run.
 *
 * @param cwd git working tree at the PR head
 * @param patch patch text from `stagedPatch`
 * @param runner injected git runner
 */
export async function applyPatch(
  cwd: string,
  patch: string,
  runner: GitRunner,
) {
  if (patch.trim().length === 0) return false
  const result = await runner(['apply', '--whitespace=nowarn', '-'], cwd, patch)
  return result.code === 0
}

/**
 * Push `HEAD` to `dest.ref` on `dest.remoteUrl` with `--force-with-lease`.
 *
 * `expectSha` pins the lease to the commit the caller resolved, so a branch
 * that moved since then is refused rather than overwritten. Without it git
 * leases against its own remote-tracking ref, which a fresh worktree has just
 * fetched — that would make the lease agree with whatever is there now.
 *
 * Never uses a bare `--force`. Throws when git exits non-zero.
 *
 * @param cwd git working tree
 * @param runner injected git runner
 * @param dest remote URL, destination ref, and expected current SHA
 */
export async function pushHead(
  cwd: string,
  runner: GitRunner,
  dest: { remoteUrl: string; ref: string; expectSha?: string },
) {
  const lease =
    dest.expectSha === undefined
      ? '--force-with-lease'
      : `--force-with-lease=${dest.ref}:${dest.expectSha}`
  const args = ['push', lease, dest.remoteUrl, `HEAD:${dest.ref}`]
  const result = await runner(args, cwd)
  if (result.code !== 0) {
    gitFailed(args, result)
  }
}

/**
 * HTTPS remote URL for pushing the PR head, with an access token.
 *
 * Same-repo PRs use `originRepo`. Forks use `headRepo`.
 *
 * @param opts fork flag, origin/head repos, and token
 */
export function headRemoteUrl(opts: {
  isFork: boolean
  originRepo: string
  headRepo: string
  token: string
}) {
  const repo = opts.isFork ? opts.headRepo : opts.originRepo
  return `https://x-access-token:${opts.token}@github.com/${repo}.git`
}
