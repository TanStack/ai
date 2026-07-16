import { readFile } from 'node:fs/promises'
import type { ToolsetConfig } from './types'

export const DEFAULT_CONFIG_PATH = '.github/maintainers.json'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(message: string): never {
  throw new Error(`Invalid maintainers config: ${message}`)
}

export function parseConfig(raw: unknown): ToolsetConfig {
  if (!isRecord(raw)) fail('root must be an object')
  const { repo, maintainers, sla, spam, botAllowlist, maxCommentsPerRun } = raw

  if (typeof repo !== 'string' || !repo.includes('/')) {
    fail('"repo" must be an "owner/name" string')
  }
  if (!Array.isArray(maintainers) || maintainers.length === 0) {
    fail('"maintainers" must be a non-empty array')
  }
  const parsedMaintainers = maintainers.map((m, idx) => {
    if (!isRecord(m)) fail(`maintainers[${idx}] must be an object`)
    if (typeof m.github !== 'string' || m.github.length === 0) {
      fail(`maintainers[${idx}].github must be a string`)
    }
    if (!Array.isArray(m.areas) || m.areas.some((a) => typeof a !== 'string')) {
      fail(`maintainers[${idx}].areas must be an array of glob strings`)
    }
    return {
      github: m.github,
      discord: typeof m.discord === 'string' ? m.discord : null,
      areas: m.areas as Array<string>,
      maxOpenAssignments:
        typeof m.maxOpenAssignments === 'number' ? m.maxOpenAssignments : 10,
    }
  })

  if (!isRecord(sla)) fail('"sla" must be an object')
  const slaNumber = (key: string): number => {
    const v = sla[key]
    if (typeof v !== 'number' || v <= 0)
      fail(`sla.${key} must be a positive number`)
    return v
  }
  if (!isRecord(spam)) fail('"spam" must be an object')
  const spamNumber = (key: string): number => {
    const v = spam[key]
    if (typeof v !== 'number' || v <= 0)
      fail(`spam.${key} must be a positive number`)
    return v
  }

  return {
    repo,
    maintainers: parsedMaintainers,
    sla: {
      firstResponseHours: slaNumber('firstResponseHours'),
      followUpResponseHours: slaNumber('followUpResponseHours'),
      staleAuthorDays: slaNumber('staleAuthorDays'),
    },
    spam: {
      maxAccountAgeDays: spamNumber('maxAccountAgeDays'),
      maxChangedLines: spamNumber('maxChangedLines'),
    },
    botAllowlist: Array.isArray(botAllowlist)
      ? botAllowlist.filter((b): b is string => typeof b === 'string')
      : [],
    maxCommentsPerRun:
      typeof maxCommentsPerRun === 'number' ? maxCommentsPerRun : 25,
  }
}

export async function loadConfig(
  path: string = DEFAULT_CONFIG_PATH,
): Promise<ToolsetConfig> {
  const text = await readFile(path, 'utf8')
  return parseConfig(JSON.parse(text))
}

export function rosterLogins(config: ToolsetConfig): Set<string> {
  return new Set(config.maintainers.map((m) => m.github.toLowerCase()))
}

export function isRosterMaintainer(
  login: string | null,
  config: ToolsetConfig,
): boolean {
  return login !== null && rosterLogins(config).has(login.toLowerCase())
}

export function isBotLogin(
  login: string | null,
  config: ToolsetConfig,
): boolean {
  if (login === null) return false
  const normalized = login.toLowerCase().replace(/\[bot\]$/, '')
  return (
    login.toLowerCase().endsWith('[bot]') ||
    normalized.startsWith('app/') ||
    config.botAllowlist.some((b) => b.toLowerCase() === normalized)
  )
}
