import { readGraphqlResponse, resolveUthanaConfig } from './client'
import type { UthanaClientConfig } from './client'

export interface CreateUthanaCharacterOptions extends UthanaClientConfig {
  /** A humanoid model as `.fbx` or `.glb`. */
  file: Blob
  /** File name sent to Uthana. Its extension tells Uthana the format. */
  fileName: string
  /** Character name shown in Uthana. */
  name: string
  /** Rig the mesh automatically. Set false for a model that has a rig. Default true. */
  autoRig?: boolean
  abortSignal?: AbortSignal
}

export interface UthanaCharacter {
  characterId: string
  name: string
  /** 0 to 1, when Uthana rigged the mesh. Higher is better. */
  autoRigConfidence?: number
  message?: string
}

/**
 * Upload your own character to Uthana, so motions are generated for and
 * downloaded on its proportions. Pass the returned `characterId` as
 * `modelOptions.character_id` to `generateMotion()`.
 *
 * Uploading the same file again returns the same character.
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export async function createUthanaCharacter(
  options: CreateUthanaCharacterOptions,
): Promise<UthanaCharacter> {
  const config = resolveUthanaConfig(options)
  // GraphQL multipart request: the file is the `file` variable.
  const form = new FormData()
  form.append(
    'operations',
    JSON.stringify({
      query: `mutation($file: Upload!, $name: String!, $auto_rig: Boolean) {
        create_character(file: $file, name: $name, auto_rig: $auto_rig) { character { id name } auto_rig_confidence message }
      }`,
      variables: {
        file: null,
        name: options.name,
        auto_rig: options.autoRig ?? true,
      },
    }),
  )
  form.append('map', JSON.stringify({ '0': ['variables.file'] }))
  form.append('0', options.file, options.fileName)
  const response = await config.fetch(`${config.baseUrl}/graphql`, {
    method: 'POST',
    headers: { authorization: config.authorization },
    body: form,
    ...(options.abortSignal ? { signal: options.abortSignal } : {}),
  })
  const data = await readGraphqlResponse<{
    create_character: {
      character: { id: string; name: string }
      auto_rig_confidence?: number | null
      message?: string | null
    }
  }>(response)
  const created = data.create_character
  return {
    characterId: created.character.id,
    name: created.character.name,
    ...(created.auto_rig_confidence != null
      ? { autoRigConfidence: created.auto_rig_confidence }
      : {}),
    ...(created.message ? { message: created.message } : {}),
  }
}
