import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";
import { GameState, ConversationItem, ToolResult } from "../types.ts";

interface VoiceChatProps {}

interface UIState {
  gameState: GameState;
  conversationHistory: ConversationItem[];
}

export default function VoiceChat(_props: VoiceChatProps) {
  const isConnected = useSignal(false);
  const isConnecting = useSignal(false);
  const status = useSignal("Ready to start");
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Audio queue management for streaming audio chunks
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingAudioRef = useRef<boolean>(false);
  const nextPlayTimeRef = useRef<number>(0);
  const uiState = useSignal<UIState>({
    gameState: {
      player: {
        name: "",
        level: 1,
        hp: { current: 10, max: 10 },
        stress: { current: 0, max: 10 },
        hope: 2,
        armor: { current: 0, max: 0 },
        evasion: 10,
        thresholds: { major: 5, severe: 10 },
        proficiency: 1,
        conditions: [],
        experiences: [],
        class: "",
        background: "",
        currentLocation: "Starting Area",
        gold: "",
        inventory: []
      },
      gm: {
        fear: 0,
        hasSpotlight: false
      },
      scene: {
        currentScene: "Character Creation",
        sceneDescription: "Du stehst am Beginn eines neuen Abenteuers...",
        activeQuests: [],
        countdowns: []
      },
      sessionId: "",
      languageCorrections: 0,
      vocabularyIntroduced: []
    },
    conversationHistory: []
  });

  // Initialize voice chat when component mounts
  useEffect(() => {
    if (!IS_BROWSER) return;
    
    // Request microphone permission on load
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        status.value = "Microphone ready - Click to start";
      })
      .catch((err) => {
        console.error("Microphone permission denied:", err);
        status.value = "Microphone permission required";
      });
  }, []);

  // Game state updates now come directly from the backend via WebSocket messages

  // Helper function to update conversation history
  const updateConversationHistory = (history: any[]) => {
    const formattedHistory: ConversationItem[] = [];
    
    // Debug: Log the raw history to see what we're getting
    console.log('Raw conversation history:', history);
    
    history.forEach((item: any) => {
      if (item.type === 'message') {
        let content = '';
        
        // Handle user messages with input_audio transcript (only completed)
        if (item.role === 'user' && item.status === 'completed' && item.content && Array.isArray(item.content)) {
          item.content.forEach((part: any) => {
            if (part.type === 'input_audio' && part.transcript) {
              content += part.transcript;
            } else if (part.type === 'input_text' && part.text) {
              content += part.text;
            } else if (part.type === 'text' && part.text) {
              content += part.text;
            }
          });
        }
        
        // Handle assistant messages (can be in_progress or completed)
        else if (item.role === 'assistant') {
          // Try to get content from content array
          if (item.content && Array.isArray(item.content)) {
            item.content.forEach((part: any) => {
              if (part.type === 'audio' && part.transcript) {
                content += part.transcript;
              } else if (part.type === 'text' && part.text) {
                content += part.text;
              }
            });
          }
          
          // Also try to get content from output array (alternative structure)
          if (!content && item.output && Array.isArray(item.output)) {
            item.output.forEach((part: any) => {
              if (part.type === 'audio' && part.transcript) {
                content += part.transcript;
              } else if (part.type === 'text' && part.text) {
                content += part.text;
              }
            });
          }
          
          // Try direct content string
          if (!content && typeof item.content === 'string') {
            content = item.content;
          }
        }
        
        // Handle direct string content (fallback)
        else if (typeof item.content === 'string') {
          content = item.content;
        }
        
        if (content.trim()) {
          formattedHistory.push({
            timestamp: new Date().toLocaleTimeString(),
            role: item.role === 'user' ? 'user' : 'assistant',
            content: content.trim(),
            type: 'message'
          });
        }
      }
    });
    
    // Update only conversation history, game state updates come from direct messages
    uiState.value = { 
      ...uiState.value, 
      conversationHistory: formattedHistory
    };
  };

  // Set up WebSocket connection
  const setupWebSocket = (clientApiKey: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws/realtime`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      // Send connect message with API key
      ws.send(JSON.stringify({
        type: 'connect',
        clientApiKey: clientApiKey
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
        case 'connected':
          isConnected.value = true;
          isConnecting.value = false;
          status.value = "Mit Der Spielleiter verbunden - Sprich jetzt!";
          uiState.value = { 
            ...uiState.value, 
            gameState: { ...uiState.value.gameState, sessionId: message.sessionId }
          };
          // Start recording audio
          startAudioCapture();
          break;
          
        case 'game_state_updated':
          // Direct game state update - much more reliable!
          if (message.gameState) {
            uiState.value = { 
              ...uiState.value, 
              gameState: message.gameState
            };
            console.log('Game state updated:', message.toolResult);
          }
          break;
          
        case 'history_updated':
          updateConversationHistory(message.history);
          break;
          
        case 'audio':
          if (message.audio) {
            playAudio(message.audio);
          } else {
            console.warn('Received audio message but no audio data');
          }
          break;
          
        
          
        case 'error':
          const errorMsg = typeof message.error === 'string' ? message.error : JSON.stringify(message.error);
          console.error('WebSocket error:', errorMsg);
          status.value = `Error: ${errorMsg}`;
          isConnected.value = false;
          isConnecting.value = false;
          break;
          
        case 'disconnected':
          isConnected.value = false;
          status.value = "Disconnected";
          stopAudioCapture();
          break;
        
        default:
          console.warn('Unknown message type:', message.type, message);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error, event.data);
      status.value = "WebSocket message error";
    }
  };

    ws.onerror = (error) => {
      console.error('WebSocket connection error:', error);
      status.value = "Connection error";
      isConnected.value = false;
      isConnecting.value = false;
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      isConnected.value = false;
      isConnecting.value = false;
      status.value = "Ready to start";
      stopAudioCapture();
    };
  };

  // Start capturing raw PCM16 audio from the microphone
  const startAudioCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          // Don't force sample rate - let browser choose optimal rate
        } 
      });

      // Create audio context with browser's default sample rate
      audioContextRef.current = new AudioContext();
      console.log('Audio context sample rate:', audioContextRef.current.sampleRate);
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      // Use createScriptProcessor with proper settings
      const bufferSize = 2048; // Larger buffer for better stability
      const processor = audioContextRef.current.createScriptProcessor(bufferSize, 1, 1);
      
      processor.onaudioprocess = (event) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const inputBuffer = event.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);
          const inputSampleRate = audioContextRef.current!.sampleRate;
          
          // Resample from browser's sample rate to 24kHz for OpenAI
          const targetSampleRate = 24000;
          const resampledData = resampleAudioData(inputData, inputSampleRate, targetSampleRate);
          
          // Convert resampled Float32Array to PCM16 with proper endianness
          const pcm16Buffer = new ArrayBuffer(resampledData.length * 2);
          const view = new DataView(pcm16Buffer);
          
          for (let i = 0; i < resampledData.length; i++) {
            // Clamp to [-1, 1] and convert to 16-bit integer
            const sample = Math.max(-1, Math.min(1, resampledData[i]));
            const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            // Write as little-endian 16-bit signed integer
            view.setInt16(i * 2, intSample, true);
          }
          
          // Convert to base64 for transmission
          const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16Buffer)));
          
          wsRef.current.send(JSON.stringify({
            type: 'audio',
            audio: base64
          }));
        }
      };
      
      // Connect the audio processing chain
      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      
      // Store the processor for cleanup
      mediaRecorderRef.current = processor as any;
      
      console.log(`Started PCM16 audio capture at ${audioContextRef.current.sampleRate}Hz, resampling to 24kHz for OpenAI`);
    } catch (error) {
      console.error('Error starting audio capture:', error);
      status.value = "Error accessing microphone";
    }
  };

  // Simple linear interpolation resampling function
  const resampleAudioData = (inputData: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array => {
    if (inputSampleRate === outputSampleRate) {
      return inputData;
    }
    
    const ratio = inputSampleRate / outputSampleRate;
    const outputLength = Math.round(inputData.length / ratio);
    const outputData = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const inputIndex = i * ratio;
      const inputIndexFloor = Math.floor(inputIndex);
      const inputIndexCeil = Math.min(inputIndexFloor + 1, inputData.length - 1);
      const fraction = inputIndex - inputIndexFloor;
      
      // Linear interpolation
      outputData[i] = inputData[inputIndexFloor] * (1 - fraction) + inputData[inputIndexCeil] * fraction;
    }
    
    return outputData;
  };

  // Process audio queue - plays audio chunks sequentially
  const processAudioQueue = async () => {
    if (isPlayingAudioRef.current || audioQueueRef.current.length === 0) {
      return;
    }
    
    isPlayingAudioRef.current = true;
    
    try {
      if (!audioContextRef.current) {
        // Create audio context with browser's default sample rate for playback
        audioContextRef.current = new AudioContext();
      }
      
      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      // Get the next audio chunk from the queue
      const audioChunk = audioQueueRef.current.shift()!;
      const openAISampleRate = 24000; // OpenAI sends 24kHz PCM16
      const browserSampleRate = audioContextRef.current.sampleRate;
      
      // Resample from OpenAI's 24kHz to browser's preferred rate if needed
      const resampledChunk = browserSampleRate !== openAISampleRate 
        ? resampleAudioData(audioChunk, openAISampleRate, browserSampleRate)
        : audioChunk;
      
      // Create audio buffer at browser's sample rate
      const audioBuffer = audioContextRef.current.createBuffer(
        1, // mono
        resampledChunk.length,
        browserSampleRate
      );
      
      // Copy audio data to buffer
      const channelData = audioBuffer.getChannelData(0);
      channelData.set(resampledChunk);
      
      // Calculate when this chunk should start playing
      const currentTime = audioContextRef.current.currentTime;
      const startTime = Math.max(currentTime, nextPlayTimeRef.current);
      
      // Create and configure audio source
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      // Schedule the next chunk to start after this one ends
      const duration = audioBuffer.duration;
      nextPlayTimeRef.current = startTime + duration;
      
      // Set up completion handler
      source.onended = () => {
        isPlayingAudioRef.current = false;
        
        // Process next chunk in queue if available
        if (audioQueueRef.current.length > 0) {
          setTimeout(() => processAudioQueue(), 10); // Small delay to prevent stack overflow
        } else {
          nextPlayTimeRef.current = 0; // Reset for next conversation
        }
      };
      
      // Start playback
      source.start(startTime);
      
    } catch (error) {
      console.error('Error processing audio queue:', error);
      isPlayingAudioRef.current = false;
      // Try to process next chunk on error
      if (audioQueueRef.current.length > 0) {
        setTimeout(() => processAudioQueue(), 100);
      }
    }
  };

  // Stop audio capture and clear audio queue
  const stopAudioCapture = () => {
    // Clear audio queue and stop playback
    audioQueueRef.current = [];
    isPlayingAudioRef.current = false;
    nextPlayTimeRef.current = 0;
    
    // Disconnect the audio processor
    if (mediaRecorderRef.current) {
      try {
        (mediaRecorderRef.current as any).disconnect();
      } catch (error) {
        console.error('Error disconnecting audio processor:', error);
      }
      mediaRecorderRef.current = null;
    }
    
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  // Queue received PCM16 audio data for sequential playback
  const playAudio = async (base64Audio: string) => {
    try {
      // Decode base64 to binary string
      const audioData = atob(base64Audio);
      
      // Convert binary string to ArrayBuffer
      const arrayBuffer = new ArrayBuffer(audioData.length);
      const uint8View = new Uint8Array(arrayBuffer);
      for (let i = 0; i < audioData.length; i++) {
        uint8View[i] = audioData.charCodeAt(i);
      }
      
      // Create DataView for proper endian handling
      const dataView = new DataView(arrayBuffer);
      const sampleCount = arrayBuffer.byteLength / 2; // 2 bytes per 16-bit sample
      
      // Convert to Float32Array for AudioBuffer (PCM16 to Float32)
      const float32Data = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        // Read little-endian 16-bit signed integer (OpenAI uses little-endian)
        const int16Sample = dataView.getInt16(i * 2, true);
        // Convert to float [-1, 1] with proper scaling
        float32Data[i] = int16Sample / 32768.0;
      }
      
      // Add to audio queue
      audioQueueRef.current.push(float32Data);
      
      // Start processing queue if not already playing
      if (!isPlayingAudioRef.current) {
        processAudioQueue();
      }
      
    } catch (error) {
      console.error('Error processing audio:', error);
    }
  };

  const startVoiceChat = async () => {
    if (!IS_BROWSER || isConnecting.value) return;
    
    try {
      isConnecting.value = true;
      status.value = "Generating secure session token...";
      
      // Get ephemeral client token from server
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_session_config',
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to get session configuration');
      }
      
      const config = await response.json();
      
      if (config.error) {
        throw new Error(config.error);
      }
      
      status.value = "Connecting to OpenAI...";
      
      // Set up WebSocket connection
      setupWebSocket(config.clientApiKey);
      
    } catch (error) {
      console.error('Voice chat error:', error);
      status.value = "Error: " + (error as Error).message;
      isConnecting.value = false;
      isConnected.value = false;
    }
  };

  const stopVoiceChat = async () => {
    if (!IS_BROWSER) return;
    
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'disconnect' }));
        wsRef.current.close();
      }
      
      stopAudioCapture();
      isConnected.value = false;
      isConnecting.value = false;
      status.value = "Ready to start";
    } catch (error) {
      console.error('Error stopping voice chat:', error);
      status.value = "Error stopping session";
      // Still reset the state even if there's an error
      isConnected.value = false;
      isConnecting.value = false;
      wsRef.current = null;
    }
  };

  const toggleVoiceChat = () => {
    if (isConnected.value) {
      stopVoiceChat();
    } else {
      startVoiceChat();
    }
  };

  return (
    <div class="max-w-6xl mx-auto p-4 space-y-6">
      {/* Main Voice Interface */}
      <div class="text-center bg-gradient-to-br from-purple-900 to-blue-900 p-8 rounded-xl shadow-2xl">
        <h1 class="text-2xl font-bold text-white mb-2">Der Spielleiter</h1>
        <p class="text-purple-200 mb-6">Deutsches D&D • German Learning through Gaming</p>
        
        <div class="mb-6">
          <button
            onClick={toggleVoiceChat}
            class={`w-24 h-24 rounded-full text-white text-3xl font-bold transition-all duration-200 ${
              isConnected.value 
                ? 'bg-red-500 hover:bg-red-600 animate-pulse shadow-lg shadow-red-500/50' 
                : isConnecting.value
                ? 'bg-yellow-500 animate-spin shadow-lg shadow-yellow-500/50'
                : 'bg-green-500 hover:bg-green-600 hover:scale-105 shadow-lg shadow-green-500/50'
            }`}
            disabled={!IS_BROWSER || isConnecting.value}
          >
            {isConnecting.value ? '⏳' : isConnected.value ? '🔴' : '🎙️'}
          </button>
        </div>
        
        <div class="space-y-2">
          <p class={`text-lg font-semibold ${
            isConnected.value ? 'text-green-300' : 
            isConnecting.value ? 'text-yellow-300' : 'text-gray-300'
          }`}>
            {status.value}
          </p>
          
          <div class="text-sm text-purple-200">
            {isConnected.value ? 'Klicke zum Stoppen' : 'Klicke zum Starten'}
          </div>
        </div>
      </div>

      {/* Game State Display */}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Character Sheet */}
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl">
          <h2 class="text-xl font-bold text-white mb-4 flex items-center">
            ⚔️ Charakterbogen
          </h2>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between text-gray-300">
              <span>Name:</span>
              <span class="text-white">{uiState.value.gameState.player.name || "Unbekannt"}</span>
            </div>
            {uiState.value.gameState.player.class && (
              <div class="flex justify-between text-gray-300">
                <span>Klasse:</span>
                <span class="text-purple-400">{uiState.value.gameState.player.class}</span>
              </div>
            )}
            {uiState.value.gameState.player.background && (
              <div class="flex justify-between text-gray-300">
                <span>Hintergrund:</span>
                <span class="text-blue-400">{uiState.value.gameState.player.background}</span>
              </div>
            )}
            <div class="flex justify-between text-gray-300">
              <span>Stufe:</span>
              <span class="text-white">{uiState.value.gameState.player.level}</span>
            </div>
            
            {/* Core Stats */}
            <div class="border-t border-gray-600 pt-3 mt-3">
              <div class="flex justify-between text-gray-300">
                <span>Lebenspunkte:</span>
                <span class="text-red-400">{uiState.value.gameState.player.hp.current}/{uiState.value.gameState.player.hp.max}</span>
              </div>
              <div class="flex justify-between text-gray-300">
                <span>Stress:</span>
                <span class="text-orange-400">{uiState.value.gameState.player.stress.current}/{uiState.value.gameState.player.stress.max}</span>
              </div>
              <div class="flex justify-between text-gray-300">
                <span>Hoffnung:</span>
                <span class="text-yellow-400">{uiState.value.gameState.player.hope}</span>
              </div>
              <div class="flex justify-between text-gray-300">
                <span>Rüstung:</span>
                <span class="text-blue-400">{uiState.value.gameState.player.armor.current}/{uiState.value.gameState.player.armor.max}</span>
              </div>
            </div>
            
            {/* Combat Stats */}
            <div class="border-t border-gray-600 pt-3 mt-3">
              <div class="flex justify-between text-gray-300">
                <span>Ausweichen:</span>
                <span class="text-green-400">{uiState.value.gameState.player.evasion}</span>
              </div>
              <div class="flex justify-between text-gray-300">
                <span>Fertigkeit:</span>
                <span class="text-cyan-400">{uiState.value.gameState.player.proficiency}</span>
              </div>
              <div class="flex justify-between text-gray-300">
                <span>Schwellen:</span>
                <span class="text-gray-400">{uiState.value.gameState.player.thresholds.major}/{uiState.value.gameState.player.thresholds.severe}</span>
              </div>
            </div>
            
            <div class="flex justify-between text-gray-300">
              <span>Ort:</span>
              <span class="text-blue-400">{uiState.value.gameState.player.currentLocation}</span>
            </div>
            
            {uiState.value.gameState.player.gold && (
              <div class="flex justify-between text-gray-300">
                <span>Gold:</span>
                <span class="text-yellow-400">{uiState.value.gameState.player.gold}</span>
              </div>
            )}
            
            {/* Conditions */}
            {uiState.value.gameState.player.conditions && uiState.value.gameState.player.conditions.length > 0 && (
              <div class="mt-4">
                <div class="text-gray-400 mb-2">Zustände:</div>
                <div class="flex flex-wrap gap-1">
                  {uiState.value.gameState.player.conditions.map((condition, index) => (
                    <span key={index} class="bg-red-900 px-2 py-1 rounded text-xs text-red-300">
                      {condition}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* Experiences */}
            {uiState.value.gameState.player.experiences && uiState.value.gameState.player.experiences.length > 0 && (
              <div class="mt-4">
                <div class="text-gray-400 mb-2">Erfahrungen:</div>
                <div class="flex flex-wrap gap-1">
                  {uiState.value.gameState.player.experiences.map((experience, index) => (
                    <span key={index} class="bg-purple-900 px-2 py-1 rounded text-xs text-purple-300">
                      {experience}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Current Scene */}
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl">
          <h2 class="text-xl font-bold text-white mb-4 flex items-center">
            🏰 Aktuelle Szene
          </h2>
          <div class="space-y-3 text-sm">
            <div class="text-yellow-400 font-medium">{uiState.value.gameState.scene.currentScene}</div>
            <div class="text-gray-300 leading-relaxed">{uiState.value.gameState.scene.sceneDescription}</div>
            
            {uiState.value.gameState.scene.activeQuests.length > 0 && (
              <div class="mt-4">
                <div class="text-gray-400 mb-2">Aktive Quests:</div>
                <div class="space-y-1">
                  {uiState.value.gameState.scene.activeQuests.map((quest, index) => (
                    <div key={index} class="bg-slate-700 p-2 rounded text-xs text-gray-300">
                      • {quest}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Inventory */}
            {uiState.value.gameState.player.inventory && uiState.value.gameState.player.inventory.length > 0 && (
              <div class="mt-4">
                <div class="text-gray-400 mb-2">Inventar:</div>
                <div class="flex flex-wrap gap-1">
                  {uiState.value.gameState.player.inventory.map((item, index) => (
                    <span key={index} class="bg-slate-700 px-2 py-1 rounded text-xs text-gray-300">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Language Learning Progress */}
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl">
          <h2 class="text-xl font-bold text-white mb-4 flex items-center">
            📚 Sprachfortschritt
          </h2>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between text-gray-300">
              <span>Korrekturen:</span>
              <span class="text-orange-400">{uiState.value.gameState.languageCorrections}</span>
            </div>
            <div class="flex justify-between text-gray-300">
              <span>Neues Vokabular:</span>
              <span class="text-green-400">{uiState.value.gameState.vocabularyIntroduced.length}</span>
            </div>
            {uiState.value.gameState.vocabularyIntroduced.length > 0 && (
              <div class="mt-4">
                <div class="text-gray-400 mb-2">Gelernte Wörter:</div>
                <div class="flex flex-wrap gap-1">
                  {uiState.value.gameState.vocabularyIntroduced.slice(-10).map((word, index) => (
                    <span key={index} class="bg-green-900 px-2 py-1 rounded text-xs text-green-300">
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Conversation Section */}
      <div class="max-w-4xl mx-auto">
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl">
          <h2 class="text-xl font-bold text-white mb-4 flex items-center">
            💬 Unterhaltung
            <span class="ml-2 text-sm text-gray-400">({uiState.value.conversationHistory.length})</span>
          </h2>
          <div class="space-y-3 text-sm max-h-64 overflow-y-auto">
            {uiState.value.conversationHistory.length > 0 ? (
              uiState.value.conversationHistory.slice(-20).map((message, index) => (
                <div key={index} class={`p-3 rounded-lg ${
                  message.role === 'user' 
                    ? 'bg-blue-900 ml-4 border-l-2 border-blue-400' 
                    : 'bg-purple-900 mr-4 border-l-2 border-purple-400'
                }`}>
                  <div class="flex justify-between items-start mb-1">
                    <span class={`text-xs font-semibold ${
                      message.role === 'user' ? 'text-blue-300' : 'text-purple-300'
                    }`}>
                      {message.role === 'user' ? 'Du' : 'Der Spielleiter'}
                    </span>
                    <span class="text-gray-500 text-xs">{message.timestamp}</span>
                  </div>
                  <div class="text-gray-200 text-sm leading-relaxed">
                    {message.content}
                  </div>
                </div>
              ))
            ) : (
              <div class="text-gray-500 italic">Noch keine Unterhaltung...</div>
            )}
          </div>
        </div>
      </div>

      {/* Instructions */}
      {isConnected.value && (
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl">
          <h2 class="text-xl font-bold text-white mb-4">💡 Spielhilfen</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
            <div>
              <h3 class="font-bold text-blue-400 mb-2">Sprachbefehle:</h3>
              <ul class="space-y-1">
                <li>• "Ich möchte..." - Aktionen ausführen</li>
                <li>• "Ich schaue..." - Umgebung erkunden</li>
                <li>• "Ich sage..." - Mit NPCs sprechen</li>
                <li>• "Kannst du das erklären?" - Hilfe anfordern</li>
              </ul>
            </div>
            <div>
              <h3 class="font-bold text-purple-400 mb-2">Spieltipps:</h3>
              <ul class="space-y-1">
                <li>• Sprich langsam und deutlich</li>
                <li>• Beschreibe deine Aktionen ausführlich</li>
                <li>• Frage nach deutschen Wörtern</li>
                <li>• Hab Spaß beim Lernen!</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 