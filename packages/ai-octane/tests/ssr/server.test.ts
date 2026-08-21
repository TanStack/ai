import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'octane/server'
import { ServerChat } from '../_fixtures/server.tsrx'

describe('@tanstack/ai-octane SSR', () => {
  it('renders the initial chat snapshot without a DOM', () => {
    expect(typeof document).toBe('undefined')

    const { html, css } = renderToStaticMarkup(ServerChat)

    expect(html).toBe('<ul id="messages"><li>Hello Ada</li></ul>')
    expect(css).toBe('')
  })
})
