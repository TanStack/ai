import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'

/**
 * A TanStack server tool bridged *into* the harness. The agent sees it as
 * `mcp__tanstack__lookup_style_guide`, calls it like any built-in tool, and
 * the adapter strips the prefix so the UI shows `lookup_style_guide`.
 */
export const lookupStyleGuide = toolDefinition({
  name: 'lookup_style_guide',
  description:
    "Look up this project's coding style guide. Call this before writing or editing any code so your changes match the house style.",
  inputSchema: z.object({
    topic: z
      .string()
      .describe('What you are about to write, e.g. "functions", "naming"'),
  }),
}).server(({ topic }) => ({
  topic,
  rules: [
    'Use arrow functions assigned to const, never function declarations.',
    'Prefer single quotes and no semicolons.',
    'Every exported function gets a one-line JSDoc comment.',
    'Keep files under 100 lines; split modules instead of growing them.',
  ],
}))
