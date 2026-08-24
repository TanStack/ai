import { createChatOptions } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import Anthropic from '@anthropic-ai/sdk'
import { createAnthropicChatWithClient } from '@tanstack/ai-anthropic'
import { createGeminiChat } from '@tanstack/ai-gemini'
import { createGeminiTextInteractions } from '@tanstack/ai-gemini/experimental'
import { vertexText } from '@tanstack/ai-vertex'
import { grokVertexText } from '@tanstack/ai-grok/vertex'
import { mistralVertexText } from '@tanstack/ai-mistral/vertex'
import { vertexE2eAuthClient, vertexE2eConfig } from '@/lib/vertex-e2e'
import { createOllamaChat } from '@tanstack/ai-ollama'
import { createGroqText } from '@tanstack/ai-groq'
import { createGrokText } from '@tanstack/ai-grok'
import { createBedrockText } from '@tanstack/ai-bedrock'
import { openaiCompatibleText } from '@tanstack/ai-openai/compatible'
import {
  createOpenRouterResponsesText,
  createOpenRouterText,
} from '@tanstack/ai-openrouter'
import { createVercelGatewayText } from '@tanstack/ai-vercel-gateway'
import { createLovableText } from '@tanstack/ai-lovable'
import { createMistralText } from '@tanstack/ai-mistral'
import { createBytePlusText } from '@tanstack/ai-byteplus'
import { createLLMGatewayText } from '@tanstack/ai-llmgateway'
import { HTTPClient } from '@openrouter/sdk'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { BytePlusChatModel } from '@tanstack/ai-byteplus'
import type { Feature, Provider } from '@/lib/types'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

const defaultModels: Record<Provider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5',
  gemini: 'gemini-2.5-flash',
  vertex: 'gemini-2.5-flash',
  'vertex-grok': 'grok-4.3',
  'vertex-mistral': 'mistral-medium-3',
  ollama: 'mistral',
  groq: 'llama-3.3-70b-versatile',
  grok: 'grok-build-0.1',
  bedrock: 'openai.gpt-oss-120b-1:0',
  'bedrock-responses': 'openai.gpt-oss-120b-1:0',
  openrouter: 'openai/gpt-4o',
  'openrouter-responses': 'openai/gpt-4o',
  'vercel-gateway': 'openai/gpt-5.5',
  'vercel-gateway-responses': 'openai/gpt-5.5',
  lovable: 'openai/gpt-5.5',
  'lovable-responses': 'openai/gpt-5.5',
  'openai-compatible': 'gpt-4o',
  mistral: 'mistral-large-latest',
  // Structured-output features override this in `features.ts`:
  // seed-2-0-lite-260428 rejects both `response_format: json_schema` and
  // `json_object` (live-probed), so it can't drive any structured feature.
  byteplus: 'seed-2-0-lite-260428',
  // ElevenLabs has no chat/text model — the support matrix already filters
  // it out of text features, but we still need an entry to satisfy the
  // Record<Provider, …> constraint.
  elevenlabs: '',
  llmgateway: 'gpt-5.6-terra',
}

