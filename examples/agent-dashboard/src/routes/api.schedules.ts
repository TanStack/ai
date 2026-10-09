import { createFileRoute } from '@tanstack/react-router'
import { isValidCron } from '@/server/cron'
import { newId, schedules } from '@/server/injection'
import { computeNextFire, startScheduler } from '@/server/scheduler'
import type { Schedule } from '@/server/injection'
import '@/server/meta'

function serialize(schedule: Schedule) {
  const upcoming: Array<number> = []
  if (schedule.enabled) {
    let from = Date.now()
    for (let index = 0; index < 3; index++) {
      const next = computeNextFire(schedule, from)
      if (!next) break
      upcoming.push(next)
      from = next
    }
  }
  return { ...schedule, upcoming }
}

// The schedule table. Server-owned (the dashboard owns the clock), so schedules
// live here and the UI reads/writes them over this route.
export const Route = createFileRoute('/api/schedules')({
  server: {
    handlers: {
      GET: ({ request }) => {
        startScheduler()
        const params = new URL(request.url).searchParams
        const channelId = params.get('channelId')
        const threadIds = params.getAll('threadId')
        const all = [...schedules.values()]
        const rows = all.filter(
          (schedule) =>
            (!channelId || schedule.channelId === channelId) &&
            (threadIds.length === 0 || threadIds.includes(schedule.threadId)),
        )
        return Response.json({ schedules: rows.map(serialize) })
      },
      POST: async ({ request }) => {
        startScheduler()
        const body = (await request.json()) as Partial<Schedule> & {
          id?: string
        }
        // Update (enable/disable, edit) when an id is given.
        if (body.id && schedules.has(body.id)) {
          const existing = schedules.get(body.id)!
          const updated: Schedule = { ...existing, ...body, id: existing.id }
          updated.nextFire = updated.enabled
            ? computeNextFire(updated, Date.now())
            : undefined
          schedules.set(updated.id, updated)
          return Response.json({ schedule: serialize(updated) })
        }
        // Create.
        if (!body.threadId || !body.channelId || !body.tool) {
          return Response.json(
            { error: 'threadId, channelId and tool required' },
            { status: 400 },
          )
        }
        if (body.cron && !isValidCron(body.cron)) {
          return Response.json({ error: 'invalid cron' }, { status: 400 })
        }
        if (!body.cron && !body.everySeconds) {
          return Response.json(
            { error: 'cron or everySeconds required' },
            { status: 400 },
          )
        }
        const schedule: Schedule = {
          id: newId('sched'),
          threadId: body.threadId,
          channelId: body.channelId,
          tool: body.tool,
          args: body.args ?? {},
          ...(body.cron ? { cron: body.cron } : {}),
          ...(body.everySeconds ? { everySeconds: body.everySeconds } : {}),
          enabled: body.enabled ?? true,
        }
        schedule.nextFire = schedule.enabled
          ? computeNextFire(schedule, Date.now())
          : undefined
        schedules.set(schedule.id, schedule)
        return Response.json({ schedule: serialize(schedule) })
      },
      DELETE: ({ request }) => {
        const id = new URL(request.url).searchParams.get('id')
        if (id) schedules.delete(id)
        return Response.json({ ok: true })
      },
    },
  },
})
