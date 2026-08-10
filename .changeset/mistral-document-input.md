---
'@tanstack/ai-mistral': minor
---

Support document (PDF) input for Mistral vision models via `document_url`. The text adapter now maps `document` content parts to Mistral's `document_url` format (hosted URLs pass through; inline bytes are wrapped in a `data:` URL, mirroring image handling), and `document` is declared as an input modality for the vision-capable models. Previously any `document` content part threw "Supported types: text, image".
