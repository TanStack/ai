import { afterEach, describe, expect, it, vi } from 'vitest'
import { commandEnv, createOutputTail } from '../src/command'

describe('commandEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('gives a command only the listed variables of this process, plus env', () => {
    vi.stubEnv('SECRET_TOKEN', 'hunter2')
    vi.stubEnv('LANG', 'C.UTF-8')
    vi.stubEnv('SystemRoot', 'C:\\Windows')
    vi.stubEnv('HTTPS_PROXY', 'http://proxy:8080')

    const linux = commandEnv({ AGENT: '1' }, 'linux')
    expect(linux).toMatchObject({ LANG: 'C.UTF-8', AGENT: '1' })
    expect(linux).not.toHaveProperty('SECRET_TOKEN')
    // The Windows variables and setting are for Windows only.
    expect(linux).not.toHaveProperty('SystemRoot')
    expect(linux).not.toHaveProperty('NoDefaultCurrentDirectoryInExePath')
    expect(linux).not.toHaveProperty('HTTPS_PROXY')

    expect(commandEnv(undefined, 'linux', ['HTTPS_PROXY'])).toMatchObject({
      HTTPS_PROXY: 'http://proxy:8080',
    })

    const windows = commandEnv(
      { AGENT: '1', NoDefaultCurrentDirectoryInExePath: '' },
      'win32',
    )
    expect(windows).toMatchObject({
      SystemRoot: 'C:\\Windows',
      AGENT: '1',
      NoDefaultCurrentDirectoryInExePath: '1',
    })
    expect(windows).not.toHaveProperty('SECRET_TOKEN')
  })
})

describe('createOutputTail', () => {
  it('gives all output under the limit, with no note', () => {
    const output = createOutputTail(10)
    output.push('ab')
    output.push(new TextEncoder().encode('cd'))
    expect(output.text()).toBe('abcd')
  })

  it('keeps the newest bytes over the limit, and tells how many were dropped', () => {
    const output = createOutputTail(4)
    output.push('abc')
    output.push('def')
    expect(output.text()).toBe('[2 earlier bytes were dropped.]\ncdef')
  })

  it('keeps the end of one chunk that is bigger than the limit', () => {
    const output = createOutputTail(3)
    output.push('abcdef')
    expect(output.text()).toBe('[3 earlier bytes were dropped.]\ndef')
  })

  it('starts at a whole character when the cut is in one', () => {
    const output = createOutputTail(4)
    // `é` is 2 bytes. The cut drops its first byte, so it drops all of it.
    output.push('é')
    output.push('abc')
    expect(output.text()).toBe('[2 earlier bytes were dropped.]\nabc')
  })
})
