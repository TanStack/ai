---
'@tanstack/ai-openai': minor
---

Add `azureOpenaiText()`, a text adapter for the Azure OpenAI Responses API. It uses the `AzureOpenAI` client of the `openai` SDK and sends the key in the `api-key` header.

- Set the endpoint with `baseURL` or `resourceName`. The adapter changes an Azure host URL to the `/openai/v1` path.
- Explicit config wins over the `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_BASE_URL`, `AZURE_OPENAI_RESOURCE_NAME`, and `AZURE_OPENAI_API_VERSION` environment variables. `apiVersion` is `v1` by default.
- `deploymentName`, `deploymentNameMap`, or the `AZURE_OPENAI_DEPLOYMENT_NAME_MAP` environment variable sets the deployment. The adapter sends the deployment name as the model on the wire. The adapter reads only the own entries of `deploymentNameMap`.
- The config does not take the `openai` client options that `AzureOpenAI` refuses.
