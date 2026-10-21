import { describe, expect, it, vi } from 'vitest'
import { createSandboxComputerDriver, sandboxComputer } from '../src/index'
import type {
  ExecResult,
  SandboxHandle,
  SandboxProvider,
} from '@tanstack/ai-sandbox'

const PNG = new Uint8Array([137, 80, 78, 71])
const PNG_BASE64 = 'iVBORw=='
const XDPYINFO =
  'name of display:    :0\n  dimensions:    1024x768 pixels (271x203 millimeters)\n'

interface FakeOptions {
  /** Whether an X display already runs. */
  running?: boolean
  /** Tools that `command -v` does not find. */
  missing?: Array<string>
  /** The size xdpyinfo reports. */
  size?: string
}

/** A fake sandbox. Each command adds one line to `calls`, prefixed with `exec` or `spawn`. */
function fakeSandbox({ running = true, missing = [], size }: FakeOptions = {}) {
  const calls: Array<string> = []
  let started = running
  const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', exitCode: 0 })
  const exec = vi.fn(async (command: string): Promise<ExecResult> => {
    calls.push(`exec ${command}`)
    if (command.startsWith('for t in')) return ok(missing.join('\n'))
    if (command.endsWith('xdpyinfo >/dev/null 2>&1')) {
      return started ? ok() : { stdout: '', stderr: '', exitCode: 1 }
    }
    if (command.endsWith('xdpyinfo')) {
      return ok(size ? XDPYINFO.replace('1024x768', size) : XDPYINFO)
    }
    if (command.includes('base64 -w0')) return ok(`${PNG_BASE64}\n`)
    if (command.endsWith('getmouselocation')) {
      return ok('x:12 y:34 screen:0 window:1\n')
    }
    return ok()
  })
  const spawn = vi.fn(async (command: string) => {
    calls.push(`spawn ${command}`)
    if (command.startsWith('Xvfb')) started = true
    return {} as never
  })
  const destroy = vi.fn(async () => {
    calls.push('destroy')
  })
  const sandbox = {
    process: { exec, spawn },
    destroy,
  } as unknown as SandboxHandle
  return { sandbox, calls, exec, destroy }
}

/** A driver on a sandbox whose display already runs. `calls` holds only the actions. */
async function setup() {
  const fake = fakeSandbox()
  const driver = await createSandboxComputerDriver({ sandbox: fake.sandbox })
  fake.calls.length = 0
  return { driver, calls: fake.calls }
}

function fakeProvider(fakes: Array<ReturnType<typeof fakeSandbox>>) {
  let next = 0
  const provider = {
    name: 'fake',
    create: vi.fn(async () => {
      const fake = fakes[next++]
      if (!fake) throw new Error('no more sandboxes')
      return fake.sandbox
    }),
  } as unknown as SandboxProvider
  return provider
}

