/**
 * Local tool-config wire shapes for the OpenAI Responses API tool catalogue.
 *
 * Each interface here matches the OpenAI Responses API tool wire format
 * (the `type` discriminator + the documented config fields). Don't add
 * `[key: string]: unknown` to these — it makes `keyof T` resolve to `string`,
 * so `Omit<ToolConfig, 'type'>` drops every named required field along with
 * `type`. The convert-from-metadata helpers in `src/tools/*.ts` rely on that
 * `Omit` pattern.
 */

import type { Tool } from '@tanstack/ai'

export type { Tool }

// ─────────────────────────────────────────────────────────────────────────
// Apply Patch
// ─────────────────────────────────────────────────────────────────────────

export interface ApplyPatchToolConfig {
  type: 'apply_patch'
}

// ─────────────────────────────────────────────────────────────────────────
// Code Interpreter
// ─────────────────────────────────────────────────────────────────────────

export interface CodeInterpreterToolConfig {
  type: 'code_interpreter'
  container: string | { type: 'auto'; file_ids?: Array<string> }
}

// ─────────────────────────────────────────────────────────────────────────
// Computer Use
// ─────────────────────────────────────────────────────────────────────────

export interface ComputerUseToolConfig {
  type: 'computer_use_preview'
  display_width: number
  display_height: number
  environment: 'mac' | 'windows' | 'ubuntu' | 'linux' | 'browser'
}

// ─────────────────────────────────────────────────────────────────────────
// Custom (free-form tool with grammar/format)
// ─────────────────────────────────────────────────────────────────────────

export interface CustomToolConfig {
  type: 'custom'
  name: string
  description?: string
  format?:
    | { type: 'text' }
    | {
        type: 'grammar'
        grammar: { definition: string; syntax: 'lark' | 'regex' }
      }
}

// ─────────────────────────────────────────────────────────────────────────
// File Search
// ─────────────────────────────────────────────────────────────────────────

export interface FileSearchToolConfig {
  type: 'file_search'
  vector_store_ids: Array<string>
  max_num_results?: number
  ranking_options?: {
    ranker?: string
    score_threshold?: number
  }
  filters?: unknown
}

// ─────────────────────────────────────────────────────────────────────────
// Function (Responses-flavoured; flatter than Chat Completions)
// ─────────────────────────────────────────────────────────────────────────

export interface FunctionToolConfig {
  type: 'function'
  name: string
  description?: string | null
  parameters: Record<string, unknown> | null
  strict: boolean | null
}

// ─────────────────────────────────────────────────────────────────────────
// Image Generation
// ─────────────────────────────────────────────────────────────────────────

export interface ImageGenerationToolConfig {
  type: 'image_generation'
  background?: 'transparent' | 'opaque' | 'auto'
  model?: string
  moderation?: 'auto' | 'low'
  output_compression?: number
  output_format?: 'png' | 'webp' | 'jpeg'
  partial_images?: number
  quality?: 'low' | 'medium' | 'high' | 'auto'
  size?: '1024x1024' | '1024x1536' | '1536x1024' | 'auto'
}

// ─────────────────────────────────────────────────────────────────────────
// Local Shell
// ─────────────────────────────────────────────────────────────────────────

export interface LocalShellToolConfig {
  type: 'local_shell'
}

// ─────────────────────────────────────────────────────────────────────────
// MCP
// ─────────────────────────────────────────────────────────────────────────

export interface MCPToolConfig {
  type: 'mcp'
  server_label: string
  server_description?: string
  server_url?: string
  connector_id?: string
  authorization?: string
  headers?: Record<string, string> | null
  require_approval?: unknown
  allowed_tools?: unknown
}

// ─────────────────────────────────────────────────────────────────────────
// Shell (function-shaped shell — distinct from local_shell)
// ─────────────────────────────────────────────────────────────────────────

export interface ShellToolConfig {
  type: 'shell'
}

// ─────────────────────────────────────────────────────────────────────────
// Web Search (branded)
// ─────────────────────────────────────────────────────────────────────────

export interface WebSearchToolConfig {
  type: 'web_search'
  filters?: { allowed_domains?: Array<string> } | null
  user_location?: {
    type: 'approximate'
    city?: string
    country?: string
    region?: string
    timezone?: string
  } | null
  search_context_size?: 'low' | 'medium' | 'high'
}

// ─────────────────────────────────────────────────────────────────────────
// Web Search Preview
// ─────────────────────────────────────────────────────────────────────────

export interface WebSearchPreviewToolConfig {
  type: 'web_search_preview'
  search_context_size?: 'low' | 'medium' | 'high'
  user_location?: {
    type: 'approximate'
    city?: string
    country?: string
    region?: string
    timezone?: string
  } | null
}
