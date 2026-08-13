import { Hono } from 'hono'
import {
  chat,
  chatParamsFromRequestBody,
  EventType,
  maxIterations,
  mergeAgentTools,
  toolDefinition,
  toHttpResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText, OPENAI_CHAT_MODELS } from '@tanstack/ai-openai'
import type { ModelMessage, StreamChunk, UIMessage } from '@tanstack/ai'
import type { OpenAIChatModel } from '@tanstack/ai-openai'

const DEFAULT_OPENAI_MODEL = 'gpt-5.2'
const OPENAI_CHAT_MODEL_NAMES: ReadonlySet<string> = new Set(OPENAI_CHAT_MODELS)

export const LIVE_RECIPE_SERVER_ERROR =
  'OPENAI_API_KEY is required to run the live recipe example'

type RecipePrompt = {
  messages: Array<ModelMessage | UIMessage>
  systemPrompts: Array<string>
}

const recipeOutputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    servings: { type: 'number' },
    totalMinutes: { type: 'number' },
    tags: { type: 'array', items: { type: 'string' } },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          amount: { type: 'string' },
          pantry: { type: 'boolean' },
        },
        required: ['name', 'amount', 'pantry'],
        additionalProperties: false,
      },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          text: { type: 'string' },
          minutes: { type: 'number' },
        },
        required: ['title', 'text', 'minutes'],
        additionalProperties: false,
      },
    },
    tips: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
    revision: { type: 'number' },
    fromPrompt: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'title',
    'summary',
    'servings',
    'totalMinutes',
    'tags',
    'ingredients',
    'steps',
    'tips',
    'warnings',
    'revision',
    'fromPrompt',
  ],
  additionalProperties: false,
}

const RECIPE_SYSTEM_PROMPT = `You are a live recipe assistant for a React Native streaming demo.

Always return exactly one complete recipe matching the provided structured output schema.
Use the full conversation history. When the latest user message is a follow-up such as "make it vegan", "remove mushrooms", "less spicy", or "for 4 people", revise the previous assistant recipe instead of starting from scratch.
Create a new recipe on every user turn, and make the revision field one higher than the latest previous recipe revision when one is present.
Call useful server tools when pantry details, substitutions, nutrition, or allergen constraints would improve the recipe. Incorporate tool results into the final recipe, but do not mention internal tool mechanics to the user.
Respect explicit constraints from the latest user message over earlier recipe details. If the user asks to remove an ingredient, do not include that ingredient. If the user changes serving count, update servings and ingredient amounts.
Keep titles, summaries, steps, tips, and warnings concise.`

function isOpenAIChatModel(value: string): value is OpenAIChatModel {
  return OPENAI_CHAT_MODEL_NAMES.has(value)
}

function getOpenAIModel(): OpenAIChatModel {
  const configuredModel = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL
  if (!isOpenAIChatModel(configuredModel)) {
    throw new Error(
      `OPENAI_MODEL must be one of the known @tanstack/ai-openai chat models. Received: ${configuredModel}`,
    )
  }
  return configuredModel
}

function requireOpenAIApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(LIVE_RECIPE_SERVER_ERROR)
  }
  return apiKey
}

function supportsReasoningOptions(model: OpenAIChatModel) {
  return (
    model.startsWith('gpt-5') ||
    model.startsWith('o1') ||
    model.startsWith('o3') ||
    model.startsWith('o4')
  )
}

function getOpenAIModelOptions(model: OpenAIChatModel) {
  if (!supportsReasoningOptions(model)) return undefined
  return {
    reasoning: {
      summary: 'auto',
    },
  } as const
}

