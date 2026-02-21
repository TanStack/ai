import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * DSP Tools - Signal Processing
 * 
 * Pure computation tools that run entirely on the server.
 * Uses JavaScript implementations for FFT, filters, etc.
 */

// ============================================================================
// FFT Implementation (Cooley-Tukey radix-2)
// ============================================================================

function fft(real: number[], imag: number[]): void {
  const n = real.length
  if (n <= 1) return

  // Bit-reversal permutation
  for (let i = 0, j = 0; i < n; i++) {
    if (j > i) {
      [real[i], real[j]] = [real[j], real[i]]
      ;[imag[i], imag[j]] = [imag[j], imag[i]]
    }
    let m = n >> 1
    while (m >= 1 && j >= m) {
      j -= m
      m >>= 1
    }
    j += m
  }

  // Cooley-Tukey FFT
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
}

function nextPowerOf2(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)))
}

// Window functions
function hanningWindow(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1))))
}

function hammingWindow(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1)))
}

function blackmanWindow(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 
    0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (n - 1))
  )
}

// ============================================================================
// Filter Implementation (Biquad)
// ============================================================================

interface BiquadCoeffs {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

function applyBiquad(samples: number[], coeffs: BiquadCoeffs): number[] {
  const output = new Array(samples.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]
    const y = coeffs.b0 * x + coeffs.b1 * x1 + coeffs.b2 * x2 - coeffs.a1 * y1 - coeffs.a2 * y2
    output[i] = y
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
  }
  
  return output
}

function highpassCoeffs(cutoff: number, sampleRate: number, q: number = 0.707): BiquadCoeffs {
  const w0 = 2 * Math.PI * cutoff / sampleRate
  const alpha = Math.sin(w0) / (2 * q)
  const cos_w0 = Math.cos(w0)
  
  const b0 = (1 + cos_w0) / 2
  const b1 = -(1 + cos_w0)
  const b2 = (1 + cos_w0) / 2
  const a0 = 1 + alpha
  const a1 = -2 * cos_w0
  const a2 = 1 - alpha
  
  return { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }
}

function lowpassCoeffs(cutoff: number, sampleRate: number, q: number = 0.707): BiquadCoeffs {
  const w0 = 2 * Math.PI * cutoff / sampleRate
  const alpha = Math.sin(w0) / (2 * q)
  const cos_w0 = Math.cos(w0)
  
  const b0 = (1 - cos_w0) / 2
  const b1 = 1 - cos_w0
  const b2 = (1 - cos_w0) / 2
  const a0 = 1 + alpha
  const a1 = -2 * cos_w0
  const a2 = 1 - alpha
  
  return { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }
}

function bandpassCoeffs(centerFreq: number, sampleRate: number, q: number = 1): BiquadCoeffs {
  const w0 = 2 * Math.PI * centerFreq / sampleRate
  const alpha = Math.sin(w0) / (2 * q)
  const cos_w0 = Math.cos(w0)
  
  const b0 = alpha
  const b1 = 0
  const b2 = -alpha
  const a0 = 1 + alpha
  const a1 = -2 * cos_w0
  const a2 = 1 - alpha
  
  return { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }
}

function notchCoeffs(freq: number, sampleRate: number, q: number = 30): BiquadCoeffs {
  const w0 = 2 * Math.PI * freq / sampleRate
  const alpha = Math.sin(w0) / (2 * q)
  const cos_w0 = Math.cos(w0)
  
  const b0 = 1
  const b1 = -2 * cos_w0
  const b2 = 1
  const a0 = 1 + alpha
  const a1 = -2 * cos_w0
  const a2 = 1 - alpha
  
  return { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }
}

