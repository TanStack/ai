

/**
 * Resolved AWS configuration used to initialise the Bedrock client.
 */
export interface BedrockClientConfig {
    /** AWS region (e.g. `'us-east-1'`). */
    region?: string
    /** AWS credentials. */
    credentials?: {
        /** AWS access key ID. */
        accessKeyId: string
        /** AWS secret access key. */
        secretAccessKey: string
        /** Temporary session token (for STS / assumed roles). */
        sessionToken?: string
    }
}

/**
 * Gets Bedrock config from environment variables
 */
export function getBedrockConfigFromEnv(): BedrockClientConfig {
    const env =
        typeof globalThis !== 'undefined' && (globalThis as any).window?.env
            ? (globalThis as any).window.env
            : typeof process !== 'undefined'
                ? process.env
                : undefined

    const config: BedrockClientConfig = {}

    if (env?.AWS_REGION || env?.AWS_DEFAULT_REGION) {
        config.region = env.AWS_REGION || env.AWS_DEFAULT_REGION
    }

    if (env?.AWS_ACCESS_KEY_ID && env?.AWS_SECRET_ACCESS_KEY) {
        config.credentials = {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            sessionToken: env.AWS_SESSION_TOKEN
        }
    }

    return config
}
