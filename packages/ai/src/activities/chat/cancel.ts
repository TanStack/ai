import type { RunStore } from './middleware/run-store'

export const RUN_CANCEL_REASON = 'tanstack-ai:cancel-requested'

/** Whether an abort reason means "the user explicitly cancelled this run". */
export function isCancelRequestedReason(reason: string | undefined): boolean {
  return reason === RUN_CANCEL_REASON
}

export async function requestRunCancel(
  runs: RunStore,
  runId: string,
): Promise<void> {
  await runs.update(runId, { cancelRequested: true })
}

export async function wasCancelRequested(
  runs: RunStore,
  runId: string,
): Promise<boolean> {
  try {
    const record = await runs.get(runId)
    return record?.cancelRequested === true
  } catch {
    return false
  }
}
