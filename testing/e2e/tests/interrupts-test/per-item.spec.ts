import { test, expect } from '../fixtures'
import {
  selectScenario,
  runTest,
  waitForApproval,
  waitForTestComplete,
  getMetadata,
  getEventLog,
} from './helpers'

/**
 * Per-item interrupt resolution — approve / deny / cancel for every single
 * wildlife scenario (server + client × boolean, shared payload, branch
 * payload, edited args). Each case drives one interrupt through
 * `interrupt.resolveInterrupt(...)` / `interrupt.cancel()` bound on the item.
 */

interface SingleScenario {
  id: string
  group: 'server' | 'client'
  tool: string
  /**
   * Proves the (possibly edited) args reached the executor: an event whose
   * `toolName` matches and whose `details` contain the edited value. Server
   * edited-args echoes via a custom event; client edited-args via the client
   * execution-complete event.
   */
  approveEvent?: { toolName: string; contains: string }
}

const SCENARIOS: ReadonlyArray<SingleScenario> = [
  { id: 'admit', group: 'server', tool: 'admitRescue' },
  { id: 'vet', group: 'server', tool: 'scheduleVetCheck' },
  { id: 'adopt', group: 'server', tool: 'finalizeAdoption' },
  {
    id: 'enclosure',
    group: 'server',
    tool: 'assignEnclosure',
    approveEvent: { toolName: 'enclosure:assigned', contains: 'Birch' },
  },
  { id: 'tag', group: 'client', tool: 'printIntakeTag' },
  { id: 'sighting', group: 'client', tool: 'logFieldSighting' },
  { id: 'story', group: 'client', tool: 'shareAdoptionStory' },
  {
    id: 'certificate',
    group: 'client',
    tool: 'printCertificate',
    approveEvent: { toolName: 'printCertificate', contains: '2026-07-22' },
  },
]

test.describe('Per-item interrupt resolution', () => {
  for (const s of SCENARIOS) {
    test(`${s.id} (${s.group}) - approve`, async ({
      page,
      testId,
      aimockPort,
    }) => {
      await selectScenario(page, s.id, testId, aimockPort)
      await runTest(page)
      await waitForApproval(page)
      await page.click('.approve-button')
      await waitForTestComplete(page)

      const meta = await getMetadata(page)
      expect(meta.hasError).toBe('false')
      expect(meta.testComplete).toBe('true')
      expect(parseInt(meta.approvalGrantedCount)).toBe(1)

      if (s.group === 'client') {
        const events = await getEventLog(page)
        expect(
          events.some(
            (e) => e.type === 'execution-complete' && e.toolName === s.tool,
          ),
        ).toBe(true)
      }

      if (s.approveEvent) {
        const events = await getEventLog(page)
        // Some event carrying that toolName must include the edited value —
        // there may be several events for the same toolName (e.g. an
        // approval-granted with no details plus an execution-complete).
        expect(
          events.some(
            (e) =>
              e.toolName === s.approveEvent?.toolName &&
              (e.details ?? '').includes(s.approveEvent.contains),
          ),
        ).toBe(true)
      }
    })

    test(`${s.id} (${s.group}) - deny`, async ({
      page,
      testId,
      aimockPort,
    }) => {
      await selectScenario(page, s.id, testId, aimockPort)
      await runTest(page)
      await waitForApproval(page)
      await page.click('.deny-button')
      await waitForTestComplete(page)

      const meta = await getMetadata(page)
      expect(meta.hasError).toBe('false')
      expect(parseInt(meta.approvalDeniedCount)).toBe(1)
      expect(parseInt(meta.approvalGrantedCount)).toBe(0)

      // A denied tool must not run.
      if (s.group === 'client') {
        const events = await getEventLog(page)
        expect(
          events.some(
            (e) => e.type === 'execution-complete' && e.toolName === s.tool,
          ),
        ).toBe(false)
      }
    })

    test(`${s.id} (${s.group}) - cancel`, async ({
      page,
      testId,
      aimockPort,
    }) => {
      await selectScenario(page, s.id, testId, aimockPort)
      await runTest(page)
      await waitForApproval(page)
      await page.click('.cancel-button')
      await page.waitForTimeout(500)

      const meta = await getMetadata(page)
      expect(meta.hasError).toBe('false')
      expect(parseInt(meta.approvalCancelledCount)).toBe(1)

      // A cancelled tool must not run.
      if (s.group === 'client') {
        const events = await getEventLog(page)
        expect(
          events.some(
            (e) => e.type === 'execution-complete' && e.toolName === s.tool,
          ),
        ).toBe(false)
      }
    })
  }

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      console.log('Metadata:', await getMetadata(page))
      console.log('Events:', await getEventLog(page))
    }
  })
})
