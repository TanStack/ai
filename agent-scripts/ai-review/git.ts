/**
 * Git commit and push helpers. All git I/O goes through an injected runner
 * so tests never spawn git.
 */

export type GitRunner = (
  args: Array<string>,
  cwd: string,
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
 * Push `HEAD` to `dest.ref` on `dest.remoteUrl` with `--force-with-lease`.
 *
 * Never uses a bare `--force`. Throws when git exits non-zero.
 *
 * @param cwd git working tree
 * @param runner injected git runner
 * @param dest remote URL and destination ref
 */
export async function pushHead(
  cwd: string,
  runner: GitRunner,
  dest: { remoteUrl: string; ref: string },
) {
  const args = [
    'push',
    '--force-with-lease',
    dest.remoteUrl,
    `HEAD:${dest.ref}`,
  ]
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
