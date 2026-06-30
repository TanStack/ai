/**
 * Test definitions for multi-adapter testing
 *
 * Follows the pattern from smoke-tests/adapters
 */

import type { AnyTextAdapter } from '@tanstack/ai'

/**
 * Result of a test run
 */
export interface TestOutcome {
  passed: boolean
  error?: string
  ignored?: boolean
}

/**
 * Definition for a test
 */
export interface TestDefinition {
  /** 3-letter acronym identifier (uppercase) */
  id: string
  /** Human-readable name */
  name: string
  /** Brief description of what the test does */
  description: string
  /** Whether this test requires a real LLM adapter */
  requiresAdapter: boolean
  /** Function to run the test */
  run: (
    adapter: AnyTextAdapter | null,
    verbose: boolean,
  ) => Promise<TestOutcome>
}

/**
 * Wrapper for the simulated test
 */
async function runSimulatedWrapper(
  _adapter: AnyTextAdapter | null,
  _verbose: boolean,
): Promise<TestOutcome> {
  const { runSimulatedTest } = await import('./simulated-test')
  const result = await runSimulatedTest()
  return {
    passed: result.passed,
    error: result.passed ? undefined : 'Simulated test failed',
  }
}

/**
 * Wrapper for the skills live test
 */
async function runSkillsLiveWrapper(
  adapter: AnyTextAdapter | null,
  verbose: boolean,
): Promise<TestOutcome> {
  if (!adapter) {
    return { passed: false, error: 'No adapter provided' }
  }

  const { runLiveTest } = await import('./live-test')
  const result = await runLiveTest({ adapter, verbose })
  return {
    passed: result.passed,
    error: result.passed ? undefined : 'Skills live test failed',
  }
}

/**
 * Wrapper for the structured output test
 */
async function runStructuredWrapper(
  adapter: AnyTextAdapter | null,
  verbose: boolean,
): Promise<TestOutcome> {
  if (!adapter) {
    return { passed: false, error: 'No adapter provided' }
  }

  const { runStructuredOutputTest } = await import('./structured-output-test')
  const result = await runStructuredOutputTest({ adapter, verbose })
  return {
    passed: result.passed,
    error: result.passed ? undefined : 'Structured output test failed',
  }
}

/**
 * Wrapper for the ToolRegistry test
 */
async function runRegistryWrapper(
  _adapter: AnyTextAdapter | null,
  _verbose: boolean,
): Promise<TestOutcome> {
  const { runRegistryTest } = await import('./registry-test')
  const result = await runRegistryTest()
  return {
    passed: result.passed,
    error: result.passed ? undefined : 'ToolRegistry test failed',
  }
}

/**
 * Registry of all available tests
 */
export const TESTS: Array<TestDefinition> = [
  {
    id: 'SIM',
    name: 'Simulated',
    description:
      'Deterministic test with mock adapter (skill creation + reuse)',
    requiresAdapter: false,
    run: runSimulatedWrapper,
  },
  {
    id: 'REG',
    name: 'Registry',
    description: 'Test ToolRegistry dynamic skill registration mid-stream',
    requiresAdapter: false,
    run: runRegistryWrapper,
  },
  {
    id: 'SKL',
    name: 'Skills Live',
    description: 'Live test of skill creation and direct skill tool call',
    requiresAdapter: true,
    run: runSkillsLiveWrapper,
  },
  {
    id: 'STR',
    name: 'Structured Output',
    description: 'Test structured output with code mode',
    requiresAdapter: true,
    run: runStructuredWrapper,
  },
]

/**
 * Get test definition by ID (case-insensitive)
 */
export function getTest(id: string): TestDefinition | undefined {
  return TESTS.find((t) => t.id.toLowerCase() === id.toLowerCase())
}

/**
 * Get all test IDs
 */
export function getTestIds(): Array<string> {
  return TESTS.map((t) => t.id)
}

/**
 * Get all tests (no skip-by-default logic for skills tests)
 */
export function getDefaultTests(): Array<TestDefinition> {
  return TESTS
}