function peakingCoeffs(freq: number, sampleRate: number, gainDb: number, q: number = 1): BiquadCoeffs {
  const A = Math.pow(10, gainDb / 40)
  const w0 = 2 * Math.PI * freq / sampleRate
  const alpha = Math.sin(w0) / (2 * q)
  const cos_w0 = Math.cos(w0)
  
  const b0 = 1 + alpha * A
  const b1 = -2 * cos_w0
  const b2 = 1 - alpha * A
  const a0 = 1 + alpha / A
  const a1 = -2 * cos_w0
  const a2 = 1 - alpha / A
  
  return { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Compute FFT of audio signal
 */
export const dspFftTool = toolDefinition({
  name: 'dsp_fft',
  description: 'Compute Fast Fourier Transform of audio signal. Returns frequencies, magnitudes (dB), and phases.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
    sampleRate: z.number().describe('Sample rate in Hz'),
    size: z.number().optional().describe('FFT size (default 8192, must be power of 2)'),
    window: z.enum(['hanning', 'hamming', 'blackman', 'none']).optional().describe('Window function'),
  }),
  outputSchema: z.object({
    frequencies: z.array(z.number()),
    magnitudes: z.array(z.number()),
    phases: z.array(z.number()),
  }),
}).server(({ samples, sampleRate, size = 8192, window = 'hanning' }) => {
  const fftSize = Math.min(nextPowerOf2(size), samples.length)
  
  // Apply window
  let windowFunc: number[]
  switch (window) {
    case 'hamming': windowFunc = hammingWindow(fftSize); break
    case 'blackman': windowFunc = blackmanWindow(fftSize); break
    case 'none': windowFunc = Array(fftSize).fill(1); break
    default: windowFunc = hanningWindow(fftSize)
  }
  
  // Prepare input
  const real = samples.slice(0, fftSize).map((s, i) => s * windowFunc[i])
  const imag = new Array(fftSize).fill(0)
  
  // Pad with zeros if needed
  while (real.length < fftSize) {
    real.push(0)
  }
  
  // Compute FFT
  fft(real, imag)
  
  // Compute magnitudes and phases
  const frequencies: number[] = []
  const magnitudes: number[] = []
  const phases: number[] = []
  
  const binCount = fftSize / 2
  for (let i = 0; i < binCount; i++) {
    frequencies.push((i * sampleRate) / fftSize)
    const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / fftSize
    magnitudes.push(20 * Math.log10(Math.max(mag, 1e-10)))
    phases.push(Math.atan2(imag[i], real[i]))
  }
  
  return { frequencies, magnitudes, phases }
})

/**
 * Welch's method for power spectral density
 */
export const dspWelchTool = toolDefinition({
  name: 'dsp_welch',
  description: 'Compute power spectral density using Welch\'s method. Better for noise analysis than single FFT.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
    sampleRate: z.number().describe('Sample rate in Hz'),
    windowSize: z.number().optional().describe('Window size (default 8192)'),
    overlap: z.number().optional().describe('Overlap ratio 0-1 (default 0.5)'),
  }),
  outputSchema: z.object({
    frequencies: z.array(z.number()),
    psd: z.array(z.number()),
  }),
}).server(({ samples, sampleRate, windowSize = 8192, overlap = 0.5 }) => {
  const segmentSize = Math.min(nextPowerOf2(windowSize), samples.length)
  const hopSize = Math.floor(segmentSize * (1 - overlap))
  const window = hanningWindow(segmentSize)
  
  // Accumulate PSDs
  const psdSum = new Array(segmentSize / 2).fill(0)
  let segmentCount = 0
  
  for (let start = 0; start + segmentSize <= samples.length; start += hopSize) {
    const segment = samples.slice(start, start + segmentSize)
    const real = segment.map((s, i) => s * window[i])
    const imag = new Array(segmentSize).fill(0)
    
    fft(real, imag)
    
    for (let i = 0; i < segmentSize / 2; i++) {
      const power = (real[i] * real[i] + imag[i] * imag[i]) / (segmentSize * segmentSize)
      psdSum[i] += power
    }
    segmentCount++
  }
  
  // Average and convert to dB
  const frequencies: number[] = []
  const psd: number[] = []
  
  for (let i = 0; i < segmentSize / 2; i++) {
    frequencies.push((i * sampleRate) / segmentSize)
    const avgPower = psdSum[i] / Math.max(segmentCount, 1)
    psd.push(10 * Math.log10(Math.max(avgPower, 1e-20)))
  }
  
  return { frequencies, psd }
})

