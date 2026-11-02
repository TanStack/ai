---
'@tanstack/openai-base': patch
---

The adapters now call the provider HTTP API with `fetch` and do not load the provider SDK at runtime. Bundles are smaller. The SDK stays a dependency for its TypeScript types. Errors keep the same classes and fields.

New exports: `createOpenAIClient`, `createAzureOpenAIClient`, and the `OpenAIClientLike` type. Some options still load the `openai` SDK on first use: `workloadIdentity`, `provider`, `dataResidency`, `credential`, `x509Transport`, an admin key with no `apiKey`, and `azureADTokenProvider` on Azure.
