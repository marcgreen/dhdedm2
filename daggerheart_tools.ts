// Core Daggerheart tool logic - separate from OpenAI tool wrapper
// This can be imported by both production code and tests

// Game state storage
const gameStates = new Map<string, any>();

// Default game state for new sessions
export const createDefaultGameState = () => ({
  player: {
    name: '',
    level: 1,
    hp: { current: 6, max: 6 },
    stress: { current: 0, max: 5 },
    hope: 2,
    armor: { current: 3, max: 3 },
    evasion: 12,
    thresholds: { major: 7, severe: 13 },
    proficiency: 1,
    conditions: [],
    experiences: ['Springloaded Legs', 'Silent Steps'],
    attributes: {
      Agility: 1,
      Strength: -1,
      Finesse: 2,
      Instinct: 0,
      Presence: 1,
      Knowledge: 0
    },
    domain_cards: [
      {
        name: 'Deft Deceiver',
        type: 'graceability',
        level: 1,
        description: 'Spend a Hope to gain advantage on a roll to deceive or trick someone into believing a lie you tell them.'
      },
      {
        name: 'Pick and Pull',
        type: 'midnightability',
        level: 1,
        description: 'You have advantage on action rolls to pick non-magical locks, disarm mechanical traps, or steal items from a target (things like bags, pouches, or containers carried or worn by someone within Melee range).'
      }
    ],
    class: 'Rogue',
    background: '',
    currentLocation: 'Starting Area',
    gold: 10,
    inventory: [
      {
        name: 'Torch',
        type: 'light',
        description: 'Provides light in dark areas'
      },
      {
        name: '50 feet of rope',
        type: 'utility',
        description: 'Useful for climbing and securing items'
      },
      {
        name: 'Basic supplies',
        type: 'consumable',
        description: 'Bedroll, rations, waterskin, and other essentials'
      },
      {
        name: 'Minor Stamina Potion',
        type: 'consumable',
        description: 'Clear 1d4 Stress',
        effect: 'clearStress',
        effectValue: '1d4'
      },
      {
        name: 'Grappling hook',
        type: 'utility',
        description: 'A sturdy hook and rope for scaling walls and reaching difficult places'
      }
    ],
    equipment: {
      weapons: {
        primary: {
          name: 'Crossbow',
          damage: '1d6+1',
          range: 'Far',
          properties: ['Finesse'],
          equipped: true
        },
        secondary: {
          name: 'Small Dagger',
          damage: '1d8',
          range: 'Melee',
          properties: ['Finesse'],
          equipped: true
        }
      },
      armor: {
        name: 'Gambeson Armor',
        armorScore: 3,
        thresholds: { minor: 6, major: 12 },
        properties: ['Flexible'],
        evasionBonus: 1,
        equipped: true
      }
    },
    features: [
      {
        name: 'Cloaked',
        type: 'class',
        description: 'Any time you would be Hidden, you are instead Cloaked. In addition to the benefits of the Hidden condition, while Cloaked you remain unseen if you are stationary when an adversary moves to where they would normally see you. After you make an attack or end a move within line of sight of an adversary, you are no longer Cloaked.',
        active: false
      },
      {
        name: 'Sneak Attack',
        type: 'class',
        description: 'When you succeed on an attack while Cloaked or while an ally is within Melee range of your target, add a number of d6s equal to your tier to your damage roll.',
        tier: 1,
        damageDice: 1,
        levelProgression: {
          2: { tier: 2, damageDice: 2 },
          5: { tier: 3, damageDice: 3 },
          8: { tier: 4, damageDice: 4 }
        }
      },
      {
        name: 'Shadow Stepper',
        type: 'class',
        description: 'You can move from shadow to shadow. When you move into an area of darkness or a shadow cast by another creature or object, you can mark a Stress to disappear from where you are and reappear inside another shadow within Far range. When you reappear, you are Cloaked.',
      },
      {
        name: 'Low-Light Living',
        type: 'heritage',
        description: 'When you\'re in an area with low light or heavy shadow, you have advantage on rolls to hide, investigate, or perceive details within that area.',
      }
    ]
  },
  gm: {
    fear: 2,
    hasSpotlight: false
  },
  scene: {
    currentScene: 'Character Creation',
    sceneDescription: 'Du stehst am Beginn eines neuen Abenteuers...',
    activeQuests: [],
    countdowns: []
  },
  sessionId: '',
  languageCorrections: 0,
  vocabularyIntroduced: []
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
      const defaultState = createDefaultGameState();
      defaultState.sessionId = this.sessionId;
      gameStates.set(this.sessionId, defaultState);
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
    
    if (args.level !== undefined) {
      const oldLevel = state.player.level;
      state.player.level = args.level;
      changes.push(`level: ${oldLevel}→${args.level}`);
      
      // Update feature tiers when level changes
      if (args.level > oldLevel) {
        state.player.features.forEach((feature: any) => {
          if (feature.levelProgression) {
            let newTier = 1;
            let newDamageDice = 1;
            
            // Find the highest applicable tier for current level
            Object.keys(feature.levelProgression).forEach(levelKey => {
              const reqLevel = parseInt(levelKey);
              if (args.level >= reqLevel) {
                const progression = feature.levelProgression[reqLevel];
                newTier = progression.tier;
                newDamageDice = progression.damageDice;
              }
            });
            
            if (feature.tier !== newTier) {
              const oldTier = feature.tier;
              feature.tier = newTier;
              feature.damageDice = newDamageDice;
              changes.push(`${feature.name} tier updated: ${oldTier}→${newTier}`);
            }
          }
        });
      }
    }
    
    if (args.location) {
      state.player.currentLocation = args.location;
      changes.push(`location: ${args.location}`);
    }
    
    if (args.class) {
      state.player.class = args.class;
      changes.push(`class: ${args.class}`);
    }
    
    if (args.background) {
      state.player.background = args.background;
      changes.push(`background: ${args.background}`);
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
        experiences: state.player.experiences,
        name: state.player.name,
        level: state.player.level,
        currentLocation: state.player.currentLocation,
        class: state.player.class,
        background: state.player.background,
        evasion: state.player.evasion,
        proficiency: state.player.proficiency,
        thresholds: state.player.thresholds,
        features: state.player.features,
        equipment: state.player.equipment,
        inventory: state.player.inventory,
        gold: state.player.gold,
        domain_cards: state.player.domain_cards,
        attributes: state.player.attributes
      }
    };
  }

  // Feature management methods
  updateFeatures(args: any) {
    const state = this.getGameState();
    const changes: string[] = [];
    
    // Activate/deactivate features
    if (args.activateFeature) {
      const feature = state.player.features.find((f: any) => f.name === args.activateFeature);
      if (feature) {
        feature.active = true;
        changes.push(`feature activated: ${args.activateFeature}`);
      }
    }
    
    if (args.deactivateFeature) {
      const feature = state.player.features.find((f: any) => f.name === args.deactivateFeature);
      if (feature) {
        feature.active = false;
        changes.push(`feature deactivated: ${args.deactivateFeature}`);
      }
    }
    
    // Update feature tiers based on level
    if (args.updateFeatureTiers) {
      state.player.features.forEach((feature: any) => {
        if (feature.levelProgression) {
          const level = state.player.level;
          let newTier = 1;
          let newDamageDice = 1;
          
          // Find the highest applicable tier for current level
          Object.keys(feature.levelProgression).forEach(levelKey => {
            const reqLevel = parseInt(levelKey);
            if (level >= reqLevel) {
              const progression = feature.levelProgression[reqLevel];
              newTier = progression.tier;
              newDamageDice = progression.damageDice;
            }
          });
          
          if (feature.tier !== newTier) {
            const oldTier = feature.tier;
            feature.tier = newTier;
            feature.damageDice = newDamageDice;
            changes.push(`${feature.name} tier updated: ${oldTier}→${newTier}`);
          }
        }
      });
    }
    
    this.updateGameState({ player: state.player });
    
    return {
      success: true,
      changes,
      features: state.player.features
    };
  }

  // Equipment management methods
  updateEquipment(args: any) {
    const state = this.getGameState();
    const changes: string[] = [];
    
    // Equip/unequip weapons
    if (args.equipWeapon) {
      const weaponType = args.equipWeapon.type || 'primary';
      const weapon = state.player.equipment.weapons[weaponType];
      if (weapon) {
        weapon.equipped = true;
        changes.push(`equipped weapon: ${weapon.name}`);
      }
    }
    
    if (args.unequipWeapon) {
      const weaponType = args.unequipWeapon.type || 'primary';
      const weapon = state.player.equipment.weapons[weaponType];
      if (weapon) {
        weapon.equipped = false;
        changes.push(`unequipped weapon: ${weapon.name}`);
      }
    }
    
    // Equip/unequip armor
    if (args.equipArmor) {
      state.player.equipment.armor.equipped = true;
      changes.push(`equipped armor: ${state.player.equipment.armor.name}`);
    }
    
    if (args.unequipArmor) {
      state.player.equipment.armor.equipped = false;
      changes.push(`unequipped armor: ${state.player.equipment.armor.name}`);
    }
    
    // Update armor thresholds based on equipped armor
    if (args.updateArmorThresholds) {
      const armor = state.player.equipment.armor;
      if (armor.equipped) {
        state.player.thresholds.minor = armor.thresholds.minor;
        state.player.thresholds.major = armor.thresholds.major;
        state.player.armor.max = armor.armorScore;
        state.player.evasion += armor.evasionBonus || 0;
        changes.push(`armor thresholds updated: minor=${armor.thresholds.minor}, major=${armor.thresholds.major}`);
      }
    }
    
    this.updateGameState({ player: state.player });
    
    return {
      success: true,
      changes,
      equipment: state.player.equipment
    };
  }

  // Domain card management methods
  updateDomainCards(args: any) {
    const state = this.getGameState();
    const changes: string[] = [];
    
    // Use a domain card (unlimited use)
    if (args.useDomainCard) {
      const card = state.player.domain_cards.find((c: any) => c.name === args.useDomainCard);
      if (card) {
        changes.push(`used domain card: ${args.useDomainCard}`);
      }
    }
    
    // Add a new domain card
    if (args.addDomainCard) {
      const newCard = {
        name: args.addDomainCard.name,
        type: args.addDomainCard.type,
        level: args.addDomainCard.level || 1,
        description: args.addDomainCard.description
      };
      state.player.domain_cards.push(newCard);
      changes.push(`added domain card: ${newCard.name}`);
    }
    
    // Remove a domain card
    if (args.removeDomainCard) {
      const index = state.player.domain_cards.findIndex((c: any) => c.name === args.removeDomainCard);
      if (index > -1) {
        const removedCard = state.player.domain_cards.splice(index, 1)[0];
        changes.push(`removed domain card: ${removedCard.name}`);
      }
    }
    
    this.updateGameState({ player: state.player });
    
    return {
      success: true,
      changes,
      domain_cards: state.player.domain_cards
    };
  }

  // Attribute management methods
  updateAttributes(args: any) {
    const state = this.getGameState();
    const changes: string[] = [];
    
    // Update individual attributes
    const attributeNames = ['Agility', 'Strength', 'Finesse', 'Instinct', 'Presence', 'Knowledge'];
    
    attributeNames.forEach(attrName => {
      if (args[attrName] !== undefined) {
        const oldValue = state.player.attributes[attrName];
        state.player.attributes[attrName] = args[attrName];
        changes.push(`${attrName}: ${oldValue}→${args[attrName]}`);
      }
    });
    
    // Update all attributes at once
    if (args.attributes) {
      Object.keys(args.attributes).forEach(attrName => {
        if (attributeNames.includes(attrName)) {
          const oldValue = state.player.attributes[attrName];
          state.player.attributes[attrName] = args.attributes[attrName];
          changes.push(`${attrName}: ${oldValue}→${args.attributes[attrName]}`);
        }
      });
    }
    
    this.updateGameState({ player: state.player });
    
    return {
      success: true,
      changes,
      attributes: state.player.attributes
    };
  }

  // Inventory management methods
  updateInventory(args: any) {
    const state = this.getGameState();
    const changes: string[] = [];
    
    // Add item to inventory
    if (args.addItem) {
      const newItem = {
        name: args.addItem.name,
        type: args.addItem.type || 'utility',
        description: args.addItem.description || '',
        effect: args.addItem.effect,
        effectValue: args.addItem.effectValue
      };
      state.player.inventory.push(newItem);
      changes.push(`added item: ${newItem.name}`);
    }
    
    // Remove item from inventory
    if (args.removeItem) {
      const index = state.player.inventory.findIndex((item: any) => item.name === args.removeItem);
      if (index > -1) {
        const removedItem = state.player.inventory.splice(index, 1)[0];
        changes.push(`removed item: ${removedItem.name}`);
      }
    }
    
    // Use consumable item
    if (args.useItem) {
      const item = state.player.inventory.find((i: any) => i.name === args.useItem);
      if (item && item.type === 'consumable') {
        if (item.effect === 'clearStress') {
          const stressToClear = item.effectValue === '1d4' ? rollDice(4, 1)[0] : parseInt(item.effectValue);
          const oldStress = state.player.stress.current;
          state.player.stress.current = Math.max(0, state.player.stress.current - stressToClear);
          changes.push(`used ${item.name}: cleared ${stressToClear} stress (${oldStress}→${state.player.stress.current})`);
          
          // Remove the consumed item
          const index = state.player.inventory.findIndex((i: any) => i.name === args.useItem);
          if (index > -1) {
            state.player.inventory.splice(index, 1);
          }
        }
      }
    }
    
    // Update gold
    if (args.gold !== undefined) {
      const oldGold = state.player.gold;
      state.player.gold = Math.max(0, state.player.gold + args.gold);
      changes.push(`gold: ${oldGold}→${state.player.gold}`);
    }
    
    this.updateGameState({ player: state.player });
    
    return {
      success: true,
      changes,
      inventory: state.player.inventory,
      gold: state.player.gold
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
    
    // Get attribute modifier based on trait
    let attributeModifier = 0;
    if (args.trait) {
      const traitName = args.trait.charAt(0).toUpperCase() + args.trait.slice(1);
      attributeModifier = state.player.attributes[traitName] || 0;
    }
    
    const total = hopeRoll + fearRoll + baseModifier + experienceBonus + modifierRoll + attributeModifier;
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
      attributeModifier,
      succeeded,
      hopeGained,
      fearGained,
      stressCleared,
      spotlightToGM,
      experienceUsed: args.useExperience || null
    };
  }

  // Phase 2: Combat damage calculation
  rollDamage(args: any) {
    const { weaponDice, proficiency, isCritical = false, fearBonus = 0, isSneakAttack = false, allyInMelee = false } = args;
    
    // Parse weapon dice (e.g., "1d8+2")
    const diceMatch = weaponDice.match(/(\d+)d(\d+)(?:\+(\d+))?/);
    if (!diceMatch) {
      throw new Error(`Invalid weapon dice format: ${weaponDice}`);
    }
    
    const [, diceCount, diceSides, baseMod] = diceMatch;
    const count = parseInt(diceCount);
    const sides = parseInt(diceSides);
    const baseModifier = parseInt(baseMod || '0');
    
    // Roll base weapon dice
    const rolls = rollDice(sides, count);
    const baseRoll = rolls.reduce((sum, roll) => sum + roll, 0);
    
    // Apply proficiency multiplier to dice (not static modifier)
    const proficiencyDamage = baseRoll * proficiency;
    
    // Add static modifier
    const withModifier = proficiencyDamage + baseModifier;
    
    // Critical hit: add maximum possible damage
    const maxDamage = isCritical ? (sides * count) : 0;
    
    // Fear bonus: +1d4 per Fear spent
    const fearBonusRolls = fearBonus > 0 ? rollDice(4, fearBonus) : [];
    const fearBonusTotal = fearBonusRolls.reduce((sum, roll) => sum + roll, 0);
    
    // Check for Sneak Attack bonus
    let sneakAttackBonus = 0;
    let sneakAttackRolls: number[] = [];
    const state = this.getGameState();
    const sneakAttackFeature = state.player.features.find((f: any) => f.name === 'Sneak Attack');
    
    if (sneakAttackFeature && (isSneakAttack || allyInMelee)) {
      const damageDice = sneakAttackFeature.damageDice || 1;
      sneakAttackRolls = rollDice(6, damageDice);
      sneakAttackBonus = sneakAttackRolls.reduce((sum, roll) => sum + roll, 0);
    }
    
    const total = withModifier + maxDamage + fearBonusTotal + sneakAttackBonus;
    
    return {
      total,
      rolls,
      maxDamage,
      fearBonusRolls,
      sneakAttackRolls,
      sneakAttackBonus,
      breakdown: `${count}d${sides}×${proficiency}${baseModifier > 0 ? `+${baseModifier}` : baseModifier < 0 ? `${baseModifier}` : ''}${maxDamage > 0 ? `+${maxDamage}(max)` : ''}${fearBonusTotal > 0 ? `+${fearBonusTotal}(fear)` : ''}${sneakAttackBonus > 0 ? `+${sneakAttackBonus}(sneak)` : ''}`
    };
  }

  // Phase 2: Apply damage with threshold system
  dealDamageToPlayer(args: any) {
    const { 
      damage, 
      damageType = 'physical', 
      canUseArmor = true, 
      resistance = false, 
      immunity = false,
      direct = false 
    } = args;
    
    const state = this.getGameState();
    let finalDamage = damage;
    
    // Handle immunity
    if (immunity) {
      return {
        hpLost: 0,
        armorUsed: false,
        damageAfterReduction: 0,
        newVulnerable: state.player.stress.current === 0,
        deathCheck: state.player.hp.current === 0,
        thresholdReached: 'none'
      };
    }
    
    // Handle resistance (halve damage before thresholds)
    if (resistance) {
      finalDamage = Math.floor(finalDamage / 2);
    }
    
    // Check armor usage (can reduce by one threshold level)
    let armorUsed = false;
    if (canUseArmor && !direct && state.player.armor.current > 0) {
      const { major, severe } = state.player.thresholds;
      
      // If damage would hit major/severe threshold, can use armor to reduce
      if (finalDamage >= major) {
        armorUsed = true;
        state.player.armor.current -= 1;
        // Reduce damage by one threshold level
        if (finalDamage >= severe) {
          finalDamage = Math.max(finalDamage - (severe - major), major - 1);
        } else {
          finalDamage = Math.max(finalDamage - major, 0);
        }
      }
    }
    
    // Calculate HP loss based on thresholds
    const { major, severe } = state.player.thresholds;
    let hpLost = 1; // Default
    let thresholdReached = 'minor';
    
    if (finalDamage >= severe * 2) {
      hpLost = 4;
      thresholdReached = 'massive';
    } else if (finalDamage >= severe) {
      hpLost = 3;
      thresholdReached = 'severe';
    } else if (finalDamage >= major) {
      hpLost = 2;
      thresholdReached = 'major';
    } else if (finalDamage > 0) {
      hpLost = 1;
      thresholdReached = 'minor';
    } else {
      hpLost = 0;
      thresholdReached = 'none';
    }
    
    // Apply HP loss
    const oldHp = state.player.hp.current;
    state.player.hp.current = Math.max(0, oldHp - hpLost);
    
    // Check for new vulnerable condition (stress = 0)
    const newVulnerable = state.player.stress.current === 0;
    
    // Check for death
    const deathCheck = state.player.hp.current === 0;
    
    this.updateGameState({ player: state.player });
    
    return {
      hpLost,
      armorUsed,
      damageAfterReduction: finalDamage,
      newVulnerable,
      deathCheck,
      thresholdReached
    };
  }

  // Phase 2: GM attack rolls
  makeAdversaryAttack(args: any) {
    const { attackBonus, targetEvasion, advantage = 0, disadvantage = 0 } = args;
    
    // Roll d20
    const baseRoll = rollDice(20, 1)[0];
    
    // Apply advantage/disadvantage
    let modifierRoll = 0;
    if (advantage > 0 || disadvantage > 0) {
      const net = advantage - disadvantage;
      modifierRoll = rollD6Modifier(net);
    }
    
    const total = baseRoll + attackBonus + modifierRoll;
    const hit = total >= targetEvasion;
    const isCritical = baseRoll === 20; // Natural 20 always hits
    
    return {
      hit: hit || isCritical,
      isCritical,
      attackRoll: baseRoll,
      total,
      targetEvasion
    };
  }

  // Phase 2: GM Fear spending
  spendFear(args: any) {
    const { amount, purpose, description = '' } = args;
    const state = this.getGameState();
    
    // Validate Fear availability
    if (state.gm.fear < amount) {
      return {
        success: false,
        newTotal: state.gm.fear,
        effect: 'insufficient_fear'
      };
    }
    
    // Spend Fear
    state.gm.fear -= amount;
    
    // Apply effect based on purpose
    let effect = '';
    switch (purpose) {
      case 'spotlight':
        state.gm.hasSpotlight = true;
        effect = 'spotlight_kept';
        break;
      case 'damage':
        effect = 'damage_bonus';
        break;
      case 'advantage':
        effect = 'advantage_gained';
        break;
      case 'ability':
        effect = 'ability_activated';
        break;
      default:
        effect = purpose || 'unknown';
    }
    
    this.updateGameState(state);
    
    return {
      success: true,
      newTotal: state.gm.fear,
      effect,
      spotlightToGM: purpose === 'spotlight'
    };
  }
}

// Factory function for creating game managers
export const createGameManager = (sessionId: string) => {
  return new DaggerheartGameManager(sessionId);
}; 