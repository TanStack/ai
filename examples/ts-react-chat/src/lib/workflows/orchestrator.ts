import { z } from 'zod'
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import {
  approve,
  defineAgent,
  defineOrchestrator,
  defineRouter,
  defineWorkflow,
} from '@tanstack/ai-orchestration'

// ===== Schemas =====
const FeatureSpec = z.object({
  title: z.string(),
  summary: z.string(),
  files: z.array(z.string()),
})

const FilePatch = z.object({
  filename: z.string(),
  patch: z.string(),
})

const ImplementResult = z.object({
  patches: z.array(FilePatch),
  rationale: z.string(),
})

const OrchestratorState = z.object({
  phase: z
    .enum(['scoping', 'awaiting-approval', 'implementing', 'review', 'done'])
    .default('scoping'),
  spec: FeatureSpec.optional(),
  result: ImplementResult.optional(),
  /** The original request, kept for UI display across the run. */
  lastUserMessage: z.string().default(''),
  /**
   * Free-text the orchestrator still needs to address: the initial request on
   * turn 0, or a feedback note typed when the user denied approval. Cleared
   * the moment the spec agent absorbs it, so triage doesn't keep routing back
   * to 'spec' on every turn after the same message produced a spec.
   */
  pendingFeedback: z.string().default(''),
})

const OrchestratorInput = z.object({
  userMessage: z.string(),
  /**
   * Spec carried over from a prior finished run. When provided, the
   * orchestrator initializes mid-flow (phase: 'review') so the new
   * `userMessage` is treated as refinement feedback rather than a fresh
   * scoping request.
   */
  previousSpec: FeatureSpec.optional(),
  /** Implementation result carried over from a prior finished run. */
  previousResult: ImplementResult.optional(),
})
const OrchestratorOutput = z.object({
  phase: z.enum(['scoping', 'implementing', 'review', 'done']),
  result: ImplementResult.optional(),
})

// ===== Agents =====
const specAgent = defineAgent({
  name: 'spec',
  input: z.object({
    userMessage: z.string(),
    existingSpec: FeatureSpec.optional(),
  }),
  output: z.object({
    spec: FeatureSpec,
    ready: z.boolean(),
  }),
  run: ({ input }) =>
    chat({
      adapter: openaiText('gpt-4o-mini'),
      outputSchema: z.object({
        spec: FeatureSpec,
        ready: z.boolean(),
      }),
      stream: true,
      systemPrompts: [
        // Two modes — make refinement *explicit* and authoritative so the
        // model doesn't reinvent the stack. Without this guard gpt-4o-mini
        // happily replaces a `src/server.ts`/Express spec with `app.py`/Flask
        // when the new note doesn't repeat the original framework.
        input.existingSpec
          ? [
              'You are refining an existing feature spec.',
              'The Current Spec is the authoritative source of truth: keep its language, framework, file paths, file extensions, and architectural decisions. Do not switch frameworks or rewrite in another language unless the New Requirement explicitly asks you to.',
              'Apply the New Requirement as a minimal extension of the Current Spec — add or modify only what it asks for.',
              'Return the complete updated spec (title, summary, files) and set ready=true when it is implementation-ready.',
            ].join(' ')
          : 'Given a feature request, draft a concrete spec with title, summary, and the list of files to change. Mark ready=true when the spec is implementation-ready.',
      ],
      messages: [
        {
          role: 'user',
          content: input.existingSpec
            ? [
                'Current Spec (authoritative — preserve language, framework, file extensions, and architecture):',
                '```json',
                JSON.stringify(input.existingSpec, null, 2),
                '```',
                '',
                'New Requirement to incorporate:',
                input.userMessage,
              ].join('\n')
            : `Feature request: ${input.userMessage}`,
        },
      ],
    }),
})

const plannerAgent = defineAgent({
  name: 'planner',
  input: z.object({ spec: FeatureSpec }),
  output: z.object({
    files: z.array(z.string()),
    rationale: z.string(),
  }),
  run: ({ input }) =>
    chat({
      adapter: openaiText('gpt-4o-mini'),
      outputSchema: z.object({
        files: z.array(z.string()),
        rationale: z.string(),
      }),
      stream: true,
      systemPrompts: [
        'Given a spec, list the exact files that need patching and a one-paragraph rationale.',
      ],
      messages: [{ role: 'user', content: JSON.stringify(input.spec) }],
    }),
})

