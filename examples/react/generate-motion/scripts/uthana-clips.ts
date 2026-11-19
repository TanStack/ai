// The Uthana comparison set: the clips that looked stiffest on fal, made on
// the uploaded orc character. Uthana text-to-motion 3.0 takes 4 to 10 s and
// has no seed or guidance control.
//
//   UTHANA_API_KEY=... node scripts/generate-orc-clips.ts --set uthana
import type { ClipSpec } from './generate-orc-clips.ts'

// From upload-uthana-character.ts with the form-5 orc chieftain GLB.
const ORC_CHARACTER_ID = 'cQqy57L59QaH'

const base = {
  provider: 'uthana',
  characterId: ORC_CHARACTER_ID,
  seed: 0,
} as const

export const UTHANA_CLIPS: Array<ClipSpec> = [
  {
    ...base,
    name: 'uthana_orc_idle',
    role: 'attacker',
    loop: true,
    duration: 4,
    prompt:
      'a heavy warrior stands low with feet wide apart and knees deeply bent, shoulders hunched forward, both hands gripping a heavy two-handed axe in front of the hips. The chest heaves with heavy breaths, the shoulders rise and fall, the weight rolls slowly from one leg to the other, and the head turns a little to look around.',
  },
  {
    ...base,
    name: 'uthana_orc_cleave',
    role: 'attacker',
    loop: false,
    duration: 4.5,
    prompt:
      'a heavy warrior with both hands together on the handle of a heavy two-handed axe sinks low and slowly twists the torso back to the right, lifting the axe high over the right shoulder. Then the whole body explodes forward: the hips turn, the back foot pushes, and both arms swing the axe hard diagonally down across the body to the left. The swing pulls the torso around and he stumbles half a step to catch the weight, breathes, and slowly comes back up to a ready stance.',
  },
  {
    ...base,
    name: 'uthana_orc_leap_slam',
    role: 'attacker',
    loop: false,
    duration: 4,
    prompt:
      'a heavy warrior holding a large two-handed axe with both hands crouches, jumps a short distance forward with the axe raised high above his head, lands hard on both feet with deeply bent knees while slamming the axe straight down into the ground in front of him, stays low for a moment absorbing the impact, then stands back up. He stays upright and does not flip.',
  },
  // Round 2, after review: the first leap was a small hop and the idle was
  // almost frozen. The enemy reactions use the default Uthana character.
  {
    ...base,
    name: 'uthana_orc_leap_slam_v2',
    role: 'attacker',
    loop: false,
    duration: 4,
    prompt:
      'a heavy warrior holding a large two-handed axe sinks into a deep crouch, then explodes upward into a big powerful jump high into the air and far forward, both hands lifting the axe high above his head while he flies. He comes crashing down hard onto both feet with deeply bent knees, slamming the axe straight down into the ground in front of him with his whole body weight, stays low for a moment, then stands back up. He stays upright and does not flip.',
  },
  {
    ...base,
    name: 'uthana_orc_leap_slam_v3',
    role: 'attacker',
    loop: false,
    duration: 4,
    prompt:
      'a heavy warrior runs two big steps forward and leaps high and far into the air, raising a heavy two-handed axe over his head with both hands at the top of the jump. He lands with a heavy crash, legs bending deeply to absorb the fall, and drives the axe straight down into the ground in one huge overhead smash. He stays crouched for a moment, breathing hard, then rises.',
  },
  {
    ...base,
    name: 'uthana_orc_charge',
    role: 'attacker',
    loop: true,
    duration: 4,
    prompt:
      'a heavy warrior charges forward at a full aggressive run, leaning his chest far forward, holding a heavy two-handed axe with both hands across his body at chest height. His heavy feet pound the ground with long powerful strides, his shoulders swing with each step, and he keeps running straight forward.',
  },
  {
    ...base,
    name: 'uthana_orc_idle_v2',
    role: 'attacker',
    loop: true,
    duration: 4,
    prompt:
      'a big tired warrior breathing hard after a fight, standing low with feet wide apart, both hands holding a heavy two-handed axe in front of his hips. His chest heaves with deep breaths, he rolls his shoulders and neck, shifts his weight from one foot to the other, adjusts his grip on the axe handle, and glances left and right, then returns to the same low stance.',
  },
  {
    provider: 'uthana',
    seed: 0,
    name: 'uthana_enemy_heavy_hit_stagger',
    role: 'defender',
    loop: false,
    duration: 4,
    prompt:
      'a fighter standing in a guard stance is hit hard in the chest by a heavy blow from the front. The upper body snaps backward, the arms fly out, he stumbles three steps backward almost falling, catches his balance with his arms out wide, shakes his head, and raises his guard again.',
  },
  {
    provider: 'uthana',
    seed: 0,
    name: 'uthana_enemy_slam_knockdown',
    role: 'defender',
    loop: false,
    duration: 4,
    prompt:
      'a fighter standing in a guard stance is blasted off his feet by a huge impact on the ground in front of him. He is thrown backward through the air, lands hard on his back, his body bounces once on the ground, and he lies on his back in pain.',
  },
]
