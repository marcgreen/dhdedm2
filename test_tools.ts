// Minimal automated test for Daggerheart tools - Testing actual production code
import { createGameManager } from "./daggerheart_tools.ts";

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
const DEFAULT_HP = 10;
const DEFAULT_STRESS = 5;
const MAX_FEAR = 12;

// Helper to create isolated test session
const createTestManager = () => createGameManager(`test-${crypto.randomUUID()}`);

Deno.test("getState returns default state", () => {
  const gameManager = createTestManager();
  const state = gameManager.getState();
  
  assertEquals(state.player.name, '');
  assertEquals(state.player.hp.current, DEFAULT_HP);
  assertEquals(state.player.hope, 0);
  assertEquals(state.gm.fear, 0);
  assertEquals(state.gm.hasSpotlight, false);
});

Deno.test("updatePlayer modifies state correctly", () => {
  const gameManager = createTestManager();
  
  const result = gameManager.updatePlayer({ name: 'Hans', hope: 3, hp: 8 });
  
  assertEquals(result.success, true);
  assertEquals(result.newState.hope, 3);
  assertEquals(result.newState.hp.current, 8);
  
  // Verify state persists
  const state = gameManager.getState();
  assertEquals(state.player.name, 'Hans');
  assertEquals(state.player.hope, 3);
  assertEquals(state.player.hp.current, 8);
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
  assertEquals(state.player.hope, result.hopeGained);
  assertEquals(state.gm.fear, result.fearGained);
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
  const expectedBase = result.rolls.hope + result.rolls.fear + 3 + 2 + result.modifierRoll;
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