/**
 * Highpass filter
 */
export const dspHighpassTool = toolDefinition({
  name: 'dsp_filter_highpass',
  description: 'Apply a highpass filter to remove low frequencies.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
    cutoffHz: z.number().describe('Cutoff frequency in Hz'),
    sampleRate: z.number().describe('Sample rate in Hz'),
    order: z.number().optional().describe('Filter order (default 2)'),
  }),
  outputSchema: z.object({
    samples: z.array(z.number()),
  }),
}).server(({ samples, cutoffHz, sampleRate, order = 2 }) => {
  let output = [...samples]
  const coeffs = highpassCoeffs(cutoffHz, sampleRate)
  
  // Apply filter multiple times for higher order
  for (let i = 0; i < Math.ceil(order / 2); i++) {
    output = applyBiquad(output, coeffs)
  }
  
  return { samples: output }
})

/**
 * Lowpass filter
 */
export const dspLowpassTool = toolDefinition({
  name: 'dsp_filter_lowpass',
  description: 'Apply a lowpass filter to remove high frequencies.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
    cutoffHz: z.number().describe('Cutoff frequency in Hz'),
    sampleRate: z.number().describe('Sample rate in Hz'),
    order: z.number().optional().describe('Filter order (default 2)'),
  }),
  outputSchema: z.object({
    samples: z.array(z.number()),
  }),
}).server(({ samples, cutoffHz, sampleRate, order = 2 }) => {
  let output = [...samples]
  const coeffs = lowpassCoeffs(cutoffHz, sampleRate)
  
  for (let i = 0; i < Math.ceil(order / 2); i++) {
    output = applyBiquad(output, coeffs)
  }
  
  return { samples: output }
})

/**
 * Bandpass filter
 */
export const dspBandpassTool = toolDefinition({
  name: 'dsp_filter_bandpass',
  description: 'Apply a bandpass filter to keep only frequencies in a range.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
    lowHz: z.number().describe('Low cutoff frequency in Hz'),
    highHz: z.number().describe('High cutoff frequency in Hz'),
    sampleRate: z.number().describe('Sample rate in Hz'),
    order: z.number().optional().describe('Filter order (default 2)'),
  }),
  outputSchema: z.object({
    samples: z.array(z.number()),
  }),
}).server(({ samples, lowHz, highHz, sampleRate, order = 2 }) => {
  let output = [...samples]
  const centerFreq = Math.sqrt(lowHz * highHz)
  const q = centerFreq / (highHz - lowHz)
  const coeffs = bandpassCoeffs(centerFreq, sampleRate, q)
  
  for (let i = 0; i < Math.ceil(order / 2); i++) {
    output = applyBiquad(output, coeffs)
  }
  
  return { samples: output }
})

/**
 * Bandstop filter
 */
export const dspBandstopTool = toolDefinition({
  name: 'dsp_filter_bandstop',
  description: 'Apply a bandstop (notch) filter to remove frequencies in a range.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
    lowHz: z.number().describe('Low cutoff frequency in Hz'),
    highHz: z.number().describe('High cutoff frequency in Hz'),
    sampleRate: z.number().describe('Sample rate in Hz'),
    order: z.number().optional().describe('Filter order (default 2)'),
  }),
  outputSchema: z.object({
    samples: z.array(z.number()),
  }),
}).server(({ samples, lowHz, highHz, sampleRate, order = 2 }) => {
  // Implement as highpass + lowpass in parallel
  const hpCoeffs = highpassCoeffs(highHz, sampleRate)
  const lpCoeffs = lowpassCoeffs(lowHz, sampleRate)
  
  let hpOutput = [...samples]
  let lpOutput = [...samples]
  
  for (let i = 0; i < Math.ceil(order / 2); i++) {
    hpOutput = applyBiquad(hpOutput, hpCoeffs)
    lpOutput = applyBiquad(lpOutput, lpCoeffs)
  }
  
  // Sum the two outputs
  const output = hpOutput.map((s, i) => s + lpOutput[i])
  return { samples: output }
})

