import { existsSync } from 'node:fs'
import { cp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * Replace `outputDir` with `stagingDir` only after TypeDoc wrote index.md.
 * Copy the new tree beside dest first so a failed swap cannot leave dest empty.
 */
export async function publishStagedDocs(
  stagingDir: string,
  outputDir: string,
): Promise<void> {
  const stagedIndex = resolve(stagingDir, 'index.md')
  if (!existsSync(stagedIndex)) {
    await rm(stagingDir, { recursive: true, force: true })
    throw new Error(
      `TypeDoc did not write ${stagedIndex}. Existing docs/reference was not replaced.`,
    )
  }

  const nextDir = `${outputDir}.next`
  await rm(nextDir, { recursive: true, force: true })
  await cp(stagingDir, nextDir, { recursive: true })

  try {
    await rm(outputDir, { recursive: true, force: true })
    await cp(nextDir, outputDir, { recursive: true })
  } catch (error) {
    if (
      !existsSync(resolve(outputDir, 'index.md')) &&
      existsSync(resolve(nextDir, 'index.md'))
    ) {
      try {
        await cp(nextDir, outputDir, { recursive: true })
      } catch {
        // Fall through to the dest-missing throw.
      }
    }
    if (!existsSync(resolve(outputDir, 'index.md'))) {
      throw new Error(
        `Failed to replace ${outputDir}. New docs are in ${nextDir}.`,
        { cause: error },
      )
    }
  }

  await rm(nextDir, { recursive: true, force: true })
  await rm(stagingDir, { recursive: true, force: true })
}
