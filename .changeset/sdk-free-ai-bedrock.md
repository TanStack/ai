---
'@tanstack/ai-bedrock': minor
---

`@aws-sdk/client-bedrock-runtime` and `@aws-sdk/credential-providers` are now optional peer dependencies. Bundles that do not use them are smaller.

- If you use the Converse API (the default `api: 'converse'`) or embeddings, install `@aws-sdk/client-bedrock-runtime`.
- If you use SigV4 auth from the AWS credential chain (no API key), install `@aws-sdk/credential-providers`.
- If a package is missing, the first request throws an error that names the package to install.

The Chat Completions and Responses APIs sign SigV4 requests in the adapter and call Bedrock with `fetch`. They do not load the `openai` SDK at runtime.
