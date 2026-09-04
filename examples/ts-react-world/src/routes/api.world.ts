import { createFileRoute } from '@tanstack/react-router'
import { generateWorld } from '@tanstack/ai'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { isReactorWorldModel, reactorWorld } from '@tanstack/ai-reactor'
import { reactorByok } from '@tanstack/ai-reactor/byok'
import { RESOLUTIONS } from '@/lib/models'
import type { ReactorWorldResolution } from '@tanstack/ai-reactor'

function isResolution(value: string): value is ReactorWorldResolution {
  return (RESOLUTIONS as ReadonlyArray<string>).includes(value)
}

function readBody(value: unknown): {
  prompt: string
  model: string
  resolution: string
} | null {
  if (typeof value !== 'object' || value === null) return null
  if (!('prompt' in value) || !('model' in value) || !('resolution' in value)) {
    return null
  }
  if (typeof value.prompt !== 'string') return null
  if (typeof value.model !== 'string') return null
  if (typeof value.resolution !== 'string') return null
  return {
    prompt: value.prompt,
    model: value.model,
    resolution: value.resolution,
  }
}

export const Route = createFileRoute('/api/world')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = getByokKey(request, reactorByok)
        if (!apiKey) return byokMissing(reactorByok)

        const body = readBody(await request.json().catch(() => null))
        if (!body) {
          return Response.json({ error: 'Invalid body' }, { status: 400 })
        }
        const prompt = body.prompt.trim()
        if (prompt.length === 0) {
          return Response.json({ error: 'prompt is required' }, { status: 400 })
        }
        if (!isReactorWorldModel(body.model)) {
          return Response.json(
            { error: `Unknown world model: ${body.model}` },
            { status: 400 },
          )
        }
        if (!isResolution(body.resolution)) {
          return Response.json(
            { error: `Unknown resolution: ${body.resolution}` },
            { status: 400 },
          )
        }

        try {
          const world = await generateWorld({
            adapter: reactorWorld(body.model, { apiKey }),
            prompt,
            modelOptions: { resolution: body.resolution },
            debug: false,
          })
          return Response.json({
            token: world.token,
            model: world.model,
            prompt: world.prompt,
            expiresAt: world.expiresAt,
            resolution: body.resolution,
          })
        } catch (error) {
          return Response.json(
            {
              error:
                error instanceof Error ? error.message : 'World mint failed',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
