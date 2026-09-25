import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const declarationsRoot = join(import.meta.dirname, '..', 'dist', 'esm')
const sourceRoot = join(import.meta.dirname, '..', 'src')

const prohibitedProductionTestSeams = [
  'memorySandboxSnapshotsForTest',
  'MemorySandboxSnapshotsTestOptions',
  'failAfterTranscriptStage',
  'failAfterCheckpointStage',
  'failAfterReferenceStage',
  'failAfterHeadStage',
  'createInMemoryCheckpointCoordinator',
  'InMemoryCheckpointCoordinator',
  'PreparedCheckpointFork',
]

function filesUnder(directory: string, extension: string): Array<string> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return filesUnder(path, extension)
    return entry.isFile() && path.endsWith(extension) ? [path] : []
  })
}

function rootDeclarationGraph(entry: string): Array<string> {
  const seen = new Set<string>()
  const visit = (file: string): void => {
    if (seen.has(file)) return
    seen.add(file)
    const source = readFileSync(file, 'utf8')
    for (const specifier of source.matchAll(/from ['"](\.\/[^'"]+)['"]/g)) {
      const moduleSpecifier = specifier[1]
      if (moduleSpecifier === undefined) continue
      const imported = join(file, '..', moduleSpecifier)
      const declaration = imported.endsWith('.d.ts')
        ? imported
        : imported.endsWith('.js')
          ? imported.slice(0, -3) + '.d.ts'
          : `${imported}.d.ts`
      visit(declaration)
    }
  }
  visit(entry)
  return [...seen]
}

describe('root declarations', () => {
  function expectNoPersistenceDeclarationReference(entry: string): void {
    const files = rootDeclarationGraph(entry)
    expect(files.length).toBeGreaterThan(0)

    const persistenceSpecifiers = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return source.includes('@tanstack/ai-persistence') ? [file] : []
    })

    expect(persistenceSpecifiers).toEqual([])
  }

  it('do not require persistence type resolution', () => {
    expectNoPersistenceDeclarationReference(
      join(declarationsRoot, 'index.d.ts'),
    )
  })

  it('ships a testkit declaration graph that does not require persistence', () => {
    expectNoPersistenceDeclarationReference(
      join(declarationsRoot, 'testkit', 'conformance.d.ts'),
    )
  })

  it('do not contain production test seams in source or emitted declarations', () => {
    const files = [
      ...filesUnder(sourceRoot, '.ts'),
      ...filesUnder(declarationsRoot, '.d.ts'),
    ]
    const matches = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return prohibitedProductionTestSeams.flatMap((seam) =>
        source.includes(seam) ? [`${file}: ${seam}`] : [],
      )
    })

    expect(matches).toEqual([])
  })
})
