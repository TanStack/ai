import { describe, expect, it, vi } from 'vitest'
import Docker from 'dockerode'
import { DockerHandle } from '../src/handle'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

/** Rejects at once without an abortSignal. With one, waits until it aborts. */
function untilAbort(opts?: { abortSignal?: AbortSignal }) {
  const signal = opts?.abortSignal
  if (!signal) return Promise.reject(new Error('no signal'))
  return new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {
      once: true,
    })
  })
}

function createHandle() {
  const container = {
    id: 'container-123456789',
    commit: vi.fn(untilAbort),
    inspect: vi.fn(untilAbort),
  }
  const forkFactory = vi.fn(
    (_id: string, _signal?: AbortSignal): Promise<SandboxHandle> =>
      Promise.reject(new Error('not used')),
  )
  const handle = new DockerHandle({
    docker: new Docker(),
    container: container as unknown as Docker.Container,
    workdir: '/workspace',
    forkFactory,
    removeOnDestroy: false,
  })
  return { handle, container, forkFactory }
}

describe('DockerHandle signals', () => {
  it('snapshot passes the signal to container.commit', async () => {
    const { handle } = createHandle()
    const controller = new AbortController()
    const pending = handle.snapshot('s', { signal: controller.signal })
    controller.abort(new Error('stopped'))
    await expect(pending).rejects.toThrow('stopped')
  })

  it('ports.connect passes the signal to container.inspect', async () => {
    const { handle } = createHandle()
    const controller = new AbortController()
    const pending = handle.ports.connect(3000, { signal: controller.signal })
    controller.abort(new Error('stopped'))
    await expect(pending).rejects.toThrow('stopped')
  })

  it('fork passes the signal to the fork factory', async () => {
    const { handle, forkFactory } = createHandle()
    const signal = new AbortController().signal
    await handle.fork({ signal }).catch(() => {})
    await handle.fork().catch(() => {})
    expect(forkFactory.mock.calls).toEqual([
      ['container-123456789', signal],
      ['container-123456789', undefined],
    ])
  })

  it('snapshot without a signal sends commit no abortSignal', async () => {
    const { handle, container } = createHandle()
    await expect(handle.snapshot('s')).rejects.toThrow('no signal')
    expect(container.commit.mock.calls[0]?.[0]).not.toHaveProperty(
      'abortSignal',
    )
  })
})
