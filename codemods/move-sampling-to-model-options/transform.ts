/**
 * jscodeshift transform: move root sampling options into provider-native
 * `modelOptions`.
 *
 * The root-level `temperature` / `topP` / `maxTokens` convenience props on
 * `chat()` / `ai()` / `generate()` / `createChatOptions()` are being moved
 * into the provider-native `modelOptions` object. Each provider names these
 * options differently, so the rename is provider-specific and resolved from
 * the `adapter:` property's factory call (e.g. `openaiText('gpt-4o')`).
 *
 * Per-provider rename of the three root keys:
 *
 *   openai:     temperature → temperature,  topP → top_p,  maxTokens → max_output_tokens
 *   anthropic:  temperature → temperature,  topP → top_p,  maxTokens → max_tokens
 *   gemini:     temperature → temperature,  topP → topP,   maxTokens → maxOutputTokens
 *   grok:       temperature → temperature,  topP → top_p,  maxTokens → max_tokens
 *   groq:       temperature → temperature,  topP → top_p,  maxTokens → max_completion_tokens
 *   openrouter: temperature → temperature,  topP → topP,   maxTokens → maxCompletionTokens
 *   ollama:     NESTED inside a `options` object —
 *               temperature → options.temperature, topP → options.top_p, maxTokens → options.num_predict
 *
 * This is a breaking change: the root props have been removed, so this
 * codemod migrates existing call sites onto the new `modelOptions` shape.
 *
 * Skip + report (via `api.report`) behavior, never partially transforming a
 * single call:
 *   - the adapter can't be resolved to a known provider factory (missing
 *     `adapter`, dynamic/spread adapter, or unknown callee);
 *   - `modelOptions` exists but isn't a plain object literal;
 *   - a target renamed key already exists in `modelOptions` (or in
 *     `modelOptions.options` for ollama).
 */

import type {
  API,
  ASTPath,
  CallExpression,
  Collection,
  FileInfo,
  Identifier,
  ImportDeclaration,
  JSCodeshift,
  ObjectExpression,
  Property,
} from 'jscodeshift'

const CORE_PACKAGE = '@tanstack/ai'

/** Helper names (imported from `@tanstack/ai`) we operate on. */
const TARGET_CALLEES = new Set(['chat', 'ai', 'generate', 'createChatOptions'])

/** The three root sampling props we relocate. */
const ROOT_SAMPLING_KEYS = ['temperature', 'topP', 'maxTokens'] as const
type RootSamplingKey = (typeof ROOT_SAMPLING_KEYS)[number]

type Provider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'grok'
  | 'groq'
  | 'openrouter'
  | 'ollama'

/**
 * Map a provider text-adapter factory name → provider. Factory names were
 * confirmed against each provider package's `index.ts` exports. Note the
 * OpenRouter factory is `openRouterText` (capital R); `openrouterText` is
 * accepted defensively but is not a real export.
 */
const FACTORY_TO_PROVIDER: Record<string, Provider> = {
  openaiText: 'openai',
  anthropicText: 'anthropic',
  geminiText: 'gemini',
  grokText: 'grok',
  groqText: 'groq',
  openRouterText: 'openrouter',
  openrouterText: 'openrouter',
  ollamaText: 'ollama',
}

/**
 * Per-provider rename of each root key → its `modelOptions` key name. For
 * ollama the renamed keys live inside a nested `options` object (handled
 * separately), so the names here are the keys *within* that nested object.
 */
const RENAME: Record<Provider, Record<RootSamplingKey, string>> = {
  openai: {
    temperature: 'temperature',
    topP: 'top_p',
    maxTokens: 'max_output_tokens',
  },
  anthropic: {
    temperature: 'temperature',
    topP: 'top_p',
    maxTokens: 'max_tokens',
  },
  gemini: {
    temperature: 'temperature',
    topP: 'topP',
    maxTokens: 'maxOutputTokens',
  },
  grok: {
    temperature: 'temperature',
    topP: 'top_p',
    maxTokens: 'max_tokens',
  },
  groq: {
    temperature: 'temperature',
    topP: 'top_p',
    maxTokens: 'max_completion_tokens',
  },
  openrouter: {
    temperature: 'temperature',
    topP: 'topP',
    maxTokens: 'maxCompletionTokens',
  },
  ollama: {
    temperature: 'temperature',
    topP: 'top_p',
    maxTokens: 'num_predict',
  },
}

