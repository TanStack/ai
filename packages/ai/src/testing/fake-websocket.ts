/** One socket created by a `fakeWebSocket()` constructor. */
export interface FakeSocket {
  readonly url: string
  readonly protocols?: string | Array<string>
  /** Everything the adapter sent: strings for text frames, bytes for binary. */
  readonly sent: Array<string | Uint8Array>
  /** Text frames the adapter sent, parsed as JSON. */
  json: () => Array<unknown>
  /** Open the socket, as the server would. */
  open: () => void
  /** Deliver a server message. Objects are sent as JSON text frames. */
  receive: (message: unknown) => void
  /** Close the socket from the server side. */
  serverClose: (code?: number, reason?: string) => void
}

/**
 * A fake WebSocket constructor for live adapter tests. Pass `WebSocket` to the
 * adapter config, then drive each socket from `sockets`.
 *
 * @example
 * ```ts
 * const ws = fakeWebSocket()
 * const adapter = deepgramLiveTranscription('nova-3', { apiKey: 'k', WebSocket: ws.WebSocket })
 * const opening = transcriptionSession({ adapter, audio })
 * ws.sockets[0].open()
 * const session = await opening
 * ```
 */
export function fakeWebSocket() {
  const sockets: Array<FakeSocket> = []

  class FakeWebSocketImpl extends EventTarget {
    readyState = 0
    binaryType = 'blob'
    constructor(url: string, protocols?: string | Array<string>) {
      super()
      const self = this
      const sent: Array<string | Uint8Array> = []
      this.fake = {
        url,
        protocols,
        sent,
        json: () =>
          sent.filter((s) => typeof s === 'string').map((s) => JSON.parse(s)),
        open() {
          self.readyState = 1
          self.dispatchEvent(new Event('open'))
        },
        receive(message) {
          const event = new Event('message') as MessageEvent
          Object.defineProperty(event, 'data', {
            value:
              typeof message === 'string' ? message : JSON.stringify(message),
          })
          self.dispatchEvent(event)
        },
        serverClose(code = 1000, reason = '') {
          self.readyState = 3
          const event = new Event('close') as CloseEvent
          Object.defineProperty(event, 'code', { value: code })
          Object.defineProperty(event, 'reason', { value: reason })
          self.dispatchEvent(event)
        },
      }
      sockets.push(this.fake)
    }
    private readonly fake: FakeSocket
    send(data: string | Uint8Array) {
      this.fake.sent.push(typeof data === 'string' ? data : data.slice())
    }
    close(code = 1000) {
      if (this.readyState < 2) this.fake.serverClose(code)
    }
  }

  return {
    // oxlint-disable-next-line eslint-js/no-restricted-syntax -- the fake implements only the WebSocket members adapters use
    WebSocket: FakeWebSocketImpl as unknown as new (
      url: string,
      protocols?: string | Array<string>,
    ) => WebSocket,
    sockets,
  }
}