const coderAgent = defineAgent({
  name: 'coder',
  input: z.object({ filename: z.string(), spec: FeatureSpec }),
  output: FilePatch,
  run: ({ input }) =>
    chat({
      adapter: openaiText('gpt-4o-mini'),
      outputSchema: FilePatch,
      stream: true,
      systemPrompts: [
        'Generate a unified-diff-style patch for the given file based on the spec. Use a markdown code block in the `patch` field. The patch body MUST be valid source for the file\'s language (inferred from the extension — `.ts`/`.tsx` → TypeScript, `.js` → JavaScript, `.py` → Python, etc.). Do not switch languages or frameworks; match the conventions already implied by the file path.',
      ],
      messages: [
        {
          role: 'user',
          content: `File: ${input.filename}\nSpec: ${JSON.stringify(input.spec)}`,
        },
      ],
    }),
})

// ===== implement: sub-workflow used as an "agent" by the orchestrator =====
export const implementWorkflow = defineWorkflow({
  name: 'implement',
  input: z.object({ spec: FeatureSpec }),
  output: ImplementResult,
  state: z.object({}).default({}),
  agents: { planner: plannerAgent, coder: coderAgent },
  run: async function* ({ input, agents }) {
    const plan = yield* agents.planner({ spec: input.spec })
    const patches = []
    for (const filename of plan.files) {
      const patch = yield* agents.coder({ filename, spec: input.spec })
      patches.push(patch)
    }
    return { patches, rationale: plan.rationale }
  },
})

const reviewAgent = defineAgent({
  name: 'review',
  input: z.object({ result: ImplementResult, userMessage: z.string() }),
  output: z.object({
    verdict: z.enum(['accept', 'refine', 'reject']),
    notes: z.string(),
  }),
  run: ({ input }) =>
    chat({
      adapter: openaiText('gpt-4o-mini'),
      outputSchema: z.object({
        verdict: z.enum(['accept', 'refine', 'reject']),
        notes: z.string(),
      }),
      stream: true,
      systemPrompts: [
        "Read the user's feedback on the implementation. Decide accept | refine | reject.",
      ],
      messages: [
        {
          role: 'user',
          content: `Implementation:\n${JSON.stringify(input.result)}\n\nUser feedback: ${input.userMessage}`,
        },
      ],
    }),
})

const triageAgent = defineAgent({
  name: 'triage',
  input: z.object({
    pendingFeedback: z.string(),
    phase: z.string(),
    hasSpec: z.boolean(),
    hasResult: z.boolean(),
  }),
  output: z.object({
    next: z.enum(['spec', 'await-approval', 'implement', 'review', 'done']),
    reason: z.string(),
  }),
  run: ({ input }) =>
    chat({
      adapter: openaiText('gpt-4o-mini'),
      outputSchema: z.object({
        next: z.enum(['spec', 'await-approval', 'implement', 'review', 'done']),
        reason: z.string(),
      }),
      stream: true,
      systemPrompts: [
        'Decide the next phase. Phases: spec (draft or refine a spec from pendingFeedback), await-approval (request user OK to implement), implement (run code generation against the existing spec), review (consume user feedback after implementation), done (finish). Rules: if pendingFeedback is non-empty, return spec. If hasSpec=true and pendingFeedback is empty and hasResult=false, return await-approval. If hasResult=true and pendingFeedback is empty, return done.',
      ],
      messages: [{ role: 'user', content: JSON.stringify(input) }],
    }),
})

// ===== Orchestrator =====

const orchestratorConfig = {
  agents: {
    implement: implementWorkflow,
    review: reviewAgent,
    spec: specAgent,
    triage: triageAgent,
  },
  input: OrchestratorInput,
  output: OrchestratorOutput,
  state: OrchestratorState,
}

