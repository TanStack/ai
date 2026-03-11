/**
 * CLI module exports for testing the skills system
 */

export { runSimulatedTest } from './simulated-test'
export { runRegistryTest } from './registry-test'
export type { RegistryTestResult } from './registry-test'
export { runLiveTest } from './live-test'
export type { LiveTestOptions } from './live-test'
export {
  runStructuredOutputTest,
  MathReportSchema,
} from './structured-output-test'
export type {
  StructuredOutputTestOptions,
  StructuredOutputTestResult,
  MathReport,
} from './structured-output-test'
export {
  createMockTextAdapter,
  singleToolCall,
  textResponse,
  toolCallResponse,
} from './mock-adapter'
export type { MockAdapterConfig, MockResponse } from './mock-adapter'
export {
  addNumbersTool,
  colors,
  createTestStorage,
  logError,
  logInfo,
  logSection,
  logStep,
  logSuccess,
  logWarning,
} from './test-utils'
export type { TestPhaseResult, TestResult } from './test-utils'

// Multi-adapter test infrastructure
export { ADAPTERS, getAdapter, getAdapterIds } from './adapters'
export type { AdapterDefinition, AdapterSet } from './adapters'
export { TESTS, getTest, getTestIds, getDefaultTests } from './tests'
export type { TestDefinition, TestOutcome } from './tests'
