import { Handlers } from "$fresh/server.ts";
import { RealtimeAgent, RealtimeSession } from "@openai/agents-realtime";
import { tool } from "@openai/agents-realtime";

// Store active sessions
const sessions = new Map<string, RealtimeSession>();

// Game state management tools
const createGameStateTools = () => {
  const updateCharacterTool = tool({
    name: 'update_character',
    description: 'Update character information including name, level, HP, attributes, and location',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        level: { type: 'number' },
        hitPoints: { type: 'number' },
        maxHitPoints: { type: 'number' },
        location: { type: 'string' },
        attributes: {
          type: 'object',
          properties: {
            strength: { type: 'number' },
            dexterity: { type: 'number' },
            constitution: { type: 'number' },
            intelligence: { type: 'number' },
            wisdom: { type: 'number' },
            charisma: { type: 'number' },
          }
        }
      },
      required: [],
      additionalProperties: true,
    },
    async execute(args: any) {
      return `Character updated: ${args.name || 'Unknown'} (Level ${args.level || 1})`;
    },
  });

  const updateInventoryTool = tool({
    name: 'update_inventory',
    description: 'Add or remove items from character inventory',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'remove'] },
        items: { type: 'array', items: { type: 'string' } },
      },
      required: ['action', 'items'],
      additionalProperties: true,
    },
    async execute(args: any) {
      return `Inventory updated: ${args.action === 'add' ? 'Added' : 'Removed'} ${args.items.join(', ')}`;
    },
  });

  const updateSceneTool = tool({
    name: 'update_scene',
    description: 'Update the current scene, description, and location',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        scene: { type: 'string' },
        description: { type: 'string' },
        location: { type: 'string' },
      },
      required: ['scene', 'description'],
      additionalProperties: true,
    },
    async execute(args: any) {
      return `Scene updated: ${args.scene} - ${args.description}`;
    },
  });

  const rollDiceTool = tool({
    name: 'roll_dice',
    description: 'Roll dice for game mechanics (d4, d6, d8, d10, d12, d20, d100)',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        sides: { type: 'number' },
        count: { type: 'number', default: 1 },
        modifier: { type: 'number', default: 0 },
      },
      required: ['sides'],
      additionalProperties: true,
    },
    async execute(args: any) {
      const rolls = [];
      const count = args.count || 1;
      const modifier = args.modifier || 0;
      
      for (let i = 0; i < count; i++) {
        rolls.push(Math.floor(Math.random() * args.sides) + 1);
      }
      const total = rolls.reduce((sum, roll) => sum + roll, 0) + modifier;
      
      const rollString = `${count}d${args.sides}${modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : ''}`;
      return `Rolled ${rollString}: [${rolls.join(', ')}] = ${total}`;
    },
  });

  const manageQuestsTool = tool({
    name: 'manage_quests',
    description: 'Add, complete, or update quests',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'complete', 'update'] },
        quest: { type: 'string' },
        index: { type: 'number' },
      },
      required: ['action', 'quest'],
      additionalProperties: true,
    },
    async execute(args: any) {
      return `Quest ${args.action}: ${args.quest}`;
    },
  });

  const trackLanguageTool = tool({
    name: 'track_language',
    description: 'Track German language learning progress',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        corrections: { type: 'number' },
        newVocabulary: { type: 'array', items: { type: 'string' } },
      },
      required: [],
      additionalProperties: true,
    },
    async execute(args: any) {
      return `Language progress updated`;
    },
  });



  return [
    updateCharacterTool,
    updateInventoryTool,
    updateSceneTool,
    rollDiceTool,
    manageQuestsTool,
    trackLanguageTool,
  ];
};

