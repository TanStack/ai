import { BedrockTextAdapter } from './adapters/text'
import { getBedrockConfigFromEnv } from './utils'
import type { BedrockTextConfig } from './adapters/text';
import type { BedrockModelId } from './model-meta'

export function createBedrockChat<
    TModel extends BedrockModelId,
>(model: TModel, config: BedrockTextConfig): BedrockTextAdapter<TModel> {
    return new BedrockTextAdapter(config, model)
}

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
