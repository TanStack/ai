/**
 * Optional: show this host's agents in a self-hosted `@tanstack/ai-dashboard`
 * relay as well. Set `DASHBOARD_RELAY_URL` (for example
 * `http://127.0.0.1:8790`). Each agent pairs once: approve the code that the
 * server log shows. The host tokens are saved in the state file.
 *
 * Server-only.
 */
import { connectDashboard } from '@tanstack/ai-dashboard/connect'
import { getHost, harnessRegistry, listThreads } from './harness'
import { fileMap } from './store'

const tokens = fileMap<string>('relayTokens')

export async function connectRelay(url: string): Promise<void> {
  const threads = await listThreads()
  for (const harness of Object.values(harnessRegistry)) {
    await connectDashboard({
      host: getHost(),
      harness,
      url,
      name: `agent-dashboard · ${harness.name}`,
      threads: threads
        .filter((thread) => thread.harness === harness.name)
        .map((thread) => thread.id),
      ...(tokens.get(harness.name) ? { token: tokens.get(harness.name) } : {}),
      onPairingCode: (code) =>
        console.log(
          `[dashboard] approve ${code} in the relay (${harness.name})`,
        ),
      onToken: (token) => tokens.set(harness.name, token),
      onError: (error) =>
        console.error(`[dashboard] relay (${harness.name}): ${error.message}`),
    })
  }
}
