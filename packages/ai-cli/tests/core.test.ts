import { describe, expect, it } from 'vitest'
import {
  bundledProviders,
  instantiateAdapter,
  resolveApiKey,
  resolveModelSlug,
} from '../src/core/providers'
import { mergeOptions } from '../src/core/config'
import { resolveOutputMode } from '../src/core/output'
import { coerceFlags } from '../src/cli/options'
import { CliError, ExitCode, toCliError } from '../src/core/exit-codes'
import { inferMimeType, resolvePrompt } from '../src/core/io'
import { tokenizeCommand } from '../src/cli/mcp-clients'
import { findCommand } from '../src/manifest/manifest'
import type { CommandSpec } from '../src/manifest/types'

describe('resolveModelSlug', () => {
  it('parses a provider/model slug', () => {
    const r = resolveModelSlug('openai/gpt-5.5')
    expect(r.provider).toBe('openai')
    expect(r.model).toBe('gpt-5.5')
  })

  it('infers provider for a known bare model', () => {
    expect(resolveModelSlug('gpt-5.5').provider).toBe('openai')
  })

  it('rejects an unknown provider', () => {
    expect(() => resolveModelSlug('bogus/x')).toThrowError(CliError)
  })

  it('rejects a bare model it cannot infer', () => {
    expect(() => resolveModelSlug('mystery-model')).toThrowError(/provider\/model/)
  })

  it('rejects a slug with an empty model', () => {
    expect(() => resolveModelSlug('openai/')).toThrowError(CliError)
  })

  it('splits only on the first slash (multi-segment model ids)', () => {
    const or = resolveModelSlug('openrouter/openai/gpt-oss-120b')
    expect(or.provider).toBe('openrouter')
    expect(or.model).toBe('openai/gpt-oss-120b')
    const fal = resolveModelSlug('fal/fal-ai/ltx-video')
    expect(fal.provider).toBe('fal')
    expect(fal.model).toBe('fal-ai/ltx-video')
  })
})

describe('instantiateAdapter factory resolution (no network — just constructs adapters)', () => {
  const make = (slug: string, activity: Parameters<typeof instantiateAdapter>[0]['activity']) =>
    instantiateAdapter({ resolved: resolveModelSlug(slug), activity, apiKey: 'test-key' })

  it('resolves openai chat via the create*Chat factory', async () => {
    expect(await make('openai/gpt-5.5', 'chat')).toBeTruthy()
  })

  it('resolves openrouter chat via the *Text factory (not Chat)', async () => {
    // Regression: OpenRouter exports createOpenRouterText, and the prefix is
    // "OpenRouter" (capital R), not "Openrouter".
    expect(await make('openrouter/openai/gpt-oss-120b', 'chat')).toBeTruthy()
  })

  it('resolves fal image via the falImage factory + config-object key style', async () => {
    // Regression: fal uses `falImage(model, { apiKey })`, not createFalImage(model, key).
    expect(await make('fal/fal-ai/flux/dev', 'image')).toBeTruthy()
  })

  it('throws PROVIDER_NOT_INSTALLED for a non-bundled provider', async () => {
    await expect(make('groq/llama-3.3-70b-versatile', 'chat')).rejects.toMatchObject({
      code: 'PROVIDER_NOT_INSTALLED',
    })
  })

  it('throws USAGE when a provider does not support an activity', async () => {
    await expect(make('fal/fal-ai/flux/dev', 'chat')).rejects.toMatchObject({ code: 'USAGE' })
  })
})

describe('resolveApiKey', () => {
  const { entry } = resolveModelSlug('openai/gpt-5.5')

  it('prefers the explicit key', () => {
    expect(resolveApiKey(entry, 'openai', 'sk-explicit', {})).toBe('sk-explicit')
  })

  it('falls back to the conventional env var', () => {
    expect(resolveApiKey(entry, 'openai', undefined, { OPENAI_API_KEY: 'sk-env' })).toBe('sk-env')
  })

  it('throws a USAGE error when no key is available', () => {
    try {
      resolveApiKey(entry, 'openai', undefined, {})
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect((err as CliError).exitCode).toBe(ExitCode.Usage)
    }
  })
})

describe('bundledProviders', () => {
  it('lists exactly the five zero-install providers', () => {
    expect(bundledProviders().sort()).toEqual(
      ['anthropic', 'fal', 'gemini', 'openai', 'openrouter'].sort(),
    )
  })
})

