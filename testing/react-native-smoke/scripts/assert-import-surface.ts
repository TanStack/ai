import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../../..')
const fixtureRoot = resolve(scriptDir, '..')

const packageEntries = new Map<string, string>([
  ['@tanstack/ai-react', 'packages/ai-react/src/index.ts'],
  ['@tanstack/ai-client', 'packages/ai-client/src/index.ts'],
  ['@tanstack/ai/client', 'packages/ai/src/client.ts'],
])

const providerSdkPackages = new Set([
  '@anthropic-ai/sdk',
  '@fal-ai/client',
  '@google/genai',
  '@google/generative-ai',
  '@openrouter/sdk',
  'elevenlabs',
  'ollama',
  'openai',
])

const forbiddenPackages = new Set([
  '@tanstack/ai-react-ui',
  '@tanstack/react-ai-devtools',
  '@tanstack/solid-ai-devtools',
  'react-dom',
  'solid-js',
  'svelte',
  'vue',
])

const providerPackagePattern =
  /^@tanstack\/ai-(anthropic|elevenlabs|fal|gemini|grok|groq|ollama|openai|openrouter)(?:\/|$)/

const forbiddenPackagePrefixes = ['@vue/']
const builtins = new Set(
  builtinModules.flatMap((name) => [name, `node:${name}`]),
)

const forbiddenServerSymbols = new Set([
  'chat',
  'chatParamsFromRequest',
  'chatParamsFromRequestBody',
  'embedding',
  'generateAudio',
  'generateImage',
  'generateSpeech',
  'generateTranscription',
  'generateVideo',
  'getVideoJobStatus',
  'mergeAgentTools',
  'realtimeToken',
  'streamToText',
  'summarize',
  'toHttpResponse',
  'toHttpStream',
  'toServerSentEventsResponse',
  'toServerSentEventsStream',
])

interface SpecifierUse {
  names?: Set<string>
  specifier: string
}

const visited = new Set<string>()
const failures: Array<string> = []

function read(file: string) {
  return readFileSync(file, 'utf8')
}

function normalized(file: string) {
  return normalize(file).replaceAll('\\', '/')
}

function assertNoForbiddenText(file: string, source: string) {
  if (
    normalized(file).startsWith(normalized(fixtureRoot)) &&
    source.includes('/api/chat')
  ) {
    failures.push(`${file} contains the browser default /api/chat`)
  }
}

function parseNames(namedBlock: string): Set<string> {
  const withoutComments = stripComments(namedBlock)
  const names = withoutComments
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
        ?.trim(),
    )
    .filter((name): name is string => Boolean(name))

  return new Set(names)
}

function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
}

function mergeUse(
  uses: Array<SpecifierUse>,
  specifier: string,
  names: Set<string> | undefined,
) {
  const existing = uses.find((use) => use.specifier === specifier)
  if (!existing) {
    uses.push({ specifier, ...(names ? { names } : {}) })
    return
  }
  if (!names || !existing.names) {
    delete existing.names
    return
  }
  for (const name of names) existing.names.add(name)
}

function importUses(source: string): Array<SpecifierUse> {
  const parseSource = stripComments(source)
  const uses: Array<SpecifierUse> = []
  const importPattern =
    /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g
  const sideEffectPattern = /import\s+['"]([^'"]+)['"]/g
  const dynamicPattern = /import\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const match of parseSource.matchAll(importPattern)) {
    const clause = match[1]?.trim() ?? ''
    const specifier = match[2]
    if (!specifier) continue

    const named = clause.match(/\{([\s\S]*?)\}/)
    mergeUse(uses, specifier, named ? parseNames(named[1] ?? '') : undefined)
  }

  for (const match of parseSource.matchAll(sideEffectPattern)) {
    if (match[1]) mergeUse(uses, match[1], undefined)
  }

  for (const match of parseSource.matchAll(dynamicPattern)) {
    if (match[1]) mergeUse(uses, match[1], undefined)
  }

  return uses
}

