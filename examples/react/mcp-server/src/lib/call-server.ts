import { createServerFn } from '@tanstack/react-start'
import { createMCPClient } from '@tanstack/ai-mcp'
import { server } from '../mcp-server'

export type DeskResult = {
  forecast: string
  guide: string
  brief: string
}

export const callDesk = createServerFn({ method: 'POST' }).handler(
  async (): Promise<DeskResult> => {
    const client = await createMCPClient({ server })
    const forecast = await client.callTool('get_weather', { city: 'Paris' })
    const guide = await client.readResource('file:///city-guide.md')
    const prompt = await client.getPrompt('trip_brief', { city: 'Paris' })
    const message = prompt[0]
    return {
      forecast,
      guide: guide.text,
      brief: message === undefined ? '' : message.content,
    }
  },
)
