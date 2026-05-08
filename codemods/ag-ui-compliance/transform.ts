/**
 * jscodeshift transform: AG-UI client compliance migration
 *
 * Renames the deprecated client-side fields introduced by the AG-UI
 * compliance release of `@tanstack/ai`. Each rename is gated by an
 * import-source check so we don't touch unrelated code that happens
 * to share a property name.
 *
 * Transforms (all opt-in — the deprecated names keep working):
 *
 *   1. `useChat({ body })` → `useChat({ forwardedProps })`
 *   2. `new ChatClient({ body })` → `new ChatClient({ forwardedProps })`
 *   3. `client.updateOptions({ body })` → `{ forwardedProps }`
 *      (when `ChatClient` is imported in the file)
 *   4. `chat.updateBody(x)` → `chat.updateForwardedProps(x)`
 *      (when imported from `@tanstack/ai-svelte`)
 *   5. `chat({ conversationId })` → `chat({ threadId })`
 *      (when `chat` is imported from `@tanstack/ai`)
 *
 * Conflict handling: if both the legacy and canonical key are already
 * present in the same object literal we leave the property alone — the
 * user has authored a deliberate mix and a blind rename would create
 * a duplicate key.
 */

import type {
  API,
  ASTPath,
  Collection,
  FileInfo,
  ImportDeclaration,
  JSCodeshift,
  ObjectExpression,
  Property,
} from 'jscodeshift'

const FRAMEWORK_USE_CHAT_PACKAGES = new Set([
  '@tanstack/ai-react',
  '@tanstack/ai-react-ui',
  '@tanstack/ai-vue',
  '@tanstack/ai-vue-ui',
  '@tanstack/ai-solid',
  '@tanstack/ai-solid-ui',
  '@tanstack/ai-preact',
])

const SVELTE_PACKAGE = '@tanstack/ai-svelte'
const CLIENT_PACKAGE = '@tanstack/ai-client'
const CORE_PACKAGE = '@tanstack/ai'

interface ImportFacts {
  /** Whether `useChat` is imported from a framework package. */
  hasUseChat: boolean
  /** Whether `ChatClient` is imported from `@tanstack/ai-client`. */
  hasChatClient: boolean
  /** Whether `createChat` is imported from `@tanstack/ai-svelte`. */
  hasCreateChat: boolean
  /** Whether `chat` is imported from `@tanstack/ai`. */
  hasChat: boolean
}

function collectImportFacts(j: JSCodeshift, root: Collection): ImportFacts {
  const facts: ImportFacts = {
    hasUseChat: false,
    hasChatClient: false,
    hasCreateChat: false,
    hasChat: false,
  }

  root.find(j.ImportDeclaration).forEach((path: ASTPath<ImportDeclaration>) => {
    const source = path.node.source.value
    if (typeof source !== 'string') return

    const specifiers = path.node.specifiers ?? []
    const importedNames = new Set<string>()
    for (const spec of specifiers) {
      if (spec.type === 'ImportSpecifier') {
        importedNames.add(spec.imported.name)
      }
    }

    if (
      FRAMEWORK_USE_CHAT_PACKAGES.has(source) &&
      importedNames.has('useChat')
    ) {
      facts.hasUseChat = true
    }
    if (source === CLIENT_PACKAGE && importedNames.has('ChatClient')) {
      facts.hasChatClient = true
    }
    // Gate the Svelte `updateBody` rename on the specific `createChat`
    // import name, not "any import from the package" — otherwise an
    // unrelated `.updateBody(...)` call elsewhere in the same file
    // (a form helper, custom store, etc.) would be silently rewritten.
    if (source === SVELTE_PACKAGE && importedNames.has('createChat')) {
      facts.hasCreateChat = true
    }
    if (source === CORE_PACKAGE && importedNames.has('chat')) {
      facts.hasChat = true
    }
  })

  return facts
}

/**
 * Find a Property by its (Identifier) key name on an ObjectExpression.
 * Skips spread elements, computed keys, and non-Identifier shorthand keys.
 */
function findKey(obj: ObjectExpression, name: string): Property | undefined {
  for (const prop of obj.properties) {
    if (prop.type !== 'Property' && prop.type !== 'ObjectProperty') continue
    if (prop.computed) continue
    const key = prop.key
    if (key.type === 'Identifier' && key.name === name) {
      return prop as Property
    }
  }
  return undefined
}

/**
 * Rename a property `oldName` → `newName` on the given object expression
 * iff `oldName` is present and `newName` is not. Returns
 * - `'renamed'` when the rename was applied,
 * - `'conflict'` when both keys were already present and the rename was
 *   skipped (caller should surface this to the user — silently leaving
 *   it alone hides intentional decisions that still need a human merge),
 * - `'skipped'` otherwise (no `oldName` key found, or the key was not
 *   an Identifier we can safely rewrite).
 */
function renameProperty(
  obj: ObjectExpression,
  oldName: string,
  newName: string,
): 'renamed' | 'conflict' | 'skipped' {
  const oldProp = findKey(obj, oldName)
  if (!oldProp) return 'skipped'
  if (findKey(obj, newName)) {
    return 'conflict'
  }
  if (oldProp.key.type === 'Identifier') {
    // For shorthand `{ body }`, the AST stores `key === value === Identifier('body')`
    // (or two equal-named Identifier nodes plus `shorthand: true`). Mutating
    // only the key would leave the printer emitting `{ forwardedProps }`,
    // which silently references an undefined identifier in the user's
    // scope. Expand to long form so the original `body` reference survives:
    // `{ body }` → `{ forwardedProps: body }`.
    const propAsAny = oldProp as unknown as {
      shorthand?: boolean
      value?: { type?: string; name?: string }
    }
    if (
      propAsAny.shorthand &&
      propAsAny.value?.type === 'Identifier' &&
      propAsAny.value.name === oldName
    ) {
      // Leave value pointing at the original identifier; only flip
      // `shorthand` off and rename the key.
      propAsAny.shorthand = false
    }
    oldProp.key.name = newName
    return 'renamed'
  }
  return 'skipped'
}