/**
 * Notch filter
 */
export const dspNotchTool = toolDefinition({
  name: 'dsp_filter_notch',
  description: 'Apply a notch filter to remove a specific frequency.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
    freqHz: z.number().describe('Frequency to notch out in Hz'),
    q: z.number().describe('Q factor (higher = narrower notch)'),
    sampleRate: z.number().describe('Sample rate in Hz'),
  }),
  outputSchema: z.object({
    samples: z.array(z.number()),
  }),
}).server(({ samples, freqHz, q, sampleRate }) => {
  const coeffs = notchCoeffs(freqHz, sampleRate, q)
  const output = applyBiquad(samples, coeffs)
  return { samples: output }
})

/**
 * Parametric EQ
 */
export const dspEqTool = toolDefinition({
  name: 'dsp_eq',
  description: 'Apply parametric EQ with multiple bands.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
    sampleRate: z.number().describe('Sample rate in Hz'),
    bands: z.array(z.object({
      frequency: z.number().describe('Center frequency in Hz'),
      gain: z.number().describe('Gain in dB (negative for cut)'),
      q: z.number().describe('Q factor (width)'),
      type: z.enum(['peak', 'lowshelf', 'highshelf']).optional().describe('Band type'),
    })).describe('EQ bands to apply'),
  }),
  outputSchema: z.object({
    samples: z.array(z.number()),
  }),
}).server(({ samples, sampleRate, bands }) => {
  let output = [...samples]
  
  for (const band of bands) {
    // For now, all bands are peaking filters
    const coeffs = peakingCoeffs(band.frequency, sampleRate, band.gain, band.q)
    output = applyBiquad(output, coeffs)
  }
  
  return { samples: output }
})

/**
 * Normalize audio
 */
export const dspNormalizeTool = toolDefinition({
  name: 'dsp_normalize',
  description: 'Normalize audio to a target peak level.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
    targetPeakDb: z.number().optional().describe('Target peak level in dBFS (default -1)'),
  }),
  outputSchema: z.object({
    samples: z.array(z.number()),
    gainApplied: z.number(),
  }),
}).server(({ samples, targetPeakDb = -1 }) => {
  const peak = Math.max(...samples.map(Math.abs))
  if (peak === 0) {
    return { samples, gainApplied: 0 }
  }
  
  const targetLinear = Math.pow(10, targetPeakDb / 20)
  const gain = targetLinear / peak
  
  return {
    samples: samples.map(s => s * gain),
    gainApplied: 20 * Math.log10(gain),
  }
})

/**
 * Trim silence
 */
export const dspTrimTool = toolDefinition({
  name: 'dsp_trim',
  description: 'Trim silence from start and end of audio.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
    thresholdDb: z.number().optional().describe('Silence threshold in dB (default -50)'),
  }),
  outputSchema: z.object({
    samples: z.array(z.number()),
    trimmedStart: z.number(),
    trimmedEnd: z.number(),
  }),
}).server(({ samples, thresholdDb = -50 }) => {
  const threshold = Math.pow(10, thresholdDb / 20)
  
  let start = 0
  let end = samples.length - 1
  
  while (start < samples.length && Math.abs(samples[start]) < threshold) {
    start++
  }
  
  while (end > start && Math.abs(samples[end]) < threshold) {
    end--
  }
  
  return {
    samples: samples.slice(start, end + 1),
    trimmedStart: start,
    trimmedEnd: samples.length - 1 - end,
  }
})

/**
 * Apply fade in/out
 */
