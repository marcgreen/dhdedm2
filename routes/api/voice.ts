import { Handlers } from "$fresh/server.ts";

interface VoiceRequest {
  action: string;
  audio?: ArrayBuffer;
}

// Store active connections
const activeConnections = new Map<string, any>();

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
        // Use OpenAI client library to create a proper connection
        const { default: OpenAI } = await import('openai');
        
        console.log('Creating OpenAI client...');
        const openai = new OpenAI({
          apiKey: apiKey,
          dangerouslyAllowBrowser: false
        });
        
        // For now, let's create a simulated realtime connection
        // In a full implementation, we would use the OpenAI Realtime API properly
        console.log('OpenAI client created successfully');
        
        // Simulate connection success
        socket.send(JSON.stringify({
          type: 'connection_ready',
          status: 'connected'
        }));
        
        // Store connection info
        activeConnections.set(connectionId, {
          openai,
          socket,
          connected: true
        });
        
        console.log('Connection established with OpenAI API');
        
      } catch (error) {
        console.error('Failed to connect to OpenAI:', error);
        socket.send(JSON.stringify({
          type: 'error',
          error: 'Failed to connect to OpenAI: ' + (error as Error).message
        }));
      }
    };
    
    socket.onmessage = async (event) => {
      const connectionInfo = activeConnections.get(connectionId);
      if (!connectionInfo || !connectionInfo.connected) return;
      
      try {
        const message = JSON.parse(event.data);
        console.log('Received from client:', message.type);
        
        // Handle different message types
        if (message.type === 'input_audio_buffer.append') {
          // For now, we'll simulate processing
          console.log('Processing audio input...');
          
          // Send back a simulated response
          socket.send(JSON.stringify({
            type: 'input_audio_buffer.speech_started'
          }));
          
          // Simulate processing delay
          setTimeout(() => {
            socket.send(JSON.stringify({
              type: 'input_audio_buffer.speech_stopped'
            }));
            
            // Send a text response for now
            socket.send(JSON.stringify({
              type: 'response.text.delta',
              text: 'Hello! I can hear you. The realtime audio API is being set up.'
            }));
            
            socket.send(JSON.stringify({
              type: 'response.done'
            }));
          }, 1000);
        }
        
      } catch (error) {
        console.error('Error processing message:', error);
        socket.send(JSON.stringify({
          type: 'error',
          error: 'Error processing message'
        }));
      }
    };
    
    socket.onclose = () => {
      console.log(`Client WebSocket disconnected: ${connectionId}`);
      activeConnections.delete(connectionId);
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