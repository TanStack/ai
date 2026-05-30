/**
 * Fetches the Bedrock foundation-model + inference-profile catalog and prints
 * the chat-capable invocation IDs and cross-region inference-profile IDs so a
 * maintainer can refresh packages/ai-bedrock/src/model-meta.ts.
 *
 * MAINTAINER-ONLY. Not run in CI. Requires AWS credentials (standard provider
 * chain) with bedrock:List* permissions, and the AWS SDK:
 *   pnpm add -Dw @aws-sdk/client-bedrock      # if not already installed
 *   AWS_REGION=us-east-1 pnpm tsx scripts/fetch-bedrock-models.ts
 *
 * Why manual: ListFoundationModels carries modalities + inference types but no
 * pricing, and per-account/region availability varies. The committed model-meta
 * is a hand-transcribed seed; this script is the long-term source of truth.
 * Responses-capable models are those with Responses=Yes in
 * https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html
 */
import {
  BedrockClient,
  ListFoundationModelsCommand,
  ListInferenceProfilesCommand,
} from '@aws-sdk/client-bedrock'

async function main() {
  const region = process.env['AWS_REGION'] ?? 'us-east-1'
  const client = new BedrockClient({ region })

  const models = await client.send(
    new ListFoundationModelsCommand({ byOutputModality: 'TEXT' }),
  )
  const profiles = await client.send(new ListInferenceProfilesCommand({}))

  const textModels = (models.modelSummaries ?? [])
    .filter((m) => (m.outputModalities ?? []).includes('TEXT'))
    .map((m) => ({
      id: m.modelId ?? '',
      input: (m.inputModalities ?? []).map((x) => x.toLowerCase()),
    }))
    .filter((m) => m.id.length > 0)

  const inferenceProfileIds = (profiles.inferenceProfileSummaries ?? [])
    .map((p) => p.inferenceProfileId ?? '')
    .filter((id) => id.length > 0)

  console.log('# Base foundation text models:')
  for (const m of textModels) console.log(`${m.id}\tinput=${m.input.join(',')}`)
  console.log(
    '\n# Cross-region inference profile IDs (use as `model` for runtime chat):',
  )
  for (const id of inferenceProfileIds.sort()) console.log(id)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
