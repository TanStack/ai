import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react'
import { setLingbotAxis } from '@/lib/reactor-session'
import type { ReactNode } from 'react'
import type { Reactor } from '@reactor-team/js-sdk'
import type { ReactorWorldModel } from '@tanstack/ai-reactor'
import type { LingbotAxis } from '@/lib/reactor-session'

interface Control {
  axis: LingbotAxis
  value: string
  key: string
  label: string
  cap: ReactNode
}

const ICON = 'h-4 w-4'

// Order in each pad: up, left, down, right.
const MOVE: Array<Control> = [
  {
    axis: 'move_longitudinal',
    value: 'forward',
    key: 'w',
    label: 'Forward',
    cap: 'W',
  },
  {
    axis: 'move_lateral',
    value: 'strafe_left',
    key: 'a',
    label: 'Strafe left',
    cap: 'A',
  },
  {
    axis: 'move_longitudinal',
    value: 'back',
    key: 's',
    label: 'Back',
    cap: 'S',
  },
  {
    axis: 'move_lateral',
    value: 'strafe_right',
    key: 'd',
    label: 'Strafe right',
    cap: 'D',
  },
]

const LOOK: Array<Control> = [
  {
    axis: 'look_vertical',
    value: 'up',
    key: 'ArrowUp',
    label: 'Look up',
    cap: <ArrowUp className={ICON} />,
  },
  {
    axis: 'look_horizontal',
    value: 'left',
    key: 'ArrowLeft',
    label: 'Look left',
    cap: <ArrowLeft className={ICON} />,
  },
  {
    axis: 'look_vertical',
    value: 'down',
    key: 'ArrowDown',
    label: 'Look down',
    cap: <ArrowDown className={ICON} />,
  },
  {
    axis: 'look_horizontal',
    value: 'right',
    key: 'ArrowRight',
    label: 'Look right',
    cap: <ArrowRight className={ICON} />,
  },
]

const ALL = [...MOVE, ...LOOK]

function controlForKey(event: KeyboardEvent): Control | undefined {
  const target = event.target
  if (
    target instanceof HTMLElement &&
    target.closest('input, textarea, select')
  ) {
    return undefined
  }
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  return ALL.find((control) => control.key === key)
}

/**
 * Hold-to-move pads for LingBot, laid over the video. Buttons, WASD, and
 * arrow keys drive the same held axes. A button lights while its axis runs.
 */
export function LingbotControls(props: {
  reactor: Reactor
  model: ReactorWorldModel
  onError: (message: string) => void
}) {
  const { reactor, model, onError } = props
  const held = useRef(new Map<LingbotAxis, string>())
  const [active, setActive] = useState<ReadonlyMap<LingbotAxis, string>>(
    () => new Map(),
  )

  function send(axis: LingbotAxis, value: string) {
    setActive(new Map(held.current))
    setLingbotAxis(reactor, model, axis, value).catch((error: unknown) =>
      onError(String(error)),
    )
  }

  function press(control: Control) {
    if (held.current.get(control.axis) === control.value) return
    held.current.set(control.axis, control.value)
    send(control.axis, control.value)
  }

  function release(control: Control) {
    // Another key on the same axis took over. Leave it running.
    if (held.current.get(control.axis) !== control.value) return
    held.current.delete(control.axis)
    send(control.axis, 'idle')
  }

  const pressRef = useRef(press)
  const releaseRef = useRef(release)
  pressRef.current = press
  releaseRef.current = release

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      const control = controlForKey(event)
      if (!control) return
      event.preventDefault()
      pressRef.current(control)
    }
    const onUp = (event: KeyboardEvent) => {
      const control = controlForKey(event)
      if (control) releaseRef.current(control)
    }
    // A key released outside the window never fires keyup. Stop everything.
    const releaseAll = () => {
      for (const control of ALL) releaseRef.current(control)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', releaseAll)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', releaseAll)
    }
  }, [])

  function pad(title: string, controls: Array<Control>, corner: string) {
    const areas = ['up', 'left', 'down', 'right']
    return (
      <div
        className={`absolute bottom-3 flex flex-col items-center gap-1 ${corner}`}
      >
        <div
          className="grid grid-cols-3 gap-1"
          style={{ gridTemplateAreas: '". up ." "left down right"' }}
        >
          {controls.map((control, index) => (
            <button
              key={control.label}
              type="button"
              aria-label={control.label}
              aria-pressed={active.get(control.axis) === control.value}
              title={control.label}
              style={{ gridArea: areas[index] }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                press(control)
              }}
              onPointerUp={() => release(control)}
              onPointerCancel={() => release(control)}
              className="flex h-10 w-10 touch-none select-none items-center justify-center rounded-lg border border-white/20 bg-black/50 font-mono text-sm font-semibold text-white backdrop-blur-sm hover:bg-black/70 aria-pressed:border-purple-400 aria-pressed:bg-purple-600"
            >
              {control.cap}
            </button>
          ))}
        </div>
        <span className="rounded bg-black/50 px-1.5 text-xs text-gray-200">
          {title}
        </span>
      </div>
    )
  }

  return (
    <>
      {pad('Move', MOVE, 'left-3')}
      {pad('Look', LOOK, 'right-3')}
    </>
  )
}
