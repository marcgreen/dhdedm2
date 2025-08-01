import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";
import { GameState, ConversationItem, ToolResult } from "../types.ts";
import { createDefaultGameState } from "../daggerheart_tools.ts";

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
  const lastUserSpeechTimeRef = useRef<number>(0);
  
  // Local conversation history - client-side authoritative store
  const localConversationRef = useRef<ConversationItem[]>([]);
  const currentAssistantMessageRef = useRef<ConversationItem | null>(null);
  const lastSyncTimeRef = useRef<number>(0);
  const uiState = useSignal<UIState>({
    gameState: createDefaultGameState(),
    conversationHistory: []
  });

  const isPaused = useSignal(false);

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

  // Merge local and server conversation histories, preserving interrupted messages and timestamps
  const mergeConversationHistories = (localHistory: ConversationItem[], serverHistory: ConversationItem[]): ConversationItem[] => {
    console.log('=== MERGE START ===');
    console.log('Local history:', localHistory.length, 'messages');
    console.log('Server history:', serverHistory.length, 'messages');
    
    // If we have very few local messages, prefer server history to avoid conflicts
    if (localHistory.length <= 1) {
      console.log('Using server history as primary (local history too small)');
      return [...serverHistory];
    }
    
    // Create a combined array with all messages, using local timestamps where available
    const allMessages: ConversationItem[] = [];
    
         // Create a content-based lookup for local messages to preserve timestamps
     const localMessageMap = new Map<string, ConversationItem>();
     localHistory.forEach((msg) => {
       const contentKey = msg.content.replace(' ⚠️ (unterbrochen)', '').replace(' ⏸️ (unvollständig)', '').substring(0, 40);
       const key = `${msg.role}_${contentKey}`;
       localMessageMap.set(key, msg);
     });
    
    // Process server messages, preserving local data where possible
    serverHistory.forEach(serverMsg => {
      const contentKey = serverMsg.content.substring(0, 40);
      const key = `${serverMsg.role}_${contentKey}`;
      const localMatch = localMessageMap.get(key);
      
      if (localMatch) {
        // Use local version (preserves timestamp and interruption status)
        console.log('Preserving local message:', localMatch.timestamp);
        allMessages.push({
          ...serverMsg,
          timestamp: localMatch.timestamp,
          content: localMatch.content // Keeps interruption markers
        });
        localMessageMap.delete(key); // Mark as used
      } else {
        // New server message
        allMessages.push(serverMsg);
      }
    });
    
    // Add any remaining local messages that weren't in server history (like interrupted ones)
    for (const [key, localMsg] of localMessageMap) {
      if (localMsg.content.includes('(unterbrochen)') || localMsg.content.includes('(unvollständig)')) {
        console.log('Adding orphaned interrupted message:', localMsg.content.substring(0, 50));
        allMessages.push(localMsg);
      }
    }
    
    // Sort by timestamp to ensure chronological order
    allMessages.sort((a, b) => {
      // Helper function to convert timestamp to comparable time value
      const getTimeValue = (timestamp: string) => {
        // If timestamp is already a time string (HH:MM:SS), convert to comparable format
        if (timestamp.includes(':') && !timestamp.includes('-')) {
          const [hours, minutes, seconds] = timestamp.split(':').map(Number);
          return hours * 3600 + minutes * 60 + (seconds || 0);
        }
        // If it's a full date string, extract just the time part
        try {
          const date = new Date(timestamp);
          return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
        } catch {
          // Fallback: try to parse as time string
          return 0;
        }
      };
      
      const timeA = getTimeValue(a.timestamp);
      const timeB = getTimeValue(b.timestamp);
      return timeA - timeB;
    });
    
    console.log('Final merged history:', allMessages.length, 'messages in chronological order');
    console.log('=== MERGE END ===');
    
    return allMessages;
  };

  // Helper function to sync with server conversation history
  const syncConversationHistory = (history: any[]) => {
    // Remove the throttle that's preventing transcript updates
    // const now = Date.now();
    // if (now - lastSyncTimeRef.current < 500) { // 500ms throttle
    //   console.log('Skipping sync - too soon since last sync');
    //   return;
    // }
    // lastSyncTimeRef.current = now;
    
    console.log('Processing history update with', history?.length || 0, 'items');
    
    const formattedHistory: ConversationItem[] = [];
    
    history.forEach((item: any) => {
      console.log('Processing history item:', {
        type: item.type,
        role: item.role,
        status: item.status,
        hasContent: !!item.content,
        contentType: typeof item.content,
        isArray: Array.isArray(item.content)
      });
      
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
        
        // Handle assistant messages (show all messages including interrupted ones)
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
          // Add status indicator for interrupted messages
          let displayContent = content.trim();
          if (item.role === 'assistant' && item.status && item.status !== 'completed') {
            // Add visual indicator for interrupted/incomplete messages
            displayContent += ` ${item.status === 'interrupted' ? '⚠️ (unterbrochen)' : '⏸️ (unvollständig)'}`;
          }
          
          // Try to preserve original timestamp from server, fallback to current time
          let messageTimestamp = new Date().toLocaleTimeString();
          if (item.timestamp) {
            messageTimestamp = item.timestamp;
          } else if (item.created_at) {
            // Convert server timestamp to local time format
            messageTimestamp = new Date(item.created_at).toLocaleTimeString();
          }
          
          formattedHistory.push({
            timestamp: messageTimestamp,
            role: item.role === 'user' ? 'user' : 'assistant',
            content: displayContent,
            type: 'message'
          });
        }
      } else if (item.type === 'tool_call') {
        // Format tool_call for transcript
        let content = '';
        if (item.status === 'started') {
          content = `${item.name} called with: ${JSON.stringify(item.arguments)}`;
        } else if (item.status === 'succeeded') {
          content = `${item.name} result: ${JSON.stringify(item.output)}`;
        } else if (item.status === 'failed') {
          content = `${item.name} failed: ${JSON.stringify(item.error)}`;
        } else {
          content = `${item.name} tool_call`;
        }
        if (item.updatedState) {
          content += `\n${item.name} updated state: ${JSON.stringify(item.updatedState)}`;
        }
        
        // Handle tool call timestamp consistently with message timestamps
        let toolTimestamp = new Date().toLocaleTimeString();
        if (item.timestamp) {
          // If it's already a time string, use it directly
          if (typeof item.timestamp === 'string' && item.timestamp.includes(':')) {
            toolTimestamp = item.timestamp;
          } else {
            // If it's a date object or full date string, convert to time only
            toolTimestamp = new Date(item.timestamp).toLocaleTimeString();
          }
        } else if (item.created_at) {
          toolTimestamp = new Date(item.created_at).toLocaleTimeString();
        }
        
        formattedHistory.push({
          timestamp: toolTimestamp,
          role: 'tool',
          content,
          type: 'tool_call',
          toolName: item.name,
          toolArguments: item.arguments,
          toolOutput: item.output,
        });
      }
    });
    
    // Merge server history with local history, preserving interrupted messages
    const mergedHistory = mergeConversationHistories(localConversationRef.current, formattedHistory);
    localConversationRef.current = mergedHistory;
    
    console.log('Merged server history with local store:', mergedHistory.length, 'messages');
    
    // Update UI state with the merged conversation history
    uiState.value = { 
      ...uiState.value, 
      conversationHistory: [...localConversationRef.current]
    };
    
    console.log('UI state updated with', localConversationRef.current.length, 'messages in conversation history');
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

    ws.onmessage = async (event) => {
      try {
        // Check if this is a binary message (audio data) - handle both ArrayBuffer and Blob
        if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
          console.log('Received binary message, type:', event.data.constructor.name, 'size:', event.data instanceof Blob ? event.data.size : event.data.byteLength);
          
          // Convert Blob to ArrayBuffer if needed
          let arrayBuffer: ArrayBuffer;
          if (event.data instanceof Blob) {
            // Convert Blob to ArrayBuffer
            const response = await event.data.arrayBuffer();
            arrayBuffer = response;
          } else {
            arrayBuffer = event.data;
          }
          
          const data = new Uint8Array(arrayBuffer);
          console.log('Converted to Uint8Array, length:', data.length, 'first byte:', data[0]);
          
          // Check message type from first byte
          if (data.length > 0 && data[0] === 0x01) {
            // Audio message - extract audio data (skip first byte header)
            const audioData = data.slice(1);
            console.log('Processing audio data, length:', audioData.length);
            
            // Pass binary audio data directly to playAudio
            playAudio(audioData);
            return;
          }
        }
        
        // Handle JSON messages as before
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
          // Clear local conversation history for new session
          clearLocalConversation();
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
          console.log('=== CLIENT RECEIVED HISTORY_updated ===');
          console.log('Message type:', message.type);
          console.log('History data type:', typeof message.history);
          console.log('History length:', Array.isArray(message.history) ? message.history.length : 'not array');
          console.log('History sample:', message.history ? JSON.stringify(message.history.slice(0, 2), null, 2) : 'no history');
          syncConversationHistory(message.history);
          break;
          
        case 'audio':
          if (message.audio) {
            playAudio(message.audio);
          } else {
            console.warn('Received audio message but no audio data');
          }
          
          // Check if this audio message also has transcript info for real-time updates
          if (message.transcript) {
            console.log('Real-time transcript received:', message.transcript.substring(0, 50) + '...');
            addOrUpdateLocalMessage('assistant', message.transcript, false);
          }
          break;
          
        case 'interruption':
        case 'user_speaking':
          // User interrupted the AI - clear audio queue to stop AI speech
          clearAudioQueue();
          console.log('User interruption detected - clearing audio queue');
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
          clearLocalConversation();
          break;
        
        default:
          console.log('Unknown message type:', message.type, message);
          
          // Check if it's a transcript-related message we should handle
          if (message.transcript || (message.type && message.type.includes('transcript'))) {
            console.log('Potential transcript message:', message);
          }
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
        if (isPaused.value) return; // Block audio sending when paused
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const inputBuffer = event.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);
          const inputSampleRate = audioContextRef.current!.sampleRate;
          
          // Detect user speech activity (simple volume threshold)
          const volumeThreshold = 0.02; // Adjust as needed
          const averageVolume = inputData.reduce((sum, sample) => sum + Math.abs(sample), 0) / inputData.length;
          
          // If user is speaking and AI is playing audio, clear the queue (proactive interruption)
          if (averageVolume > volumeThreshold && isPlayingAudioRef.current) {
            const now = Date.now();
            // Debounce to avoid clearing on brief noise
            if (now - lastUserSpeechTimeRef.current > 500) {
              clearAudioQueue();
              console.log('Proactive interruption: User started speaking while AI was talking');
            }
            lastUserSpeechTimeRef.current = now;
          }
          
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
          
          // Send binary audio data directly (much faster than base64)
          const header = new Uint8Array([0x01]); // 0x01 = audio message type
          const message = new Uint8Array(header.length + pcm16Buffer.byteLength);
          message.set(header, 0);
          message.set(new Uint8Array(pcm16Buffer), header.length);
          
          wsRef.current.send(message);
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
    console.log('processAudioQueue called, isPlaying:', isPlayingAudioRef.current, 'queue length:', audioQueueRef.current.length);
    
    if (isPlayingAudioRef.current || audioQueueRef.current.length === 0) {
      console.log('Skipping processAudioQueue - already playing or empty queue');
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
      console.log('Starting audio playback at time:', startTime, 'duration:', duration);
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

  // Clear audio queue and reset playback state (for interruptions)
  const clearAudioQueue = () => {
    // Clear audio queue and stop playback
    audioQueueRef.current = [];
    isPlayingAudioRef.current = false;
    nextPlayTimeRef.current = 0;
    lastUserSpeechTimeRef.current = 0;
    
    // Handle interruption in conversation history
    handleInterruption();
    
    console.log('Audio queue cleared due to interruption');
  };

  // Clear local conversation history (for session reset)
  const clearLocalConversation = () => {
    localConversationRef.current = [];
    currentAssistantMessageRef.current = null;
    lastSyncTimeRef.current = 0; // Reset sync throttle
    console.log('Local conversation history cleared');
  };

  // Add or update a message in local conversation history
  const addOrUpdateLocalMessage = (role: 'user' | 'assistant', content: string, isComplete = false) => {
    const timestamp = new Date().toLocaleTimeString();
    
    if (role === 'assistant') {
      // For assistant messages, update the current one or create new
      if (currentAssistantMessageRef.current) {
        // Update existing message content but keep original timestamp
        currentAssistantMessageRef.current.content = content;
        // DON'T update timestamp - keep the original time when message started
        
        // Update in local history
        const lastIndex = localConversationRef.current.length - 1;
        if (lastIndex >= 0 && localConversationRef.current[lastIndex].role === 'assistant') {
          localConversationRef.current[lastIndex] = { ...currentAssistantMessageRef.current };
        }
      } else {
        // Create new assistant message with current timestamp (when AI starts speaking)
        currentAssistantMessageRef.current = {
          timestamp, // This timestamp stays fixed for the entire message
          role: 'assistant',
          content,
          type: 'message'
        };
        localConversationRef.current.push({ ...currentAssistantMessageRef.current });
      }
      
      // If message is complete, clear current reference
      if (isComplete) {
        currentAssistantMessageRef.current = null;
      }
    } else {
      // For user messages, always create new
      localConversationRef.current.push({
        timestamp,
        role: 'user',
        content,
        type: 'message'
      });
    }
    
    // Update UI
    uiState.value = { 
      ...uiState.value, 
      conversationHistory: [...localConversationRef.current]
    };
  };

  // Handle interruption - mark current assistant message as interrupted
  const handleInterruption = () => {
    if (currentAssistantMessageRef.current) {
      console.log('Marking assistant message as interrupted:', currentAssistantMessageRef.current.content.substring(0, 50) + '...');
      
      // Only add interrupted marker if not already present
      if (!currentAssistantMessageRef.current.content.includes('(unterbrochen)')) {
        currentAssistantMessageRef.current.content += ' ⚠️ (unterbrochen)';
      }
      
      // Update in local history
      const lastIndex = localConversationRef.current.length - 1;
      if (lastIndex >= 0 && localConversationRef.current[lastIndex].role === 'assistant') {
        localConversationRef.current[lastIndex] = { ...currentAssistantMessageRef.current };
        console.log('Updated interrupted message in local history at index:', lastIndex);
      }
      
      currentAssistantMessageRef.current = null;
      
      // Update UI immediately to show the interrupted message
      uiState.value = { 
        ...uiState.value, 
        conversationHistory: [...localConversationRef.current]
      };
      
      console.log('Total messages in local history after interruption:', localConversationRef.current.length);
    } else {
      console.log('No current assistant message to mark as interrupted');
    }
  };

  // Stop audio capture and clear audio queue
  const stopAudioCapture = () => {
    // Clear audio queue and stop playback
    clearAudioQueue();
    
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
  const playAudio = async (audioData: string | Uint8Array) => {
    try {
      console.log('playAudio called with:', typeof audioData, 'length:', audioData instanceof Uint8Array ? audioData.length : 'string');
      
      let arrayBuffer: ArrayBuffer;
      
      if (typeof audioData === 'string') {
        // Handle base64 audio (legacy format)
        const binaryString = atob(audioData);
        arrayBuffer = new ArrayBuffer(binaryString.length);
        const uint8View = new Uint8Array(arrayBuffer);
        for (let i = 0; i < binaryString.length; i++) {
          uint8View[i] = binaryString.charCodeAt(i);
        }
      } else {
        // Handle binary audio data directly
        arrayBuffer = audioData.buffer as ArrayBuffer;
      }
      
      console.log('ArrayBuffer size:', arrayBuffer.byteLength);
      
      // Create DataView for proper endian handling
      const dataView = new DataView(arrayBuffer);
      const sampleCount = arrayBuffer.byteLength / 2; // 2 bytes per 16-bit sample
      
      console.log('Sample count:', sampleCount);
      
      // Convert to Float32Array for AudioBuffer (PCM16 to Float32)
      const float32Data = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        // Read little-endian 16-bit signed integer (OpenAI uses little-endian)
        const int16Sample = dataView.getInt16(i * 2, true);
        // Convert to float [-1, 1] with proper scaling
        float32Data[i] = int16Sample / 32768.0;
      }
      
      console.log('Float32Array created, length:', float32Data.length);
      
      // Add to audio queue
      audioQueueRef.current.push(float32Data);
      
      console.log('Audio added to queue, queue length:', audioQueueRef.current.length);
      
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
      clearLocalConversation();
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
      clearLocalConversation();
    }
  };

  const toggleVoiceChat = () => {
    if (isConnected.value) {
      stopVoiceChat();
    } else {
      startVoiceChat();
    }
  };

  function pauseSession() {
    if (!isPaused.value) {
      isPaused.value = true;
      stopAudioCapture();
      clearAudioQueue();
      status.value = "Pausiert – klicke auf Fortsetzen";
    }
  }

  function resumeSession() {
    if (isPaused.value) {
      isPaused.value = false;
      startAudioCapture();
      status.value = "Mit Der Spielleiter verbunden – Sprich jetzt!";
    }
  }

  return (
    <div class="max-w-7xl mx-auto p-4 space-y-6">
      {/* Main Voice Interface */}
      <div class="text-center bg-gradient-to-br from-purple-900 to-blue-900 p-8 rounded-xl shadow-2xl">
      
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
        {isConnected.value && (
          <div class="flex justify-center gap-4 mt-4">
            <button
              class={`px-4 py-2 rounded bg-yellow-500 text-white font-bold ${isPaused.value ? 'opacity-50' : ''}`}
              onClick={pauseSession}
              disabled={isPaused.value}
            >
              ⏸️ Pause
            </button>
            <button
              class={`px-4 py-2 rounded bg-green-500 text-white font-bold ${!isPaused.value ? 'opacity-50' : ''}`}
              onClick={resumeSession}
              disabled={!isPaused.value}
            >
              ▶️ Fortsetzen
            </button>
          </div>
        )}
        
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
      <div class="flex flex-col lg:flex-row gap-6 w-full">
        {/* Character Sheet */}
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl w-full min-w-0">
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
                <span class="text-blue-400">
                  {typeof uiState.value.gameState.player.background === 'string' 
                    ? uiState.value.gameState.player.background 
                    : uiState.value.gameState.player.background.motivation || 'Soldat'}
                </span>
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
            
            {/* Equipment */}
            {uiState.value.gameState.player.equipment && (
              <div class="mt-4">
                <div class="text-gray-400 mb-2">Ausrüstung:</div>
                
                {/* Weapons */}
                {uiState.value.gameState.player.equipment.weapons && (
                  <div class="mb-2">
                    <div class="text-xs text-gray-500 mb-1">Waffen:</div>
                    {Object.entries(uiState.value.gameState.player.equipment.weapons).map(([slot, weapon]: [string, any]) => (
                      <div key={slot} class="text-xs text-gray-300 mb-1">
                        <span class="text-blue-300">{weapon.name}</span>
                        <span class="text-gray-500"> ({slot === 'primary' ? 'Primär' : 'Sekundär'})</span>
                        <span class="text-red-300"> {weapon.damage}</span>
                        <span class="text-green-300"> {weapon.range}</span>
                        {weapon.properties && weapon.properties.length > 0 && (
                          <span class="text-yellow-300"> {weapon.properties.join(', ')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Armor */}
                {uiState.value.gameState.player.equipment.armor && (
                  <div class="mb-2">
                    <div class="text-xs text-gray-500 mb-1">Rüstung:</div>
                    <div class="text-xs text-gray-300 mb-1">
                      <span class="text-green-300">{uiState.value.gameState.player.equipment.armor.name}</span>
                      <span class="text-green-300"> {uiState.value.gameState.player.equipment.armor.armorScore} Armor</span>
                      {uiState.value.gameState.player.equipment.armor.thresholds && (
                        <span class="text-blue-300"> Minor {uiState.value.gameState.player.equipment.armor.thresholds.minor}/Major {uiState.value.gameState.player.equipment.armor.thresholds.major}</span>
                      )}
                      {uiState.value.gameState.player.equipment.armor.properties && uiState.value.gameState.player.equipment.armor.properties.length > 0 && (
                        <span class="text-yellow-300"> {uiState.value.gameState.player.equipment.armor.properties.join(', ')}</span>
                      )}
                      {uiState.value.gameState.player.equipment.armor.evasionBonus && (
                        <span class="text-cyan-300"> +{uiState.value.gameState.player.equipment.armor.evasionBonus} Evasion</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Experiences */}
            {uiState.value.gameState.player.experiences && uiState.value.gameState.player.experiences.length > 0 && (
              <div class="mt-4">
                <div class="text-gray-400 mb-2">Erfahrungen:</div>
                <div class="flex flex-wrap gap-1">
                  {uiState.value.gameState.player.experiences.map((experience, index) => (
                    <span key={index} class="bg-purple-900 px-2 py-1 rounded text-xs text-purple-300">
                      {typeof experience === 'string' ? experience : (experience as any).name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Current Scene */}
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl w-full min-w-0">
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
                      {typeof item === 'string' ? item : item.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Language Learning Progress */}
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl w-full min-w-0">
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
          <div class="space-y-3 text-sm max-h-256 overflow-y-auto">
            {uiState.value.conversationHistory.length > 0 ? (
              uiState.value.conversationHistory.slice(-20).map((message, index) => {
                if (message.role === 'tool' || message.type === 'tool_call') {
                  // Tool call entry
                  return (
                    <div key={index} class="p-3 rounded-lg bg-gray-800 mx-4 border-l-4 border-gray-400 flex flex-col gap-1">
                      <div class="flex justify-between items-start mb-1">
                        <span class="text-xs font-semibold text-gray-300 flex items-center gap-1">
                          <span>🛠️ Tool</span>
                          {message.toolName && <span class="ml-1 font-mono text-xs text-gray-400">{message.toolName}</span>}
                        </span>
                        <span class="text-gray-500 text-xs">{message.timestamp}</span>
                      </div>
                      <div class="text-gray-200 text-xs font-mono whitespace-pre-wrap break-words">
                        {message.content}
                      </div>
                    </div>
                  );
                } else {
                  // User or assistant message
                  return (
                    <div key={index} class={`p-3 rounded-lg ${
                      message.role === 'user' 
                        ? 'bg-white ml-4 border-l-2 border-green-500' 
                        : 'bg-white mr-4 border-l-2 border-blue-500'
                    }`}>
                      <div class="flex justify-between items-start mb-1">
                        <span class={`text-xs font-semibold ${
                          message.role === 'user' ? 'text-green-700' : 'text-blue-700'
                        }`}>
                          {message.role === 'user' ? 'Du' : 'Der Spielleiter'}
                        </span>
                        <span class="text-gray-500 text-xs">{message.timestamp}</span>
                      </div>
                      <div class="text-black text-sm leading-relaxed">
                        {message.content}
                      </div>
                    </div>
                  );
                }
              })
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