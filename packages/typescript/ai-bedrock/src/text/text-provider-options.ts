/** Provider options controlling stop sequences for Bedrock models. */
export interface BedrockStopSequencesOptions {
    /**
     * Custom text sequences that will cause the model to stop generating.
     */
    stop_sequences?: Array<string>
}

/** Provider options for enabling or disabling extended thinking on Claude models. */
export interface BedrockThinkingOptions {
    /**
       * Configuration for enabling Claude's extended thinking.
       */
    thinking?:
    | {
        /**
         * Determines how many tokens the model can use for its internal reasoning process.
         */
        budget_tokens: number
        type: 'enabled'
    }
    | {
        type: 'disabled'
    }
}

/** Provider options for token sampling on Bedrock models. */
export interface BedrockSamplingOptions {
    /**
     * Only sample from the top K options for each subsequent token.
     */
    top_k?: number
}

/**
 * Inference configuration passed directly to the Bedrock ConverseStream API.
 * These override the top-level `maxTokens`, `temperature`, and `topP` options.
 */
export interface BedrockInferenceConfig {
    /** Maximum number of tokens to generate. */
    maxTokens?: number
    /** Sampling temperature (0–1). Higher values produce more varied output. */
    temperature?: number
    /** Nucleus sampling probability (0–1). */
    topP?: number
    /** Text sequences that cause the model to stop generating. */
    stopSequences?: Array<string>
}

/**
 * All provider-specific options for Bedrock text generation requests.
 * Combines stop sequences, thinking, sampling, and low-level inference config.
 */
export type BedrockTextProviderOptions =
    BedrockStopSequencesOptions &
    BedrockThinkingOptions &
    BedrockSamplingOptions & {
        /** Additional inference configuration for Bedrock */
        inferenceConfig?: BedrockInferenceConfig
    }
