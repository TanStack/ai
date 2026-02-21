import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * Analysis Tools
 * 
 * Tools for analyzing audio: levels, peaks, resonances, noise floor, etc.
 */

/**
 * Measure RMS level
 */
export const analyzeRmsTool = toolDefinition({
  name: 'analyze_rms',
  description: 'Measure the RMS (Root Mean Square) level of audio in dBFS.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
  }),
  outputSchema: z.object({
    rms: z.number().describe('RMS level in dBFS'),
    rmsLinear: z.number().describe('RMS level as linear value'),
  }),
}).server(({ samples }) => {
  if (samples.length === 0) {
    return { rms: -Infinity, rmsLinear: 0 }
  }
  
  const sumSquares = samples.reduce((sum, s) => sum + s * s, 0)
  const rmsLinear = Math.sqrt(sumSquares / samples.length)
  const rms = 20 * Math.log10(Math.max(rmsLinear, 1e-10))
  
  return { rms, rmsLinear }
})

/**
 * Measure peak level
 */
export const analyzePeakTool = toolDefinition({
  name: 'analyze_peak',
  description: 'Measure the peak level of audio in dBFS.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
  }),
  outputSchema: z.object({
    peak: z.number().describe('Peak level in dBFS'),
    peakLinear: z.number().describe('Peak level as linear value'),
    peakIndex: z.number().describe('Sample index of peak'),
  }),
}).server(({ samples }) => {
  if (samples.length === 0) {
    return { peak: -Infinity, peakLinear: 0, peakIndex: 0 }
  }
  
  let peakLinear = 0
  let peakIndex = 0
  
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i])
    if (abs > peakLinear) {
      peakLinear = abs
      peakIndex = i
    }
  }
  
  const peak = 20 * Math.log10(Math.max(peakLinear, 1e-10))
  
  return { peak, peakLinear, peakIndex }
})

/**
 * Find peaks in spectrum or waveform
 */
export const analyzeFindPeaksTool = toolDefinition({
  name: 'analyze_findPeaks',
  description: 'Find peaks in a spectrum or waveform.',
  inputSchema: z.object({
    data: z.array(z.number()).describe('Data array (e.g., FFT magnitudes)'),
    frequencies: z.array(z.number()).optional().describe('Corresponding frequencies (optional)'),
    threshold: z.number().optional().describe('Minimum peak height'),
    minDistance: z.number().optional().describe('Minimum samples between peaks'),
    count: z.number().optional().describe('Maximum number of peaks to return'),
  }),
  outputSchema: z.object({
    peaks: z.array(z.object({
      index: z.number(),
      value: z.number(),
      frequency: z.number().optional(),
    })),
  }),
}).server(({ data, frequencies, threshold = -60, minDistance = 10, count = 10 }) => {
  const peaks: Array<{ index: number; value: number; frequency?: number }> = []
  
  for (let i = 1; i < data.length - 1; i++) {
    const prev = data[i - 1]
    const curr = data[i]
    const next = data[i + 1]
    
    // Check if it's a local maximum above threshold
    if (curr > prev && curr > next && curr > threshold) {
      // Check minimum distance from previous peaks
      const tooClose = peaks.some(p => Math.abs(p.index - i) < minDistance)
      if (!tooClose) {
        peaks.push({
          index: i,
          value: curr,
          frequency: frequencies ? frequencies[i] : undefined,
        })
      }
    }
  }
  
  // Sort by value and take top N
  peaks.sort((a, b) => b.value - a.value)
  return { peaks: peaks.slice(0, count) }
})

/**
 * Detect clipping
 */
export const analyzeDetectClippingTool = toolDefinition({
  name: 'analyze_detectClipping',
  description: 'Detect clipping (samples at or near full scale) in audio.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
    threshold: z.number().optional().describe('Clipping threshold (default 0.99)'),
  }),
  outputSchema: z.object({
    clipped: z.boolean(),
    count: z.number(),
    percentage: z.number(),
    positions: z.array(z.number()),
  }),
}).server(({ samples, threshold = 0.99 }) => {
  const positions: number[] = []
  
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= threshold) {
      positions.push(i)
    }
  }
  
  return {
    clipped: positions.length > 0,
    count: positions.length,
    percentage: (positions.length / samples.length) * 100,
    positions: positions.slice(0, 100), // Limit to first 100 positions
  }
})

/**
 * Measure loudness over time
 */
