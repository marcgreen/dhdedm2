// Minimal automated test for Daggerheart tools - Testing actual production code
import { createGameManager, formatGameStateForAI } from "./daggerheart_tools.ts";

// Simple assertions (minimal approach)
const assertEquals = (actual: any, expected: any, message?: string) => {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
};

const assert = (condition: boolean, message?: string) => {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
};

// Test constants
const DEFAULT_HP = 6;
const DEFAULT_STRESS = 5;
const DEFAULT_HOPE = 2;
const MAX_FEAR = 12;

// Helper to create isolated test session
const createTestManager = () => createGameManager(`test-${crypto.randomUUID()}`);

Deno.test("getState returns default state", () => {
  const gameManager = createTestManager();
  const state = gameManager.getState();
  
  assertEquals(state.player.name, '');
  assertEquals(state.player.hp.current, DEFAULT_HP);
  assertEquals(state.player.hope, DEFAULT_HOPE);
  assertEquals(state.gm.fear, 2);
  assertEquals(state.gm.hasSpotlight, false);
});

Deno.test("updatePlayer modifies state correctly", () => {
  const gameManager = createTestManager();
  
  const result = gameManager.updatePlayer({ name: 'Hans', hope: 3, hp: 5 });
  
  assertEquals(result.success, true);
  assertEquals(result.newState.hope, 3);
  assertEquals(result.newState.hp.current, 5);
  
  // Verify state persists
  const state = gameManager.getState();
  assertEquals(state.player.name, 'Hans');
  assertEquals(state.player.hope, 3);
  assertEquals(state.player.hp.current, 5);
});

Deno.test("rollAction mechanics work correctly", () => {
  const gameManager = createTestManager();
  
  const result = gameManager.rollAction({ trait: 'strength', difficulty: 10 });
  
  // Test that basic mechanics work
  assert(result.rolls.hope >= 1 && result.rolls.hope <= 12);
  assert(result.rolls.fear >= 1 && result.rolls.fear <= 12);
  assert(['critSuccess', 'successHope', 'successFear', 'failureHope', 'failureFear'].includes(result.result));
  
  // Test Hope/Fear generation logic based on actual dice
  if (result.rolls.hope === result.rolls.fear) {
    assertEquals(result.result, 'critSuccess');
    assertEquals(result.hopeGained, 1);
    assertEquals(result.fearGained, 1);
    assertEquals(result.stressCleared, 1);
  } else if (result.succeeded) {
    if (result.rolls.hope > result.rolls.fear) {
      assertEquals(result.result, 'successHope');
      assertEquals(result.hopeGained, 1);
      assertEquals(result.spotlightToGM, false);
    } else {
      assertEquals(result.result, 'successFear');
      assertEquals(result.fearGained, 1);
      assertEquals(result.spotlightToGM, true);
    }
  } else {
    if (result.rolls.hope > result.rolls.fear) {
      assertEquals(result.result, 'failureHope');
      assertEquals(result.hopeGained, 1);
      assertEquals(result.spotlightToGM, true);
    } else {
      assertEquals(result.result, 'failureFear');
      assertEquals(result.fearGained, 1);
      assertEquals(result.spotlightToGM, true);
    }
  }
  
  // Verify state was updated correctly
  const state = gameManager.getState();
  assertEquals(state.player.hope, DEFAULT_HOPE + result.hopeGained);
  assertEquals(state.gm.fear, 2 + result.fearGained);
  assertEquals(state.gm.hasSpotlight, result.spotlightToGM);
});

Deno.test("rollAction with modifiers", () => {
  const gameManager = createTestManager();
  
  const result = gameManager.rollAction({ 
    trait: 'agility', 
    difficulty: 15,
    modifier: 3,
    experienceBonus: 2,
    advantage: 1
  });
  
  // Test that modifiers are applied correctly
  const expectedBase = result.rolls.hope + result.rolls.fear + 3 + 2 + result.modifierRoll + result.attributeModifier;
  assertEquals(result.total, expectedBase);
  
  // Test that advantage generated a modifier
  assert(result.modifierRoll >= 1 && result.modifierRoll <= 6);
});

Deno.test("fear boundary conditions", () => {
  const gameManager = createTestManager();
  
  // Set fear to near max
  const state = gameManager.getState();
  state.gm.fear = 11;
  
  // Roll that might generate fear
  const result = gameManager.rollAction({ trait: 'strength', difficulty: 25 });
  
  if (result.fearGained > 0) {
    const updatedState = gameManager.getState();
    assert(updatedState.gm.fear <= MAX_FEAR);
    assertEquals(updatedState.gm.fear, MAX_FEAR);
  }
});

