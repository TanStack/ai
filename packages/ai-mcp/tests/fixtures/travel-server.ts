import { toolDefinition } from '@tanstack/ai'
import {
  createMCPServer,
  promptDefinition,
  resourceDefinition,
} from '../../src/server'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'get_weather',
  description: 'Get the weather for a city',
  inputSchema: z.object({
    city: z.string(),
  }),
  outputSchema: z.string(),
}).server(async ({ city }) => {
  return `Sunny in ${city}`
})

const cityGuide = resourceDefinition({
  uri: 'file:///city-guide.md',
  name: 'city-guide',
  mimeType: 'text/markdown',
}).read(async () => ({
  text: '# Paris\n\nPack a light jacket.',
}))

const tripBrief = promptDefinition({
  name: 'trip_brief',
  description: 'Write a short trip brief for a city',
  argsSchema: z.object({
    city: z.string(),
  }),
}).render(async ({ city }) => [
  {
    role: 'user',
    content: `Write a one-day plan for ${city}.`,
  },
])

export const travelServer = createMCPServer({
  name: 'travel',
  version: '1.0.0',
  tools: [getWeather],
  resources: [cityGuide],
  prompts: [tripBrief],
})
