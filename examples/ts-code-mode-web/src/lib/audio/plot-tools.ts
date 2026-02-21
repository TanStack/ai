import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import type { ToolExecutionContext } from '@tanstack/ai'

/**
 * Plot Tools
 * 
 * Visualization tools that emit structured data for the client to render.
 * Each tool returns an artifact that gets displayed in the chat UI.
 */

// Common schema for highlight markers
const highlightSchema = z.object({
  frequency: z.number().optional(),
  x: z.number().optional(),
  label: z.string().optional(),
  color: z.string().optional(),
})

/**
 * Plot frequency spectrum
 */
export const plotSpectrumTool = toolDefinition({
  name: 'plot_spectrum',
  description: 'Plot a frequency spectrum with optional highlights. Uses log scale for frequency axis.',
  inputSchema: z.object({
    frequencies: z.array(z.number()).describe('Frequency values in Hz'),
    magnitudes: z.array(z.number()).describe('Magnitude values in dB'),
    title: z.string().optional().describe('Chart title'),
    xMin: z.number().optional().describe('Minimum frequency (default 20 Hz)'),
    xMax: z.number().optional().describe('Maximum frequency (default 20000 Hz)'),
    yMin: z.number().optional().describe('Minimum dB'),
    yMax: z.number().optional().describe('Maximum dB'),
    highlights: z.array(highlightSchema).optional().describe('Frequencies to highlight'),
  }),
  outputSchema: z.object({
    plotId: z.string(),
    type: z.literal('spectrum'),
  }),
}).server((input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  const plotId = `plot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  
  emitCustomEvent('plot:render', {
    plotId,
    type: 'spectrum',
    data: {
      frequencies: input.frequencies,
      magnitudes: input.magnitudes,
      title: input.title || 'Frequency Spectrum',
      xMin: input.xMin ?? 20,
      xMax: input.xMax ?? 20000,
      yMin: input.yMin,
      yMax: input.yMax,
      highlights: input.highlights,
    },
  })
  
  return { plotId, type: 'spectrum' as const }
})

/**
 * Plot waveform
 */
export const plotWaveformTool = toolDefinition({
  name: 'plot_waveform',
  description: 'Plot an audio waveform in the time domain.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
    sampleRate: z.number().describe('Sample rate in Hz'),
    title: z.string().optional().describe('Chart title'),
    startTime: z.number().optional().describe('Start time in seconds'),
    endTime: z.number().optional().describe('End time in seconds'),
    highlights: z.array(z.object({
      start: z.number(),
      end: z.number(),
      label: z.string().optional(),
      color: z.string().optional(),
    })).optional().describe('Time regions to highlight'),
  }),
  outputSchema: z.object({
    plotId: z.string(),
    type: z.literal('waveform'),
  }),
}).server((input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  const plotId = `plot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  
  // Downsample for display if needed
  const maxPoints = 2000
  let samples = input.samples
  let sampleRate = input.sampleRate
  
  if (samples.length > maxPoints) {
    const ratio = Math.ceil(samples.length / maxPoints)
    samples = samples.filter((_, i) => i % ratio === 0)
    sampleRate = sampleRate / ratio
  }
  
  emitCustomEvent('plot:render', {
    plotId,
    type: 'waveform',
    data: {
      samples,
      sampleRate,
      title: input.title || 'Waveform',
      startTime: input.startTime ?? 0,
      endTime: input.endTime,
      highlights: input.highlights,
    },
  })
  
  return { plotId, type: 'waveform' as const }
})

/**
 * Plot spectrogram
 */
