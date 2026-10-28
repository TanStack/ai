/**
 * The durable-run-fields suite, run against core's in-memory `RunStore`.
 *
 * Two jobs. It proves the reference implementation honours the four fields, and it
 * proves the suite itself still executes after moving out of
 * `@tanstack/ai-persistence`'s conformance run: a suite that silently stopped
 * asserting would look identical to a passing one.
 */
import { InMemoryRunStore } from '@tanstack/ai'
import { runDurableRunFieldsConformance } from '../src/testkit/conformance'

runDurableRunFieldsConformance('InMemoryRunStore', () => new InMemoryRunStore())
