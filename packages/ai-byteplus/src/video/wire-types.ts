/**
 * Wire types for the BytePlus Ark Seedance video task API
 * (`/contents/generations/tasks`).
 *
 * Hand-written minimal shapes covering only the fields this adapter sends and
 * reads, with provenance noted inline. Three sources:
 *
 * 1. The harvested OpenAPI 3.1 documents for the `ark` service, actions
 *    `CreateContentsGenerationsTasks` (`x-updated-time: 2026-05-07`),
 *    `GetContentsGenerationsTask` (`2026-04-14`),
 *    `ListContentsGenerationsTasks` (`2026-03-24`) and
 *    `DeleteContentsGenerationsTasks` — authoritative for field names,
 *    defaults and response shapes.
 * 2. Live calls against `https://ark.ap-southeast.bytepluses.com/api/v3` on
 *    2026-07-31 with a real `ARK_API_KEY`, which pinned the create response,
 *    the per-model parameter applicability (see
 *    `video-provider-options.ts`) and the `content[]` role vocabulary.
 * 3. The Seedance prose docs, for the retention windows.
 *
 * Two casing traps worth knowing: the response frame-rate field is
 * `framespersecond` (all lowercase, no underscores), and `resolution` is
 * matched case-insensitively on the way in (`4K`, `4k` and even `1080P` are
 * all accepted — live-verified), so this package standardizes on lowercase.
 */

/**
 * Task lifecycle states.
 *
 * `queued` and `running` are non-terminal; the rest are terminal. `cancelled`
 * records are dropped 24 hours after cancellation, and only a `queued` task
 * can be cancelled at all.
 *
 * Source: `GetContentsGenerationsTask` / `ListContentsGenerationsTasks`
 * `status` descriptions. (The Get document omits `expired` from its list
 * while the List document includes it; `execution_expires_after` is documented
 * as producing `expired` on both, so it is included here.)
 */
export type BytePlusVideoTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired'

/**
 * Role of a media item inside `content[]`.
 *
 * Live-verified: an unknown role is rejected with "invalid role specified for
 * image content", and the API sorts requests into task types from the roles
 * present — `i2v` (first frame), `flf2v` (first + last frame) and `r2v`
 * (reference media). The two families are mutually exclusive: mixing them
 * fails with "first/last frame content cannot be mixed with reference media
 * content".
 */
export type BytePlusVideoContentRole =
  | 'first_frame'
  | 'last_frame'
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio'

/** Instruction text for the generation. */
export interface BytePlusVideoTextContent {
  type: 'text'
  text: string
}

/**
 * An image input. A public URL is fetched by BytePlus server-side; a
 * `data:` URI carries the bytes inline.
 */
export interface BytePlusVideoImageContent {
  type: 'image_url'
  image_url: { url: string }
  /** Omitted for a bare first frame — the API defaults to `first_frame`. */
  role?: BytePlusVideoContentRole
}

/** A video input. Reference-media mode requires `role: 'reference_video'`. */
export interface BytePlusVideoVideoContent {
  type: 'video_url'
  video_url: { url: string }
  role?: BytePlusVideoContentRole
}

/**
 * An audio input.
 *
 * On Seedance 2.0, audio can only accompany another reference input —
 * "reference_audio cannot be the only reference input". Seedance 2.5
 * documents audio-only reference-to-video.
 */
export interface BytePlusVideoAudioContent {
  type: 'audio_url'
  audio_url: { url: string }
  role?: BytePlusVideoContentRole
}

/**
 * One entry of the `content[]` array.
 *
 * The create schema declares `maxItems: 5`, but the live API does not enforce
 * it — Seedance 2.5 accepts up to 30 reference images plus videos and audio,
 * and 7 entries were accepted on `dreamina-seedance-2-0-260128`. The adapter
 * therefore does not cap the array locally; a genuinely over-long request
 * gets whatever Ark decides to say.
 */
export type BytePlusVideoContentPart =
  | BytePlusVideoTextContent
  | BytePlusVideoImageContent
  | BytePlusVideoVideoContent
  | BytePlusVideoAudioContent

/**
 * Request body for `POST /contents/generations/tasks`.
 *
 * Only `model` and `content` are required. Every other field is
 * model-dependent — Ark rejects an inapplicable field outright ("the
 * specified parameter `draft` is not supported for model … must be empty")
 * rather than ignoring it, so the adapter only sends what the caller asked
 * for. See `video-provider-options.ts` for the applicability matrix.
 */
export interface BytePlusVideoCreateRequest {
  /** Seedance model id (or a preconfigured endpoint id). */
  model: string

  /** Prompt text plus any image / video / audio inputs. */
  content: Array<BytePlusVideoContentPart>

  /** Output aspect ratio, e.g. `16:9`. `adaptive` follows the input frame. */
  ratio?: string

  /** Resolution tier, e.g. `720p`. Matched case-insensitively by the API. */
  resolution?: string

  /**
   * Whole seconds of output. `-1` lets the model choose (Seedance 2.5 / 2.0 /
   * 1.5-pro).
   */
  duration?: number

  /** Frame count, an alternative to `duration` that allows fractional seconds. */
  frames?: number

  /** Randomness seed; integers in `[-1, 2^32-1]`, where `-1` means unseeded. */
  seed?: number