interface RenameStats {
  renamed: number
  conflicts: Array<{ filePath: string; line?: number; site: string }>
}

/**
 * Rename `oldKey` → `newKey` on the first object-literal argument of every
 * call site whose callee matches `predicate`. Conflicts (both keys already
 * present) are recorded so the caller can surface them via `api.report`.
 */
function renameKeyOnCalls(
  j: JSCodeshift,
  root: Collection,
  filePath: string,
  predicate: (path: ASTPath<any>) => boolean,
  oldKey: string,
  newKey: string,
  siteLabel: string,
  stats: RenameStats,
): void {
  root
    .find(j.CallExpression)
    .filter(predicate)
    .forEach((path) => {
      const args = path.node.arguments
      const objArg = args.find(
        (a): a is ObjectExpression => a.type === 'ObjectExpression',
      )
      if (!objArg) return
      const outcome = renameProperty(objArg, oldKey, newKey)
      if (outcome === 'renamed') {
        stats.renamed++
      } else if (outcome === 'conflict') {
        stats.conflicts.push({
          filePath,
          line: path.node.loc?.start.line,
          site: siteLabel,
        })
      }
    })
}

export default function transform(
  file: FileInfo,
  api: API,
): string | null | undefined {
  const j = api.jscodeshift
  const root = j(file.source)
  const facts = collectImportFacts(j, root)

  // Bail out early if no relevant imports — keeps the codemod a no-op
  // on files that just happen to use a `body` key in unrelated code.
  if (
    !facts.hasUseChat &&
    !facts.hasChatClient &&
    !facts.hasCreateChat &&
    !facts.hasChat
  ) {
    return file.source
  }

  const stats: RenameStats = { renamed: 0, conflicts: [] }

  // 1. useChat({ body }) → useChat({ forwardedProps })
  if (facts.hasUseChat) {
    renameKeyOnCalls(
      j,
      root,
      file.path,
      (path) => {
        const callee = path.node.callee
        return callee.type === 'Identifier' && callee.name === 'useChat'
      },
      'body',
      'forwardedProps',
      'useChat({ body })',
      stats,
    )
  }

  // 2. new ChatClient({ body }) → new ChatClient({ forwardedProps })
  if (facts.hasChatClient) {
    root.find(j.NewExpression).forEach((path) => {
      const callee = path.node.callee
      if (callee.type !== 'Identifier' || callee.name !== 'ChatClient') return
      const objArg = path.node.arguments.find(
        (a): a is ObjectExpression => a.type === 'ObjectExpression',
      )
      if (!objArg) return
      const outcome = renameProperty(objArg, 'body', 'forwardedProps')
      if (outcome === 'renamed') {
        stats.renamed++
      } else if (outcome === 'conflict') {
        stats.conflicts.push({
          filePath: file.path,
          line: path.node.loc?.start.line,
          site: 'new ChatClient({ body })',
        })
      }
    })

    // 3. <client>.updateOptions({ body }) → { forwardedProps }
    //
    // We can't always tell statically that `<client>` is a ChatClient
    // instance, so we gate the whole transform on the file importing
    // ChatClient (already checked) and pattern-match on the method
    // name. `updateOptions` is distinctive enough that false matches
    // are unlikely in a TanStack AI codebase.
    renameKeyOnCalls(
      j,
      root,
      file.path,
      (path) => {
        const callee = path.node.callee
        return (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'updateOptions'
        )
      },
      'body',
      'forwardedProps',
      'updateOptions({ body })',
      stats,
    )
  }

  // 4. chat.updateBody(x) → chat.updateForwardedProps(x)
  if (facts.hasCreateChat) {
    root.find(j.MemberExpression).forEach((path) => {
      if (path.node.computed) return
      if (path.node.property.type !== 'Identifier') return
      if (path.node.property.name !== 'updateBody') return
      path.node.property.name = 'updateForwardedProps'
      stats.renamed++
    })
  }

  // 5. chat({ conversationId }) → chat({ threadId })
  if (facts.hasChat) {
    renameKeyOnCalls(
      j,
      root,
      file.path,
      (path) => {
        const callee = path.node.callee
        return callee.type === 'Identifier' && callee.name === 'chat'
      },
      'conversationId',
      'threadId',
      'chat({ conversationId })',
      stats,
    )
  }

  // Surface conflicts so users can resolve them by hand. The codemod
  // intentionally leaves `{ body, forwardedProps }` (or other dual-key)
  // objects alone — silently swallowing them would either drop one
  // value or produce a duplicate-key object literal.
  for (const conflict of stats.conflicts) {
    const where =
      conflict.line !== undefined
        ? `${conflict.filePath}:${conflict.line}`
        : conflict.filePath
    api.report(
      `[ag-ui-compliance] ${where} — ${conflict.site}: both legacy and canonical keys are already present; left alone. Merge by hand.`,
    )
  }

  return stats.renamed > 0 ? root.toSource() : file.source
}

// jscodeshift inspects `.parser` on the default export to choose its
// AST flavor. We support both .ts and .tsx out of the box.
;(transform as unknown as { parser: string }).parser = 'tsx'