describe('mergeOptions', () => {
  it('lets defined flags win over config but keeps config for undefined flags', () => {
    const merged = mergeOptions(
      { model: 'openai/gpt-5.5', size: undefined },
      { model: 'anthropic/x', size: '1024x1024', extra: true },
    )
    expect(merged).toEqual({ model: 'openai/gpt-5.5', size: '1024x1024', extra: true })
  })
})

describe('resolveOutputMode', () => {
  it('returns json when --json is set', () => {
    expect(resolveOutputMode({ json: true })).toBe('json')
  })
  it('returns stream when --stream is set', () => {
    expect(resolveOutputMode({ stream: true })).toBe('stream')
  })
  it('prefers stream when both are set', () => {
    expect(resolveOutputMode({ json: true, stream: true })).toBe('stream')
  })
  it('is pretty on a TTY and json otherwise', () => {
    expect(resolveOutputMode({ isTTY: true })).toBe('pretty')
    expect(resolveOutputMode({ isTTY: false })).toBe('json')
  })
})

describe('coerceFlags', () => {
  const spec = findCommand('image') as CommandSpec

  it('coerces numbers and leaves config/strings alone', () => {
    const out = coerceFlags(spec, { count: '3', model: 'openai/gpt-image-1', config: '{"a":1}' })
    expect(out.count).toBe(3)
    expect(out.model).toBe('openai/gpt-image-1')
    expect(out.config).toBe('{"a":1}')
  })

  it('throws on a non-numeric number flag', () => {
    expect(() => coerceFlags(spec, { count: 'abc' })).toThrowError(/must be a number/)
  })

  it('parses json flags from the chat command', () => {
    const chatSpec = findCommand('chat') as CommandSpec
    const out = coerceFlags(chatSpec, { messages: '[{"role":"user","content":"hi"}]' })
    expect(Array.isArray(out.messages)).toBe(true)
  })
})

describe('exit codes', () => {
  it('maps error codes to exit codes', () => {
    expect(new CliError('USAGE', 'x').exitCode).toBe(ExitCode.Usage)
    expect(new CliError('PROVIDER_NOT_INSTALLED', 'x').exitCode).toBe(ExitCode.ProviderNotInstalled)
    expect(new CliError('PROVIDER', 'x').exitCode).toBe(ExitCode.Provider)
  })

  it('coerces unknown throws into a runtime CliError', () => {
    const e = toCliError(new Error('boom'))
    expect(e).toBeInstanceOf(CliError)
    expect(e.code).toBe('RUNTIME')
  })

  it('serializes a structured error object', () => {
    const obj = new CliError('PROVIDER', 'nope', { provider: 'openai' }).toErrorObject()
    expect(obj).toMatchObject({ code: 'PROVIDER', message: 'nope', provider: 'openai' })
  })
})

describe('io helpers', () => {
  it('infers mime types from extensions', () => {
    expect(inferMimeType('a.png')).toBe('image/png')
    expect(inferMimeType('a.mp3')).toBe('audio/mpeg')
    expect(inferMimeType('a.unknown')).toBe('application/octet-stream')
  })

  it('uses positional args as the prompt without touching stdin', async () => {
    // No stdin read happens because positional args are present.
    expect(await resolvePrompt(['hello', 'world'])).toBe('hello world')
  })

  it('rejects a stale find for aliases', () => {
    expect(findCommand('tts')?.name).toBe('speech')
    expect(findCommand('stt')?.name).toBe('transcribe')
  })
})

describe('tokenizeCommand (--mcp stdio spec)', () => {
  it('splits a simple command on whitespace', () => {
    expect(tokenizeCommand('npx -y @scope/server /tmp')).toEqual([
      'npx',
      '-y',
      '@scope/server',
      '/tmp',
    ])
  })

  it('keeps quoted paths with spaces intact', () => {
    expect(tokenizeCommand('node "C:\\Program Files\\srv.js" --flag')).toEqual([
      'node',
      'C:\\Program Files\\srv.js',
      '--flag',
    ])
    expect(tokenizeCommand("node '/opt/my srv/x.js'")).toEqual(['node', '/opt/my srv/x.js'])
  })

  it('collapses runs of whitespace', () => {
    expect(tokenizeCommand('  node   server.js  ')).toEqual(['node', 'server.js'])
  })
})
