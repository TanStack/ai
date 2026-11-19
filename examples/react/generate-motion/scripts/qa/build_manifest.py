# Merge the generator manifest, the per-clip QA, and the preview review into
# orc-axe-motion-manifest.json. Run from the output folder.
import json

gen = json.load(open('manifest.json'))['clips']


def header(path):
    b = open(path, 'rb').read(27)
    return {
        'magic': b[:18].decode('ascii', 'replace'),
        'binary': b.startswith(b'Kaydara FBX Binary'),
        'version': int.from_bytes(b[23:27], 'little'),
    }


review = {
    'orc_axe_combat_idle': dict(
        status='selected',
        verdict='Usable. Stable wide stance, hands together in front, feet planted (0.06 m slide over 3 s). Motion is subtle; little visible breathing.',
        loop='Full clip loops with a 1.65 deg seam. Best window frames 35-75 (0.83 deg).',
        cleanup=['Optional: trim to frames 35-75 for a tighter loop.', 'Posture is upright for a heavy orc: lower the hips or add a pose layer.'],
    ),
    'orc_axe_charge': dict(
        status='selected',
        verdict='Usable as a run. Strong forward lean, hands kept together low (median wrist gap 0.29 m). Starts from a standing pose and accelerates; not a loop as delivered.',
        loop='Not a loop as delivered (6 deg seam, starts standing). One stride cycle at frames 13-32 (0.63 s, 2.2 deg).',
        cleanup=['Trim to frames 13-32 and loop.', 'Root travels 12.9 m in 2 s (about 6.4 m/s) and veers about 16 deg: bake root XZ into pose for in-place, or strip it.', 'Some foot slide while planted (L 0.67 m, R 1.56 m over the clip).'],
    ),
    'orc_axe_heavy_cleave': dict(
        status='rejected-take',
        verdict='Readable swing, but the left hand leaves the handle during the wind-up (wrist gap up to 0.69 m).',
    ),
    'orc_axe_heavy_cleave_take2': dict(
        status='selected',
        verdict='Usable. Wind-up to the right, fast diagonal swing across the body, twisted follow-through, return to ready. Hands stay closer (median 0.24 m, max 0.40 m). Stationary (0.2 m drift).',
        cleanup=['Two-hand grip needs hand IK to the axe handle; the model has no weapon.', 'Foot slide during the follow-through (L 0.93 m, R 0.79 m total while planted): foot IK or pin.'],
    ),
    'orc_axe_leap_slam': dict(
        status='rejected-take',
        verdict='Unusable: forward somersault (body inverted around frame 52), pelvis peaks 4.2 m.',
    ),
    'orc_axe_leap_slam_take2': dict(
        status='selected',
        verdict='Usable as one coherent clip. Crouch, real airborne phase (frames 21-36, 0.5 s) with both hands overhead, heavy landing into a deep crouch with both hands driven to the ground, hold, rise to standing. No flip.',
        cleanup=['Vertical root motion is in the pelvis: pelvis rises from 0.9 m to 1.88 m. Keep it in Unity, or bake it if code drives the jump arc.', 'Forward travel 1.2 m: bake or use root motion.', 'Foot slide after landing (L 0.79 m, R 0.95 m planted): foot IK.'],
    ),
    'orc_axe_leap_slam_take3': dict(
        status='alternate',
        verdict='Also coherent, but the airborne pose is a split-leg lunge and it ends further from the start pose (12.5 deg).',
    ),
    'enemy_heavy_hit_stagger': dict(
        status='selected',
        verdict='Usable. Upper body recoils and folds forward, arms react, steps back and recovers to stance. Survivable read. Reads more like a hit to the stomach than a backward torso snap.',
        cleanup=['Travels 1.47 m backward with heavy foot slide (L 1.98 m planted): bake root XZ or reduce, and pin feet.'],
    ),
    'enemy_slam_knockdown': dict(
        status='selected',
        verdict='Usable. Braced stance, thrown backward, lands on the back, ends stable on the ground.',
        cleanup=['Travels 3.0 m backward and 1.2 m sideways: decide in Unity whether the body slides or root motion is baked.', 'A small loose sphere from the provider mesh floats near frame 65 (mesh artifact, not animation); use the skeleton, not the mesh.'],
    ),
}

