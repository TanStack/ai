/**
 * TanStack AI Adapter Smoke Tests
 *
 * This module provides programmatic access to the test suite.
 * For CLI usage, run: pnpm start [command] [options]
 *
 * @example
 * ```bash
 * # List available adapters and tests
 * pnpm start list
 *
 * # Run all tests on all adapters
 * pnpm start run
 *
 * # Run specific tests on specific adapters
 * pnpm start run --adapters openai,gemini --tests CST,OST,STR
 * ```
 */

// Re-export adapters
export { ADAPTERS, getAdapter, getAdapterIds } from './adapters'
export type { AdapterDefinition, AdapterSet } from './adapters'

// Re-export tests
export { TESTS, getTest, getTestIds, getDefaultTests } from './tests'
export type { TestDefinition, AdapterCapability } from './tests'

// Re-export harness utilities
export {
  runTestCase,
  captureStream,
  writeDebugFile,
  createDebugEnvelope,
  summarizeRun,
  buildApprovalMessages,
} from './harness'
export type { AdapterContext, TestOutcome } from './harness'
