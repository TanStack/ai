/**
 * Open Generative UI Specification (Draft 0.1)
 * UIDriver implementations: FixtureDriver, ProgrammaticDriver, LiveDriver (§7).
 */

import type { UIDriver, UIRequest, GraphDocument, UINode } from '../types'
import { CANONICAL_FIXTURES } from '../fixtures'
import { validateGraph } from '../validator'
import { GRAPH_DOCUMENT_SCHEMA } from '../schema'

/**
 * 7.1 Fixture driver (mock) — the test backbone
 * Returns canned, schema-valid graphs without network or LLM dependency.
 */
export class FixtureDriver implements UIDriver {
  private readonly fixtures: Record<string, GraphDocument>

  constructor(customFixtures: Record<string, GraphDocument> = {}) {
    this.fixtures = { ...CANONICAL_FIXTURES, ...customFixtures }
  }

  async render(request: UIRequest): Promise<GraphDocument> {
    const key = request.scenario || 'compare-plans-basic'
    const fixture = this.fixtures[key]
    if (!fixture) {
      throw new Error(
        `[FixtureDriver] Unknown scenario: "${key}". Available scenarios: ${Object.keys(this.fixtures).join(', ')}`,
      )
    }
    return JSON.parse(JSON.stringify(fixture))
  }

  listScenarios(): Array<string> {
    return Object.keys(this.fixtures)
  }
}

/**
 * 7.2 Programmatic driver
 * Construct graphs directly with type-safety and no model in the loop.
 */
export class ProgrammaticDriver implements UIDriver {
  constructor(private readonly builder?: (req: UIRequest) => GraphDocument) {}

  async render(request: UIRequest): Promise<GraphDocument> {
    if (this.builder) {
      const graph = this.builder(request)
      const res = validateGraph(graph)
      if (!res.valid || !res.graph) {
        throw new Error(
          `[ProgrammaticDriver] Built invalid graph: ${res.errors.join(', ')}`,
        )
      }
      return res.graph
    }

    // Default programmatic graph generator
    const title = request.job || 'Programmatic Interface'
    return {
      specVersion: '0.1',
      graphId: `g_prog_${Date.now()}`,
      revision: 1,
      title,
      fallbackText: `${title}: Data presented programmatically.`,
      provenance: {
        driver: 'programmatic',
      },
      root: {
        id: 'root-stack',
        type: 'Stack',
        props: { gap: 'md' },
        children: [
          {
            id: 'job-heading',
            type: 'Text',
            props: { content: title, variant: 'heading' },
          },
        ],
      },
    }
  }

  static createBuilder(title: string, fallbackText: string) {
    let nextId = 1
    const rootNodes: Array<UINode> = []

    return {
      addText(
        content: string,
        variant: 'body' | 'heading' | 'caption' = 'body',
      ) {
        rootNodes.push({
          id: `n_${nextId++}`,
          type: 'Text',
          props: { content, variant },
        })
        return this
      },
      addMetric(
        label: string,
        value: string | number,
        delta?: string,
        tone?: 'positive' | 'negative' | 'neutral',
      ) {
        rootNodes.push({
          id: `n_${nextId++}`,
          type: 'Metric',
          props: { label, value, delta, tone },
        })
        return this
      },
      addButton(label: string, intent: string, payload?: unknown) {
        rootNodes.push({
          id: `n_${nextId++}`,
          type: 'Button',
          props: { label },
          on: { click: { intent, payload } },
        })
        return this
      },
      build(): GraphDocument {
        return {
          specVersion: '0.1',
          graphId: `g_prog_${Date.now()}`,
          revision: 1,
          title,
          fallbackText,
          provenance: { driver: 'programmatic' },
          root: {
            id: 'root',
            type: 'Stack',
            props: { gap: 'md' },
            children: rootNodes,
          },
        }
      },
    }
  }
}

/**
 * 7.3 Live driver
 * Tool schema definition and output validator for model-driven UI generation.
 */
export class LiveDriver {
  /**
   * Tool definition for model calling (e.g. OpenAI / Anthropic / Gemini tool schema)
   */
  static getRenderToolDefinition() {
    return {
      name: 'render_ui',
      description:
        'Compose an interactive generative user interface to serve the user request. Returns a validated Open Generative UI graph document.',
      parameters: GRAPH_DOCUMENT_SCHEMA,
    }
  }

  /**
   * Validates and repairs the raw output emitted by the LLM tool call.
   */
  static processModelOutput(rawGraph: unknown): GraphDocument {
    const result = validateGraph(rawGraph, { repair: true })
    if (result.valid && result.graph) {
      return result.graph
    }

    // If unrepairable, produce safe text fallback node
    const fallbackText =
      typeof (rawGraph as any)?.fallbackText === 'string'
        ? (rawGraph as any).fallbackText
        : 'The interface could not be rendered.'

    return {
      specVersion: '0.1',
      graphId: `g_fallback_${Date.now()}`,
      revision: 1,
      title: 'Interface Notice',
      fallbackText,
      provenance: { driver: 'live' },
      root: {
        id: 'root-fallback',
        type: 'Callout',
        props: {
          tone: 'warning',
          title: 'Interface Fallback',
          text: fallbackText,
        },
      },
    }
  }
}
