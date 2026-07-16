/**
 * Renders a Scorecard into Discord webhook messages (embeds) and posts them.
 * Rendering is pure; posting takes an injected fetch.
 */

import { formatDuration } from './metrics'
import type { Scorecard } from './metrics'

const MAX_LINES_PER_SECTION = 12
const MAX_EMBED_DESCRIPTION = 4000
const MAX_EMBEDS_PER_MESSAGE = 10
const MAX_MESSAGE_CHARS = 5500

export interface DiscordEmbed {
  title: string
  description: string
  color: number
}

interface TriageLike {
  item: { number: number; title: string; url: string; assignees: Array<string> }
  unansweredHours?: number | null
}

function shortTitle(title: string): string {
  return title.length > 60 ? `${title.slice(0, 57)}…` : title
}

function itemLine(t: TriageLike, note?: string): string {
  const assignee =
    t.item.assignees.length > 0 ? ` · @${t.item.assignees.join(', @')}` : ''
  const suffix = note ? ` — ${note}` : ''
  return `[#${t.item.number}](${t.item.url}) ${shortTitle(t.item.title)}${suffix}${assignee}`
}

function section(lines: Array<string>): string {
  if (lines.length === 0) return '_Nothing — all clear!_ 🎉'
  const shown = lines.slice(0, MAX_LINES_PER_SECTION)
  if (lines.length > shown.length) {
    shown.push(`…and ${lines.length - shown.length} more`)
  }
  return shown.join('\n').slice(0, MAX_EMBED_DESCRIPTION)
}

function mention(github: string, discord: string | null): string {
  return discord ? `<@${discord}>` : `**${github}**`
}

function delta(n: number): string {
  if (n > 0) return `(+${n} vs 7d ago)`
  if (n < 0) return `(${n} vs 7d ago)`
  return '(±0 vs 7d ago)'
}

export function buildScorecardEmbeds(
  scorecard: Scorecard,
  repo: string,
): Array<DiscordEmbed> {
  const s = scorecard.stats
  const embeds: Array<DiscordEmbed> = []

  embeds.push({
    title: `🔴 Answer these — waiting on us past SLA (${scorecard.answerThese.length})`,
    color: 0xd93f0b,
    description: section(
      scorecard.answerThese.map((t) =>
        itemLine(t, `waiting **${formatDuration(t.unansweredHours ?? 0)}**`),
      ),
    ),
  })

  embeds.push({
    title: `✅ Ready to merge (${scorecard.readyToMerge.length})`,
    color: 0x0e8a16,
    description: section(scorecard.readyToMerge.map((t) => itemLine(t))),
  })

  const queueLines = scorecard.perMaintainer.map((q) => {
    const fresh =
      q.freshReplies.length > 0
        ? ` — **${q.freshReplies.length} with fresh replies**: ${q.freshReplies
            .slice(0, 4)
            .map((t) => `[#${t.item.number}](${t.item.url})`)
            .join(' ')}`
        : ''
    return `${mention(q.github, q.discord)}: ${q.assignedPRs.length} PRs, ${q.assignedIssues.length} issues${fresh}`
  })
  embeds.push({
    title: '👀 Your queue',
    color: 0x1d76db,
    description: section(queueLines),
  })

  const newLines = [
    ...scorecard.newPRs.map((t) =>
      itemLine(
        t,
        `new PR${t.firstTimeContributor ? ' · 🍃 first-time contributor' : ''}`,
      ),
    ),
    ...scorecard.newIssues.map((t) => itemLine(t, 'new issue')),
    ...scorecard.newDiscussions.map(
      (t) =>
        `[#${t.item.number}](${t.item.url}) ${shortTitle(t.item.title)} — new discussion`,
    ),
  ]
  const flaggedLines = scorecard.flagged.map((t) =>
    itemLine(t, `⚠️ needs human judgment: ${t.spamReasons.join(', ')}`),
  )
  embeds.push({
    title: `🆕 New in the last 24h (${newLines.length})`,
    color: 0x5319e7,
    description: section([...newLines, ...flaggedLines]),
  })

  const staleLines = scorecard.stale.map((t) =>
    itemLine(t, 'waiting on author — nudge or close?'),
  )
  const discussionLines = scorecard.discussionsNeedingAttention
    .slice(0, 6)
    .map(
      (t) =>
        `[#${t.item.number}](${t.item.url}) ${shortTitle(t.item.title)} — unanswered **${formatDuration(t.waitingHours)}**`,
    )
  embeds.push({
    title: `💤 Going stale (${scorecard.stale.length}) · 💬 Discussions (${scorecard.discussionsNeedingAttention.length})`,
    color: 0xcccccc,
    description: section([...staleLines, ...discussionLines]),
  })

  const statLines = [
    `Open PRs: **${s.openPRs}** ${delta(s.openPRsDelta7d)} · Open issues: **${s.openIssues}** ${delta(s.openIssuesDelta7d)}`,
    `Merged last 24h: **${s.mergedLast24h}** · Issues closed: **${s.issuesClosedLast24h}**`,
    s.medianFirstResponseHours === null
      ? 'First response (7d): _no samples yet_'
      : `First response (7d, n=${s.firstResponseSampleSize}): median **${formatDuration(s.medianFirstResponseHours)}**, p90 **${formatDuration(s.p90FirstResponseHours ?? 0)}** · ${s.awaitingFirstResponse} still waiting`,
    `PRs assigned: **${s.pctPRsAssigned}%** · Bot PRs open: ${s.botPRs} · Pending changesets: ${s.pendingChangesets}`,
  ]
  if (scorecard.clusters.length > 0) {
    statLines.push(
      `📚 PR clusters: ${scorecard.clusters
        .map((c) => `${c.author} (${c.count})`)
        .join(', ')} — consider batch-reviewing`,
    )
  }
  if (scorecard.unassignable.length > 0) {
    statLines.push(
      `🤷 Unassignable (everyone at cap): ${scorecard.unassignable
        .map((t) => `[#${t.item.number}](${t.item.url})`)
        .join(' ')}`,
    )
  }
  embeds.push({
    title: `📊 Scorecard — ${repo}`,
    color: 0x0052cc,
    description: section(statLines),
  })

  return embeds
}

/** Split embeds into webhook-sized messages (count + character limits). */
export function chunkEmbeds(
  embeds: Array<DiscordEmbed>,
): Array<Array<DiscordEmbed>> {
  const messages: Array<Array<DiscordEmbed>> = []
  let current: Array<DiscordEmbed> = []
  let currentChars = 0
  for (const embed of embeds) {
    const size = embed.title.length + embed.description.length
    if (
      current.length > 0 &&
      (current.length >= MAX_EMBEDS_PER_MESSAGE ||
        currentChars + size > MAX_MESSAGE_CHARS)
    ) {
      messages.push(current)
      current = []
      currentChars = 0
    }
    current.push(embed)
    currentChars += size
  }
  if (current.length > 0) messages.push(current)
  return messages
}

export async function postToDiscord(
  webhookUrl: string,
  embeds: Array<DiscordEmbed>,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  for (const chunk of chunkEmbeds(embeds)) {
    const response = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        embeds: chunk,
        allowed_mentions: { parse: ['users'] },
      }),
    })
    if (!response.ok) {
      throw new Error(
        `Discord webhook HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
      )
    }
  }
}
