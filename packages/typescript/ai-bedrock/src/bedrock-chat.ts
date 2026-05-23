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
 * Creates a Bedrock text adapter with pluggable authentication.
 *
 * Auth is resolved in this order (first match wins):
 * 1. `config.apiKey` or `BEDROCK_API_KEY` env var → bearer token
 * 2. `config.credentials` or `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` env vars → IAM access keys
 * 3. AWS SDK default credential chain → IAM roles, SSO, instance profiles, etc.
 *
 * Region is resolved in this order:
 * 1. Explicit `config.region`
 * 2. `AWS_REGION` or `AWS_DEFAULT_REGION` env vars
 * 3. AWS SDK default region resolution
 *
 * @param model - The Bedrock model ID (e.g. `'amazon.nova-pro-v1:0'`).
 * @param config - Optional partial configuration to override auto-detected values.
 * @returns A configured {@link BedrockTextAdapter} instance.
 *
 * @example
 * ```typescript
 * // API key (bearer token)
 * const adapter = bedrockText('amazon.nova-pro-v1:0', {
 *   apiKey: 'bedrock-api-key-...',
 * })
 *
 * // Or from env: BEDROCK_API_KEY=...
 * const adapter = bedrockText('amazon.nova-pro-v1:0')
 * ```
 */
export function bedrockText<TModel extends BedrockModelId>(
    model: TModel,
    config?: Partial<BedrockTextConfig>,
): BedrockTextAdapter<TModel> {
    const envConfig = getBedrockConfigFromEnv()

    // Region: explicit > env > undefined (let SDK resolve)
    const region = config?.region || envConfig.region || undefined

    // API key (bearer token): explicit > env
    const apiKey = config?.apiKey || envConfig.apiKey || undefined

    // Build full config — if apiKey is set, skip credentials
    const fullConfig: BedrockTextConfig = {
        ...(region ? { region } : {}),
        ...(apiKey ? { apiKey } : {}),
    }

    // IAM credentials: only when no apiKey and explicitly provided
    if (!apiKey) {
        const explicitAccessKey =
            config?.credentials?.accessKeyId || envConfig.credentials?.accessKeyId || undefined
        const explicitSecretKey =
            config?.credentials?.secretAccessKey || envConfig.credentials?.secretAccessKey || undefined

        if (explicitAccessKey && explicitSecretKey) {
            fullConfig.credentials = {
                accessKeyId: explicitAccessKey,
                secretAccessKey: explicitSecretKey,
                sessionToken:
                    config?.credentials?.sessionToken ||
                    envConfig.credentials?.sessionToken ||
                    undefined,
            }
        }
    }

    return createBedrockChat(model, fullConfig)
}
