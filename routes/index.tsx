import { useSignal } from "@preact/signals";
import { IS_BROWSER } from "$fresh/runtime.ts";
import VoiceChat from "../islands/VoiceChat.tsx";

export default function Home() {
  return (
    <div class="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 px-4 py-8">
      <div class="max-w-screen-md mx-auto flex flex-col items-center justify-center min-h-screen">
        <div class="text-center mb-8">
          <h1 class="text-5xl font-bold text-white mb-4">
            🎙️ Voice Chat AI
          </h1>
          <p class="text-xl text-blue-100">
            Talk with AI using your voice
          </p>
        </div>
        
        <div class="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
          <VoiceChat />
        </div>
        
        <div class="mt-8 text-center">
          <p class="text-blue-100 text-sm">
            Click the microphone to start a voice conversation
          </p>
        </div>
      </div>
    </div>
  );
}