Deno.test("HP boundary conditions", () => {
  const gameManager = createTestManager();
  
  // Test HP clamping
  const result1 = gameManager.updatePlayer({ hp: 0 });
  assertEquals(result1.newState.hp.current, 0);
  
  const result2 = gameManager.updatePlayer({ hp: -5 });
  assertEquals(result2.newState.hp.current, 0);
  
  const result3 = gameManager.updatePlayer({ hp: 20 });
  assertEquals(result3.newState.hp.current, DEFAULT_HP);
});

Deno.test("stress boundary conditions", () => {
  const gameManager = createTestManager();
  
  // Test stress clamping
  const result1 = gameManager.updatePlayer({ stress: 0 });
  assertEquals(result1.newState.stress.current, 0);
  
  const result2 = gameManager.updatePlayer({ stress: -3 });
  assertEquals(result2.newState.stress.current, 0);
  
  const result3 = gameManager.updatePlayer({ stress: 15 });
  assertEquals(result3.newState.stress.current, DEFAULT_STRESS);
});

Deno.test("experience edge cases", () => {
  const gameManager = createTestManager();
  
  const state = gameManager.getState();
  state.player.experiences = [{ name: 'Dieb', used: true }];
  
  // Try to use already-used experience
  const result1 = gameManager.rollAction({ 
    trait: 'finesse', 
    difficulty: 15, 
    experienceBonus: 2,
    useExperience: 'Dieb'
  });
  
  // Should not crash, experience should remain used
  const updatedState = gameManager.getState();
  const exp = updatedState.player.experiences.find((e: any) => e.name === 'Dieb');
  assertEquals(exp.used, true);
  
  // Try to use non-existent experience - should not crash
  const result2 = gameManager.rollAction({ 
    trait: 'strength', 
    difficulty: 10, 
    experienceBonus: 2,
    useExperience: 'NonExistent'
  });
  
  assertEquals(result2.experienceUsed, 'NonExistent');
});

Deno.test("session isolation", () => {
  const gameManager1 = createTestManager();
  const gameManager2 = createTestManager();
  
  gameManager1.updatePlayer({ name: 'Hans', hope: 5 });
  gameManager2.updatePlayer({ name: 'Greta', hope: 2 });
  
  const state1 = gameManager1.getState();
  const state2 = gameManager2.getState();
  
  assertEquals(state1.player.name, 'Hans');
  assertEquals(state1.player.hope, 5);
  assertEquals(state2.player.name, 'Greta');
  assertEquals(state2.player.hope, 2);
});

// Phase 2 Tests - Combat System

Deno.test("rollDamage calculates damage correctly", () => {
  const gameManager = createTestManager();
  
  const result = gameManager.rollDamage({
    weaponDice: "1d8+2",
    proficiency: 2,
    isCritical: false,
    fearBonus: 0
  });
  
  // Basic validation
  assert(Array.isArray(result.rolls));
  assert(result.rolls.length === 1);
  assert(result.rolls[0] >= 1 && result.rolls[0] <= 8);
  
  // Should be: (roll * proficiency) + static modifier
  const expectedTotal = (result.rolls[0] * 2) + 2;
  assertEquals(result.total, expectedTotal);
  
  assert(result.breakdown.includes('1d8×2+2'));
});

Deno.test("rollDamage with critical hit", () => {
  const gameManager = createTestManager();
  
  const result = gameManager.rollDamage({
    weaponDice: "1d8",
    proficiency: 2,
    isCritical: true
  });
  
  // Critical should add max damage (8 for d8)
  const expectedTotal = (result.rolls[0] * 2) + 8;
  assertEquals(result.total, expectedTotal);
  assertEquals(result.maxDamage, 8);
});

Deno.test("rollDamage with fear bonus", () => {
  const gameManager = createTestManager();
  
  const result = gameManager.rollDamage({
    weaponDice: "1d6",
    proficiency: 1,
    fearBonus: 2
  });
  
  // Should have 2 fear bonus d4 rolls
  assertEquals(result.fearBonusRolls.length, 2);
  result.fearBonusRolls.forEach(roll => {
    assert(roll >= 1 && roll <= 4);
  });
});

Deno.test("dealDamageToPlayer with thresholds", () => {
  const gameManager = createTestManager();
  
  // Remove armor to test pure thresholds
  gameManager.updatePlayer({ armor: 0 });
  
  // Test minor damage (below major threshold)
  const result1 = gameManager.dealDamageToPlayer({ damage: 3 });
  assertEquals(result1.hpLost, 1);
  assertEquals(result1.thresholdReached, 'minor');
  
  // Create fresh manager for next test
  const gameManager2 = createTestManager();
  gameManager2.updatePlayer({ armor: 0 });
  
  // Test major damage (at major threshold)
  const result2 = gameManager2.dealDamageToPlayer({ damage: 7 });
  assertEquals(result2.hpLost, 2);
  assertEquals(result2.thresholdReached, 'major');
  
  // Create fresh manager for next test
  const gameManager3 = createTestManager();
  gameManager3.updatePlayer({ armor: 0 });
  
  // Test severe damage (at severe threshold)
  const result3 = gameManager3.dealDamageToPlayer({ damage: 13 });
  assertEquals(result3.hpLost, 3);
  assertEquals(result3.thresholdReached, 'severe');
});

