import { expect, test } from '@playwright/test'
import type { ActivitySnapshotEvent } from '@tanstack/ai'

/**
 * A tool that runs over the sandbox tool bridge sends an activity with
 * `context.emitActivity`. The activity must get to the `chat()` stream of a
 * real harness adapter.
 *
 * The route runs `claudeCodeText` in a local-process sandbox with a fake
 * `claude` program, so the run has no LLM and no aimock.
 */
interface BridgeActivityResult {
  activities: Array<
    Pick<ActivitySnapshotEvent, 'messageId' | 'activityType' | 'content'>
  >
  errors: Array<string>
}

test('the activity of a bridged tool gets to the chat() stream', async ({
  request,
}) => {
  const response = await request.post('/api/sandbox-bridge-activity')
  expect(response.ok()).toBe(true)
  const body: BridgeActivityResult = await response.json()

  expect(body.errors).toEqual([])
  // `withSandbox` streams `sandbox.status` rows too. Keep only the tool row.
  const bridged = body.activities.filter(
    (activity) => activity.messageId === 'bridge-1',
  )
  expect(bridged).toEqual([
    {
      messageId: 'bridge-1',
      activityType: 'deploy.progress',
      content: { step: 1, total: 1 },
    },
  ])
})