export function createRecipePrompt(
  messages: Array<ModelMessage | UIMessage>,
): RecipePrompt {
  return {
    messages,
    systemPrompts: [RECIPE_SYSTEM_PROMPT],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

function readString(value: unknown, key: string): string {
  if (!isRecord(value)) return ''
  const field = value[key]
  return typeof field === 'string' ? field : ''
}

function readNumber(value: unknown, key: string): number {
  if (!isRecord(value)) return 0
  const field = value[key]
  return typeof field === 'number' ? field : 0
}

function readStringArray(value: unknown, key: string): Array<string> {
  if (!isRecord(value)) return []
  const field = value[key]
  if (!Array.isArray(field)) return []
  return field.filter((item): item is string => typeof item === 'string')
}

const getPantrySnapshot = toolDefinition({
  name: 'getPantrySnapshot',
  description:
    'Return available pantry ingredients, fresh ingredients, and household dietary notes for recipe planning.',
  inputSchema: {
    type: 'object',
    properties: {
      focus: {
        type: 'string',
        description: 'The recipe planning focus for the pantry lookup.',
      },
    },
    required: ['focus'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      staples: { type: 'array', items: { type: 'string' } },
      fresh: { type: 'array', items: { type: 'string' } },
      allergens: { type: 'array', items: { type: 'string' } },
      notes: { type: 'string' },
    },
    required: ['staples', 'fresh', 'allergens', 'notes'],
    additionalProperties: false,
  },
}).server((args) => {
  const focus = readString(args, 'focus') || 'recipe planning'
  return {
    staples: [
      'canned tomatoes',
      'spaghetti',
      'olive oil',
      'chili flakes',
      'white beans',
      'brown rice',
      'coconut milk',
    ],
    fresh: ['garlic', 'parsley', 'lemon', 'mushrooms', 'spinach'],
    allergens: ['gluten'],
    notes: `Pantry lookup for: ${focus}. Ask the model to adapt if the user removes an ingredient or changes servings.`,
  }
})

const suggestIngredientSubstitutions = toolDefinition({
  name: 'suggestIngredientSubstitutions',
  description:
    'Suggest practical substitutions when the user removes ingredients or asks for dietary changes.',
  inputSchema: {
    type: 'object',
    properties: {
      ingredient: {
        type: 'string',
        description: 'Ingredient to replace or avoid.',
      },
      dietaryGoal: {
        type: 'string',
        description:
          'Dietary goal such as vegan, gluten-free, mild, or high-protein.',
      },
    },
    required: ['ingredient', 'dietaryGoal'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      replacements: { type: 'array', items: { type: 'string' } },
      guidance: { type: 'string' },
    },
    required: ['replacements', 'guidance'],
    additionalProperties: false,
  },
}).server((args) => {
  const ingredient = readString(args, 'ingredient') || 'the removed ingredient'
  const dietaryGoal = readString(args, 'dietaryGoal') || 'the requested diet'
  return {
    replacements: [
      'white beans',
      'spinach',
      'roasted peppers',
      'zucchini',
      'chickpeas',
    ],
    guidance: `For ${dietaryGoal}, omit ${ingredient} entirely and choose replacements that preserve texture and protein without violating the latest user request.`,
  }
})

const estimateRecipeNutrition = toolDefinition({
  name: 'estimateRecipeNutrition',
  description:
    'Provide rough nutrition guidance for a planned recipe and serving count.',
  inputSchema: {
    type: 'object',
    properties: {
      recipeIdea: {
        type: 'string',
        description: 'Short description of the recipe being planned.',
      },
      servings: {
        type: 'number',
        description: 'Number of servings requested by the user.',
      },
    },
    required: ['recipeIdea', 'servings'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      perServing: {
        type: 'object',
        properties: {
          calories: { type: 'number' },
          proteinGrams: { type: 'number' },
          fiberGrams: { type: 'number' },
        },
        required: ['calories', 'proteinGrams', 'fiberGrams'],
        additionalProperties: false,
      },
      note: { type: 'string' },
    },
    required: ['perServing', 'note'],
    additionalProperties: false,
  },
}).server((args) => {
  const recipeIdea = readString(args, 'recipeIdea') || 'the planned recipe'
  const servings = readNumber(args, 'servings') || 2
  return {
    perServing: {
      calories: 420,
      proteinGrams: 18,
      fiberGrams: 9,
    },
    note: `Rough estimate for ${servings} servings of ${recipeIdea}; keep nutrition language approximate.`,
  }
})

const checkAllergenGuidance = toolDefinition({
  name: 'checkAllergenGuidance',
  description:
    'Return allergen and safety guidance for ingredients or dietary constraints.',
  inputSchema: {
    type: 'object',
    properties: {
      ingredients: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ingredients the model is considering.',
      },
      dietaryConstraints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Constraints from the conversation.',
      },
    },
    required: ['ingredients', 'dietaryConstraints'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      warnings: { type: 'array', items: { type: 'string' } },
      guidance: { type: 'string' },
    },
    required: ['warnings', 'guidance'],
    additionalProperties: false,
  },
}).server((args) => {
  const ingredients = readStringArray(args, 'ingredients')
  const dietaryConstraints = readStringArray(args, 'dietaryConstraints')
  const warnings = ingredients.some((ingredient) =>
    ingredient.toLowerCase().includes('spaghetti'),
  )
    ? ['Spaghetti usually contains gluten; use gluten-free pasta if needed.']
    : []

  return {
    warnings,
    guidance: `Apply constraints: ${dietaryConstraints.join(', ') || 'none'}. Keep warnings practical and visible in the final recipe.`,
  }
})

