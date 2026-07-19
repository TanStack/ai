import { describe, expect, it } from 'vitest'
import { withBedrockDefaults } from '../src/utils/client'

/**
 * Regression tests for issue #925: `@tanstack/ai-bedrock` hardcoded the
 * `bedrock-mantle` base URL to `/v1`, but AWS serves different model families
 * on different mantle paths. Gemma needs `/openai/v1`; gpt-oss / DeepSeek use
 * the `/v1` default. Sending a request to the wrong path returned a misleading
 * `401 ... is not enabled for this account (access_denied)` instead of a
 * 404 / "wrong path" error, which made the bug hard to diagnose.
 *
 * The fix threads the model id through `withBedrockDefaults` → `buildBaseURL`
 * → `mantlePathForModel` and picks the path per model family. These tests pin
 * the per-family path so a future refactor can't silently regress to the
 * hardcoded `/v1`.
 *
 * Note: `anthropic.claude-*` on mantle uses the Anthropic Messages API at
 * `/anthropic/v1/messages` — a different wire format from OpenAI Chat
 * Completions, so the chat adapter can't drive it regardless of the path. The
 * catalog already marks Claude as `chat: false`, so that combination
 * typechecks as an error today. These tests therefore do not assert a Claude
 * mantle path; they assert only that the chat-capable model families route to
 * the documented path.
 */
describe('withBedrockDefaults — mantle path per model (#925)', () => {
  it('routes Gemma to /openai/v1 on mantle', () => {
    const out = withBedrockDefaults(
      { apiKey: 'k', region: 'eu-central-1', endpoint: 'mantle' },
      undefined,
      'google.gemma-4-31b',
    )
    expect(out.baseURL).toBe(
      'https://bedrock-mantle.eu-central-1.api.aws/openai/v1',
    )
  })

  it('routes a versioned Gemma id to /openai/v1 on mantle', () => {
    const out = withBedrockDefaults(
      { apiKey: 'k', region: 'us-east-1', endpoint: 'mantle' },
      undefined,
      'google.gemma-4-31b:0',
    )
    expect(out.baseURL).toBe(
      'https://bedrock-mantle.us-east-1.api.aws/openai/v1',
    )
  })

  it('routes a future Gemma variant (gemma-7b) to /openai/v1 on mantle', () => {
    const out = withBedrockDefaults(
      { apiKey: 'k', region: 'us-east-1', endpoint: 'mantle' },
      undefined,
      'google.gemma-7b-instruct-v1:0',
    )
    expect(out.baseURL).toBe(
      'https://bedrock-mantle.us-east-1.api.aws/openai/v1',
    )
  })

  it('routes DeepSeek to the /v1 default on mantle', () => {
    const out = withBedrockDefaults(
      { apiKey: 'k', region: 'us-east-1', endpoint: 'mantle' },
      undefined,
      'deepseek.r1-v1:0',
    )
    expect(out.baseURL).toBe('https://bedrock-mantle.us-east-1.api.aws/v1')
  })

  it('routes gpt-oss to the /v1 default on mantle', () => {
    const out = withBedrockDefaults(
      { apiKey: 'k', region: 'us-east-1', endpoint: 'mantle' },
      undefined,
      'openai.gpt-oss-120b-1:0',
    )
    expect(out.baseURL).toBe('https://bedrock-mantle.us-east-1.api.aws/v1')
  })

  it('routes an unknown model id to the /v1 default on mantle (backward compat)', () => {
    const out = withBedrockDefaults(
      { apiKey: 'k', region: 'us-east-1', endpoint: 'mantle' },
      undefined,
      'acme.future-model-v1:0',
    )
    expect(out.baseURL).toBe('https://bedrock-mantle.us-east-1.api.aws/v1')
  })

  it('keeps the /v1 default when model is omitted (backward compat)', () => {
    // Pre-#925 callers pass no `model` arg. Their URL must stay exactly what
    // it was before the fix so existing deployments don't shift baseURL.
    const out = withBedrockDefaults({
      apiKey: 'k',
      region: 'eu-west-1',
      endpoint: 'mantle',
    })
    expect(out.baseURL).toBe('https://bedrock-mantle.eu-west-1.api.aws/v1')
  })

  it('keeps the /v1 default when model is undefined (explicit undefined arg)', () => {
    const out = withBedrockDefaults(
      { apiKey: 'k', region: 'us-east-1', endpoint: 'mantle' },
      undefined,
      undefined,
    )
    expect(out.baseURL).toBe('https://bedrock-mantle.us-east-1.api.aws/v1')
  })

  it('keeps the /v1 default when model is an empty string', () => {
    const out = withBedrockDefaults(
      { apiKey: 'k', region: 'us-east-1', endpoint: 'mantle' },
      undefined,
      '',
    )
    expect(out.baseURL).toBe('https://bedrock-mantle.us-east-1.api.aws/v1')
  })

  it('does not match google.gemma- as a substring in unrelated ids', () => {
    // A model id like `acme.google.gemma-fake-v1:0` would be a substring match
    // for `google.gemma-` — verify it still routes to /v1 because we use
    // `startsWith`, not `includes`. (Bedrock model ids always start with the
    // provider prefix, so this is the right contract.)
    const out = withBedrockDefaults(
      { apiKey: 'k', region: 'us-east-1', endpoint: 'mantle' },
      undefined,
      'acme.google.gemma-fake-v1:0',
    )
    expect(out.baseURL).toBe('https://bedrock-mantle.us-east-1.api.aws/v1')
  })

  it('honors an explicit baseURL override even when model would route elsewhere', () => {
    const out = withBedrockDefaults(
      {
        apiKey: 'k',
        region: 'us-east-1',
        endpoint: 'mantle',
        baseURL: 'http://127.0.0.1:4010/v1',
      },
      undefined,
      'google.gemma-4-31b',
    )
    expect(out.baseURL).toBe('http://127.0.0.1:4010/v1')
  })
})

describe('withBedrockDefaults — runtime endpoint ignores model (#925)', () => {
  // The runtime endpoint serves every chat-capable model at /openai/v1, so the
  // model parameter has no effect on the runtime branch. Pinning this prevents
  // a future refactor from accidentally prefix-matching on the runtime path.
  it('routes gpt-oss to /openai/v1 on runtime regardless of model', () => {
    const out = withBedrockDefaults(
      { apiKey: 'k', region: 'us-east-1', endpoint: 'runtime' },
      undefined,
      'openai.gpt-oss-120b-1:0',
    )
    expect(out.baseURL).toBe(
      'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1',
    )
  })

  it('routes Gemma to /openai/v1 on runtime (model has no effect on runtime)', () => {
    const out = withBedrockDefaults(
      { apiKey: 'k', region: 'us-east-1', endpoint: 'runtime' },
      undefined,
      'google.gemma-4-31b',
    )
    expect(out.baseURL).toBe(
      'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1',
    )
  })

  it('routes an unknown model to /openai/v1 on runtime', () => {
    const out = withBedrockDefaults(
      { apiKey: 'k', region: 'us-east-1', endpoint: 'runtime' },
      undefined,
      'acme.future-model-v1:0',
    )
    expect(out.baseURL).toBe(
      'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1',
    )
  })
})
