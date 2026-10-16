/**
 * Host React renderer for Tier F (Draft 0.2 §5, §6). Mounts a pinned artifact
 * revision in a sandboxed iframe, runs the host side of the bridge protocol
 * (`createFrameHost`), injects host theme tokens, owns the instance state, and
 * forwards submit/action intents to the host's machinery.
 *
 * Inline-first (§11, Draft 0.1 §1.6): this component renders the frame as
 * message content in the conversation; the standalone page is a separate
 * library surface, not this.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createFrameHost } from '../frame/bridge'
import { FRAME_THEME_TOKEN_NAMES } from '../frame/shell'
import type { IntentDispatch } from '../frame/bridge'
import type { ArtifactPin, BridgeEnvelope, FrameErrorPayload, FrameTheme } from '../frame/types'

/** Read the host's own `--ui-*` tokens off a DOM node (default theme source, §5.2). */
export function readHostTheme(from?: Element | null): FrameTheme {
  const el = from ?? (typeof document !== 'undefined' ? document.documentElement : null)
  const tokens: Record<string, string> = {}
  let mode: 'light' | 'dark' = 'light'
  if (el && typeof getComputedStyle === 'function') {
    const cs = getComputedStyle(el)
    for (const name of FRAME_THEME_TOKEN_NAMES) {
      const v = cs.getPropertyValue(name).trim()
      if (v) tokens[name] = v
    }
    const attr = el.getAttribute('data-theme')
    if (attr === 'dark' || attr === 'light') mode = attr
    else if (el.classList.contains('dark')) mode = 'dark'
  }
  return { mode, tokens }
}

let instanceSeq = 0

export interface FrameArtifactRendererProps {
  pin: ArtifactPin
  /** Build the sandbox-origin URL for this pinned revision (§4.1). */
  sandboxUrl: (pin: ArtifactPin, instanceId: string) => string
  /** Host data passed on host.init (authoritative numbers, §7.3.4). */
  data?: unknown
  registryVersion?: string
  /** Theme source; defaults to reading `--ui-*` off the host document (§5.2). */
  getTheme?: () => FrameTheme
  /** Seed instance state (§6.4). */
  initialState?: Record<string, unknown>
  onStateChange?: (state: Record<string, unknown>) => void
  /** Route submit/action intents through the host (§6.3). */
  onIntent?: (dispatch: IntentDispatch) => Promise<{ ok: boolean; result?: unknown; error?: string }> | void
  onError?: (err: FrameErrorPayload) => void
  title?: string
  minHeight?: number
  className?: string
  /** Show the host-owned frame affordance (border/label), §9.2.8. Default true. */
  chrome?: boolean
}

/**
 * Render one artifact instance. Owns a stable `instanceId` and host-side state;
 * the iframe is `sandbox="allow-scripts"` (opaque origin in the single-origin
 * POC — a production host serves from a dedicated sandbox origin, §4.2).
 */
export function FrameArtifactRenderer(props: FrameArtifactRendererProps) {
  const {
    pin,
    sandboxUrl,
    data,
    registryVersion,
    getTheme,
    initialState,
    onStateChange,
    onIntent,
    onError,
    title,
    minHeight = 80,
    className,
    chrome = true,
  } = props

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const instanceId = useRef<string>(`inst_${++instanceSeq}_${pin.artifactId}`)
  const stateRef = useRef<Record<string, unknown>>({ ...(initialState ?? {}) })
  const themeRef = useRef<() => FrameTheme>(getTheme ?? (() => readHostTheme()))
  themeRef.current = getTheme ?? (() => readHostTheme())

  const [height, setHeight] = useState<number>(minHeight)
  const [errored, setErrored] = useState<FrameErrorPayload | null>(null)

  const url = sandboxUrl(pin, instanceId.current)

  // One host endpoint per mounted instance; stored in a ref so the message
  // listener and theme-push effects share it.
  const hostRef = useRef<ReturnType<typeof createFrameHost> | null>(null)

  const send = useCallback((env: BridgeEnvelope) => {
    // Opaque frame origin can't be named → targetOrigin '*'. Safe: we control
    // the frame src + sandbox (blocks top-nav/popups), §4.2 / Draft 0.1 findings.
    iframeRef.current?.contentWindow?.postMessage(env, '*')
  }, [])

  useEffect(() => {
    const host = createFrameHost(
      { artifactId: pin.artifactId, instanceId: instanceId.current },
      {
        getTheme: () => themeRef.current(),
        getState: () => stateRef.current,
        setState: (next) => {
          stateRef.current = next
          onStateChange?.(next)
        },
        getData: () => data,
        registryVersion,
        onIntent: onIntent,
        onResize: (h) => setHeight(Math.max(minHeight, h)),
        onError: (err) => {
          setErrored(err)
          onError?.(err)
        },
        send,
      },
    )
    hostRef.current = host

    const onMessage = (ev: MessageEvent) => {
      // Trust only this instance's frame; opaque origin shows as "null".
      if (ev.source !== iframeRef.current?.contentWindow) return
      void host.handleMessage(ev.data)
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      hostRef.current = null
    }
    // Re-create when the pinned revision changes (a new frame mounts).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin.artifactId, pin.revision, url])

  // Push theme updates when the host theme changes (e.g. light/dark toggle).
  useLayoutEffect(() => {
    hostRef.current?.pushTheme(themeRef.current())
  })

  return (
    <div
      className={className}
      style={
        chrome
          ? {
              border: '1px solid var(--gui-border, var(--ui-border, #e5e7eb))',
              borderRadius: 12,
              overflow: 'hidden',
              background: 'var(--gui-surface, var(--ui-surface, #fff))',
            }
          : undefined
      }
    >
      {chrome && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            fontSize: 11,
            color: 'var(--gui-text-muted, var(--ui-muted, #6b7280))',
            borderBottom: '1px solid var(--gui-border, var(--ui-border, #eef2f7))',
          }}
        >
          <span aria-hidden>▢</span>
          <span>{title ?? 'Generated view'}</span>
          <span style={{ marginLeft: 'auto', opacity: 0.7 }}>sandboxed</span>
        </div>
      )}
      {errored && (
        <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--gui-danger, var(--ui-negative, #dc2626))' }}>
          This view failed to render. {errored.message}
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={url}
        title={title ?? 'Generated artifact'}
        sandbox="allow-scripts"
        style={{ display: 'block', width: '100%', height, border: 0 }}
      />
    </div>
  )
}
