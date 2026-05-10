import { z } from 'zod'
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import {
  defineAgent,
  defineOrchestrator,
  defineWorkflow,
  type AgentMap,
  type RouterDecision,
  type StepGenerator,
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
  lastUserMessage: z.string().default(''),
})

const OrchestratorInput = z.object({ userMessage: z.string() })
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
      systemPrompts: [
        'Given a feature request, refine it into a concrete spec with title, summary, and files to change. Mark ready=true when the spec is implementation-ready.',
      ],
      messages: [
        {
          role: 'user',
          content:
            `Feature request: ${input.userMessage}\n\n` +
            (input.existingSpec
              ? `Existing draft: ${JSON.stringify(input.existingSpec)}`
              : ''),
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
      systemPrompts: [
        'Generate a unified-diff-style patch for the given file based on the spec. Use a markdown code block in the `patch` field.',
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
    userMessage: z.string(),
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
        next: z.enum([
          'spec',
          'await-approval',
          'implement',
          'review',
          'done',
        ]),
        reason: z.string(),
      }),
      systemPrompts: [
        'Decide the next phase given current state. Phases: spec (refine the spec), await-approval (request user OK to implement), implement (run code generation), review (read user feedback), done (finish).',
      ],
      messages: [{ role: 'user', content: JSON.stringify(input) }],
    }),
})

// ===== Orchestrator =====

// v1 ergonomics gap: the router runs outside the BoundAgents context so
// specific-agent types can't reach here. RouterDecision<AgentMap> is wider
// than RouterDecision<specificAgents> due to the contravariant `agent` key.
// Extracting the router and casting it `as any` is the v1 workaround; fix in
// v2 by threading TAgents all the way into the router signature.
function* featureRouter({
  input,
  state,
}: {
  input: { userMessage: string }
  state: {
    phase: string
    spec?: { title: string; summary: string; files: Array<string> }
    result?: {
      patches: Array<{ filename: string; patch: string }>
      rationale: string
    }
    lastUserMessage: string
  }
}): StepGenerator<RouterDecision<AgentMap, any>> {
    // Inline triage call. The orchestrator's router runs outside the bound
    // agents context (v1 ergonomics gap), so we yield raw step descriptors.
    const triageDescriptor = {
      kind: 'agent' as const,
      name: 'triage',
      input: {
        userMessage: state.lastUserMessage || input.userMessage,
        phase: state.phase,
        hasSpec: !!state.spec,
        hasResult: !!state.result,
      },
      agent: triageAgent,
    }
    const triageResult = (yield triageDescriptor) as unknown as {
      next: 'spec' | 'await-approval' | 'implement' | 'review' | 'done'
      reason: string
    }

    if (triageResult.next === 'done') {
      return {
        done: true as const,
        output: {
          phase: state.phase as 'scoping' | 'implementing' | 'review' | 'done',
          result: state.result,
        },
      }
    }

    if (triageResult.next === 'spec') {
      state.phase = 'scoping'
      return {
        agent: 'spec' as const,
        input: { userMessage: state.lastUserMessage },
      }
    }

    if (triageResult.next === 'await-approval') {
      // yield* approve() causes a TNext mismatch inside the router generator
      // (v1 ergonomics gap: approve's TNext=ApprovalResult conflicts with
      // the router's TNext=RouterDecision). Yield the descriptor directly.
      const approvalDescriptor = {
        kind: 'approval' as const,
        title: 'Start implementation?',
        description: state.spec
          ? `Spec ready: "${state.spec.title}". Begin implementing?`
          : 'Begin implementing?',
      }
      const approval = (yield approvalDescriptor) as unknown as {
        approved: boolean
        approvalId: string
      }
      if (approval.approved) {
        state.phase = 'implementing'
        if (!state.spec) {
          throw new Error('No spec to implement')
        }
        return {
          agent: 'implement' as const,
          input: { spec: state.spec },
        }
      }
      state.phase = 'scoping'
      return {
        agent: 'spec' as const,
        input: { userMessage: state.lastUserMessage },
      }
    }

    if (triageResult.next === 'implement') {
      state.phase = 'implementing'
      if (!state.spec) {
        throw new Error('No spec to implement')
      }
      return {
        agent: 'implement' as const,
        input: { spec: state.spec },
      }
    }

    if (triageResult.next === 'review') {
      state.phase = 'review'
      if (!state.result) {
        throw new Error('No result to review')
      }
      return {
        agent: 'review' as const,
        input: { result: state.result, userMessage: state.lastUserMessage },
      }
    }

    return {
      done: true as const,
      output: {
        phase: state.phase as 'scoping' | 'implementing' | 'review' | 'done',
        result: state.result,
      },
    }
}

export const featureOrchestrator = defineOrchestrator({
  name: 'feature-orchestrator',
  input: OrchestratorInput,
  output: OrchestratorOutput,
  state: OrchestratorState,
  agents: {
    implement: implementWorkflow,
    review: reviewAgent,
    spec: specAgent,
    triage: triageAgent,
  },
  initialize: ({ input }) => ({
    phase: 'scoping' as const,
    lastUserMessage: input.userMessage,
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router: featureRouter as any,
})
