import { BaseRerankAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { resolveBedrockAuth } from '../utils/auth'
import { createSigV4Fetch } from '../utils/openai-sigv4-fetch'
import type { RerankAdapterResult, RerankOptions } from '@tanstack/ai'
import type { BedrockRerankModel } from '../model-meta'

/** Bedrock rerank uses AWS credentials, not Bedrock API keys. */
export interface BedrockRerankConfig {
  /** AWS region; defaults to us-east-1. Amazon Rerank requires another region. */
  region?: string
  /** Overrides the agent-runtime base URL, without the /rerank suffix. */
  baseURL?: string
  /** Headers added before SigV4 signing. */
  defaultHeaders?: Record<string, string>
  /** Custom transport; requests are still SigV4-signed. */
  fetch?: typeof fetch
}

/** Additional inference fields for the selected Bedrock rerank model. */
export interface BedrockRerankProviderOptions {
  additionalModelRequestFields?: Record<string, unknown>
}

interface BedrockRerankResponse {
  results: Array<{ index: number; relevanceScore: number }>
  nextToken?: string
}

function isBedrockRerankResponse(
  value: unknown,
): value is BedrockRerankResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'results' in value &&
    Array.isArray(value.results) &&
    value.results.every(
      (result) =>
        typeof result === 'object' &&
        result !== null &&
        Number.isInteger(result.index) &&
        Number.isFinite(result.relevanceScore),
    ) &&
    (!('nextToken' in value) ||
      (typeof value.nextToken === 'string' &&
        value.nextToken.length > 0 &&
        value.nextToken.length <= 2048 &&
        !/\s/.test(value.nextToken)))
  )
}

/** Bedrock rerank adapter; core maps scored indices to original documents. */
export class BedrockRerankAdapter<
  TModel extends BedrockRerankModel,
> extends BaseRerankAdapter<TModel, BedrockRerankProviderOptions> {
  readonly name = 'bedrock' as const
  private readonly region: string
  private readonly baseURL: string
  private readonly clientConfig: BedrockRerankConfig

  constructor(config: BedrockRerankConfig, model: TModel) {
    super({}, model)
    this.clientConfig = config
    this.region = config.region ?? 'us-east-1'
    this.baseURL = (
      config.baseURL ??
      `https://bedrock-agent-runtime.${this.region}.amazonaws.com`
    ).replace(/\/+$/, '')
  }

  async rerank(
    options: RerankOptions<BedrockRerankProviderOptions>,
  ): Promise<RerankAdapterResult> {
    const { model, query, documents, topN, modelOptions, abortSignal, logger } =
      options

    try {
      if (documents.length < 1 || documents.length > 1000) {
        throw new Error('Bedrock rerank requires between 1 and 1000 documents')
      }
      const numberOfResults = topN ?? documents.length
      if (
        !Number.isInteger(numberOfResults) ||
        numberOfResults < 1 ||
        numberOfResults > 1000
      ) {
        throw new Error(
          'Bedrock rerank topN must be an integer between 1 and 1000',
        )
      }

      const body = {
        queries: [{ type: 'TEXT', textQuery: { text: query } }],
        sources: documents.map((text) => ({
          type: 'INLINE',
          inlineDocumentSource: { type: 'TEXT', textDocument: { text } },
        })),
        rerankingConfiguration: {
          type: 'BEDROCK_RERANKING_MODEL',
          bedrockRerankingConfiguration: {
            modelConfiguration: {
              modelArn: `arn:aws:bedrock:${this.region}::foundation-model/${model}`,
              additionalModelRequestFields:
                modelOptions?.additionalModelRequestFields,
            },
            numberOfResults,
          },
        },
      }
      const signedFetch = createSigV4Fetch(
        resolveBedrockAuth({ region: this.region, auth: 'sigv4' }, 'runtime'),
        this.clientConfig.fetch,
      )
      const ranking: RerankAdapterResult['ranking'] = []
      const seenTokens = new Set<string>()
      let nextToken: string | undefined
      let id: string | undefined

      do {
        abortSignal?.throwIfAborted()
        logger.request(
          `activity=rerank provider=${this.name} model=${model} documents=${documents.length}`,
          { provider: this.name, model },
        )
        const response = await signedFetch(`${this.baseURL}/rerank`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.clientConfig.defaultHeaders,
          },
          body: JSON.stringify({ ...body, nextToken }),
          signal: abortSignal,
        })
        if (!response.ok) {
          const detail = await response.text()
          throw new Error(
            `Bedrock rerank request failed: ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`,
          )
        }
        const page: unknown = await response.json()
        abortSignal?.throwIfAborted()
        if (!isBedrockRerankResponse(page)) {
          throw new Error('Bedrock rerank response had an unexpected shape')
        }
        id ??= response.headers.get('x-amzn-requestid') ?? undefined
        ranking.push(
          ...page.results.map((result) => ({
            index: result.index,
            score: result.relevanceScore,
          })),
        )
        nextToken = page.nextToken
        if (nextToken) {
          if (seenTokens.has(nextToken)) {
            throw new Error('Bedrock rerank pagination did not advance')
          }
          seenTokens.add(nextToken)
        }
      } while (nextToken && ranking.length < numberOfResults)

      return {
        id: id ?? this.generateId(),
        ranking: ranking.slice(0, numberOfResults),
        // The Bedrock Rerank API reports neither token counts nor billed units.
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      }
    } catch (error) {
      logger.errors(`${this.name}.rerank fatal`, {
        error: toRunErrorPayload(error, 'Bedrock rerank failed'),
        source: `${this.name}.rerank`,
      })
      throw error
    }
  }
}

/**
 * Creates a Bedrock rerank adapter using the AWS credential chain (SigV4).
 * Install `@aws-sdk/credential-providers`; Bedrock API keys are not supported.
 * For `amazon.rerank-v1:0`, select a supported region such as `us-west-2`.
 */
export function bedrockRerank<TModel extends BedrockRerankModel>(
  model: TModel,
  config?: BedrockRerankConfig,
): BedrockRerankAdapter<TModel> {
  return new BedrockRerankAdapter(config ?? {}, model)
}
