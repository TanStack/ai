// Generate the orc chieftain clip set with the TanStack AI motion API.
//
//   FAL_KEY=... node scripts/generate-orc-clips.ts [--only clip,clip] [--out dir]
//
// Each clip runs generateMotion({ stream: true }) against fal Hunyuan Motion,
// downloads every returned file (fal URLs expire), and writes manifest.json.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { generateMotion } from '@tanstack/ai'
import { falMotion } from '@tanstack/ai-fal'
import { uthanaMotion } from '@tanstack/ai-uthana'
import type { MotionGenerationResult, MotionStatusResult } from '@tanstack/ai'

const MODEL = 'fal-ai/hunyuan-motion'
const GUIDANCE_SCALE = 5 // fal default; listed so the manifest is explicit
// Uthana allows 4 concurrent jobs. Cap every set so --set uthana does not fail.
const CLIP_CONCURRENCY = 4

export interface ClipSpec {
  name: string
  role: 'attacker' | 'defender'
  loop: boolean
  // Requested seconds. fal accepts 0.5 to 12.
  duration: number
  seed: number
  prompt: string
  /** fal guidance_scale. Defaults to GUIDANCE_SCALE. */
  guidance?: number
  /** Default fal. Uthana needs UTHANA_API_KEY and has no seed or guidance. */
  provider?: 'fal' | 'uthana'
  /** Uthana character to generate on (see upload-uthana-character.ts). */
  characterId?: string
}

const UTHANA_MODEL = 'text-to-motion-3.0'

// Hunyuan Motion is trained on human motion text. The prompts describe the
// body and the hands; the axe itself is not part of the generated motion.
const CLIPS: Array<ClipSpec> = [
  {
    name: 'orc_axe_combat_idle',
    role: 'attacker',
    loop: true,
    duration: 3,
    seed: 1101,
    prompt:
      'A large heavy warrior stands in a wide combat stance with feet apart and knees slightly bent, holding a heavy two-handed axe in front of his body with both hands, right hand high near the head and left hand low on the handle. He breathes deeply and shifts his weight slightly from side to side while his feet stay planted.',
  },
  {
    name: 'orc_axe_charge',
    role: 'attacker',
    loop: true,
    duration: 2,
    seed: 1102,
    prompt:
      'A large heavy warrior runs forward aggressively with powerful strides and a strong forward lean, holding a heavy two-handed axe diagonally across his chest with both hands, shoulders rolling with each step.',
  },
  {
    name: 'orc_axe_heavy_cleave',
    role: 'attacker',
    loop: false,
    duration: 3,
    seed: 1103,
    prompt:
      'A large heavy warrior holding a two-handed axe with both hands plants his feet, draws the axe back over his right shoulder, then swings it hard diagonally down from his right to his left at chest height, follows through with his whole body, and returns to a ready stance with both hands on the axe.',
  },
  {
    name: 'orc_axe_leap_slam',
    role: 'attacker',
    loop: false,
    duration: 4,
    seed: 1104,
    prompt:
      'A large heavy warrior holding a two-handed axe crouches low, jumps up and forward while raising the axe high over his head with both hands, then slams the axe straight down into the ground as he lands hard with bent knees, absorbs the impact, and slowly stands back up into a ready stance.',
  },
  {
    name: 'enemy_heavy_hit_stagger',
    role: 'defender',
    loop: false,
    duration: 2,
    seed: 1105,
    prompt:
      'A person in a fighting stance is hit hard in the chest from the front, the upper body snaps backward and twists slightly, the arms fly up, the person takes a step back to catch balance, and returns to the fighting stance.',
  },
  {
    name: 'enemy_slam_knockdown',
    role: 'defender',
    loop: false,
    duration: 3,
    seed: 1106,
    prompt:
      'A person standing in a fighting stance is knocked off balance by a strong blast from the front, stumbles backward, falls onto their back on the ground, and lies still on their back.',
  },
  // Retakes after preview review. Take 1 of the leap did a forward flip
  // (upside down at frame 52, pelvis 4.2 m up); take 1 of the cleave let
  // go with the left hand during the wind-up.
  {
    name: 'orc_axe_leap_slam_take2',
    role: 'attacker',
    loop: false,
    duration: 4,
    seed: 2104,
    prompt:
      'A heavy man holding a large axe with both hands bends his knees, jumps a short distance forward with both hands raised above his head, lands on both feet with deeply bent knees while swinging both hands straight down in front of him to the ground, stays low for a moment, then stands up. He stays upright and does not flip.',
  },
  {
    name: 'orc_axe_leap_slam_take3',
    role: 'attacker',
    loop: false,
    duration: 4,
    seed: 3104,
    prompt:
      'A heavy man holding a large axe with both hands bends his knees, jumps a short distance forward with both hands raised above his head, lands on both feet with deeply bent knees while swinging both hands straight down in front of him to the ground, stays low for a moment, then stands up. He stays upright and does not flip.',
  },
  {
    name: 'orc_axe_heavy_cleave_take2',
    role: 'attacker',
    loop: false,
    duration: 3,
    seed: 2103,
    prompt:
      'A heavy man grips a large axe handle with both hands together, raises both hands up over his right shoulder, then swings both hands together hard diagonally down across his body to his left side at chest height, follows through with his torso, and returns to a ready stance. Both hands stay together on the handle the whole time.',
  },
]

function parseArgs(argv: Array<string>) {
  const only = argv.includes('--only')
    ? (argv[argv.indexOf('--only') + 1] ?? '').split(',')
    : undefined
  const set = argv.includes('--set') ? argv[argv.indexOf('--set') + 1] : 'main'
  const fallback = set === 'main' ? 'output/orc-axe' : `output/orc-axe-${set}`
  const out = argv.includes('--out')
    ? resolve(argv[argv.indexOf('--out') + 1] ?? fallback)
    : resolve(fallback)
  return { only, out, set }
}

