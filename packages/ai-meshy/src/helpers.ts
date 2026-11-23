import { meshyMeshSourceFields } from './adapters/model3d'
import { createMeshyClient, mapMeshyStatus } from './client'
import type { ContentPartSource } from '@tanstack/ai'
import type { MeshyClientConfig, MeshyTask } from './client'

/**
 * Options for `getMeshyBalance()`.
 *
 * @experimental Meshy support is experimental and may change.
 */
export interface GetMeshyBalanceOptions extends MeshyClientConfig {
  abortSignal?: AbortSignal
}

// The raw `GET /v1/balance` body.
interface MeshyBalanceResponse {
  balance: number
  monthly_credits: number
  permanent_credits: number
  /** Epoch ms. `null` when no monthly refresh is scheduled. */
  monthly_resets_at: number | null
}

/**
 * Gets the credit balance of the Meshy account that owns the API key.
 *
 * `monthlyCredits` expire at `monthlyResetsAt`. `permanentCredits` never
 * expire. `monthlyResetsAt` is not set when Meshy has no monthly refresh for
 * the account.
 *
 * @param options - The client settings (API key, base URL, headers, `fetch`)
 * and an optional `abortSignal`.
 * @throws {MeshyApiError} When Meshy answers with a status that is not 2xx.
 *
 * @example
 * const { balance, monthlyResetsAt } = await getMeshyBalance()
 *
 * @experimental Meshy support is experimental and may change.
 */
export async function getMeshyBalance(options?: GetMeshyBalanceOptions) {
  const client = createMeshyClient(options)
  const body = await client.get<MeshyBalanceResponse>('/v1/balance', {
    signal: options?.abortSignal,
  })
  return {
    balance: body.balance,
    monthlyCredits: body.monthly_credits,
    permanentCredits: body.permanent_credits,
    ...(body.monthly_resets_at === null
      ? {}
      : { monthlyResetsAt: new Date(body.monthly_resets_at) }),
  }
}

/**
 * The kind of rig an animation plays on. A rig takes only animations of its
 * own kind.
 *
 * @experimental Meshy support is experimental and may change.
 */
export type MeshyRigType = 'biped' | 'quadruped'

/**
 * One preset action in the Meshy animation library. Pass `actionId` as
 * `modelOptions.action_id` to `meshy3dModel('animation')`.
 *
 * @experimental Meshy support is experimental and may change.
 */
export interface MeshyAnimation {
  /** Unique and stable, but not contiguous. */
  actionId: number
  /** A label for people. Not unique. */
  name: string
  /** A unique, stable slug. */
  key: string
  category: string
  subCategory: string
  /** An animated GIF of the action. */
  previewUrl: string
  rigType: MeshyRigType
}

/**
 * Filters for `listMeshyAnimations()`. Each filter you set must match.
 *
 * @experimental Meshy support is experimental and may change.
 */
export interface ListMeshyAnimationsOptions extends MeshyClientConfig {
  /** A case-insensitive substring of `name` or `key`. */
  search?: string
  /** An exact category, for example `'WalkAndRun'` or `'Dancing'`. */
  category?: string
  /** An exact sub-category. Names can repeat across categories. */
  subCategory?: string
  /** Return only these actions. At most 200. */
  actionIds?: Array<number>
  abortSignal?: AbortSignal
}

// One raw item of the `GET /v1/animations/library` body.
interface MeshyAnimationLibraryItem {
  action_id: number
  name: string
  key: string
  category: string
  sub_category: string
  preview_url: string
  rig_type: MeshyRigType
}

/**
 * Lists the preset actions in the Meshy animation library. Meshy sends the
 * full library in one response, with no pages. This call costs no credits.
 *
 * @param options - Optional filters (`search`, `category`, `subCategory`,
 * `actionIds`), the client settings, and an optional `abortSignal`.
 * @throws {MeshyApiError} When Meshy answers with a status that is not 2xx.
 *
 * @example
 * const runs = await listMeshyAnimations({ category: 'WalkAndRun' })
 *
 * @experimental Meshy support is experimental and may change.
 */
