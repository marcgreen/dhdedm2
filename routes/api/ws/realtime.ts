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

  const addGameLogTool = tool({
    name: 'add_game_log',
    description: 'Add important events to the game log',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        entry: { type: 'string' },
      },
      required: ['entry'],
      additionalProperties: true,
    },
    async execute(args: any) {
      return `Log entry added: ${args.entry}`;
    },
  });

  return [
    updateCharacterTool,
    updateInventoryTool,
    updateSceneTool,
    rollDiceTool,
    manageQuestsTool,
    trackLanguageTool,
    addGameLogTool,
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
        console.log('Received WebSocket message:', message.type);
        
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
- Nutze 'add_game_log' für wichtige Ereignisse

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

              // Set up comprehensive audio response debugging
              console.log('RealtimeSession created successfully, setting up audio response monitoring');
              
              // Add debug logging for all possible events
              const realtimeSessionAny = realtimeSession as any;
              
              // Try to listen for audio-related events
              if (typeof realtimeSessionAny.on === 'function') {
                console.log('RealtimeSession has event emitter capabilities');
                
                                 // Listen for all events to debug what's available
                 const originalEmit = realtimeSessionAny.emit;
                 if (originalEmit) {
                   realtimeSessionAny.emit = function(eventNameOrObj: any, ...args: any[]) {
                     // Handle both string event names and object events
                     const eventName = typeof eventNameOrObj === 'string' ? eventNameOrObj : JSON.stringify(eventNameOrObj);
                     const eventData = typeof eventNameOrObj === 'string' ? (args.length > 0 ? args[0] : null) : eventNameOrObj;
                     
                     console.log(`🎵 RealtimeSession event emitted: ${eventName}`, eventData);
                     
                     // Check for audio-related events - look in both event name and event data
                     const eventStr = eventName.toLowerCase();
                     const isAudioEvent = eventStr.includes('audio') || eventStr.includes('response') || eventStr.includes('delta') ||
                                          (eventData && typeof eventData === 'object' && (
                                            eventData.type?.includes('audio') || 
                                            eventData.type?.includes('response') ||
                                            eventData.audio ||
                                            eventData.delta
                                          ));
                     
                     if (isAudioEvent) {
                       console.log(`🔊 AUDIO EVENT DETECTED: ${eventName}`, eventData);
                       
                                               // Try to extract audio data from various locations
                        let audioData: any = null;
                       if (eventData) {
                         audioData = eventData.audio || eventData.delta || eventData.data;
                         
                         // Also check if the event is a response with audio content
                         if (eventData.type === 'response.audio.delta' || eventData.type === 'response.audio') {
                           audioData = eventData.delta || eventData.audio;
                         }
                         
                         // Check nested structures
                         if (!audioData && eventData.event) {
                           audioData = eventData.event.audio || eventData.event.delta;
                         }
                       }
                       
                       if (audioData) {
                         console.log('🎯 Found audio data, type:', typeof audioData, 'length:', audioData.length || 'no length');
                         
                         try {
                           let base64Audio;
                           if (typeof audioData === 'string') {
                             base64Audio = audioData;
                           } else if (audioData instanceof ArrayBuffer) {
                             base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioData)));
                           } else if (audioData instanceof Uint8Array) {
                             base64Audio = btoa(String.fromCharCode(...audioData));
                           }
                           
                           if (base64Audio) {
                             console.log('📤 Forwarding audio to client, length:', base64Audio.length);
                             socket.send(JSON.stringify({ 
                               type: 'audio', 
                               audio: base64Audio,
                               debug: { eventName, dataType: typeof audioData }
                             }));
                           }
                         } catch (error) {
                           console.error('Error processing audio data:', error);
                         }
                       } else {
                         console.log('🤔 Audio event detected but no audio data found');
                         console.log('Event data structure:', Object.keys(eventData || {}));
                       }
                     }
                     
                     return originalEmit.apply(this, arguments);
                   };
                 }
                
                // Also try direct event listeners for common patterns
                const audioEvents = ['audio', 'response.audio', 'response.audio.delta', 'conversation.item.created'];
                audioEvents.forEach(eventName => {
                  try {
                    realtimeSessionAny.on(eventName, (data: any) => {
                      console.log(`🎧 Direct listener caught: ${eventName}`, data);
                    });
                  } catch (e) {
                    // Event doesn't exist, that's OK
                  }
                });
              }
              
              // Monitor the underlying transport for responses
              if (realtimeSessionAny.transport || realtimeSessionAny._transport) {
                const transport = realtimeSessionAny.transport || realtimeSessionAny._transport;
                console.log('Found transport object:', typeof transport);
                
                if (transport && typeof transport.on === 'function') {
                  transport.on('*', (eventName: string, data: any) => {
                    console.log(`🚌 Transport event: ${eventName}`, data);
                    if (eventName.includes('audio')) {
                      console.log('🔊 Transport audio event detected!', data);
                    }
                  });
                }
              }

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
              
              // Log audio chunk details (less frequently to avoid spam)
              if (Math.random() < 0.01) { // Log ~1% of chunks
                console.log('PCM16 audio chunk - base64 length:', message.audio.length, 'bytes:', arrayBuffer.byteLength);
              }
              
              // Send PCM16 audio to OpenAI Realtime API
              if (typeof realtimeSession.sendAudio === 'function') {
                console.log('📤 Sending audio to RealtimeSession, bytes:', arrayBuffer.byteLength);
                const result = await realtimeSession.sendAudio(arrayBuffer);
                console.log('✅ PCM16 audio sent to OpenAI successfully, result:', result);
                
                // Try to get conversation state after sending audio
                setTimeout(() => {
                  try {
                    const session = realtimeSession as any;
                    if (session.getState) {
                      console.log('🔍 Session state after audio:', session.getState());
                    }
                    if (session.conversation) {
                      console.log('🔍 Conversation state:', session.conversation);
                    }
                  } catch (e) {
                    console.log('Could not get session state:', e);
                  }
                }, 100);
                
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