import type { StepDescriptor, StepGenerator } from '../types'

/**
 * Mid-flight migration flag.
 *
 *     if (yield* patched('add-auth-check')) {
 *       // new behavior
 *     } else {
 *       // old behavior, kept for runs started before the patch
 *     }
 *
 * The decision is executed as a workflow-core step checkpoint, so it
 * remains stable for a run once recorded.
 *
 * Workflows that use `patched()` must declare the patch names on the
 * workflow definition so new runs see them at start:
 *
 *     defineWorkflow({
 *       name: 'article-pipeline',
 *       patches: ['add-auth-check'],
 *       run: async function* () { ... }
 *     })
 *
 * Hosts running multiple versions of the same workflow side-by-side
 * should pair patch checks with explicit workflow versions and
 * `selectWorkflowVersion`.
 */
export function* patched(name: string): StepGenerator<boolean> {
  const descriptor: StepDescriptor = { kind: 'patched', name }

  return yield descriptor
}
