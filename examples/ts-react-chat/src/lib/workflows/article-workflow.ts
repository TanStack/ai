import { z } from 'zod'
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import {
  approve,
  defineAgent,
  defineWorkflow,
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

const ArticleInput = z.object({ topic: z.string() })

const ArticleOutput = z.union([
  z.object({
    ok: z.literal(true),
    article: Draft,
  }),
  z.object({
    ok: z.literal(false),
    reason: z.string(),
  }),
])

const ArticleState = z.object({
  phase: z
    .enum(['drafting', 'reviewing', 'awaiting-approval', 'editing', 'done'])
    .default('drafting'),
  draft: Draft.optional(),
  legalReview: Review.optional(),
  skepticReview: Review.optional(),
})

// ===== Agents =====
const writer = defineAgent({
  name: 'writer',
  input: z.object({ topic: z.string() }),
  output: Draft,
  run: ({ input }) =>
    chat({
      adapter: openaiText('gpt-4o-mini'),
      outputSchema: Draft,
      systemPrompts: [
        'You are a non-fiction writer. Produce a factual three-paragraph article on the topic. Reply only with valid JSON matching the schema.',
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
      systemPrompts: [
        'You are an editor. Polish the draft, addressing the reviewer notes. Reply with the polished JSON.',
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
  initialize: () => ({ phase: 'drafting' as const }),
  run: async function* ({ input, state, agents }) {
    state.phase = 'drafting'
    const draft = yield* agents.writer({ topic: input.topic })
    state.draft = draft

    state.phase = 'reviewing'
    const legal = yield* agents.legal({ draft })
    state.legalReview = legal
    if (legal.verdict === 'block') {
      state.phase = 'done'
      return { ok: false as const, reason: `legal: ${legal.findings.join('; ')}` }
    }

    const skeptic = yield* agents.skeptic({ draft })
    state.skepticReview = skeptic
    if (skeptic.verdict === 'block') {
      state.phase = 'done'
      return { ok: false as const, reason: `skeptic: ${skeptic.findings.join('; ')}` }
    }

    state.phase = 'awaiting-approval'
    const decision = yield* approve({
      title: 'Publish this draft?',
      description: `"${draft.title}" passed both reviews.`,
    })
    if (!decision.approved) {
      state.phase = 'done'
      return { ok: false as const, reason: 'user denied' }
    }

    state.phase = 'editing'
    const final = yield* agents.editor({
      draft,
      notes: [...legal.findings, ...skeptic.findings],
    })
    state.draft = final
    state.phase = 'done'
    return { ok: true as const, article: final }
  },
})