interface ClipRecord extends ClipSpec {
  provider: 'fal' | 'uthana'
  model: string
  settings: Record<string, unknown>
  jobId?: string
  statuses: Array<MotionStatusResult & { at: string }>
  elapsedMs?: number
  result?: MotionGenerationResult
  files: Array<{ path: string; format: string; bytes: number; sha256: string }>
  error?: string
}

async function download(url: string, path: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`download ${url}: HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  await writeFile(path, bytes)
  return {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

async function runClip(spec: ClipSpec, out: string): Promise<ClipRecord> {
  const uthana = spec.provider === 'uthana'
  const uthanaOptions = {
    character_id: spec.characterId,
    formats: ['fbx', 'glb'] as Array<'fbx' | 'glb'>,
    fps: 30 as const,
  }
  const record: ClipRecord = {
    ...spec,
    provider: uthana ? 'uthana' : 'fal',
    model: uthana ? UTHANA_MODEL : MODEL,
    settings: uthana
      ? { duration: spec.duration, ...uthanaOptions }
      : {
          duration: spec.duration,
          seed: spec.seed,
          guidance_scale: spec.guidance ?? GUIDANCE_SCALE,
        },
    statuses: [],
    files: [],
  }
  const started = Date.now()
  const common = {
    threadId: `orc-axe/${spec.name}`,
    prompt: spec.prompt,
    duration: spec.duration,
    stream: true as const,
    pollingInterval: 3000,
    maxDuration: 20 * 60_000,
  }
  const stream = uthana
    ? generateMotion({
        ...common,
        adapter: uthanaMotion(UTHANA_MODEL, { defaults: uthanaOptions }),
      })
    : generateMotion({
        ...common,
        adapter: falMotion(MODEL),
        modelOptions: {
          seed: spec.seed,
          guidance_scale: spec.guidance ?? GUIDANCE_SCALE,
          output_format: 'fbx',
        },
      })

  for await (const chunk of stream) {
    if (chunk.type === 'CUSTOM' && chunk.name === 'motion:job:created') {
      const value = chunk.value as { jobId: string }
      record.jobId = value.jobId
      console.log(`[${spec.name}] job ${value.jobId}`)
    } else if (chunk.type === 'CUSTOM' && chunk.name === 'motion:status') {
      const status = chunk.value as MotionStatusResult
      const last = record.statuses.at(-1)
      if (last?.status !== status.status) {
        console.log(`[${spec.name}] ${status.status}`)
      }
      record.statuses.push({ ...status, at: new Date().toISOString() })
    } else if (chunk.type === 'CUSTOM' && chunk.name === 'generation:result') {
      record.result = chunk.value as MotionGenerationResult
    } else if (chunk.type === 'RUN_ERROR') {
      record.error = chunk.message
    }
  }
  record.elapsedMs = Date.now() - started

  if (record.result) {
    for (const asset of record.result.assets) {
      const ext = asset.format === 'json' ? 'motion.json' : asset.format
      const path = join(out, `${spec.name}.${ext}`)
      const info = await download(asset.url, path)
      record.files.push({ path, format: asset.format, ...info })
    }
    // Uthana assets are inline data: URLs; the bytes are in the files above.
    for (const asset of record.result.assets) {
      if (asset.url.startsWith('data:')) asset.url = '(data URL, saved to file)'
    }
    console.log(
      `[${spec.name}] done in ${Math.round(record.elapsedMs / 1000)}s: ${record.files.map((f) => `${f.format} ${f.bytes} B`).join(', ')}`,
    )
  } else {
    console.log(`[${spec.name}] FAILED: ${record.error}`)
  }
  return record
}

async function runClips(
  clips: Array<ClipSpec>,
  out: string,
): Promise<Array<ClipRecord>> {
  const records: Array<ClipRecord> = new Array(clips.length)
  let next = 0
  const workers = Math.min(CLIP_CONCURRENCY, clips.length)
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < clips.length) {
        const index = next
        next += 1
        const spec = clips[index]
        if (!spec) continue
        records[index] = await runClip(spec, out)
      }
    }),
  )
  return records
}

async function main() {
  const { only, out, set } = parseArgs(process.argv.slice(2))
  await mkdir(out, { recursive: true })
  const all =
    set === 'uthana' ? (await import('./uthana-clips.ts')).UTHANA_CLIPS : CLIPS
  const clips = only ? all.filter((c) => only.includes(c.name)) : all

  // Keep earlier records when only some clips are regenerated.
  const manifestPath = join(out, 'manifest.json')
  const previous: Record<string, ClipRecord> = await readFile(
    manifestPath,
    'utf8',
  )
    .then((text) => JSON.parse(text).clips as Record<string, ClipRecord>)
    .catch(() => ({}))

  const records = await runClips(clips, out)
  const merged = { ...previous }
  for (const record of records) merged[record.name] = record

  const ran = records[0]
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        generatedWith:
          ran?.provider === 'uthana'
            ? '@tanstack/ai generateMotion + @tanstack/ai-uthana uthanaMotion'
            : '@tanstack/ai generateMotion + @tanstack/ai-fal falMotion',
        provider: ran?.provider ?? 'fal',
        model: ran?.model ?? MODEL,
        updatedAt: new Date().toISOString(),
        clips: merged,
      },
      null,
      2,
    ),
  )
  console.log(`manifest: ${manifestPath}`)
  if (records.some((r) => !r.result)) process.exitCode = 1
}

// Run only as a script, so uthana-clips.ts can import the ClipSpec type.
if (import.meta.main) await main()