export const analyzeLoudnessOverTimeTool = toolDefinition({
  name: 'analyze_loudnessOverTime',
  description: 'Measure loudness (RMS) over time for dynamics analysis.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
    sampleRate: z.number().describe('Sample rate in Hz'),
    windowMs: z.number().optional().describe('Analysis window in milliseconds (default 100)'),
  }),
  outputSchema: z.object({
    times: z.array(z.number()),
    rms: z.array(z.number()),
    dynamicRange: z.number(),
  }),
}).server(({ samples, sampleRate, windowMs = 100 }) => {
  const windowSize = Math.floor((windowMs / 1000) * sampleRate)
  const hopSize = Math.floor(windowSize / 2)
  
  const times: number[] = []
  const rms: number[] = []
  
  for (let start = 0; start + windowSize <= samples.length; start += hopSize) {
    const window = samples.slice(start, start + windowSize)
    const sumSquares = window.reduce((sum, s) => sum + s * s, 0)
    const rmsValue = Math.sqrt(sumSquares / windowSize)
    const rmsDb = 20 * Math.log10(Math.max(rmsValue, 1e-10))
    
    times.push((start + windowSize / 2) / sampleRate)
    rms.push(rmsDb)
  }
  
  const validRms = rms.filter(r => isFinite(r))
  const dynamicRange = validRms.length > 0 
    ? Math.max(...validRms) - Math.min(...validRms)
    : 0
  
  return { times, rms, dynamicRange }
})

/**
 * Compare two spectra
 */
export const analyzeCompareSpectraTool = toolDefinition({
  name: 'analyze_compareSpectra',
  description: 'Compare two spectra and find significant differences.',
  inputSchema: z.object({
    spectrum1: z.array(z.number()).describe('First spectrum (dB values)'),
    spectrum2: z.array(z.number()).describe('Second spectrum (dB values)'),
    frequencies: z.array(z.number()).describe('Frequency values'),
    significanceThreshold: z.number().optional().describe('Minimum dB difference to be significant'),
  }),
  outputSchema: z.object({
    difference: z.array(z.number()),
    significantDiffs: z.array(z.object({
      frequency: z.number(),
      diff: z.number(),
    })),
    avgDifference: z.number(),
  }),
}).server(({ spectrum1, spectrum2, frequencies, significanceThreshold = 3 }) => {
  const difference: number[] = []
  const significantDiffs: Array<{ frequency: number; diff: number }> = []
  
  const minLen = Math.min(spectrum1.length, spectrum2.length, frequencies.length)
  
  for (let i = 0; i < minLen; i++) {
    const diff = spectrum2[i] - spectrum1[i]
    difference.push(diff)
    
    if (Math.abs(diff) >= significanceThreshold) {
      significantDiffs.push({
        frequency: frequencies[i],
        diff,
      })
    }
  }
  
  // Sort by absolute difference
  significantDiffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
  
  const avgDifference = difference.length > 0
    ? difference.reduce((sum, d) => sum + d, 0) / difference.length
    : 0
  
  return {
    difference,
    significantDiffs: significantDiffs.slice(0, 20),
    avgDifference,
  }
})

/**
 * Find resonances using self-referential method
 */
export const analyzeFindResonancesTool = toolDefinition({
  name: 'analyze_findResonances',
  description: 'Find resonances by comparing spectrum to its smoothed trend. Returns suggested EQ cuts.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
    sampleRate: z.number().describe('Sample rate in Hz'),
    sensitivity: z.number().optional().describe('dB threshold above trend (default 5)'),
    minFreq: z.number().optional().describe('Minimum frequency to analyze (default 100)'),
    maxFreq: z.number().optional().describe('Maximum frequency to analyze (default 10000)'),
  }),
  outputSchema: z.object({
    resonances: z.array(z.object({
      frequency: z.number(),
      deviation: z.number(),
      suggestedCut: z.number(),
      suggestedQ: z.number(),
      severity: z.enum(['low', 'medium', 'high']),
      zone: z.string(),
    })),
  }),
}).server(({ samples, sampleRate, sensitivity = 5, minFreq = 100, maxFreq = 10000 }) => {
  // Compute Welch PSD
  const fftSize = 8192
  const window = Array.from({ length: fftSize }, (_, i) => 
    0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)))
  )
  
  // Simple FFT for analysis
  const real = samples.slice(0, fftSize).map((s, i) => s * window[i])
  const imag = new Array(fftSize).fill(0)
  
  // Bit-reversal + FFT
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
  
  // Compute magnitudes in dB
  const magnitudes: number[] = []
  const frequencies: number[] = []
  
  for (let i = 0; i < fftSize / 2; i++) {
    const freq = (i * sampleRate) / fftSize
    frequencies.push(freq)
    const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / fftSize
    magnitudes.push(20 * Math.log10(Math.max(mag, 1e-10)))
  }
  
  // Compute smoothed trend (moving average in log frequency space)
  const smoothed: number[] = []
  const smoothingWidth = 20 // bins
  
  for (let i = 0; i < magnitudes.length; i++) {
    const start = Math.max(0, i - smoothingWidth)
    const end = Math.min(magnitudes.length, i + smoothingWidth + 1)
    const sum = magnitudes.slice(start, end).reduce((a, b) => a + b, 0)
    smoothed.push(sum / (end - start))
  }
  
  // Find resonances where signal is above trend
  const resonances: Array<{
    frequency: number
    deviation: number
    suggestedCut: number
    suggestedQ: number
    severity: 'low' | 'medium' | 'high'
    zone: string
  }> = []
  
  const getZone = (freq: number): string => {
    if (freq < 250) return 'bass'
    if (freq < 500) return 'low-mid'
    if (freq < 2000) return 'mid'
    if (freq < 4000) return 'presence'
    if (freq < 8000) return 'brilliance'
    return 'air'
  }
  
  for (let i = 1; i < frequencies.length - 1; i++) {
    const freq = frequencies[i]
    if (freq < minFreq || freq > maxFreq) continue
    
    const deviation = magnitudes[i] - smoothed[i]
    
    // Check if it's a local maximum and above threshold
    if (deviation > sensitivity &&
        magnitudes[i] > magnitudes[i - 1] &&
        magnitudes[i] > magnitudes[i + 1]) {
      
      const severity = deviation > 8 ? 'high' : deviation > 6 ? 'medium' : 'low'
      
      resonances.push({
        frequency: Math.round(freq),
        deviation: Math.round(deviation * 10) / 10,
        suggestedCut: -Math.round(deviation * 0.7), // Conservative cut
        suggestedQ: Math.round((freq / 100) * 10) / 10, // Q scales with frequency
        severity,
        zone: getZone(freq),
      })
    }
  }
  
  // Sort by deviation and limit results
  resonances.sort((a, b) => b.deviation - a.deviation)
  
  return { resonances: resonances.slice(0, 10) }
})

