import { expect, test } from '@playwright/test'

/**
 * Delivery durability (transport layer) over real HTTP.
 *
 * These exercise the server-side `durability` sink end-to-end: a fresh run is
 * appended to the log and each SSE event is tagged with an `id: runId@seq`
 * offset; a reconnect (native `Last-Event-ID`) or a `?offset` join replays from
 * the log without re-producing.
 *
 * We test only the **producer-alive** path deterministically (the log is fully
 * written by the first request). The **producer-dead** case — where the client
 * disconnects mid-run and the producer process is torn down with it — cannot be
 * resumed by the log alone; it needs the producer to outlive the socket
 * (`waitUntil` / durable object / queue), which is a per-platform deployment
 * concern, not something this transport can guarantee. The client-side
 * auto-reconnect (Last-Event-ID resend + de-dupe) is covered by unit tests in
 * `@tanstack/ai-client`.
 */

interface SseEvent {
  id?: string
  data: unknown
}

function parseSse(body: string): Array<SseEvent> {
  return body
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const lines = block.split('\n')
      const idLine = lines.find((l) => l.startsWith('id:'))
      const dataLine = lines.find((l) => l.startsWith('data:'))
      const rawData = dataLine
        ? dataLine.slice(dataLine.indexOf(':') + 1).trim()
        : ''
      return {
        ...(idLine ? { id: idLine.slice(idLine.indexOf(':') + 1).trim() } : {}),
        data: JSON.parse(rawData),
      }
    })
}

function eventType(e: SseEvent): string {
  return (e.data as { type: string }).type
}

function contentDeltas(events: Array<SseEvent>): Array<string> {
  return events
    .filter((e) => eventType(e) === 'TEXT_MESSAGE_CONTENT')
    .map((e) => (e.data as { delta: string }).delta)
}

test.describe('delivery durability', () => {
  test('disconnect → reconnect resumes the ordered stream exactly once', async ({
    request,
  }) => {
    // Fresh run: produce + persist the full ordered sequence.
    const produce = await request.post('/api/durable-delivery', { data: {} })
    expect(produce.ok()).toBeTruthy()
    const produced = parseSse(await produce.text())

    // Sequence: RUN_STARTED(1), content 1..5 (seq 2..6), RUN_FINISHED(7).
    expect(contentDeltas(produced)).toEqual(['1', '2', '3', '4', '5'])
    expect(produced.every((e) => e.id !== undefined)).toBeTruthy()

    // Client received through seq 3 (RUN_STARTED, content "1", content "2")
    // then dropped. Reconnect from that offset via native Last-Event-ID.
    const resumeFrom = produced[2]!.id!
    const reconnect = await request.post('/api/durable-delivery', {
      headers: { 'Last-Event-ID': resumeFrom },
      data: {},
    })
    expect(reconnect.ok()).toBeTruthy()
    const resumed = parseSse(await reconnect.text())

    // Exactly the tail, in order, exactly once — content "3","4","5" then RUN_FINISHED.
    expect(contentDeltas(resumed)).toEqual(['3', '4', '5'])
    expect(eventType(resumed[resumed.length - 1]!)).toBe('RUN_FINISHED')
    // Every resumed offset is strictly after the resume point (no replay overlap).
    const resumeSeq = Number(resumeFrom.slice(resumeFrom.lastIndexOf('@') + 1))
    for (const e of resumed) {
      const seq = Number(e.id!.slice(e.id!.lastIndexOf('@') + 1))
      expect(seq).toBeGreaterThan(resumeSeq)
    }
  })

  test('a second tab joins an existing run from the start', async ({
    request,
  }) => {
    const produce = await request.post('/api/durable-delivery', { data: {} })
    const produced = parseSse(await produce.text())
    const firstId = produced[0]!.id!
    const runId = firstId.slice(0, firstId.lastIndexOf('@'))

    // Join from the start with ?offset=-1 (a fresh tab attaching to the run).
    const join = await request.get(
      `/api/durable-delivery?offset=-1&runId=${encodeURIComponent(runId)}`,
    )
    expect(join.ok()).toBeTruthy()
    const joined = parseSse(await join.text())

    expect(contentDeltas(joined)).toEqual(['1', '2', '3', '4', '5'])
    expect(eventType(joined[0]!)).toBe('RUN_STARTED')
    expect(eventType(joined[joined.length - 1]!)).toBe('RUN_FINISHED')
  })
})
