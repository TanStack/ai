import { configOption, defineCommand, definePlugin } from '@tanstack/ai-harness'

export const EFFORTS = ['default', 'low', 'medium', 'high', 'max'] as const
type Effort = (typeof EFFORTS)[number]

/**
 * The model options that ask `provider` to think with `effort`. `max` is the
 * highest level each provider has. `default` sends nothing: the model decides.
 */
function reasoningOptions(provider: string, effort: Effort) {
  if (effort === 'default') return undefined
  switch (provider) {
    case 'anthropic':
      return { output_config: { effort } }
    case 'openrouter':
      return { reasoning: { effort: effort === 'max' ? 'xhigh' : effort } }
    case 'openai':
    case 'grok':
      return { reasoning: { effort: effort === 'max' ? 'high' : effort } }
    default:
      return undefined
  }
}

/**
 * `/effort`: how hard the main model thinks at the next turn. It sets the
 * reasoning option of the current model's provider, for models where
 * `providerOf` gives a provider (a model without reasoning gives none).
 */
export function effortPicker(options: {
  providerOf: (model: string) => string | undefined
}) {
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
            onConfig: (_chat, config) => {
              const provider = options.providerOf(
                String(ctx.config.get('model')),
              )
              const extra = provider && reasoningOptions(provider, current())
              if (!extra) return undefined
              return { modelOptions: { ...config.modelOptions, ...extra } }
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
