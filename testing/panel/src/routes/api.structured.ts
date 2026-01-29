import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { grokText } from '@tanstack/ai-grok'
import { openaiText } from '@tanstack/ai-openai'
import { ollamaText } from '@tanstack/ai-ollama'
import { openRouterText } from '@tanstack/ai-openrouter'
import { z } from 'zod'

type Provider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'grok'
  | 'openrouter'

// Schema for structured recipe output
const RecipeSchema = z.object({
  name: z.string().describe('The name of the recipe'),
  description: z.string().describe('A brief description of the dish'),
  prepTime: z.string().describe('Preparation time (e.g., "15 minutes")'),
  cookTime: z.string().describe('Cooking time (e.g., "30 minutes")'),
  servings: z.number().describe('Number of servings'),
  difficulty: z.enum(['easy', 'medium', 'hard']).describe('Difficulty level'),
  ingredients: z
    .array(
      z.object({
        item: z.string().describe('Ingredient name'),
        amount: z.string().describe('Amount needed (e.g., "2 cups")'),
        notes: z.string().optional().describe('Optional preparation notes'),
      }),
    )
    .describe('List of ingredients'),
  instructions: z
    .array(z.string())
    .describe('Step-by-step cooking instructions'),
  tips: z.array(z.string()).optional().describe('Optional cooking tips'),
  nutritionPerServing: z
    .object({
      calories: z.number().optional(),
      protein: z.string().optional(),
      carbs: z.string().optional(),
      fat: z.string().optional(),
    })
    .optional()
    .describe('Nutritional information per serving'),
})

export type Recipe = z.infer<typeof RecipeSchema>

export const Route = createFileRoute('/api/structured')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { recipeName, mode = 'structured' } = body
        const data = body.data || {}
        const provider: Provider = data.provider || body.provider || 'openai'
        // Don't set a global default - let each adapter use its own default model
        const model: string | undefined = data.model || body.model

        try {
          // Default models per provider
          const defaultModels: Record<Provider, string> = {
            anthropic: 'claude-sonnet-4-5',
            gemini: 'gemini-2.0-flash',
            grok: 'grok-3-mini',
            ollama: 'mistral:7b',
            openai: 'gpt-4o',
            openrouter: 'openai/gpt-4o',
          }

          // Determine the actual model being used
          const actualModel = model || defaultModels[provider]

          // Pre-define typed adapter configurations with full type inference
          // Model is passed to the adapter factory function for type-safe autocomplete
          const adapterConfig = {
            anthropic: () =>
              createChatOptions({
                adapter: anthropicText(actualModel as any),
              }),
            gemini: () =>
              createChatOptions({
                adapter: geminiText(actualModel as any),
              }),
            grok: () =>
              createChatOptions({
                adapter: grokText(actualModel as any),
              }),
            ollama: () =>
              createChatOptions({
                adapter: ollamaText(actualModel as any),
              }),
            openai: () =>
              createChatOptions({
                adapter: openaiText(actualModel as any),
              }),
            openrouter: () =>
              createChatOptions({
                adapter: openRouterText(actualModel as any),
              }),
          }

          // Get typed adapter options using createChatOptions pattern
          const options = adapterConfig[provider]()

          console.log(
            `>> ${mode} output with model: ${actualModel} on provider: ${provider}`,
          )

          if (mode === 'structured') {
            // Structured output mode - returns validated object
            const result = await chat({
              ...options,
              messages: [
                {
                  role: 'user',
                  content: `Generate a complete recipe for: ${recipeName}. Include all ingredients with amounts, step-by-step instructions, prep/cook times, and difficulty level.`,
                },
              ],
              outputSchema: RecipeSchema,
            })

            return new Response(
              JSON.stringify({
                mode: 'structured',
                recipe: result,
                provider,
                model: actualModel,
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          } else {
            // One-shot markdown mode - returns streamed text
            const markdown = await chat({
              ...options,
              stream: false,
              messages: [
                {
                  role: 'user',
                  content: `Generate a complete recipe for: ${recipeName}. 
                  
Format the recipe in beautiful markdown with:
- A title with the recipe name
- A brief description
- Prep time, cook time, and servings
- Ingredients list with amounts
- Numbered step-by-step instructions
- Optional tips section
- Nutritional info if applicable

Make it detailed and easy to follow.`,
                },
              ],
            })

            console.log('>> markdown:', markdown)

            return new Response(
              JSON.stringify({
                mode: 'oneshot',
                markdown,
                provider,
                model: actualModel,
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }
        } catch (error: any) {
          console.error(
            '[API Route] Error in structured output request:',
            error,
          )
          return new Response(
            JSON.stringify({
              error: error.message || 'An error occurred',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
