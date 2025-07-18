import { Handlers } from "$fresh/server.ts";
import { RealtimeAgent, RealtimeSession } from "@openai/agents-realtime";
import { tool } from "@openai/agents-realtime";
import { createGameManager, formatGameStateForAI } from "../../../daggerheart_tools.ts";
import { GameState, ToolResult } from "../../../types.ts";

// Store active sessions
const sessions = new Map<string, RealtimeSession>();
const sockets = new Map<string, WebSocket>();
// Store synthetic tool call logs per session
const toolCallLogs = new Map<string, any[]>();

// Helper to log a tool call event
function logToolCall(sessionId: string, event: any) {
  if (!toolCallLogs.has(sessionId)) toolCallLogs.set(sessionId, []);
  const logs = toolCallLogs.get(sessionId);
  if (logs) logs.push(event);
}

// Helper function to send game state updates
const sendGameStateUpdate = (sessionId: string, toolResult: ToolResult) => {
  const socket = sockets.get(sessionId);
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'game_state_updated',
      sessionId,
      gameState: toolResult.gameState,
      toolResult
    }));
  }
};

// Daggerheart tools with session context
const createDaggerheartTools = (sessionId: string) => {
  const gameManager = createGameManager(sessionId);
  // Phase 1 Tool: Get current game state
  const getStateTool = tool({
    name: 'get_state',
    description: 'Aktuellen Spielzustand abrufen',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async execute(args: any = {}) {
      const now = new Date().toISOString();
      let output, error = null;
      try {
        output = gameManager.getState();
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      logToolCall(sessionId, {
        type: 'tool_call',
        name: 'get_state',
        status: error ? 'failed' : 'succeeded',
        arguments: args,
        output: error ? undefined : output,
        error: error || undefined,
        timestamp: now,
      });
      if (error) throw error;
      return output;
    },
  });

  // Phase 1 Tool: Update player state
  const updatePlayerTool = tool({
    name: 'update_player',
    description: 'Spieler-Zustand aktualisieren (inkl. Charakter-Info)',
    parameters: {
      type: 'object',
      properties: {
        hp: { type: 'number' },
        stress: { type: 'number' },
        hope: { type: 'number' },
        armor: { type: 'number' },
        addCondition: { type: 'string' },
        removeCondition: { type: 'string' },
        markExperience: { type: 'string' },
        clearStress: { type: 'number' },
        clearAllConditions: { type: 'boolean' },
        name: { type: 'string' },
        evasion: { type: 'number' },
        proficiency: { type: 'number' },
        maxHp: { type: 'number' },
        maxStress: { type: 'number' },
        maxArmor: { type: 'number' },
        majorThreshold: { type: 'number' },
        severeThreshold: { type: 'number' },
        level: { type: 'number' },
        location: { type: 'string' },
        class: { type: 'string' },
        background: { type: 'string' }
      },
      required: [],
      additionalProperties: false,
    },
    async execute(args: any) {
      const now = new Date().toISOString();
      let output, error = null;
      try {
        output = gameManager.updatePlayer(args);
        const gameState = gameManager.getState();
        const toolResult: ToolResult = {
          name: 'update_player',
          parameters: args,
          output: output,
          gameState: gameState
        };
        sendGameStateUpdate(sessionId, toolResult);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      logToolCall(sessionId, {
        type: 'tool_call',
        name: 'update_player',
        status: error ? 'failed' : 'succeeded',
        arguments: args,
        output: error ? undefined : output,
        error: error || undefined,
        timestamp: now,
      });
      if (error) throw error;
      return output;
    }
  });

  // Phase 1 Tool: Roll action with 2d12 and Hope/Fear mechanics
  const rollActionTool = tool({
    name: 'roll_action',
    description: 'Spieler-Handlungswurf mit 2d12 (Hoffnung vs. Furcht)',
    parameters: {
      type: 'object',
      properties: {
        trait: { 
          type: 'string', 
          enum: ['strength', 'agility', 'finesse', 'instinct', 'presence', 'knowledge'] 
        },
        difficulty: { type: 'number', minimum: 5, maximum: 30 },
        modifier: { type: 'number' },
        experienceBonus: { type: 'number', enum: [0, 2] },
        advantage: { type: 'number', minimum: 0, maximum: 3 },
        disadvantage: { type: 'number', minimum: 0, maximum: 3 },
        useExperience: { type: 'string' }
      },
      required: ['trait', 'difficulty'],
      additionalProperties: false,
    },
    async execute(args: any) {
      const now = new Date().toISOString();
      let output, error = null;
      try {
        output = gameManager.rollAction(args);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      logToolCall(sessionId, {
        type: 'tool_call',
        name: 'roll_action',
        status: error ? 'failed' : 'succeeded',
        arguments: args,
        output: error ? undefined : output,
        error: error || undefined,
        timestamp: now,
      });
      if (error) throw error;
      return output;
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
      const now = new Date().toISOString();
      let output, error = null;
      try {
        output = `Scene updated: ${args.scene} - ${args.description}`;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      logToolCall(sessionId, {
        type: 'tool_call',
        name: 'update_scene',
        status: error ? 'failed' : 'succeeded',
        arguments: args,
        output: error ? undefined : output,
        error: error || undefined,
        timestamp: now,
      });
      if (error) throw error;
      return output;
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
      const now = new Date().toISOString();
      let output, error = null;
      try {
        const rolls: number[] = [];
        const count = args.count || 1;
        const modifier = args.modifier || 0;
        for (let i = 0; i < count; i++) {
          rolls.push(Math.floor(Math.random() * args.sides) + 1);
        }
        const total = rolls.reduce((sum, roll) => sum + roll, 0) + modifier;
        const rollString = `${count}d${args.sides}${modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : ''}`;
        output = `Rolled ${rollString}: [${rolls.join(', ')}] = ${total}`;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      logToolCall(sessionId, {
        type: 'tool_call',
        name: 'roll_dice',
        status: error ? 'failed' : 'succeeded',
        arguments: args,
        output: error ? undefined : output,
        error: error || undefined,
        timestamp: now,
      });
      if (error) throw error;
      return output;
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
      const now = new Date().toISOString();
      let output, error = null;
      try {
        output = `Quest ${args.action}: ${args.quest}`;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      logToolCall(sessionId, {
        type: 'tool_call',
        name: 'manage_quests',
        status: error ? 'failed' : 'succeeded',
        arguments: args,
        output: error ? undefined : output,
        error: error || undefined,
        timestamp: now,
      });
      if (error) throw error;
      return output;
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
      const now = new Date().toISOString();
      let output, error = null;
      try {
        output = `Language progress updated`;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      logToolCall(sessionId, {
        type: 'tool_call',
        name: 'track_language',
        status: error ? 'failed' : 'succeeded',
        arguments: args,
        output: error ? undefined : output,
        error: error || undefined,
        timestamp: now,
      });
      if (error) throw error;
      return output;
    },
  });

  const updateInventoryTool = tool({
    name: 'update_inventory',
    description: 'Enhanced inventory management (add/remove items, use consumables, manage gold)',
    parameters: {
      type: 'object',
      properties: {
        // Legacy parameters for backward compatibility
        action: { type: 'string', enum: ['add', 'remove'] },
        item: { type: 'string' },
        quantity: { type: 'number', default: 1 },
        gold: { type: 'string' },
        // Enhanced parameters
        addItem: { 
          type: 'object', 
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['utility', 'consumable', 'light'] },
            description: { type: 'string' },
            effect: { type: 'string' },
            effectValue: { type: 'string' }
          }
        },
        removeItem: { type: 'string' },
        useItem: { type: 'string' },
        goldEnhanced: { type: 'number' }
      },
      required: [],
      additionalProperties: false,
    },
    async execute(args: any) {
      const now = new Date().toISOString();
      let output, error = null;
      try {
        // Handle legacy format
        if (args.gold && typeof args.gold === 'string') {
          output = `Gold updated: ${args.gold}`;
        } else if (args.item) {
          const action = args.action || 'add';
          const quantity = args.quantity || 1;
          output = `${action === 'add' ? 'Added' : 'Removed'} ${quantity}x ${args.item}`;
        } else {
          // Use enhanced functionality
          // Convert goldEnhanced to gold for the game manager
          const enhancedArgs = { ...args };
          if (args.goldEnhanced !== undefined) {
            enhancedArgs.gold = args.goldEnhanced;
            delete enhancedArgs.goldEnhanced;
          }
          output = gameManager.updateInventory(enhancedArgs);
          const gameState = gameManager.getState();
          const toolResult: ToolResult = {
            name: 'update_inventory',
            parameters: args,
            output: output,
            gameState: gameState
          };
          sendGameStateUpdate(sessionId, toolResult);
        }
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      logToolCall(sessionId, {
        type: 'tool_call',
        name: 'update_inventory',
        status: error ? 'failed' : 'succeeded',
        arguments: args,
        output: error ? undefined : output,
        error: error || undefined,
        timestamp: now,
      });
      if (error) throw error;
      return output;
    },
  });

  // Phase 2 Tool: Roll damage with weapon dice
  const rollDamageTool = tool({
    name: 'roll_damage',
    description: 'Schaden würfeln mit Waffen-Würfeln × Fertigkeit (inkl. Sneak Attack)',
    parameters: {
      type: 'object',
      properties: {
        weaponDice: { type: 'string' }, // e.g., "1d8+2"
        proficiency: { type: 'number', minimum: 1 },
        isCritical: { type: 'boolean' },
        fearBonus: { type: 'number', minimum: 0 },
        isSneakAttack: { type: 'boolean' },
        allyInMelee: { type: 'boolean' }
      },
      required: ['weaponDice', 'proficiency'],
      additionalProperties: false,
    },
    async execute(args: any) {
      const now = new Date().toISOString();
      let output, error = null;
      try {
        output = gameManager.rollDamage(args);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      logToolCall(sessionId, {
        type: 'tool_call',
        name: 'roll_damage',
        status: error ? 'failed' : 'succeeded',
        arguments: args,
        output: error ? undefined : output,
        error: error || undefined,
        timestamp: now,
      });
      if (error) throw error;
      return output;
    },
  });

  // Phase 2 Tool: Deal damage to player
  const dealDamageToPlayerTool = tool({
    name: 'deal_damage_to_player',
    description: 'Schaden an Spieler mit Schwellenwert-System (max. 1 Rüstungs-Slot pro Schaden)',
    parameters: {
      type: 'object',
      properties: {
        damage: { type: 'number', minimum: 0 },
        damageType: { type: 'string', enum: ['physical', 'magical'] },
        canUseArmor: { type: 'boolean' },
        resistance: { type: 'boolean' },
        immunity: { type: 'boolean' },
        direct: { type: 'boolean' }
      },
      required: ['damage'],
      additionalProperties: false,
    },
    async execute(args: any) {
      const now = new Date().toISOString();
      let output, error = null;
      try {
        output = gameManager.dealDamageToPlayer(args);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      logToolCall(sessionId, {
        type: 'tool_call',
        name: 'deal_damage_to_player',
        status: error ? 'failed' : 'succeeded',
        arguments: args,
        output: error ? undefined : output,
        error: error || undefined,
        timestamp: now,
      });
      if (error) throw error;
      return output;
    },
  });

  // Phase 2 Tool: Make adversary attack
  const makeAdversaryAttackTool = tool({
    name: 'make_adversary_attack',
    description: 'Gegner-Angriff mit d20',
    parameters: {
      type: 'object',
      properties: {
        attackBonus: { type: 'number' },
        targetEvasion: { type: 'number' },
        advantage: { type: 'number', minimum: 0 },
        disadvantage: { type: 'number', minimum: 0 }
      },
      required: ['attackBonus', 'targetEvasion'],
      additionalProperties: false,
    },
    async execute(args: any) {
      const now = new Date().toISOString();
      let output, error = null;
      try {
        output = gameManager.makeAdversaryAttack(args);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      logToolCall(sessionId, {
        type: 'tool_call',
        name: 'make_adversary_attack',
        status: error ? 'failed' : 'succeeded',
        arguments: args,
        output: error ? undefined : output,
        error: error || undefined,
        timestamp: now,
      });
      if (error) throw error;
      return output;
    },
  });

  // Phase 2 Tool: Spend Fear
  const spendFearTool = tool({
    name: 'spend_fear',
    description: 'Furcht ausgeben für Effekte (inkl. Scheinwerfer behalten)',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', minimum: 1 },
        purpose: { type: 'string', enum: ['spotlight', 'damage', 'advantage', 'ability'] },
        description: { type: 'string' }
      },
      required: ['amount', 'purpose'],
      additionalProperties: false,
    },
    async execute(args: any) {
      const now = new Date().toISOString();
      let output, error = null;
      try {
        output = gameManager.spendFear(args);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      logToolCall(sessionId, {
        type: 'tool_call',
        name: 'spend_fear',
        status: error ? 'failed' : 'succeeded',
        arguments: args,
        output: error ? undefined : output,
        error: error || undefined,
        timestamp: now,
      });
      if (error) throw error;
      return output;
    },
  });

  // Feature management tool
  const updateFeaturesTool = tool({
    name: 'update_features',
    description: 'Manage character features (activate/deactivate, update tiers)',
    parameters: {
      type: 'object',
      properties: {
        activateFeature: { type: 'string' },
        deactivateFeature: { type: 'string' },
        updateFeatureTiers: { type: 'boolean' }
      },
      required: [],
      additionalProperties: false,
    },
    async execute(args: any) {
      const now = new Date().toISOString();
      let output, error = null;
      try {
        output = gameManager.updateFeatures(args);
        const gameState = gameManager.getState();
        const toolResult: ToolResult = {
          name: 'update_features',
          parameters: args,
          output: output,
          gameState: gameState
        };
        sendGameStateUpdate(sessionId, toolResult);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      logToolCall(sessionId, {
        type: 'tool_call',
        name: 'update_features',
        status: error ? 'failed' : 'succeeded',
        arguments: args,
        output: error ? undefined : output,
        error: error || undefined,
        timestamp: now,
      });
      if (error) throw error;
      return output;
    },
  });

  // Equipment management tool
  const updateEquipmentTool = tool({
    name: 'update_equipment',
    description: 'Manage character equipment (equip/unequip weapons and armor)',
    parameters: {
      type: 'object',
      properties: {
        equipWeapon: { type: 'object', properties: { type: { type: 'string', enum: ['primary', 'secondary'] } } },
        unequipWeapon: { type: 'object', properties: { type: { type: 'string', enum: ['primary', 'secondary'] } } },
        equipArmor: { type: 'boolean' },
        unequipArmor: { type: 'boolean' },
        updateArmorThresholds: { type: 'boolean' }
      },
      required: [],
      additionalProperties: false,
    },
    async execute(args: any) {
      const now = new Date().toISOString();
      let output, error = null;
      try {
        output = gameManager.updateEquipment(args);
        const gameState = gameManager.getState();
        const toolResult: ToolResult = {
          name: 'update_equipment',
          parameters: args,
          output: output,
          gameState: gameState
        };
        sendGameStateUpdate(sessionId, toolResult);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      logToolCall(sessionId, {
        type: 'tool_call',
        name: 'update_equipment',
        status: error ? 'failed' : 'succeeded',
        arguments: args,
        output: error ? undefined : output,
        error: error || undefined,
        timestamp: now,
      });
      if (error) throw error;
      return output;
    },
  });

  // Domain card management tool
  const updateDomainCardsTool = tool({
    name: 'update_domain_cards',
    description: 'Manage domain cards (use, add, remove)',
    parameters: {
      type: 'object',
      properties: {
        useDomainCard: { type: 'string' },
        addDomainCard: { 
          type: 'object', 
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            level: { type: 'number' },
            description: { type: 'string' }
          }
        },
        removeDomainCard: { type: 'string' }
      },
      required: [],
      additionalProperties: false,
    },
    async execute(args: any) {
      const now = new Date().toISOString();
      let output, error = null;
      try {
        output = gameManager.updateDomainCards(args);
        const gameState = gameManager.getState();
        const toolResult: ToolResult = {
          name: 'update_domain_cards',
          parameters: args,
          output: output,
          gameState: gameState
        };
        sendGameStateUpdate(sessionId, toolResult);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      logToolCall(sessionId, {
        type: 'tool_call',
        name: 'update_domain_cards',
        status: error ? 'failed' : 'succeeded',
        arguments: args,
        output: error ? undefined : output,
        error: error || undefined,
        timestamp: now,
      });
      if (error) throw error;
      return output;
    },
  });

  // Attribute management tool
  const updateAttributesTool = tool({
    name: 'update_attributes',
    description: 'Manage character attributes (Agility, Strength, Finesse, Instinct, Presence, Knowledge)',
    parameters: {
      type: 'object',
      properties: {
        Agility: { type: 'number' },
        Strength: { type: 'number' },
        Finesse: { type: 'number' },
        Instinct: { type: 'number' },
        Presence: { type: 'number' },
        Knowledge: { type: 'number' },
        attributes: { 
          type: 'object', 
          properties: {
            Agility: { type: 'number' },
            Strength: { type: 'number' },
            Finesse: { type: 'number' },
            Instinct: { type: 'number' },
            Presence: { type: 'number' },
            Knowledge: { type: 'number' }
          }
        }
      },
      required: [],
      additionalProperties: false,
    },
    async execute(args: any) {
      const now = new Date().toISOString();
      let output, error = null;
      try {
        output = gameManager.updateAttributes(args);
        const gameState = gameManager.getState();
        const toolResult: ToolResult = {
          name: 'update_attributes',
          parameters: args,
          output: output,
          gameState: gameState
        };
        sendGameStateUpdate(sessionId, toolResult);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      logToolCall(sessionId, {
        type: 'tool_call',
        name: 'update_attributes',
        status: error ? 'failed' : 'succeeded',
        arguments: args,
        output: error ? undefined : output,
        error: error || undefined,
        timestamp: now,
      });
      if (error) throw error;
      return output;
    },
  });

  // Rest functionality tool
  const restTool = tool({
    name: 'rest',
    description: 'Rest to recover and deactivate temporary features like Rogue\'s Dodge',
    parameters: {
      type: 'object',
      properties: {
        clearStress: { type: 'number' },
        restoreHp: { type: 'number' }
      },
      required: [],
      additionalProperties: false,
    },
    async execute(args: any) {
      const now = new Date().toISOString();
      let output, error = null;
      try {
        output = gameManager.rest(args);
        const gameState = gameManager.getState();
        const toolResult: ToolResult = {
          name: 'rest',
          parameters: args,
          output: output,
          gameState: gameState
        };
        sendGameStateUpdate(sessionId, toolResult);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      logToolCall(sessionId, {
        type: 'tool_call',
        name: 'rest',
        status: error ? 'failed' : 'succeeded',
        arguments: args,
        output: error ? undefined : output,
        error: error || undefined,
        timestamp: now,
      });
      if (error) throw error;
      return output;
    },
  });

  return [
    getStateTool,
    updatePlayerTool,
    rollActionTool,
    rollDamageTool,
    dealDamageToPlayerTool,
    makeAdversaryAttackTool,
    spendFearTool,
    updateSceneTool,
    rollDiceTool,
    manageQuestsTool,
    trackLanguageTool,
    updateInventoryTool,
    updateFeaturesTool,
    updateEquipmentTool,
    updateDomainCardsTool,
    updateAttributesTool,
    restTool,
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
      sockets.set(sessionId, socket);
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
              const tools = createDaggerheartTools(sessionId!);
              console.log('Daggerheart tools created successfully');

              const daggerheartRules = `# Daggerheart DM System

You are the Game Master for Daggerheart, a collaborative storytelling RPG. Your role is to bring the world to life, challenge the player, and ensure the rules are followed while keeping the story moving.

## Core Principles
- **Be a fan of the player** - make them feel heroic but challenged
- **Play to find out what happens** - don't predetermine outcomes
- **Lead with fiction** - describe what happens narratively, then apply mechanics
- **Keep it moving** - when a scene is done, cut to the next interesting moment
- **Say "yes, and..." or "yes, but..."** rather than "no"
- **Collaborate at all times**, especially during conflict
- **Fill the world with life, wonder, and danger**
- **Ask questions and work in the answers**
- **Give every roll impact**
- **Hold on gently** - don't force predetermined outcomes

## GM Pitfalls to Avoid
- **Undermining the heroes** - let them be competent
- **Always telling the players what to roll** - sometimes just let them succeed
- **Letting scenes drag** - cut when the interesting part is done
- **Singular solutions** - multiple approaches should work
- **Overplanning** - be ready to throw plans away
- **Hoarding fear** - use it to create tension

## When to Roll Dice

Call for a roll when:
- Success and failure are both interesting
- The player attempts something challenging or risky
- The outcome is uncertain
- The stakes matter to the story

Don't roll for:
- Trivial actions (opening an unlocked door)
- Impossible actions (jumping to the moon)
- Social interactions better resolved through roleplay
- Actions where only one outcome is interesting

## Action Rolls (Generate Hope/Fear)

When calling for an action roll:

### 1. Choose the Trait
Ask which trait applies:
- **Strength**: Lift, Smash, Grapple
- **Agility**: Sprint, Leap, Manoeuvre
- **Finesse**: Control, Hide, Tinker
- **Instinct**: Perceive, Sense, Navigate
- **Presence**: Charm, Perform, Deceive
- **Knowledge**: Recall, Analyse, Comprehend

### 2. Set Difficulty
- **5 (Easiest)** - Routine tasks under pressure
- **10 (Average)** - Standard adventuring tasks
- **15 (Moderate)** - Professional-level challenges
- **20 (Hard)** - Heroic feats
- **25 (Extreme)** - Legendary accomplishments
- **30 (Hardest)** - Near-impossible feats

### 3. Check for Modifiers
- **Experience**: Player can spend 1 Hope to add +2 (mark it as used for the scene)
- **Advantage**: Add +1d6 to the total (from Help, positioning, tools, etc.)
- **Disadvantage**: Subtract -1d6 from the total (from difficult conditions)
- **Multiple Advantages/Disadvantages**: Roll all d6s and keep only the highest
- **Vulnerable**: Target has disadvantage on all rolls against them
- **Hidden**: Attackers have disadvantage against them

### 4. Interpret Results

The player rolls 2d12 (Hope die vs Fear die) and adds modifiers:

- **Critical Success** (Hope = Fear): Amazing success! Player gains 1 Hope and clears 1 Stress. You gain 1 Fear. Narrate something extra awesome happening.
- **Success with Hope** (Hope > Fear, beats difficulty): They succeed and gain 1 Hope. The spotlight stays with them. Add a positive twist.
- **Success with Fear** (Fear > Hope, beats difficulty): They succeed. You gain 1 Fear AND the spotlight passes to you immediately. Introduce a complication.
- **Failure with Hope** (Hope > Fear, fails difficulty): They fail but gain 1 Hope. The spotlight passes to you. Offer a silver lining or opportunity.
- **Failure with Fear** (Fear > Hope, fails difficulty): They fail. You gain 1 Fear AND the spotlight. Make things worse with a hard move.

**CRITICAL**: When rolling with Fear, you AUTOMATICALLY get both the spotlight AND 1 Fear. You don't need to spend Fear for this - you only spend 1 Fear to KEEP the spotlight when it would pass back to the player.

## Reaction Rolls (No Hope/Fear)

Use reaction rolls for:
- Defending against effects
- Helping without spending Hope
- Resisting environmental dangers
- Any roll where Hope/Fear generation would be inappropriate

These work like action rolls but:
- Never generate Hope or Fear
- Never affect the spotlight
- Use the same difficulty scale
- Can still have advantage/disadvantage

## Group Action Rolls

When multiple characters act together:
1. Choose a leader who makes an Action roll with +1 for every participant
2. Others make reaction rolls against the same difficulty
3. The leader's roll determines Hope/Fear/spotlight as normal
4. Each participant who succeeds contributes to the narrative outcome
5. On a critical success by the leader, everyone gains 1 Hope

## Tag Team Rolls

When players combine efforts:
1. Players spend 3 Hope total to initiate
2. They describe how they work together
3. Each makes a roll applying to both actions
4. Results:
   - Both roll with Hope: Each gains 1 Hope
   - Both roll with Fear: GM gains 1 Fear per player
   - Mixed results: Apply each individually
5. Counts as a single action for spotlight purposes
6. Can involve multiple Tag Team rolls in sequence

## Combat Flow

### Player Attacks
1. Player declares attack and target
2. Roll Action vs adversary's Difficulty (or PC's Evasion for PvP)
3. On hit, roll weapon damage dice × Proficiency
4. Critical hits deal maximum possible damage PLUS rolled damage
5. Apply damage to target

### Adversary Attacks
1. Describe the attack narratively
2. Roll d20 + modifier vs player's Evasion
3. Natural 20 = critical success (always hits)
4. If attack roll ≥ Evasion, it hits
5. Roll damage (you can spend 1 Fear for +1d4 extra damage)
6. Player chooses whether to mark Armor slots to reduce damage by one threshold

### PC vs PC Conflict
When players come into conflict:
1. Have a meta conversation about how to resolve it
2. If using dice, both make opposed Action rolls
3. Higher total wins the contest
4. Generate Hope/Fear as normal
5. Keep it collaborative - conflict should enhance the story

### Damage & Thresholds
When a player takes damage:
- **Below Major threshold** = mark 1 HP
- **At/above Major threshold** = mark 2 HP
- **At/above Severe threshold** = mark 3 HP
- **Double Severe threshold or more** = mark 4 HP

Damage types (Physical/Magical) matter for:
- **Resistance**: Halve damage before comparing to thresholds
- **Immunity**: Ignore damage entirely
- **Direct Damage**: Can't be reduced by marking Armor

**Armor Usage**: Players can mark exactly 1 Armor slot per incoming damage to reduce it by one threshold level (unless a special ability states otherwise). This means:
- If damage would be Major (2 HP), armor reduces it to Minor (1 HP)
- If damage would be Severe (3 HP), armor reduces it to Major (2 HP)
- If damage would be Massive (4 HP), armor reduces it to Severe (3 HP)
- Only 1 armor slot can be used per attack/damage instance
- Player chooses whether to use armor after seeing the damage amount

### The Spotlight
The spotlight represents narrative focus:
- **Player keeps spotlight**: When they succeed with Hope
- **Spotlight passes to GM**: When they succeed with Fear or fail
- **GM keeps spotlight**: By spending 1 Fear when it would pass back
- **During GM spotlight**: Make moves, have adversaries act, change the scene

## GM Moves

Make a move when:
- The player rolls with Fear (hard or soft move)
- The player fails a roll (hard or soft move)
- The player looks to you to see what happens (soft move)
- The fiction demands it (appropriate to situation)
- You have the spotlight (any appropriate move)

### Soft Moves (Telegraph Danger)
- Show how the world reacts
- Ask a question and build on the answer
- Make an NPC act according to their motives
- Drive a PC to action by dangling goals
- Signal an imminent off-screen threat
- Reveal an unwelcome truth or unexpected danger
- Force the group to split up
- Make a PC mark Stress
- Show the collateral damage
- Clear an adversary's condition
- Shift the environment
- Spotlight an adversary
- Capture someone or something important
- Use a PC's backstory against them
- Take away an opportunity permanently

### Hard Moves (Immediate Consequences)
- Deal damage (roll it!)
- Use up their resources
- Turn their move against them
- Separate them from allies
- Put them in a tough spot
- Activate environment/trap/hazard
- Inflict a condition
- Advance a countdown/danger
- Make the situation significantly worse

### Making GM Moves
Consider the type of roll result:
- **Success with Fear**: Softer moves, complications
- **Failure with Hope**: Softer moves, silver linings
- **Failure with Fear**: Harder moves, escalation
- **Incidental (0-1 Fear)**: Catch-up moves, minor complications
- **Minor (1-3 Fear)**: Travel scenes, minor negotiations
- **Standard (2-4 Fear)**: Major battles, tense social encounters
- **Major (4-8 Fear)**: Large battles, boss fights
- **Climactic (6-12 Fear)**: Final confrontations

## Fear Economy

You gain 1 Fear when:
- Players roll with Fear (automatic, not optional)
- During rests (1d4 for short, 1d4+1 for long)
- From certain adversary abilities

Maximum Fear: 12

Spend Fear to:
- **Keep the spotlight** (1 Fear) - when it would pass to players
- **Add damage** (1 Fear) - +1d4 to any damage roll
- **Enhance adversary roll** (1 Fear) - add +1d6 advantage
- **Add adversary Experience** (varies) - add trait to difficulty or enhance ability
- **Activate special abilities** (varies) - as per adversary stat block

Use Fear liberally - it represents rising tension and makes the game more exciting. Spend Fast, Spend Often, Spend Big!

## Experiences

Experiences represent character's background, training, and personality:
- **Backgrounds**: Thief, Field Medic, Priestess, Merchant
- **Characteristics**: Smooth-all, Stubborn, Charming
- **Specialties**: Social Chameleon, Inventor, Survivalist
- **Skills**: Eye for Detail, Scavenger, Quiet Liar
- **Phrases**: Gotta Go Fast, Stronger Together
- **Don't go too broad or too narrow**

Using Experiences:
1. Player describes how their Experience applies
2. They spend 1 Hope to activate it
3. Add +2 to their roll
4. Mark it as used until the next scene
5. Each Experience only works once per scene

## Conditions

### Core Conditions
- **Hidden**: While you’re out of sight from all enemies and they don’t otherwise know your location, you gain the Hidden condition. Any rolls against a Hidden creature have disadvantage. After an adversary moves to where they would see you, you move into their line of sight, or you make an attack, you are no longer Hidden.
- **Restrained**: Restrained characters can’t move, but you can still take actions from their current position.
- **Vulnerable**: When a creature is Vulnerable, all rolls targeting them have advantage.

### Temporary Conditions
By default, PCs can mark 1 Stress to clear a temporary condition. Special conditions may have specific requirements.

## Countdowns

Use countdowns to track progress and escalating danger:

### Types
- **Standard**: Begin at starting value, tick down by 1
- **Dynamic**: Advance by 1-3 based on roll outcomes:
  - Failure with Fear: -3
  - Failure with Hope: -2
  - Success with Fear: -1
  - Success with Hope: Progress (positive countdown) +2
  - Critical Success: Progress +3

### Examples
- **Looping**: Resets when complete (patrols, rituals)
- **Random Start**: Roll to determine initial value
- **Increasing/Decreasing**: Value changes the effect
- **Linked**: Completing one affects another
- **Long-term**: Advance only on rest or major events

### Consequence vs Progress
- **Consequence**: Bad things happen as it counts down
- **Progress**: Good things happen as it counts up

## Death & Dying

When a player reaches 0 HP, they choose:

### Blaze of Glory
- Describe one final heroic action
- Automatically critically succeed
- Then the character dies heroically
- No roll needed - pure narrative power

### Risk It All
- Roll the Duality dice (2d12)
- **Hope > Fear**: Clear HP equal to Hope die result
- **Fear > Hope**: Character dies
- **Hope = Fear**: Clear ALL HP and Stress
- This is their last chance!

### Avoid Death
- Fall unconscious immediately
- Cannot be targeted by adversaries
- The situation gets significantly worse
- Wake up if healed or after the scene ends
- May gain a permanent scar or change

## Scene Management

### Starting Scenes
- Begin in media res when possible
- Establish stakes immediately
- Give players something to react to
- Ask questions: "What do you do?"

### Ending Scenes
- Cut when dramatic question is answered
- Don't drag out foregone conclusions
- Transition with: "What next?" or "Where to?"
- Leave some threads dangling

### Downtime & Rests

**Short Rest** (1 hour):
- Players make 2 downtime moves
- Clear 1d4+Tier HP, 1d4+Tier Stress
- Can repair Armor or prepare
- You gain 1d4 Fear

**Long Rest** (6+ hours):
- Players fully recover HP, Stress, Armor
- Make a long-term project progress
- Clear conditions and reset Experiences
- You gain 1d4+1 Fear

## Environmental Hazards

### Drowning
- If they can't breathe underwater, start Countdown (3)
- Advance when they take actions or take GM damage
- At 0: They start dying (must make Death Move)

### Falling & Collision
- **Very Close**: 1d10 + 3 physical damage
- **Close**: 1d20 + 5 physical damage
- **Far/Very Far**: 1d100 + 15 physical damage (or instant death)
- Collisions work the same for high-speed impacts

### Fate Rolls
When outcome is entirely up to chance:
1. Tell players what's at stake
2. Have them roll one Duality die
3. On 4+, things go well
4. On 3 or less, things go poorly

## Adversaries

### Basic Mechanics
- Roll d20 + modifier for attacks
- Natural 20 = critical success
- Difficulty = 10 + (adversary tier × 2)
- Can spend Fear to add Experiences

### Adversary Tiers
- **Minion**: Weak individually, dangerous in groups
- **Standard**: Equal to one PC
- **Bruiser**: Tough, worth 2 standard adversaries
- **Leader**: Dangerous, unique abilities
- **Solo**: Boss-level, faces entire party

### Balanced Encounters
Starting battle points = 2 + (3 × # of PCs)
- Minion = 1 point (or groups equal to party size)
- Standard = 2 points
- Bruiser = 3 points
- Leader = 4 points
- Solo = 5 points

Modify for difficulty:
- **-2 points**: Easier/shorter fight
- **+1 point**: Per lower-tier adversary
- **+2 points**: Harder/longer fight

## Random Objectives

Keep players engaged with optional goals:
1. Acquire/steal an important item
2. Capture/save one of the opponents
3. Activate a magical device
4. Frame/tarnish reputation
5. Drive opponent to corner/ambush
6. Stop a ritual/ceremony
7. Hold the line/defend area
8. Plant evidence/tracking device
9. Secure location for arrival
10. Harass opponent to deplete resources
11. Destroy architecture/statue/shrine
12. Investigate to confirm/deny information

## Gold & Loot

### Rewards (per session)
- Information, story hooks, loot, gold, or enhancements
- Gold in handfuls, bags, and chests:
  - 1 Chest = 10 Bags
  - 1 Bag = 10 Handfuls
  - Optional: 1 Handful = 10 Coins

### Example Prices
- **Meals**: 1 handful per night
- **Inn room**: 1 handful per night
- **Luxury inn**: 1 bag per night
- **Carriage ride**: 2 handfuls
- **Mount**: 2 bags
- **Specialized tools**: 3 bags
- **Fine clothing**: 3 handfuls
- **Luxury clothing**: 1 bag
- **Tier 1 equipment**: 1-5 handfuls
- **Tier 2 equipment**: 1-2 bags
- **Tier 3 equipment**: 5-10 bags
- **Tier 4 equipment**: 1-2 chests

## Important Reminders

- Describe what characters sense, not just what happens
- Make adversaries act according to their motives, not optimal tactics
- When in doubt, make the choice that creates more interesting fiction
- Track only what matters for the current scene
- If unsure about a rule, make a ruling that favors the story
- Generate Hope and Fear correctly - it drives the entire game flow
- Use Fear liberally to create memorable moments
- Remember that Experiences add +2, not advantage dice
- Critical damage is maximum PLUS rolled damage
- The spotlight system controls pacing - use it well

Always respond in character as the GM. Keep descriptions concise but evocative. Focus on what the player character experiences. Play to find out what happens!`;
              
              const sceneGuide = `Modular Cinematic Solo TTRPG Stories: Daggerheart Guide
Core Modular Structure
Three-Act Spine:

Hook: Immediate action/choice, establish stakes through Experience connection
Challenge: 2-3 spotlight transitions with escalating complications
Climax: Major Hope expenditure opportunity, final high-stakes roll

Essential Prep Components
Character Connection:

One Experience that will definitely apply (+2 bonus)
Personal stake tied to background
Clear skill/trait they'll showcase

Core Conflict with Daggerheart Flow:

Single objective requiring 2-3 Action rolls
One main adversary (appropriate tier)
Multiple approaches using different Traits
Built-in Hope/Fear generation opportunities

Modular Obstacles:

Base: Core challenge with clear difficulty
Complication: Add disadvantage or raise stakes
Personal: Tie to Experience or background
Escalation: Adversary special abilities requiring Fear

Fear Economy Plan:

Target total Fear generation for session length
2-3 planned expenditures (spotlight, damage, abilities)
One major spend for climax moment

Daggerheart Mechanics Integration
Hope/Fear as Pacing Engine:

Success with Hope: Momentum, player keeps spotlight
Success with Fear: Complications, spotlight shifts to GM
Failure with Hope: Setbacks with opportunities, GM takes spotlight
Failure with Fear: Escalation, GM gains spotlight AND Fear

Spotlight Management:

Player starts with spotlight (immediate choice)
Spend 1 Fear to keep spotlight when it would return
Use spotlight shifts to control pacing and tension

Experience Integration:

Ask "How does your [Experience] help here?"
Make +2 bonuses feel heroic and meaningful
Connect to character background naturally

Modular Design Techniques
Expandable Scenes:

Compressed: Single roll with narrative resolution
Standard: Action roll + consequence + response
Extended: Multiple phases with spotlight shifts

Scalable Opposition:

Minion: Quick obstacles, minimal Fear cost
Standard: Even match, moderate Fear generation
Enhanced: Spend Fear for special abilities and complications

Flexible Consequences:

Light: Conditions, resource costs, minor setbacks
Moderate: HP damage, separated from allies, equipment issues
Heavy: Major complications, adversary advantages, environmental hazards

Cinematic Techniques
Start In Media Res: Drop into immediate action requiring first roll
Personal Stakes: Connect conflict to character's Experience/background
Escalating Tension: Each spotlight shift raises stakes
Heroic Moments: Create Hope-spending opportunities that feel epic
Session Flow Pattern

Opening Choice: Present immediate decision requiring Action roll
Complication Cascade: Use Hope/Fear results to drive spotlight shifts
Experience Moments: Create opportunities for +2 bonuses that matter
Fear Expenditure: Use accumulated Fear for memorable GM moves
Climactic Choice: Final high-stakes roll with clear consequences

Quick GM Tools
During Action Rolls:

Always ask which Trait applies
Check for Experience use opportunities
Apply advantages/disadvantages from fiction
Generate Hope/Fear correctly

GM Move Selection:

Soft Moves: Build tension, ask questions, signal threats
Hard Moves: Deal damage, activate abilities, escalate immediately
Match move intensity to roll results and current Fear level

Spotlight Transitions:

Keep flowing: Success with Hope = "What do you do next?"
Add complications: Success with Fear = "That works, but..."
Escalate: Failure = Take spotlight, make appropriate move

Modular Elements Library
Quick Adversary Stats:

Difficulty = 10 + (Tier × 2)
HP based on intended scene length
One signature ability costing 2-3 Fear

Environmental Factors:

Time pressure (countdowns)
Terrain advantages/disadvantages
Interactive elements requiring different Traits

Complication Menu:

Reinforcements (spend Fear)
Equipment failure
Innocent bystanders
Moral dilemmas
Resource depletion

Success Markers

Player feels immediate engagement from opening
Multiple meaningful choices throughout
Hope/Fear economy creates natural tension
Experiences feel relevant and powerful
Resolution feels earned, not given
Clear consequences that matter for future stories

The key is building a story skeleton that uses Daggerheart's Hope/Fear/Spotlight mechanics to create natural pacing while remaining flexible enough to expand or compress based on available time and player engagement.`;

              // Get current game state to inject into AI instructions
              const gameManager = createGameManager(sessionId!);
              const currentGameState = gameManager.getState();
              
              // Format game state for AI consumption
              const gameStateInfo = formatGameStateForAI(currentGameState);

              const agent = new RealtimeAgent({
                name: 'Der Spielleiter',
                instructions: `Du bist "Der Spielleiter" - ein deutschsprachiger Dungeonmaster für Daggerheart RPG und Deutschlehrer.

**NACH JEDEM GESPRÄCHSZUG - TOOL-EVALUIERUNG:**
Nach jeder Spieler-Antwort MUSST du systematisch prüfen und entsprechende Tools aufrufen:

1. **CHARAKTERZUSTAND PRÜFEN:**
   - Hat sich Name, Level, Klasse, oder Hintergrund geändert? → 'update_player'
   - Wurden HP, Stress, Hope, Armor verändert? → 'update_player' 
   - Wurden Zustände (Conditions) hinzugefügt/entfernt? → 'update_player'
   - Hat sich der Ort/die Position geändert? → 'update_player'

2. **AKTIONEN & WÜRFE PRÜFEN:**
   - Will der Spieler etwas Schwieriges/Riskantes versuchen? → 'roll_action' (2d12)
   - Greift ein Gegner an? → 'make_adversary_attack' (d20)
   - Soll Schaden verursacht werden? → 'roll_damage' dann 'deal_damage_to_player'
   - Braucht es andere Würfe? → 'roll_dice'

3. **SZENEN & UMGEBUNG PRÜFEN:**
   - Hat sich die Szene/der Ort geändert? → 'update_scene'
   - Neue Beschreibung nötig? → 'update_scene'

4. **INVENTAR & RESSOURCEN PRÜFEN:**
   - Wurden Gegenstände gefunden/verloren/verwendet? → 'update_inventory'
   - Hat sich das Gold geändert? → 'update_inventory'

5. **AUFGABEN PRÜFEN:**
   - Neue Quest erhalten? → 'manage_quests' (add)
   - Quest abgeschlossen? → 'manage_quests' (complete)
   - Quest-Fortschritt? → 'manage_quests' (update)

6. **SPRACHLERNFORTSCHRITT PRÜFEN:**
   - Habe ich Deutschfehler korrigiert? → 'track_language' (corrections)
   - Neues Vokabular eingeführt? → 'track_language' (newVocabulary)

**WICHTIG:** Führe diese Evaluierung IMMER durch, auch wenn du denkst, dass keine Tools nötig sind. Es ist besser, den aktuellen Zustand zu bestätigen als ihn zu verpassen!

**SPRACHPÄDAGOGIK (B1-B2 Niveau):**
- Spreche NUR auf Deutsch mit angemessener Komplexität
- Nutze Wortschatz für Fortgeschrittene (2000-4000 Wörter)
- Korrigiere Fehler sanft im Spielkontext: "Ah, du meinst wahrscheinlich '[richtige Form]' - so würde dein Charakter das sagen!"
- Führe neues Vokabular natürlich ein: "Die Klinge glänzt - sie ist 'scharf' (sharp)"
- Ermutige beschreibende Sprache: "Beschreibe, wie dein Charakter sich fühlt/aussieht/handelt"
- Wiederhole wichtige Grammatik in verschiedenen Kontexten
- Verwende Modalverben, Perfekt, Konjunktiv II für fortgeschrittene Strukturen

**DAGGERHEART REGELWERK:**
${daggerheartRules}

**SPIELLEITER-PRINZIPIEN:**
- Sei ein Fan des Spielers - lass sie heroisch aber herausgefordert sein
- Führe mit Fiktion - beschreibe erst, dann Mechaniken
- Halte es in Bewegung - schneide zu interessanten Momenten
- Sage "ja, und..." oder "ja, aber..." statt "nein"
- Kollaboriere immer, besonders bei Konflikten
- Fülle die Welt mit Leben, Wunder und Gefahr
- Stelle Fragen und arbeite die Antworten ein
- Gib jedem Wurf Auswirkungen
- Halte sanft fest - keine vorbestimmten Ergebnisse

**TOOL-VERWENDUNG (Detailliert):**
- **'update_player'**: Name, Level, HP, Stress, Hope, Armor, Zustände, Ort, Klasse, Hintergrund, Attribute
- **'update_inventory'**: Gegenstände hinzufügen/entfernen (add/remove) und Gold verwalten
- **'update_scene'**: Schauplätze, Szenen-Beschreibungen, Locations setzen
- **'roll_action'**: 2d12-Würfe für Spieleraktionen (Hoffnung vs. Furcht System)
- **'roll_damage'**: Schadenswürfe mit Waffen-Würfeln × Fertigkeit
- **'deal_damage_to_player'**: Schaden am Spieler anwenden (mit Schwellenwerten)
- **'make_adversary_attack'**: d20-Angriffswürfe für Gegner
- **'roll_dice'**: Allgemeine Würfelwürfe (d4, d6, d8, d10, d12, d20, d100)
- **'manage_quests'**: Aufgaben verwalten (add/complete/update)
- **'track_language'**: Sprachlernfortschritt dokumentieren
- **'spend_fear'**: Furcht ausgeben für GM-Effekte

**WÜRFELREGELN:**
- **SPIELER-WÜRFE: 2d12** (Hoffnung vs. Furcht) + Modifikatoren
- **GM-WÜRFE: d20** + Modifikator für Gegnerwürfe
- Schwierigkeitsgrade: 5 (Leicht) bis 30 (Schwer)
- Erfahrungen: +2 Bonus (nicht +1d6!)
- Vorteil/Nachteil: +/-1d6 zum Gesamtergebnis
- Kritischer Erfolg: Hoffnung = Furcht (nur bei Spieler-2d12)
- Reaktionswürfe: Keine Hoffnung/Furcht-Generierung
- **WICHTIG**: Spieler verwenden IMMER 2d12, GM verwendet d20 für Angriffe!

**WORKFLOW FÜR JEDEN TURN:**
1. Spieler-Eingabe analysieren
2. Auf Deutsch antworten und Szene beschreiben
3. Tool-Evaluierung durchführen (siehe oben)
4. Entsprechende Tools aufrufen
5. Ergebnisse in die Narration einbauen
6. Nächste Aktion/Frage stellen

**AKTUELLER SPIELERZUSTAND:**
${gameStateInfo}

**WICHTIG:** Nutze diese Charakterinformationen aktiv in deiner Rolle als GM. Verweise auf den Hintergrund, die Beziehungen und die Motivation des Charakters. Berücksichtige die Attribute bei Würfen und die Ausrüstung bei Beschreibungen.

Starte direkt mit der ersten Szene. Hier ist ein Guide für die Szene:
${sceneGuide}
`,                tools: tools,
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

              // Add error handler for RealtimeSession
              realtimeSession.on('error', (error: any) => {
                console.error('RealtimeSession error:', error);
                
                // Handle specific error types
                if (error?.error?.code === 'response_cancel_not_active') {
                  // This is a common non-critical error when trying to cancel a response that's already finished
                  console.log('Response cancellation attempted on inactive response - this is usually harmless');
                  return;
                }
                
                // For other errors, send to client
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({
                    type: 'realtime_error',
                    error: error?.error?.message || 'Unknown realtime error'
                  }));
                }
              });

              // Listen for conversation history updates (documented API)
              realtimeSession.on('history_updated', (history: any) => {
                // console.log('Conversation history updated, sending to client');
                
                // Debug: Log the structure to see if tool calls are included
                if (history && Array.isArray(history)) {
                  const toolCalls = history.filter((item: any) => 
                    item.type === 'function_call' || item.type === 'tool_call'
                  );
                  if (toolCalls.length > 0) {
                    // console.log('Found tool calls in history:', toolCalls.map((tc: any) => ({
                    //   type: tc.type,
                    //   name: tc.name,
                    //   status: tc.status,
                    //   arguments: tc.arguments,
                    //   output: tc.output
                    // })));
                  }
                }
                
                // Merge tool call logs for this session
                const sessionToolCalls = toolCallLogs.get(sessionId!) || [];
                // Merge and sort by timestamp (if timestamps are comparable)
                const mergedHistory = [...history, ...sessionToolCalls].sort((a, b) => {
                  const timeA = new Date(`1970-01-01 ${a.timestamp}`).getTime();
                  const timeB = new Date(`1970-01-01 ${b.timestamp}`).getTime();
                  return timeA - timeB;
                });
                sockets.get(sessionId!)?.send(JSON.stringify({
                  type: 'history_updated',
                  history: mergedHistory
                }));
              });
              
              console.log('✅ Audio and conversation event listeners set up successfully');

              // Connect to OpenAI using WebSocket transport
              console.log('Connecting to OpenAI Realtime API via WebSocket...');
              
              try {
                await realtimeSession.connect({
                  apiKey: message.clientApiKey,
                });
                console.log('Successfully connected to OpenAI Realtime API via WebSocket');
              } catch (connectError) {
                console.error('Failed to connect to OpenAI Realtime API:', connectError);
                throw connectError;
              }

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
                try {
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
                } catch (audioError) {
                  console.error('Error sending audio to OpenAI:', audioError);
                  
                  // Don't send every audio error to client as they can be frequent
                  // Only send critical errors that might affect the session
                  const errorObj = audioError as any;
                  if (errorObj && 
                      errorObj.error && 
                      errorObj.error.code && 
                      errorObj.error.code !== 'response_cancel_not_active') {
                    socket.send(JSON.stringify({ 
                      type: 'audio_error', 
                      error: errorObj.error.message || 'Audio processing error' 
                    }));
                  }
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
        sockets.delete(sessionId);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      
      // Clean up session on WebSocket error
      if (realtimeSession && sessionId) {
        try {
          const session = realtimeSession as any;
          if (typeof session.close === 'function') {
            session.close().catch((e: any) => console.error('Error closing session after WebSocket error:', e));
          } else if (typeof session.disconnect === 'function') {
            session.disconnect().catch((e: any) => console.error('Error disconnecting session after WebSocket error:', e));
          }
        } catch (e) {
          console.error('Error cleaning up session after WebSocket error:', e);
        }
        
        sessions.delete(sessionId);
        sockets.delete(sessionId);
      }
    };

    return response;
  },
}; 