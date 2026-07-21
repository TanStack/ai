import { Component } from '@angular/core'
import { TestBed, getTestBed } from '@angular/core/testing'
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing'
import { injectChat } from '../src/inject-chat'
import type { InjectChatOptions, InjectChatResult } from '../src/types'
import type { ChatResumeSnapshotV2 } from '@tanstack/ai-client'

export {
  createMockConnectionAdapter,
  createTextChunks,
  createToolCallChunks,
} from '../../ai-client/tests/test-utils'

export function createInterruptResumeSnapshot(): ChatResumeSnapshotV2 {
  const pendingInterrupts = [
    {
      id: 'staged-interrupt',
      reason: 'confirmation',
      metadata: {
        'tanstack:interruptBinding': {
          kind: 'generic' as const,
          interruptId: 'staged-interrupt',
          interruptedRunId: 'run-1',
          generation: 1,
          responseSchemaHash: 'none',
        },
      },
    },
    {
      id: 'invalid-interrupt',
      reason: 'confirmation',
      metadata: {
        'tanstack:interruptBinding': {
          kind: 'generic' as const,
          interruptId: 'invalid-interrupt',
          interruptedRunId: 'run-1',
          generation: 1,
          responseSchemaHash: 'none',
        },
      },
    },
  ]

  return {
    schemaVersion: 2,
    resumeState: { threadId: 'thread-1', runId: 'run-1' },
    pendingInterrupts,
  }
}

// Ensure TestBed is initialized in this module's scope, regardless of whether
// the setup file's initialization was in a different module context (possible
// when the Angular plugin creates separate ESM module instances for compiled
// and setup files in Vitest).
const testBedInstance = getTestBed() as any
if (
  testBedInstance._compiler === null ||
  testBedInstance._compiler === undefined
) {
  getTestBed().initTestEnvironment(
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting(),
  )
}

/**
 * Mount `injectChat` inside a real component so injection context,
 * `afterNextRender`, and `DestroyRef` behave as in an app. Returns a live
 * `result` accessor plus `flush` (runs change detection) and `destroy`.
 */
export function renderInjectChat<T extends InjectChatOptions>(
  options?: T,
): {
  result: InjectChatResult
  flush: () => void
  destroy: () => void
} {
  @Component({ standalone: true, template: '' })
  class HostComponent {
    chat = injectChat(options as any)
  }

  const fixture = TestBed.createComponent(HostComponent)
  fixture.detectChanges()

  return {
    get result() {
      return fixture.componentInstance.chat
    },
    flush: () => fixture.detectChanges(),
    destroy: () => fixture.destroy(),
  }
}
