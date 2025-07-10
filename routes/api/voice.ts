import { Handlers } from "$fresh/server.ts";

interface VoiceRequest {
  action: string;
  audio?: ArrayBuffer;
}

// Store active WebSocket connections
const activeConnections = new Map<string, WebSocket>();

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
        // Return configuration without the API key
        return new Response(
          JSON.stringify({ 
            status: "ready",
            // Don't send API key to client for security
            useServerProxy: true
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
  
  // Handle WebSocket upgrades for secure voice communication
  async GET(req, _ctx) {
    const upgrade = req.headers.get("upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected websocket", { status: 400 });
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response("OpenAI API key not configured", { status: 500 });
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    const connectionId = crypto.randomUUID();
    
    socket.onopen = async () => {
      console.log(`Client WebSocket connected: ${connectionId}`);
      
      try {
        // Create connection to OpenAI Realtime API
        const openaiWs = new WebSocket(
          'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01',
          ['realtime', `openai-insecure-api-key.${apiKey}`]
        );
        
        activeConnections.set(connectionId, openaiWs);
        
        openaiWs.onopen = () => {
          console.log('Connected to OpenAI Realtime API');
          
          // Send session configuration
          openaiWs.send(JSON.stringify({
            type: 'session.update',
            session: {
              modalities: ['text', 'audio'],
              instructions: 'You are a helpful voice assistant. Keep your responses natural, conversational, and concise.',
              voice: 'alloy',
              input_audio_format: 'pcm16',
              output_audio_format: 'pcm16',
              input_audio_transcription: {
                model: 'whisper-1'
              },
              turn_detection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500
              }
            }
          }));
          
          // Notify client that connection is ready
          socket.send(JSON.stringify({
            type: 'connection_ready',
            status: 'connected'
          }));
        };
        
        openaiWs.onmessage = (event) => {
          // Forward OpenAI messages to client
          socket.send(event.data);
        };
        
        openaiWs.onerror = (error) => {
          console.error('OpenAI WebSocket error:', error);
          socket.send(JSON.stringify({
            type: 'error',
            error: 'OpenAI connection error'
          }));
        };
        
        openaiWs.onclose = () => {
          console.log('OpenAI WebSocket closed');
          socket.send(JSON.stringify({
            type: 'connection_closed',
            status: 'disconnected'
          }));
        };
        
      } catch (error) {
        console.error('Failed to connect to OpenAI:', error);
        socket.send(JSON.stringify({
          type: 'error',
          error: 'Failed to connect to OpenAI'
        }));
      }
    };
    
    socket.onmessage = (event) => {
      // Forward client messages to OpenAI
      const openaiWs = activeConnections.get(connectionId);
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.send(event.data);
      }
    };
    
    socket.onclose = () => {
      console.log(`Client WebSocket disconnected: ${connectionId}`);
      
      // Clean up OpenAI connection
      const openaiWs = activeConnections.get(connectionId);
      if (openaiWs) {
        openaiWs.close();
        activeConnections.delete(connectionId);
      }
    };
    
    return response;
  },
  
  // Handle preflight requests for CORS
  OPTIONS(_req, _ctx) {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Upgrade, Connection",
      },
    });
  },
}; 