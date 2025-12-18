import { experimental_text as text } from '@tanstack/ai'
import { z } from 'zod'
import { writeDebugFile } from '../harness'
import type { AdapterContext, TestOutcome } from '../harness'

// Schema for structured recipe output
const RecipeSchema = z.object({
  name: z.string().describe('The name of the recipe'),
  prepTime: z.string().describe('Preparation time (e.g., "15 minutes")'),
  servings: z.number().describe('Number of servings'),
  ingredients: z
    .array(
      z.object({
        item: z.string().describe('Ingredient name'),
        amount: z.string().describe('Amount needed (e.g., "2 cups")'),
      }),
    )
    .describe('List of ingredients'),
  instructions: z
    .array(z.string())
    .describe('Step-by-step cooking instructions'),
})

type Recipe = z.infer<typeof RecipeSchema>

/**
 * STR: Structured Output Test
 *
 * Tests structured output generation using a Zod schema.
 * Verifies the response conforms to the expected structure.
 */
export async function runSTR(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'str-structured-output'
  const adapterName = adapterContext.adapterName

  const debugData: Record<string, any> = {
    adapter: adapterName,
    test: testName,
    model: adapterContext.model,
    timestamp: new Date().toISOString(),
  }

  try {
    const result = (await text({
      adapter: adapterContext.textAdapter,
      model: adapterContext.model,
      messages: [
        {
          role: 'user' as const,
          content:
            'Generate a simple recipe for scrambled eggs. Include the name, prep time, servings, ingredients with amounts, and step-by-step instructions.',
        },
      ],
      outputSchema: RecipeSchema,
    })) as Recipe

    // Validate the structure
    const hasName = typeof result.name === 'string' && result.name.length > 0
    const hasPrepTime =
      typeof result.prepTime === 'string' && result.prepTime.length > 0
    const hasServings =
      typeof result.servings === 'number' && result.servings > 0
    const hasIngredients =
      Array.isArray(result.ingredients) && result.ingredients.length > 0
    const hasInstructions =
      Array.isArray(result.instructions) && result.instructions.length > 0

    const passed =
      hasName && hasPrepTime && hasServings && hasIngredients && hasInstructions

    const issues: string[] = []
    if (!hasName) issues.push('missing or invalid name')
    if (!hasPrepTime) issues.push('missing or invalid prepTime')
    if (!hasServings) issues.push('missing or invalid servings')
    if (!hasIngredients) issues.push('missing or empty ingredients')
    if (!hasInstructions) issues.push('missing or empty instructions')

    debugData.summary = {
      result,
      hasName,
      hasPrepTime,
      hasServings,
      hasIngredients,
      hasInstructions,
      ingredientCount: result.ingredients?.length,
      instructionCount: result.instructions?.length,
    }
    debugData.result = {
      passed,
      error: issues.length ? issues.join(', ') : undefined,
    }

    await writeDebugFile(adapterName, testName, debugData)

    console.log(
      `[${adapterName}] ${passed ? '✅' : '❌'} ${testName}${
        passed ? '' : `: ${debugData.result.error}`
      }`,
    )

    return { passed, error: debugData.result.error }
  } catch (error: any) {
    const message = error?.message || String(error)
    debugData.summary = { error: message }
    debugData.result = { passed: false, error: message }
    await writeDebugFile(adapterName, testName, debugData)
    console.log(`[${adapterName}] ❌ ${testName}: ${message}`)
    return { passed: false, error: message }
  }
}
