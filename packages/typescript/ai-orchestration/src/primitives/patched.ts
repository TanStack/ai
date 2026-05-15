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
 * Returns `true` for runs that were started under a workflow version
 * which declared `patches: ['add-auth-check', ...]`, `false` for runs
 * started before the patch existed. The decision is read from the
 * run's persisted `startingPatches` field — stable across replays.
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
 * Declaring `patches` also switches the workflow into patch-versioned
 * fingerprint mode — code-body changes no longer trigger
 * `workflow_version_mismatch`. Hosts running multiple versions of the
 * same workflow side-by-side should pair this with
 * `selectWorkflowVersion`.
 */
export function* patched(name: string): StepGenerator<boolean> {
  const descriptor: StepDescriptor = { kind: 'patched', name }
  return (yield descriptor) as unknown as boolean
}
