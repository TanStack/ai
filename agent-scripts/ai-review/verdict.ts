/**
 * Structured review verdict from chat({ outputSchema }).
 * parseVerdict is the trust boundary for that payload.
 */

export interface ReviewIssue {
  severity: 'bug' | 'suggestion' | 'nit'
  file: string
  line: number
  description: string
  suggestion: string
}

export interface ReviewVerdict {
  verdict: 'reject' | 'polish' | 'ready'
  issues: Array<ReviewIssue>
}

export const reviewVerdictSchema = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['reject', 'polish', 'ready'] },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['bug', 'suggestion', 'nit'] },
          file: { type: 'string' },
          line: { type: 'integer' },
          description: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['severity', 'file', 'line', 'description', 'suggestion'],
      },
    },
  },
  required: ['verdict', 'issues'],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isVerdict(value: unknown): value is ReviewVerdict['verdict'] {
  return value === 'reject' || value === 'polish' || value === 'ready'
}

function isSeverity(value: unknown): value is ReviewIssue['severity'] {
  return value === 'bug' || value === 'suggestion' || value === 'nit'
}

function fail(message: string): never {
  throw new Error(`Invalid review output: ${message}`)
}

function parseIssue(raw: unknown, index: number) {
  if (!isRecord(raw)) fail(`issues[${index}] must be an object`)
  if (!('severity' in raw)) fail(`issues[${index}] is missing severity`)
  if (!isSeverity(raw.severity)) fail(`issues[${index}] has unknown severity`)
  if (!('file' in raw) || typeof raw.file !== 'string') {
    fail(`issues[${index}] is missing file`)
  }
  if (!('line' in raw) || !Number.isInteger(raw.line)) {
    fail(`issues[${index}] is missing line`)
  }
  if (!('description' in raw) || typeof raw.description !== 'string') {
    fail(`issues[${index}] is missing description`)
  }
  if (!('suggestion' in raw) || typeof raw.suggestion !== 'string') {
    fail(`issues[${index}] is missing suggestion`)
  }
  return {
    severity: raw.severity,
    file: raw.file,
    line: raw.line,
    description: raw.description,
    suggestion: raw.suggestion,
  }
}

/**
 * Parse chat({ outputSchema }) result. Throws if the shape is wrong.
 */
export function parseVerdict(payload: unknown) {
  if (!isRecord(payload)) fail('must be an object')
  if (!('verdict' in payload)) fail('missing verdict')
  if (!isVerdict(payload.verdict)) fail('unknown verdict')
  if (!('issues' in payload)) fail('missing issues')
  if (!Array.isArray(payload.issues)) fail('issues must be an array')
  const issues = payload.issues.map((item, index) => parseIssue(item, index))
  return { verdict: payload.verdict, issues }
}

/**
 * Pick the bot label for a verdict.
 *
 * `pushLanded` only changes `polish`: true is `ai-ready`, false is `ai-needs-work`.
 */
export function reviewLabelFor(
  verdict: ReviewVerdict['verdict'],
  pushLanded: boolean,
) {
  switch (verdict) {
    case 'reject':
      return 'ai-rejected'
    case 'ready':
      return 'ai-ready'
    case 'polish':
      return pushLanded ? 'ai-ready' : 'ai-needs-work'
  }
}
