/**
 * Page-context utilities for the Coco panel:
 *
 * - `watchRoute(cb)`: subscribes to SPA navigations (`pushState`,
 *   `replaceState`, `popstate`) and fires `cb(currentRoute)` whenever the
 *   route changes. Returns an unsubscribe.
 * - `pickElement()`: opens a one-shot picker — the user clicks an element
 *   anywhere on the page, and we resolve with a context blob describing it.
 */

export interface SelectedElement {
  selector: string
  tagName: string
  textSnippet: string
  outerHTMLTruncated: string
}

const currentRoute = (): string =>
  window.location.pathname + window.location.search + window.location.hash

/**
 * Subscribe to route changes (SPA nav + back/forward). The callback is
 * invoked synchronously once on subscribe with the current route.
 */
export const watchRoute = (cb: (route: string) => void): (() => void) => {
  let last = currentRoute()
  cb(last)
  const fire = () => {
    const next = currentRoute()
    if (next !== last) {
      last = next
      cb(next)
    }
  }

  const origPush = history.pushState
  const origReplace = history.replaceState
  history.pushState = function (...args) {
    const result = origPush.apply(this, args)
    queueMicrotask(fire)
    return result
  }
  history.replaceState = function (...args) {
    const result = origReplace.apply(this, args)
    queueMicrotask(fire)
    return result
  }
  const onPop = () => fire()
  window.addEventListener('popstate', onPop)
  window.addEventListener('hashchange', onPop)

  return () => {
    history.pushState = origPush
    history.replaceState = origReplace
    window.removeEventListener('popstate', onPop)
    window.removeEventListener('hashchange', onPop)
  }
}

/** Build a reasonably stable CSS selector for an element. */
const buildSelector = (el: Element): string => {
  if (el.id) return `#${CSS.escape(el.id)}`
  const parts: Array<string> = []
  let current: Element | null = el
  let depth = 0
  while (current && current.nodeType === 1 && depth < 4) {
    let part = current.tagName.toLowerCase()
    if (current.classList.length) {
      part +=
        '.' +
        Array.from(current.classList).slice(0, 2).map(CSS.escape).join('.')
    } else {
      const parent = current.parentElement
      if (parent) {
        const sameTag = Array.from(parent.children).filter(
          (c) => c.tagName === current!.tagName,
        )
        if (sameTag.length > 1) {
          const idx = sameTag.indexOf(current) + 1
          part += `:nth-of-type(${idx})`
        }
      }
    }
    parts.unshift(part)
    if (current.id) break
    current = current.parentElement
    depth++
  }
  return parts.join(' > ')
}

const truncate = (s: string, n: number) =>
  s.length <= n ? s : s.slice(0, n - 1) + '…'

const describeElement = (el: Element): SelectedElement => ({
  selector: buildSelector(el),
  tagName: el.tagName.toLowerCase(),
  textSnippet: truncate(
    (el.textContent ?? '').trim().replace(/\s+/g, ' '),
    200,
  ),
  outerHTMLTruncated: truncate(el.outerHTML, 1500),
})

const PICKER_STYLE_ID = '__coco-picker-style'
const PICKER_CLASS = '__coco-picker-hover'

const ensurePickerStyles = () => {
  if (document.getElementById(PICKER_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = PICKER_STYLE_ID
  style.textContent = `
    .${PICKER_CLASS} {
      outline: 2px solid #f59e0b !important;
      outline-offset: 1px !important;
      cursor: crosshair !important;
    }
    body.__coco-picker-active, body.__coco-picker-active * {
      cursor: crosshair !important;
    }
  `
  document.head.appendChild(style)
}

/**
 * Activate the element picker. Returns a promise that resolves with the
 * selected element's metadata when the user clicks, or `null` if they hit
 * Escape / call `cancel()`.
 */
export interface ElementPickerHandle {
  promise: Promise<SelectedElement | null>
  cancel: () => void
}

export const pickElement = (cocoHost: HTMLElement): ElementPickerHandle => {
  ensurePickerStyles()
  let lastHover: Element | null = null
  let cancelled = false

  const setHover = (el: Element | null) => {
    if (lastHover && lastHover !== el) {
      lastHover.classList.remove(PICKER_CLASS)
    }
    if (el) el.classList.add(PICKER_CLASS)
    lastHover = el
  }

  document.body.classList.add('__coco-picker-active')

  let resolve!: (value: SelectedElement | null) => void
  const promise = new Promise<SelectedElement | null>((r) => {
    resolve = r
  })

  const cleanup = () => {
    document.body.classList.remove('__coco-picker-active')
    setHover(null)
    window.removeEventListener('mousemove', onMove, true)
    window.removeEventListener('click', onClick, true)
    window.removeEventListener('keydown', onKey, true)
  }

  const onMove = (e: MouseEvent) => {
    if (cancelled) return
    const target = document.elementFromPoint(e.clientX, e.clientY)
    if (!target) return
    if (target === cocoHost || cocoHost.contains(target)) {
      setHover(null)
      return
    }
    setHover(target)
  }

  const onClick = (e: MouseEvent) => {
    if (cancelled) return
    const target = document.elementFromPoint(e.clientX, e.clientY)
    if (!target || target === cocoHost || cocoHost.contains(target)) return
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    cleanup()
    resolve(describeElement(target))
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cancelled = true
      cleanup()
      resolve(null)
    }
  }

  window.addEventListener('mousemove', onMove, true)
  window.addEventListener('click', onClick, true)
  window.addEventListener('keydown', onKey, true)

  return {
    promise,
    cancel: () => {
      if (cancelled) return
      cancelled = true
      cleanup()
      resolve(null)
    },
  }
}