Deno.test("dealDamageToPlayer with armor", () => {
  const gameManager = createTestManager();
  
  // Set up armor (default is 3)
  const initialState = gameManager.getState();
  assertEquals(initialState.player.armor.current, 3);
  
  // Attack that would hit major threshold - armor should reduce
  const result = gameManager.dealDamageToPlayer({ damage: 9 }); // Above major (7)
  
  assertEquals(result.armorUsed, true);
  assert(result.damageAfterReduction < 9); // Damage should be reduced
  
  // Verify exactly 1 armor was consumed
  const state = gameManager.getState();
  assertEquals(state.player.armor.current, 2); // Should be 3-1=2
});

Deno.test("armor limitation: only 1 slot per damage instance", () => {
  const gameManager = createTestManager();
  
  // Set up armor and verify initial state
  const initialState = gameManager.getState();
  assertEquals(initialState.player.armor.current, 3);
  
  // First attack: massive damage (30) - should only use 1 armor slot
  const result1 = gameManager.dealDamageToPlayer({ damage: 30 }); // Massive damage
  assertEquals(result1.armorUsed, true);
  assertEquals(result1.thresholdReached, 'severe'); // Reduced from massive to severe
  assertEquals(result1.hpLost, 3); // Severe = 3 HP
  
  // Verify exactly 1 armor slot used, not multiple
  const state1 = gameManager.getState();
  assertEquals(state1.player.armor.current, 2); // Only 1 slot consumed
  
  // Second attack: another massive damage - should use another 1 armor slot
  const result2 = gameManager.dealDamageToPlayer({ damage: 30 });
  assertEquals(result2.armorUsed, true);
  assertEquals(result2.thresholdReached, 'severe'); // Again reduced from massive to severe
  
  // Verify another 1 armor slot used
  const state2 = gameManager.getState();
  assertEquals(state2.player.armor.current, 1); // Now down to 1
  
  // Third attack: major damage when only 1 armor left
  const result3 = gameManager.dealDamageToPlayer({ damage: 8 });
  assertEquals(result3.armorUsed, true);
  assertEquals(result3.thresholdReached, 'minor'); // Reduced from major to minor
  
  // Verify last armor slot consumed
  const state3 = gameManager.getState();
  assertEquals(state3.player.armor.current, 0); // All armor used up
  
  // Fourth attack: no armor left
  const result4 = gameManager.dealDamageToPlayer({ damage: 13 });
  assertEquals(result4.armorUsed, false); // No armor available
  assertEquals(result4.thresholdReached, 'severe'); // Full damage
  
  // Verify armor stays at 0
  const state4 = gameManager.getState();
  assertEquals(state4.player.armor.current, 0);
});

Deno.test("dealDamageToPlayer immunity", () => {
  const gameManager = createTestManager();
  
  const result = gameManager.dealDamageToPlayer({ 
    damage: 20, 
    immunity: true 
  });
  
  assertEquals(result.hpLost, 0);
  assertEquals(result.thresholdReached, 'none');
  
  // HP should be unchanged
  const state = gameManager.getState();
  assertEquals(state.player.hp.current, DEFAULT_HP);
});

Deno.test("makeAdversaryAttack mechanics", () => {
  const gameManager = createTestManager();
  
  const result = gameManager.makeAdversaryAttack({
    attackBonus: 5,
    targetEvasion: 12
  });
  
  // Basic validation
  assert(result.attackRoll >= 1 && result.attackRoll <= 20);
  assertEquals(result.total, result.attackRoll + 5);
  assertEquals(result.targetEvasion, 12);
  
  // Hit logic
  const expectedHit = result.total >= 12 || result.attackRoll === 20;
  assertEquals(result.hit, expectedHit);
  
  // Critical logic
  assertEquals(result.isCritical, result.attackRoll === 20);
});

Deno.test("spendFear mechanics", () => {
  const gameManager = createTestManager();
  
  // Set up some Fear
  const state = gameManager.getState();
  state.gm.fear = 5;
  
  // Test successful spend
  const result1 = gameManager.spendFear({
    amount: 2,
    purpose: 'damage'
  });
  
  assertEquals(result1.success, true);
  assertEquals(result1.newTotal, 3);
  assertEquals(result1.effect, 'damage_bonus');
  
  // Test insufficient Fear
  const result2 = gameManager.spendFear({
    amount: 5,
    purpose: 'spotlight'
  });
  
  assertEquals(result2.success, false);
  assertEquals(result2.effect, 'insufficient_fear');
});