export const handler: Handlers = {
  GET(req) {
    const { socket, response } = Deno.upgradeWebSocket(req);
    let sessionId: string | null = null;
    let realtimeSession: RealtimeSession | null = null;

    socket.onopen = () => {
      console.log("WebSocket connection opened");
      sessionId = crypto.randomUUID();
    };

    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        // console.log('Received WebSocket message:', message.type);
        
        switch (message.type) {
          case 'connect':
            if (!message.clientApiKey) {
              socket.send(JSON.stringify({ 
                type: 'error', 
                error: 'No client API key provided' 
              }));
              return;
            }

            try {
              console.log('Creating RealtimeAgent and RealtimeSession...');
              
              // Create the agent with tools
              const tools = createGameStateTools();
              console.log('Game tools created successfully');
              
              const agent = new RealtimeAgent({
                name: 'Der Spielleiter',
                instructions: `Du bist "Der Spielleiter" - ein deutschsprachiger Dungeonmaster und Deutschlehrer.

**SPRACHREGELN (ABSOLUT WICHTIG):**
- Sprich NUR auf Deutsch (B1-B2 Niveau)
- Verwende Wortschatz für Fortgeschrittene (ca. 2000-4000 Wörter)
- Korrigiere Fehler sanft im Spielkontext
- Führe neues Vokabular natürlich ein
- Ermutige beschreibende Sprache zum Üben

**SPIELLEITER-ROLLE:**
- Erstelle fesselnde Fantasy-Szenarien
- Verwalte Regeln, Würfelwürfe und Charakterentwicklung
- Halte den Erzählfluss aufrecht
- Reagiere dynamisch auf Spielerentscheidungen
- Verwende die bereitgestellten Tools für Zustandsverwaltung

**TOOL-VERWENDUNG (WICHTIG):**
- Nutze 'update_character' für Name, Level, HP, Attribute, Ort
- Nutze 'update_inventory' für Gegenstände (add/remove)
- Nutze 'update_scene' für Schauplätze und Beschreibungen
- Nutze 'roll_dice' für alle Würfelwürfe
- Nutze 'manage_quests' für Aufgaben (add/complete/update)
- Nutze 'track_language' für Sprachlernfortschritt
- Nutze 'add_game_log' für wichtige Ereignisse (z.B. "Hans betritt die Taverne", "Kampf mit Goblins beginnt", "Quest abgeschlossen")

Starte mit einer freundlichen Begrüßung und frage nach dem Namen des Charakters. Nutze dann die Tools, um die Charaktererstellung zu verwalten und das Abenteuer zu beginnen!`,
                tools: tools,
              });

              // Create session with WebSocket transport (for server-side use)
              console.log('Creating RealtimeSession with WebSocket transport...');
              realtimeSession = new RealtimeSession(agent, {
                transport: 'websocket',
                model: 'gpt-4o-realtime-preview-2025-06-03',
                config: {
                  inputAudioTranscription: {
                    model: 'gpt-4o-mini-transcribe',
                  },
                },
              });
              console.log('RealtimeSession created successfully');

                            // Set up audio response listening using the official documented API
              console.log('RealtimeSession created successfully, setting up audio response listener');
              
              // Listen for audio responses using the documented API
              realtimeSession.on('audio', (event: any) => {
                // According to docs: event.data is a chunk of PCM16 audio
                const audioData = event.data || event;
                
                if (audioData) {
                  try {
                    let base64Audio;
                    
                    if (audioData instanceof ArrayBuffer) {
                      base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioData)));
                    } else if (audioData instanceof Uint8Array) {
                      base64Audio = btoa(String.fromCharCode(...audioData));
                    } else if (typeof audioData === 'string') {
                      base64Audio = audioData;
                    } else {
                      console.log('Unknown audio data format:', typeof audioData);
                    }
                    
                    if (base64Audio) {
                      socket.send(JSON.stringify({ 
                        type: 'audio', 
                        audio: base64Audio
                      }));
                    } else {
                      console.log('Failed to convert audio data to base64');
                    }
                  } catch (error) {
                    console.error('Error processing audio data:', error);
                  }
                } else {
                  console.log('Audio event received but no data found');
                }
              });

              // Listen for conversation history updates (documented API)
              realtimeSession.on('history_updated', (history: any) => {
                console.log('Conversation history updated, sending to client');
                
                // Debug: Log the structure to see if tool calls are included
                if (history && Array.isArray(history)) {
                  const toolCalls = history.filter((item: any) => 
                    item.type === 'function_call' || item.type === 'tool_call'
                  );
                  if (toolCalls.length > 0) {
                    console.log('Found tool calls in history:', toolCalls.map((tc: any) => ({
                      type: tc.type,
                      name: tc.name,
                      status: tc.status,
                      arguments: tc.arguments,
                      output: tc.output
                    })));
                  }
                }
                
                socket.send(JSON.stringify({
                  type: 'history_updated',
                  history: history
                }));
              });
              
              console.log('✅ Audio and conversation event listeners set up successfully');

              // Connect to OpenAI using WebSocket transport
              console.log('Connecting to OpenAI Realtime API via WebSocket...');
              await realtimeSession.connect({
                apiKey: message.clientApiKey,
              });
              console.log('Successfully connected to OpenAI Realtime API via WebSocket');

              if (sessionId) {
                sessions.set(sessionId, realtimeSession);
              }

              socket.send(JSON.stringify({ 
                type: 'connected', 
                sessionId 
              }));
              console.log('WebSocket connection completed successfully');

                         } catch (error) {
              console.error('Failed to create session:', error);
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.error('Error details:', errorMessage);
              socket.send(JSON.stringify({ 
                type: 'error', 
                error: `Failed to create session: ${errorMessage}` 
              }));
            }
            break;

          case 'audio':
            if (!realtimeSession) {
              console.error('No realtime session available for audio processing');
              socket.send(JSON.stringify({ 
                type: 'error', 
                error: 'Realtime session not initialized' 
              }));
              break;
            }
            
            if (!message.audio) {
              console.error('Audio message received without audio data');
              break;
            }

            try {
              // Convert base64 back to ArrayBuffer (PCM16 format)
              const binaryString = atob(message.audio);
              const arrayBuffer = new ArrayBuffer(binaryString.length);
              const view = new Uint8Array(arrayBuffer);
              
              for (let i = 0; i < binaryString.length; i++) {
                view[i] = binaryString.charCodeAt(i);
              }
              
              // Send PCM16 audio to OpenAI Realtime API
              if (typeof realtimeSession.sendAudio === 'function') {
                const result = await realtimeSession.sendAudio(arrayBuffer);
                
                // Check session state less frequently for debugging
                if (Math.random() < 0.001) { // Very rarely log session state
                  setTimeout(() => {
                    try {
                      if (!realtimeSession) return;
                      
                      const session = realtimeSession as any;
                      if (session && session.getState) {
                        console.log('Session state check:', typeof session.getState());
                      }
                    } catch (e) {
                      // Silently ignore session state check errors
                    }
                  }, 100);
                }
                
              } else {
                console.error('sendAudio method not available on RealtimeSession');
                socket.send(JSON.stringify({ 
                  type: 'error', 
                  error: 'sendAudio method not available' 
                }));
              }
              
            } catch (error) {
              console.error('Error processing PCM16 audio:', error);
              const errorMessage = error instanceof Error ? error.message : String(error);
              socket.send(JSON.stringify({ 
                type: 'error', 
                error: `Audio processing failed: ${errorMessage}` 
              }));
            }
            break;

          case 'disconnect':
            if (realtimeSession) {
              try {
                if (typeof (realtimeSession as any).close === 'function') {
                  await (realtimeSession as any).close();
                } else if (typeof (realtimeSession as any).disconnect === 'function') {
                  await (realtimeSession as any).disconnect();
                }
              } catch (error) {
                console.error('Error closing session:', error as Error);
              }
              
              if (sessionId) {
                sessions.delete(sessionId);
              }
              realtimeSession = null;
            }
            socket.send(JSON.stringify({ type: 'disconnected' }));
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        socket.send(JSON.stringify({ 
          type: 'error', 
          error: (error as Error).message 
        }));
      }
    };

    socket.onclose = () => {
      console.log("WebSocket connection closed");
      // Clean up session if still active
      if (realtimeSession && sessionId) {
        sessions.delete(sessionId);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return response;
  },
}; 