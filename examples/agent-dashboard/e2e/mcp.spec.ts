import { expect, test } from '@playwright/test'
import { createMCPClient } from '@tanstack/ai-mcp'
import { closeDemo, openDemo } from './devtools'

test('exposes dashboard management tools over MCP', async ({
  page,
  baseURL,
}) => {
  await page.goto('/')
  await openDemo(page)
  await page.getByRole('button', { name: '+ New team' }).click()
  await closeDemo(page)
  await page.waitForTimeout(250)

  const roster = await page.request
    .get('/api/roster')
    .then((response) => response.json())
  const teamId = new URL(page.url()).pathname.split('/').pop()
  const threadId = roster.memberships.find(
    (membership: { teamId?: string }) => membership.teamId === teamId,
  ).threadId as string
  const client = await createMCPClient({
    transport: { type: 'http', url: `${baseURL}/api/mcp` },
  })
  try {
    const names = (await client.tools()).map((tool) => tool.name)
    expect(names).toContain('list_teams')
    expect(names).toContain('send_message')
    expect(names).toContain('run_tool')
    await client.callTool('send_message', {
      threadId,
      message: 'Please handle ticket T-1042.',
    })
    await expect(page.getByText('Agent question')).toBeVisible()
  } finally {
    await client.close()
  }

  // Each agent has its own harness MCP server.
  const triage = await createMCPClient({
    transport: { type: 'http', url: `${baseURL}/api/mcp/support/triage` },
  })
  try {
    const names = (await triage.tools()).map((tool) => tool.name)
    expect(names).toEqual(
      expect.arrayContaining(['chat', 'steer', 'cancel', 'approve', 'answer']),
    )
    expect(names).toContain('tool_fetch_stats')
    const status = await triage.callTool('status', { threadId })
    expect(JSON.stringify(status)).toContain('Allow lookup_ticket')
  } finally {
    await triage.close()
  }
})