export const dspFadeTool = toolDefinition({
  name: 'dsp_fade',
  description: 'Apply fade in and/or fade out to audio.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
    sampleRate: z.number().describe('Sample rate in Hz'),
    fadeIn: z.number().optional().describe('Fade in duration in seconds'),
    fadeOut: z.number().optional().describe('Fade out duration in seconds'),
    curve: z.enum(['linear', 'exponential', 'logarithmic']).optional().describe('Fade curve type'),
  }),
  outputSchema: z.object({
    samples: z.array(z.number()),
  }),
}).server(({ samples, sampleRate, fadeIn = 0, fadeOut = 0, curve = 'linear' }) => {
  const output = [...samples]
  const fadeInSamples = Math.floor(fadeIn * sampleRate)
  const fadeOutSamples = Math.floor(fadeOut * sampleRate)
  
  const getCurveValue = (t: number): number => {
    switch (curve) {
      case 'exponential': return t * t
      case 'logarithmic': return Math.sqrt(t)
      default: return t
    }
  }
  
  // Apply fade in
  for (let i = 0; i < fadeInSamples && i < output.length; i++) {
    const t = i / fadeInSamples
    output[i] *= getCurveValue(t)
  }
  
  // Apply fade out
  for (let i = 0; i < fadeOutSamples && i < output.length; i++) {
    const idx = output.length - 1 - i
    const t = i / fadeOutSamples
    output[idx] *= getCurveValue(t)
  }
  
  return { samples: output }
})

/**
 * Mix two audio signals
 */
export const dspMixTool = toolDefinition({
  name: 'dsp_mix',
  description: 'Mix two audio signals together.',
  inputSchema: z.object({
    samples1: z.array(z.number()).describe('First audio signal'),
    samples2: z.array(z.number()).describe('Second audio signal'),
    ratio: z.number().optional().describe('Mix ratio 0-1 (0=all first, 1=all second, default 0.5)'),
    align: z.enum(['start', 'center']).optional().describe('How to align signals (default start)'),
  }),
  outputSchema: z.object({
    samples: z.array(z.number()),
  }),
}).server(({ samples1, samples2, ratio = 0.5, align = 'start' }) => {
  const maxLen = Math.max(samples1.length, samples2.length)
  const output = new Array(maxLen).fill(0)
  
  let offset1 = 0
  let offset2 = 0
  
  if (align === 'center') {
    offset1 = Math.floor((maxLen - samples1.length) / 2)
    offset2 = Math.floor((maxLen - samples2.length) / 2)
  }
  
  for (let i = 0; i < maxLen; i++) {
    const s1 = samples1[i - offset1] ?? 0
    const s2 = samples2[i - offset2] ?? 0
    output[i] = s1 * (1 - ratio) + s2 * ratio
  }
  
  return { samples: output }
})

/**
 * Resample audio
 */
export const dspResampleTool = toolDefinition({
  name: 'dsp_resample',
  description: 'Resample audio to a different sample rate.',
  inputSchema: z.object({
    samples: z.array(z.number()).describe('Audio samples'),
    fromRate: z.number().describe('Source sample rate'),
    toRate: z.number().describe('Target sample rate'),
  }),
  outputSchema: z.object({
    samples: z.array(z.number()),
  }),
}).server(({ samples, fromRate, toRate }) => {
  if (fromRate === toRate) {
    return { samples }
  }
  
  const ratio = toRate / fromRate
  const newLength = Math.floor(samples.length * ratio)
  const output = new Array(newLength)
  
  // Linear interpolation resampling
  for (let i = 0; i < newLength; i++) {
    const srcIdx = i / ratio
    const srcIdxFloor = Math.floor(srcIdx)
    const frac = srcIdx - srcIdxFloor
    
    const s0 = samples[srcIdxFloor] ?? 0
    const s1 = samples[srcIdxFloor + 1] ?? s0
    
    output[i] = s0 + (s1 - s0) * frac
  }
  
  return { samples: output }
})

// Export all DSP tools
export const dspTools = [
  dspFftTool,
  dspWelchTool,
  dspHighpassTool,
  dspLowpassTool,
  dspBandpassTool,
  dspBandstopTool,
  dspNotchTool,
  dspEqTool,
  dspNormalizeTool,
  dspTrimTool,
  dspFadeTool,
  dspMixTool,
  dspResampleTool,
]

