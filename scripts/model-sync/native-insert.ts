/**
 * File-mutation helpers for `sync-provider-models.ts`.
 *
 * Kept here so the insert path (chat array + type maps) can be unit-tested
 * without running the full modelschemas fetch.
 */

export type ArrayRef = '.name' | '.id'

export function insertConstants(
  content: string,
  constants: Array<string>,
): string {
  const block = '\n' + constants.join('\n\n') + '\n'
  const exportIndex = content.indexOf('\nexport ')
  if (exportIndex === -1) {
    return content + block
  }
  // Insert above the export's JSDoc, so the comment stays on its export.
  const doc = /\n\/\*\*(?:(?!\*\/)[\s\S])*\*\/\s*$/.exec(
    content.slice(0, exportIndex),
  )
  const at = doc ? doc.index : exportIndex
  return content.slice(0, at) + block + content.slice(at)
}

export function addToStringLiteralArray(
  content: string,
  arrayName: string,
  values: Array<string>,
): string {
  if (values.length === 0) return content
  return addToArray(
    content,
    arrayName,
    values.map((value) => `'${value}'`),
    '',
  )
}

export function extractStringLiteralArrayValues(
  content: string,
  arrayName: string,
): Set<string> {
  const ids = new Set<string>()
  const block = content.match(
    new RegExp(`export const ${arrayName} = \\[([\\s\\S]*?)\\] as const`),
  )
  if (!block) {
    // An empty set here would make every existing id look new.
    throw new Error(`Could not find array '${arrayName}' in file`)
  }
  const quoted = block[1]!.matchAll(/'([^']+)'/g)
  for (const match of quoted) {
    ids.add(match[1]!)
  }
  return ids
}

/**
 * Insert entries immediately AFTER the opening bracket. Each inserted line
 * carries its own trailing comma so the existing body does not need a
 * comma-guess. See the grok-4.5 single-line array breakage.
 *
 * Every insert helper throws when its anchor is missing: the constants are
 * already in the file, and nothing would reference them.
 */
function addToArray(
  content: string,
  arrayName: string,
  entries: Array<string>,
  arrayRef: string,
): string {
  const decl = `export const ${arrayName} = `
  const declIndex = content.indexOf(decl)
  const afterDecl = declIndex === -1 ? -1 : declIndex + decl.length
  const bracket = afterDecl === -1 ? -1 : content.indexOf('[', afterDecl)
  if (declIndex === -1 || bracket === -1 || bracket - afterDecl > 40) {
    throw new Error(`Could not find array '${arrayName}' in file`)
  }

  const newEntries = entries
    .map((constName) => `  ${constName}${arrayRef},`)
    .join('\n')
  const insertAt = bracket + 1
  return `${content.slice(0, insertAt)}\n${newEntries}${content.slice(insertAt)}`
}

function addToTypeMap(
  content: string,
  typeName: string,
  entries: Array<string>,
): string {
  const pattern = new RegExp(
    `(export type ${typeName} = \\{[\\s\\S]*?)(\\n\\})`,
  )
  const match = pattern.exec(content)
  if (!match) {
    throw new Error(`Could not find type map '${typeName}' in file`)
  }

  const newEntries = entries.join('\n')
  return content.replace(pattern, () => `${match[1]}\n${newEntries}${match[2]}`)
}

function addToObjectMap(
  content: string,
  mapName: string,
  entries: Array<string>,
): string {
  const pattern = new RegExp(
    `(const ${mapName}: Record<string, number> = \\{[\\s\\S]*?)(\\n\\})`,
  )
  const match = pattern.exec(content)
  if (!match) {
    throw new Error(`Could not find object map '${mapName}' in file`)
  }

  const newEntries = entries.join('\n')
  return content.replace(pattern, () => `${match[1]}\n${newEntries}${match[2]}`)
}

interface ChatModelInsert {
  constName: string
  providerOptionsEntry: string
  hasMaxOutputTokens: boolean
  /** Anthropic: add to the combined tools + output_config.format set. */
  acceptsCombinedToolsAndSchema?: boolean
}

interface ChatModelCatalogInsertConfig {
  chatArrayName: string
  arrayRef: ArrayRef
  providerOptionsTypeName: string
  inputModalitiesTypeName: string
  toolCapabilitiesTypeName?: string
  maxOutputTokensMapName?: string
  combinedToolsAndSchemaSetName?: string
  providerOptionsIsMappedType: boolean
}

/**
 * Write a new chat model into the catalog tables the adapter types read:
 * the exported id array, provider-options map, input-modalities map,
 * tool-capabilities map, and (Anthropic) max-output-tokens object.
 */
export function applyChatModelCatalogInserts(
  content: string,
  config: ChatModelCatalogInsertConfig,
  chatModels: Array<ChatModelInsert>,
): string {
  if (chatModels.length === 0) return content

  let next = addToArray(
    content,
    config.chatArrayName,
    chatModels.map(({ constName }) => constName),
    config.arrayRef,
  )

  if (!config.providerOptionsIsMappedType) {
    next = addToTypeMap(
      next,
      config.providerOptionsTypeName,
      chatModels.map(
        ({ constName, providerOptionsEntry }) =>
          `  [${constName}${config.arrayRef}]: ${providerOptionsEntry}`,
      ),
    )
  }

  next = addToTypeMap(
    next,
    config.inputModalitiesTypeName,
    chatModels.map(
      ({ constName }) =>
        `  [${constName}${config.arrayRef}]: typeof ${constName}.supports.input`,
    ),
  )

  if (config.toolCapabilitiesTypeName) {
    next = addToTypeMap(
      next,
      config.toolCapabilitiesTypeName,
      chatModels.map(
        ({ constName }) =>
          `  [${constName}${config.arrayRef}]: typeof ${constName}.supports.tools`,
      ),
    )
  }

  if (config.combinedToolsAndSchemaSetName) {
    const combined = chatModels.filter(
      ({ acceptsCombinedToolsAndSchema }) => acceptsCombinedToolsAndSchema,
    )
    if (combined.length > 0) {
      next = addToArray(
        next,
        config.combinedToolsAndSchemaSetName,
        combined.map(({ constName }) => constName),
        config.arrayRef,
      )
    }
  }

  if (config.maxOutputTokensMapName) {
    const maxOutputEntries = chatModels
      .filter(({ hasMaxOutputTokens }) => hasMaxOutputTokens)
      .map(
        ({ constName }) =>
          `  [${constName}${config.arrayRef}]: ${constName}.max_output_tokens,`,
      )
    if (maxOutputEntries.length > 0) {
      next = addToObjectMap(
        next,
        config.maxOutputTokensMapName,
        maxOutputEntries,
      )
    }
  }

  return next
}
