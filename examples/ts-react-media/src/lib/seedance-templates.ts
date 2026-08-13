import type {
  BytePlusVideoModel,
  BytePlusVideoResolution,
} from '@tanstack/ai-byteplus'

/**
 * One-click presets replicating the BytePlus Ark playground's video templates.
 *
 * Captured 2026-08-01 from the console's static asset config
 * (`exp_asset_library_v1`) plus the English prompt each card renders into the
 * composer. Every asset below is an unsigned public object in Ark's own
 * presets bucket and is **hotlinked, never downloaded** — the adapter passes
 * URIs straight through to the provider, so nothing is fetched or base64'd on
 * the way.
 *
 * The console's own defaults come with them: reference-generation mode, Auto
 * ratio, 720p, "Smart length" (a model-chosen duration, i.e. `duration: -1`)
 * and sound on.
 */

/** Ark presets bucket root for the playground's template media. */
const BASE =
  'https://ark-common-storage-prod-cn-beijing.tos-cn-beijing.volces.com/presets/experience/gen_video/templates/reference'

/**
 * Which prompt part a template asset becomes. The kind *is* the routing: the
 * adapter maps every video part to `reference_video` and every audio part to
 * `reference_audio` regardless of `metadata.role`, and reads the role only on
 * images (`'reference'` → `reference_image`).
 */
export type SeedanceTemplateMediaKind = 'image' | 'video' | 'audio'

export interface SeedanceTemplateMedia {
  kind: SeedanceTemplateMediaKind
  url: string
  /**
   * Chip label, written as the `@`-token the prompt uses for this asset so
   * the ordinals stay legible once the media is attached.
   */
  label: string
}

export interface SeedanceTemplate {
  id: string
  name: string
  blurb: string
  /** Sample result the console shows on the card. */
  previewUrl: string
  /** The console's official English prompt, verbatim. */
  prompt: string
  /** Attached in this order; `@Video1` is the first video, and so on. */
  media: Array<SeedanceTemplateMedia>
}

/**
 * Templates need multimodal reference media (video and audio prompt parts),
 * which is the Seedance 2.0 family only — applying one switches the model.
 */
export const SEEDANCE_TEMPLATE_MODEL: BytePlusVideoModel =
  'dreamina-seedance-2-0-260128'

/** The console generates templates at 720p. */
export const SEEDANCE_TEMPLATE_RESOLUTION: BytePlusVideoResolution = '720p'

/**
 * The `@Video1` / `@Image1` / `@Audio1` ordinals in these prompts are the
 * console's own authoring syntax. The console rewrites them to internal
 * `<<<video_1_1>>>` markers before sending; we deliberately do not reproduce
 * that, and send the `@`-token prose alongside ordered role-tagged parts.
 *
 * LIVE-VERIFIED 2026-08-01 through this studio: template 3 on
 * `dreamina-seedance-2-0-260128`, 720p, adaptive ratio, two reference videos,
 * shortened to 4s to keep the run cheap (task `cgt-20260801081634-zlhvm`).
 * Ark accepted the prose as written — no 400 — and *honoured the ordinals*:
 * the output's first frame reproduces `@Video1`'s overhead framing and the
 * last frame reproduces `@Video2`'s finished drawing, with generated
 * storyboard shots in between. So the tokens are worth keeping verbatim.
 *
 * If a future model rejects them, rewrite them in plain language ("the first
 * reference video") rather than reproducing the console's markers.
 */
