import { Handlers } from "$fresh/server.ts";
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";

interface VoiceRequest {
  action: string;
  audio?: ArrayBuffer;
}

export const handler: Handlers = {
  async POST(req, _ctx) {
    try {
      const apiKey = Deno.env.get("OPENAI_API_KEY");
      
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "OpenAI API key not configured" }),
          { 
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      const body: VoiceRequest = await req.json();
      
      if (body.action === "start") {
        // Create a new realtime agent
        const agent = new RealtimeAgent({
          name: "Voice Assistant",
          instructions: `You are a helpful voice assistant. Keep your responses:
- Natural and conversational
- Friendly and engaging
- Concise but informative
- Appropriate for voice interaction
- Easy to understand when spoken aloud`,
          model: "gpt-4o-realtime-preview-2024-10-01",
          voice: "alloy",
          temperature: 0.7,
        });

        // Create a new realtime session
        const session = new RealtimeSession(agent);
        
        // Connect to OpenAI Realtime API
        await session.connect({
          apiKey,
        });

        return new Response(
          JSON.stringify({ 
            status: "connected",
            message: "Voice assistant is ready to chat!"
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      
      if (body.action === "stop") {
        // Handle stopping the voice session
        return new Response(
          JSON.stringify({ 
            status: "disconnected",
            message: "Voice session ended"
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      return new Response(
        JSON.stringify({ error: "Invalid action" }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
      
    } catch (error) {
      console.error("Voice API error:", error);
      
      return new Response(
        JSON.stringify({ 
          error: "Failed to process voice request",
          details: error instanceof Error ? error.message : String(error)
        }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  },
  
  // Handle preflight requests for CORS
  OPTIONS(_req, _ctx) {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  },
}; 