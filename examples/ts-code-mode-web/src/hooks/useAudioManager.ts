import { useCallback, useRef, useState } from 'react'

/**
 * Audio Manager Hook
 * 
 * Manages client-side audio state including:
 * - Stored audio files
 * - Registered plugins
 * - Active monitor chain
 * - AudioContext management
 */

export interface StoredAudio {
  id: string
  name: string
  samples: Float32Array
  sampleRate: number
  duration: number
  description?: string
}

export interface PluginDefinition {
  name: string
  processorCode: string
  params: Array<{
    name: string
    defaultValue: number
    min?: number
    max?: number
  }>
  description?: string
}

export interface MonitorState {
  active: boolean
  plugins: string[]
  nodes: Map<string, AudioWorkletNode>
}

export function useAudioManager() {
  const [storedAudio, setStoredAudio] = useState<Map<string, StoredAudio>>(new Map())
  const [plugins, setPlugins] = useState<Map<string, PluginDefinition>>(new Map())
  const [monitorState, setMonitorState] = useState<MonitorState>({
    active: false,
    plugins: [],
    nodes: new Map(),
  })
  
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  
  // Get or create AudioContext
  const getAudioContext = useCallback(async () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext()
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume()
    }
    return audioContextRef.current
  }, [])
  
  // Store audio
  const storeAudio = useCallback((
    name: string,
    samples: Float32Array | number[],
    sampleRate: number,
    options?: { description?: string; replace?: boolean }
  ) => {
    const samplesArray = samples instanceof Float32Array ? samples : new Float32Array(samples)
    const id = `audio-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    
    setStoredAudio(prev => {
      const newMap = new Map(prev)
      
      // Check if name exists and we're not replacing
      if (newMap.has(name) && !options?.replace) {
        throw new Error(`Audio "${name}" already exists. Use replace: true to overwrite.`)
      }
      
      newMap.set(name, {
        id,
        name,
        samples: samplesArray,
        sampleRate,
        duration: samplesArray.length / sampleRate,
        description: options?.description,
      })
      
      return newMap
    })
    
    return { id, name }
  }, [])
  
  // Get stored audio
  const getAudio = useCallback((name: string): StoredAudio | undefined => {
    return storedAudio.get(name)
  }, [storedAudio])
  
  // List stored audio
  const listAudio = useCallback(() => {
    return Array.from(storedAudio.values()).map(a => ({
      id: a.id,
      name: a.name,
      duration: a.duration,
      sampleRate: a.sampleRate,
    }))
  }, [storedAudio])
  
  // Delete stored audio
  const deleteAudio = useCallback((name: string) => {
    setStoredAudio(prev => {
      const newMap = new Map(prev)
      const deleted = newMap.delete(name)
      return deleted ? newMap : prev
    })
  }, [])
  
  // Play audio
  const playAudio = useCallback(async (name: string) => {
    const audio = storedAudio.get(name)
    if (!audio) {
      throw new Error(`Audio "${name}" not found`)
    }
    
    const ctx = await getAudioContext()
    const buffer = ctx.createBuffer(1, audio.samples.length, audio.sampleRate)
    // Create a new Float32Array to ensure type compatibility
    const channelData = new Float32Array(audio.samples)
    buffer.copyToChannel(channelData, 0)
    
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start()
    
    return new Promise<void>((resolve) => {
      source.onended = () => resolve()
    })
  }, [storedAudio, getAudioContext])
  
  // Record from microphone
  const recordFromMicrophone = useCallback(async (durationSeconds: number) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const ctx = await getAudioContext()
    
    // Use MediaRecorder to capture audio
    const mediaRecorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    
    return new Promise<{ samples: Float32Array; sampleRate: number; duration: number; channels: number }>((resolve, reject) => {
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data)
        }
      }
      
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const arrayBuffer = await blob.arrayBuffer()
        
        try {
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
          const samples = audioBuffer.getChannelData(0)
          
          resolve({
            samples: new Float32Array(samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength)),
            sampleRate: audioBuffer.sampleRate,
            duration: audioBuffer.duration,
            channels: audioBuffer.numberOfChannels,
          })
        } catch (error) {
          reject(error)
        }
      }
      
      mediaRecorder.onerror = reject
      
      mediaRecorder.start()
      setTimeout(() => mediaRecorder.stop(), durationSeconds * 1000)
    })
  }, [getAudioContext])
  
  // Load audio from file
  const loadAudioFile = useCallback(async (file: File) => {
    const ctx = await getAudioContext()
    const arrayBuffer = await file.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    const samples = audioBuffer.getChannelData(0)
    
    return {
      samples: new Float32Array(samples),
      sampleRate: audioBuffer.sampleRate,
      duration: audioBuffer.duration,
      channels: audioBuffer.numberOfChannels,
    }
  }, [getAudioContext])
  
  // Register a plugin
  const registerPlugin = useCallback(async (definition: PluginDefinition) => {
    const ctx = await getAudioContext()
    
    // Build the full processor code
    const paramDescriptors = definition.params.map(p => 
      `{ name: '${p.name}', defaultValue: ${p.defaultValue}` +
      (p.min !== undefined ? `, minValue: ${p.min}` : '') +
      (p.max !== undefined ? `, maxValue: ${p.max}` : '') + ' }'
    ).join(',\n      ')
    
    const processorName = definition.name.replace(/[^a-zA-Z0-9]/g, '_')
    const className = processorName.charAt(0).toUpperCase() + processorName.slice(1) + 'Processor'
    
    const fullCode = `
class ${className} extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [${paramDescriptors}];
  }
  
  ${definition.processorCode}
}

registerProcessor('${definition.name}', ${className});
`
    
    // Create blob URL and add module
    const blob = new Blob([fullCode], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    
    try {
      await ctx.audioWorklet.addModule(url)
      URL.revokeObjectURL(url)
      
      setPlugins(prev => {
        const newMap = new Map(prev)
        newMap.set(definition.name, definition)
        return newMap
      })
      
      return { success: true, name: definition.name }
    } catch (error) {
      URL.revokeObjectURL(url)
      throw error
    }
  }, [getAudioContext])
  
  // List plugins
  const listPlugins = useCallback(() => {
    return Array.from(plugins.values()).map(p => ({
      name: p.name,
      params: p.params,
      description: p.description,
    }))
  }, [plugins])
  
  // Delete plugin
  const deletePlugin = useCallback((name: string) => {
    setPlugins(prev => {
      const newMap = new Map(prev)
      newMap.delete(name)
      return newMap
    })
  }, [])
  
  // Get plugin code
  const getPluginCode = useCallback((name: string) => {
    const plugin = plugins.get(name)
    if (!plugin) return null
    return {
      code: plugin.processorCode,
      params: plugin.params,
    }
  }, [plugins])
  
  // Start monitoring
  const startMonitor = useCallback(async (pluginConfigs: Array<{ name: string; params?: Record<string, number> }>) => {
    const ctx = await getAudioContext()
    
    // Get microphone
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaStreamRef.current = stream
    
    const source = ctx.createMediaStreamSource(stream)
    sourceNodeRef.current = source
    
    // Build plugin chain
    const nodes = new Map<string, AudioWorkletNode>()
    let prevNode: AudioNode = source
    
    for (const config of pluginConfigs) {
      if (!plugins.has(config.name)) {
        throw new Error(`Plugin "${config.name}" not found`)
      }
      
      const node = new AudioWorkletNode(ctx, config.name)
      
      // Set initial parameters
      if (config.params) {
        for (const [paramName, value] of Object.entries(config.params)) {
          const param = node.parameters.get(paramName)
          if (param) {
            param.setValueAtTime(value, ctx.currentTime)
          }
        }
      }
      
      prevNode.connect(node)
      prevNode = node
      nodes.set(config.name, node)
    }
    
    // Connect to output
    prevNode.connect(ctx.destination)
    
    setMonitorState({
      active: true,
      plugins: pluginConfigs.map(p => p.name),
      nodes,
    })
    
    return { success: true, activePlugins: pluginConfigs.map(p => p.name) }
  }, [getAudioContext, plugins])
  
  // Stop monitoring
  const stopMonitor = useCallback(() => {
    // Disconnect all nodes
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect()
      sourceNodeRef.current = null
    }
    
    for (const node of monitorState.nodes.values()) {
      node.disconnect()
    }
    
    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
    }
    
    setMonitorState({
      active: false,
      plugins: [],
      nodes: new Map(),
    })
    
    return { success: true }
  }, [monitorState.nodes])
  
  // Update monitor parameter
  const updateMonitorParam = useCallback((pluginName: string, paramName: string, value: number) => {
    const node = monitorState.nodes.get(pluginName)
    if (!node) {
      return { success: false, message: `Plugin "${pluginName}" not in active chain` }
    }
    
    const param = node.parameters.get(paramName)
    if (!param) {
      return { success: false, message: `Parameter "${paramName}" not found` }
    }
    
    param.setValueAtTime(value, audioContextRef.current?.currentTime || 0)
    return { success: true }
  }, [monitorState.nodes])
  
  // Get monitor params
  const getMonitorParams = useCallback((pluginName: string) => {
    const node = monitorState.nodes.get(pluginName)
    if (!node) {
      return { success: false, message: `Plugin "${pluginName}" not in active chain` }
    }
    
    const params: Record<string, number> = {}
    node.parameters.forEach((param, name) => {
      params[name] = param.value
    })
    
    return { success: true, params }
  }, [monitorState.nodes])
  
  // Set monitor chain
  const setMonitorChain = useCallback(async (pluginConfigs: Array<{ name: string; params?: Record<string, number> }>) => {
    if (monitorState.active) {
      stopMonitor()
    }
    return startMonitor(pluginConfigs)
  }, [monitorState.active, stopMonitor, startMonitor])
  
  return {
    // Audio
    storedAudio,
    storeAudio,
    getAudio,
    listAudio,
    deleteAudio,
    playAudio,
    recordFromMicrophone,
    loadAudioFile,
    
    // Plugins
    plugins,
    registerPlugin,
    listPlugins,
    deletePlugin,
    getPluginCode,
    
    // Monitor
    monitorState,
    startMonitor,
    stopMonitor,
    updateMonitorParam,
    getMonitorParams,
    setMonitorChain,
    
    // Utils
    getAudioContext,
  }
}

export type AudioManager = ReturnType<typeof useAudioManager>