export async function listMeshyAnimations(
  options?: ListMeshyAnimationsOptions,
) {
  const client = createMeshyClient(options)
  const items = await client.get<Array<MeshyAnimationLibraryItem>>(
    '/v1/animations/library',
    {
      query: {
        search: options?.search,
        category: options?.category,
        sub_category: options?.subCategory,
        // Meshy wants one comma-separated value, not repeated keys.
        action_ids: options?.actionIds?.join(','),
      },
      signal: options?.abortSignal,
    },
  )
  return items.map((item) => ({
    actionId: item.action_id,
    name: item.name,
    key: item.key,
    category: item.category,
    subCategory: item.sub_category,
    previewUrl: item.preview_url,
    rigType: item.rig_type,
  }))
}

/**
 * The printer that sets the minimum wall thickness for the wall check.
 *
 * @experimental Meshy support is experimental and may change.
 */
export type MeshyPrinterType = 'fdm' | 'sla' | 'full_color'

/**
 * A verdict from the Meshy printability analysis. From worst to best:
 * `error`, `warning`, `unknown`, `healthy`.
 *
 * @experimental Meshy support is experimental and may change.
 */
export type MeshyPrintabilityStatus =
  | 'healthy'
  | 'warning'
  | 'error'
  | 'unknown'

/**
 * The printability report from Meshy. The field names are the raw Meshy
 * names. `intended_print` and `thin_walls` are set only when you send a
 * printer type or a print size.
 *
 * @experimental Meshy support is experimental and may change.
 */
export interface MeshyPrintabilityReport {
  /** The schema version of the report, for example `'v1'`. */
  _version: string
  /** The overall verdict. With a print size, it includes `thin_walls.status`. */
  status: MeshyPrintabilityStatus
  /** `error_count + warning_count`. */
  issue_count: number
  error_count: number
  warning_count: number
  metrics: {
    is_watertight: boolean
    volume: number
    non_manifold_edges: number
    degenerate_faces: number
    holes: number
  } | null
  /** The print size that the size check used, in millimeters. */
  intended_print?: {
    printer_type: MeshyPrinterType
    height_mm: number | null
    longest_side_mm: number | null
    /** The minimum wall thickness for `printer_type`. */
    wall_thickness_mm: number
    /** `[width, depth, height]`. GLB input only. */
    dimensions_mm: [number, number, number] | null
  }
  /** The wall thickness result at the size in `intended_print`. */
  thin_walls?: {
    /** The part of the surface (0 to 1) that is too thin. */
    thin_area_ratio: number | null
    has_thin_walls: boolean | null
    /** `error` when more than 5% of the surface is too thin. */
    status: 'healthy' | 'error' | 'unknown'
  }
  /** Epoch ms. */
  evaluated_at: number | null
}

/**
 * Options for `analyzeMeshyPrintability()`.
 *
 * @experimental Meshy support is experimental and may change.
 */
export interface AnalyzeMeshyPrintabilityOptions extends MeshyClientConfig {
  /**
   * The model to analyze. A `url` source can be GLB, glTF, OBJ, FBX, or STL.
   * A `data` source can be only GLB or glTF. A `file` source is a Meshy task
   * id, for example a `jobId` from `meshy3dModel()`.
   */
  model: ContentPartSource
  /**
   * The printer for the wall check. With a printer type or a print size,
   * Meshy also checks the wall thickness, which takes about 10 seconds.
   * With a print size only, Meshy uses `fdm`.
   */
  printerType?: MeshyPrinterType
  /** The print height in mm, 1 to 1000. Do not set it with `intendedPrintLongestSideMm`. */
  intendedPrintHeightMm?: number
  /** The longest side of the print in mm, 1 to 1000. Do not set it with `intendedPrintHeightMm`. */
  intendedPrintLongestSideMm?: number
  /** The time between status checks, in ms. Defaults to 2000. */
  pollInterval?: number
  /** Stops the polling. Use `AbortSignal.timeout(ms)` to set a time limit. */
  abortSignal?: AbortSignal
}

