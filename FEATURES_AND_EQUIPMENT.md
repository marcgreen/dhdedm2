# Daggerheart Features and Equipment System

This document describes the special features and equipment tracking system implemented for the Daggerheart game.

## Character Attributes

The system tracks six core character attributes that affect various game mechanics:

### Default Starting Attributes
- **Agility**: +1
- **Strength**: -1  
- **Finesse**: +2
- **Instinct**: +0
- **Presence**: +1
- **Knowledge**: +0

These attributes can be modified through character advancement, equipment, or other game effects.

### Attribute Usage in Action Rolls

When making action rolls, the corresponding attribute modifier is automatically added to the roll total. For example:
- A roll using the `agility` trait will add the Agility attribute modifier (+1 by default)
- A roll using the `strength` trait will add the Strength attribute modifier (-1 by default)
- A roll using the `finesse` trait will add the Finesse attribute modifier (+2 by default)

The attribute modifier is included in the final roll calculation along with other modifiers like experience bonuses and advantage/disadvantage.

## Character Background

The system now includes a detailed character background with the following components:

### Default Background: Marsh Dweller

**Motivation**: Protecting their homeland from industrial expansion that's draining the wetlands for profit

**Important Relationships**:
- Elder Croakwise (mentor who taught them stealth)
- their clutch-sibling Tadwick (captured by poachers)
- Mama Bullseye (crime boss who gave them their first heist job)

**Secrets & Mysteries**: they're searching for an ancient frog artifact that could restore dried marshlands

**Personality**: Speaks in short, croaking sentences. Patient and observant, but quick to act when opportunity strikes. Tends to sit very still, then move explosively

**Beliefs**: "The marsh remembers everything" - believes in natural balance and that patience reveals all secrets

**Background Story**: Born in the Singing Marshes, they learned stealth from hunting flies and avoiding predators. When industrial crews began draining their homeland, they turned to thievery - stealing from the companies destroying wetlands and fencing goods to fund resistance efforts.

**World Connections**: Part of an underground network smuggling displaced marsh creatures to safety

## Special Features

The system now tracks special character features that can come from class, background, or other sources. Features can be activated/deactivated and some have level-based progression.

## Domain Cards

Domain cards are special abilities that represent the character's connection to different domains of power. They can be used unlimited times as the player desires.

### Starting Domain Cards

#### Deft Deceiver (graceability Level 1)
- **Description**: Spend a Hope to gain advantage on a roll to deceive or trick someone into believing a lie you tell them.
- **Type**: graceability
- **Level**: 1

#### Pick and Pull (midnightability Level 1)
- **Description**: You have advantage on action rolls to pick non-magical locks, disarm mechanical traps, or steal items from a target (things like bags, pouches, or containers carried or worn by someone within Melee range).
- **Type**: midnightability
- **Level**: 1

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

### Attribute Management

#### `updateAttributes(args)`
- Individual attributes: `Agility`, `Strength`, `Finesse`, `Instinct`, `Presence`, `Knowledge`
- `attributes`: Update all attributes at once with an object containing the new values

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

### Domain Card Management

#### `updateDomainCards(args)`
- `useDomainCard`: Use a specific domain card (unlimited use)
- `addDomainCard`: Add a new domain card
- `removeDomainCard`: Remove a domain card

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

1. **`update_attributes`** - Manage character attributes
2. **`update_features`** - Manage character features
3. **`update_equipment`** - Manage equipment
4. **`update_inventory`** - Enhanced inventory management (merged functionality)
5. **`update_domain_cards`** - Manage domain cards
6. **`roll_damage`** - Updated to include Sneak Attack parameters

## AI DM Integration

The AI DM now receives the complete player state information at the start of each session, including:

- **Character Stats**: HP, Stress, Hope, Armor, Evasion, Thresholds
- **Attributes**: All six core attributes with their current values
- **Background**: Complete character background with motivation, personality, beliefs, and relationships
- **Equipment**: Current weapons, armor, and their properties
- **Features**: All character features and their descriptions
- **Domain Cards**: Available domain cards and their effects
- **Inventory**: All items, gold, and consumables
- **Experiences**: Available experiences and their usage status
- **Conditions**: Current character conditions
- **Location**: Current position and scene information
- **GM State**: Current Fear level and spotlight status

This ensures the AI DM has full context about the player's character and can make informed decisions that are appropriate to the character's background, abilities, and current situation.

### Game State Formatting

The game state formatting logic has been extracted into a reusable `formatGameStateForAI()` function that:

- **Produces consistent output**: The exact same formatting is used in both production and tests
- **Handles all data types**: Properly formats strings, numbers, arrays, and objects
- **Includes comprehensive testing**: Exact string matching ensures the AI receives the expected format
- **Maintains backward compatibility**: Works with both string-based and object-based experiences

This ensures that what the AI DM receives is exactly what we test for, providing confidence in the integration.

## Usage Examples

### Updating Individual Attributes
```javascript
{
  "Agility": 2,
  "Strength": 0
}
```

### Updating All Attributes
```javascript
{
  "attributes": {
    "Agility": 2,
    "Strength": 0,
    "Finesse": 3,
    "Instinct": 1,
    "Presence": 2,
    "Knowledge": 1
  }
}
```

### Updating Background Fields
```javascript
{
  "background": {
    "motivation": "New motivation",
    "personality": "New personality",
    "importantRelationships": ["New relationship 1", "New relationship 2"]
  }
}
```

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

### Using a Domain Card
```javascript
{
  "useDomainCard": "Deft Deceiver"
}
```

### Action Roll with Attribute Modifier
```javascript
{
  "trait": "agility",
  "difficulty": 15,
  "modifier": 2
}
```
This roll will automatically include the Agility attribute modifier (+1 by default) in the total calculation.



## Level Progression

Features with level progression automatically update when the player levels up:

- **Level 2**: Sneak Attack increases to 2d6
- **Level 5**: Sneak Attack increases to 3d6  
- **Level 8**: Sneak Attack increases to 4d6

The system automatically handles tier updates and provides feedback on changes made. 