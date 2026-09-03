/**
 * File-mutation helpers for `sync-provider-models.ts`.
 *
 * Kept here so the insert path (chat array + type maps) can be unit-tested
 * without running the full OpenRouter fetch.
 */

type ArrayRef = '.name' | '.id'

export function insertConstants(
  content: string,
  constants: Array<string>,
): string {
  const block = '\n' + constants.join('\n\n') + '\n'
  const exportIndex = content.indexOf('\nexport ')
  if (exportIndex === -1) {
    return content + block
  }
  return content.slice(0, exportIndex) + block + content.slice(exportIndex)
}

/**
 * Insert entries immediately AFTER the opening bracket. Each inserted line
 * carries its own trailing comma so the existing body does not need a
 * comma-guess. See the grok-4.5 single-line array breakage.
 */
function addToArray(
  content: string,
  arrayName: string,
  entries: Array<string>,
  arrayRef: string,
): string {
  const open = `export const ${arrayName} = [`
  const openIndex = content.indexOf(open)
  if (openIndex === -1) {
    console.warn(`  Warning: Could not find array '${arrayName}' in file`)
    return content
  }

  const newEntries = entries
    .map((constName) => `  ${constName}${arrayRef},`)
    .join('\n')
  const insertAt = openIndex + open.length
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
    console.warn(`  Warning: Could not find type map '${typeName}' in file`)
    return content
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
    console.warn(`  Warning: Could not find object map '${mapName}' in file`)
    return content
  }

  const newEntries = entries.join('\n')
  return content.replace(pattern, () => `${match[1]}\n${newEntries}${match[2]}`)
}

interface ChatModelInsert {
  constName: string
  providerOptionsEntry: string
  hasMaxOutputTokens: boolean
}

interface ChatModelCatalogInsertConfig {
  chatArrayName: string
  arrayRef: ArrayRef
  providerOptionsTypeName: string
  inputModalitiesTypeName: string
  toolCapabilitiesTypeName?: string
  maxOutputTokensMapName?: string
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
