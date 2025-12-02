import { ChatRequest } from 'ollama'

export interface OllamaApiOptions {
  stop: Array<string>
  num_predict: number
}
