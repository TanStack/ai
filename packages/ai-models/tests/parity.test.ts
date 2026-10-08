import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getModel } from '../src'

// Parity with pi's built-in catalog (what Flue users write today). The pi
// snapshot is never committed. Point PI_CATALOG_SNAPSHOT at the JSON file to
// run this test. It fails on a missing id, and prints the fields that differ.
const snapshotPath = process.env.PI_CATALOG_SNAPSHOT

interface PiModel {
  id: string
  api: string
  baseUrl: string
  reasoning: boolean
  input: Array<string>
  contextWindow: number
  maxTokens: number
  cost: { input: number; output: number }
}

// Providers with no TanStack path (see the handoff): not in the catalog.
const NOT_COVERED = new Set(['openai-codex', 'radius', 'github-copilot'])

describe.skipIf(!snapshotPath)('parity with pi', () => {
  it('resolves every model id of every covered provider', () => {
    const snapshot: {
      providers: Record<string, { models: Array<PiModel> }>
    } = JSON.parse(readFileSync(snapshotPath ?? '', 'utf8'))
    const missing: Array<string> = []
    const differs: Record<string, number> = {}
    let total = 0
    for (const [providerId, provider] of Object.entries(snapshot.providers)) {
      if (NOT_COVERED.has(providerId)) continue
      for (const piModel of provider.models) {
        total++
        const model = getModel(providerId, piModel.id)
        if (!model) {
          missing.push(`${providerId}/${piModel.id}`)
          continue
        }
        const checks: Record<string, boolean> = {
          api: model.api === piModel.api,
          baseUrl: model.baseUrl === piModel.baseUrl,
          reasoning: model.reasoning === piModel.reasoning,
          input: piModel.input.every((kind) =>
            model.input.includes(kind as never),
          ),
          contextWindow: model.contextWindow === piModel.contextWindow,
          maxTokens: model.maxTokens === piModel.maxTokens,
          cost:
            model.cost.input === piModel.cost.input &&
            model.cost.output === piModel.cost.output,
        }
        for (const [field, same] of Object.entries(checks))
          if (!same) differs[field] = (differs[field] ?? 0) + 1
      }
    }
    console.log(
      `pi parity: ${total - missing.length}/${total} resolve. Fields that differ (newer models.dev data is fine):`,
      differs,
    )
    expect(missing).toEqual([])
  })
})