Deno.test("spendFear for spotlight", () => {
  const gameManager = createTestManager();
  
  // Set up Fear
  const state = gameManager.getState();
  state.gm.fear = 3;
  
  const result = gameManager.spendFear({
    amount: 1,
    purpose: 'spotlight'
  });
  
  assertEquals(result.success, true);
  assertEquals(result.effect, 'spotlight_kept');
  assertEquals(result.spotlightToGM, true);
  
  // Verify spotlight state
  const updatedState = gameManager.getState();
  assertEquals(updatedState.gm.hasSpotlight, true);
}); 

Deno.test("Features and equipment are properly initialized", () => {
  const gameManager = createGameManager("test-session");
  const state = gameManager.getState();
  
  // Check that features are initialized
  assertEquals(state.player.features.length, 5);
  assertEquals(state.player.features[0].name, "Cloaked");
  assertEquals(state.player.features[1].name, "Sneak Attack");
  assertEquals(state.player.features[1].tier, 1);
  assertEquals(state.player.features[1].damageDice, 1);
  assertEquals(state.player.features[4].name, "Rogue's Dodge");
  
  // Check that equipment is initialized
  assertEquals(state.player.equipment.weapons.primary.name, "Crossbow");
  assertEquals(state.player.equipment.weapons.secondary.name, "Small Dagger");
  assertEquals(state.player.equipment.armor.name, "Gambeson Armor");
  
  // Check that inventory is initialized
  assertEquals(state.player.inventory.length, 5);
  assertEquals(state.player.gold, 10);
  
  // Check updated default values
  assertEquals(state.player.hp.current, 6);
  assertEquals(state.player.hp.max, 6);
  assertEquals(state.player.evasion, 12);
  assertEquals(state.player.thresholds.major, 7);
  assertEquals(state.player.thresholds.severe, 13);
  assertEquals(state.player.class, "Rogue");
});

Deno.test("Sneak Attack damage calculation", () => {
  const gameManager = createGameManager("test-sneak-attack");
  
  // Test normal damage without sneak attack
  const normalResult = gameManager.rollDamage({
    weaponDice: "1d6+1",
    proficiency: 1,
    isSneakAttack: false,
    allyInMelee: false
  });
  
  // Test damage with sneak attack
  const sneakResult = gameManager.rollDamage({
    weaponDice: "1d6+1",
    proficiency: 1,
    isSneakAttack: true,
    allyInMelee: false
  });
  
  // Sneak attack should add extra damage
  assert(sneakResult.total > normalResult.total);
  assert(sneakResult.sneakAttackBonus > 0);
  assert(sneakResult.sneakAttackRolls.length > 0);
});

Deno.test("Feature tier progression", () => {
  const gameManager = createGameManager("test-tier-progression");
  
  // Start at level 1
  let state = gameManager.getState();
  let sneakAttack = state.player.features.find((f: any) => f.name === "Sneak Attack");
  assertEquals(sneakAttack.tier, 1);
  assertEquals(sneakAttack.damageDice, 1);
  
  // Level up to 2
  gameManager.updatePlayer({ level: 2 });
  state = gameManager.getState();
  sneakAttack = state.player.features.find((f: any) => f.name === "Sneak Attack");
  assertEquals(sneakAttack.tier, 2);
  assertEquals(sneakAttack.damageDice, 2);
  
  // Level up to 5
  gameManager.updatePlayer({ level: 5 });
  state = gameManager.getState();
  sneakAttack = state.player.features.find((f: any) => f.name === "Sneak Attack");
  assertEquals(sneakAttack.tier, 3);
  assertEquals(sneakAttack.damageDice, 3);
  
  // Level up to 8
  gameManager.updatePlayer({ level: 8 });
  state = gameManager.getState();
  sneakAttack = state.player.features.find((f: any) => f.name === "Sneak Attack");
  assertEquals(sneakAttack.tier, 4);
  assertEquals(sneakAttack.damageDice, 4);
});

Deno.test("Inventory management", () => {
  const gameManager = createGameManager("test-inventory");
  
  // Test using a consumable item
  const state = gameManager.getState();
  const initialInventoryCount = state.player.inventory.length;
  
  // Add some stress first so we can test clearing it
  gameManager.updatePlayer({ stress: 3 });
  
  // Use stamina potion
  const result = gameManager.updateInventory({ useItem: "Minor Stamina Potion" });
  
  // Should clear some stress and remove the item
  assert(result.success);
  assert(result.changes.length > 0);
  
  const newState = gameManager.getState();
  assert(newState.player.inventory.length < initialInventoryCount);
});

