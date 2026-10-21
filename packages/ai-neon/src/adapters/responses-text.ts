import OpenAI from 'openai'
import { OpenAIBaseResponsesTextAdapter } from '@tanstack/openai-base'
import {
  NEON_MODEL_INPUT_MODALITIES,
  NEON_MODEL_REASONING,
} from '../model-meta'
import { withNeonDefaults } from '../utils/client'
import { dropRejectedSampling } from './text'
import type {
  DefaultMessageMetadataByModality,
  Modality,
  TextOptions,
} from '@tanstack/ai'
import type { NeonResponsesModel } from '../model-meta'
import type { NeonResponsesProviderOptions } from '../text/text-provider-options'
import type { ResolveInputModalities, ResolveReasoning } from './text'
import type { NeonClientConfig } from '../utils/client'
import type { OpenAIBaseTextAdapterOptions } from '@tanstack/openai-base'

export interface NeonResponsesTextConfig
  extends NeonClientConfig, OpenAIBaseTextAdapterOptions {}

/**
 * Neon AI Gateway adapter for the OpenAI Responses route
 * (`/openai/v1/responses`). `neonText` picks it for the models only that
 * route serves (codex and `*-pro`), and for `api: 'responses'`.
 */
export class NeonResponsesTextAdapter<
  TModel extends NeonResponsesModel,
  TProviderOptions extends Record<string, any> = NeonResponsesProviderOptions,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
> extends OpenAIBaseResponsesTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  DefaultMessageMetadataByModality,
  readonly [],
  ResolveReasoning<TModel>
> {
  override readonly kind = 'text' as const
  override readonly name = 'neon' as const
  override readonly inputModalities = NEON_MODEL_INPUT_MODALITIES[this.model]
  /** The output cap on this route, for `summarize({ maxLength })`. */
  readonly maxTokensKey = 'max_output_tokens'

  constructor(config: NeonResponsesTextConfig, model: TModel) {
    super(
      model,
      'neon',
      new OpenAI(withNeonDefaults(config, 'responses')),
      config,
    )
  }

  protected override modelReasoning(model: string) {
    return NEON_MODEL_REASONING[model]
  }

  protected override mapOptionsToRequest(
    options: TextOptions<TProviderOptions>,
  ) {
    return dropRejectedSampling(
      options.model,
      super.mapOptionsToRequest(options),
    )
  }
}
