import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const docsRoot = resolve(__dirname, '../docs')
const configPath = resolve(docsRoot, 'config.json')

// Folders to ignore when crawling
const IGNORED_FOLDERS = ['framework', 'protocol', 'reference']

// Define the preferred order of sections (folders not listed here will be appended at the end)
const SECTION_ORDER = ['getting-started', 'guides', 'api', 'adapters']

// Special label overrides for specific folder names
const LABEL_OVERRIDES: Record<string, string> = {
  api: 'API',
}

interface DocChild {
  label: string
  to: string
  order?: number
}

interface DocSection {
  label: string
  children: Array<DocChild>
  collapsible?: boolean
  defaultCollapsed?: boolean
}

interface DocConfig {
  $schema?: string
  docSearch?: {
    appId: string
    apiKey: string
    indexName: string
  }
  sections: Array<DocSection>
}

interface FrontmatterData {
  title: string | null
  order: number | null
}

/**
 * Converts a folder name to a label (e.g., "getting-started" -> "Getting Started")
 */
function folderNameToLabel(folderName: string): string {
  // Check for override first
  if (LABEL_OVERRIDES[folderName]) {
    return LABEL_OVERRIDES[folderName]
  }

  return folderName
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Extracts the title and order from frontmatter in a markdown file
 */
function extractFrontmatterData(filePath: string): FrontmatterData {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)

    if (!frontmatterMatch) {
      return { title: null, order: null }
    }

    const frontmatter = frontmatterMatch[1]
    const titleMatch = frontmatter?.match(/^title:\s*(.+)$/m)
    const orderMatch = frontmatter?.match(/^order:\s*(\d+)$/m)

    let title: string | null = null
    if (titleMatch && titleMatch[1]) {
      // Remove quotes if present
      title = titleMatch[1].replace(/^["']|["']$/g, '').trim()
    }

    let order: number | null = null
    if (orderMatch && orderMatch[1]) {
      order = parseInt(orderMatch[1], 10)
    }

    return { title, order }
  } catch {
    return { title: null, order: null }
  }
}

/**
 * Gets all markdown files in a directory and generates children entries
 */
function getChildrenFromFolder(
  folderPath: string,
  folderName: string,
): Array<DocChild> {
  const children: Array<DocChild> = []

  try {
    const files = readdirSync(folderPath)

    for (const file of files) {
      const filePath = join(folderPath, file)
      const stat = statSync(filePath)

      if (stat.isFile() && extname(file) === '.md') {
        const fileNameWithoutExt = basename(file, '.md')
        const { title, order } = extractFrontmatterData(filePath)

        const child: DocChild = {
          label: title || folderNameToLabel(fileNameWithoutExt),
          to: `${folderName}/${fileNameWithoutExt}`,
        }

        if (order !== null) {
          child.order = order
        }

        children.push(child)
      }
    }

    // Sort children by order (items with order come first, sorted by order value)
    // Items without order go at the end in arbitrary order
    children.sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order
      }
      if (a.order !== undefined) {
        return -1
      }
      if (b.order !== undefined) {
        return 1
      }
      return 0
    })

    // Remove order property from children before returning (it's only used for sorting)
    return children.map(({ label, to }) => ({ label, to }))
  } catch (error) {
    console.error(`Error reading folder ${folderPath}:`, error)
  }

  return children
}

/**
 * Crawls the docs folder and generates sections
 */
function generateSections(): Array<DocSection> {
  const sectionsMap = new Map<string, DocSection>()

  try {
    const entries = readdirSync(docsRoot)

    for (const entry of entries) {
      const entryPath = join(docsRoot, entry)
      const stat = statSync(entryPath)

      // Skip if not a directory, is ignored, or is a special file
      if (
        !stat.isDirectory() ||
        IGNORED_FOLDERS.includes(entry) ||
        entry.startsWith('.')
      ) {
        continue
      }

      const children = getChildrenFromFolder(entryPath, entry)

      if (children.length > 0) {
        sectionsMap.set(entry, {
          label: folderNameToLabel(entry),
          children,
        })
      }
    }
  } catch (error) {
    console.error('Error crawling docs folder:', error)
  }

  // Sort sections based on SECTION_ORDER
  const sortedSections: Array<DocSection> = []

  // First, add sections in the preferred order
  for (const folderName of SECTION_ORDER) {
    const section = sectionsMap.get(folderName)
    if (section) {
      sortedSections.push(section)
      sectionsMap.delete(folderName)
    }
  }

  // Then, add any remaining sections not in the preferred order
  for (const section of sectionsMap.values()) {
    sortedSections.push(section)
  }

  return sortedSections
}

/**
 * Reads the config.json and updates sections while preserving other fields
 */
function updateConfig(newSections: Array<DocSection>): void {
  let config: DocConfig

  try {
    const configContent = readFileSync(configPath, 'utf-8')
    config = JSON.parse(configContent)
  } catch (error) {
    console.error('Error reading config.json:', error)
    return
  }

  // Get labels of newly generated sections
  const newSectionLabels = new Set(newSections.map((s) => s.label))

  // Filter out old sections that will be replaced by new ones
  const preservedSections = config.sections.filter(
    (section) => !newSectionLabels.has(section.label),
  )

  // Find the insertion point - we want to insert new sections before the reference sections
  // Reference sections typically have "collapsible" property
  const firstCollapsibleIndex = preservedSections.findIndex(
    (s) => s.collapsible,
  )

  let updatedSections: Array<DocSection>

  if (firstCollapsibleIndex === -1) {
    // No collapsible sections, just append new sections
    updatedSections = [...newSections, ...preservedSections]
  } else {
    // Insert new sections before collapsible sections
    updatedSections = [
      ...newSections,
      ...preservedSections.slice(firstCollapsibleIndex),
    ]
  }

  // Update config with new sections
  config.sections = updatedSections

  // Write back to config.json with proper formatting
  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
    console.log('✅ config.json has been updated successfully!')
  } catch (error) {
    console.error('Error writing config.json:', error)
  }
}

/**
 * Main function
 */
function main(): void {
  console.log('🔍 Scanning docs folder...\n')

  const newSections = generateSections()

  console.log('📝 Generated sections:')
  for (const section of newSections) {
    console.log(`  - ${section.label} (${section.children.length} items)`)
  }
  console.log('')

  updateConfig(newSections)
}

main()
