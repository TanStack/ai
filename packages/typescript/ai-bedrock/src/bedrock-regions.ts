/**
 * AWS Bedrock inference profile geography resolution.
 *
 * Cross-region inference profiles use geographic prefixes (us., eu., apac., global.)
 * to route requests across AWS regions within a geography.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html
 */

/** Geographic regions for cross-region inference profiles */
export type InferenceProfileGeography = 'us' | 'eu' | 'apac' | 'global'

/** Inference profile configuration for a model */
export interface InferenceProfileConfig {
  /** Which geographies have inference profiles for this model */
  regions: Array<InferenceProfileGeography>
  /** If true, model must be invoked via inference profile (no direct invocation) */
  required?: boolean
}

/**
 * Maps an AWS region code to its inference profile geography.
 * Returns null for regions that don't map to a specific geography.
 */
export function getProfileGeography(
  awsRegion: string,
): Exclude<InferenceProfileGeography, 'global'> | null {
  if (!awsRegion) return null

  // US regions
  if (awsRegion.startsWith('us-')) return 'us'

  // EU regions (includes Middle East and Africa which AWS groups with EU)
  if (
    awsRegion.startsWith('eu-') ||
    awsRegion.startsWith('me-') ||
    awsRegion.startsWith('af-') ||
    awsRegion.startsWith('il-')
  ) {
    return 'eu'
  }

  // APAC regions
  if (awsRegion.startsWith('ap-')) return 'apac'

  // Regions that don't map to a specific geography (ca-, sa-, mx-, etc.)
  // These need explicit config or global profiles
  return null
}
