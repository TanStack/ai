import { AzureOpenAI } from 'openai'
import {
  OpenAIBaseResponsesTextAdapter,
  warnStrictFallback,
} from '@tanstack/openai-base'
import { convertToolsToProviderFormat } from '../tools'
import { getAzureOpenAIApiKeyFromEnv } from '../utils/client'
import { OPENAI_MODEL_REASONING } from '../model-meta'
import type {
  DefaultMessageMetadataByModality,
  Modality,
  TextOptions,
} from '@tanstack/ai'
import type { OpenAIModelReasoningByName } from '../model-meta'
import type { OpenAIBaseTextAdapterOptions } from '@tanstack/openai-base'
import type { AzureClientOptions } from 'openai/azure'
import type { ResponseCreateParams } from 'openai/resources/responses/responses'
import type { ExternalTextProviderOptions } from '../text/text-provider-options'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * The reasoning levels of an OpenAI model name, for `chat({ reasoning })`.
 * `never` for a name that is not an OpenAI model, such as a deployment name.
 */
type ResolveReasoning<TModel extends string> =
  TModel extends keyof OpenAIModelReasoningByName
    ? OpenAIModelReasoningByName[TModel]
    : never

/** The client options that `AzureOpenAI` refuses, or types more narrowly. */
type NotForAzure =
  | 'provider'
  | 'dataResidency'
  | 'credential'
  | 'x509Transport'
  | 'workloadIdentity'

export interface AzureOpenAITextConfig
  extends
    Omit<OpenAIClientConfig, 'apiKey' | NotForAzure>,
    OpenAIBaseTextAdapterOptions {
  apiKey: string
  workloadIdentity?: AzureClientOptions['workloadIdentity']
  resourceName?: string
  apiVersion?: string
  deploymentName?: string
  deploymentNameMap?: Readonly<Record<string, string>>
}

function normalizeAzureBaseURL(baseURL: string): string {
  const url = new URL(baseURL.trim().replace(/\/+$/, ''))
  const azureHost = [
    '.openai.azure.com',
    '.cognitiveservices.azure.com',
    '.ai.azure.com',
  ].some((suffix) => url.hostname.endsWith(suffix))
  const path = url.pathname.replace(/\/+$/, '')
  if (
    azureHost &&
    ['', '/', '/openai', '/openai/v1/responses'].includes(path)
  ) {
    url.pathname = '/openai/v1'
    url.search = ''
  }
  return url.toString().replace(/\/+$/, '')
}

export class AzureOpenAITextAdapter<
  TModel extends string = string,
> extends OpenAIBaseResponsesTextAdapter<
  TModel,
  { [K in keyof ExternalTextProviderOptions]: ExternalTextProviderOptions[K] },
  ReadonlyArray<Modality>,
  DefaultMessageMetadataByModality,
  ReadonlyArray<string>,
  ResolveReasoning<TModel>
> {
  private readonly deploymentName: string

  constructor(config: AzureOpenAITextConfig, model: TModel) {
    const {
      apiKey,
      baseURL,
      resourceName,
      apiVersion,
      deploymentName,
      deploymentNameMap,
      ...clientOptions
    } = config
    const resource = resourceName?.trim()
    const selectedURL =
      baseURL?.trim() ||
      (resource ? 'https://' + resource + '.openai.azure.com/openai/v1' : '')
    if (!selectedURL)
      throw new Error('Azure OpenAI needs baseURL or resourceName')
    super(
      model,
      'azure-openai-responses',
      new AzureOpenAI({
        ...clientOptions,
        apiKey,
        baseURL: normalizeAzureBaseURL(selectedURL),
        apiVersion: apiVersion || 'v1',
      }),
      config,
    )
    this.deploymentName =
      deploymentName ||
      (deploymentNameMap && Object.hasOwn(deploymentNameMap, model)
        ? deploymentNameMap[model]
        : undefined) ||
      model
  }

  /**
   * `chat({ reasoning })` uses the OpenAI data of the model name, not of the
   * deployment name. It goes out as `reasoning: { effort, summary }`.
   */
  protected override modelReasoning(model: string) {
    return OPENAI_MODEL_REASONING[model]
  }

  /**
   * Sends the deployment name as the model, and converts the tools with the
   * OpenAI tool converter (file_search, web_search, and so on).
   */
  protected override mapOptionsToRequest(
    options: TextOptions<ExternalTextProviderOptions>,
  ): Omit<ResponseCreateParams, 'stream'> {
    const { tools: _baseTools, ...request } = super.mapOptionsToRequest({
      ...options,
      tools: undefined,
    })
    if (this.strictFallbackWarning) {
      warnStrictFallback(options.tools, options.logger)
    }
    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined
    return {
      ...request,
      ...(tools && tools.length > 0 && { tools }),
      model: this.deploymentName,
    }
  }
}

/**
 * Creates an Azure OpenAI text adapter with an explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The OpenAI model name, which also picks the `reasoning` levels, or your deployment name
 * @param apiKey - Your Azure OpenAI API key
 * @param config - The endpoint (`resourceName` or `baseURL`) and other options
 * @returns Configured Azure OpenAI text adapter instance
 *
 * @example
 * ```typescript
 * const adapter = createAzureOpenaiText('gpt-5.6', 'your-azure-key', {
 *   resourceName: 'my-resource',
 *   deploymentName: 'prod-chat',
 * });
 * ```
 */
export function createAzureOpenaiText<TModel extends string>(
  model: TModel,
  apiKey: string,
  config: Omit<AzureOpenAITextConfig, 'apiKey'>,
): AzureOpenAITextAdapter<TModel> {
  return new AzureOpenAITextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an Azure OpenAI text adapter from environment variables.
 *
 * Reads `AZURE_OPENAI_API_KEY`. Values that `config` does not set come from
 * `AZURE_OPENAI_BASE_URL` or `AZURE_OPENAI_RESOURCE_NAME`,
 * `AZURE_OPENAI_API_VERSION`, and `AZURE_OPENAI_DEPLOYMENT_NAME_MAP`
 * (`model=deployment,model=deployment`).
 *
 * @param model - The OpenAI model name, which also picks the `reasoning` levels, or your deployment name
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Azure OpenAI text adapter instance
 * @throws Error if AZURE_OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses AZURE_OPENAI_API_KEY and AZURE_OPENAI_RESOURCE_NAME
 * const adapter = azureOpenaiText('gpt-5.6');
 * ```
 */
export function azureOpenaiText<TModel extends string>(
  model: TModel,
  config?: Omit<AzureOpenAITextConfig, 'apiKey'>,
): AzureOpenAITextAdapter<TModel> {
  const env: Record<string, string | undefined> =
    typeof process === 'undefined' ? {} : process.env
  const hasEndpoint = !!(
    config?.baseURL?.trim() || config?.resourceName?.trim()
  )
  const deploymentNameMap =
    config?.deploymentNameMap ??
    Object.fromEntries(
      (env.AZURE_OPENAI_DEPLOYMENT_NAME_MAP ?? '')
        .split(',')
        .map((entry) => entry.split('=', 2).map((value) => value.trim()))
        .filter(([logical, deployment]) => logical && deployment),
    )
  return createAzureOpenaiText(model, getAzureOpenAIApiKeyFromEnv(), {
    ...config,
    ...(!hasEndpoint && {
      baseURL: env.AZURE_OPENAI_BASE_URL,
      resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
    }),
    apiVersion: config?.apiVersion || env.AZURE_OPENAI_API_VERSION,
    deploymentNameMap,
  })
}
