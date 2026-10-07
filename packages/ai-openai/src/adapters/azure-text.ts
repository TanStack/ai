import { AzureOpenAI } from 'openai'
import { OpenAIBaseResponsesTextAdapter } from '@tanstack/openai-base'
import { convertToolsToProviderFormat } from '../tools'
import type {
  AnyTool,
  ConfigReasoning,
  DefaultMessageMetadataByModality,
  Modality,
  ModelReasoning,
  ReasoningCapability,
  TextOptions,
} from '@tanstack/ai'
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
  /**
   * The model's reasoning data, for example `modelReasoning(record)` from a
   * `@tanstack/ai-models` record. With it, `chat({ reasoning })` sends
   * `reasoning.effort`. Without it, no reasoning field goes out.
   */
  reasoning?: ModelReasoning
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
  TReasoning extends ReasoningCapability = never,
> extends OpenAIBaseResponsesTextAdapter<
  string,
  { [K in keyof ExternalTextProviderOptions]: ExternalTextProviderOptions[K] },
  ReadonlyArray<Modality>,
  DefaultMessageMetadataByModality,
  ReadonlyArray<string>,
  TReasoning
> {
  override readonly api = 'azure-openai-responses'
  private readonly deploymentName: string
  private readonly configReasoning: ModelReasoning | undefined

  constructor(config: AzureOpenAITextConfig, model: string) {
    const {
      apiKey,
      baseURL,
      resourceName,
      apiVersion,
      deploymentName,
      deploymentNameMap,
      reasoning,
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
    const azureOptions = {
      ...clientOptions,
      apiKey: apiKey ?? env.AZURE_OPENAI_API_KEY,
      baseURL: normalizeAzureBaseURL(selectedURL),
      apiVersion: apiVersion || env.AZURE_OPENAI_API_VERSION || 'v1',
    }
    const client = new AzureOpenAI(azureOptions)
    // The SDK copy drops apiVersion. `wrapFetch` only sets the fetch.
    client.withOptions = ({ fetch }) =>
      new AzureOpenAI({ ...azureOptions, fetch })
    super(model, 'azure-openai-responses', client, config)
    this.configReasoning = reasoning
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

  protected override modelReasoning(_model: string) {
    return this.configReasoning
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

export function azureOpenaiText<
  TConfig extends AzureOpenAITextConfig = AzureOpenAITextConfig,
>(
  model: string,
  config?: TConfig,
): AzureOpenAITextAdapter<ConfigReasoning<TConfig, never>> {
  return new AzureOpenAITextAdapter(config ?? {}, model)
}
