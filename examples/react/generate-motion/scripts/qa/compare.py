# Render several motion FBX files side by side into one MP4, from an
# elevated 3/4 game camera.
#   blender --background --factory-startup --python compare.py -- <out.mp4> <a.fbx> <b.fbx> ...
import bpy, sys
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
out, files = args[0], args[1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
gap = 2.6
# Lay clips out along the camera's screen-horizontal axis on the ground.
view = Vector((0.55, -1.0, 0.75)).normalized()
side = Vector((-view.y, view.x, 0)).normalized()
end = 1
for i, path in enumerate(files):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    new = set(bpy.data.objects) - before
    arm = next(o for o in new if o.type == 'ARMATURE')
    for o in new:
        # The provider mesh carries a few loose spheres; keep the skinned body.
        if o.type != 'ARMATURE' and o.parent is not arm:
            o.hide_render = True
        if o.type == 'MESH' and o.name.startswith('qiu'):
            o.hide_render = True
    # Scale every character to the same standing height, so a small mesh
    # (like an imported orc) is as readable as the provider mannequin.
    sc.frame_set(1)
    bpy.context.view_layer.update()
    heads = [(arm.matrix_world @ pb.head).z for pb in arm.pose.bones if pb.name.endswith('Head')]
    feet = [(arm.matrix_world @ pb.head).z for pb in arm.pose.bones if pb.name.endswith(('Foot', 'ToeBase', 'Ankle'))]
    if heads and feet and max(heads) - min(feet) > 0.05:
        arm.scale *= 1.6 / (max(heads) - min(feet))
    arm.location += side * (i * gap)
    end = max(end, int(arm.animation_data.action.frame_range[1]))
sc.frame_start, sc.frame_end = 1, end
sc.render.fps = 30
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'TEXTURE'
sc.display.shading.single_color = (0.62, 0.66, 0.52)
sc.display.shading.show_cavity = True
sc.display.shading.show_shadows = True
world = bpy.data.worlds.new('w'); sc.world = world; world.color = (0.1, 0.1, 0.12)
mid = side * ((len(files) - 1) * gap / 2)
bpy.ops.mesh.primitive_plane_add(size=60, location=(mid.x, mid.y, 0))
mat = bpy.data.materials.new('g'); mat.diffuse_color = (0.28, 0.3, 0.33, 1)
bpy.context.object.data.materials.append(mat)
cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'
cam_data.ortho_scale = max(5.0, len(files) * gap + 1.6)
cam = bpy.data.objects.new('cam', cam_data); sc.collection.objects.link(cam); sc.camera = cam
center = Vector((mid.x, mid.y + 0.4, 0.8))
cam.location = center + view * 20
cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.resolution_x = 360 * len(files)
sc.render.resolution_y = 520
sc.render.image_settings.media_type = 'VIDEO' if hasattr(sc.render.image_settings, 'media_type') else sc.render.image_settings.file_format
sc.render.image_settings.file_format = 'FFMPEG'
sc.render.ffmpeg.format = 'MPEG4'
sc.render.ffmpeg.codec = 'H264'
sc.render.ffmpeg.constant_rate_factor = 'HIGH'
sc.render.filepath = out
bpy.ops.render.render(animation=True)
print('VIDEO_OK', out, 'frames', end)