impact = {
    'orc_axe_heavy_cleave_take2': {'frame': 40, 'seconds': 1.3, 'source': 'measured', 'how': 'Peak right-wrist speed (10.4 m/s) in the joint data; matches the end of the swing in the preview.'},
    'orc_axe_leap_slam_take2': {'frame': 37, 'seconds': 1.2, 'source': 'measured', 'how': 'Last airborne frame is 36; first grounded frame 37 coincides with peak wrist speed (14.1 m/s). The preview shows the hands reaching the ground in the landing crouch.'},
}

clips = {}
for name, g in gen.items():
    qa = json.load(open(f'{name}.qa.json'))
    f = g['files'][0]
    entry = {
        'status': review[name]['status'],
        'role': g['role'],
        'wantedLoop': g['loop'],
        'prompt': g['prompt'],
        'provider': g['provider'],
        'model': g['model'],
        'settings': g['settings'],
        'unsupportedRequests': ['loop flag', 'in-place / root-motion mode', 'character or skeleton input', 'weapon or hand contact'],
        'jobId': g['jobId'],
        'generationSeconds': round(g['elapsedMs'] / 1000, 1),
        'providerReturned': {
            'assets': [{k: a.get(k) for k in ('format', 'fileName', 'fileSize', 'contentType')} for a in g['result']['assets']],
            'seed': g['result'].get('seed'),
            'durationOrFps': 'not returned by fal',
        },
        'file': {'path': f['path'], 'bytes': f['bytes'], 'sha256': f['sha256'], **header(f['path'])},
        'measuredFromFile': {k: qa[k] for k in ('skeleton', 'action', 'fps', 'frames', 'durationSeconds')},
        'rootMotion': {
            'kind': 'baked into the Pelvis bone (no separate root bone)',
            'pelvisTravelM': qa['pelvis']['horizontalTravelM'],
            'travelAlongFacingM': qa['facing']['travelAlongStartFacingM'],
            'sidewaysM': qa['facing']['travelSidewaysM'],
            'pelvisHeightRangeM': qa['pelvis']['zRangeM'],
            'airborne': qa['airborne'],
        },
        'checks': {'footSlideM_plantedFrames': qa['footSlide'], 'wristGapM': qa['wristGapM'], 'loopSeam': qa['loopSeam'], 'peakWristSpeed_mps_frame_sec': qa['peakSpeed']},
        'review': {k: v for k, v in review[name].items() if k != 'status'},
        'preview': f'{name}.preview.png',
    }
    if name in impact:
        entry['impact'] = impact[name]
    clips[name] = entry

json.dump({
    'set': 'orc chieftain two-handed axe',
    'generatedWith': '@tanstack/ai generateMotion (stream) + @tanstack/ai-fal falMotion',
    'regenerate': 'cd examples/react/generate-motion && FAL_KEY=... node scripts/generate-orc-clips.ts [--only name,name]',
    'skeleton': 'SMPL-H, 52 bones, root Pelvis, armature "Reference", 30 fps. The FBX also has a skinned mannequin mesh.',
    'timingLabels': {'measured': 'computed from the joint data in the FBX and checked in the preview', 'provider-supplied': 'none: fal returns no timing', 'manually-suggested': 'set by a person'},
    'clips': clips,
}, open('orc-axe-motion-manifest.json', 'w'), indent=2)
print('ok', len(clips))
print({n: c['status'] for n, c in clips.items()})
print({n: (c['file']['binary'], c['file']['version']) for n, c in clips.items()})
