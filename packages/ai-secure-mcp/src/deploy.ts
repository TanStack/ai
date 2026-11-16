import type { ClientRecord } from './types'

/** What the preflight reads to decide whether the server is safe to expose. */
export interface PreflightInput {
  clients: ReadonlyArray<ClientRecord>
  /** True when egress is deny-by-default (an allowlist is set). */
  egressDenyByDefault: boolean
  /** True when the audit log is on. */
  auditOn: boolean
  /** True when a real notifier is set (not the silent one). */
  notifierOn: boolean
}

/** The result of a preflight: the problems that make public exposure unsafe. */
export interface PreflightResult {
  ok: boolean
  problems: Array<string>
}

const HASH = /^[0-9a-f]{64}$/

/**
 * Checks the secure-by-default rules before the server goes public. It returns
 * the problems; the caller refuses a public funnel while any remain.
 */
export function preflight(input: PreflightInput): PreflightResult {
  const problems: Array<string> = []
  if (input.clients.length === 0) {
    problems.push('No clients are configured, so no token can authenticate.')
  }
  for (const client of input.clients) {
    if (!HASH.test(client.tokenHash)) {
      problems.push(
        `Client "${client.id}" has a token that is not a SHA-256 hash.`,
      )
    }
  }
  if (!input.egressDenyByDefault) {
    problems.push('Egress is not deny-by-default. Set an egress allowlist.')
  }
  if (!input.auditOn) {
    problems.push('The audit log is off. Turn it on before you go public.')
  }
  if (!input.notifierOn) {
    problems.push('The notifier is off. Turn it on before you go public.')
  }
  return { ok: problems.length === 0, problems }
}

/**
 * Builds the Tailscale command to expose the server. The default is Serve,
 * which is tailnet-only. Funnel is public: opt into it on purpose.
 *
 * The Funnel URL is not a secret. Auth stands on its own, so no security may
 * depend on the URL being unguessable.
 *
 * @param options.port - The local port the server listens on
 * @param options.public - Use Funnel (public) instead of Serve (tailnet-only)
 */
export function tailscaleCommand(options: {
  port: number
  public?: boolean
}): { command: string; note: string } {
  const target = `http://127.0.0.1:${options.port}`
  if (options.public === true) {
    return {
      command: `tailscale funnel --bg --https=443 ${target}`,
      note: 'Public on the internet. The URL is not a secret; auth stands on its own.',
    }
  }
  return {
    command: `tailscale serve --bg --https=443 ${target}`,
    note: 'Reachable only on your tailnet. Use { public: true } to go public.',
  }
}