// The `GET /v1/print/analyze/<id>` body.
interface MeshyPrintAnalyzeTask extends MeshyTask {
  printability?: MeshyPrintabilityReport | null
}

// Waits `ms`, or rejects with the abort reason when `signal` aborts first.
// ponytail: core has the same `sleep` in utilities/activity-abort.ts, but
// it is not exported.
function sleep(ms: number, signal: AbortSignal | undefined) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted()
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// Runs one Meshy request. An abort throws `signal.reason`, the same error
// that the poll wait throws, so the caller sees one abort error in every
// phase. Other request errors stay as they are.
async function abortable<T>(
  signal: AbortSignal | undefined,
  request: () => Promise<T>,
) {
  signal?.throwIfAborted()
  try {
    return await request()
  } catch (error) {
    if (signal?.aborted) throw signal.reason
    throw error
  }
}

/**
 * Checks if a model can be 3D printed. It starts a Meshy printability task,
 * waits until the task is done, and returns the report. The analysis costs
 * no credits.
 *
 * With no `printerType` and no print size, Meshy checks only the mesh, which
 * takes about 1 second. Send `printerType`, a print size
 * (`intendedPrintHeightMm` or `intendedPrintLongestSideMm`), or both to also
 * check the wall thickness. Without a size, Meshy uses its default size.
 *
 * This function has no time limit. It polls until the task succeeds or fails.
 * To set a limit, pass `abortSignal: AbortSignal.timeout(ms)`.
 *
 * @param options - The `model`, an optional `printerType` and print size,
 * `pollInterval`, `abortSignal`, and the client settings.
 * @throws {Error} When both print sizes are set, before any request.
 * @throws {Error} When the task fails or is canceled.
 * @throws {MeshyApiError} When Meshy answers with a status that is not 2xx.
 * @throws The `abortSignal` reason when the signal aborts.
 *
 * @example
 * const report = await analyzeMeshyPrintability({
 *   model: { type: 'file', value: job.jobId, provider: 'meshy' },
 *   printerType: 'fdm',
 *   intendedPrintHeightMm: 120,
 *   abortSignal: AbortSignal.timeout(120_000),
 * })
 * if (report.status === 'error') console.log(report.metrics)
 *
 * @experimental Meshy support is experimental and may change.
 */
export async function analyzeMeshyPrintability(
  options: AnalyzeMeshyPrintabilityOptions,
) {
  const hasBothSizes =
    options.intendedPrintHeightMm !== undefined &&
    options.intendedPrintLongestSideMm !== undefined
  if (hasBothSizes) {
    throw new Error(
      'analyzeMeshyPrintability: set intendedPrintHeightMm or intendedPrintLongestSideMm, not both.',
    )
  }

  const signal = options.abortSignal
  const pollInterval = options.pollInterval ?? 2000
  const client = createMeshyClient(options)
  const created = await abortable(signal, () =>
    client.post<{ result: string }>(
      '/v1/print/analyze',
      {
        ...meshyMeshSourceFields(options.model, 'input_task_id', 'gltf'),
        // JSON drops the fields that are undefined.
        printer_type: options.printerType,
        intended_print_height_mm: options.intendedPrintHeightMm,
        intended_print_longest_side_mm: options.intendedPrintLongestSideMm,
      },
      signal,
    ),
  )

  for (;;) {
    const task = await abortable(signal, () =>
      client.get<MeshyPrintAnalyzeTask>(`/v1/print/analyze/${created.result}`, {
        signal,
      }),
    )
    const { status, error } = mapMeshyStatus(task)
    if (status === 'failed') {
      throw new Error(`Meshy printability analysis failed: ${error}`)
    }
    if (status === 'completed') {
      if (!task.printability) {
        throw new Error(
          `Meshy printability task ${task.id} succeeded with no report.`,
        )
      }
      return task.printability
    }
    await sleep(pollInterval, signal)
  }
}
