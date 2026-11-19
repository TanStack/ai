# Headless Blender QA for one motion FBX.
#   blender --background --factory-startup --python analyze.py -- <fbx> <out.json> <sheet.png>
# Measures root drift, airborne frames, foot sliding, loop seam, hand speed
# peaks, and renders an isometric contact sheet of the skinned mannequin.
import bpy, sys, json, math
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
fbx, out_json, sheet_png = args[0], args[1], args[2]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx)
sc = bpy.context.scene
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
action = arm.animation_data.action
f0, f1 = (int(round(v)) for v in action.frame_range)
fps = sc.render.fps / sc.render.fps_base

# SMPL-H names (fal Hunyuan) and their Mixamo equivalents (Uthana).
MIXAMO = {'Pelvis': 'Hips', 'L_Hip': 'LeftUpLeg', 'R_Hip': 'RightUpLeg', 'Head': 'Head',
          'L_Foot': 'LeftToeBase', 'R_Foot': 'RightToeBase', 'L_Ankle': 'LeftFoot', 'R_Ankle': 'RightFoot',
          'L_Wrist': 'LeftHand', 'R_Wrist': 'RightHand', 'Spine3': 'Spine2'}
# Unreal mannequin names (the default Uthana character).
UE = {'Pelvis': 'pelvis', 'L_Hip': 'thigh_l', 'R_Hip': 'thigh_r', 'Head': 'head',
      'L_Foot': 'ball_l', 'R_Foot': 'ball_r', 'L_Ankle': 'foot_l', 'R_Ankle': 'foot_r',
      'L_Wrist': 'hand_l', 'R_Wrist': 'hand_r', 'Spine3': 'spine_04'}
def bone(name):
    for alt in (name, MIXAMO.get(name, name), UE.get(name, name)):
        if alt in arm.pose.bones: return arm.pose.bones[alt]
    alt = MIXAMO.get(name, name)
    return next(pb for pb in arm.pose.bones if pb.name.endswith(':' + alt))
names = ['L_Hip', 'R_Hip', 'Pelvis', 'Head', 'L_Foot', 'R_Foot', 'L_Ankle', 'R_Ankle', 'L_Wrist', 'R_Wrist']
track = {n: [] for n in names}
rot = []  # local rotations per frame for loop-seam
for f in range(f0, f1 + 1):
    sc.frame_set(f)
    for n in names:
        p = arm.matrix_world @ bone(n).head
        track[n].append((p.x, p.y, p.z))
    rot.append([pb.matrix_basis.to_quaternion().copy() for pb in arm.pose.bones])
T = {n: np.array(v) for n, v in track.items()}
frames = np.arange(f0, f1 + 1)
t = (frames - f0) / fps

pel = T['Pelvis']
foot_z = np.minimum(T['L_Foot'][:, 2], T['R_Foot'][:, 2])
# Floor = where the lower foot sits most of the time (20th percentile).
ground = float(np.percentile(foot_z, 20))
height = float(T['Head'][:, 2].max() - ground)

# Airborne: both feet above the lowest foot height by > 6 cm.
air = foot_z - ground > 0.06
air_frames = [int(f) for f in frames[air]]

# Foot sliding: horizontal travel of a foot while it is within 3 cm of the ground.
def slide(name):
    p = T[name]
    planted = (p[:, 2] - ground) < 0.04
    d = 0.0
    for i in range(1, len(p)):
        if planted[i] and planted[i - 1]:
            d += float(np.linalg.norm(p[i, :2] - p[i - 1, :2]))
    return round(d, 3), int(planted.sum())

def speed(name):
    v = np.linalg.norm(np.diff(T[name], axis=0), axis=1) * fps
    i = int(v.argmax())
    return round(float(v[i]), 2), int(frames[i + 1]), round(float(t[i + 1]), 3)

# Loop seam: mean local rotation difference first vs last frame, in degrees.
seam = np.mean([math.degrees(a.rotation_difference(b).angle) for a, b in zip(rot[0], rot[-1])])

# Wrist gap: distance between the two wrists (a two-handed grip keeps it small).
gap = np.linalg.norm(T['L_Wrist'] - T['R_Wrist'], axis=1)

pel_vel_z = np.diff(pel[:, 2]) * fps
# Liveliness: how fast the joints rotate on average, and how far the torso twists.
ang = [np.mean([math.degrees(a.rotation_difference(b).angle) for a, b in zip(rot[i], rot[i + 1])]) * fps for i in range(len(rot) - 1)]
spine = [n for n in ('Spine1', 'Spine2', 'Spine3')]
def yaw_series(name):
    out = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        out.append(math.degrees(bone(name).matrix.to_euler('XYZ').z))
    return np.unwrap(np.radians(out)) * 180 / math.pi
torso_twist = float(np.ptp(yaw_series('Spine3') - yaw_series('Pelvis')))
def facing(i):
    across = T['L_Hip'][i] - T['R_Hip'][i]
    fwd = np.cross(across, [0, 0, 1])  # z-up: left x up = forward
    fwd[2] = 0
    return fwd / (np.linalg.norm(fwd) or 1)
