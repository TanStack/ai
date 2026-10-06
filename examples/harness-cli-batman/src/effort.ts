import { REASONING_LEVELS } from '@tanstack/ai'
import { configOption, defineCommand, definePlugin } from '@tanstack/ai-harness'

export const EFFORTS = ['default', ...REASONING_LEVELS] as const
type Effort = (typeof EFFORTS)[number]

/**
 * `/effort`: how hard the main model thinks at the next turn. It sets
 * `chat({ reasoning })`, which every adapter maps to its own wire field and
 * clamps to the levels the model has. `default` sends nothing: the model
 * decides. `reasons` says whether the current model reasons at all.
 */
export function effortPicker(options: { reasons: (model: string) => boolean }) {
  return definePlugin({
    name: 'example/effort',
    setup: (ctx) => {
      const current = (): Effort =>
        EFFORTS.find((effort) => effort === ctx.config.get('effort')) ??
        'default'
      return {
        config: {
          effort: configOption.select({
            options: EFFORTS,
            default: 'default',
            category: 'thought_level',
            description: 'How hard the model thinks',
          }),
        },
        middleware: [
          {
            name: 'example/effort',
            onConfig: () => {
              const effort = current()
              if (effort === 'default') return undefined
              if (!options.reasons(String(ctx.config.get('model')))) {
                return undefined
              }
              return { reasoning: { level: effort, summary: true } }
            },
          },
        ],
        commands: {
          effort: defineCommand({
            description: `Show or set how hard the model thinks (${EFFORTS.join(', ')})`,
            run: async (input: unknown) => {
              const name = typeof input === 'string' ? input.trim() : ''
              if (name === '') return `Effort: ${current()}.`
              const effort = EFFORTS.find((item) => item === name)
              if (!effort)
                return `Unknown effort "${name}". Choices: ${EFFORTS.join(', ')}.`
              await ctx.session.setConfig('effort', effort)
              return `Effort: ${effort}. It applies at the next turn.`
            },
          }),
        },
      }
    },
  })
}
