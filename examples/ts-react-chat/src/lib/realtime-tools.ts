import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

// Tool to get current time - useful for voice assistants
export const getCurrentTimeToolDef = toolDefinition({
  name: 'getCurrentTime',
  description: 'Get the current date and time. Use this when the user asks what time it is or the current date.',
  inputSchema: z.object({
    timezone: z.string().optional().describe('Optional timezone like "America/New_York" or "Europe/London"'),
  }),
  outputSchema: z.object({
    time: z.string(),
    date: z.string(),
    timezone: z.string(),
  }),
})

// Tool to get weather - common voice assistant use case
export const getWeatherToolDef = toolDefinition({
  name: 'getWeather',
  description: 'Get the current weather for a location. Use this when the user asks about the weather.',
  inputSchema: z.object({
    location: z.string().describe('The city and state/country, e.g. "San Francisco, CA" or "London, UK"'),
  }),
  outputSchema: z.object({
    location: z.string(),
    temperature: z.number(),
    unit: z.string(),
    condition: z.string(),
    humidity: z.number(),
  }),
})

// Tool to set a reminder - demonstrates user interaction
export const setReminderToolDef = toolDefinition({
  name: 'setReminder',
  description: 'Set a reminder for the user. Use this when the user asks to be reminded about something.',
  inputSchema: z.object({
    message: z.string().describe('What to remind the user about'),
    inMinutes: z.number().describe('How many minutes from now to remind'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    remindAt: z.string(),
  }),
})

// Tool to search knowledge base - useful for assistants with specific knowledge
export const searchKnowledgeToolDef = toolDefinition({
  name: 'searchKnowledge',
  description: 'Search a knowledge base for information. Use this to find specific facts or documentation.',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      title: z.string(),
      snippet: z.string(),
    })),
  }),
})

// Client-side implementation of getCurrentTime
export const getCurrentTimeClient = getCurrentTimeToolDef.client(({ timezone }) => {
  const now = new Date()
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  
  return {
    time: now.toLocaleTimeString('en-US', { timeZone: tz }),
    date: now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      timeZone: tz,
    }),
    timezone: tz,
  }
})

// Client-side implementation of getWeather (mock data for demo)
export const getWeatherClient = getWeatherToolDef.client(({ location }) => {
  // Mock weather data for demo purposes
  const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Rainy', 'Snowy']
  const randomCondition = conditions[Math.floor(Math.random() * conditions.length)]!
  const randomTemp = Math.floor(Math.random() * 30) + 50 // 50-80°F
  const randomHumidity = Math.floor(Math.random() * 50) + 30 // 30-80%
  
  return {
    location,
    temperature: randomTemp,
    unit: 'F',
    condition: randomCondition,
    humidity: randomHumidity,
  }
})

// Client-side implementation of setReminder
export const setReminderClient = setReminderToolDef.client(({ message, inMinutes }) => {
  const remindAt = new Date(Date.now() + inMinutes * 60 * 1000)
  
  // In a real app, you'd schedule a notification here
  console.log(`[Reminder] Will remind about "${message}" at ${remindAt.toLocaleTimeString()}`)
  
  // For demo purposes, show an alert after the specified time
  setTimeout(() => {
    alert(`Reminder: ${message}`)
  }, inMinutes * 60 * 1000)
  
  return {
    success: true,
    message: `Reminder set: "${message}"`,
    remindAt: remindAt.toLocaleTimeString(),
  }
})

// Client-side implementation of searchKnowledge (mock data for demo)
export const searchKnowledgeClient = searchKnowledgeToolDef.client(({ query }) => {
  // Mock search results for demo
  const mockResults = [
    {
      title: `Result for: ${query}`,
      snippet: `This is a mock search result for the query "${query}". In a real application, this would return actual search results from a knowledge base.`,
    },
    {
      title: 'Additional Information',
      snippet: 'More relevant information would appear here based on your search query.',
    },
  ]
  
  return { results: mockResults }
})

// Export all client tools as an array for easy use
export const realtimeClientTools = [
  getCurrentTimeClient,
  getWeatherClient,
  setReminderClient,
  searchKnowledgeClient,
] as const
