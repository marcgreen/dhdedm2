import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";

interface VoiceChatProps {}

export default function VoiceChat(_props: VoiceChatProps) {
  const isConnected = useSignal(false);
  const isConnecting = useSignal(false);
  const status = useSignal("Ready to start");
  const sessionRef = useRef<any>(null);

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
      
      // Follow the EXACT pattern from the docs
      const { RealtimeAgent, RealtimeSession } = await import('@openai/agents/realtime');
      
      const agent = new RealtimeAgent({
        name: 'Assistant',
        instructions: 'You are a helpful voice assistant. Keep your responses natural, conversational, and concise.',
      });

      const session = new RealtimeSession(agent, {
        model: 'gpt-4o-realtime-preview-2025-06-03',
      });
      
      sessionRef.current = session;
      
      // Connect using the ephemeral client token (secure for browser)
      await session.connect({
        apiKey: config.clientApiKey,
      });
      
      isConnected.value = true;
      isConnecting.value = false;
      status.value = "Connected - Speak now!";
      console.log('Voice session connected successfully with ephemeral token');
      
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
      if (sessionRef.current) {
        await sessionRef.current.disconnect();
        sessionRef.current = null;
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
            🔒 Secure ephemeral token • 🚀 OpenAI Agents SDK
          </div>
        )}
      </div>
    </div>
  );
} 