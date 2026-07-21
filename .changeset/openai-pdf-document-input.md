---
'@tanstack/openai-base': minor
'@tanstack/ai-openai': minor
---

feat(ai-openai): support PDF `document` content parts in the Responses adapter.

`openaiText`'s Responses adapter now accepts PDF `document` content parts, for any model whose `model-meta` entry declares the `document` input modality. Base64 data sources are sent as `input_file` with a `file_data` data URL and a `filename` (from `metadata.filename`, defaulting to `document.pdf`). URL sources are sent as `input_file` with `file_url`.

```ts
const adapter = openaiText('gpt-5.5')

const message = {
  role: 'user',
  content: [
    { type: 'text', content: 'Summarize this document' },
    {
      type: 'document',
      source: { type: 'data', value: pdfBase64, mimeType: 'application/pdf' },
      metadata: { filename: 'report.pdf' },
    },
  ],
}
```

Non-PDF MIME types are rejected before the request is sent — including pre-wrapped `data:` URLs whose media type disagrees with `mimeType` — so callers get an actionable message instead of an opaque provider `400`. `OpenAIDocumentMetadata` gains `filename` and `detail`. The Chat Completions adapter throws a document-specific error pointing here, since documents are Responses-only.
