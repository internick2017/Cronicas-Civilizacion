# Military System API Documentation

## Overview

The Military System manages military units, combat, and warfare in Cronicas de Civilizacion. Players can create units, move them across the map, engage in combat, and conquer cities.

## Unit Types

| Unit | Attack | Defense | Health | Movement | Cost | Description |
|------|--------|---------|--------|----------|------|-------------|
| **Warrior** | 10 | 8 | 100 | 2 | Food: 20, Gold: 30, Wood: 10 | Basic infantry unit |
| **Archer** | 15 | 5 | 80 | 2 | Food: 15, Gold: 25, Wood: 15 | Ranged combat unit |
| **Cavalry** | 20 | 12 | 120 | 3 | Food: 25, Gold: 40, Wood: 5 | Fast mounted unit |
| **Spearman** | 12 | 15 | 90 | 2 | Food: 18, Gold: 20, Wood: 12 | Anti-cavalry unit |
| **Catapult** | 25 | 3 | 60 | 1 | Food: 10, Gold: 50, Wood: 30, Stone: 20 | Siege weapon |

## API Endpoints

### Base URL
```
/api/military
```

### 1. Get Player Units
**GET** `/:gameId/:playerId/units`

Get all military units owned by a specific player in a game.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "unit-uuid",
      "game_id": "game-uuid",
      "owner_id": "player-uuid",
      "tile_id": "tile-uuid",
      "unit_type": "warrior",
      "name": "Warrior",
      "attack": 10,
      "defense": 8,
      "health": 100,
      "max_health": 100,
      "movement": 2,
      "current_movement": 2,
      "experience": 50,
      "level": 1,
      "x": 10,
      "y": 15,
      "terrain": "plains",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### 2. Get Specific Unit
**GET** `/unit/:unitId`

Get detailed information about a specific military unit.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "unit-uuid",
    "name": "Warrior",
    "unit_type": "warrior",
    "attack": 10,
    "defense": 8,
    "health": 100,
    "max_health": 100,
    "movement": 2,
    "current_movement": 2,
    "experience": 50,
    "level": 1,
    "x": 10,
    "y": 15,
    "terrain": "plains"
  }
}
```

### 3. Create New Unit
**POST** `/:gameId/:playerId/create`

Create a new military unit on a specific tile.

**Request Body:**
```json
{
  "unitType": "warrior",
  "tileId": "tile-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "unit": {
      "id": "unit-uuid",
      "name": "Warrior",
      "unit_type": "warrior",
      "attack": 10,
      "defense": 8,
      "health": 100
    },
    "message": "Warrior created successfully"
  },
  "message": "Warrior created successfully"
}
```

### 4. Move Unit
**POST** `/:unitId/move`

Move a unit to a new tile.

**Request Body:**
```json
{
  "newTileId": "tile-uuid",
  "gameId": "game-uuid",
  "playerId": "player-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Unit moved successfully",
    "movementUsed": 2,
    "remainingMovement": 0
  },
  "message": "Unit moved successfully"
}
```

### 5. Attack Unit or City
**POST** `/:attackerId/attack`

Attack another unit or city.

**Request Body:**
```json
{
  "targetId": "target-uuid",
  "gameId": "game-uuid",
  "playerId": "player-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "combatResult": {
      "attackerPower": 12.5,
      "defenderPower": 8.2,
      "winner": "attacker",
      "damageMultiplier": 0.34,
      "attackerDamage": 0,
      "defenderDamage": 4.25
    },
    "message": "Attack completed: attacker won"
  },
  "message": "Attack completed: attacker won"
}
```

### 6. Reset Movement Points
**POST** `/:gameId/:playerId/reset-movement`

Reset movement points for all units (end of turn).

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Movement points reset for all units"
  },
  "message": "Movement points reset for all units"
}
```

### 7. Check if Can Create Unit
**POST** `/:gameId/:playerId/can-create`

Check if a player can create a specific unit type.

**Request Body:**
```json
{
  "unitType": "warrior"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "canCreate": true,
    "costs": {
      "food": 20,
      "gold": 30,
      "wood": 10
    }
  }
}
```

### 8. Get Unit Types
**GET** `/unit-types`

Get information about all unit types.

**Response:**
```json
{
  "success": true,
  "data": {
    "warrior": {
      "name": "Warrior",
      "attack": 10,
      "defense": 8,
      "health": 100,
      "movement": 2,
      "cost": {
        "food": 20,
        "gold": 30,
        "wood": 10
      },
      "description": "Basic infantry unit"
    },
    "archer": {
      "name": "Archer",
      "attack": 15,
      "defense": 5,
      "health": 80,
      "movement": 2,
      "cost": {
        "food": 15,
        "gold": 25,
        "wood": 15
      },
      "description": "Ranged combat unit"
    }
  }
}
```

### 9. Get Army Types
**GET** `/army-types`

Get information about army types and formations.

**Response:**
```json
{
  "success": true,
  "data": {
    "infantry": {
      "name": "Infantry Army",
      "maxUnits": 10,
      "bonus": {
        "attack": 5,
        "defense": 5
      }
    },
    "cavalry": {
      "name": "Cavalry Army",
      "maxUnits": 8,
      "bonus": {
        "attack": 8,
        "defense": 3,
        "movement": 1
      }
    }
  }
}
```

