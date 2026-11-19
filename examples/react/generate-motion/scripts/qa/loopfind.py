# Find the frame pair (a, b) whose local poses match best: a loop window.
import bpy, sys, math, json
args = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=args[0])
sc = bpy.context.scene
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
f0, f1 = (int(round(v)) for v in arm.animation_data.action.frame_range)
skip = {'Pelvis'}  # pelvis rotation carries heading, compare the body pose
poses = []
for f in range(f0, f1 + 1):
    sc.frame_set(f)
    poses.append([pb.matrix_basis.to_quaternion().copy() for pb in arm.pose.bones if pb.name not in skip])
min_len = int(args[1])
best = None
for a in range(len(poses)):
    for b in range(a + min_len, len(poses)):
        d = sum(math.degrees(x.rotation_difference(y).angle) for x, y in zip(poses[a], poses[b])) / len(poses[a])
        if best is None or d < best[0]:
            best = (d, a + f0, b + f0)
print('LOOP', json.dumps({'meanDiffDeg': round(best[0], 2), 'startFrame': best[1], 'endFrame': best[2], 'seconds': round((best[2] - best[1]) / sc.render.fps, 3)}))
