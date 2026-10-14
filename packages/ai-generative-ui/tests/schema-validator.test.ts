import { describe, it, expect } from 'vitest'
import {
  validateGraph,
  isValidSvgPath,
  CANONICAL_FIXTURES,
} from '../src/index'

describe('Schema Validator and Bounded Repair (§9.3)', () => {
  it('validates all 9 canonical fixtures successfully', () => {
    for (const [name, fixture] of Object.entries(CANONICAL_FIXTURES)) {
      const result = validateGraph(fixture, { repair: false })
      expect(result.valid, `Fixture "${name}" should be schema-valid: ${result.errors.join(', ')}`).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.graph?.fallbackText).toBeDefined()
      expect(result.graph?.fallbackText.length).toBeGreaterThan(0)
    }
  })

  it('degrades unknown container type to Stack', () => {
    const unknownContainer = {
      specVersion: '0.1',
      graphId: 'g_test',
      revision: 1,
      title: 'Unknown Container Test',
      fallbackText: 'Testing degradation',
      provenance: { driver: 'fixture' },
      root: {
        id: 'n_mystery',
        type: 'HoloDeckContainer',
        children: [
          { id: 'n_child', type: 'Text', props: { content: 'Child item' } },
        ],
      },
    }

    const result = validateGraph(unknownContainer, { repair: true })
    expect(result.valid).toBe(true)
    expect(result.graph?.root.type).toBe('Stack')
    expect(result.graph?.root.children?.[0]?.id).toBe('n_child')
    expect(result.repairs.some((r) => r.includes('Degraded unknown container'))).toBe(true)
  })

  it('degrades unknown leaf node to Text', () => {
    const unknownLeaf = {
      specVersion: '0.1',
      graphId: 'g_test',
      revision: 1,
      title: 'Unknown Leaf Test',
      fallbackText: 'Testing degradation',
      provenance: { driver: 'fixture' },
      root: {
        id: 'n_mystery_leaf',
        type: 'QuantumWidget',
      },
    }

    const result = validateGraph(unknownLeaf, { repair: true })
    expect(result.valid).toBe(true)
    expect(result.graph?.root.type).toBe('Text')
    expect(result.repairs.some((r) => r.includes('Degraded unknown leaf'))).toBe(true)
  })

  it('repairs inverted slider min/max bounds', () => {
    const invertedSlider = {
      specVersion: '0.1',
      graphId: 'g_slider',
      revision: 1,
      title: 'Slider Test',
      fallbackText: 'Inverted slider',
      provenance: { driver: 'fixture' },
      root: {
        id: 'n_slider',
        type: 'Slider',
        props: { min: 100, max: 10 },
      },
    }

    const result = validateGraph(invertedSlider, { repair: true })
    expect(result.valid).toBe(true)
    expect(result.graph?.root.props?.min).toBe(10)
    expect(result.graph?.root.props?.max).toBe(100)
    expect(result.repairs.some((r) => r.includes('Swapped inverted Slider'))).toBe(true)
  })

  it('validates SVG path grammar and drops malicious/broken paths (§6.4.1)', () => {
    expect(isValidSvgPath('M 10 10 L 20 20 Z')).toBe(true)
    expect(isValidSvgPath('M0,0 L10,10 C20,20 40,40 50,50 Z')).toBe(true)
    expect(isValidSvgPath('<script>alert(1)</script>')).toBe(false)
    expect(isValidSvgPath('javascript:doBadStuff()')).toBe(false)

    const sceneWithBadPath = {
      specVersion: '0.1',
      graphId: 'g_scene',
      revision: 1,
      title: 'Scene Test',
      fallbackText: 'Scene with bad path',
      provenance: { driver: 'fixture' },
      root: {
        id: 'n_scene',
        type: 'Scene',
        props: {
          viewBox: '0 0 200 200',
          shapes: [
            { kind: 'circle', cx: 50, cy: 50, r: 10 },
            { kind: 'path', d: '<script>alert("xss")</script>' },
          ],
        },
      },
    }

    const result = validateGraph(sceneWithBadPath, { repair: true })
    expect(result.valid).toBe(true)
    const shapes = result.graph?.root.props?.shapes
    expect(shapes).toHaveLength(1)
    expect(shapes[0].kind).toBe('circle')
    expect(result.repairs.some((r) => r.includes('Dropped invalid or unsafe SVG path'))).toBe(true)
  })

  it('synthesizes missing fallbackText', () => {
    const missingFallback = {
      specVersion: '0.1',
      graphId: 'g_text',
      revision: 1,
      title: 'Checkout Summary',
      provenance: { driver: 'fixture' },
      root: {
        id: 'n_text',
        type: 'Text',
        props: { content: 'Total is $45.00' },
      },
    }

    const result = validateGraph(missingFallback, { repair: true })
    expect(result.valid).toBe(true)
    expect(result.graph?.fallbackText).toContain('Total is $45.00')
    expect(result.repairs.some((r) => r.includes('Synthesized missing fallbackText'))).toBe(true)
  })

  it('normalizes vector shapes accidentally placed in Scene children into props.shapes', () => {
    const sceneWithChildren = {
      specVersion: '0.1',
      graphId: 'g_guitar',
      revision: 1,
      title: 'Guitar Diagram',
      fallbackText: 'Guitar diagram',
      provenance: { driver: 'live' },
      root: {
        id: 'chord-diagram',
        type: 'Scene',
        props: { width: 300, height: 360 },
        children: [
          { type: 'rect', x: 20, y: 20, width: 200, height: 300 },
          { type: 'line', x1: 20, y1: 50, x2: 220, y2: 50 },
          { type: 'circle', cx: 80, cy: 100, r: 10, fill: 'accent' },
        ],
      },
    }

    const result = validateGraph(sceneWithChildren, { repair: true })
    expect(result.valid).toBe(true)
    expect(result.graph?.root.type).toBe('Scene')
    expect(result.graph?.root.children).toBeUndefined()
    expect(result.graph?.root.props?.shapes).toHaveLength(3)
    expect(result.graph?.root.props?.shapes[0].kind).toBe('rect')
    expect(result.graph?.root.props?.shapes[1].kind).toBe('line')
    expect(result.graph?.root.props?.shapes[2].kind).toBe('circle')
    expect(result.repairs.some((r) => r.includes('Normalized 3 vector shape(s)'))).toBe(true)
  })
})