export const plotSpectrogramTool = toolDefinition({
  name: 'plot_spectrogram',
  description: 'Plot a spectrogram (time-frequency representation).',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
    sampleRate: z.number().describe('Sample rate in Hz'),
    title: z.string().optional().describe('Chart title'),
    windowSize: z.number().optional().describe('FFT window size'),
    colorMap: z.enum(['viridis', 'magma', 'inferno', 'plasma']).optional(),
    maxFreq: z.number().optional().describe('Maximum frequency to display'),
  }),
  outputSchema: z.object({
    plotId: z.string(),
    type: z.literal('spectrogram'),
  }),
}).server((input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  const plotId = `plot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  
  const windowSize = input.windowSize || 1024
  const hopSize = windowSize / 4
  
  // Compute STFT for spectrogram
  const spectrogram: number[][] = []
  const times: number[] = []
  const frequencies: number[] = []
  
  // Generate frequency axis
  for (let i = 0; i < windowSize / 2; i++) {
    frequencies.push((i * input.sampleRate) / windowSize)
  }
  
  // Window function
  const window = Array.from({ length: windowSize }, (_, i) => 
    0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSize - 1)))
  )
  
  for (let start = 0; start + windowSize <= input.samples.length; start += hopSize) {
    const segment = input.samples.slice(start, start + windowSize)
    const real = segment.map((s, i) => s * window[i])
    const imag = new Array(windowSize).fill(0)
    
    // Simple FFT
    const n = real.length
    for (let i = 0, j = 0; i < n; i++) {
      if (j > i) {
        [real[i], real[j]] = [real[j], real[i]]
        ;[imag[i], imag[j]] = [imag[j], imag[i]]
      }
      let m = n >> 1
      while (m >= 1 && j >= m) { j -= m; m >>= 1 }
      j += m
    }
    
    for (let len = 2; len <= n; len <<= 1) {
      const halfLen = len >> 1
      const angleStep = (-2 * Math.PI) / len
      for (let i = 0; i < n; i += len) {
        for (let j = 0; j < halfLen; j++) {
          const angle = angleStep * j
          const cos = Math.cos(angle)
          const sin = Math.sin(angle)
          const evenIdx = i + j
          const oddIdx = i + j + halfLen
          const tr = real[oddIdx] * cos - imag[oddIdx] * sin
          const ti = real[oddIdx] * sin + imag[oddIdx] * cos
          real[oddIdx] = real[evenIdx] - tr
          imag[oddIdx] = imag[evenIdx] - ti
          real[evenIdx] += tr
          imag[evenIdx] += ti
        }
      }
    }
    
    const magnitudes = []
    for (let i = 0; i < windowSize / 2; i++) {
      const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / windowSize
      magnitudes.push(20 * Math.log10(Math.max(mag, 1e-10)))
    }
    
    spectrogram.push(magnitudes)
    times.push((start + windowSize / 2) / input.sampleRate)
  }
  
  emitCustomEvent('plot:render', {
    plotId,
    type: 'spectrogram',
    data: {
      spectrogram,
      times,
      frequencies,
      title: input.title || 'Spectrogram',
      colorMap: input.colorMap || 'viridis',
      maxFreq: input.maxFreq,
    },
  })
  
  return { plotId, type: 'spectrogram' as const }
})

/**
 * Generic line chart
 */
export const plotLineTool = toolDefinition({
  name: 'plot_line',
  description: 'Plot a generic line chart.',
  inputSchema: z.object({
    data: z.array(z.object({
      x: z.number(),
      y: z.number(),
    })).describe('Data points'),
    title: z.string().optional(),
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
    xLog: z.boolean().optional(),
    yLog: z.boolean().optional(),
  }),
  outputSchema: z.object({
    plotId: z.string(),
    type: z.literal('line'),
  }),
}).server((input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  const plotId = `plot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  
  emitCustomEvent('plot:render', {
    plotId,
    type: 'line',
    data: input,
  })
  
  return { plotId, type: 'line' as const }
})

/**
 * Bar chart
 */
export const plotBarTool = toolDefinition({
  name: 'plot_bar',
  description: 'Plot a bar chart.',
  inputSchema: z.object({
    data: z.array(z.object({
      label: z.string(),
      value: z.number(),
      color: z.string().optional(),
    })).describe('Bar data'),
    title: z.string().optional(),
    yLabel: z.string().optional(),
    horizontal: z.boolean().optional(),
  }),
  outputSchema: z.object({
    plotId: z.string(),
    type: z.literal('bar'),
  }),
}).server((input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  const plotId = `plot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  
  emitCustomEvent('plot:render', {
    plotId,
    type: 'bar',
    data: input,
  })
  
  return { plotId, type: 'bar' as const }
})

/**
 * Comparison chart (before/after, A/B)
 */
export const plotComparisonTool = toolDefinition({
  name: 'plot_comparison',
  description: 'Plot multiple spectra for comparison (before/after, A/B).',
  inputSchema: z.object({
    series: z.array(z.object({
      label: z.string(),
      frequencies: z.array(z.number()),
      magnitudes: z.array(z.number()),
      color: z.string().optional(),
    })).describe('Series to compare'),
    title: z.string().optional(),
    xMin: z.number().optional(),
    xMax: z.number().optional(),
  }),
  outputSchema: z.object({
    plotId: z.string(),
    type: z.literal('comparison'),
  }),
}).server((input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  const plotId = `plot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  
  emitCustomEvent('plot:render', {
    plotId,
    type: 'comparison',
    data: {
      series: input.series,
      title: input.title || 'Spectrum Comparison',
      xMin: input.xMin ?? 20,
      xMax: input.xMax ?? 20000,
    },
  })
  
  return { plotId, type: 'comparison' as const }
})

/**
 * Results table
 */
export const plotTableTool = toolDefinition({
  name: 'plot_table',
  description: 'Display data in a table format.',
  inputSchema: z.object({
    data: z.array(z.record(z.string(), z.unknown())).describe('Table rows as objects'),
    title: z.string().optional(),
    columns: z.array(z.object({
      key: z.string(),
      label: z.string().optional(),
    })).optional().describe('Column configuration'),
  }),
  outputSchema: z.object({
    plotId: z.string(),
    type: z.literal('table'),
  }),
}).server((input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  const plotId = `plot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  
  emitCustomEvent('plot:render', {
    plotId,
    type: 'table',
    data: input,
  })
  
  return { plotId, type: 'table' as const }
})

// Export all plot tools
export const plotTools = [
  plotSpectrumTool,
  plotWaveformTool,
  plotSpectrogramTool,
  plotLineTool,
  plotBarTool,
  plotComparisonTool,
  plotTableTool,
]

