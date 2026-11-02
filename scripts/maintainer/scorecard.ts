/**
 * Daily scorecard — computes the maintainer to-do digest and posts it to a
 * Discord webhook (DISCORD_WEBHOOK_URL). With --dry-run (or when the webhook
 * is not configured) it prints the payload instead of posting.
 *
 * Usage: node scripts/maintainer/scorecard.ts [--dry-run]
 */

import { readdir } from 'node:fs/promises'
import process from 'node:process'
import { classifyAll } from './classify.ts'
import { collectSnapshot } from './collect.ts'
import { loadConfig } from './config.ts'
import { buildScorecardEmbeds, postToDiscord } from './discord.ts'
import { createGitHubClient } from './github.ts'
import { computeScorecard } from './metrics.ts'
import { isDryRun, resolveToken, writeStepSummary } from './env.ts'

async function countPendingChangesets(): Promise<number> {
  try {
    const entries = await readdir('.changeset')
    return entries.filter(
      (f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md',
    ).length
  } catch {
    return 0
  }
}

async function main(): Promise<void> {
  const dryRun = isDryRun()
  const config = await loadConfig()
  const client = createGitHubClient({ token: await resolveToken() })

  console.log(`Collecting snapshot of ${config.repo}…`)
  const now = new Date()
  const snapshot = await collectSnapshot(client, config, now)
  const triage = classifyAll(snapshot, config, now)
  const scorecard = computeScorecard(
    snapshot,
    triage,
    config,
    now,
    await countPendingChangesets(),
  )
  const embeds = buildScorecardEmbeds(scorecard, config.repo)

  const summary = embeds
    .map((e) => `### ${e.title}\n\n${e.description}`)
    .join('\n\n')
  await writeStepSummary(`## Daily scorecard\n\n${summary}`)

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (dryRun || !webhookUrl) {
    if (!webhookUrl && !dryRun) {
      console.warn(
        'DISCORD_WEBHOOK_URL is not set — printing the digest instead of posting.',
      )
    }
    console.log(JSON.stringify(embeds, null, 2))
    return
  }

  await postToDiscord(webhookUrl, embeds)
  console.log(`Posted ${embeds.length} embed(s) to Discord.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
