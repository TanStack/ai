import { BedrockTextAdapter } from './adapters/text'
import { getBedrockConfigFromEnv } from './utils'
import type { BedrockTextConfig } from './adapters/text';
import type { BedrockModelId } from './model-meta'

/**
 * Creates a Bedrock text adapter with an explicit full configuration.
 *
 * @param model - The Bedrock model ID (e.g. `'amazon.nova-pro-v1:0'`).
 * @param config - Full AWS region and credentials configuration.
 * @returns A configured {@link BedrockTextAdapter} instance.
 */
export function createBedrockChat<
    TModel extends BedrockModelId,
>(model: TModel, config: BedrockTextConfig): BedrockTextAdapter<TModel> {
    return new BedrockTextAdapter(config, model)
}

/**
 * Creates a Bedrock text adapter, reading AWS credentials from environment variables
 * (`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`).
 * Any values provided in `config` take precedence over environment variables.
 *
 * @param model - The Bedrock model ID (e.g. `'amazon.nova-pro-v1:0'`).
 * @param config - Optional partial configuration to override environment variable defaults.
 * @returns A configured {@link BedrockTextAdapter} instance.
 *
 * @example
 * ```typescript
 * import { bedrockText } from '@tanstack/ai-bedrock'
 * import { chat } from '@tanstack/ai'
 *
 * const stream = chat({
 *   adapter: bedrockText('amazon.nova-pro-v1:0'),
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * })
 * ```
 */
export function bedrockText<TModel extends BedrockModelId>(
    model: TModel,
    config?: Partial<BedrockTextConfig>,
): BedrockTextAdapter<TModel> {
    const envConfig = getBedrockConfigFromEnv()
    const fullConfig: BedrockTextConfig = {
        region: config?.region || envConfig.region || 'us-east-1',
        credentials: {
            accessKeyId: config?.credentials?.accessKeyId || envConfig.credentials?.accessKeyId || '',
            secretAccessKey: config?.credentials?.secretAccessKey || envConfig.credentials?.secretAccessKey || '',
        },
    }
    return createBedrockChat(model, fullConfig)
}