function exportUsesForNames(
  source: string,
  requestedNames?: Set<string>,
): Array<SpecifierUse> {
  const parseSource = stripComments(source)
  const uses: Array<SpecifierUse> = []
  const exportFromPattern =
    /export\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"]/g
  const exportAllPattern = /export\s+(?:type\s+)?\*\s+from\s+['"]([^'"]+)['"]/g

  for (const match of parseSource.matchAll(exportFromPattern)) {
    const exportedNames = parseNames(match[1] ?? '')
    const specifier = match[2]
    if (!specifier) continue

    const matchingNames =
      requestedNames === undefined
        ? exportedNames
        : new Set(
            Array.from(exportedNames).filter((name) =>
              requestedNames.has(name),
            ),
          )

    if (matchingNames.size > 0) mergeUse(uses, specifier, matchingNames)
  }

  for (const match of parseSource.matchAll(exportAllPattern)) {
    if (match[1]) mergeUse(uses, match[1], requestedNames)
  }

  return uses
}

function localExportSources(
  source: string,
  requestedNames: Set<string>,
): Array<string> {
  const parseSource = stripComments(source)
  const sources: Array<string> = []
  const localExportPattern =
    /export\s+(?:async\s+)?(?:function|class|const|let|var|interface|type)\s+([A-Za-z_$][\w$]*)/g

  for (const match of parseSource.matchAll(localExportPattern)) {
    const name = match[1]
    if (name && requestedNames.has(name)) {
      sources.push(name)
    }
  }

  return sources
}

function resolveRelative(fromFile: string, specifier: string) {
  const base = resolve(dirname(fromFile), specifier)
  const candidates = extname(base)
    ? [base]
    : [`${base}.ts`, `${base}.tsx`, `${base}.js`, join(base, 'index.ts')]

  return candidates.find((candidate) => {
    try {
      readFileSync(candidate)
      return true
    } catch {
      return false
    }
  })
}

function checkForbiddenNamedImport(
  fromFile: string,
  specifier: string,
  names?: Set<string>,
) {
  if (!names) return

  for (const name of names) {
    if (forbiddenServerSymbols.has(name)) {
      failures.push(
        `${fromFile} imports or re-exports server-only helper ${name} from ${specifier}`,
      )
    }
  }
}

function checkExternal(fromFile: string, use: SpecifierUse) {
  const { names, specifier } = use

  if (specifier === '@tanstack/ai') {
    failures.push(
      `${fromFile} imports root @tanstack/ai; use @tanstack/ai/client for the React Native client graph`,
    )
  }
  if (providerSdkPackages.has(specifier)) {
    failures.push(`${fromFile} imports provider SDK ${specifier}`)
  }
  if (providerPackagePattern.test(specifier)) {
    failures.push(`${fromFile} imports provider package ${specifier}`)
  }
  if (forbiddenPackages.has(specifier)) {
    failures.push(`${fromFile} imports non-RN package ${specifier}`)
  }
  if (forbiddenPackagePrefixes.some((prefix) => specifier.startsWith(prefix))) {
    failures.push(`${fromFile} imports non-RN package ${specifier}`)
  }
  if (builtins.has(specifier)) {
    failures.push(`${fromFile} imports Node builtin ${specifier}`)
  }

  checkForbiddenNamedImport(fromFile, specifier, names)
}

function walk(file: string, requestedExports?: Set<string>) {
  const visitKey = `${normalized(file)}::${
    requestedExports ? Array.from(requestedExports).sort().join(',') : '*'
  }`
  if (visited.has(visitKey)) return
  visited.add(visitKey)

  const source = read(file)
  assertNoForbiddenText(file, source)

  if (requestedExports) {
    for (const localName of localExportSources(source, requestedExports)) {
      if (forbiddenServerSymbols.has(localName)) {
        failures.push(`${file} exports server-only helper ${localName}`)
      }
    }
  }

  const uses = [
    ...importUses(source),
    ...(requestedExports ? exportUsesForNames(source, requestedExports) : []),
  ]

  for (const use of uses) {
    const packageEntry = packageEntries.get(use.specifier)
    if (packageEntry) {
      walk(resolve(repoRoot, packageEntry), use.names)
      continue
    }

    if (use.specifier.startsWith('.')) {
      const resolved = resolveRelative(file, use.specifier)
      if (resolved) {
        walk(resolved, use.names)
      }
      continue
    }

    checkExternal(file, use)
  }
}

walk(resolve(fixtureRoot, 'src/App.tsx'))

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log(
  `React Native import surface smoke passed (${visited.size} visits).`,
)
