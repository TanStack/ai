import { defineActivityType } from '@tanstack/ai'
import { z } from 'zod'

/**
 * Step `step` of `total` of a deploy. These routes share it:
 *
 * - `/api/activity-test` emits it from its `deploy` tool, and
 *   `/activity-test` reads its typed content.
 * - `/api/harness-protocol/$` emits it from `deployWithProgress`, one of the
 *   harness protocol tools. `harness-protocol-tools.ts` exports it with them.
 * - `/api/sandbox-bridge-activity` emits it from a tool that runs over the
 *   sandbox tool bridge.
 */
export const deployProgress = defineActivityType({
  activityType: 'deploy.progress',
  contentSchema: z.object({ step: z.number(), total: z.number() }),
})
