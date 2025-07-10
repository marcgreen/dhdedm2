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

              // Set up event forwarding to client
              realtimeSession.on('history_updated', (history) => {
                socket.send(JSON.stringify({ 
                  type: 'history_updated', 
                  history 
                }));
              });

              realtimeSession.on('audio', (audio) => {
                socket.send(JSON.stringify({ 
                  type: 'audio', 
                  audio 
                }));
              });

              realtimeSession.on('error', (error: any) => {
                console.error('RealtimeSession error:', error);
                socket.send(JSON.stringify({ 
                  type: 'error', 
                  error: error?.message || String(error) 
                }));
              });

              // Tool execution events
              realtimeSession.on('tool_executed', (result: any) => {
                socket.send(JSON.stringify({ 
                  type: 'tool_executed', 
                  result 
                }));
              });

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
              console.log('Audio chunk received, length:', message.audio.length);
              
              // NOTE: The browser is sending WebM audio as base64, but OpenAI Realtime WebSocket 
              // transport expects PCM16 audio as ArrayBuffer. We need to convert the audio format.
              // For now, let's just acknowledge receipt without processing.
              
              console.warn('Audio format conversion needed: WebM -> PCM16');
              console.log('Skipping audio processing until format conversion is implemented');
              
              // TODO: Convert WebM audio to PCM16 format
              // This requires audio decoding libraries or changing the client audio capture
              
            } catch (error) {
              console.error('Error processing audio:', error);
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
                if (typeof realtimeSession.close === 'function') {
                  await realtimeSession.close();
                } else if (typeof realtimeSession.stop === 'function') {
                  await realtimeSession.stop();
                }
              } catch (error) {
                console.error('Error closing session:', error);
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
          error: error.message 
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