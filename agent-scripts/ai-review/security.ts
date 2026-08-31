/**
 * Host-side malware scan for a PR file list. High-confidence alerts only.
 * A clean scan is required before the bot adds `secure` or approves workflows.
 */

export type PullFile = { path: string; patch: string | null }

const BINARY_PATH = /\.(?:exe|dll|so|dylib|scr|bat|cmd|ps1)$/i
const PIPE_SHELL =
  /(?:curl|wget|fetch)\b[^\n]{0,200}\|\s*(?:\S*\/)?(?:ba)?sh\b/i
const POWERSHELL_ENC = /powershell(?:\.exe)?[^\n]{0,80}-enc(?:odedcommand)?\b/i
const REVERSE_SHELL = /\/dev\/tcp\/|bash\s+-i\s+>&\s*\/dev\/tcp/i
const LIFECYCLE = /"(?:preinstall|postinstall|prepublishOnly)"\s*:\s*"([^"]*)"/g
const NETWORK =
  /https?:\/\/|curl\b|wget\b|invoke-webrequest\b|node\s+-e\b|git\s+clone\b/i

function addedText(patch: string | null) {
  if (patch === null) return ''
  const lines = []
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.push(line.slice(1))
    }
  }
  return lines.join('\n')
}

function isWorkflowPath(path: string) {
  return (
    path.startsWith('.github/workflows/') ||
    path.endsWith('/action.yml') ||
    path.endsWith('/action.yaml') ||
    path === 'action.yml' ||
    path === 'action.yaml'
  )
}

function isPackageJson(path: string) {
  return /(^|\/)package\.json$/.test(path)
}

/**
 * Return alert reasons for malware-shaped changes. Empty means clean.
 */
export function scanPullSecurity(files: Array<PullFile>) {
  const reasons = []
  for (const file of files) {
    if (BINARY_PATH.test(file.path)) {
      reasons.push(`${file.path}: new binary or script payload`)
      continue
    }
    const added = addedText(file.patch)
    if (isWorkflowPath(file.path)) {
      reasons.push(`${file.path}: changes a workflow`)
      if (added.includes('pull_request_target')) {
        reasons.push(`${file.path}: adds pull_request_target`)
      }
    }
    if (added.length === 0) continue
    if (
      PIPE_SHELL.test(added) ||
      POWERSHELL_ENC.test(added) ||
      REVERSE_SHELL.test(added)
    ) {
      reasons.push(`${file.path}: shell download or reverse shell`)
    }
    if (isPackageJson(file.path)) {
      for (const match of added.matchAll(LIFECYCLE)) {
        const script = match[1] ?? ''
        if (NETWORK.test(script)) {
          reasons.push(`${file.path}: ${match[0]} fetches the network`)
        }
      }
    }
  }
  return { ok: reasons.length === 0, reasons }
}
