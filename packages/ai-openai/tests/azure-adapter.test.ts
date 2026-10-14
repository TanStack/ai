import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import * as publicApi from '../src/index'
import { azureOpenaiText, createAzureOpenaiText } from '../src/index'

const logger = resolveDebugOption(false)

function transport() {
  const requests: Array<{
    url: string
    headers: Headers
    body: Record<string, unknown>
  }> = []
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const body = JSON.parse(await request.text())
    requests.push({ url: request.url, headers: request.headers, body })
    const response = {
      id: 'azure-generation',
      model: 'reported-deployment',
      status: 'completed',
      output: [
        {
          type: 'message',
          id: 'message',
          role: 'assistant',
          status: 'completed',
          content: [
            { type: 'output_text', text: '{"ok":true}', annotations: [] },
          ],
        },
      ],
    }
    if (body.stream)
      return new Response(
        'data: ' +
          JSON.stringify({ type: 'response.completed', response }) +
          '\n\ndata: [DONE]\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      )
    return Response.json(response)
  }
  return { fetcher, requests }
}

async function drain(adapter: ReturnType<typeof azureOpenaiText>) {
  const chunks = []
  for await (const chunk of adapter.chatStream({
    logger,
    model: adapter.model,
    messages: [{ role: 'user', content: 'Go' }],
  }))
    chunks.push(chunk)
  return chunks
}

beforeEach(() => {
  for (const name of [
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_BASE_URL',
    'AZURE_OPENAI_RESOURCE_NAME',
    'AZURE_OPENAI_API_VERSION',
    'AZURE_OPENAI_DEPLOYMENT_NAME_MAP',
    'OPENAI_BASE_URL',
  ])
    vi.stubEnv(name, '')
})

afterEach(() => vi.unstubAllEnvs())