const featureRouter = defineRouter(
  orchestratorConfig,
  function* ({ agents, state, lastResult }) {
    // Fold the previous turn's agent output into state. The orchestrator
    // dispatches the chosen agent but doesn't know which slice of state its
    // output belongs in — the router does. Without this, triage stays blind
    // to its own decisions and loops forever between "spec" and "spec".
    if (lastResult) {
      if (
        state.phase === 'scoping' &&
        typeof lastResult === 'object' &&
        'spec' in (lastResult as Record<string, unknown>)
      ) {
        state.spec = (lastResult as { spec: typeof state.spec }).spec
        // Spec just consumed pendingFeedback — clear it so the next triage
        // turn doesn't keep routing back to 'spec' against the same note.
        state.pendingFeedback = ''
        // A new spec invalidates any prior implementation; without this,
        // refinement runs (which carry over previousResult) would short-
        // circuit to 'done' on the next triage instead of re-implementing
        // against the refined spec.
        state.result = undefined
      } else if (state.phase === 'implementing') {
        state.result = lastResult as typeof state.result
      }
    }

    const triage = yield* agents.triage({
      hasResult: !!state.result,
      hasSpec: !!state.spec,
      phase: state.phase,
      pendingFeedback: state.pendingFeedback,
    })

    if (triage.next === 'done') {
      state.phase = 'done'
      return {
        done: true,
        output: { phase: state.phase, result: state.result },
      }
    }

    if (triage.next === 'spec') {
      state.phase = 'scoping'
      return {
        agent: 'spec',
        input: {
          userMessage: state.pendingFeedback || state.lastUserMessage,
          // Feed the prior spec back in when refining so the model edits
          // rather than rewrites from scratch.
          existingSpec: state.spec,
        },
      }
    }

    if (triage.next === 'await-approval') {
      const approval = yield* approve({
        description: state.spec
          ? `Spec ready: "${state.spec.title}". Approve to implement, or deny with feedback to refine.`
          : 'Begin implementing?',
        title: 'Start implementation?',
      })
      if (approval.approved) {
        state.phase = 'implementing'
        if (!state.spec) throw new Error('No spec to implement')
        return { agent: 'implement', input: { spec: state.spec } }
      }
      // Deny: route back to spec carrying any free-text feedback the user
      // typed. The spec agent receives the existing spec + the new note so it
      // refines instead of restarting. We store the note in pendingFeedback,
      // not lastUserMessage — lastUserMessage stays as the original request
      // for UI display.
      state.phase = 'scoping'
      const feedback = approval.feedback?.trim()
      state.pendingFeedback = feedback || 'refine the spec'
      return {
        agent: 'spec',
        input: {
          userMessage: state.pendingFeedback,
          existingSpec: state.spec,
        },
      }
    }

    if (triage.next === 'implement') {
      state.phase = 'implementing'
      if (!state.spec) throw new Error('No spec to implement')
      return { agent: 'implement', input: { spec: state.spec } }
    }

    if (triage.next === 'review') {
      state.phase = 'review'
      if (!state.result) throw new Error('No result to review')
      return {
        agent: 'review',
        input: { result: state.result, userMessage: state.lastUserMessage },
      }
    }

    state.phase = 'done'
    return { done: true, output: { phase: state.phase, result: state.result } }
  },
)

export const featureOrchestrator = defineOrchestrator({
  ...orchestratorConfig,
  // Seed state from the input so a refinement run picks up where the
  // previous run left off. When the client passes `previousSpec` /
  // `previousResult`, we start the new run in 'review' phase — triage then
  // sees there's already a spec/result + a fresh user message and routes to
  // 'spec' (refine) rather than treating the message as a brand-new request.
  initialize: ({ input }) => {
    if (input.previousSpec) {
      return {
        lastUserMessage: input.userMessage,
        pendingFeedback: input.userMessage,
        spec: input.previousSpec,
        result: input.previousResult,
        phase: 'review' as const,
      }
    }
    return {
      lastUserMessage: input.userMessage,
      pendingFeedback: input.userMessage,
    }
  },
  name: 'feature-orchestrator',
  router: featureRouter,
})
