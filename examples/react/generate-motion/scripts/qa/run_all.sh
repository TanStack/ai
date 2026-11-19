#!/bin/sh
# QA every FBX in a folder: headless Blender, at most 6 at a time.
#   sh scripts/qa/run_all.sh <folder>
Q="$(cd "$(dirname "$0")" && pwd)"
# Blender needs an absolute output path.
O="$(cd "$1" && (pwd -W 2>/dev/null || pwd))"
BLENDER="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.3/blender.exe}"
ls "$O"/*.fbx | xargs -P 6 -I{} sh -c 'n=$(basename "{}" .fbx); "$0" --background --factory-startup --python "$1/analyze.py" -- "{}" "$2/$n.qa.json" "$2/$n.preview.png" > "$2/$n.qa.log" 2>&1' "$BLENDER" "$Q" "$O"
grep -l "REPORT_OK" "$O"/*.qa.log | wc -l
