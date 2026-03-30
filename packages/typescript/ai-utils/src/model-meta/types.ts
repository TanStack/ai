export type Modality = 'text' | 'image' | 'audio' | 'video' | 'document'

export interface ModelMeta<TProviderOptions = unknown> {
  name: string
  supports: {
    input: Array<Modality>
    output: Array<Modality>
    endpoints?: Array<string>
    features?: Array<string>
    tools?: Array<string>
  }
  context_window?: number
  max_output_tokens?: number
  knowledge_cutoff?: string
  pricing?: {
    input: { normal: number; cached?: number }
    output: { normal: number }
  }
  providerOptions?: TProviderOptions
}
