export type BytePlusVideoTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired'

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

export interface BytePlusVideoAudioContent {
  type: 'audio_url'
  audio_url: { url: string }
  role?: BytePlusVideoContentRole
}

export type BytePlusVideoContentPart =
  | BytePlusVideoTextContent
  | BytePlusVideoImageContent
  | BytePlusVideoVideoContent
  | BytePlusVideoAudioContent

export interface BytePlusVideoCreateRequest {
  /** Seedance model id (or a preconfigured endpoint id). */
  model: string

  /** Prompt text plus any image / video / audio inputs. */
  content: Array<BytePlusVideoContentPart>

  /** Output aspect ratio, e.g. `16:9`. `adaptive` follows the input frame. */
  ratio?: string

  /** Resolution tier, e.g. `720p`. Matched case-insensitively by the API. */
  resolution?: string

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

export interface BytePlusVideoCreateResponse {
  id?: string
}

export interface BytePlusVideoTaskError {
  code?: string
  message?: string
}

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

  /** Queue priority the task ran at. */
  priority?: number
  /** Container of the generated video, e.g. `mp4`. */
  output_format?: string
}

export interface BytePlusVideoTaskListItem extends BytePlusVideoTask {}

export interface BytePlusVideoTaskListResponse {
  items?: Array<BytePlusVideoTaskListItem>
  total?: number
}
