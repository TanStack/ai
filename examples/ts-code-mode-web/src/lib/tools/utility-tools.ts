import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

// 1. Get current date for relative calculations
export const getCurrentDateTool = toolDefinition({
  name: 'getCurrentDate',
  description:
    'Get the current date and time. Useful for calculating relative date ranges.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    iso: z.string(),
    timestamp: z.number(),
    year: z.number(),
    month: z.number(),
    day: z.number(),
    formatted: z.string(),
  }),
}).server(() => {
  const now = new Date()
  return {
    iso: now.toISOString(),
    timestamp: now.getTime(),
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    formatted: now.toISOString().split('T')[0],
  }
})

// 2. Calculate statistics for an array of numbers
export const calculateStatsTool = toolDefinition({
  name: 'calculateStats',
  description:
    'Calculate statistics (mean, median, min, max, stdDev, sum) for an array of numbers.',
  inputSchema: z.object({
    values: z.array(z.number()).describe('Array of numbers to analyze'),
  }),
  outputSchema: z.object({
    mean: z.number(),
    median: z.number(),
    min: z.number(),
    max: z.number(),
    stdDev: z.number(),
    sum: z.number(),
    count: z.number(),
  }),
}).server(({ values }) => {
  if (values.length === 0) {
    return {
      mean: 0,
      median: 0,
      min: 0,
      max: 0,
      stdDev: 0,
      sum: 0,
      count: 0,
    }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const sum = values.reduce((acc, val) => acc + val, 0)
  const mean = sum / values.length

  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2

  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2))
  const avgSquaredDiff =
    squaredDiffs.reduce((acc, val) => acc + val, 0) / values.length
  const stdDev = Math.sqrt(avgSquaredDiff)

  return {
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    min: Math.min(...values),
    max: Math.max(...values),
    stdDev: Math.round(stdDev * 100) / 100,
    sum,
    count: values.length,
  }
})

// 3. Format date for NPM API calls
export const formatDateRangeTool = toolDefinition({
  name: 'formatDateRange',
  description:
    'Calculate a date range going back from today. Returns start and end dates formatted for API calls.',
  inputSchema: z.object({
    daysBack: z.number().describe('Number of days to go back from today'),
  }),
  outputSchema: z.object({
    startDate: z.string(),
    endDate: z.string(),
  }),
}).server(({ daysBack }) => {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - daysBack)

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  }
})

// Export all utility tools as a collection
export const utilityTools = [
  getCurrentDateTool,
  calculateStatsTool,
  formatDateRangeTool,
]
