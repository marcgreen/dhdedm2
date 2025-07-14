// Minimal automated test for Daggerheart tools - Testing actual production code
import { createGameManager } from "./daggerheart_tools.ts";

// Simple assertions for testing
const assert = (condition: boolean, message?: string) => {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
};

const assertEquals = (actual: any, expected: any, message?: string) => {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
};

// Testing uses real dice, but validates the mechanic works correctly
// We test for proper logic flow rather than exact dice values

// Test Suite
async function runTests() {
  console.log('🧪 Running Daggerheart Tools Tests...\n');
  
  // Test 1: getState returns default game state
  {
    console.log('Test 1: getState() returns default state');
    const gameManager = createGameManager('test-session-1');
    const state = gameManager.getState();
    
    assertEquals(state.player.name, '');
    assertEquals(state.player.hp.current, 10);
    assertEquals(state.player.hope, 0);
    assertEquals(state.gm.fear, 0);
    assertEquals(state.gm.hasSpotlight, false);
    console.log('✅ PASSED\n');
  }
  
  // Test 2: updatePlayer modifies state correctly
  {
    console.log('Test 2: updatePlayer() modifies state');
    const gameManager = createGameManager('test-session-2');
    
    const result = gameManager.updatePlayer({ name: 'Hans', hope: 3, hp: 8 });
    
    assertEquals(result.success, true);
    assert(result.changes.includes('name set: Hans'));
    assert(result.changes.includes('hope: 0→3'));
    assert(result.changes.includes('hp: 10→8'));
    assertEquals(result.newState.hope, 3);
    assertEquals(result.newState.hp.current, 8);
    
    // Verify state persists
    const state = gameManager.getState();
    assertEquals(state.player.name, 'Hans');
    assertEquals(state.player.hope, 3);
    assertEquals(state.player.hp.current, 8);
    console.log('✅ PASSED\n');
  }
  
  // Test 3: rollAction mechanics work correctly
  {
    console.log('Test 3: rollAction() mechanics');
    const gameManager = createGameManager('test-session-3');
    
    const result = gameManager.rollAction({ trait: 'strength', difficulty: 10 });
    
    // Test that basic mechanics work
    assert(result.rolls.hope >= 1 && result.rolls.hope <= 12, 'Hope die should be 1-12');
    assert(result.rolls.fear >= 1 && result.rolls.fear <= 12, 'Fear die should be 1-12');
    assert(result.total >= 2 && result.total <= 24, 'Total should be reasonable');
    assert(['critSuccess', 'successHope', 'successFear', 'failureHope', 'failureFear'].includes(result.result), 'Result should be valid');
    assert(typeof result.succeeded === 'boolean', 'Succeeded should be boolean');
    assert(typeof result.spotlightToGM === 'boolean', 'SpotlightToGM should be boolean');
    
    // Test Hope/Fear generation logic
    if (result.rolls.hope === result.rolls.fear) {
      assertEquals(result.result, 'critSuccess');
      assertEquals(result.hopeGained, 1);
      assertEquals(result.fearGained, 1);
      assertEquals(result.stressCleared, 1);
    } else if (result.succeeded) {
      if (result.rolls.hope > result.rolls.fear) {
        assertEquals(result.result, 'successHope');
        assertEquals(result.hopeGained, 1);
        assertEquals(result.fearGained, 0);
        assertEquals(result.spotlightToGM, false);
      } else {
        assertEquals(result.result, 'successFear');
        assertEquals(result.hopeGained, 0);
        assertEquals(result.fearGained, 1);
        assertEquals(result.spotlightToGM, true);
      }
    } else {
      if (result.rolls.hope > result.rolls.fear) {
        assertEquals(result.result, 'failureHope');
        assertEquals(result.hopeGained, 1);
        assertEquals(result.fearGained, 0);
        assertEquals(result.spotlightToGM, true);
      } else {
        assertEquals(result.result, 'failureFear');
        assertEquals(result.hopeGained, 0);
        assertEquals(result.fearGained, 1);
        assertEquals(result.spotlightToGM, true);
      }
    }
    
    // Verify state was updated correctly
    const state = gameManager.getState();
    assertEquals(state.player.hope, result.hopeGained);
    assertEquals(state.gm.fear, result.fearGained);
    assertEquals(state.gm.hasSpotlight, result.spotlightToGM);
    console.log('✅ PASSED\n');
  }
  
  // Test 4: rollAction with modifiers
  {
    console.log('Test 4: rollAction() with modifiers');
    const gameManager = createGameManager('test-session-4');
    
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
    assert(result.modifierRoll >= 1 && result.modifierRoll <= 6, 'Advantage should generate 1-6 modifier');
    
    console.log('✅ PASSED\n');
  }
  
  // Test 5: Session isolation
  {
    console.log('Test 5: Session isolation');
    const gameManager1 = createGameManager('session-1');
    const gameManager2 = createGameManager('session-2');
    
    gameManager1.updatePlayer({ name: 'Hans', hope: 5 });
    gameManager2.updatePlayer({ name: 'Greta', hope: 2 });
    
    const state1 = gameManager1.getState();
    const state2 = gameManager2.getState();
    
    assertEquals(state1.player.name, 'Hans');
    assertEquals(state1.player.hope, 5);
    assertEquals(state2.player.name, 'Greta');
    assertEquals(state2.player.hope, 2);
    console.log('✅ PASSED\n');
  }
  
  // Test 6: Experience bonus
  {
    console.log('Test 6: Experience bonus in rollAction');
    const gameManager = createGameManager('test-session-6');
    
    // Manually set up an experience in the game state
    const state = gameManager.getState();
    state.player.experiences = [{ name: 'Dieb', used: false }];
    
    const result = gameManager.rollAction({ 
      trait: 'finesse', 
      difficulty: 15, 
      experienceBonus: 2,
      useExperience: 'Dieb'
    });
    
    // Test that experience bonus was applied
    const expectedTotal = result.rolls.hope + result.rolls.fear + 2 + result.modifierRoll;
    assertEquals(result.total, expectedTotal);
    assertEquals(result.experienceUsed, 'Dieb');
    
    // Test that experience was marked as used
    const updatedState = gameManager.getState();
    const usedExp = updatedState.player.experiences.find((e: any) => e.name === 'Dieb');
    assertEquals(usedExp.used, true);
    
    console.log('✅ PASSED\n');
  }
  
  console.log('🎉 All tests passed! Tools are working correctly.');
}

// Run tests
await runTests();

// Make this file a module
export {}; 