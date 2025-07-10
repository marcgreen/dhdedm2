import { Handlers } from "$fresh/server.ts";

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
      
      if (body.action === "get_session_config") {
        // Return the API key and configuration for the frontend
        return new Response(
          JSON.stringify({ 
            apiKey: apiKey,
            status: "ready"
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      
      if (body.action === "start") {
        // Legacy action for backward compatibility
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