  /** Appends a "fix the camera" instruction to the prompt. Default `false`. */
  camera_fixed?: boolean

  /** Burn a watermark into the output. Default `false`. */
  watermark?: boolean

  /** Generate a synchronized audio track. Default `false`. */
  generate_audio?: boolean

  /** `default` (online) or `flex` (offline batch, half price). */
  service_tier?: string

  /** Also return the final frame as a PNG. Default `false`. */
  return_last_frame?: boolean

  /** Cheap low-fidelity preview render. Default `false`. */
  draft?: boolean

  /** Queue priority `[0, 9]`. */
  priority?: number

  /** Container of the generated video, e.g. `mp4` or `mov`. */
  output_format?: string

  /** Seconds from `created_at` after which the task is marked `expired`. */
  execution_expires_after?: number

  /** URL that receives a POST with the task payload on each status change. */
  callback_url?: string

  /** Opaque per-end-user identifier for abuse attribution, max 64 chars. */
  safety_identifier?: string
}

/**
 * Response of `POST /contents/generations/tasks`.
 *
 * Live-verified: the body is just the task id (e.g.
 * `cgt-batch-20260731174311-zmz5s`; the `-batch` infix appears when the task
 * is routed to the `flex` offline queue).
 */
export interface BytePlusVideoCreateResponse {
  id?: string
}

/**
 * Error detail attached to a terminal task.
 *
 * Codes are the dotted/PascalCase Ark strings — the create, get and list
 * documents enumerate `InputTextSensitiveContentDetected`,
 * `InputImageSensitiveContentDetected`, `OutputVideoSensitiveContentDetected`
 * and `QuotaExceeded` under `x-error-code`. The set is open-ended, so this
 * stays a plain `string`.
 */
export interface BytePlusVideoTaskError {
  code?: string
  message?: string
}

/**
 * Token usage for a finished task. Video generation bills output only, so
 * `total_tokens` equals `completion_tokens` and there is no prompt count.
 *
 * The schema types both counts as `string` while the documented example
 * response shows bare numbers, so both are accepted and coerced.
 */
export interface BytePlusVideoTaskUsage {
  completion_tokens?: number | string
  total_tokens?: number | string
  /** Only present when a provider tool (web search) ran. */
  tool_usage?: { web_search?: number }
}

/** Output URLs of a succeeded task. Both links expire 24 hours after success. */
export interface BytePlusVideoTaskContent {
  /** MP4 download URL. */
  video_url?: string
  /** Final frame as PNG; only when `return_last_frame` was set. */
  last_frame_url?: string
}

/**
 * Response of `GET /contents/generations/tasks/{id}`.
 *
 * `content` appears once the task succeeds; `error` appears when it fails.
 * Note `duration` comes back as a string here while the list endpoint types
 * it as an integer, so both are accepted.
 */
export interface BytePlusVideoTask {
  id?: string
  /** `{model name}-{version}` actually used — not necessarily the id sent. */
  model?: string
  status?: BytePlusVideoTaskStatus
  error?: BytePlusVideoTaskError
  /** Unix seconds. Anchors the 7-day task-record retention. */
  created_at?: number
  /** Unix seconds of the last status change — for a succeeded task, when the
   * output (and its 24-hour URL) was produced. */
  updated_at?: number
  content?: BytePlusVideoTaskContent
  seed?: number
  resolution?: string
  ratio?: string
  duration?: number | string
  frames?: number
  /** Frame rate. Lowercase and unseparated on the wire — not `frames_per_second`. */
  framespersecond?: number
  generate_audio?: boolean
  service_tier?: string
  draft?: boolean
  draft_task_id?: string
  execution_expires_after?: number
  safety_identifier?: string
  usage?: BytePlusVideoTaskUsage

  // The two fields below came back on a live succeeded task
  // (`seedance-1-0-pro-fast-251015`, 2026-07-31) but are absent from the
  // harvested Get schema.
  /** Queue priority the task ran at. */
  priority?: number
  /** Container of the generated video, e.g. `mp4`. */
  output_format?: string
}

/**
 * One entry of the list response.
 *
 * The list document declares the same fields as the get document (including
 * `error` — despite BytePlus prose elsewhere calling the list-side field
 * `failure_reason`, no such field exists in the harvested schema, so it is
 * not typed here).
 */
export interface BytePlusVideoTaskListItem extends BytePlusVideoTask {}

/**
 * Response of `GET /contents/generations/tasks`.
 *
 * Supported query parameters: `page_num` and `page_size` (both `[1, 500]`),
 * `filter.status`, repeated `filter.task_ids`, and `filter.service_tier`.
 *
 * **`flex` tasks are missing from the default listing.** An unfiltered list
 * returned `{total: 0, items: []}` both while a live `flex` task was running
 * and immediately after it succeeded, so offline-tier work is invisible here
 * unless `filter.service_tier=flex` is passed. Poll a known task id rather
 * than relying on the listing to discover tasks.
 */
export interface BytePlusVideoTaskListResponse {
  items?: Array<BytePlusVideoTaskListItem>
  total?: number
}

// `DELETE /contents/generations/tasks/{id}` cancels a `queued` task and
// deletes anything already terminal; its documented success body is an empty
// object, so no response interface is declared for it.
