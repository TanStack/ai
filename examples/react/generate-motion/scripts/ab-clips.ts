// A/B grid: does prompt style or guidance make the orc idle and cleave less
// stiff? 2 clips x 3 prompt styles x 2 guidance values x 2 seeds = 24 takes.
//
//   FAL_KEY=... node scripts/generate-orc-clips.ts --set ab
import type { ClipSpec } from './generate-orc-clips.ts'

interface Variant {
  style: 'A-original' | 'B-plain-sequence' | 'C-weight-cues'
  duration: number
  prompt: string
}

const IDLE: Array<Variant> = [
  {
    // The take-1 prompt: character adjectives plus a pose description.
    style: 'A-original',
    duration: 3,
    prompt:
      'A large heavy warrior stands in a wide combat stance with feet apart and knees slightly bent, holding a heavy two-handed axe in front of his body with both hands, right hand high near the head and left hand low on the handle. He breathes deeply and shifts his weight slightly from side to side while his feet stay planted.',
  },
  {
    // Short, concrete, one sequence, in the style of the training captions.
    style: 'B-plain-sequence',
    duration: 3,
    prompt:
      'a person stands with feet wide apart and knees bent, holds both hands together in front of the stomach, breathes in and out deeply, and slowly shifts weight from the left leg to the right leg and back.',
  },
  {
    // Visible signs of weight and tension, and more time to show them.
    style: 'C-weight-cues',
    duration: 4,
    prompt:
      'a person stands low with feet wide apart and knees deeply bent, shoulders hunched forward, both hands gripping something heavy in front of the hips. The chest heaves with heavy breaths, the shoulders rise and fall, the weight rolls slowly from one leg to the other, and the head turns a little to look around.',
  },
]

const CLEAVE: Array<Variant> = [
  {
    style: 'A-original',
    duration: 3,
    prompt:
      'A heavy man grips a large axe handle with both hands together, raises both hands up over his right shoulder, then swings both hands together hard diagonally down across his body to his left side at chest height, follows through with his torso, and returns to a ready stance. Both hands stay together on the handle the whole time.',
  },
  {
    style: 'B-plain-sequence',
    duration: 3,
    prompt:
      'a person holds both hands together in front, lifts both hands up over the right shoulder, swings both arms down hard across the body to the left, and then returns to standing with both hands in front.',
  },
  {
    style: 'C-weight-cues',
    duration: 4.5,
    prompt:
      'a person with both hands together on a heavy handle sinks low and slowly twists the torso back to the right, lifting both hands high over the right shoulder. Then the whole body explodes forward: the hips turn, the back foot pushes, and both arms swing hard diagonally down across the body to the left. The swing pulls the torso around and the person stumbles half a step to catch the weight, breathes, and slowly comes back up to a ready stance.',
  },
]

const GUIDANCE = [3.5, 6.5]
const SEEDS = [41, 42]

function grid(clip: 'idle' | 'cleave', variants: Array<Variant>) {
  return variants.flatMap((v) =>
    GUIDANCE.flatMap((guidance) =>
      SEEDS.map(
        (seed): ClipSpec => ({
          name: `${clip}_${v.style}_g${guidance}_s${seed}`,
          role: 'attacker',
          loop: clip === 'idle',
          duration: v.duration,
          seed,
          guidance,
          prompt: v.prompt,
        }),
      ),
    ),
  )
}

export const AB_CLIPS: Array<ClipSpec> = [
  ...grid('idle', IDLE),
  ...grid('cleave', CLEAVE),
]
