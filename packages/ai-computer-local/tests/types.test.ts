import { describe, expectTypeOf, it } from 'vitest'
import type * as robotjs from '@jitsi/robotjs'
import type { RobotLike } from '../src/index'

describe('RobotLike', () => {
  it('accepts the real @jitsi/robotjs module', () => {
    expectTypeOf<typeof robotjs>().toExtend<RobotLike>()
  })
})