Deno.test("Equipment management", () => {
  const gameManager = createGameManager("test-equipment");
  
  // Test equipping/unequipping weapons
  let result = gameManager.updateEquipment({ equipWeapon: { type: "primary" } });
  assert(result.success);
  
  result = gameManager.updateEquipment({ unequipWeapon: { type: "primary" } });
  assert(result.success);
  
  // Test armor threshold updates
  result = gameManager.updateEquipment({ updateArmorThresholds: true });
  assert(result.success);
  
  const state = gameManager.getState();
  assertEquals(state.player.thresholds.minor, 6);
  assertEquals(state.player.thresholds.major, 12);
  assertEquals(state.player.armor.max, 3);
});

Deno.test("Domain cards are properly initialized", () => {
  const gameManager = createGameManager("test-domain-cards");
  const state = gameManager.getState();
  
  // Check that domain cards are initialized
  assertEquals(state.player.domain_cards.length, 2);
  assertEquals(state.player.domain_cards[0].name, "Deft Deceiver");
  assertEquals(state.player.domain_cards[0].type, "grace");
  assertEquals(state.player.domain_cards[0].level, 1);
  assertEquals(state.player.domain_cards[1].name, "Pick and Pull");
  assertEquals(state.player.domain_cards[1].type, "midnight");
  assertEquals(state.player.domain_cards[1].level, 1);
});

Deno.test("Domain card management", () => {
  const gameManager = createGameManager("test-domain-management");
  
  // Test using a domain card (unlimited use)
  let result = gameManager.updateDomainCards({ useDomainCard: "Deft Deceiver" });
  assert(result.success);
  assert(result.changes.includes("used domain card: Deft Deceiver"));
  
  // Test that cards can be used multiple times
  result = gameManager.updateDomainCards({ useDomainCard: "Deft Deceiver" });
  assert(result.success);
  assert(result.changes.includes("used domain card: Deft Deceiver"));
  
  // Test adding a new domain card
  result = gameManager.updateDomainCards({ 
    addDomainCard: {
      name: "Test Card",
      type: "graceability",
      level: 1,
      description: "Test description"
    }
  });
  assert(result.success);
  assert(result.changes.includes("added domain card: Test Card"));
  
  const state = gameManager.getState();
  assertEquals(state.player.domain_cards.length, 3);
}); 

Deno.test("Attributes are properly initialized", () => {
  const gameManager = createGameManager("test-attributes");
  const state = gameManager.getState();
  
  // Check that attributes are initialized with default values
  assertEquals(state.player.attributes.Agility, 1);
  assertEquals(state.player.attributes.Strength, -1);
  assertEquals(state.player.attributes.Finesse, 2);
  assertEquals(state.player.attributes.Instinct, 0);
  assertEquals(state.player.attributes.Presence, 1);
  assertEquals(state.player.attributes.Knowledge, 0);
});

Deno.test("Attribute management", () => {
  const gameManager = createGameManager("test-attribute-management");
  
  // Test updating individual attributes
  let result = gameManager.updateAttributes({ Agility: 2, Strength: 0 });
  assert(result.success);
  assert(result.changes.includes("Agility: 1→2"));
  assert(result.changes.includes("Strength: -1→0"));
  
  // Test updating all attributes at once
  result = gameManager.updateAttributes({
    attributes: {
      Finesse: 3,
      Instinct: 1,
      Presence: 2,
      Knowledge: 1
    }
  });
  assert(result.success);
  assert(result.changes.includes("Finesse: 2→3"));
  assert(result.changes.includes("Instinct: 0→1"));
  assert(result.changes.includes("Presence: 1→2"));
  assert(result.changes.includes("Knowledge: 0→1"));
  
  // Verify final state
  const state = gameManager.getState();
  assertEquals(state.player.attributes.Agility, 2);
  assertEquals(state.player.attributes.Strength, 0);
  assertEquals(state.player.attributes.Finesse, 3);
  assertEquals(state.player.attributes.Instinct, 1);
  assertEquals(state.player.attributes.Presence, 2);
  assertEquals(state.player.attributes.Knowledge, 1);
});