/** ollama nests the renamed keys inside a `modelOptions.options` object. */
const PROVIDERS_WITH_NESTED_OPTIONS = new Set<Provider>(['ollama'])

interface ImportFacts {
  /** Whether any helper we transform is imported from `@tanstack/ai`. */
  hasCoreHelper: boolean
}

function collectImportFacts(j: JSCodeshift, root: Collection): ImportFacts {
  const facts: ImportFacts = { hasCoreHelper: false }

  root.find(j.ImportDeclaration).forEach((path: ASTPath<ImportDeclaration>) => {
    const source = path.node.source.value
    if (source !== CORE_PACKAGE) return
    const specifiers = path.node.specifiers ?? []
    for (const spec of specifiers) {
      if (
        spec.type === 'ImportSpecifier' &&
        TARGET_CALLEES.has(spec.imported.name)
      ) {
        facts.hasCoreHelper = true
      }
    }
  })

  return facts
}

/**
 * Find a non-computed, non-spread Property by its Identifier key name.
 * Handles both `Property` (ESTree) and `ObjectProperty` (Babel) node types.
 */
function findKey(obj: ObjectExpression, name: string): Property | undefined {
  for (const prop of obj.properties) {
    if (prop.type !== 'Property' && prop.type !== 'ObjectProperty') continue
    if ((prop as Property).computed) continue
    const key = (prop as Property).key
    if (key.type === 'Identifier' && key.name === name) {
      return prop as Property
    }
  }
  return undefined
}

/**
 * Extract the value expression of a property, expanding shorthand. For a
 * shorthand `{ temperature }`, the value is the `temperature` Identifier,
 * which is exactly the reference we want to preserve when relocating.
 */
function valueOf(prop: Property): Property['value'] {
  return prop.value
}

/** The first object-literal argument of a call, or undefined. */
function firstObjectArg(node: CallExpression): ObjectExpression | undefined {
  return node.arguments.find(
    (a): a is ObjectExpression => a.type === 'ObjectExpression',
  )
}

/**
 * Resolve the provider from a call's first object argument by inspecting its
 * `adapter` property. Returns the provider, or `null` if it can't be
 * resolved (no adapter, non-call adapter, spread, or unknown factory).
 */
function resolveProvider(obj: ObjectExpression): Provider | null {
  const adapterProp = findKey(obj, 'adapter')
  if (!adapterProp) return null
  const value = adapterProp.value
  if (!value || value.type !== 'CallExpression') return null
  const callee = (value as CallExpression).callee
  if (callee.type !== 'Identifier') return null
  const provider = FACTORY_TO_PROVIDER[(callee as Identifier).name]
  return provider ?? null
}

interface Conflict {
  filePath: string
  line?: number
  reason: string
}

