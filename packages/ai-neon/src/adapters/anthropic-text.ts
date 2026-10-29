import { AnthropicTextAdapter } from '@tanstack/ai-anthropic'
import { dropRejectedSampling } from './text'
import type { NeonAnthropicModel } from '../model-meta'

/** Apply Neon's sampling restrictions before Anthropic validates options. */
export class NeonAnthropicTextAdapter<
  TModel extends NeonAnthropicModel,
> extends AnthropicTextAdapter<TModel> {
  override chatStream(
    options: Parameters<AnthropicTextAdapter<TModel>['chatStream']>[0],
  ) {
    return super.chatStream({
      ...options,
      modelOptions: dropRejectedSampling(
        options.model,
        Object.assign({}, options.modelOptions),
      ),
    })
  }

  override structuredOutput(
    options: Parameters<AnthropicTextAdapter<TModel>['structuredOutput']>[0],
  ) {
    return super.structuredOutput({
      ...options,
      chatOptions: {
        ...options.chatOptions,
        modelOptions: dropRejectedSampling(
          options.chatOptions.model,
          Object.assign({}, options.chatOptions.modelOptions),
        ),
      },
    })
  }
}
