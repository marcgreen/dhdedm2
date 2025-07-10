import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";

interface VoiceChatProps {}

export default function VoiceChat(_props: VoiceChatProps) {
  const isConnected = useSignal(false);
  const isConnecting = useSignal(false);
  const status = useSignal("Ready to start");
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

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

  const startVoiceChat = async () => {
    if (!IS_BROWSER || isConnecting.value) return;
    
    try {
      isConnecting.value = true;
      status.value = "Connecting...";
      
      // Check server configuration
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
      console.log('Server config:', config);
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        }
      });
      
      streamRef.current = stream;
      
      // Create AudioContext for processing
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Connect to our secure WebSocket proxy
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/api/voice`;
      const ws = new WebSocket(wsUrl);
      
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('Connected to secure WebSocket proxy');
        status.value = "Connecting to OpenAI...";
      };
      
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);
        
        switch (message.type) {
          case 'connection_ready':
            isConnected.value = true;
            isConnecting.value = false;
            status.value = "Connected - Speak now!";
            startAudioCapture();
            break;
            
          case 'input_audio_buffer.speech_started':
            status.value = "Listening...";
            break;
            
          case 'input_audio_buffer.speech_stopped':
            status.value = "Processing...";
            break;
            
          case 'response.audio.delta':
            status.value = "AI is speaking...";
            // Handle audio playback
            if (message.audio) {
              playAudioChunk(message.audio);
            }
            break;
            
          case 'response.done':
            status.value = "Connected - Speak now!";
            break;
            
          case 'error':
            console.error('Server error:', message);
            status.value = "Error: " + message.error;
            isConnected.value = false;
            isConnecting.value = false;
            break;
            
          case 'connection_closed':
            isConnected.value = false;
            isConnecting.value = false;
            status.value = "Disconnected";
            break;
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        status.value = "Connection error";
        isConnected.value = false;
        isConnecting.value = false;
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        isConnected.value = false;
        isConnecting.value = false;
        status.value = "Disconnected";
      };
      
    } catch (error) {
      console.error('Voice chat error:', error);
      status.value = "Error: " + (error as Error).message;
      isConnecting.value = false;
      isConnected.value = false;
    }
  };

  const startAudioCapture = () => {
    if (!streamRef.current || !wsRef.current) return;
    
    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: 'audio/webm;codecs=opus'
    });
    
    mediaRecorderRef.current = mediaRecorder;
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
        // Convert audio to base64 and send to server
        const reader = new FileReader();
        reader.onload = () => {
          const base64Audio = (reader.result as string).split(',')[1];
          wsRef.current?.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64Audio
          }));
        };
        reader.readAsDataURL(event.data);
      }
    };
    
    mediaRecorder.start(100); // Send audio chunks every 100ms
  };

  const playAudioChunk = async (base64Audio: string) => {
    if (!audioContextRef.current) return;
    
    try {
      const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
      const audioBuffer = await audioContextRef.current.decodeAudioData(audioData.buffer);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start();
    } catch (error) {
      console.error('Audio playback error:', error);
    }
  };

  const stopVoiceChat = async () => {
    if (!IS_BROWSER) return;
    
    try {
      // Stop media recorder
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      }
      
      // Stop stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // Close WebSocket
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      
      // Close audio context
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      
      isConnected.value = false;
      isConnecting.value = false;
      status.value = "Ready to start";
    } catch (error) {
      console.error('Error stopping voice chat:', error);
      status.value = "Error stopping session";
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
    <div class="text-center">
      <div class="mb-6">
        <button
          onClick={toggleVoiceChat}
          class={`w-20 h-20 rounded-full text-white text-2xl font-bold transition-all duration-200 ${
            isConnected.value 
              ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
              : isConnecting.value
              ? 'bg-yellow-500 animate-spin'
              : 'bg-blue-500 hover:bg-blue-600 hover:scale-105'
          }`}
          disabled={!IS_BROWSER || isConnecting.value}
        >
          {isConnecting.value ? '⏳' : isConnected.value ? '🔴' : '🎙️'}
        </button>
      </div>
      
      <div class="space-y-2">
        <p class={`text-lg font-semibold ${
          isConnected.value ? 'text-green-600' : 
          isConnecting.value ? 'text-yellow-600' : 'text-gray-600'
        }`}>
          {status.value}
        </p>
        
        <div class="text-sm text-gray-500">
          {isConnected.value ? 'Click to stop' : 'Click to start talking'}
        </div>
        
        {isConnected.value && (
          <div class="text-xs text-gray-400 mt-4">
            🎤 Voice detection active • 🔊 AI responses will play automatically
            <br />
            🔒 Secure connection via server proxy
          </div>
        )}
      </div>
    </div>
  );
} 