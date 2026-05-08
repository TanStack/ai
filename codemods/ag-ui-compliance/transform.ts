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
  /** Whether anything is imported from `@tanstack/ai-svelte`. */
  hasSvelte: boolean
  /** Whether `chat` is imported from `@tanstack/ai`. */
  hasChat: boolean
}

function collectImportFacts(
  j: JSCodeshift,
  root: Collection,
): ImportFacts {
  const facts: ImportFacts = {
    hasUseChat: false,
    hasChatClient: false,
    hasSvelte: false,
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

    if (FRAMEWORK_USE_CHAT_PACKAGES.has(source) && importedNames.has('useChat')) {
      facts.hasUseChat = true
    }
    if (source === CLIENT_PACKAGE && importedNames.has('ChatClient')) {
      facts.hasChatClient = true
    }
    if (source === SVELTE_PACKAGE) {
      facts.hasSvelte = true
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
function findKey(
  obj: ObjectExpression,
  name: string,
): Property | undefined {
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
 * iff `oldName` is present and `newName` is not. Returns true if a
 * rename happened.
 */
function renameProperty(
  obj: ObjectExpression,
  oldName: string,
  newName: string,
): boolean {
  const oldProp = findKey(obj, oldName)
  if (!oldProp) return false
  if (findKey(obj, newName)) {
    // Both keys present — author has set them deliberately. Leaving
    // alone is safer than producing a duplicate-key object literal.
    return false
  }
  if (oldProp.key.type === 'Identifier') {
    oldProp.key.name = newName
    return true
  }
  return false
}

/**
 * Rename the `body` key to `forwardedProps` on the first object-literal
 * argument of every call site whose callee matches `predicate`.
 */
function renameBodyOnCalls(
  j: JSCodeshift,
  root: Collection,
  predicate: (path: ASTPath<any>) => boolean,
): number {
  let count = 0
  root
    .find(j.CallExpression)
    .filter(predicate)
    .forEach((path) => {
      const args = path.node.arguments
      const objArg = args.find(
        (a): a is ObjectExpression => a.type === 'ObjectExpression',
      )
      if (objArg && renameProperty(objArg, 'body', 'forwardedProps')) {
        count++
      }
    })
  return count
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
    !facts.hasSvelte &&
    !facts.hasChat
  ) {
    return file.source
  }

  let changed = 0

  // 1. useChat({ body }) → useChat({ forwardedProps })
  if (facts.hasUseChat) {
    changed += renameBodyOnCalls(j, root, (path) => {
      const callee = path.node.callee
      return callee.type === 'Identifier' && callee.name === 'useChat'
    })
  }

  // 2. new ChatClient({ body }) → new ChatClient({ forwardedProps })
  if (facts.hasChatClient) {
    root.find(j.NewExpression).forEach((path) => {
      const callee = path.node.callee
      if (callee.type !== 'Identifier' || callee.name !== 'ChatClient') return
      const objArg = path.node.arguments.find(
        (a): a is ObjectExpression => a.type === 'ObjectExpression',
      )
      if (objArg && renameProperty(objArg, 'body', 'forwardedProps')) {
        changed++
      }
    })

    // 3. <client>.updateOptions({ body }) → { forwardedProps }
    //
    // We can't always tell statically that `<client>` is a ChatClient
    // instance, so we gate the whole transform on the file importing
    // ChatClient (already checked) and pattern-match on the method
    // name. `updateOptions` is distinctive enough that false matches
    // are unlikely in a TanStack AI codebase.
    changed += renameBodyOnCalls(j, root, (path) => {
      const callee = path.node.callee
      return (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'updateOptions'
      )
    })
  }

  // 4. chat.updateBody(x) → chat.updateForwardedProps(x)
  if (facts.hasSvelte) {
    root.find(j.MemberExpression).forEach((path) => {
      if (path.node.computed) return
      if (path.node.property.type !== 'Identifier') return
      if (path.node.property.name !== 'updateBody') return
      path.node.property.name = 'updateForwardedProps'
      changed++
    })
  }

  // 5. chat({ conversationId }) → chat({ threadId })
  if (facts.hasChat) {
    root.find(j.CallExpression).forEach((path) => {
      const callee = path.node.callee
      if (callee.type !== 'Identifier' || callee.name !== 'chat') return
      const objArg = path.node.arguments.find(
        (a): a is ObjectExpression => a.type === 'ObjectExpression',
      )
      if (objArg && renameProperty(objArg, 'conversationId', 'threadId')) {
        changed++
      }
    })
  }

  return changed > 0 ? root.toSource() : file.source
}

// jscodeshift inspects `.parser` on the default export to choose its
// AST flavor. We support both .ts and .tsx out of the box.
;(transform as unknown as { parser: string }).parser = 'tsx'
