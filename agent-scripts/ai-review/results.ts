/**
 * The handoff file between the review job and the publish job.
 *
 * TRUST BOUNDARY. The review job runs an auto-approving agent over untrusted
 * PR code, so everything in this file is attacker-controlled if that agent is
 * compromised. The publish job holds the PAT, so it must never take an
 * authoritative fact from here.
 *
 * That is why an entry carries so little. Which PRs were eligible, which head
 * each one is at, whether the malware scan passed, where a push may go — the
 * publish job derives all of that from the GitHub API itself. Only three
 * things come across, and none of them can redirect a write:
 *
 *   - `number`, which the publish job accepts only if its own, independent
 *     selection pass also chose that PR
 *   - `verdict`, which picks a label and some comment text
 *   - `patch`, which is applied to the API-derived head and pushed to the
 *     API-derived fork ref under a lease pinned to the API-derived SHA
 *
 * A compromised review job can therefore mislabel and miscomment on a PR the
 * sweep already selected, and push its own diff to that PR's own branch. It
 * cannot name a different repo, a different ref, or fake a clean scan.
 */

import process from 'node:process'
import { readFile, writeFile } from 'node:fs/promises'
import type { ReviewVerdict } from './verdict.ts'
import { parseVerdict } from './verdict.ts'

/** One reviewed pull: the agent's verdict plus its edits as a git patch. */
export type ReviewedPull = {
  number: number
  verdict: ReviewVerdict
  patch: string
}

export type ReviewResultsFile = { results: Array<ReviewedPull> }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseReviewedPull(raw: unknown): ReviewedPull {
  if (!isRecord(raw)) throw new Error('review result is not an object')
  if (
    typeof raw.number !== 'number' ||
    !Number.isInteger(raw.number) ||
    raw.number <= 0
  ) {
    throw new Error('review result has no valid number')
  }
  if (typeof raw.patch !== 'string') {
    throw new Error(`review result #${String(raw.number)} has no patch string`)
  }
  return {
    number: raw.number,
    // parseVerdict is the existing schema guard for this payload.
    verdict: parseVerdict(raw.verdict),
    patch: raw.patch,
  }
}

/**
 * Parse the review job's output. Throws on anything malformed rather than
 * letting a half-understood payload reach the job that holds the token.
 */
export function parseResultsFile(raw: unknown): ReviewResultsFile {
  if (!isRecord(raw) || !Array.isArray(raw.results)) {
    throw new Error('results file has no results array')
  }
  const results = []
  const seen = new Set<number>()
  for (const item of raw.results) {
    const parsed = parseReviewedPull(item)
    // One entry per PR, so a duplicate cannot race two pushes at one branch.
    if (seen.has(parsed.number)) {
      throw new Error(`results file repeats #${String(parsed.number)}`)
    }
    seen.add(parsed.number)
    results.push(parsed)
  }
  return { results }
}

/**
 * Where the review job writes and the publish job reads. The workflow passes
 * this between two jobs as an artifact, so both halves must agree on it.
 */
export function resultsPath() {
  return process.env.AI_REVIEW_RESULTS ?? 'ai-review-results.json'
}

/** Write the review job's output for the publish job to pick up. */
export async function writeResults(path: string, file: ReviewResultsFile) {
  await writeFile(path, JSON.stringify(file, null, 2), 'utf8')
}

/**
 * Read and validate the review job's output. A missing file is an empty run,
 * not an error: the review job may have selected nothing.
 */
export async function readResults(path: string): Promise<ReviewResultsFile> {
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (
      isRecord(error) &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return { results: [] }
    }
    throw error
  }
  return parseResultsFile(JSON.parse(text) as unknown)
}
