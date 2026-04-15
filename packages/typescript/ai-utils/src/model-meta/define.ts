import type { ModelMeta } from './types'

export function defineModelMeta<T extends ModelMeta>(meta: T): T {
  if (meta.supports.input.length === 0) {
    throw new Error(
      `defineModelMeta: model "${meta.name}" must have at least one input modality`,
    )
  }

  if (meta.supports.output.length === 0) {
    throw new Error(
      `defineModelMeta: model "${meta.name}" must have at least one output modality`,
    )
  }

  if (meta.context_window !== undefined && meta.context_window <= 0) {
    throw new Error(
      `defineModelMeta: model "${meta.name}" context_window must be positive`,
    )
  }

  if (meta.max_output_tokens !== undefined && meta.max_output_tokens <= 0) {
    throw new Error(
      `defineModelMeta: model "${meta.name}" max_output_tokens must be positive`,
    )
  }

  if (meta.pricing) {
    if (meta.pricing.input.normal < 0) {
      throw new Error(
        `defineModelMeta: model "${meta.name}" pricing.input.normal must be non-negative`,
      )
    }
    if (
      meta.pricing.input.cached !== undefined &&
      meta.pricing.input.cached < 0
    ) {
      throw new Error(
        `defineModelMeta: model "${meta.name}" pricing.input.cached must be non-negative`,
      )
    }
    if (meta.pricing.output.normal < 0) {
      throw new Error(
        `defineModelMeta: model "${meta.name}" pricing.output.normal must be non-negative`,
      )
    }
  }

  return meta
}