/**
 * Analyze noise floor
 */
export const analyzeNoiseFloorTool = toolDefinition({
  name: 'analyze_noiseFloor',
  description: 'Analyze noise floor from a silence recording. Returns RMS, peak, and dominant frequencies.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples (ideally from a silence recording)'),
    sampleRate: z.number().describe('Sample rate in Hz'),
  }),
  outputSchema: z.object({
    rms: z.number(),
    peak: z.number(),
    dominantFrequencies: z.array(z.object({
      frequency: z.number(),
      magnitude: z.number(),
    })),
  }),
}).server(({ samples, sampleRate }) => {
  // RMS
  const sumSquares = samples.reduce((sum, s) => sum + s * s, 0)
  const rmsLinear = Math.sqrt(sumSquares / samples.length)
  const rms = 20 * Math.log10(Math.max(rmsLinear, 1e-10))
  
  // Peak
  const peakLinear = Math.max(...samples.map(Math.abs))
  const peak = 20 * Math.log10(Math.max(peakLinear, 1e-10))
  
  // FFT for frequency analysis
  const fftSize = Math.min(8192, samples.length)
  const window = Array.from({ length: fftSize }, (_, i) => 
    0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)))
  )
  
  const real = samples.slice(0, fftSize).map((s, i) => s * window[i])
  const imag = new Array(fftSize).fill(0)
  
  // FFT
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
  
  // Find dominant frequencies
  const freqMags: Array<{ frequency: number; magnitude: number }> = []
  
  for (let i = 1; i < fftSize / 2; i++) {
    const freq = (i * sampleRate) / fftSize
    const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / fftSize
    const magDb = 20 * Math.log10(Math.max(mag, 1e-10))
    
    // Check if it's a local peak
    const prevMag = Math.sqrt(real[i-1] * real[i-1] + imag[i-1] * imag[i-1]) / fftSize
    const nextMag = i < fftSize / 2 - 1 
      ? Math.sqrt(real[i+1] * real[i+1] + imag[i+1] * imag[i+1]) / fftSize
      : 0
    
    if (mag > prevMag && mag > nextMag) {
      freqMags.push({ frequency: Math.round(freq), magnitude: Math.round(magDb * 10) / 10 })
    }
  }
  
  // Sort by magnitude and take top 5
  freqMags.sort((a, b) => b.magnitude - a.magnitude)
  
  return {
    rms: Math.round(rms * 10) / 10,
    peak: Math.round(peak * 10) / 10,
    dominantFrequencies: freqMags.slice(0, 5),
  }
})

// Export all analysis tools
export const analyzeTools = [
  analyzeRmsTool,
  analyzePeakTool,
  analyzeFindPeaksTool,
  analyzeDetectClippingTool,
  analyzeLoudnessOverTimeTool,
  analyzeCompareSpectraTool,
  analyzeFindResonancesTool,
  analyzeNoiseFloorTool,
]

