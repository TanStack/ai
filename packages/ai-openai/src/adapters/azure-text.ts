import { AzureOpenAI } from 'openai'
import { OpenAIBaseResponsesTextAdapter } from '@tanstack/openai-base'
import { convertToolsToProviderFormat } from '../tools'
import type { AnyTool, TextOptions } from '@tanstack/ai'
import type { OpenAIBaseTextAdapterOptions } from '@tanstack/openai-base'
import type { Tool as ResponsesTool } from 'openai/resources/responses/responses'
import type { ExternalTextProviderOptions } from '../text/text-provider-options'
import type { OpenAIClientConfig } from '../utils/client'

export interface AzureOpenAITextConfig
  extends Omit<OpenAIClientConfig, 'apiKey'>, OpenAIBaseTextAdapterOptions {
  apiKey?: string
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
  { [K in keyof ExternalTextProviderOptions]: ExternalTextProviderOptions[K] }
> {
  override readonly api = 'azure-openai-responses'
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
    const client = new AzureOpenAI({
      ...clientOptions,
      apiKey: apiKey ?? env.AZURE_OPENAI_API_KEY,
      baseURL: normalizeAzureBaseURL(selectedURL),
      apiVersion: apiVersion || env.AZURE_OPENAI_API_VERSION || 'v1',
    })
    super(model, 'azure-openai-responses', client, config)
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

  protected override convertTools(tools: Array<AnyTool>): Array<ResponsesTool> {
    return convertToolsToProviderFormat(tools)
  }

  protected override mapOptionsToRequest(
    options: TextOptions<ExternalTextProviderOptions>,
  ) {
    return { ...super.mapOptionsToRequest(options), model: this.deploymentName }
  }
}

export function azureOpenaiText(
  model: string,
  config: AzureOpenAITextConfig = {},
): AzureOpenAITextAdapter {
  return new AzureOpenAITextAdapter(config, model)
}
