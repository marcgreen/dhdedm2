import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";

interface VoiceChatProps {}

interface CharacterState {
  name: string;
  level: number;
  hitPoints: number;
  maxHitPoints: number;
  attributes: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  inventory: string[];
  currentLocation: string;
  notes: string[];
}

interface GameState {
  character: CharacterState;
  currentScene: string;
  sceneDescription: string;
  activeQuests: string[];
  gameLog: string[];
  toolCallLog: ToolCall[];
  conversationHistory: ConversationItem[];
  sessionId: string;
  languageCorrections: number;
  vocabularyIntroduced: string[];
}

interface ToolCall {
  timestamp: string;
  toolName: string;
  parameters: any;
  result: string;
}

interface ConversationItem {
  timestamp: string;
  role: 'user' | 'assistant';
  content: string;
  type: 'message' | 'audio';
}

export default function VoiceChat(_props: VoiceChatProps) {
  const isConnected = useSignal(false);
  const isConnecting = useSignal(false);
  const status = useSignal("Ready to start");
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gameState = useSignal<GameState>({
    character: {
      name: "",
      level: 1,
      hitPoints: 10,
      maxHitPoints: 10,
      attributes: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      },
      inventory: [],
      currentLocation: "Starting Area",
      notes: []
    },
    currentScene: "Character Creation",
    sceneDescription: "Du stehst am Beginn eines neuen Abenteuers...",
    activeQuests: [],
    gameLog: [],
    toolCallLog: [],
    conversationHistory: [],
    sessionId: "",
    languageCorrections: 0,
    vocabularyIntroduced: []
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

  // Helper function to log tool calls
  const logToolCall = (toolName: string, parameters: any, result: string) => {
    const newState = { ...gameState.value };
    const toolCall: ToolCall = {
      timestamp: new Date().toLocaleTimeString(),
      toolName,
      parameters,
      result
    };
    newState.toolCallLog.push(toolCall);
    gameState.value = newState;
    console.log(`Tool Called: ${toolName}`, { parameters, result });
  };

  // Helper function to update conversation history
  const updateConversationHistory = (history: any[]) => {
    const newState = { ...gameState.value };
    const formattedHistory: ConversationItem[] = [];
    
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
      
      // Also show function calls in the conversation for transparency
      else if (item.type === 'function_call' && item.status === 'completed') {
        formattedHistory.push({
          timestamp: new Date().toLocaleTimeString(),
          role: 'assistant',
          content: `🔧 Called tool: ${item.name}(${item.arguments}) → ${item.output}`,
          type: 'message'
        });
      }
    });
    
    newState.conversationHistory = formattedHistory;
    gameState.value = newState;
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
        console.log('📨 WebSocket message received:', message.type, message);
        
        switch (message.type) {
        case 'connected':
          isConnected.value = true;
          isConnecting.value = false;
          status.value = "Mit Der Spielleiter verbunden - Sprich jetzt!";
          gameState.value = { ...gameState.value, sessionId: message.sessionId };
          // Start recording audio
          startAudioCapture();
          break;
          
        case 'history_updated':
          updateConversationHistory(message.history);
          break;
          
        case 'audio':
          // Play received audio
          console.log('🔊 AUDIO MESSAGE RECEIVED!');
          console.log('- Audio data length:', message.audio?.length);
          console.log('- Audio data type:', typeof message.audio);
          console.log('- Message debug info:', message.debug);
          console.log('- Full message:', message);
          
          if (message.audio) {
            console.log('🎯 Attempting to play audio...');
            try {
              playAudio(message.audio);
              console.log('✅ Audio playback initiated successfully');
            } catch (error) {
              console.error('❌ Error in playAudio:', error);
            }
          } else {
            console.warn('❌ Received audio message but no audio data');
          }
          break;
          
        case 'tool_executed':
          // Handle tool execution results
          if (message.result) {
            const toolName = message.result.name || 'unknown';
            const params = message.result.parameters || {};
            const output = message.result.output || '';
            logToolCall(toolName, params, output);
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
        } 
      });

      // Create audio context using browser's default sample rate
      audioContextRef.current = new AudioContext();
      console.log('Audio context sample rate:', audioContextRef.current.sampleRate);
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      // Create a ScriptProcessorNode to capture raw audio data
      const bufferSize = 4096;
      const processor = audioContextRef.current.createScriptProcessor(bufferSize, 1, 1);
      
      processor.onaudioprocess = (event) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const inputBuffer = event.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);
          
          // Convert Float32Array to PCM16
          const pcm16Buffer = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            // Convert from [-1, 1] float to [-32768, 32767] int16
            const sample = Math.max(-1, Math.min(1, inputData[i]));
            pcm16Buffer[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
          }
          
          // Convert to base64 for transmission
          const arrayBuffer = pcm16Buffer.buffer;
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          
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
      
      console.log('Started PCM16 audio capture');
    } catch (error) {
      console.error('Error starting audio capture:', error);
      status.value = "Error accessing microphone";
    }
  };

  // Stop audio capture
  const stopAudioCapture = () => {
    // Disconnect the audio processor
    if (mediaRecorderRef.current) {
      try {
        (mediaRecorderRef.current as any).disconnect();
        console.log('Audio processor disconnected');
      } catch (error) {
        console.error('Error disconnecting audio processor:', error);
      }
      mediaRecorderRef.current = null;
    }
    
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
      console.log('Audio context closed');
    }
  };

  // Play received PCM16 audio data
  const playAudio = async (base64Audio: string) => {
    console.log('🎵 playAudio() called with base64 length:', base64Audio.length);
    
    try {
      if (!audioContextRef.current) {
        console.log('🎧 Creating new AudioContext...');
        // Create audio context using browser's default sample rate
        audioContextRef.current = new AudioContext();
        console.log('✅ AudioContext created, sample rate:', audioContextRef.current.sampleRate);
      }
      
      // Resume audio context if suspended (required by some browsers)
      if (audioContextRef.current.state === 'suspended') {
        console.log('🔄 Resuming suspended AudioContext...');
        await audioContextRef.current.resume();
      }
      
      console.log('🔄 Decoding base64 audio data...');
      // Decode base64 to binary string
      const audioData = atob(base64Audio);
      console.log('✅ Base64 decoded, binary length:', audioData.length);
      
      // Convert binary string to ArrayBuffer first
      const arrayBuffer = new ArrayBuffer(audioData.length);
      const uint8View = new Uint8Array(arrayBuffer);
      for (let i = 0; i < audioData.length; i++) {
        uint8View[i] = audioData.charCodeAt(i);
      }
      
      // Create DataView for proper endian handling
      const dataView = new DataView(arrayBuffer);
      const sampleCount = arrayBuffer.byteLength / 2; // 2 bytes per 16-bit sample
      
      console.log('📊 Audio data analysis:');
      console.log('- Raw bytes:', arrayBuffer.byteLength);
      console.log('- Sample count:', sampleCount);
      console.log('- Expected duration at 24kHz:', (sampleCount / 24000).toFixed(3), 'seconds');
      
      // Log first few samples for debugging
      const firstSamples = [];
      for (let i = 0; i < Math.min(10, sampleCount); i++) {
        const sample = dataView.getInt16(i * 2, true); // little-endian
        firstSamples.push(sample);
      }
      console.log('- First 10 samples:', firstSamples);
      
      // Convert to Float32Array for AudioBuffer (PCM16 to Float32)
      const float32Data = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        const int16Sample = dataView.getInt16(i * 2, true); // little-endian
        float32Data[i] = int16Sample / 32768.0; // Convert to float [-1, 1]
      }
      console.log('✅ Float32 audio data created, samples:', float32Data.length);
      
      // OpenAI Realtime API sends audio at 24kHz, so use that sample rate
      const openAISampleRate = 24000;
      console.log('🎯 Creating audio buffer with OpenAI sample rate:', openAISampleRate);
      console.log('🎧 Browser AudioContext sample rate:', audioContextRef.current.sampleRate);
      
      // Create audio buffer for audio data at the correct source sample rate
      const audioBuffer = audioContextRef.current.createBuffer(
        1, // mono
        float32Data.length,
        openAISampleRate // Use OpenAI's 24kHz sample rate
      );
      
      // Copy float32 data directly to audio buffer
      const channelData = audioBuffer.getChannelData(0);
      channelData.set(float32Data);
      console.log('✅ Audio buffer filled with float32 data');
      
      // Play the audio buffer
      console.log('🔊 Starting audio playback...');
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      // Add event listeners for debugging
      source.onended = () => {
        console.log('✅ Audio playback completed');
      };
      
      source.start();
      console.log('🎵 Audio source started successfully');
      
      const durationSeconds = float32Data.length / openAISampleRate;
      console.log(`📊 Audio info: ${float32Data.length} samples, ${durationSeconds.toFixed(2)}s duration at ${openAISampleRate}Hz`);
      
    } catch (error) {
      console.error('❌ Error in playAudio function:', error);
      console.error('❌ Error stack:', (error as Error).stack);
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
              <span class="text-white">{gameState.value.character.name || "Unbekannt"}</span>
            </div>
            <div class="flex justify-between text-gray-300">
              <span>Stufe:</span>
              <span class="text-white">{gameState.value.character.level}</span>
            </div>
            <div class="flex justify-between text-gray-300">
              <span>Lebenspunkte:</span>
              <span class="text-red-400">{gameState.value.character.hitPoints}/{gameState.value.character.maxHitPoints}</span>
            </div>
            <div class="flex justify-between text-gray-300">
              <span>Ort:</span>
              <span class="text-blue-400">{gameState.value.character.currentLocation}</span>
            </div>
            {gameState.value.character.inventory.length > 0 && (
              <div class="mt-4">
                <div class="text-gray-400 mb-2">Inventar:</div>
                <div class="flex flex-wrap gap-1">
                  {gameState.value.character.inventory.map((item, index) => (
                    <span key={index} class="bg-slate-700 px-2 py-1 rounded text-xs text-gray-300">
                      {item}
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
            <div class="text-yellow-400 font-medium">{gameState.value.currentScene}</div>
            <div class="text-gray-300 leading-relaxed">{gameState.value.sceneDescription}</div>
            
            {gameState.value.activeQuests.length > 0 && (
              <div class="mt-4">
                <div class="text-gray-400 mb-2">Aktive Quests:</div>
                <div class="space-y-1">
                  {gameState.value.activeQuests.map((quest, index) => (
                    <div key={index} class="bg-slate-700 p-2 rounded text-xs text-gray-300">
                      • {quest}
                    </div>
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
              <span class="text-orange-400">{gameState.value.languageCorrections}</span>
            </div>
            <div class="flex justify-between text-gray-300">
              <span>Neues Vokabular:</span>
              <span class="text-green-400">{gameState.value.vocabularyIntroduced.length}</span>
            </div>
            {gameState.value.vocabularyIntroduced.length > 0 && (
              <div class="mt-4">
                <div class="text-gray-400 mb-2">Gelernte Wörter:</div>
                <div class="flex flex-wrap gap-1">
                  {gameState.value.vocabularyIntroduced.slice(-10).map((word, index) => (
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

      {/* Conversation and Logs Section */}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversation Transcript */}
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl">
          <h2 class="text-xl font-bold text-white mb-4 flex items-center">
            💬 Unterhaltung
            <span class="ml-2 text-sm text-gray-400">({gameState.value.conversationHistory.length})</span>
          </h2>
          <div class="space-y-3 text-sm max-h-64 overflow-y-auto">
            {gameState.value.conversationHistory.length > 0 ? (
              gameState.value.conversationHistory.slice(-20).map((message, index) => (
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

        {/* Tool Calls Log */}
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl">
          <h2 class="text-xl font-bold text-white mb-4 flex items-center">
            🔧 Tool-Aufrufe
            <span class="ml-2 text-sm text-gray-400">({gameState.value.toolCallLog.length})</span>
          </h2>
          <div class="space-y-2 text-sm max-h-64 overflow-y-auto">
            {gameState.value.toolCallLog.length > 0 ? (
              gameState.value.toolCallLog.slice(-15).map((call, index) => (
                <div key={index} class="bg-slate-700 p-3 rounded border-l-2 border-blue-500">
                  <div class="flex justify-between items-start mb-1">
                    <span class="text-blue-400 font-mono text-xs">{call.toolName}</span>
                    <span class="text-gray-500 text-xs">{call.timestamp}</span>
                  </div>
                  <div class="text-gray-300 text-xs mb-1">
                    <strong>Args:</strong> {JSON.stringify(call.parameters)}
                  </div>
                  <div class="text-green-300 text-xs">
                    <strong>Result:</strong> {call.result}
                  </div>
                </div>
              ))
            ) : (
              <div class="text-gray-500 italic">Noch keine Tool-Aufrufe...</div>
            )}
          </div>
        </div>

        {/* Game Log */}
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl">
          <h2 class="text-xl font-bold text-white mb-4 flex items-center">
            📜 Spielprotokoll
          </h2>
          <div class="space-y-2 text-sm max-h-64 overflow-y-auto">
            {gameState.value.gameLog.length > 0 ? (
              gameState.value.gameLog.slice(-10).map((entry, index) => (
                <div key={index} class="text-gray-300 text-xs border-l-2 border-slate-600 pl-2">
                  {entry}
                </div>
              ))
            ) : (
              <div class="text-gray-500 italic">Noch keine Einträge...</div>
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