import { describe, expect, it, vi } from 'vitest'
import { DaytonaHandle } from '../src/handle'
import type { Sandbox } from '@daytona/sdk'

function fakeSandbox(preview: {
  url: string
  token?: string
  signedUrl?: string
  signedToken?: string
}): Sandbox {
  return {
    id: 'sbx-1',
    getPreviewLink: vi.fn(async () => ({
      url: preview.url,
      token: preview.token,
    })),
    getSignedPreviewUrl: vi.fn(async () => ({
      url: preview.signedUrl ?? preview.url,
      token: preview.signedToken ?? preview.token,
    })),
    delete: vi.fn(async () => {}),
  } as unknown as Sandbox
}

describe('DaytonaHandle.ports.connect', () => {
  it('returns a signed preview URL for private sandboxes', async () => {
    const sandbox = fakeSandbox({
      url: 'https://5173-sbx-1.proxy.daytona.work',
      token: 'standard-tok',
      signedUrl: 'https://5173-signed-tok.proxy.daytona.work',
      signedToken: 'signed-tok',
    })
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    const channel = await handle.ports.connect(5173)

    expect(sandbox.getPreviewLink).toHaveBeenCalledWith(5173)
    expect(sandbox.getSignedPreviewUrl).toHaveBeenCalledWith(5173, 3600)
    expect(channel).toEqual({
      url: 'https://5173-signed-tok.proxy.daytona.work',
      token: 'signed-tok',
    })
    expect(channel.headers).toBeUndefined()
  })

  it('returns the plain preview URL for public sandboxes', async () => {
    const sandbox = fakeSandbox({
      url: 'https://5173-sbx-1.proxy.daytona.work',
    })
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    const channel = await handle.ports.connect(5173)

    expect(sandbox.getSignedPreviewUrl).not.toHaveBeenCalled()
    expect(channel).toEqual({
      url: 'https://5173-sbx-1.proxy.daytona.work',
    })
  })
})