describe('Azure Responses factory', () => {
  it.each(['inherited', 'own', 'explicit'] as const)(
    'JSON keys use only owned deployment map entries: %s',
    async (kind) => {
      const deploymentNameMap: Record<string, string> = Object.create({
        'gpt-5.5': 'inherited-deployment',
      })
      if (kind !== 'inherited')
        Object.defineProperty(deploymentNameMap, 'gpt-5.5', {
          value: 'own-deployment',
          enumerable: true,
        })
      const { fetcher, requests } = transport()
      await drain(
        createAzureOpenaiText('gpt-5.5', 'key', {
          resourceName: 'resource',
          deploymentNameMap,
          ...(kind === 'explicit'
            ? { deploymentName: 'explicit-deployment' }
            : {}),
          fetch: fetcher,
        }),
      )
      expect(requests[0]?.body.model).toBe(
        kind === 'inherited'
          ? 'gpt-5.5'
          : kind === 'own'
            ? 'own-deployment'
            : 'explicit-deployment',
      )
      expect(
        Reflect.get(Object.getPrototypeOf(deploymentNameMap), 'gpt-5.5'),
      ).toBe('inherited-deployment')
    },
  )
  it('exports both factories and the adapter from the existing root', () => {
    expect(publicApi).toHaveProperty('azureOpenaiText')
    expect(publicApi).toHaveProperty('createAzureOpenaiText')
    expect(publicApi).toHaveProperty('AzureOpenAITextAdapter')
  })

  it('createAzureOpenaiText reads nothing from the environment', async () => {
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'env-key')
    vi.stubEnv('AZURE_OPENAI_API_VERSION', 'env-version')
    vi.stubEnv('AZURE_OPENAI_DEPLOYMENT_NAME_MAP', 'gpt-5.5=env-deployment')
    const { fetcher, requests } = transport()
    await drain(
      createAzureOpenaiText('gpt-5.5', 'explicit-key', {
        resourceName: 'resource',
        fetch: fetcher,
      }),
    )
    expect(requests[0]?.url).toBe(
      'https://resource.openai.azure.com/openai/v1/responses?api-version=v1',
    )
    expect(requests[0]?.headers.get('api-key')).toBe('explicit-key')
    expect(requests[0]?.body.model).toBe('gpt-5.5')
  })

  it('createAzureOpenaiText needs an endpoint', () => {
    vi.stubEnv('AZURE_OPENAI_RESOURCE_NAME', 'env-resource')
    expect(() => createAzureOpenaiText('gpt-5.5', 'key', {})).toThrow(
      'Azure OpenAI needs baseURL or resourceName',
    )
  })

  it('azureOpenaiText throws without AZURE_OPENAI_API_KEY', () => {
    vi.stubEnv('AZURE_OPENAI_RESOURCE_NAME', 'resource')
    expect(() => azureOpenaiText('gpt-5.5')).toThrow('AZURE_OPENAI_API_KEY')
  })

  it.each([
    [
      'https://resource.openai.azure.com',
      'https://resource.openai.azure.com/openai/v1/responses',
    ],
    [
      'https://resource.openai.azure.com/openai',
      'https://resource.openai.azure.com/openai/v1/responses',
    ],
    [
      'https://resource.cognitiveservices.azure.com/openai/v1/responses',
      'https://resource.cognitiveservices.azure.com/openai/v1/responses',
    ],
    [
      'https://resource.ai.azure.com/',
      'https://resource.ai.azure.com/openai/v1/responses',
    ],
    [
      'https://gateway.invalid/custom/v1',
      'https://gateway.invalid/custom/v1/responses',
    ],
  ])(
    'normalizes %s through the actual Azure SDK',
    async (baseURL, expected) => {
      const { fetcher, requests } = transport()
      const adapter = createAzureOpenaiText('gpt-5.5', 'azure-key', {
        baseURL,
        fetch: fetcher,
      })
      await drain(adapter)
      const request = requests[0]
      expect(request?.url).toBe(expected + '?api-version=v1')
      expect(request?.headers.get('api-key')).toBe('azure-key')
      expect(request?.headers.has('authorization')).toBe(false)
      expect(request?.body.model).toBe('gpt-5.5')
      expect(adapter.model).toBe('gpt-5.5')
    },
  )

  it('azureOpenaiText lets config values win over the environment', async () => {
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'env-key')
    vi.stubEnv('AZURE_OPENAI_BASE_URL', 'https://env.openai.azure.com')
    vi.stubEnv('AZURE_OPENAI_RESOURCE_NAME', 'env-resource')
    vi.stubEnv('AZURE_OPENAI_API_VERSION', 'env-version')
    vi.stubEnv('AZURE_OPENAI_DEPLOYMENT_NAME_MAP', 'gpt-5.5=env-deployment')
    vi.stubEnv('OPENAI_BASE_URL', 'https://unrelated.invalid/v1')
    const { fetcher, requests } = transport()
    const adapter = azureOpenaiText('gpt-5.5', {
      baseURL: 'https://explicit.openai.azure.com',
      apiVersion: 'explicit-version',
      deploymentName: 'explicit-deployment',
      deploymentNameMap: { 'gpt-5.5': 'mapped-deployment' },
      fetch: fetcher,
      defaultHeaders: { 'x-control': 'kept' },
      timeout: 1234,
      maxRetries: 0,
    })
    await drain(adapter)
    expect(requests[0]?.url).toBe(
      'https://explicit.openai.azure.com/openai/v1/responses?api-version=explicit-version',
    )
    expect(requests[0]?.headers.get('api-key')).toBe('env-key')
    expect(requests[0]?.headers.get('x-control')).toBe('kept')
    expect(requests[0]?.body.model).toBe('explicit-deployment')
    expect(adapter.model).toBe('gpt-5.5')
  })

  it('azureOpenaiText uses a config deployment map before the environment map', async () => {
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'env-key')
    vi.stubEnv('AZURE_OPENAI_DEPLOYMENT_NAME_MAP', 'gpt-5.5=env-deployment')
    const { fetcher, requests } = transport()
    const adapter = azureOpenaiText('gpt-5.5', {
      resourceName: 'resource',
      deploymentNameMap: { 'gpt-5.5': 'explicit-mapped-deployment' },
      fetch: fetcher,
    })
    await drain(adapter)
    expect(requests[0]?.body.model).toBe('explicit-mapped-deployment')
    expect(adapter.model).toBe('gpt-5.5')
  })

  it('uses resource and trimmed environment deployment mapping', async () => {
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'env-key')
    vi.stubEnv('AZURE_OPENAI_RESOURCE_NAME', 'resource')
    vi.stubEnv(
      'AZURE_OPENAI_DEPLOYMENT_NAME_MAP',
      ' bad, gpt-5.5 = first , gpt-5.5 = final , other=another ',
    )
    const { fetcher, requests } = transport()
    await drain(azureOpenaiText('gpt-5.5', { fetch: fetcher }))
    expect(requests[0]?.url).toBe(
      'https://resource.openai.azure.com/openai/v1/responses?api-version=v1',
    )
    expect(requests[0]?.body.model).toBe('final')
  })

  it('azureOpenaiText lets a config resource name win over the environment base URL', async () => {
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'env-key')
    vi.stubEnv('AZURE_OPENAI_BASE_URL', 'https://env.openai.azure.com')
    const { fetcher, requests } = transport()
    await drain(
      azureOpenaiText('gpt-5.5', {
        resourceName: 'explicit-resource',
        fetch: fetcher,
      }),
    )
    expect(requests[0]?.url).toBe(
      'https://explicit-resource.openai.azure.com/openai/v1/responses?api-version=v1',
    )
  })

  it('sends the deployment name on native structured output', async () => {
    const { fetcher, requests } = transport()
    const adapter = createAzureOpenaiText('gpt-5.5', 'key', {
      resourceName: 'resource',
      deploymentName: 'explicit-deployment',
      fetch: fetcher,
    })
    const result = await adapter.structuredOutput({
      chatOptions: {
        logger,
        model: adapter.model,
        messages: [{ role: 'user', content: 'Go' }],
      },
      outputSchema: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false,
      },
    })
    expect(result).toMatchObject({ data: { ok: true } })
    expect(requests[0]?.body.model).toBe('explicit-deployment')
  })
})

describe('Azure chat({ reasoning })', () => {
  async function reasoningBody(model: string, deploymentName?: string) {
    const { fetcher, requests } = transport()
    const adapter = createAzureOpenaiText(model, 'key', {
      resourceName: 'resource',
      ...(deploymentName ? { deploymentName } : {}),
      fetch: fetcher,
    })
    for await (const _chunk of adapter.chatStream({
      logger,
      model: adapter.model,
      messages: [{ role: 'user', content: 'Go' }],
      reasoning: { level: 'high', summary: true },
    })) {
      // Drain the stream.
    }
    return requests[0]?.body
  }

  it('sends reasoning.effort from the OpenAI data of the model name', async () => {
    const body = await reasoningBody('gpt-5.5', 'prod-chat')
    expect(body?.model).toBe('prod-chat')
    expect(body?.reasoning).toEqual({ effort: 'high', summary: 'auto' })
  })

  it('sends no reasoning for a name that is not an OpenAI model', async () => {
    const body = await reasoningBody('my-deployment')
    expect(body).not.toHaveProperty('reasoning')
  })
})
