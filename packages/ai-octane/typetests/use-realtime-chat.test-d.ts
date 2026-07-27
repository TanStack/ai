import { expectTypeOf } from 'vitest';
import type { RealtimeSessionConfig } from '@tanstack/ai';

import type { UseRealtimeChatReturn } from '../src/index';

declare const realtime: UseRealtimeChatReturn;

expectTypeOf(realtime.updateSession).parameter(0).toEqualTypeOf<RealtimeSessionConfig>();

// @ts-expect-error - upstream 0.17 replaced the local VAD snapshot with updateSession
void realtime.vadMode;
// @ts-expect-error - upstream 0.17 replaced setVADMode with updateSession
void realtime.setVADMode;
