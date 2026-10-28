import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * A set of client-side tools that run in the browser. Each is defined with
 * `toolDefinition(...).client(fn)` and wired into `injectChat` via
 * `tools: clientTools(...)`. On the server they are passed through
 * `mergeAgentTools([], params.tools)` as no-execute entries, so the model can
 * request them and the browser executes them.
 */

/** Returns the current local time as an ISO string. */
export const getTimeTool = toolDefinition({
  name: 'getTime',
  description: 'Returns the current local time as an ISO string.',
  inputSchema: z.object({}),
  outputSchema: z.object({ time: z.string() }),
}).client(() => ({
  time: new Date().toISOString(),
}))

/** Rolls one or more dice and returns each roll plus the total. */
export const rollDiceTool = toolDefinition({
  name: 'rollDice',
  description:
    'Roll one or more dice. Use for any "roll a die/dice" request. Defaults to a single six-sided die.',
  inputSchema: z.object({
    sides: z
      .number()
      .int()
      .min(2)
      .max(100)
      .optional()
      .describe('Number of sides per die (default 6).'),
    count: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe('How many dice to roll (default 1).'),
  }),
  outputSchema: z.object({
    rolls: z.array(z.number()),
    total: z.number(),
  }),
}).client(({ sides, count }) => {
  const faces = sides ?? 6
  const dice = count ?? 1
  const rolls = Array.from(
    { length: dice },
    () => 1 + Math.floor(Math.random() * faces),
  )
  return { rolls, total: rolls.reduce((sum, n) => sum + n, 0) }
})

/** Flips a fair coin. */
export const flipCoinTool = toolDefinition({
  name: 'flipCoin',
  description: 'Flip a fair coin and return heads or tails.',
  inputSchema: z.object({}),
  outputSchema: z.object({ result: z.enum(['heads', 'tails']) }),
}).client(() => ({
  result: Math.random() < 0.5 ? ('heads' as const) : ('tails' as const),
}))

/** Performs basic arithmetic on two numbers. */
export const calculateTool = toolDefinition({
  name: 'calculate',
  description:
    'Perform basic arithmetic (add, subtract, multiply, divide) on two numbers.',
  inputSchema: z.object({
    a: z.number(),
    b: z.number(),
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
  }),
  outputSchema: z.object({ result: z.number() }),
}).client(({ a, b, operation }) => {
  switch (operation) {
    case 'add':
      return { result: a + b }
    case 'subtract':
      return { result: a - b }
    case 'multiply':
      return { result: a * b }
    case 'divide':
      return { result: b === 0 ? NaN : a / b }
  }
})

/** Returns a mock weather report for a city (no network call). */
const WEATHER_CONDITIONS = [
  'Sunny',
  'Partly cloudy',
  'Cloudy',
  'Rainy',
  'Windy',
  'Foggy',
  'Snowy',
] as const

export const getWeatherTool = toolDefinition({
  name: 'getWeather',
  description:
    'Get a (mock) weather report for a city. Returns a temperature in Celsius and a condition.',
  inputSchema: z.object({
    city: z.string().describe('City name, e.g. "Tokyo".'),
  }),
  outputSchema: z.object({
    city: z.string(),
    temperatureC: z.number(),
    condition: z.string(),
  }),
}).client(({ city }) => {
  const seed = [...city.toLowerCase()].reduce(
    (sum, ch) => sum + ch.charCodeAt(0),
    0,
  )
  return {
    city,
    temperatureC: 4 + (seed % 26),
    condition: WEATHER_CONDITIONS[seed % WEATHER_CONDITIONS.length],
  }
})

/** All client tools, ready to spread into `clientTools(...)`. */
export const chatTools = [
  getTimeTool,
  rollDiceTool,
  flipCoinTool,
  calculateTool,
  getWeatherTool,
] as const
