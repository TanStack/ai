/** A mouse button a driver can press. */
export type MouseButton = 'left' | 'right' | 'middle' | 'back' | 'forward'

/** The kind of computer a driver controls. */
export type ComputerEnvironment = 'browser' | 'linux' | 'mac' | 'windows'

/**
 * Controls one computer: a browser page, a desktop VM, or a sandbox.
 *
 * Coordinates are in pixels in `display` space. Key names are
 * `KeyboardEvent.key` names, for example `'Enter'`, `'Control'`, or `'a'`.
 */
export interface ComputerDriver {
  /** The screen size in pixels. Screenshots have this size. */
  display: { width: number; height: number }
  /** The kind of computer the driver controls. */
  environment: ComputerEnvironment
  /** Take a screenshot. Returns PNG bytes. */
  screenshot: () => Promise<Uint8Array>
  /** Click `count` times at the point with the given button. */
  click: (
    x: number,
    y: number,
    options: { button: MouseButton; count: number },
  ) => Promise<void>
  /** Move the mouse to the point. */
  move: (x: number, y: number) => Promise<void>
  /** Press and hold a mouse button at the current mouse position. */
  mouseDown: (button: MouseButton) => Promise<void>
  /** Release a mouse button at the current mouse position. */
  mouseUp: (button: MouseButton) => Promise<void>
  /** Scroll at the point. The deltas are in pixels. */
  scroll: (
    x: number,
    y: number,
    deltaX: number,
    deltaY: number,
  ) => Promise<void>
  /** Press and hold one key. */
  keyDown: (key: string) => Promise<void>
  /** Release one key. */
  keyUp: (key: string) => Promise<void>
  /** Press one key combo, like `['Control', 's']`. */
  press: (keys: Array<string>) => Promise<void>
  /** Type text as a user does. */
  type: (text: string) => Promise<void>
  /** Take a screenshot of one region at full size. Returns PNG bytes. */
  zoom?: (region: {
    x: number
    y: number
    width: number
    height: number
  }) => Promise<Uint8Array>
  /** Get the current mouse position. */
  cursorPosition?: () => Promise<{ x: number; y: number }>
  /**
   * Go to a URL. When the driver has this method, `createComputerUse` adds
   * the `navigate` tool.
   */
  navigate?: (url: string) => Promise<void>
  /**
   * Free the machine. When a factory created the driver, `createComputerUse`
   * calls this when the thread closes or goes idle. A driver that the app
   * passes in stays open.
   */
  close?: () => Promise<void>
}

/**
 * Makes one machine per thread.
 *
 * `createComputerUse` builds the tool before any machine exists. The factory
 * tells it the display, the environment, and the optional methods.
 */
export interface ComputerDriverFactory {
  /** The screen size in pixels. Every created driver has this `display`. */
  display: { width: number; height: number }
  /** The kind of computer. Every created driver has this `environment`. */
  environment: ComputerEnvironment
  /** The optional methods that every created driver has. */
  capabilities: { zoom: boolean; cursorPosition: boolean; navigate: boolean }
  /** Make the machine for one thread. */
  create: (context: { threadId: string }) => Promise<ComputerDriver>
  /**
   * Free what the threads share, like the browser.
   * `createComputerUse(...).close()` with no thread id calls this.
   */
  close?: () => Promise<void>
}
