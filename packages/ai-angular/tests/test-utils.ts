import { Component } from '@angular/core'
import { getTestBed, TestBed } from '@angular/core/testing'
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing'
import { injectChat } from '../src/inject-chat'
import type { InjectChatOptions } from '../src/types'
import type { InjectChatResult } from '../src/types'

export {
  createMockConnectionAdapter,
  createTextChunks,
  createToolCallChunks,
} from '../../ai-client/tests/test-utils'

// Ensure TestBed is initialized in this module's scope, regardless of whether
// the setup file's initialization was in a different module context (possible
// when the Angular plugin creates separate ESM module instances for compiled
// and setup files in Vitest).
const testBedInstance = getTestBed() as any
if (testBedInstance._compiler === null || testBedInstance._compiler === undefined) {
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
