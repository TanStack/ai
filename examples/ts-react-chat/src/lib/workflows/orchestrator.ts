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
  function* ({ agents, input, state }) {
    const triage = yield* agents.triage({
      hasResult: !!state.result,
      hasSpec: !!state.spec,
      phase: state.phase,
      userMessage: state.lastUserMessage || input.userMessage,
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
      return { agent: 'spec', input: { userMessage: state.lastUserMessage } }
    }

    if (triage.next === 'await-approval') {
      const approval = yield* approve({
        description: state.spec
          ? `Spec ready: "${state.spec.title}". Begin implementing?`
          : 'Begin implementing?',
        title: 'Start implementation?',
      })
      if (approval.approved) {
        state.phase = 'implementing'
        if (!state.spec) throw new Error('No spec to implement')
        return { agent: 'implement', input: { spec: state.spec } }
      }
      state.phase = 'scoping'
      return { agent: 'spec', input: { userMessage: state.lastUserMessage } }
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
  initialize: ({ input }) => ({ lastUserMessage: input.userMessage }),
  name: 'feature-orchestrator',
  router: featureRouter,
})
