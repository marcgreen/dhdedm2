# Daggerheart Features and Equipment System

This document describes the special features and equipment tracking system implemented for the Daggerheart game.

## Special Features

The system now tracks special character features that can come from class, background, or other sources. Features can be activated/deactivated and some have level-based progression.

### Hardcoded Starting Features

#### Cloaked
- **Description**: Any time you would be Hidden, you are instead Cloaked. In addition to the benefits of the Hidden condition, while Cloaked you remain unseen if you are stationary when an adversary moves to where they would normally see you. After you make an attack or end a move within line of sight of an adversary, you are no longer Cloaked.
- **Type**: Class feature
- **Status**: Inactive by default

#### Sneak Attack
- **Description**: When you succeed on an attack while Cloaked or while an ally is within Melee range of your target, add a number of d6s equal to your tier to your damage roll.
- **Type**: Class feature
- **Level Progression**:
  - Level 1: Tier 1 (1d6)
  - Levels 2–4: Tier 2 (2d6)
  - Levels 5–7: Tier 3 (3d6)
  - Levels 8–10: Tier 4 (4d6)

#### Shadow Stepper
- **Description**: You can move from shadow to shadow. When you move into an area of darkness or a shadow cast by another creature or object, you can mark a Stress to disappear from where you are and reappear inside another shadow within Far range. When you reappear, you are Cloaked.
- **Type**: Class feature
- **Status**: Inactive by default

#### Low-Light Living
- **Description**: When you're in an area with low light or heavy shadow, you have advantage on rolls to hide, investigate, or perceive details within that area.
- **Type**: Class feature
- **Status**: Inactive by default

## Equipment System

The system tracks weapons, armor, and inventory items with their properties and effects.

### Starting Equipment

#### Weapons
- **Primary**: Crossbow (1d6+1), Range Far, Finesse
- **Secondary**: Small Dagger (1d8), Range Melee, Finesse

#### Armor
- **Gambeson Armor**
  - Armor Score: 3
  - Minor Threshold: 6
  - Major Threshold: 12
  - Properties: Flexible (+1 to Evasion)

### Starting Inventory

1. **Torch** - Provides light in dark areas
2. **50 feet of rope** - Useful for climbing and securing items
3. **Basic supplies** - Bedroll, rations, waterskin, and other essentials
4. **Minor Stamina Potion** - Clear 1d4 Stress (consumable)
5. **Grappling hook** - A sturdy hook and rope for scaling walls and reaching difficult places
6. **10 gold** - Starting currency for purchases

## API Methods

### Feature Management

#### `updateFeatures(args)`
- `activateFeature`: Activate a specific feature
- `deactivateFeature`: Deactivate a specific feature
- `updateFeatureTiers`: Update feature tiers based on current level

### Equipment Management

#### `updateEquipment(args)`
- `equipWeapon`: Equip a weapon (primary/secondary)
- `unequipWeapon`: Unequip a weapon
- `equipArmor`: Equip armor
- `unequipArmor`: Unequip armor
- `updateArmorThresholds`: Update armor thresholds based on equipped armor

### Inventory Management

#### `updateInventory(args)`
- `addItem`: Add an item to inventory
- `removeItem`: Remove an item from inventory
- `useItem`: Use a consumable item
- `gold`: Modify gold amount

### Enhanced Damage Calculation

#### `rollDamage(args)`
The damage calculation now includes:
- Base weapon damage
- Proficiency multiplier
- Critical hit bonus
- Fear bonus (GM spending)
- **Sneak Attack bonus** (new)
  - Triggered when `isSneakAttack: true` or `allyInMelee: true`
  - Adds damage dice based on current tier
  - Automatically scales with level progression

## WebSocket Tools

The following new tools are available via WebSocket:

1. **`update_features`** - Manage character features
2. **`update_equipment`** - Manage equipment
3. **`update_inventory`** - Enhanced inventory management (merged functionality)
4. **`roll_damage`** - Updated to include Sneak Attack parameters

## Usage Examples

### Activating a Feature
```javascript
{
  "activateFeature": "Cloaked"
}
```

### Using Sneak Attack
```javascript
{
  "weaponDice": "1d6+1",
  "proficiency": 1,
  "isSneakAttack": true
}
```

### Using a Consumable Item
```javascript
{
  "useItem": "Minor Stamina Potion"
}
```

### Equipping Armor
```javascript
{
  "equipArmor": true,
  "updateArmorThresholds": true
}
```

## Level Progression

Features with level progression automatically update when the player levels up:

- **Level 2**: Sneak Attack increases to 2d6
- **Level 5**: Sneak Attack increases to 3d6  
- **Level 8**: Sneak Attack increases to 4d6

The system automatically handles tier updates and provides feedback on changes made. 