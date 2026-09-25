/**
 * Client-safe picker types for /repo-report.
 * Do not import harness packages here.
 */

export type ReportHarness = 'claude-code' | 'codex' | 'grok' | 'acp'
export type ReportProvider = 'docker' | 'local'
export type ReportAuthMode = 'host' | 'api-key'
export type ReportAgent = 'explainer' | 'package-map' | 'first-hour'

export const REPORT_HARNESSES: Record<ReportHarness, { label: string }> = {
  'claude-code': { label: 'Claude Code' },
  grok: { label: 'Grok Build' },
  acp: { label: 'ACP compatible (Grok)' },
  codex: { label: 'Codex' },
}

export const REPORT_PROVIDERS: Record<ReportProvider, { label: string }> = {
  docker: { label: 'Docker' },
  local: { label: 'Local process' },
}

export const REPORT_AUTH_MODES: Record<ReportAuthMode, { label: string }> = {
  'api-key': { label: 'API key' },
  host: { label: 'Host login' },
}

export const REPORT_AGENTS: Record<
  ReportAgent,
  { label: string; hint: string }
> = {
  explainer: {
    label: 'Explainer',
    hint: 'What this repo is, and who it is for',
  },
  'package-map': {
    label: 'Package map',
    hint: 'Main packages and what each one does',
  },
  'first-hour': {
    label: 'First hour',
    hint: 'Clone, install, and run the first command',
  },
}

export function isReportHarness(value: unknown): value is ReportHarness {
  return typeof value === 'string' && value in REPORT_HARNESSES
}

export function isReportProvider(value: unknown): value is ReportProvider {
  return typeof value === 'string' && value in REPORT_PROVIDERS
}

export function isReportAgent(value: unknown): value is ReportAgent {
  return typeof value === 'string' && value in REPORT_AGENTS
}

export function isReportAuthMode(value: unknown): value is ReportAuthMode {
  return typeof value === 'string' && value in REPORT_AUTH_MODES
}

export const REPORT_REPO = 'TanStack/ai'
