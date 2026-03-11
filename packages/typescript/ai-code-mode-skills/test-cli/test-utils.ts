/**
 * Test utilities for the skills CLI tests
 */

import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { createMemorySkillStorage } from '../src/storage/memory-storage'
import { createAlwaysTrustedStrategy } from '../src/trust-strategies'
import type { SkillStorage } from '../src/types'

/**
 * A simple add_numbers tool for testing
 */
export const addNumbersTool = toolDefinition({
  name: 'add_numbers',
  description: 'Add two numbers together and return the result',
  inputSchema: z.object({
    a: z.number().describe('First number to add'),
    b: z.number().describe('Second number to add'),
  }),
  outputSchema: z.object({
    result: z.number().describe('The sum of a and b'),
  }),
}).server(async ({ a, b }) => {
  console.log(`[add_numbers] Adding ${a} + ${b}`)
  return { result: a + b }
})

/**
 * Create a fresh memory storage for testing
 */
export function createTestStorage(): SkillStorage {
  return createMemorySkillStorage({
    initialSkills: [],
    trustStrategy: createAlwaysTrustedStrategy(),
  })
}

/**
 * Result from a test phase
 */
export interface TestPhaseResult {
  success: boolean
  error?: string
  details?: Record<string, unknown>
}

/**
 * Result from the full test
 */
export interface TestResult {
  passed: boolean
  phases: {
    phase1: TestPhaseResult
    phase2: TestPhaseResult
  }
  skillCreated: boolean
  skillUsed: boolean
}

/**
 * Console colors for output
 */
export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}

/**
 * Log a section header
 */
export function logSection(title: string) {
  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`)
  console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`)
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`)
}

/**
 * Log a success message
 */
export function logSuccess(message: string) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`)
}

/**
 * Log an error message
 */
export function logError(message: string) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`)
}

/**
 * Log an info message
 */
export function logInfo(message: string) {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`)
}

/**
 * Log a warning message
 */
export function logWarning(message: string) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`)
}

/**
 * Log a step in the test
 */
export function logStep(step: number, message: string) {
  console.log(`${colors.magenta}[Step ${step}]${colors.reset} ${message}`)
}

/**
 * Expected code for the skill that wraps add_numbers
 */
export const EXPECTED_SKILL_CODE = `
const { a, b } = input;
const result = await external_add_numbers({ a, b });
return result;
`.trim()

/**
 * Expected input schema for the add_two_numbers skill
 */
export const EXPECTED_SKILL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    a: { type: 'number', description: 'First number to add' },
    b: { type: 'number', description: 'Second number to add' },
  },
  required: ['a', 'b'],
}

/**
 * Expected output schema for the add_two_numbers skill
 */
export const EXPECTED_SKILL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    result: { type: 'number', description: 'The sum of a and b' },
  },
  required: ['result'],
}