describe('createSandboxComputerDriver', () => {
  it('uses a display that already runs and reports linux', async () => {
    const { sandbox, calls } = fakeSandbox()
    const driver = await createSandboxComputerDriver({ sandbox })
    expect(driver.display).toEqual({ width: 1024, height: 768 })
    expect(driver.environment).toBe('linux')
    expect('zoom' in driver).toBe(false)
    expect(calls.some((call) => call.startsWith('spawn'))).toBe(false)
  })

  it('starts Xvfb and the session when no display runs', async () => {
    const { sandbox, calls } = fakeSandbox({ running: false })
    await createSandboxComputerDriver({
      sandbox,
      display: { width: 800, height: 600 },
    })
    const spawns = calls.filter((call) => call.startsWith('spawn'))
    expect(spawns).toEqual([
      'spawn Xvfb :0 -ac -screen 0 800x600x24 -nolisten tcp >/dev/null 2>&1',
      'spawn command -v startxfce4 >/dev/null && DISPLAY=:0 startxfce4 >/dev/null 2>&1',
    ])
  })

  it('names the missing desktop tools', async () => {
    const { sandbox } = fakeSandbox({ missing: ['xdotool', 'scrot'] })
    await expect(createSandboxComputerDriver({ sandbox })).rejects.toThrow(
      'The sandbox has no desktop tools: xdotool, scrot.',
    )
  })

  it('takes screenshots with ImageMagick import when the image has no scrot', async () => {
    const fake = fakeSandbox({ missing: ['@import'] })
    const driver = await createSandboxComputerDriver({ sandbox: fake.sandbox })
    fake.calls.length = 0
    expect(await driver.screenshot()).toEqual(PNG)
    expect(fake.calls[0]).toMatch(
      /^exec DISPLAY=:0 import -window root \/tmp\/tanstack-screenshot-\S+\.png && base64 -w0 /,
    )
  })

  it('throws with the exit code and stderr when a command fails', async () => {
    const { sandbox, exec } = fakeSandbox()
    const driver = await createSandboxComputerDriver({ sandbox })
    exec.mockResolvedValueOnce({ stdout: '', stderr: 'no X', exitCode: 1 })
    await expect(driver.move(1, 2)).rejects.toThrow(
      'Sandbox command failed with exit code 1: DISPLAY=:0 xdotool mousemove 1 2\nno X',
    )
  })

  it('decodes the screenshot and deletes the file in one command', async () => {
    const { driver, calls } = await setup()
    expect(await driver.screenshot()).toEqual(PNG)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatch(
      /^exec DISPLAY=:0 scrot --pointer (\/tmp\/tanstack-screenshot-\S+\.png) && base64 -w0 \1; code=\$\?; rm -f \1; exit \$code$/,
    )
  })

  it('reads the cursor position', async () => {
    const { driver } = await setup()
    expect(await driver.cursorPosition?.()).toEqual({ x: 12, y: 34 })
  })

  it.each([
    ['left', 1, 1],
    ['left', 2, 1],
    ['right', 1, 3],
    ['middle', 1, 2],
    ['back', 1, 8],
    ['forward', 1, 9],
  ] as const)('clicks %s x%i in one command', async (button, count, number) => {
    const { driver, calls } = await setup()
    await driver.click(0, 5, { button, count })
    expect(calls).toEqual([
      `exec DISPLAY=:0 xdotool mousemove 0 5 click --repeat ${count} ${number}`,
    ])
  })

  it('rounds a coordinate to the nearest pixel', async () => {
    const { driver, calls } = await setup()
    await driver.move(1.5, 2.2)
    expect(calls).toEqual(['exec DISPLAY=:0 xdotool mousemove 2 2'])
  })

  it('presses and releases buttons', async () => {
    const { driver, calls } = await setup()
    await driver.mouseDown('left')
    await driver.mouseUp('forward')
    expect(calls).toEqual([
      'exec DISPLAY=:0 xdotool mousedown 1',
      'exec DISPLAY=:0 xdotool mouseup 9',
    ])
  })

  it('scrolls down and right in 100 px clicks', async () => {
    const { driver, calls } = await setup()
    await driver.scroll(5, 6, 200, 300)
    expect(calls).toEqual([
      'exec DISPLAY=:0 xdotool mousemove 5 6 click --repeat 3 5 click --repeat 2 7',
    ])
  })

  it('scrolls up and left, at least one click', async () => {
    const { driver, calls } = await setup()
    await driver.scroll(5, 6, -10, -40)
    expect(calls).toEqual([
      'exec DISPLAY=:0 xdotool mousemove 5 6 click --repeat 1 4 click --repeat 1 6',
    ])
  })

  it('maps key names to xdotool names', async () => {
    const { driver, calls } = await setup()
    await driver.press(['Control', 'Shift', 'ArrowLeft'])
    await driver.press([' '])
    await driver.keyDown('Meta')
    await driver.keyUp('Enter')
    expect(calls).toEqual([
      "exec DISPLAY=:0 xdotool key -- 'ctrl+shift+Left'",
      "exec DISPLAY=:0 xdotool key -- 'space'",
      "exec DISPLAY=:0 xdotool keydown -- 'super'",
      "exec DISPLAY=:0 xdotool keyup -- 'Return'",
    ])
  })

  it('quotes a key name with shell characters', async () => {
    const { driver, calls } = await setup()
    await driver.keyDown("a'; rm -rf / #")
    expect(calls).toEqual([
      `exec DISPLAY=:0 xdotool keydown -- 'a'"'"'; rm -rf / #'`,
    ])
  })

  it('types quoted text in chunks of 25 characters in one command', async () => {
    const { driver, calls } = await setup()
    await driver.type(`${'a'.repeat(25)}it's`)
    expect(calls).toEqual([
      `exec DISPLAY=:0 xdotool type --delay 75 -- '${'a'.repeat(25)}' && DISPLAY=:0 xdotool type --delay 75 -- 'it'"'"'s'`,
    ])
  })

  it('sends nothing for empty text', async () => {
    const { driver, calls } = await setup()
    await driver.type('')
    expect(calls).toEqual([])
  })
})

describe('sandboxComputer', () => {
  it('reports a linux desktop with cursor position only', () => {
    const factory = sandboxComputer({ provider: fakeProvider([]) })
    expect(factory.display).toEqual({ width: 1024, height: 768 })
    expect(factory.environment).toBe('linux')
    expect(factory.capabilities).toEqual({
      zoom: false,
      cursorPosition: true,
      navigate: false,
    })
    expect(factory.close).toBeUndefined()
  })

  it('creates one sandbox for each thread', async () => {
    const fakes = [fakeSandbox(), fakeSandbox()]
    const factory = sandboxComputer({ provider: fakeProvider(fakes) })
    const a = await factory.create({ threadId: 'a' })
    const b = await factory.create({ threadId: 'b' })
    for (const fake of fakes) fake.calls.length = 0
    await a.move(1, 2)
    await b.move(3, 4)
    expect(fakes.map(({ calls }) => calls)).toEqual([
      ['exec DISPLAY=:0 xdotool mousemove 1 2'],
      ['exec DISPLAY=:0 xdotool mousemove 3 4'],
    ])
  })

  it('destroys only the sandbox of the closed driver', async () => {
    const fakes = [fakeSandbox(), fakeSandbox()]
    const factory = sandboxComputer({ provider: fakeProvider(fakes) })
    const a = await factory.create({ threadId: 'a' })
    await factory.create({ threadId: 'b' })
    await a.close?.()
    expect(fakes[0]?.destroy).toHaveBeenCalledOnce()
    expect(fakes[1]?.destroy).not.toHaveBeenCalled()
  })

  it('destroys the sandbox when the running display has another size', async () => {
    const fake = fakeSandbox({ size: '1280x800' })
    const factory = sandboxComputer({ provider: fakeProvider([fake]) })
    await expect(factory.create({ threadId: 'a' })).rejects.toThrow(
      'The sandbox display is 1280x800, not 1024x768.',
    )
    expect(fake.destroy).toHaveBeenCalledOnce()
  })

  it('keeps the setup error when the destroy throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = fakeSandbox({ missing: ['scrot'] })
    fake.destroy.mockRejectedValueOnce(new Error('destroy failed'))
    const factory = sandboxComputer({ provider: fakeProvider([fake]) })
    await expect(factory.create({ threadId: 'a' })).rejects.toThrow(
      'The sandbox has no desktop tools: scrot.',
    )
    expect(error).toHaveBeenCalledWith(
      'Failed to destroy the sandbox after setup failed.',
      expect.any(Error),
    )
    error.mockRestore()
  })
})
