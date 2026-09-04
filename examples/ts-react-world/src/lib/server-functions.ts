import { createServerFn } from '@tanstack/react-start'
import { generateWorld } from '@tanstack/ai'
import { isReactorWorldModel, reactorWorld } from '@tanstack/ai-reactor'
import { RESOLUTIONS } from './models'
import type { ReactorWorldResolution } from '@tanstack/ai-reactor'

interface CreateWorldInput {
  prompt: string
  model: string
  resolution: string
}

function isResolution(value: string): value is ReactorWorldResolution {
  return (RESOLUTIONS as ReadonlyArray<string>).includes(value)
}

/**
 * Mints a session-scoped Reactor token. The API key never leaves the server.
 * The browser uses the returned token, model slug, and prompt to connect.
 */
export const createWorldFn = createServerFn({ method: 'POST' })
  .inputValidator((data: CreateWorldInput) => {
    if (!data.prompt.trim()) throw new Error('Prompt is required')
    if (!isReactorWorldModel(data.model)) {
      throw new Error(`Unknown world model: ${data.model}`)
    }
    if (!isResolution(data.resolution)) {
      throw new Error(`Unknown resolution: ${data.resolution}`)
    }
    return {
      prompt: data.prompt.trim(),
      model: data.model,
      resolution: data.resolution,
    }
  })
  .handler(async ({ data }) => {
    const world = await generateWorld({
      adapter: reactorWorld(data.model),
      prompt: data.prompt,
      modelOptions: { resolution: data.resolution },
    })

    return {
      token: world.token,
      model: world.model,
      prompt: world.prompt,
      expiresAt: world.expiresAt,
      resolution: data.resolution,
    }
  })