### 10. Get Military Summary
**GET** `/:gameId/:playerId/summary`

Get a summary of player's military strength.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalUnits": 5,
    "totalAttack": 85,
    "totalDefense": 65,
    "totalHealth": 450,
    "totalExperience": 250,
    "unitsByType": {
      "warrior": 2,
      "archer": 1,
      "cavalry": 1,
      "spearman": 1
    },
    "averageLevel": 2
  }
}
```

### 11. Get Units at Location
**GET** `/:gameId/location/:tileId`

Get all units at a specific location.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "unit-uuid",
      "name": "Warrior",
      "owner_name": "Player1",
      "civilization_name": "Romans",
      "unit_type": "warrior",
      "attack": 10,
      "defense": 8,
      "health": 100
    }
  ]
}
```

### 12. Upgrade Unit
**POST** `/:unitId/upgrade`

Upgrade a unit's level and stats using experience points.

**Request Body:**
```json
{
  "gameId": "game-uuid",
  "playerId": "player-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "unitId": "unit-uuid",
    "newLevel": 2,
    "newAttack": 12,
    "newDefense": 10,
    "newHealth": 120
  },
  "message": "Unit upgraded to level 2"
}
```

## Combat Mechanics

### Combat Calculation
Combat is calculated using the following formula:

1. **Base Power**: Unit's attack/defense + experience bonus
2. **Random Factor**: 0.8 to 1.2 multiplier for randomness
3. **Final Power**: Base Power × Random Factor
4. **Winner**: Higher final power wins
5. **Damage**: Based on power difference

### Experience System
- **Gain Experience**: 10 points per combat engagement
- **Level Up**: Requires level × 100 experience points
- **Benefits**: +2 attack, +2 defense, +20 max health per level

### Movement System
- **Movement Points**: Each unit has movement points per turn
- **Distance**: Manhattan distance (|x1-x2| + |y1-y2|)
- **Terrain**: Different terrains may affect movement (future feature)
- **Reset**: Movement points reset at end of turn

## Combat Types

### Unit vs Unit
- Both units take damage based on combat calculation
- Units with 0 health are destroyed
- Winner gains experience points

### Unit vs City
- Cities have higher defense (×2 multiplier)
- Successful attack captures the city
- Failed attack damages city defense
- Cities can be recaptured

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error description"
}
```

Common HTTP status codes:
- `400` - Bad Request (invalid parameters, insufficient resources, no movement points)
- `404` - Not Found (unit/tile not found)
- `500` - Internal Server Error (database/processing error)

## Usage Examples

### JavaScript/Node.js
```javascript
// Create a new unit
const response = await fetch('/api/military/game-123/player-456/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    unitType: 'warrior',
    tileId: 'tile-789'
  })
});

// Move unit
const moveResult = await fetch('/api/military/unit-123/move', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    newTileId: 'tile-456',
    gameId: 'game-123',
    playerId: 'player-456'
  })
});

// Attack enemy unit
const attackResult = await fetch('/api/military/unit-123/attack', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    targetId: 'enemy-unit-789',
    gameId: 'game-123',
    playerId: 'player-456'
  })
});
```

### cURL
```bash
# Create unit
curl -X POST http://localhost:3000/api/military/game-123/player-456/create \
  -H "Content-Type: application/json" \
  -d '{"unitType": "warrior", "tileId": "tile-789"}'

# Move unit
curl -X POST http://localhost:3000/api/military/unit-123/move \
  -H "Content-Type: application/json" \
  -d '{"newTileId": "tile-456", "gameId": "game-123", "playerId": "player-456"}'

# Attack enemy
curl -X POST http://localhost:3000/api/military/unit-123/attack \
  -H "Content-Type: application/json" \
  -d '{"targetId": "enemy-unit-789", "gameId": "game-123", "playerId": "player-456"}'

# Get military summary
curl http://localhost:3000/api/military/game-123/player-456/summary
```

## Strategic Tips

### Unit Composition
- **Balanced Army**: Mix of different unit types
- **Specialized Forces**: Focus on specific unit types for different strategies
- **Experience**: Keep units alive to gain experience and level up

### Combat Strategy
- **Terrain Advantage**: Use terrain bonuses (future feature)
- **Unit Counters**: Spearmen vs Cavalry, Archers vs Infantry
- **City Siege**: Use Catapults for attacking cities
- **Movement**: Plan movement carefully, units can't move after attacking

### Resource Management
- **Unit Costs**: Balance unit creation with resource production
- **Maintenance**: Consider ongoing costs (future feature)
- **Upgrades**: Save experience for unit upgrades

## Future Enhancements

- **Terrain Effects**: Different movement costs and combat bonuses
- **Unit Special Abilities**: Unique abilities for each unit type
- **Formations**: Army formations with bonuses
- **Supply Lines**: Unit maintenance and supply requirements
- **Naval Units**: Ships and naval combat
- **Siege Weapons**: More advanced siege equipment
- **Unit Morale**: Morale system affecting combat performance
- **Military Alliances**: Cooperative military actions 