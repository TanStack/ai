import type { ThemeRegistration } from 'shiki'

/**
 * Custom shiki theme matched to the orchestrator terminal's palette
 * (ink/bone/citron/rust/moss + warm taupes). Lifted from styles.css's
 * `@theme` tokens so a palette change in CSS only needs to be mirrored
 * here, not chased across both surfaces.
 */
export const tanstackInkTheme: ThemeRegistration = {
  name: 'tanstack-ink',
  type: 'dark',
  colors: {
    'editor.background': '#1d1916',
    'editor.foreground': '#e8dfd1',
    'editorLineNumber.foreground': '#6a5f53',
  },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#6a5f53', fontStyle: 'italic' } },
    { scope: ['variable'], settings: { foreground: '#e8dfd1' } },
    { scope: ['string', 'string.quoted'], settings: { foreground: '#a8b86b' } },
    { scope: ['string.regexp'], settings: { foreground: '#c84b1c' } },
    { scope: ['constant.numeric', 'constant.language'], settings: { foreground: '#c84b1c' } },
    { scope: ['constant.character.escape'], settings: { foreground: '#d8ad00' } },
    { scope: ['keyword', 'storage.type', 'storage.modifier'], settings: { foreground: '#ffce00' } },
    { scope: ['keyword.control', 'keyword.operator'], settings: { foreground: '#ffce00' } },
    { scope: ['entity.name.function', 'meta.function-call.generic', 'support.function'], settings: { foreground: '#ffce00' } },
    { scope: ['entity.name.class', 'entity.name.type', 'support.class', 'support.type'], settings: { foreground: '#d8ad00' } },
    { scope: ['entity.other.attribute-name'], settings: { foreground: '#a8b86b' } },
    { scope: ['entity.name.tag'], settings: { foreground: '#ffce00' } },
    { scope: ['punctuation'], settings: { foreground: '#93887a' } },
    { scope: ['punctuation.section.embedded', 'punctuation.definition.template-expression'], settings: { foreground: '#c84b1c' } },
    { scope: ['variable.parameter'], settings: { foreground: '#e8dfd1' } },
    { scope: ['variable.other.object', 'variable.other.property'], settings: { foreground: '#e8dfd1' } },

    // ── diff ───────────────────────────────────────────────────────────
    // shiki emits `markup.inserted` / `markup.deleted` / `markup.changed`
    // for unified-diff bodies; the header (`@@ …`, `+++ b/foo`) uses
    // `meta.diff.header`.
    { scope: ['markup.inserted', 'meta.diff.inserted'], settings: { foreground: '#a8b86b' } },
    { scope: ['markup.deleted', 'meta.diff.deleted'], settings: { foreground: '#c84b1c' } },
    { scope: ['markup.changed'], settings: { foreground: '#d8ad00' } },
    { scope: ['meta.diff.header', 'meta.diff.range'], settings: { foreground: '#ffce00', fontStyle: 'italic' } },
    { scope: ['meta.diff.index'], settings: { foreground: '#6a5f53' } },

    // ── markdown ───────────────────────────────────────────────────────
    { scope: ['markup.heading'], settings: { foreground: '#ffce00', fontStyle: 'bold' } },
    { scope: ['markup.italic'], settings: { fontStyle: 'italic' } },
    { scope: ['markup.bold'], settings: { fontStyle: 'bold' } },
    { scope: ['markup.fenced_code', 'markup.inline.raw'], settings: { foreground: '#a8b86b' } },
    { scope: ['markup.list.numbered', 'markup.list.unnumbered'], settings: { foreground: '#93887a' } },
    { scope: ['markup.underline.link'], settings: { foreground: '#d8ad00' } },
  ],
}