Deno.test("Background is properly initialized", () => {
  const gameManager = createGameManager("test-background");
  const state = gameManager.getState();
  
  // Check that background is initialized with the default structure
  assertEquals(typeof state.player.background, 'object');
  assertEquals(state.player.background.motivation, "Protecting their homeland from industrial expansion that's draining the wetlands for profit");
  assertEquals(Array.isArray(state.player.background.importantRelationships), true);
  assertEquals(state.player.background.importantRelationships.length, 3);
  assertEquals(state.player.background.importantRelationships[0], "Elder Croakwise (mentor who taught them stealth)");
  assertEquals(state.player.background.secretsAndMysteries, "they're searching for an ancient frog artifact that could restore dried marshlands");
  assertEquals(state.player.background.personality, "Speaks in short, croaking sentences. Patient and observant, but quick to act when opportunity strikes. Tends to sit very still, then move explosively");
  assertEquals(state.player.background.beliefs, '"The marsh remembers everything" - believes in natural balance and that patience reveals all secrets');
  assertEquals(state.player.background.backgroundStory, "Born in the Singing Marshes, they learned stealth from hunting flies and avoiding predators. When industrial crews began draining their homeland, they turned to thievery - stealing from the companies destroying wetlands and fencing goods to fund resistance efforts.");
  assertEquals(state.player.background.worldConnections, "Part of an underground network smuggling displaced marsh creatures to safety");
});

Deno.test("Game state formatting for AI injection", () => {
  const gameManager = createGameManager("test-state-formatting");
  const state = gameManager.getState();
  
  // Test that all required state components are present and formatted correctly
  assert(typeof state.player.name === 'string');
  assert(typeof state.player.level === 'number');
  assert(typeof state.player.class === 'string');
  assert(typeof state.player.hp.current === 'number');
  assert(typeof state.player.hp.max === 'number');
  assert(typeof state.player.stress.current === 'number');
  assert(typeof state.player.stress.max === 'number');
  assert(typeof state.player.hope === 'number');
  assert(typeof state.player.armor.current === 'number');
  assert(typeof state.player.armor.max === 'number');
  assert(typeof state.player.evasion === 'number');
  
  // Test attributes
  assert(typeof state.player.attributes.Agility === 'number');
  assert(typeof state.player.attributes.Strength === 'number');
  assert(typeof state.player.attributes.Finesse === 'number');
  assert(typeof state.player.attributes.Instinct === 'number');
  assert(typeof state.player.attributes.Presence === 'number');
  assert(typeof state.player.attributes.Knowledge === 'number');
  
  // Test background structure
  assert(typeof state.player.background.motivation === 'string');
  assert(typeof state.player.background.personality === 'string');
  assert(typeof state.player.background.beliefs === 'string');
  assert(typeof state.player.background.backgroundStory === 'string');
  assert(typeof state.player.background.worldConnections === 'string');
  assert(typeof state.player.background.secretsAndMysteries === 'string');
  assert(Array.isArray(state.player.background.importantRelationships));
  
  // Test equipment
  assert(typeof state.player.equipment.weapons.primary.name === 'string');
  assert(typeof state.player.equipment.weapons.primary.damage === 'string');
  assert(typeof state.player.equipment.weapons.secondary.name === 'string');
  assert(typeof state.player.equipment.weapons.secondary.damage === 'string');
  assert(typeof state.player.equipment.armor.name === 'string');
  assert(typeof state.player.equipment.armor.armorScore === 'number');
  
  // Test features
  assert(Array.isArray(state.player.features));
  assert(state.player.features.length > 0);
  
  // Test domain cards
  assert(Array.isArray(state.player.domain_cards));
  assert(state.player.domain_cards.length > 0);
  
  // Test inventory
  assert(Array.isArray(state.player.inventory));
  assert(state.player.inventory.length > 0);
  assert(typeof state.player.gold === 'number');
  
  // Test experiences
  assert(Array.isArray(state.player.experiences));
  assert(state.player.experiences.length > 0);
  
  // Test conditions
  assert(Array.isArray(state.player.conditions));
  
  // Test GM state
  assert(typeof state.gm.fear === 'number');
  assert(typeof state.gm.hasSpotlight === 'boolean');
  
  // Test scene
  assert(typeof state.scene.currentScene === 'string');
  assert(typeof state.scene.sceneDescription === 'string');
  
  // Test that the state can be formatted without errors using the production function
  const gameStateInfo = formatGameStateForAI(state);

  // Test that the formatted string contains expected content
  assert(gameStateInfo.includes('AKTUELLER SPIELERZUSTAND'));
  assert(gameStateInfo.includes('ATTRIBUTE'));
  assert(gameStateInfo.includes('CHARAKTERHINTERGRUND'));
  assert(gameStateInfo.includes('AUSRÜSTUNG'));
  assert(gameStateInfo.includes('FÄHIGKEITEN'));
  assert(gameStateInfo.includes('DOMAIN-KARTEN'));
  assert(gameStateInfo.includes('INVENTAR'));
  assert(gameStateInfo.includes('ERFAHRUNGEN'));
  assert(gameStateInfo.includes('ZUSTÄNDE'));
  assert(gameStateInfo.includes('AKTUELLE POSITION'));
  assert(gameStateInfo.includes('GM-ZUSTAND'));
  assert(gameStateInfo.includes('SZENE'));
  
  // Test that specific values are included
  assert(gameStateInfo.includes('Rogue'));
  assert(gameStateInfo.includes('Crossbow'));
  assert(gameStateInfo.includes('Gambeson Armor'));
  assert(gameStateInfo.includes('Deft Deceiver'));
  assert(gameStateInfo.includes('Pick and Pull'));
  assert(gameStateInfo.includes('Cloaked'));
  assert(gameStateInfo.includes('Sneak Attack'));
});

