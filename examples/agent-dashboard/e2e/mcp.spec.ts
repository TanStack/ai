import { expect, test } from '@playwright/test'
import { createMCPClient } from '@tanstack/ai-mcp'
import { closeDemo, openDemo } from './devtools'

test('exposes dashboard management tools over MCP', async ({ page }) => {
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
    transport: { type: 'http', url: 'http://localhost:3002/api/mcp' },
  })
  try {
    const names = (await client.tools()).map((tool) => tool.name)
    expect(names).toContain('list_teams')
    expect(names).toContain('send_message')
    expect(names).toContain('resolve_approval')
    await client.callTool('send_message', {
      threadId,
      message: 'Please handle ticket T-1042.',
    })
    await expect(page.getByText('Agent question')).toBeVisible()
  } finally {
    await client.close()
  }
})
