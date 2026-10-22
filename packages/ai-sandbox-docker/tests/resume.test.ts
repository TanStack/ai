/**
 * `resume` of the Docker provider, with no Docker daemon. The daemon is faked
 * at `docker.getContainer`: the fake container answers `inspect` and `start`.
 */
import Dockerode from 'dockerode'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dockerSandbox } from '../src'

/** An error as dockerode gives it: an HTTP status from Docker, or a connect error. */
function dockerError(fields: { statusCode?: number; code?: string }) {
  return Object.assign(new Error('Docker failed.'), fields)
}

/** A provider whose containers answer with `container`. */
function providerWith(container: Partial<Dockerode.Container>) {
  vi.spyOn(Dockerode.prototype, 'getContainer').mockReturnValue(
    container as Dockerode.Container,
  )
  return dockerSandbox({ image: 'node:24' })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('dockerSandbox resume', () => {
  it('gives null for a container that Docker does not have', async () => {
    const provider = providerWith({
      inspect: () => Promise.reject(dockerError({ statusCode: 404 })),
    })

    await expect(provider.resume({ id: 'gone' })).resolves.toBeNull()
  })

  it('passes on the error when Docker does not answer', async () => {
    // The error of a stopped Docker Desktop on Windows.
    const notRunning = dockerError({ code: 'ENOENT' })
    const provider = providerWith({ inspect: () => Promise.reject(notRunning) })

    await expect(provider.resume({ id: 'c-1' })).rejects.toBe(notRunning)
  })

  it('passes on any other error of Docker', async () => {
    const failed = dockerError({ statusCode: 500 })
    const provider = providerWith({ inspect: () => Promise.reject(failed) })

    await expect(provider.resume({ id: 'c-1' })).rejects.toBe(failed)
  })
})