Deno.test("formatGameStateForAI produces exact expected output", () => {
  const gameManager = createGameManager("test-formatting-function");
  const state = gameManager.getState();
  
  // Test the formatting function directly
  const formatted = formatGameStateForAI(state);
  
  // Expected exact output for default state
  const expectedOutput = `
**AKTUELLER SPIELERZUSTAND:**
- **Name**: Unbenannt
- **Level**: 1
- **Klasse**: Rogue
- **HP**: 6/6
- **Stress**: 0/5
- **Hoffnung**: 2
- **Rüstung**: 3/3
- **Ausweichen**: 12
- **Schwellenwerte**: Major 7, Severe 13

**ATTRIBUTE:**
- Agility: 1
- Strength: -1
- Finesse: 2
- Instinct: 0
- Presence: 1
- Knowledge: 0

**CHARAKTERHINTERGRUND:**
- **Motivation**: Protecting their homeland from industrial expansion that's draining the wetlands for profit
- **Persönlichkeit**: Speaks in short, croaking sentences. Patient and observant, but quick to act when opportunity strikes. Tends to sit very still, then move explosively
- **Glauben**: "The marsh remembers everything" - believes in natural balance and that patience reveals all secrets
- **Geschichte**: Born in the Singing Marshes, they learned stealth from hunting flies and avoiding predators. When industrial crews began draining their homeland, they turned to thievery - stealing from the companies destroying wetlands and fencing goods to fund resistance efforts.
- **Weltverbindungen**: Part of an underground network smuggling displaced marsh creatures to safety
- **Wichtige Beziehungen**: Elder Croakwise (mentor who taught them stealth), their clutch-sibling Tadwick (captured by poachers), Mama Bullseye (crime boss who gave them their first heist job)
- **Geheimnisse**: they're searching for an ancient frog artifact that could restore dried marshlands

**AUSRÜSTUNG:**
- **Primärwaffe**: Crossbow (1d6+1)
- **Sekundärwaffe**: Small Dagger (1d8)
- **Rüstung**: Gambeson Armor (3 Armor)

**FÄHIGKEITEN:**
- Cloaked: Any time you would be Hidden, you are instead Cloaked. In addition to the benefits of the Hidden condition, while Cloaked you remain unseen if you are stationary when an adversary moves to where they would normally see you. After you make an attack or end a move within line of sight of an adversary, you are no longer Cloaked.
- Sneak Attack: When you succeed on an attack while Cloaked or while an ally is within Melee range of your target, add a number of d6s equal to your tier to your damage roll.
- Shadow Stepper: You can move from shadow to shadow. When you move into an area of darkness or a shadow cast by another creature or object, you can mark a Stress to disappear from where you are and reappear inside another shadow within Far range. When you reappear, you are Cloaked.
- Low-Light Living: When you're in an area with low light or heavy shadow, you have advantage on rolls to hide, investigate, or perceive details within that area.
- Rogue's Dodge: Spend 3 Hope to gain a +2 bonus to your Evasion until the next time an attack succeeds against you. Otherwise, this bonus lasts until your next rest.

**DOMAIN-KARTEN:**
- Deft Deceiver (grace Level 1): Spend a Hope to gain advantage on a roll to deceive or trick someone into believing a lie you tell them.
- Pick and Pull (midnight Level 1): You have advantage on action rolls to pick non-magical locks, disarm mechanical traps, or steal items from a target (things like bags, pouches, or containers carried or worn by someone within Melee range).

**INVENTAR:**
- Torch: Provides light in dark areas
- 50 feet of rope: Useful for climbing and securing items
- Basic supplies: Bedroll, rations, waterskin, and other essentials
- Minor Stamina Potion: Clear 1d4 Stress
- Grappling hook: A sturdy hook and rope for scaling walls and reaching difficult places
- **Gold**: 10

**ERFAHRUNGEN:**
- Springloaded Legs
- Silent Steps

**ZUSTÄNDE:**
Keine

**AKTUELLE POSITION:**
Starting Area

**GM-ZUSTAND:**
- **Furcht**: 2
- **Spotlight**: Spieler

**SZENE:**
- **Aktuelle Szene**: Character Creation
- **Beschreibung**: Du stehst am Beginn eines neuen Abenteuers...
`;

  // Compare the exact output
  assertEquals(formatted, expectedOutput);
});

