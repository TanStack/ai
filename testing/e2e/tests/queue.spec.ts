import { test, expect } from './fixtures'
import { sendMessage, waitForAssistantText, featureUrl } from './helpers'

// Fixture: fixtures/queue/basic.json
// - "[queue] first message" streams slowly (tps: 6, chunkSize: 2) so the run
//   stays in flight long enough to send follow-up messages while it streams.
// - "[queue] third message" resolves immediately.
// "[queue] second message" has no fixture on purpose — it's cancelled before
// it ever drains, so if a regression let it send anyway the request would
// fail to match and the test would fail loudly instead of silently passing.

test.describe('client message queue', () => {
  test('queues messages sent while streaming, supports cancel, and drains FIFO', async ({
    page,
    testId,
    aimockPort,
  }) => {
    // A's fixture streams slowly on purpose (see fixtures/queue/basic.json)
    // so there's a window to send/cancel queued messages; give the whole
    // scenario more room than the default 30s test timeout.
    test.setTimeout(60_000)

    await page.goto(featureUrl('openai', 'chat', testId, aimockPort))

    // Send A and wait for its stream to start.
    await sendMessage(page, '[queue] first message')
    await page
      .getByTestId('loading-indicator')
      .waitFor({ state: 'visible', timeout: 10_000 })

    // While A is still streaming, send B then C. Both should be queued
    // rather than starting a second concurrent request.
    await sendMessage(page, '[queue] second message')
    await sendMessage(page, '[queue] third message')

    const queued = page.getByTestId('queued-message')
    await expect(queued).toHaveCount(2)
    await expect(queued.nth(0)).toContainText('second message')
    await expect(queued.nth(1)).toContainText('third message')

    // The queue region is distinct from the delivered message list — only
    // A's user message has landed there so far.
    await expect(page.getByTestId('user-message')).toHaveCount(1)

    // Cancel B before it drains.
    await queued
      .filter({ hasText: 'second message' })
      .getByTestId('cancel-queued-button')
      .click()

    await expect(queued).toHaveCount(1)
    await expect(queued.first()).toContainText('third message')

    // Let A's stream settle. The queue only auto-drains C once A's run fully
    // completes, and draining adds C's user message immediately (before its
    // own response streams back) — so waiting for a second user message is
    // a reliable settle signal that doesn't fire early on A's own streamed
    // text (which contains the substring "first response" from its very
    // first chunk, long before the run actually finishes).
    await expect(page.getByTestId('user-message')).toHaveCount(2, {
      timeout: 40_000,
    })
    await waitForAssistantText(page, 'first response', 5_000)
    await expect(queued).toHaveCount(0)
    await waitForAssistantText(page, 'third response', 20_000)

    // Final conversation: exactly A and C, in order — B was never sent.
    const userMessages = page.getByTestId('user-message')
    await expect(userMessages).toHaveCount(2)
    await expect(userMessages.nth(0)).toContainText('first message')
    await expect(userMessages.nth(1)).toContainText('third message')
    await expect(
      page.getByTestId('user-message').filter({ hasText: 'second message' }),
    ).toHaveCount(0)

    const assistantMessages = page.getByTestId('assistant-message')
    await expect(assistantMessages).toHaveCount(2)
    await expect(assistantMessages.nth(0)).toContainText('first response')
    await expect(assistantMessages.nth(1)).toContainText('third response')

    // Cross-check ordering across the whole transcript, not just per-role
    // counts — proves A's turn fully precedes C's turn in the DOM.
    const transcript = await page.getByTestId('message-list').innerText()
    const iFirstMsg = transcript.indexOf('first message')
    const iFirstResp = transcript.indexOf('first response')
    const iThirdMsg = transcript.indexOf('third message')
    const iThirdResp = transcript.indexOf('third response')
    expect(iFirstMsg).toBeGreaterThanOrEqual(0)
    expect(iFirstResp).toBeGreaterThan(iFirstMsg)
    expect(iThirdMsg).toBeGreaterThan(iFirstResp)
    expect(iThirdResp).toBeGreaterThan(iThirdMsg)
    expect(transcript).not.toContain('second message')
  })
})
