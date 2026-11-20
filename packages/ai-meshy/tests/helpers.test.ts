import { describe, expect, it, vi } from 'vitest'
import {
  analyzeMeshyPrintability,
  getMeshyBalance,
  listMeshyAnimations,
} from '../src/helpers'
import type {
  AnalyzeMeshyPrintabilityOptions,
  MeshyPrintabilityReport,
} from '../src/helpers'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

// A fake fetch that answers with the given bodies, in order.
function fakeFetch(...bodies: Array<unknown>) {
  const queue = [...bodies]
  return vi.fn<typeof fetch>(async () => {
    if (queue.length === 0) throw new Error('fakeFetch: no response left')
    return jsonResponse(queue.shift())
  })
}

type FakeFetch = ReturnType<typeof fakeFetch>

function requestUrl(fetch: FakeFetch, index: number) {
  return new URL(String(fetch.mock.calls[index]?.[0]))
}

function requestBody(fetch: FakeFetch, index: number) {
  return JSON.parse(String(fetch.mock.calls[index]?.[1]?.body))
}

const report: MeshyPrintabilityReport = {
  _version: 'v1',
  status: 'warning',
  issue_count: 1,
  error_count: 0,
  warning_count: 1,
  metrics: {
    is_watertight: true,
    volume: 1.3,
    non_manifold_edges: 0,
    degenerate_faces: 42,
    holes: 0,
  },
  evaluated_at: 1700000001000,
}

function analyze(
  fetch: FakeFetch,
  overrides?: Partial<AnalyzeMeshyPrintabilityOptions>,
) {
  return analyzeMeshyPrintability({
    apiKey: 'key',
    fetch,
    model: { type: 'url', value: 'https://cdn.test/chest.glb' },
    printerType: 'fdm',
    pollInterval: 0,
    ...overrides,
  })
}

describe('getMeshyBalance', () => {
  it('getMeshyBalance maps fields and epoch ms to Date', async () => {
    const fetch = fakeFetch({
      balance: 1200,
      monthly_credits: 1000,
      permanent_credits: 200,
      monthly_resets_at: 1767225600000,
    })

    const balance = await getMeshyBalance({ apiKey: 'key', fetch })

    expect(balance).toEqual({
      balance: 1200,
      monthlyCredits: 1000,
      permanentCredits: 200,
      monthlyResetsAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    expect(requestUrl(fetch, 0).pathname).toBe('/openapi/v1/balance')
  })

  it('getMeshyBalance leaves monthlyResetsAt out when Meshy sends null', async () => {
    const fetch = fakeFetch({
      balance: 50,
      monthly_credits: 0,
      permanent_credits: 50,
      monthly_resets_at: null,
    })

    const balance = await getMeshyBalance({ apiKey: 'key', fetch })

    expect(balance).toEqual({
      balance: 50,
      monthlyCredits: 0,
      permanentCredits: 50,
    })
  })
})

describe('listMeshyAnimations', () => {
  it('listMeshyAnimations sends filters and maps items', async () => {
    const fetch = fakeFetch([
      {
        action_id: 2,
        name: 'Run',
        key: 'run_01',
        category: 'WalkAndRun',
        sub_category: 'Running',
        preview_url: 'https://cdn.test/run.gif',
        rig_type: 'biped',
      },
    ])

    const animations = await listMeshyAnimations({
      apiKey: 'key',
      fetch,
      search: 'run',
      category: 'WalkAndRun',
      subCategory: 'Running',
      actionIds: [1, 2, 3],
    })

    expect(animations).toEqual([
      {
        actionId: 2,
        name: 'Run',
        key: 'run_01',
        category: 'WalkAndRun',
        subCategory: 'Running',
        previewUrl: 'https://cdn.test/run.gif',
        rigType: 'biped',
      },
    ])
    const url = requestUrl(fetch, 0)
    expect(url.pathname).toBe('/openapi/v1/animations/library')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: 'run',
      category: 'WalkAndRun',
      sub_category: 'Running',
      action_ids: '1,2,3',
    })
  })
})

describe('analyzeMeshyPrintability', () => {
  it('analyzeMeshyPrintability polls until SUCCEEDED and returns the report', async () => {
    const fetch = fakeFetch(
      { result: 'pa-1' },
      { id: 'pa-1', status: 'IN_PROGRESS', progress: 50 },
      { id: 'pa-1', status: 'SUCCEEDED', progress: 100, printability: report },
    )

    const result = await analyze(fetch, { intendedPrintHeightMm: 120 })

    expect(result).toEqual(report)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(requestBody(fetch, 0)).toEqual({
      model_url: 'https://cdn.test/chest.glb',
      printer_type: 'fdm',
      intended_print_height_mm: 120,
    })
    expect(requestUrl(fetch, 2).pathname).toBe('/openapi/v1/print/analyze/pa-1')
  })

  it('analyzeMeshyPrintability throws on FAILED', async () => {
    const fetch = fakeFetch(
      { result: 'pa-1' },
      {
        id: 'pa-1',
        status: 'FAILED',
        task_error: { message: 'Mesh is broken' },
      },
    )

    await expect(analyze(fetch)).rejects.toThrow(
      'Meshy printability analysis failed: Mesh is broken',
    )
  })

  it('analyzeMeshyPrintability stops on abort', async () => {
    const fetch = fakeFetch(
      { result: 'pa-1' },
      { id: 'pa-1', status: 'IN_PROGRESS' },
    )
    const controller = new AbortController()
    const reason = new Error('stopped')

    const outcome = analyze(fetch, {
      pollInterval: 60_000,
      abortSignal: controller.signal,
    }).catch((error: unknown) => error)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    controller.abort(reason)

    expect(await outcome).toBe(reason)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('analyzeMeshyPrintability sends a file source as input_task_id', async () => {
    const fetch = fakeFetch(
      { result: 'pa-1' },
      { id: 'pa-1', status: 'SUCCEEDED', printability: report },
    )

    await analyze(fetch, {
      model: { type: 'file', value: 'task-9', provider: 'meshy' },
      printerType: 'sla',
    })

    expect(requestBody(fetch, 0)).toEqual({
      input_task_id: 'task-9',
      printer_type: 'sla',
    })
  })

  it('analyzeMeshyPrintability sends a data source as an octet-stream data URI', async () => {
    const fetch = fakeFetch(
      { result: 'pa-1' },
      { id: 'pa-1', status: 'SUCCEEDED', printability: report },
    )

    await analyze(fetch, {
      model: { type: 'data', value: 'Z2xURg==', mimeType: 'model/gltf-binary' },
    })

    expect(requestBody(fetch, 0)).toEqual({
      model_url: 'data:application/octet-stream;base64,Z2xURg==',
      printer_type: 'fdm',
    })
  })

  it('analyzeMeshyPrintability throws before any request when both sizes are set', async () => {
    const fetch = fakeFetch()

    await expect(
      analyze(fetch, {
        intendedPrintHeightMm: 100,
        intendedPrintLongestSideMm: 100,
      }),
    ).rejects.toThrow('not both')
    expect(fetch).not.toHaveBeenCalled()
  })
})
