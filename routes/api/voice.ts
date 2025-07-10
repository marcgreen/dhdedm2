import { Handlers } from "$fresh/server.ts";

interface VoiceRequest {
  action: string;
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
        try {
          // Generate ephemeral client token using the main API key
          const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-realtime-preview-2025-06-03'
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenAI API Error:', response.status, errorText);
            throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
          }

          const sessionData = await response.json();
          console.log('Generated ephemeral token successfully');

          // Return the ephemeral client token (secure for browser use)
          return new Response(
            JSON.stringify({ 
              clientApiKey: sessionData.client_secret.value,
              status: "ready"
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          );

        } catch (error) {
          console.error('Failed to generate ephemeral token:', error);
          return new Response(
            JSON.stringify({ 
              error: "Failed to generate session token",
              details: error instanceof Error ? error.message : String(error)
            }),
            { 
              status: 500,
              headers: { "Content-Type": "application/json" }
            }
          );
        }
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
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  },
}; 