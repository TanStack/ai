import type { HttpOptions } from '@google/genai'
import type { GeminiEmbeddingModels } from '../model-meta'

export interface GeminiEmbeddingProviderOptions {
  /** Used to override HTTP request options. */
  httpOptions?: HttpOptions
  /**
   * Type of task for which the embedding will be used.
   */
  taskType?: string
  /**
   * Title for the text. Only applicable when TaskType is `RETRIEVAL_DOCUMENT`.
   */
  title?: string
  /**
   * Reduced dimension for the output embedding. If set,
   * excessive values in the output embedding are truncated from the end.
   * Supported by newer models since 2024 only. You cannot set this value if
   * using the earlier model (`models/embedding-001`).
   */
  outputDimensionality?: number
}

export type GeminiEmbeddingModelProviderOptionsByName = {
  [K in GeminiEmbeddingModels]: GeminiEmbeddingProviderOptions
}

/**
 * Validates the task type
 */
export function validateTaskType(options: {
  taskType: string | undefined
  model: string
}) {
  const { taskType, model } = options
  if (!taskType) return

  if (
    taskType !== 'SEMANTIC_SIMILARITY' &&
    taskType !== 'CLASSIFICATION' &&
    taskType !== 'CLUSTERING' &&
    taskType !== 'RETRIEVAL_DOCUMENT' &&
    taskType !== 'RETRIEVAL_QUERY' &&
    taskType !== 'CODE_RETRIEVAL_QUERY' &&
    taskType !== 'QUESTION_ANSWERING' &&
    taskType !== 'FACT_VERIFICATION'
  ) {
    throw new Error(`Invalid task type "${taskType}" for model "${model}".`)
  }
}

/**
 * Validates the value to embed is not empty
 */
export function validateValue(options: {
  value: string | Array<string>
  model: string
}): void {
  const { value, model } = options
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new Error(`Value array cannot be empty for model "${model}".`)
    }
    for (const v of value) {
      if (!v || v.trim().length === 0) {
        throw new Error(
          `Value array cannot contain empty values for model "${model}".`,
        )
      }
    }
  } else {
    if (!value || value.trim().length === 0) {
      throw new Error(`Value cannot be empty for model "${model}".`)
    }
  }
}