face0, face1 = facing(0), facing(-1)
travel = pel[-1, :2] - pel[0, :2]
report = {
    'file': fbx,
    'skeleton': {'armature': arm.name, 'bones': len(arm.data.bones), 'root': [b.name for b in arm.data.bones if b.parent is None], 'convention': 'mixamo' if any(b.name.startswith('mixamorig') for b in arm.data.bones) else 'smpl-h'},
    'action': action.name,
    'fps': fps,
    'frames': [f0, f1],
    'durationSeconds': round((f1 - f0) / fps, 3),
    'figureHeightM': round(height, 3),
    'pelvis': {
        'startXYZ': [round(float(v), 3) for v in pel[0]],
        'endXYZ': [round(float(v), 3) for v in pel[-1]],
        'horizontalTravelM': round(float(np.linalg.norm(pel[-1, :2] - pel[0, :2])), 3),
        'maxHorizontalFromStartM': round(float(np.linalg.norm(pel[:, :2] - pel[0, :2], axis=1).max()), 3),
        'zRangeM': [round(float(pel[:, 2].min()), 3), round(float(pel[:, 2].max()), 3)],
        'lowestFrame': int(frames[pel[:, 2].argmin()]),
        'highestFrame': int(frames[pel[:, 2].argmax()]),
        'maxDownwardSpeedFrame': int(frames[int(pel_vel_z.argmin()) + 1]),
    },
    'facing': {'startXY': [round(float(v), 3) for v in face0[:2]], 'endXY': [round(float(v), 3) for v in face1[:2]], 'turnDeg': round(math.degrees(math.acos(max(-1.0, min(1.0, float(np.dot(face0, face1)))))), 1), 'travelAlongStartFacingM': round(float(np.dot(travel, face0[:2])), 3), 'travelSidewaysM': round(float(abs(np.cross(face0[:2], travel))), 3)},
    'airborne': {'frames': len(air_frames), 'first': air_frames[0] if air_frames else None, 'last': air_frames[-1] if air_frames else None, 'maxFootClearanceM': round(float((foot_z - ground).max()), 3)},
    'footSlide': {'L_FootM_and_plantedFrames': slide('L_Foot'), 'R_FootM_and_plantedFrames': slide('R_Foot')},
    'peakSpeed': {'R_Wrist': speed('R_Wrist'), 'L_Wrist': speed('L_Wrist')},
    'wristGapM': {'min': round(float(gap.min()), 3), 'median': round(float(np.median(gap)), 3), 'max': round(float(gap.max()), 3)},
    'liveliness': {'meanJointSpeedDegPerSec': round(float(np.mean(ang)), 1), 'p90JointSpeedDegPerSec': round(float(np.percentile(ang, 90)), 1), 'torsoTwistRangeDeg': round(torso_twist, 1), 'pelvisVerticalRangeM': round(float(np.ptp(pel[:, 2])), 3)},
    'loopSeam': {'meanLocalRotDiffDeg': round(float(seam), 2), 'pelvisOffsetM': round(float(np.linalg.norm(pel[-1] - pel[0])), 3)},
}
with open(out_json, 'w') as fh:
    json.dump(report, fh, indent=2)

# ---- contact sheet: row 1 = elevated 3/4 game camera, row 2 = right-side profile ----
# The camera follows the pelvis so the body stays large; the ground plane
# stays at the clip's floor, so airborne frames show a gap under the feet.
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'SINGLE'
sc.display.shading.single_color = (0.62, 0.66, 0.52)
sc.display.shading.show_cavity = True
sc.display.shading.show_shadows = True
sc.render.resolution_x = sc.render.resolution_y = 260
world = bpy.data.worlds.new('w'); sc.world = world
world.color = (0.1, 0.1, 0.12)
span = np.concatenate([pel[:, :2]], axis=0)
bpy.ops.mesh.primitive_plane_add(size=float(np.ptp(span, axis=0).max()) + 12, location=(float(pel[:, 0].mean()), float(pel[:, 1].mean()), ground))
plane = bpy.context.object
mat = bpy.data.materials.new('g'); mat.diffuse_color = (0.28, 0.3, 0.33, 1); plane.data.materials.append(mat)
reach = max(float(np.linalg.norm(T[n] - pel, axis=1).max()) for n in names)
cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = reach * 2.6
cam = bpy.data.objects.new('cam', cam_data); sc.collection.objects.link(cam); sc.camera = cam
f3 = Vector((float(face0[0]), float(face0[1]), 0.0)).normalized()
right = f3.cross(Vector((0, 0, 1))).normalized()
views = {'game34': (f3 + right).normalized() + Vector((0, 0, 1.15)), 'side': right}

n_tiles = 8
pick = np.linspace(f0, f1, n_tiles).round().astype(int)
rows = []
for view, d in views.items():
    d = d.normalized()
    tiles = []
    for f in pick:
        sc.frame_set(int(f))
        i = int(f) - f0
        c = Vector((float(pel[i, 0]), float(pel[i, 1]), float(pel[i, 2]) - 0.1))
        cam.location = c + d * 15
        cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = sheet_png + f'.tmp.png'
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(sc.render.filepath)
        tiles.append(np.array(img.pixels[:]).reshape(img.size[1], img.size[0], 4))
        bpy.data.images.remove(img)
    rows.append(np.concatenate(tiles, axis=1))
# Blender image rows run bottom-up: put the game camera row on top.
sheet = np.concatenate(rows[::-1], axis=0)
h, w = sheet.shape[:2]
out = bpy.data.images.new('sheet', w, h)
out.pixels = sheet.ravel().tolist()
out.filepath_raw = sheet_png; out.file_format = 'PNG'; out.save()
import os
try: os.remove(sheet_png + '.tmp.png')
except OSError: pass
print('SHEET_FRAMES', [int(f) for f in pick])
print('REPORT_OK', out_json)
