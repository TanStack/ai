import { renderMermaidASCII } from 'beautiful-mermaid'
import { Marked } from 'marked'
import { markedTerminal } from 'marked-terminal'

// A closed ```mermaid block. An open one (still streaming) stays code.
const MERMAID = /```mermaid[^\n]*\n([\s\S]*?)```/g

// One parser for each width: marked-terminal wraps text to the width.
const parsers = new Map<number, Marked>()
function parserFor(width: number) {
  let parser = parsers.get(width)
  if (!parser) {
    parser = new Marked(
      markedTerminal({
        width,
        reflowText: true,
        tab: 2,
        emoji: false,
        showSectionPrefix: false,
      }),
      {
        renderer: {
          // ponytail: marked-terminal 7 prints the text of a list item as it
          // is, so `**bold**` in a list stays raw. This parses it.
          text(token) {
            return 'tokens' in token && token.tokens
              ? this.parser.parseInline(token.tokens)
              : token.text
          },
        },
      },
    )
    parsers.set(width, parser)
  }
  return parser
}

/**
 * Markdown as terminal text, `width` columns wide: headings, lists, tables,
 * links, and highlighted code. A Mermaid block becomes a chart drawn in text.
 * A chart that does not parse stays a code block.
 */
export function renderMarkdown(text: string, width: number) {
  const charts: Array<string> = []
  const source = text.replace(MERMAID, (block, code: string) => {
    try {
      charts.push(renderMermaidASCII(code))
      // A plain word marked-terminal keeps as it is, in its own paragraph.
      return `\n\nMERMAIDCHART${charts.length - 1}\n\n`
    } catch {
      return block
    }
  })
  return (
    parserFor(Math.max(20, width))
      // An open (still streaming) Mermaid block shows as plain code.
      .parse(source.replace(/```mermaid/g, '```'), { async: false })
      .replace(
        /MERMAIDCHART(\d+)/g,
        (_match, index: string) => charts[Number(index)] ?? '',
      )
      .trimEnd()
  )
}