const serverTools = [
  getPantrySnapshot,
  suggestIngredientSubstitutions,
  estimateRecipeNutrition,
  checkAllergenGuidance,
]

async function createChatStream(
  body: unknown,
): Promise<AsyncIterable<StreamChunk>> {
  const params = await chatParamsFromRequestBody(body)
  const recipePrompt = createRecipePrompt(params.messages)
  requireOpenAIApiKey()
  const model = getOpenAIModel()
  const tools = mergeAgentTools(serverTools, params.tools)
  const modelOptions = getOpenAIModelOptions(model)

  return chat({
    adapter: openaiText(model),
    tools,
    messages: recipePrompt.messages,
    systemPrompts: recipePrompt.systemPrompts,
    threadId: params.threadId,
    runId: params.runId,
    parentRunId: params.parentRunId,
    agentLoopStrategy: maxIterations(6),
    outputSchema: recipeOutputSchema,
    stream: true,
    ...(modelOptions ? { modelOptions: modelOptions as never } : {}),
  }) as AsyncIterable<StreamChunk>
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Bad request'
}

function getRequestRunContext(body: unknown) {
  if (!body || typeof body !== 'object') return {}

  const threadId =
    'threadId' in body && typeof body.threadId === 'string'
      ? body.threadId
      : undefined
  const runId =
    'runId' in body && typeof body.runId === 'string' ? body.runId : undefined

  return {
    ...(threadId ? { threadId } : {}),
    ...(runId ? { runId } : {}),
  }
}

async function* createErrorStream(
  error: unknown,
  body: unknown,
): AsyncIterable<StreamChunk> {
  const message = getErrorMessage(error)

  yield {
    type: EventType.RUN_ERROR,
    ...getRequestRunContext(body),
    message,
    code: 'REACT_NATIVE_EXAMPLE_SERVER_ERROR',
    error: {
      message,
      code: 'REACT_NATIVE_EXAMPLE_SERVER_ERROR',
    },
  }
}

export const app = new Hono()

app.get('/health', (c) => c.json({ ok: true }))

app.post('/chat/http', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
    const stream = await createChatStream(body)
    return toHttpResponse(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    return toHttpResponse(createErrorStream(error, body), {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
      },
    })
  }
})

app.post('/chat/sse', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
    return toServerSentEventsResponse(await createChatStream(body))
  } catch (error) {
    return toServerSentEventsResponse(createErrorStream(error, body))
  }
})
