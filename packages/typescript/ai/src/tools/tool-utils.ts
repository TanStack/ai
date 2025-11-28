import type { z } from 'zod'
import type { Tool } from '../types'

/**
 * Helper to define a tool with enforced type safety.
 *
 * Automatically infers TypeScript types from Zod schemas, providing
 * full type safety for tool inputs and outputs.
 *
 * @example
 * ```typescript
 * import { tool } from '@tanstack/ai';
 * import { z } from 'zod';
 *
 * const getWeather = tool({
 *   name: 'get_weather',
 *   description: 'Get the current weather for a location',
 *   inputSchema: z.object({
 *     location: z.string().describe('The city and state, e.g. San Francisco, CA'),
 *     unit: z.enum(['celsius', 'fahrenheit']).optional(),
 *   }),
 *   outputSchema: z.object({
 *     temperature: z.number(),
 *     conditions: z.string(),
 *   }),
 *   execute: async ({ location, unit }) => {
 *     // args are fully typed: { location: string; unit?: "celsius" | "fahrenheit" }
 *     const data = await fetchWeather(location, unit);
 *     return data; // validated against outputSchema
 *   },
 * });
 * ```
 */
export function tool<
  TInput extends z.ZodType,
  TOutput extends z.ZodType = z.ZodAny,
>(config: Tool<TInput, TOutput>): Tool<TInput, TOutput> {
  return config
}
