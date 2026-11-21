import { runJournalConformance } from '@tanstack/ai-sandbox/testkit'
import { modalSandbox } from '../src/index'

const hasCreds =
  process.env.TANSTACK_MODAL_LIVE_TESTS === '1' &&
  !!process.env.MODAL_TOKEN_ID &&
  !!process.env.MODAL_TOKEN_SECRET &&
  !!process.env.MODAL_APP_NAME

runJournalConformance({
  name: 'modal',
  createHandle: async () => {
    const handle = await modalSandbox({
      appName: process.env.MODAL_APP_NAME ?? 'tanstack-ai-test',
    }).create({})
    return { handle, dispose: () => handle.destroy() }
  },
  followUnsupported: {
    reason:
      'killableProcesses is false because Modal exposes no verified per-process kill',
  },
  ...(hasCreds
    ? {}
    : {
        unsupported: {
          reason:
            'set TANSTACK_MODAL_LIVE_TESTS=1, MODAL_TOKEN_ID, MODAL_TOKEN_SECRET, and MODAL_APP_NAME to create billable test sandboxes',
        },
      }),
})
