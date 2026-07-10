import type { AIDevtoolsEventMap } from '../src'

const imageStarted = {
  eventId: 'event-1',
  timestamp: 1,
  requestId: 'request-1',
  provider: 'image-provider',
  model: 'image-model',
  prompt: 'draw a square',
  threadId: 'thread-1',
  runId: 'run-1',
} satisfies AIDevtoolsEventMap['image:request:started']

void imageStarted

const staleCursor = {
  eventId: 'event-2',
  timestamp: 2,
  requestId: 'request-2',
  provider: 'image-provider',
  model: 'image-model',
  prompt: 'draw a circle',
  // @ts-expect-error generation event cursors are owned by stream adapters
  cursor: 'adapter-offset',
} satisfies AIDevtoolsEventMap['image:request:started']

void staleCursor