Deno.test("Background can be updated", () => {
  const gameManager = createGameManager("test-background-update");
  
  // Test updating individual background fields
  const result = gameManager.updatePlayer({
    background: {
      motivation: "New motivation",
      personality: "New personality"
    }
  });
  
  assert(result.success);
  assert(result.changes.includes("background.motivation: New motivation"));
  assert(result.changes.includes("background.personality: New personality"));
  
  // Verify the updates
  const state = gameManager.getState();
  assertEquals(state.player.background.motivation, "New motivation");
  assertEquals(state.player.background.personality, "New personality");
  
  // Verify other fields remain unchanged
  assertEquals(state.player.background.backgroundStory, "Born in the Singing Marshes, they learned stealth from hunting flies and avoiding predators. When industrial crews began draining their homeland, they turned to thievery - stealing from the companies destroying wetlands and fencing goods to fund resistance efforts.");
});

Deno.test("Attributes are used in action rolls", () => {
  const gameManager = createGameManager("test-attribute-rolls");
  
  // Set up specific attributes
  gameManager.updateAttributes({
    Agility: 2,
    Strength: -1,
    Finesse: 3
  });
  
  // Test action roll with Agility trait
  const result = gameManager.rollAction({ 
    trait: 'agility', 
    difficulty: 15 
  });
  
  // Verify attribute modifier is included
  assertEquals(result.attributeModifier, 2);
  
  // Test action roll with Strength trait
  const strengthResult = gameManager.rollAction({ 
    trait: 'strength', 
    difficulty: 15 
  });
  
  assertEquals(strengthResult.attributeModifier, -1);
  
  // Test action roll with Finesse trait
  const finesseResult = gameManager.rollAction({ 
    trait: 'finesse', 
    difficulty: 15 
  });
  
  assertEquals(finesseResult.attributeModifier, 3);
});

Deno.test("Rogue's Dodge feature mechanics", () => {
  const gameManager = createGameManager("test-rogues-dodge");
  
  // Test activating Rogue's Dodge with sufficient Hope
  gameManager.updatePlayer({ hope: 5 }); // Ensure enough Hope
  let state = gameManager.getState();
  const initialEvasion = state.player.evasion;
  const initialHope = state.player.hope;
  
  // Activate Rogue's Dodge
  const result = gameManager.updateFeatures({ activateFeature: "Rogue's Dodge" });
  assert(result.success);
  assert(result.changes.includes("feature activated: Rogue's Dodge"));
  assert(result.changes.includes("spent 3 Hope, gained +2 Evasion"));
  
  // Verify state changes
  state = gameManager.getState();
  assertEquals(state.player.evasion, initialEvasion + 2);
  assertEquals(state.player.hope, initialHope - 3);
  
  // Verify feature is active
  const roguesDodge = state.player.features.find((f: any) => f.name === "Rogue's Dodge");
  assert(roguesDodge.active);
  
  // Test that Rogue's Dodge deactivates when taking damage
  const damageResult = gameManager.dealDamageToPlayer({ damage: 10 });
  assert(damageResult.roguesDodgeDeactivated === true);
  
  // Verify evasion bonus is removed
  state = gameManager.getState();
  assertEquals(state.player.evasion, initialEvasion);
  
  // Verify feature is no longer active
  const roguesDodgeAfter = state.player.features.find((f: any) => f.name === "Rogue's Dodge");
  assert(!roguesDodgeAfter.active);
  
  // Test that Rogue's Dodge deactivates on rest
  gameManager.updatePlayer({ hope: 5 });
  gameManager.updateFeatures({ activateFeature: "Rogue's Dodge" });
  state = gameManager.getState();
  assertEquals(state.player.evasion, initialEvasion + 2);
  
  const restResult = gameManager.rest({});
  assert(restResult.success);
  assert(restResult.changes.includes("Rogue's Dodge deactivated due to rest"));
  
  state = gameManager.getState();
  assertEquals(state.player.evasion, initialEvasion);
  
  // Test insufficient Hope
  gameManager.updatePlayer({ hope: 1 });
  const insufficientResult = gameManager.updateFeatures({ activateFeature: "Rogue's Dodge" });
  assert(insufficientResult.changes.includes("insufficient Hope to activate Rogue's Dodge"));
  
  state = gameManager.getState();
  const roguesDodgeInsufficient = state.player.features.find((f: any) => f.name === "Rogue's Dodge");
  assert(!roguesDodgeInsufficient.active);
});