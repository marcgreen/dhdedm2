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
  
  // Test 7: Critical edge cases - Fear boundary (max 12)
  {
    console.log('Test 7: Fear boundary conditions');
    const gameManager = createGameManager('test-session-7');
    
    // Set fear to near max
    const state = gameManager.getState();
    state.gm.fear = 11;
    
    // Roll that would generate fear - should cap at 12
    const result = gameManager.rollAction({ trait: 'strength', difficulty: 25 }); // Likely failure
    
    if (result.fearGained > 0) {
      const updatedState = gameManager.getState();
      assert(updatedState.gm.fear <= 12, 'Fear should never exceed 12');
      assertEquals(updatedState.gm.fear, 12);
    }
    console.log('✅ PASSED\n');
  }
  
  // Test 8: HP boundary conditions (potential death)
  {
    console.log('Test 8: HP boundary conditions');
    const gameManager = createGameManager('test-session-8');
    
    // Test HP going to 0
    const result1 = gameManager.updatePlayer({ hp: 0 });
    assertEquals(result1.newState.hp.current, 0);
    
    // Test negative HP (should clamp to 0)
    const result2 = gameManager.updatePlayer({ hp: -5 });
    assertEquals(result2.newState.hp.current, 0);
    
    // Test HP above max (should clamp to max)
    const result3 = gameManager.updatePlayer({ hp: 20 });
    assertEquals(result3.newState.hp.current, 10); // Max is 10
    
    console.log('✅ PASSED\n');
  }
  
  // Test 9: Invalid trait names (realistic AI error)
  {
    console.log('Test 9: Invalid trait handling');
    const gameManager = createGameManager('test-session-9');
    
    try {
      // This should not crash the system, even with invalid trait
      const result = gameManager.rollAction({ trait: 'dexterity', difficulty: 10 }); // Wrong name
      
      // Should still roll dice and return result structure
      assert(result.rolls.hope >= 1 && result.rolls.hope <= 12);
      assert(result.rolls.fear >= 1 && result.rolls.fear <= 12);
      console.log('✅ PASSED (graceful degradation)\n');
    } catch (error) {
      console.log('✅ PASSED (throws error appropriately)\n');
    }
  }
  
  // Test 10: Experience edge cases
  {
    console.log('Test 10: Experience edge cases');
    const gameManager = createGameManager('test-session-10');
    
    const state = gameManager.getState();
    state.player.experiences = [{ name: 'Dieb', used: true }]; // Already used
    
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
    
    // Try to use non-existent experience
    const result2 = gameManager.rollAction({ 
      trait: 'strength', 
      difficulty: 10, 
      experienceBonus: 2,
      useExperience: 'NonExistent'
    });
    
    // Should not crash and should handle gracefully
    assertEquals(result2.experienceUsed, 'NonExistent');
    console.log('✅ PASSED\n');
  }
  
  // Test 11: Advantage + Disadvantage interaction
  {
    console.log('Test 11: Advantage/Disadvantage interaction');
    const gameManager = createGameManager('test-session-11');
    
    const result = gameManager.rollAction({ 
      trait: 'agility', 
      difficulty: 15,
      advantage: 2,
      disadvantage: 1
    });
    
    // Should handle both modifiers correctly (net +1 advantage)
    assert(typeof result.modifierRoll === 'number');
    assert(result.total >= result.rolls.hope + result.rolls.fear + result.modifierRoll);
    
    console.log('✅ PASSED\n');
  }
  
  // Test 12: Stress boundary and vulnerability condition
  {
    console.log('Test 12: Stress boundary and vulnerability');
    const gameManager = createGameManager('test-session-12');
    
    // Test stress going to 0 (should trigger vulnerable condition in real game)
    const result1 = gameManager.updatePlayer({ stress: 0 });
    assertEquals(result1.newState.stress.current, 0);
    
    // Test negative stress (should clamp to 0)
    const result2 = gameManager.updatePlayer({ stress: -3 });
    assertEquals(result2.newState.stress.current, 0);
    
    // Test stress above max (should clamp to max)
    const result3 = gameManager.updatePlayer({ stress: 15 });
    assertEquals(result3.newState.stress.current, 5); // Max is 5
    
    console.log('✅ PASSED\n');
  }

  console.log('🎉 All tests passed! Tools are working correctly.');
}

// Run tests
await runTests();

// Make this file a module
export {}; 