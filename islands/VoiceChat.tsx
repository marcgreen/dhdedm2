import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";

interface VoiceChatProps {}

interface CharacterState {
  name: string;
  level: number;
  hitPoints: number;
  maxHitPoints: number;
  attributes: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  inventory: string[];
  currentLocation: string;
  notes: string[];
}

interface GameState {
  character: CharacterState;
  currentScene: string;
  sceneDescription: string;
  activeQuests: string[];
  gameLog: string[];
  toolCallLog: ToolCall[];
  conversationHistory: ConversationItem[];
  sessionId: string;
  languageCorrections: number;
  vocabularyIntroduced: string[];
}

interface ToolCall {
  timestamp: string;
  toolName: string;
  parameters: any;
  result: string;
}

interface ConversationItem {
  timestamp: string;
  role: 'user' | 'assistant';
  content: string;
  type: 'message' | 'audio';
}

export default function VoiceChat(_props: VoiceChatProps) {
  const isConnected = useSignal(false);
  const isConnecting = useSignal(false);
  const status = useSignal("Ready to start");
  const sessionRef = useRef<any>(null);
  const gameState = useSignal<GameState>({
    character: {
      name: "",
      level: 1,
      hitPoints: 10,
      maxHitPoints: 10,
      attributes: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      },
      inventory: [],
      currentLocation: "Starting Area",
      notes: []
    },
    currentScene: "Character Creation",
    sceneDescription: "Du stehst am Beginn eines neuen Abenteuers...",
    activeQuests: [],
    gameLog: [],
    toolCallLog: [],
    conversationHistory: [],
    sessionId: "",
    languageCorrections: 0,
    vocabularyIntroduced: []
  });

  // Initialize voice chat when component mounts
  useEffect(() => {
    if (!IS_BROWSER) return;
    
    // Request microphone permission on load
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        status.value = "Microphone ready - Click to start";
      })
      .catch((err) => {
        console.error("Microphone permission denied:", err);
        status.value = "Microphone permission required";
      });
  }, []);

  // Helper function to log tool calls
  const logToolCall = (toolName: string, parameters: any, result: string) => {
    const newState = { ...gameState.value };
    const toolCall: ToolCall = {
      timestamp: new Date().toLocaleTimeString(),
      toolName,
      parameters,
      result
    };
    newState.toolCallLog.push(toolCall);
    gameState.value = newState;
    console.log(`Tool Called: ${toolName}`, { parameters, result });
  };

  // Helper function to update conversation history
  const updateConversationHistory = (history: any[]) => {
    const newState = { ...gameState.value };
    const formattedHistory: ConversationItem[] = [];
    
    history.forEach((item: any) => {
      if (item.type === 'message') {
        let content = '';
        
        // Handle user messages with input_audio transcript (only completed)
        if (item.role === 'user' && item.status === 'completed' && item.content && Array.isArray(item.content)) {
          item.content.forEach((part: any) => {
            if (part.type === 'input_audio' && part.transcript) {
              content += part.transcript;
            } else if (part.type === 'input_text' && part.text) {
              content += part.text;
            } else if (part.type === 'text' && part.text) {
              content += part.text;
            }
          });
        }
        
        // Handle assistant messages (can be in_progress or completed)
        else if (item.role === 'assistant') {
          // Try to get content from content array
          if (item.content && Array.isArray(item.content)) {
            item.content.forEach((part: any) => {
              if (part.type === 'audio' && part.transcript) {
                content += part.transcript;
              } else if (part.type === 'text' && part.text) {
                content += part.text;
              }
            });
          }
          
          // Also try to get content from output array (alternative structure)
          if (!content && item.output && Array.isArray(item.output)) {
            item.output.forEach((part: any) => {
              if (part.type === 'audio' && part.transcript) {
                content += part.transcript;
              } else if (part.type === 'text' && part.text) {
                content += part.text;
              }
            });
          }
          
          // Try direct content string
          if (!content && typeof item.content === 'string') {
            content = item.content;
          }
        }
        
        // Handle direct string content (fallback)
        else if (typeof item.content === 'string') {
          content = item.content;
        }
        
        if (content.trim()) {
          formattedHistory.push({
            timestamp: new Date().toLocaleTimeString(),
            role: item.role === 'user' ? 'user' : 'assistant',
            content: content.trim(),
            type: 'message'
          });
        }
      }
      
      // Also show function calls in the conversation for transparency
      else if (item.type === 'function_call' && item.status === 'completed') {
        formattedHistory.push({
          timestamp: new Date().toLocaleTimeString(),
          role: 'assistant',
          content: `🔧 Called tool: ${item.name}(${item.arguments}) → ${item.output}`,
          type: 'message'
        });
      }
    });
    
    newState.conversationHistory = formattedHistory;
    gameState.value = newState;
  };

  // Create game state management tools using dynamic imports
  const createGameStateTools = async () => {
    const { tool } = await import('@openai/agents');

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
        const newState = { ...gameState.value };
        
        if (args.name) newState.character.name = args.name;
        if (args.level) newState.character.level = args.level;
        if (args.hitPoints !== undefined) newState.character.hitPoints = args.hitPoints;
        if (args.maxHitPoints) newState.character.maxHitPoints = args.maxHitPoints;
        if (args.location) newState.character.currentLocation = args.location;
        if (args.attributes) {
          newState.character.attributes = { ...newState.character.attributes, ...args.attributes };
        }
        
        gameState.value = newState;
        const result = `Character updated: ${newState.character.name} (Level ${newState.character.level}) - HP: ${newState.character.hitPoints}/${newState.character.maxHitPoints}`;
        
        logToolCall('update_character', args, result);
        return result;
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
        const newState = { ...gameState.value };
        
        if (args.action === 'add') {
          newState.character.inventory.push(...args.items);
        } else if (args.action === 'remove') {
          newState.character.inventory = newState.character.inventory.filter(item => !args.items.includes(item));
        }
        
        gameState.value = newState;
        const result = `Inventory updated: ${args.action === 'add' ? 'Added' : 'Removed'} ${args.items.join(', ')}. Total items: ${newState.character.inventory.length}`;
        
        logToolCall('update_inventory', args, result);
        return result;
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
        const newState = { ...gameState.value };
        
        newState.currentScene = args.scene;
        newState.sceneDescription = args.description;
        if (args.location) newState.character.currentLocation = args.location;
        
        gameState.value = newState;
        const result = `Scene updated: ${args.scene} - ${args.description}`;
        
        logToolCall('update_scene', args, result);
        return result;
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
        const result = `Rolled ${rollString}: [${rolls.join(', ')}] = ${total}`;
        
        // Add to game log (for important rolls)
        const newState = { ...gameState.value };
        newState.gameLog.push(`${new Date().toLocaleTimeString()}: ${result}`);
        gameState.value = newState;
        
        logToolCall('roll_dice', args, result);
        return result;
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
        const newState = { ...gameState.value };
        let result = '';
        
        if (args.action === 'add') {
          newState.activeQuests.push(args.quest);
          result = `Quest added: ${args.quest}`;
        } else if (args.action === 'complete' && args.index !== undefined) {
          const completed = newState.activeQuests.splice(args.index, 1)[0];
          result = `Quest completed: ${completed}`;
        } else if (args.action === 'update' && args.index !== undefined) {
          newState.activeQuests[args.index] = args.quest;
          result = `Quest updated: ${args.quest}`;
        } else {
          result = `Quest ${args.action}: ${args.quest}`;
        }
        
        gameState.value = newState;
        logToolCall('manage_quests', args, result);
        return result;
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
        const newState = { ...gameState.value };
        
        if (args.corrections) {
          newState.languageCorrections += args.corrections;
        }
        if (args.newVocabulary) {
          newState.vocabularyIntroduced.push(...args.newVocabulary);
        }
        
        gameState.value = newState;
        const result = `Language progress updated: ${newState.languageCorrections} corrections, ${newState.vocabularyIntroduced.length} vocabulary words`;
        
        logToolCall('track_language', args, result);
        return result;
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
        const newState = { ...gameState.value };
        newState.gameLog.push(`${new Date().toLocaleTimeString()}: ${args.entry}`);
        gameState.value = newState;
        const result = `Log entry added: ${args.entry}`;
        
        logToolCall('add_game_log', args, result);
        return result;
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

  const startVoiceChat = async () => {
    if (!IS_BROWSER || isConnecting.value) return;
    
    try {
      isConnecting.value = true;
      status.value = "Generating secure session token...";
      
      // Get ephemeral client token from server
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_session_config',
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to get session configuration');
      }
      
      const config = await response.json();
      
      if (config.error) {
        throw new Error(config.error);
      }
      
      status.value = "Connecting to OpenAI...";
      
      // Follow the EXACT pattern from the docs
      const { RealtimeAgent, RealtimeSession } = await import('@openai/agents/realtime');
      
      // Create tools using dynamic imports
      const tools = await createGameStateTools();
      
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

**PÄDAGOGISCHE STRATEGIEN:**
- Wiederhole wichtige Strukturien natürlich
- Verwende Scaffolding (Gerüst) für komplexe Konzepte
- Gib konstruktives Feedback
- Passe die Komplexität an das Verständnis an
- Nutze das Spiel für Sprachenlernen

**SPIELMECHANIK:**
- Beginne mit Charaktererstellung
- Verwende d20-System für Aktionen
- Verwalte Lebenspunkte, Inventar und Quests
- Erstelle lebendige Beschreibungen der Welt
- Belohne kreative Problemlösung

**PERSÖNLICHKEIT:**
- Freundlich aber herausfordernd
- Geduldig mit Sprachfehlern
- Enthusiastisch für Fantasy-Abenteuer
- Unterstützend beim Deutschlernen
- Humorvoll und einnehmend

Starte mit einer freundlichen Begrüßung und frage nach dem Namen des Charakters. Nutze dann die Tools, um die Charaktererstellung zu verwalten und das Abenteuer zu beginnen!`,
        tools: tools,
      });

      const session = new RealtimeSession(agent, {
        model: 'gpt-4o-realtime-preview-2025-06-03',
        config: {
          inputAudioTranscription: {
            model: 'gpt-4o-mini-transcribe',
          },
        },
      });
      
      sessionRef.current = session;
      
      // Set up conversation history tracking
      session.on('history_updated', (history) => {
        console.log('History updated:', history);
        updateConversationHistory(history);
      });
      
      // Connect using the ephemeral client token (secure for browser)
      await session.connect({
        apiKey: config.clientApiKey,
      });
      
      isConnected.value = true;
      isConnecting.value = false;
      status.value = "Mit Der Spielleiter verbunden - Sprich jetzt!";
      console.log('Voice session connected successfully with ephemeral token');
      
    } catch (error) {
      console.error('Voice chat error:', error);
      status.value = "Error: " + (error as Error).message;
      isConnecting.value = false;
      isConnected.value = false;
    }
  };

  const stopVoiceChat = async () => {
    if (!IS_BROWSER) return;
    
    try {
      if (sessionRef.current) {
        // Try different common methods for stopping the session
        console.log('Available methods on session:', Object.getOwnPropertyNames(sessionRef.current));
        
        if (typeof sessionRef.current.close === 'function') {
          await sessionRef.current.close();
          console.log('Session closed using close()');
        } else if (typeof sessionRef.current.stop === 'function') {
          await sessionRef.current.stop();
          console.log('Session stopped using stop()');
        } else if (typeof sessionRef.current.end === 'function') {
          await sessionRef.current.end();
          console.log('Session ended using end()');
        } else if (typeof sessionRef.current.destroy === 'function') {
          sessionRef.current.destroy();
          console.log('Session destroyed using destroy()');
        } else {
          console.log('No explicit disconnect method found, setting to null');
        }
        
        sessionRef.current = null;
      }
      
      isConnected.value = false;
      isConnecting.value = false;
      status.value = "Ready to start";
    } catch (error) {
      console.error('Error stopping voice chat:', error);
      status.value = "Error stopping session";
      // Still reset the state even if there's an error
      isConnected.value = false;
      isConnecting.value = false;
      sessionRef.current = null;
    }
  };

  const toggleVoiceChat = () => {
    if (isConnected.value) {
      stopVoiceChat();
    } else {
      startVoiceChat();
    }
  };

  return (
    <div class="max-w-6xl mx-auto p-4 space-y-6">
      {/* Main Voice Interface */}
      <div class="text-center bg-gradient-to-br from-purple-900 to-blue-900 p-8 rounded-xl shadow-2xl">
        <h1 class="text-2xl font-bold text-white mb-2">Der Spielleiter</h1>
        <p class="text-purple-200 mb-6">Deutsches D&D • German Learning through Gaming</p>
        
        <div class="mb-6">
          <button
            onClick={toggleVoiceChat}
            class={`w-24 h-24 rounded-full text-white text-3xl font-bold transition-all duration-200 ${
              isConnected.value 
                ? 'bg-red-500 hover:bg-red-600 animate-pulse shadow-lg shadow-red-500/50' 
                : isConnecting.value
                ? 'bg-yellow-500 animate-spin shadow-lg shadow-yellow-500/50'
                : 'bg-green-500 hover:bg-green-600 hover:scale-105 shadow-lg shadow-green-500/50'
            }`}
            disabled={!IS_BROWSER || isConnecting.value}
          >
            {isConnecting.value ? '⏳' : isConnected.value ? '🔴' : '🎙️'}
          </button>
        </div>
        
        <div class="space-y-2">
          <p class={`text-lg font-semibold ${
            isConnected.value ? 'text-green-300' : 
            isConnecting.value ? 'text-yellow-300' : 'text-gray-300'
          }`}>
            {status.value}
          </p>
          
          <div class="text-sm text-purple-200">
            {isConnected.value ? 'Klicke zum Stoppen' : 'Klicke zum Starten'}
          </div>
        </div>
      </div>

      {/* Game State Display */}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Character Sheet */}
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl">
          <h2 class="text-xl font-bold text-white mb-4 flex items-center">
            ⚔️ Charakterbogen
          </h2>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between text-gray-300">
              <span>Name:</span>
              <span class="text-white">{gameState.value.character.name || "Unbekannt"}</span>
            </div>
            <div class="flex justify-between text-gray-300">
              <span>Stufe:</span>
              <span class="text-white">{gameState.value.character.level}</span>
            </div>
            <div class="flex justify-between text-gray-300">
              <span>Lebenspunkte:</span>
              <span class="text-red-400">{gameState.value.character.hitPoints}/{gameState.value.character.maxHitPoints}</span>
            </div>
            <div class="flex justify-between text-gray-300">
              <span>Ort:</span>
              <span class="text-blue-400">{gameState.value.character.currentLocation}</span>
            </div>
            {gameState.value.character.inventory.length > 0 && (
              <div class="mt-4">
                <div class="text-gray-400 mb-2">Inventar:</div>
                <div class="flex flex-wrap gap-1">
                  {gameState.value.character.inventory.map((item, index) => (
                    <span key={index} class="bg-slate-700 px-2 py-1 rounded text-xs text-gray-300">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Current Scene */}
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl">
          <h2 class="text-xl font-bold text-white mb-4 flex items-center">
            🏰 Aktuelle Szene
          </h2>
          <div class="space-y-3 text-sm">
            <div class="text-yellow-400 font-medium">{gameState.value.currentScene}</div>
            <div class="text-gray-300 leading-relaxed">{gameState.value.sceneDescription}</div>
            
            {gameState.value.activeQuests.length > 0 && (
              <div class="mt-4">
                <div class="text-gray-400 mb-2">Aktive Quests:</div>
                <div class="space-y-1">
                  {gameState.value.activeQuests.map((quest, index) => (
                    <div key={index} class="bg-slate-700 p-2 rounded text-xs text-gray-300">
                      • {quest}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Language Learning Progress */}
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl">
          <h2 class="text-xl font-bold text-white mb-4 flex items-center">
            📚 Sprachfortschritt
          </h2>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between text-gray-300">
              <span>Korrekturen:</span>
              <span class="text-orange-400">{gameState.value.languageCorrections}</span>
            </div>
            <div class="flex justify-between text-gray-300">
              <span>Neues Vokabular:</span>
              <span class="text-green-400">{gameState.value.vocabularyIntroduced.length}</span>
            </div>
            {gameState.value.vocabularyIntroduced.length > 0 && (
              <div class="mt-4">
                <div class="text-gray-400 mb-2">Gelernte Wörter:</div>
                <div class="flex flex-wrap gap-1">
                  {gameState.value.vocabularyIntroduced.slice(-10).map((word, index) => (
                    <span key={index} class="bg-green-900 px-2 py-1 rounded text-xs text-green-300">
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Conversation and Logs Section */}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversation Transcript */}
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl">
          <h2 class="text-xl font-bold text-white mb-4 flex items-center">
            💬 Unterhaltung
            <span class="ml-2 text-sm text-gray-400">({gameState.value.conversationHistory.length})</span>
          </h2>
          <div class="space-y-3 text-sm max-h-64 overflow-y-auto">
            {gameState.value.conversationHistory.length > 0 ? (
              gameState.value.conversationHistory.slice(-20).map((message, index) => (
                <div key={index} class={`p-3 rounded-lg ${
                  message.role === 'user' 
                    ? 'bg-blue-900 ml-4 border-l-2 border-blue-400' 
                    : 'bg-purple-900 mr-4 border-l-2 border-purple-400'
                }`}>
                  <div class="flex justify-between items-start mb-1">
                    <span class={`text-xs font-semibold ${
                      message.role === 'user' ? 'text-blue-300' : 'text-purple-300'
                    }`}>
                      {message.role === 'user' ? 'Du' : 'Der Spielleiter'}
                    </span>
                    <span class="text-gray-500 text-xs">{message.timestamp}</span>
                  </div>
                  <div class="text-gray-200 text-sm leading-relaxed">
                    {message.content}
                  </div>
                </div>
              ))
            ) : (
              <div class="text-gray-500 italic">Noch keine Unterhaltung...</div>
            )}
          </div>
        </div>

        {/* Tool Calls Log */}
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl">
          <h2 class="text-xl font-bold text-white mb-4 flex items-center">
            🔧 Tool-Aufrufe
            <span class="ml-2 text-sm text-gray-400">({gameState.value.toolCallLog.length})</span>
          </h2>
          <div class="space-y-2 text-sm max-h-64 overflow-y-auto">
            {gameState.value.toolCallLog.length > 0 ? (
              gameState.value.toolCallLog.slice(-15).map((call, index) => (
                <div key={index} class="bg-slate-700 p-3 rounded border-l-2 border-blue-500">
                  <div class="flex justify-between items-start mb-1">
                    <span class="text-blue-400 font-mono text-xs">{call.toolName}</span>
                    <span class="text-gray-500 text-xs">{call.timestamp}</span>
                  </div>
                  <div class="text-gray-300 text-xs mb-1">
                    <strong>Args:</strong> {JSON.stringify(call.parameters)}
                  </div>
                  <div class="text-green-300 text-xs">
                    <strong>Result:</strong> {call.result}
                  </div>
                </div>
              ))
            ) : (
              <div class="text-gray-500 italic">Noch keine Tool-Aufrufe...</div>
            )}
          </div>
        </div>

        {/* Game Log */}
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl">
          <h2 class="text-xl font-bold text-white mb-4 flex items-center">
            📜 Spielprotokoll
          </h2>
          <div class="space-y-2 text-sm max-h-64 overflow-y-auto">
            {gameState.value.gameLog.length > 0 ? (
              gameState.value.gameLog.slice(-10).map((entry, index) => (
                <div key={index} class="text-gray-300 text-xs border-l-2 border-slate-600 pl-2">
                  {entry}
                </div>
              ))
            ) : (
              <div class="text-gray-500 italic">Noch keine Einträge...</div>
            )}
          </div>
        </div>
      </div>

      {/* Instructions */}
      {isConnected.value && (
        <div class="bg-slate-800 p-6 rounded-xl shadow-xl">
          <h2 class="text-xl font-bold text-white mb-4">💡 Spielhilfen</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
            <div>
              <h3 class="font-bold text-blue-400 mb-2">Sprachbefehle:</h3>
              <ul class="space-y-1">
                <li>• "Ich möchte..." - Aktionen ausführen</li>
                <li>• "Ich schaue..." - Umgebung erkunden</li>
                <li>• "Ich sage..." - Mit NPCs sprechen</li>
                <li>• "Kannst du das erklären?" - Hilfe anfordern</li>
              </ul>
            </div>
            <div>
              <h3 class="font-bold text-purple-400 mb-2">Spieltipps:</h3>
              <ul class="space-y-1">
                <li>• Sprich langsam und deutlich</li>
                <li>• Beschreibe deine Aktionen ausführlich</li>
                <li>• Frage nach deutschen Wörtern</li>
                <li>• Hab Spaß beim Lernen!</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 