export const SEEDANCE_TEMPLATES: ReadonlyArray<SeedanceTemplate> = [
  {
    id: 'tpl-2a98d017',
    name: 'Music video from art style',
    blurb: 'Scores a track to the look of a still',
    previewUrl: `${BASE}/reference/14_3.mp4`,
    prompt:
      'Create a music video for @Audio1 inspired by the visual art style of @Image1.',
    media: [
      { kind: 'image', url: `${BASE}/reference/14_1.png`, label: '@Image1' },
      { kind: 'audio', url: `${BASE}/reference/14_2.wav`, label: '@Audio1' },
    ],
  },
  {
    id: 'tpl-lx-24',
    name: 'Kitten cinematic journey',
    blurb: 'One unbroken take, forest to festive home',
    previewUrl: `${BASE}/timeline/55_5.mp4`,
    prompt:
      "Create a 15-second cinematic short in 4K/60fps HDR with subtle film grain, using a palm-sized, adorable orange-and-white kitten as the sole visual focus, continuously tracked in a single flowing narrative from a cool forest sanctuary to a festive ancient town and finally into a warm New Year home, with no hard cuts and all transitions driven naturally by the kitten's running path. Employ cinematic follow shots with shallow depth of field and filmic camera movement, gradually shifting the color tone from cool blue-green forest light to warm red town sidelight and then to soft yellow indoor glow. The kitten runs through the forest, steps onto a bluestone path that transitions into an old town, rubs against a bronze door knocker and pushes open a vermilion door, then enters a warmly lit home where it sprints to a child's feet and leaps into the child's arms in slow motion; the child smiles, hugs the kitten close, and the kitten nuzzles their chin as family silhouettes glow softly behind them. Light Chinese-style orchestral music follows the motion and swells gently into a festive peak as the frame holds in warm yellow light with subtle golden bokeh and slightly intensified film grain, ending on a tender, immersive cinematic moment with no dialogue or subtitles.",
    media: [
      { kind: 'video', url: `${BASE}/timeline/55_1.mp4`, label: '@Video1' },
      { kind: 'video', url: `${BASE}/timeline/55_2.mp4`, label: '@Video2' },
      { kind: 'video', url: `${BASE}/timeline/55_3.mp4`, label: '@Video3' },
    ],
  },
  {
    id: 'tpl-f370edd7',
    name: 'Child draws a dinosaur',
    blurb: 'Interpolates the middle between two clips',
    previewUrl: `${BASE}/timeline/25_3.mp4`,
    prompt:
      'Using @Video1 as the opening and @Video2 as the ending, generate the complete process of a child drawing a dinosaur. Storyboard-style shots are allowed.',
    media: [
      {
        kind: 'video',
        url: `${BASE}/timeline/25_1.mp4`,
        label: '@Video1 (opening)',
      },
      {
        kind: 'video',
        url: `${BASE}/timeline/25_2.mp4`,
        label: '@Video2 (ending)',
      },
    ],
  },
  {
    id: 'tpl-lx-20',
    name: 'Art gallery epilogue',
    blurb: 'Extends a clip to 15s with scored backing',
    previewUrl: `${BASE}/timeline/49_4.mp4`,
    prompt:
      'Extend @Video1 to a total length of 15 seconds with a warm, healing, and emotionally rich tone, using slow motion, soft lighting, and a warm color filter. The sequence transitions into a bright art gallery where white walls filled with oil paintings are softly lit as visitors move through with quiet admiration; it then follows a gentle, grown-up female protagonist in a simple long dress as she tenderly touches her artwork and smiles, accepts flowers from a viewer in a warm close-up, and finally resolves in an overhead wide shot of her standing at the center of the gallery, paintings behind and smiling audiences before her, surrounded by floating light particles as the frame holds. Use @Audio1 as continuous background music with subtle sparkling light sound effects at the opening transition, no dialogue, and maintain a warm white and creamy yellow palette with soft, shadowless gallery lighting and balanced color saturation.',
    media: [
      { kind: 'video', url: `${BASE}/timeline/49_1.mp4`, label: '@Video1' },
      { kind: 'audio', url: `${BASE}/timeline/49_2.mp3`, label: '@Audio1' },
    ],
  },
  {
    id: 'tpl-lx-06',
    name: 'Tech-park concept dive',
    blurb: 'Borrows one clip’s camera move, one still’s skyline',
    previewUrl: `${BASE}/reference/35_4.mp4`,
    prompt:
      "Following the camera movement style of @Video1, create a conceptual technology park video using @Image1 as the opening frame. The high-rise buildings in the image serve as the visual core, with a first-person aerial dive-in perspective that descends smoothly toward the central tower. Maintain a controlled, cinematic forward-and-downward motion to emphasize scale, structure, and spatial depth, highlighting the park's futuristic architecture, clean geometry, and advanced technological atmosphere. The camera movement remains fluid and immersive, reinforcing a strong sense of innovation and high-tech identity throughout the sequence.",
    media: [
      { kind: 'video', url: `${BASE}/reference/35_1.mp4`, label: '@Video1' },
      // The prompt calls this the "opening frame", but reference and frame
      // modes are mutually exclusive on the wire, and the console sends it in
      // reference mode — so it goes as a reference image, not a first frame.
      { kind: 'image', url: `${BASE}/reference/35_2.png`, label: '@Image1' },
    ],
  },
]
