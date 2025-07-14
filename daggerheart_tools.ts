// Core Daggerheart tool logic - separate from OpenAI tool wrapper
// This can be imported by both production code and tests

// Game state storage
const gameStates = new Map<string, any>();

// Default game state for new sessions
export const createDefaultGameState = () => ({
  player: {
    name: '',
    hp: { current: 10, max: 10 },
    stress: { current: 5, max: 5 },
    hope: 0,
    armor: { current: 3, max: 3 },
    evasion: 10,
    thresholds: { major: 5, severe: 10 },
    proficiency: 1,
    conditions: [],
    experiences: []
  },
  gm: {
    fear: 0,
    hasSpotlight: false
  },
  scene: {
    countdowns: []
  }
});

// Helper functions for dice rolling
export const rollDice = (sides: number, count: number = 1): number[] => {
  return Array.from({length: count}, () => Math.floor(Math.random() * sides) + 1);
};

export const rollD6Modifier = (count: number): number => {
  if (count === 0) return 0;
  const rolls = rollDice(6, Math.abs(count));
  return count > 0 ? Math.max(...rolls) : -Math.max(...rolls);
};

// Core tool functions
export class DaggerheartGameManager {
  constructor(private sessionId: string) {}

  getGameState() {
    if (!gameStates.has(this.sessionId)) {
      gameStates.set(this.sessionId, createDefaultGameState());
    }
    return gameStates.get(this.sessionId);
  }

  updateGameState(updates: any) {
    const state = this.getGameState();
    Object.keys(updates).forEach(key => {
      if (typeof updates[key] === 'object' && updates[key] !== null) {
        state[key] = { ...state[key], ...updates[key] };
      } else {
        state[key] = updates[key];
      }
    });
    gameStates.set(this.sessionId, state);
  }

  // Core getState logic
  getState() {
    return this.getGameState();
  }

  // Core updatePlayer logic
  updatePlayer(args: any) {
    const state = this.getGameState();
    const changes: string[] = [];
    
    // Update basic stats
    if (args.hp !== undefined) {
      const oldHp = state.player.hp.current;
      state.player.hp.current = Math.max(0, Math.min(args.hp, state.player.hp.max));
      changes.push(`hp: ${oldHp}→${state.player.hp.current}`);
    }
    
    if (args.stress !== undefined) {
      const oldStress = state.player.stress.current;
      state.player.stress.current = Math.max(0, Math.min(args.stress, state.player.stress.max));
      changes.push(`stress: ${oldStress}→${state.player.stress.current}`);
    }
    
    if (args.hope !== undefined) {
      const oldHope = state.player.hope;
      state.player.hope = Math.max(0, args.hope);
      changes.push(`hope: ${oldHope}→${state.player.hope}`);
    }
    
    if (args.armor !== undefined) {
      const oldArmor = state.player.armor.current;
      state.player.armor.current = Math.max(0, Math.min(args.armor, state.player.armor.max));
      changes.push(`armor: ${oldArmor}→${state.player.armor.current}`);
    }
    
    // Handle conditions
    if (args.addCondition) {
      if (!state.player.conditions.includes(args.addCondition)) {
        state.player.conditions.push(args.addCondition);
        changes.push(`condition added: ${args.addCondition}`);
      }
    }
    
    if (args.removeCondition) {
      const index = state.player.conditions.indexOf(args.removeCondition);
      if (index > -1) {
        state.player.conditions.splice(index, 1);
        changes.push(`condition removed: ${args.removeCondition}`);
      }
    }
    
    if (args.clearAllConditions) {
      const oldConditions = [...state.player.conditions];
      state.player.conditions = [];
      changes.push(`all conditions cleared: ${oldConditions.join(', ')}`);
    }
    
    // Handle experiences
    if (args.markExperience) {
      const exp = state.player.experiences.find((e: any) => e.name === args.markExperience);
      if (exp) {
        exp.used = true;
        changes.push(`experience marked as used: ${args.markExperience}`);
      }
    }
    
    // Clear stress
    if (args.clearStress) {
      const oldStress = state.player.stress.current;
      state.player.stress.current = Math.max(0, state.player.stress.current - args.clearStress);
      changes.push(`stress cleared: ${oldStress}→${state.player.stress.current}`);
    }
    
    // Update character info
    if (args.name) {
      state.player.name = args.name;
      changes.push(`name set: ${args.name}`);
    }
    
    if (args.evasion !== undefined) {
      state.player.evasion = args.evasion;
      changes.push(`evasion: ${args.evasion}`);
    }
    
    if (args.proficiency !== undefined) {
      state.player.proficiency = args.proficiency;
      changes.push(`proficiency: ${args.proficiency}`);
    }
    
    // Update max values
    if (args.maxHp !== undefined) {
      state.player.hp.max = args.maxHp;
      changes.push(`max hp: ${args.maxHp}`);
    }
    
    if (args.maxStress !== undefined) {
      state.player.stress.max = args.maxStress;
      changes.push(`max stress: ${args.maxStress}`);
    }
    
    if (args.maxArmor !== undefined) {
      state.player.armor.max = args.maxArmor;
      changes.push(`max armor: ${args.maxArmor}`);
    }
    
    if (args.majorThreshold !== undefined) {
      state.player.thresholds.major = args.majorThreshold;
      changes.push(`major threshold: ${args.majorThreshold}`);
    }
    
    if (args.severeThreshold !== undefined) {
      state.player.thresholds.severe = args.severeThreshold;
      changes.push(`severe threshold: ${args.severeThreshold}`);
    }
    
    this.updateGameState({ player: state.player });
    
    return {
      success: true,
      changes,
      newState: {
        hp: state.player.hp,
        stress: state.player.stress,
        hope: state.player.hope,
        armor: state.player.armor,
        conditions: state.player.conditions,
        experiences: state.player.experiences
      }
    };
  }

