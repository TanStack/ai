---
'@tanstack/ai-openai': minor
---

Add the Azure OpenAI Responses text adapter. It uses the `AzureOpenAI` client of the `openai` SDK and sends the key in the `api-key` header. It has two factories, the same as the other adapters:

- `createAzureOpenaiText(model, apiKey, config)` takes the key as an argument and reads nothing from the environment.
- `azureOpenaiText(model, config?)` reads the key from `AZURE_OPENAI_API_KEY` and throws when it is not set. Values that the config does not set come from `AZURE_OPENAI_BASE_URL` or `AZURE_OPENAI_RESOURCE_NAME`, `AZURE_OPENAI_API_VERSION`, and `AZURE_OPENAI_DEPLOYMENT_NAME_MAP`.

Other details:

- Set the endpoint with `baseURL` or `resourceName`. The adapter changes an Azure host URL to the `/openai/v1` path. `apiVersion` is `v1` by default.
- `deploymentName` or `deploymentNameMap` sets the deployment. The adapter sends the deployment name as the model on the wire. It reads only the own entries of `deploymentNameMap`.
- The config does not take the `openai` client options that `AzureOpenAI` refuses.
