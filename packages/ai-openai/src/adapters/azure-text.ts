import { AzureOpenAI } from 'openai'
import {
  OpenAIBaseResponsesTextAdapter,
  warnStrictFallback,
} from '@tanstack/openai-base'
import { convertToolsToProviderFormat } from '../tools'
import type {
  DefaultMessageMetadataByModality,
  Modality,
  TextOptions,
} from '@tanstack/ai'
import type { OpenAIBaseTextAdapterOptions } from '@tanstack/openai-base'
import type { AzureClientOptions } from 'openai/azure'
import type { ResponseCreateParams } from 'openai/resources/responses/responses'
import type { ExternalTextProviderOptions } from '../text/text-provider-options'
import type { OpenAIClientConfig } from '../utils/client'

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
  apiKey?: string
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

export class AzureOpenAITextAdapter extends OpenAIBaseResponsesTextAdapter<
  string,
  { [K in keyof ExternalTextProviderOptions]: ExternalTextProviderOptions[K] },
  ReadonlyArray<Modality>,
  DefaultMessageMetadataByModality,
  ReadonlyArray<string>
> {
  private readonly deploymentName: string

  constructor(config: AzureOpenAITextConfig, model: string) {
    const {
      apiKey,
      baseURL,
      resourceName,
      apiVersion,
      deploymentName,
      deploymentNameMap,
      ...clientOptions
    } = config
    const env: Record<string, string | undefined> =
      typeof process === 'undefined' ? {} : process.env
    const explicitResource = resourceName?.trim()
    const resource = explicitResource || env.AZURE_OPENAI_RESOURCE_NAME?.trim()
    const selectedURL =
      baseURL?.trim() ||
      (explicitResource
        ? 'https://' + explicitResource + '.openai.azure.com/openai/v1'
        : env.AZURE_OPENAI_BASE_URL?.trim()) ||
      (resource
        ? 'https://' + resource + '.openai.azure.com/openai/v1'
        : undefined)
    if (!selectedURL)
      throw new Error('Azure OpenAI needs baseURL or resourceName')
    super(
      model,
      'azure-openai-responses',
      new AzureOpenAI({
        ...clientOptions,
        apiKey: apiKey ?? env.AZURE_OPENAI_API_KEY,
        baseURL: normalizeAzureBaseURL(selectedURL),
        apiVersion: apiVersion || env.AZURE_OPENAI_API_VERSION || 'v1',
      }),
      config,
    )
    const envMap = new Map<string, string>()
    for (const entry of (env.AZURE_OPENAI_DEPLOYMENT_NAME_MAP ?? '').split(
      ',',
    )) {
      const [logical, deployment] = entry
        .split('=', 2)
        .map((value) => value.trim())
      if (logical && deployment) envMap.set(logical, deployment)
    }
    this.deploymentName =
      deploymentName ||
      (deploymentNameMap
        ? Object.hasOwn(deploymentNameMap, model)
          ? deploymentNameMap[model]
          : undefined
        : envMap.get(model)) ||
      model
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

export function azureOpenaiText(
  model: string,
  config?: AzureOpenAITextConfig,
): AzureOpenAITextAdapter {
  return new AzureOpenAITextAdapter(config ?? {}, model)
}
