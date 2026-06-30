#!/usr/bin/env node
/**
 * Maintainer smoke runner for TanStack AI sandbox primitives.
 *
 * Default run (phase 0) is offline: unit tests for @tanstack/ai-sandbox and
 * @tanstack/ai-sandbox-local-process. No network or API keys required.
 *
 * Optional phases (auto-detected or env-gated):
 *
 *   Phase 1 — Docker provider
 *     Auto-runs when `docker info` succeeds.
 *     May pull images on first run (network).
 *
 *   Phase 2 — Daytona provider
 *     Set DAYTONA_API_KEY to run @tanstack/ai-sandbox-daytona live tests.
 *
 *   Phase 3 — Vercel provider
 *     Set VERCEL_TOKEN (or VERCEL_OIDC_TOKEN), VERCEL_TEAM_ID, and
 *     VERCEL_PROJECT_ID to run @tanstack/ai-sandbox-vercel live tests.
 *
 *   Phase 4 — Claude Code harness live smoke
 *     Set CLAUDE_CODE_E2E=1 plus ANTHROPIC_API_KEY (or a local `claude login`).
 *     Runs the gated Playwright smoke in testing/e2e/tests/claude-code.spec.ts.
 *
 * Usage:
 *   node scripts/sandbox-live-smoke.mjs
 *   CLAUDE_CODE_E2E=1 node scripts/sandbox-live-smoke.mjs
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

/** @type {Array<{ phase: string; status: 'pass' | 'fail' | 'skip'; detail?: string }>} */
const results = []

function section(title) {
  console.log(`\n${'='.repeat(64)}`)
  console.log(title)
  console.log('='.repeat(64))
}

function record(phase, status, detail) {
  results.push({ phase, status, detail })
  const icon = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'SKIP'
  const suffix = detail ? ` — ${detail}` : ''
  console.log(`[${icon}] ${phase}${suffix}`)
}

function runPnpm(args, label) {
  const result = spawnSync('pnpm', args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status === 0) {
    record(label, 'pass')
    return true
  }
  const detail =
    result.error?.message ??
    (result.signal ? `signal ${result.signal}` : `exit ${result.status ?? 1}`)
  record(label, 'fail', detail)
  return false
}

function dockerAvailable() {
  const result = spawnSync('docker', ['info'], {
    cwd: repoRoot,
    stdio: 'ignore',
  })
  return result.status === 0
}

function hasVercelCreds() {
  return (
    !!(process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN) &&
    !!process.env.VERCEL_TEAM_ID &&
    !!process.env.VERCEL_PROJECT_ID
  )
}

let failed = false

section('Phase 0 — core unit tests (offline, no network)')

if (
  !runPnpm(
    ['--filter', '@tanstack/ai-sandbox', 'test:lib'],
    '@tanstack/ai-sandbox test:lib',
  )
) {
  failed = true
}

if (
  !runPnpm(
    ['--filter', '@tanstack/ai-sandbox-local-process', 'test:lib'],
    '@tanstack/ai-sandbox-local-process test:lib',
  )
) {
  failed = true
}

section('Phase 1 — Docker provider (optional, auto when daemon is reachable)')

if (dockerAvailable()) {
  if (
    !runPnpm(
      ['--filter', '@tanstack/ai-sandbox-docker', 'test:lib'],
      '@tanstack/ai-sandbox-docker test:lib',
    )
  ) {
    failed = true
  }
} else {
  record(
    '@tanstack/ai-sandbox-docker test:lib',
    'skip',
    'docker info failed — no daemon',
  )
}

section('Phase 2 — Daytona provider (optional, DAYTONA_API_KEY)')

if (process.env.DAYTONA_API_KEY) {
  if (
    !runPnpm(
      ['--filter', '@tanstack/ai-sandbox-daytona', 'test:lib'],
      '@tanstack/ai-sandbox-daytona test:lib',
    )
  ) {
    failed = true
  }
} else {
  record(
    '@tanstack/ai-sandbox-daytona test:lib',
    'skip',
    'set DAYTONA_API_KEY to enable',
  )
}

section('Phase 3 — Vercel provider (optional, VERCEL_TOKEN + team/project)')

if (hasVercelCreds()) {
  if (
    !runPnpm(
      ['--filter', '@tanstack/ai-sandbox-vercel', 'test:lib'],
      '@tanstack/ai-sandbox-vercel test:lib',
    )
  ) {
    failed = true
  }
} else {
  record(
    '@tanstack/ai-sandbox-vercel test:lib',
    'skip',
    'set VERCEL_TOKEN (or VERCEL_OIDC_TOKEN), VERCEL_TEAM_ID, VERCEL_PROJECT_ID',
  )
}

section('Phase 4 — Claude Code harness live smoke (optional, CLAUDE_CODE_E2E)')

if (process.env.CLAUDE_CODE_E2E) {
  if (
    !runPnpm(
      [
        '--filter',
        '@tanstack/ai-e2e',
        'test:e2e',
        '--',
        '--grep',
        'claude-code',
      ],
      'testing/e2e claude-code live smoke',
    )
  ) {
    failed = true
  }
} else {
  record(
    'testing/e2e claude-code live smoke',
    'skip',
    'set CLAUDE_CODE_E2E=1 and ANTHROPIC_API_KEY (or claude login)',
  )
}

section('Summary')

const passed = results.filter((r) => r.status === 'pass').length
const skipped = results.filter((r) => r.status === 'skip').length
const failedCount = results.filter((r) => r.status === 'fail').length

for (const { phase, status, detail } of results) {
  const icon = status === 'pass' ? '✓' : status === 'fail' ? '✗' : '○'
  const suffix = detail ? ` (${detail})` : ''
  console.log(`  ${icon} ${phase}${suffix}`)
}

console.log(
  `\n${passed} passed, ${failedCount} failed, ${skipped} skipped (of ${results.length} phases)`,
)

if (failed) {
  console.error('\nSandbox smoke FAILED')
  process.exit(1)
}

console.log('\nSandbox smoke PASSED')
process.exit(0)
