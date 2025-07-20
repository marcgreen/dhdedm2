import { useSignal } from "@preact/signals";
import { IS_BROWSER } from "$fresh/runtime.ts";
import VoiceChat from "../islands/VoiceChat.tsx";

export default function Home() {
  return (
    <div class="min-h-screen bg-gray-100 px-4 py-8">
      <div class="max-w-7xl mx-auto flex flex-col items-center justify-center min-h-screen">
        <div class="text-center mb-8">
          <h1 class="text-5xl font-bold text-gray-800 mb-4">
            🎙️ Voice Chat Daggerheart DM
          </h1>
          <p class="text-xl text-gray-600">
            Practice your German speaking by playing Daggerheart
          </p>
        </div>
        
        <div class="bg-white rounded-xl shadow-lg p-8 w-full">
          <VoiceChat />
        </div>
        
        <div class="mt-8 text-center">
          <p class="text-gray-600 text-sm">
            Click the microphone to start a voice conversation
          </p>
        </div>
      </div>
    </div>
  );
}
