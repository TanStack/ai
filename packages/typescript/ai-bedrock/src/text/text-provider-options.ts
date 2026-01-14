export interface BedrockMCPOptions {
    /**
     * MCP servers to be utilized in this request
     * Maximum of 20 servers
     */
    mcp_servers?: Array<MCPServer>
}

export interface BedrockStopSequencesOptions {
    /**
     * Custom text sequences that will cause the model to stop generating.
     */
    stop_sequences?: Array<string>
}

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

export interface BedrockSamplingOptions {
    /**
     * Only sample from the top K options for each subsequent token.
     */
    top_k?: number
}

export interface BedrockInferenceConfig {
    maxTokens?: number
    temperature?: number
    topP?: number
    stopSequences?: Array<string>
}

export interface MCPServer {
    name: string
    url: string
    type: 'url'
    authorization_token?: string | null
    tool_configuration: {
        allowed_tools?: Array<string> | null
        enabled?: boolean | null
    } | null
}

export type BedrockTextProviderOptions = BedrockMCPOptions &
    BedrockStopSequencesOptions &
    BedrockThinkingOptions &
    BedrockSamplingOptions & {
        /** Additional inference configuration for Bedrock */
        inferenceConfig?: BedrockInferenceConfig
    }