  // Core rollAction logic
  rollAction(args: any) {
    const state = this.getGameState();
    
    // Roll 2d12 for Hope and Fear
    const hopeRoll = rollDice(12, 1)[0];
    const fearRoll = rollDice(12, 1)[0];
    
    // Calculate modifiers
    const baseModifier = args.modifier || 0;
    const experienceBonus = args.experienceBonus || 0;
    const advantageRoll = rollD6Modifier(args.advantage || 0);
    const disadvantageRoll = rollD6Modifier(args.disadvantage || 0);
    const modifierRoll = advantageRoll + disadvantageRoll;
    
    const total = hopeRoll + fearRoll + baseModifier + experienceBonus + modifierRoll;
    const succeeded = total >= args.difficulty;
    
    // Determine result type based on Hope vs Fear
    let result: string;
    let hopeGained = 0;
    let fearGained = 0;
    let stressCleared = 0;
    let spotlightToGM = false;
    
    if (hopeRoll === fearRoll) {
      // Critical Success
      result = 'critSuccess';
      hopeGained = 1;
      fearGained = 1;
      stressCleared = 1;
      spotlightToGM = false;
    } else if (succeeded) {
      if (hopeRoll > fearRoll) {
        // Success with Hope
        result = 'successHope';
        hopeGained = 1;
        spotlightToGM = false;
      } else {
        // Success with Fear
        result = 'successFear';
        fearGained = 1;
        spotlightToGM = true;
      }
    } else {
      if (hopeRoll > fearRoll) {
        // Failure with Hope
        result = 'failureHope';
        hopeGained = 1;
        spotlightToGM = true;
      } else {
        // Failure with Fear
        result = 'failureFear';
        fearGained = 1;
        spotlightToGM = true;
      }
    }
    
    // Update game state
    if (hopeGained > 0) {
      state.player.hope += hopeGained;
    }
    if (fearGained > 0) {
      state.gm.fear = Math.min(12, state.gm.fear + fearGained);
    }
    if (stressCleared > 0) {
      state.player.stress.current = Math.max(0, state.player.stress.current - stressCleared);
    }
    if (spotlightToGM) {
      state.gm.hasSpotlight = true;
    }
    
    // Mark experience as used if provided
    if (args.useExperience && experienceBonus > 0) {
      const exp = state.player.experiences.find((e: any) => e.name === args.useExperience);
      if (exp) {
        exp.used = true;
      }
    }
    
    this.updateGameState(state);
    
    return {
      result,
      total,
      rolls: { hope: hopeRoll, fear: fearRoll },
      modifierRoll,
      succeeded,
      hopeGained,
      fearGained,
      stressCleared,
      spotlightToGM,
      experienceUsed: args.useExperience || null
    };
  }
}

// Factory function for creating game managers
export const createGameManager = (sessionId: string) => {
  return new DaggerheartGameManager(sessionId);
}; 