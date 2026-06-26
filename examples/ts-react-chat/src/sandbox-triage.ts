/** GitHub issue URL → repo + issue number. Throws on anything that isn't an issue URL. */
export function parseIssueUrl(url: string): { repo: string; issueNumber: number } {
  const match = url
    .trim()
    .match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)(?:[/?#].*)?$/i)
  if (!match) {
    throw new Error(
      'Enter a GitHub issue URL like https://github.com/owner/repo/issues/123',
    )
  }
  return { repo: `${match[1]}/${match[2]}`, issueNumber: Number(match[3]) }
}

export type Verdict = 'relevant' | 'not-relevant' | 'uncertain'

const VERDICTS: ReadonlySet<Verdict> = new Set([
  'relevant',
  'not-relevant',
  'uncertain',
])

/** Read the agent's required `VERDICT: <value>` first line. Returns null if missing/unknown. */
export function parseVerdict(text: string): Verdict | null {
  const line = text.split('\n').find((l) => /^\s*verdict\s*:/i.test(l))
  if (!line) return null
  const value = line.split(':')[1]?.trim().toLowerCase()
  return value && VERDICTS.has(value as Verdict) ? (value as Verdict) : null
}