export function createTextAdapter(
  provider: Provider,
  modelOverride?: string,
  _aimockPort?: number,
  testId?: string,
  feature?: Feature,
): { adapter: AnyTextAdapter } {
  const model = modelOverride ?? defaultModels[provider]

  // OpenAI, Grok SDKs need /v1 in baseURL. Groq SDK appends /openai/v1/ internally.
  // Anthropic, Gemini, Ollama SDKs include their path prefixes internally
  const base = LLMOCK_DEFAULT_BASE
  const openaiUrl = `${base}/v1`
  // BytePlus Ark's data plane lives under /api/v3. aimock's compat-path
  // normalizer rewrites any non-/v1//v2 path ending in /chat/completions to
  // /v1/chat/completions, so the Ark prefix reaches the native OpenAI handler
  // untouched — see testing/e2e/README.md § "BytePlus (Ark) path handling".
  const arkUrl = `${base}/api/v3`

  // X-Test-Id header for per-test sequenceIndex isolation in aimock
  const testHeaders = testId ? { 'X-Test-Id': testId } : undefined

  // The Gemini Interactions API lives at a different endpoint
  // (POST /v1beta/interactions) and uses a different adapter than the
  // standard Gemini chat path.
  if (provider === 'gemini' && feature === 'stateful-interactions') {
    return createChatOptions({
      adapter: createGeminiTextInteractions(
        model as 'gemini-2.5-flash',
        DUMMY_KEY,
        {
          httpOptions: {
            baseUrl: base,
            headers: testHeaders,
          },
        },
      ),
    })
  }

  const factories: Record<Provider, () => { adapter: AnyTextAdapter }> = {
    openai: () =>
      createChatOptions({
        adapter: createOpenaiChat(model as 'gpt-4o', DUMMY_KEY, {
          baseURL: openaiUrl,
          defaultHeaders: testHeaders,
        }),
      }),
    anthropic: () =>
      createChatOptions({
        adapter: createAnthropicChatWithClient(
          model as 'claude-sonnet-4-5',
          new Anthropic({
            apiKey: DUMMY_KEY,
            baseURL: base,
            defaultHeaders: testHeaders,
          }),
        ),
      }),
    gemini: () =>
      createChatOptions({
        adapter: createGeminiChat(model as 'gemini-2.5-flash', DUMMY_KEY, {
          httpOptions: {
            baseUrl: base,
            headers: testHeaders,
          },
        }),
      }),
    // Gemini on Vertex. Dummy ADC + project/location so the SDK posts
    // `/v1/projects/{p}/locations/{l}/publishers/google/models/{m}:…`,
    // which aimock already serves. See vertex-e2e.ts.
    vertex: () =>
      createChatOptions({
        adapter: vertexText(
          model as 'gemini-2.5-flash',
          vertexE2eConfig(base, testHeaders),
        ),
      }),
    // Grok on Vertex. Dummy ADC + aimock `/v1` so the OpenAI Responses
    // client hits the same path as the xAI Grok row. The factory still
    // prefixes the wire model with `xai/`.
    'vertex-grok': () =>
      createChatOptions({
        adapter: grokVertexText(model as 'grok-4.3', {
          project: 'e2e-project',
          location: 'global',
          baseURL: openaiUrl,
          authClient: vertexE2eAuthClient(),
          defaultHeaders: testHeaders,
        }),
      }),
    // Mistral on Vertex. `resolveRequestUrl` skips the publisher
    // `:rawPredict` rewrite and posts to aimock `/v1/chat/completions`.
    'vertex-mistral': () =>
      createChatOptions({
        adapter: mistralVertexText(model as 'mistral-medium-3', {
          project: 'e2e-project',
          location: 'us-central1',
          authClient: vertexE2eAuthClient(),
          defaultHeaders: testHeaders,
          resolveRequestUrl: () => `${base}/v1/chat/completions`,
        }),
      }),
    ollama: () =>
      createChatOptions({
        adapter: createOllamaChat(
          model as 'mistral',
          testHeaders ? { host: base, headers: testHeaders } : base,
        ),
      }),
    groq: () =>
      createChatOptions({
        adapter: createGroqText(model as 'llama-3.3-70b-versatile', DUMMY_KEY, {
          baseURL: base,
          defaultHeaders: testHeaders,
        }),
      }),
    grok: () =>
      createChatOptions({
        adapter: createGrokText(model as 'grok-build-0.1', DUMMY_KEY, {
          baseURL: openaiUrl,
          defaultHeaders: testHeaders,
        }),
      }),
    // NOTE: Only the OpenAI-compatible Bedrock paths are E2E-covered here.
    // The default `bedrock-converse` adapter uses the AWS binary event-stream
    // (vnd.amazon.eventstream) Converse protocol, which aimock cannot replay —
    // that path is covered by unit tests in packages/ai-bedrock/tests/converse/
    // instead. See testing/e2e/README.md § "Bedrock Converse coverage gap".
    bedrock: () =>
      createChatOptions({
        adapter: createBedrockText(
          model as 'openai.gpt-oss-120b-1:0',
          DUMMY_KEY,
          {
            baseURL: openaiUrl,
            defaultHeaders: testHeaders,
            // Converse is now the default; this matrix entry exercises the
            // OpenAI-compatible Chat Completions path, so pin api: 'chat'.
            api: 'chat',
          },
        ),
      }),
    'bedrock-responses': () =>
      createChatOptions({
        adapter: createBedrockText(
          model as 'openai.gpt-oss-120b-1:0',
          DUMMY_KEY,
          {
            baseURL: openaiUrl,
            defaultHeaders: testHeaders,
            api: 'responses',
          },
        ),
      }),
    openrouter: () => {
      // OpenRouter SDK exposes an HTTPClient with beforeRequest hooks. Use
      // that to inject X-Test-Id, since `defaultHeaders` isn't supported and
      // the SDK strips query params off `serverURL` when building per-request
      // URLs (it does `new URL(path, baseURL)` which drops the search), so
      // the previous `?testId=...` trick never actually reached aimock and
      // multiple openrouter tests collided on the `__default__` test bucket.
      const httpClient = new HTTPClient()
      if (testId) {
        httpClient.addHook('beforeRequest', (req) => {
          const next = new Request(req)
          next.headers.set('X-Test-Id', testId)
          return next
        })
      }
      return createChatOptions({
        adapter: createOpenRouterText(model as 'openai/gpt-4o', DUMMY_KEY, {
          serverURL: openaiUrl,
          httpClient,
        }),
      })
    },
    'openrouter-responses': () => {
      // Same X-Test-Id injection rationale as the chat-completions factory
      // above. The beta Responses endpoint uses the same SDK base URL +
      // HTTPClient surface.
      const httpClient = new HTTPClient()
      if (testId) {
        httpClient.addHook('beforeRequest', (req) => {
          const next = new Request(req)
          next.headers.set('X-Test-Id', testId)
          return next
        })
      }
      return createChatOptions({
        adapter: createOpenRouterResponsesText(
          model as 'openai/gpt-4o',
          DUMMY_KEY,
          { serverURL: openaiUrl, httpClient },
        ),
      })
    },
    'vercel-gateway': () =>
      createChatOptions({
        adapter: createVercelGatewayText(model as 'openai/gpt-5.5', DUMMY_KEY, {
          api: 'chat',
          baseURL: openaiUrl,
          defaultHeaders: testHeaders,
        }),
      }),
    'vercel-gateway-responses': () =>
      createChatOptions({
        adapter: createVercelGatewayText(model as 'openai/gpt-5.5', DUMMY_KEY, {
          api: 'responses',
          baseURL: openaiUrl,
          defaultHeaders: testHeaders,
        }),
      }),
    lovable: () =>
      createChatOptions({
        adapter: createLovableText(model as 'openai/gpt-5.5', DUMMY_KEY, {
          api: 'chat',
          baseURL: openaiUrl,
          defaultHeaders: testHeaders,
        }),
      }),
    'lovable-responses': () =>
      createChatOptions({
        adapter: createLovableText(model as 'openai/gpt-5.5', DUMMY_KEY, {
          api: 'responses',
          baseURL: openaiUrl,
          defaultHeaders: testHeaders,
        }),
      }),
    'openai-compatible': () =>
      createChatOptions({
        adapter: openaiCompatibleText(model, {
          baseURL: openaiUrl,
          apiKey: DUMMY_KEY,
          defaultHeaders: testHeaders,
        }),
      }),
    mistral: () =>
      createChatOptions({
        adapter: createMistralText(model as 'mistral-large-latest', DUMMY_KEY, {
          serverURL: base,
          defaultHeaders: testHeaders,
        }),
      }),
    byteplus: () =>
      createChatOptions({
        adapter: createBytePlusText(model as BytePlusChatModel, DUMMY_KEY, {
          baseURL: arkUrl,
          defaultHeaders: testHeaders,
        }),
      }),
    elevenlabs: () => {
      throw new Error(
        'ElevenLabs has no text/chat adapter — use createTTSAdapter or createTranscriptionAdapter.',
      )
    },
    llmgateway: () =>
      createChatOptions({
        adapter: createLLMGatewayText(model as 'gpt-5.6-terra', DUMMY_KEY, {
          baseURL: openaiUrl,
          defaultHeaders: testHeaders,
        }),
      }),
  }

  return factories[provider]()
}