export default function transform(
  file: FileInfo,
  api: API,
): string | null | undefined {
  const j = api.jscodeshift
  const root = j(file.source)
  const facts = collectImportFacts(j, root)

  // Bail out early if none of the target helpers are imported from
  // `@tanstack/ai` — keeps the codemod a no-op on unrelated files that
  // happen to use a `temperature`/`topP`/`maxTokens` key.
  if (!facts.hasCoreHelper) {
    return file.source
  }

  let changed = 0
  const conflicts: Array<Conflict> = []

  root
    .find(j.CallExpression)
    .filter((path) => {
      const callee = path.node.callee
      return callee.type === 'Identifier' && TARGET_CALLEES.has(callee.name)
    })
    .forEach((path: ASTPath<CallExpression>) => {
      const obj = firstObjectArg(path.node)
      if (!obj) return

      // Only act if at least one root sampling prop is present.
      const presentKeys = ROOT_SAMPLING_KEYS.filter((k) => findKey(obj, k))
      if (presentKeys.length === 0) return

      const line = path.node.loc?.start.line
      const calleeName =
        path.node.callee.type === 'Identifier' ? path.node.callee.name : 'call'

      // Resolve the provider from the adapter. Skip + report if we can't.
      const provider = resolveProvider(obj)
      if (!provider) {
        conflicts.push({
          filePath: file.path,
          line,
          reason: `${calleeName}(): could not resolve a known provider adapter from the \`adapter\` property; left alone.`,
        })
        return
      }

      const renameMap = RENAME[provider]
      const nested = PROVIDERS_WITH_NESTED_OPTIONS.has(provider)

      // Validate / locate modelOptions before mutating anything, so a
      // conflict aborts the WHOLE call without a partial transform.
      let modelOptionsObj: ObjectExpression | null = null
      const modelOptionsProp = findKey(obj, 'modelOptions')
      if (modelOptionsProp) {
        if (modelOptionsProp.value.type !== 'ObjectExpression') {
          conflicts.push({
            filePath: file.path,
            line,
            reason: `${calleeName}(): \`modelOptions\` exists but is not a plain object literal; left alone. Merge by hand.`,
          })
          return
        }
        modelOptionsObj = modelOptionsProp.value as ObjectExpression
      }

      // For ollama, locate/validate the nested `options` object too.
      let nestedOptionsObj: ObjectExpression | null = null
      if (nested && modelOptionsObj) {
        const optionsProp = findKey(modelOptionsObj, 'options')
        if (optionsProp) {
          if (optionsProp.value.type !== 'ObjectExpression') {
            conflicts.push({
              filePath: file.path,
              line,
              reason: `${calleeName}(): \`modelOptions.options\` exists but is not a plain object literal; left alone. Merge by hand.`,
            })
            return
          }
          nestedOptionsObj = optionsProp.value as ObjectExpression
        }
      }

      // Conflict check: would any renamed target key collide with an
      // existing key in the destination object?
      const destForCheck = nested ? nestedOptionsObj : modelOptionsObj
      let hasConflict = false
      for (const key of presentKeys) {
        const renamed = renameMap[key]
        if (destForCheck && findKey(destForCheck, renamed)) {
          hasConflict = true
          break
        }
      }
      if (hasConflict) {
        conflicts.push({
          filePath: file.path,
          line,
          reason: `${calleeName}(): a target key already exists in ${
            nested ? '`modelOptions.options`' : '`modelOptions`'
          }; left alone. Merge by hand.`,
        })
        return
      }

      // ---- All validations passed; perform the move. ----

      // Build the renamed properties, preserving original value expressions.
      const movedProps: Array<Property> = presentKeys.map((key) => {
        const original = findKey(obj, key)!
        const renamed = renameMap[key]
        const value = valueOf(original)
        const moved = j.property('init', j.identifier(renamed), value)
        // Emit ES6 shorthand (`temperature`) rather than `temperature:
        // temperature` when the value is exactly the same identifier as the
        // (renamed) destination key — e.g. a shorthand `{ temperature }` whose
        // provider key is unchanged.
        if (value.type === 'Identifier' && value.name === renamed) {
          moved.shorthand = true
        }
        return moved
      })

      // Ensure the destination object exists.
      if (!modelOptionsObj) {
        modelOptionsObj = j.objectExpression([])
        obj.properties.push(
          j.property('init', j.identifier('modelOptions'), modelOptionsObj),
        )
      }

      if (nested) {
        if (!nestedOptionsObj) {
          nestedOptionsObj = j.objectExpression([])
          modelOptionsObj.properties.push(
            j.property('init', j.identifier('options'), nestedOptionsObj),
          )
        }
        nestedOptionsObj.properties.push(...movedProps)
      } else {
        modelOptionsObj.properties.push(...movedProps)
      }

      // Remove the moved root props from the call's first arg.
      const movedSet = new Set<string>(presentKeys)
      obj.properties = obj.properties.filter((prop) => {
        if (prop.type !== 'Property' && prop.type !== 'ObjectProperty') {
          return true
        }
        if ((prop as Property).computed) return true
        const key = (prop as Property).key
        if (key.type === 'Identifier' && movedSet.has(key.name)) {
          return false
        }
        return true
      })

      changed++
    })

  for (const conflict of conflicts) {
    const where =
      conflict.line !== undefined
        ? `${conflict.filePath}:${conflict.line}`
        : conflict.filePath
    api.report(`[move-sampling-to-model-options] ${where} — ${conflict.reason}`)
  }

  return changed > 0 ? root.toSource() : file.source
}

// jscodeshift inspects `.parser` on the default export to choose its
// AST flavor. We support both .ts and .tsx out of the box.
;(transform as unknown as { parser: string }).parser = 'tsx'
