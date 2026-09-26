import { defineCommand } from '../commands'
import { configOption } from '../config'
import { definePlugin } from '../plugins'
import type { AnyTextAdapter } from '@tanstack/ai'

/**
 * Switch the main model at the next turn with the `model` setting or the
 * `/model <name>` command.
 *
 * @example
 * ```ts
 * modelPicker({
 *   choices: { fast: openaiText('gpt-5.6-luna'), smart: openaiText('gpt-5.6') },
 *   default: 'smart',
 * })
 * ```
 */
export function modelPicker(options: {
  choices: Record<string, AnyTextAdapter>
  default?: string
}) {
  const names = Object.keys(options.choices)
  const fallback = options.default ?? names[0]
  if (fallback === undefined)
    throw new Error('modelPicker needs at least one choice.')
  return definePlugin({
    name: 'tanstack/model-picker',
    setup: (ctx) => ({
      config: {
        model: configOption.select({
          options: names,
          default: fallback,
          category: 'model',
          description: 'The main model',
        }),
      },
      adapter: () => {
        const name = ctx.config.get('model')
        return typeof name === 'string' ? options.choices[name] : undefined
      },
      commands: {
        model: defineCommand({
          description: `Show or switch the model (${names.join(', ')})`,
          run: async (input: unknown) => {
            const name =
              typeof input === 'string'
                ? input
                : typeof input === 'object' && input !== null && 'name' in input
                  ? String(input.name)
                  : undefined
            if (!name)
              return `Model: ${String(ctx.config.get('model'))}. Choices: ${names.join(', ')}.`
            if (!names.includes(name))
              return `Unknown model "${name}". Choices: ${names.join(', ')}.`
            await ctx.session.setConfig('model', name)
            return `Model: ${name}. It applies at the next turn.`
          },
        }),
      },
    }),
  })
}
