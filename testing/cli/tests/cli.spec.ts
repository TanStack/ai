import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const BIN = fileURLToPath(
  new URL('../../../packages/ai-cli/dist/bin/bin.js', import.meta.url),
)

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

/**
 * Run the built `ts-ai` binary with stdin closed (the harness shape) and a
 * scrubbed env so no real provider key leaks in. Returns the captured streams
 * and exit code.
 */
function runCli(
  args: Array<string>,
  env: Record<string, string> = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH ?? '', ...env },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c) => (stdout += String(c)))
    child.stderr.on('data', (c) => (stderr += String(c)))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

describe('ts-ai meta commands', () => {
  it('reports its version', async () => {
    const { code, stdout } = await runCli(['--version'])
    expect(code).toBe(0)
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('introspect emits a parseable manifest with all commands', async () => {
    const { code, stdout } = await runCli(['introspect'])
    expect(code).toBe(0)
    const manifest = JSON.parse(stdout)
    expect(manifest.bin).toBe('ts-ai')
    expect(manifest.bundledProviders).toEqual(
      expect.arrayContaining([
        'openai',
        'anthropic',
        'gemini',
        'openrouter',
        'fal',
      ]),
    )
    const names = manifest.commands.map((c: { name: string }) => c.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'chat',
        'image',
        'video',
        'audio',
        'speech',
        'transcribe',
        'summarize',
      ]),
    )
  })
})

describe('ts-ai machine-mode error contract', () => {
  it('emits a structured USAGE error + exit 2 when --model is missing', async () => {
    const { code, stdout } = await runCli(['image', 'a cat', '--json'])
    expect(code).toBe(2)
    expect(JSON.parse(stdout)).toMatchObject({ error: { code: 'USAGE' } })
  })

  it('rejects an unknown provider with a USAGE error', async () => {
    const { code, stdout } = await runCli([
      'chat',
      'hi',
      '--model',
      'bogus/x',
      '--json',
    ])
    expect(code).toBe(2)
    expect(JSON.parse(stdout).error.code).toBe('USAGE')
  })

  it('reports a missing API key with the provider attached', async () => {
    const { code, stdout } = await runCli([
      'chat',
      'hi',
      '--model',
      'openai/gpt-5.5',
      '--json',
    ])
    expect(code).toBe(2)
    expect(JSON.parse(stdout).error).toMatchObject({
      code: 'USAGE',
      provider: 'openai',
    })
  })

  it('keeps stdout free of human chatter in --json mode', async () => {
    const { stdout } = await runCli(['image', 'a cat', '--json'])
    // Exactly one JSON line on stdout, nothing else.
    expect(stdout.trim().split('\n')).toHaveLength(1)
    expect(() => JSON.parse(stdout)).not.toThrow()
  })

  it('video status receives --model from the parent command (errors on key, not model)', async () => {
    const { code, stdout } = await runCli([
      'video',
      'status',
      'job_123',
      '--model',
      'openai/sora-2',
      '--json',
    ])
    expect(code).toBe(2)
    const err = JSON.parse(stdout).error
    expect(err.code).toBe('USAGE')
    // If --model weren't merged from the parent it would fail with "Missing
    // --model" instead — assert it got far enough to need a key.
    expect(err.message).toMatch(/api key/i)
  })

  it('parses kebab-case flags and coerces their values (--max-steps)', async () => {
    const { code, stdout } = await runCli([
      'chat',
      'hi',
      '--model',
      'openai/gpt-5.5',
      '--max-steps',
      'not-a-number',
      '--json',
    ])
    expect(code).toBe(2)
    const err = JSON.parse(stdout).error
    expect(err.code).toBe('USAGE')
    expect(err.message).toMatch(/number/i)
  })
})

describe('ts-ai argv-injection guard', () => {
  it('treats a flag passed as the prompt as text, not an option', async () => {
    // Control: a real --version flag prints the version.
    const version = await runCli(['chat', '--version'])
    expect(version.code).toBe(0)
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)

    // After `--`, the same token is the prompt — never re-parsed as a flag, so
    // it falls through to the missing-model error rather than printing version.
    const injected = await runCli(['chat', '--json', '--', '--version'])
    expect(injected.code).toBe(2)
    const err = JSON.parse(injected.stdout).error
    expect(err.code).toBe('USAGE')
    expect(err.message).toMatch(/model/i)
  })

  it('does not let a prompt smuggle --api-key', async () => {
    const { code, stdout } = await runCli([
      'chat',
      '--json',
      '--',
      '--api-key',
      'LEAKED',
    ])
    expect(code).toBe(2)
    expect(JSON.parse(stdout).error.code).toBe('USAGE')
  })
})

describe('ts-ai introspect flag spelling', () => {
  it('emits kebab-cased CLI flag strings for multi-word options', async () => {
    const { stdout } = await runCli(['introspect'])
    const manifest = JSON.parse(stdout)
    const apiKey = manifest.commonFlags.find(
      (f: { name: string }) => f.name === 'apiKey',
    )
    expect(apiKey.flag).toBe('--api-key')
    const chat = manifest.commands.find(
      (c: { name: string }) => c.name === 'chat',
    )
    const maxSteps = chat.flags.find(
      (f: { name: string }) => f.name === 'maxSteps',
    )
    expect(maxSteps.flag).toBe('--max-steps')
    const video = manifest.commands.find(
      (c: { name: string }) => c.name === 'video',
    )
    const wait = video.flags.find((f: { name: string }) => f.name === 'wait')
    // default-true booleans render as negatable --no-x flags.
    expect(wait.flag).toBe('--no-wait')
    // generation commands expose --output-dir.
    const image = manifest.commands.find(
      (c: { name: string }) => c.name === 'image',
    )
    const outputDir = image.flags.find(
      (f: { name: string }) => f.name === 'outputDir',
    )
    expect(outputDir.flag).toBe('--output-dir')
  })
})

describe('ts-ai no command (non-TTY)', () => {
  it('prints help instead of launching the interactive menu', async () => {
    // stdout is a pipe here (not a TTY), so the home menu must not start.
    const { code, stdout } = await runCli([])
    expect(code).toBe(0)
    expect(stdout).toContain('ts-ai')
    expect(stdout).toContain('chat')
    expect(stdout).toContain('image')
  })
})
