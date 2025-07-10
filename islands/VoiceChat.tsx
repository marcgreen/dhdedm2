import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";

interface VoiceChatProps {}

export default function VoiceChat(_props: VoiceChatProps) {
  const isRecording = useSignal(false);
  const isConnected = useSignal(false);
  const status = useSignal("Ready to start");
  const audioRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize voice chat when component mounts
  useEffect(() => {
    if (!IS_BROWSER) return;
    
    // Request microphone permission on load
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        status.value = "Microphone ready";
      })
      .catch((err) => {
        console.error("Microphone permission denied:", err);
        status.value = "Microphone permission required";
      });
  }, []);

  const startVoiceChat = async () => {
    if (!IS_BROWSER) return;
    
    try {
      status.value = "Connecting...";
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        }
      });
      
      streamRef.current = stream;
      
      // Create media recorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      
      // Start recording
      mediaRecorder.start();
      isRecording.value = true;
      status.value = "Listening... Speak now!";
      
      // Connect to voice API
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'start',
        }),
      });
      
      if (response.ok) {
        isConnected.value = true;
        status.value = "Connected - Speak now!";
      } else {
        throw new Error('Failed to connect to voice service');
      }
      
    } catch (error) {
      console.error('Voice chat error:', error);
      status.value = "Error: " + (error as Error).message;
      stopVoiceChat();
    }
  };

  const stopVoiceChat = () => {
    if (!IS_BROWSER) return;
    
    // Stop recording
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    
    // Stop stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      streamRef.current = null;
    }
    
    isRecording.value = false;
    isConnected.value = false;
    status.value = "Ready to start";
  };

  const toggleVoiceChat = () => {
    if (isRecording.value) {
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
            isRecording.value 
              ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
              : 'bg-blue-500 hover:bg-blue-600 hover:scale-105'
          }`}
          disabled={!IS_BROWSER}
        >
          {isRecording.value ? '🔴' : '🎙️'}
        </button>
      </div>
      
      <div class="space-y-2">
        <p class={`text-lg font-semibold ${
          isConnected.value ? 'text-green-600' : 'text-gray-600'
        }`}>
          {status.value}
        </p>
        
        <div class="text-sm text-gray-500">
          {isRecording.value ? 'Click to stop' : 'Click to start talking'}
        </div>
      </div>
      
      {/* Hidden audio element for playback */}
      <audio ref={audioRef} autoPlay class="hidden" />
    </div>
  );
} 