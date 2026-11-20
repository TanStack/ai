// Upload a humanoid model to Uthana so motions are made on its proportions.
//
//   UTHANA_API_KEY=... node scripts/upload-uthana-character.ts <model.glb|.fbx> <name>
//
// Prints the character id. Pass it as `character_id` to uthanaMotion().
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { createUthanaCharacter } from '@tanstack/ai-uthana'

const [path, name] = process.argv.slice(2)
if (!path || !name) throw new Error('Usage: <model.glb|.fbx> <name>')
const bytes = await readFile(path)
const character = await createUthanaCharacter({
  file: new Blob([bytes]),
  fileName: basename(path),
  name,
})
console.log(JSON.stringify(character, null, 2))
