import { z } from 'zod'
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import {
  approve,
  defineAgent,
  defineWorkflow,
  fail,
  succeed,
} from '@tanstack/ai-orchestration'

// ===== Schemas =====
const Draft = z.object({
  title: z.string(),
  paragraphs: z.array(z.string()),
})

const Review = z.object({
  verdict: z.enum(['pass', 'block']),
  findings: z.array(z.string()),
})

export const ArticleInput = z.object({ topic: z.string() })

export const ArticleOutput = z.union([
  z.object({
    ok: z.literal(true),
    article: Draft,
  }),
  z.object({
    ok: z.literal(false),
    reason: z.string(),
  }),
])

export const ArticleState = z.object({
  phase: z
    .enum([
      'drafting',
      'reviewing',
      'editing',
      'awaiting-approval',
      'revising',
      'done',
    ])
    .default('drafting'),
  draft: Draft.optional(),
  legalReview: Review.optional(),
  skepticReview: Review.optional(),
})

type DraftResult = z.infer<typeof Draft>
type ReviewResult = z.infer<typeof Review>

const MAX_SKEPTIC_REVISIONS = 3

function reviewFindings(review: ReviewResult): Array<string> {
  return review.findings
    .map((finding) => finding.trim())
    .filter((finding) => finding.length > 0)
}

function shouldReviseForReview(review: ReviewResult): boolean {
  return review.verdict === 'block' || reviewFindings(review).length > 0
}

function formatReviewFailure(role: string, review: ReviewResult): string {
  const findings = reviewFindings(review)
  return `${role}: ${findings.length > 0 ? findings.join('; ') : 'blocked without findings'}`
}

// ===== Agents =====
const writer = defineAgent({
  name: 'writer',
  input: z.object({ topic: z.string() }),
  output: Draft,
  run: ({ input }) =>
    chat({
      adapter: openaiText('gpt-4o-mini'),
      outputSchema: Draft,
      stream: true,
      systemPrompts: [
        'You are a non-fiction writer. Produce a factual three-paragraph article on the topic. Keep claims precise and avoid unsupported cultural, medical, or historical specifics. Reply only with valid JSON matching the schema.',
      ],
      messages: [{ role: 'user', content: input.topic }],
    }),
})

function reviewerFor(role: 'legal' | 'skeptic') {
  return defineAgent({
    name: `${role}Reviewer`,
    input: z.object({ draft: Draft }),
    output: Review,
    run: ({ input }) =>
      chat({
        adapter: openaiText('gpt-4o-mini'),
        outputSchema: Review,
        stream: true,
        systemPrompts: [
          role === 'legal'
            ? 'You are a legal reviewer. Flag any compliance issues. Verdict "block" if issues, otherwise "pass".'
            : 'You are a skeptic. Flag unsupported claims. Verdict "block" if claims are unsupported.',
        ],
        messages: [
          {
            role: 'user',
            content: `Title: ${input.draft.title}\n\n${input.draft.paragraphs.join('\n\n')}`,
          },
        ],
      }),
  })
}

const editor = defineAgent({
  name: 'editor',
  input: z.object({
    draft: Draft,
    notes: z.array(z.string()),
  }),
  output: Draft,
  run: ({ input }) =>
    chat({
      adapter: openaiText('gpt-4o-mini'),
      outputSchema: Draft,
      stream: true,
      systemPrompts: [
        'You are an editor. Rewrite the draft to address every reviewer note. Remove or narrow unsupported claims instead of inventing citations. Reply with the polished JSON.',
      ],
      messages: [
        {
          role: 'user',
          content: `Draft: ${JSON.stringify(input.draft)}\n\nNotes: ${input.notes.join('; ')}`,
        },
      ],
    }),
})

// ===== Workflow =====
export const articleWorkflow = defineWorkflow({
  name: 'article-workflow',
  input: ArticleInput,
  output: ArticleOutput,
  state: ArticleState,
  agents: {
    writer,
    legal: reviewerFor('legal'),
    skeptic: reviewerFor('skeptic'),
    editor,
  },
  // defineWorkflow requires an AsyncGenerator; yielded agents provide the async boundaries.
  // eslint-disable-next-line @typescript-eslint/require-await
  run: async function* ({ input, state, agents }) {
    state.phase = 'drafting'
    const draft = yield* agents.writer({ topic: input.topic })
    state.draft = draft
    let current: DraftResult = draft
    let revisedFromSkepticFeedback = false

    state.phase = 'reviewing'
    const legal = yield* agents.legal({ draft })
    state.legalReview = legal
    if (legal.verdict === 'block') {
      return fail(formatReviewFailure('legal', legal))
    }

    let skeptic = yield* agents.skeptic({ draft: current })
    state.skepticReview = skeptic

    for (let round = 0; shouldReviseForReview(skeptic); round++) {
      if (round >= MAX_SKEPTIC_REVISIONS) {
        return fail(formatReviewFailure('skeptic', skeptic))
      }

      state.phase = 'revising'
      revisedFromSkepticFeedback = true
      current = yield* agents.editor({
        draft: current,
        notes: [...reviewFindings(legal), ...reviewFindings(skeptic)],
      })
      state.draft = current

      state.phase = 'reviewing'
      skeptic = yield* agents.skeptic({ draft: current })
      state.skepticReview = skeptic
    }

    state.phase = 'editing'
    if (!revisedFromSkepticFeedback) {
      current = yield* agents.editor({
        draft,
        notes: [...reviewFindings(legal), ...reviewFindings(skeptic)],
      })
      state.draft = current
    }

    for (let round = 0; round < 4; round++) {
      state.phase = 'awaiting-approval'
      const decision = yield* approve({
        title: round === 0 ? 'Publish this article?' : 'Publish the revision?',
        description: current.title,
      })
      if (decision.approved) {
        state.phase = 'done'
        return succeed({ article: current })
      }
      if (!decision.feedback || !decision.feedback.trim()) {
        state.phase = 'done'
        return fail('user denied')
      }
      state.phase = 'revising'
      current = yield* agents.editor({
        draft: current,
        notes: [decision.feedback],
      })
      state.draft = current
    }
    return fail('too many revision rounds')
  },
})
