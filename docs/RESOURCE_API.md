# Resource System API Documentation

## Overview

The Resource System manages player resources, economy, and production in Cronicas de Civilizacion. It handles 7 different resource types with production calculations based on cities, terrain, and improvements.

## Resource Types

| Resource | Description | Base Production |
|----------|-------------|-----------------|
| **Food** | Essential for population growth | 10 per city |
| **Gold** | Currency for trade and construction | 5 per city |
| **Wood** | Building material | 8 per city |
| **Stone** | Advanced building material | 3 per city |
| **Science** | Research and technology | 2 per city |
| **Culture** | Civilization development | 1 per city |
| **Army** | Military strength | 0 per city |

## API Endpoints

### Base URL
```
/api/resources
```

### 1. Get Player Resources
**GET** `/:gameId/:playerId`

Get current resources for a specific player in a game.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "game_id": "game-uuid",
    "player_id": "player-uuid",
    "food": 150,
    "gold": 75,
    "wood": 120,
    "stone": 45,
    "science": 10,
    "culture": 5,
    "army": 2,
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
```

### 2. Get Resource Production
**GET** `/:gameId/:playerId/production`

Calculate resource production for a player based on their cities and terrain.

**Response:**
```json
{
  "success": true,
  "data": {
    "food": 25,
    "gold": 12,
    "wood": 18,
    "stone": 8,
    "science": 4,
    "culture": 2,
    "army": 0
  }
}
```

### 3. Process Turn Resources
**POST** `/:gameId/:playerId/process-turn`

Process end-of-turn resource generation and add production to player resources.

**Response:**
```json
{
  "success": true,
  "data": {
    "resources": {
      "food": 175,
      "gold": 87,
      "wood": 138,
      "stone": 53,
      "science": 14,
      "culture": 7,
      "army": 2
    },
    "production": {
      "food": 25,
      "gold": 12,
      "wood": 18,
      "stone": 8,
      "science": 4,
      "culture": 2,
      "army": 0
    }
  },
  "message": "Turn resources processed successfully"
}
```

### 4. Update Player Resources
**PUT** `/:gameId/:playerId`

Update specific resource values for a player.

**Request Body:**
```json
{
  "resources": {
    "food": 200,
    "gold": 100,
    "wood": 150
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "food": 200,
    "gold": 100,
    "wood": 150,
    "stone": 45,
    "science": 10,
    "culture": 5,
    "army": 2
  },
  "message": "Resources updated successfully"
}
```

### 5. Add Resources to Player
**POST** `/:gameId/:playerId/add`

Add (or subtract) resources from a player's current amounts.

**Request Body:**
```json
{
  "resources": {
    "food": 50,
    "gold": -10,
    "wood": 25
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "food": 250,
    "gold": 90,
    "wood": 175,
    "stone": 45,
    "science": 10,
    "culture": 5,
    "army": 2
  },
  "message": "Resources added successfully"
}
```

### 6. Check Resource Requirements
**POST** `/:gameId/:playerId/check`

Check if a player has enough resources for a specific action.

**Request Body:**
```json
{
  "requiredResources": {
    "food": 50,
    "wood": 30,
    "stone": 20
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "hasEnough": true
  },
  "message": "Player has enough resources"
}
```

### 7. Get Action Costs
**GET** `/action-costs`

Get the resource costs for different game actions.

**Response:**
```json
{
  "success": true,
  "data": {
    "foundCity": {
      "food": 50,
      "wood": 30,
      "stone": 20
    },
    "buildArmy": {
      "food": 20,
      "gold": 30,
      "wood": 10
    },
    "research": {
      "science": 10,
      "gold": 20
    },
    "buildImprovement": {
      "wood": 25,
      "stone": 15,
      "gold": 10
    }
  }
}
```

### 8. Get Resource Types
**GET** `/types`

Get information about all resource types.

**Response:**
```json
{
  "success": true,
  "data": {
    "food": {
      "name": "Food",
      "description": "Essential for population growth",
      "baseProduction": 10
    },
    "gold": {
      "name": "Gold",
      "description": "Currency for trade and construction",
      "baseProduction": 5
    }
  }
}
```

## Terrain Bonuses

Different terrain types provide bonuses to resource production:

| Terrain | Bonuses |
|---------|---------|
| **Plains** | +2 Food, +1 Gold |
| **Forest** | +3 Wood, +1 Food |
| **Mountains** | +4 Stone, +2 Gold |
| **Hills** | +2 Stone, +1 Gold, +1 Food |
| **Desert** | +1 Gold |
| **Tundra** | +1 Food |
| **Grassland** | +3 Food, +1 Gold |
| **Jungle** | +2 Wood, +2 Food |
| **Coast** | +2 Gold, +1 Food |
| **Ocean** | +1 Food |

## Production Calculation

Resource production is calculated as follows:

1. **Base Production**: Each city provides base production for all resources
2. **Terrain Bonus**: Cities on specific terrain get additional bonuses
3. **Population Bonus**: Larger cities provide additional food and gold
4. **Improvements**: Future feature for buildings that boost production

### Formula
```
Total Production = Base Production + Terrain Bonuses + Population Bonuses + Improvements
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error description"
}
```

Common HTTP status codes:
- `400` - Bad Request (invalid parameters)
- `404` - Not Found (player/game not found)
- `500` - Internal Server Error (database/processing error)

## Usage Examples

### JavaScript/Node.js
```javascript
// Get player resources
const response = await fetch('/api/resources/game-123/player-456');
const resources = await response.json();

// Process turn resources
const turnResult = await fetch('/api/resources/game-123/player-456/process-turn', {
  method: 'POST'
});

// Check if player can found a city
const canFoundCity = await fetch('/api/resources/game-123/player-456/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    requiredResources: { food: 50, wood: 30, stone: 20 }
  })
});
```

### cURL
```bash
# Get resources
curl http://localhost:3000/api/resources/game-123/player-456

# Process turn
curl -X POST http://localhost:3000/api/resources/game-123/player-456/process-turn

# Add resources
curl -X POST http://localhost:3000/api/resources/game-123/player-456/add \
  -H "Content-Type: application/json" \
  -d '{"resources": {"food": 50, "gold": 25}}'
```

## Future Enhancements

- **Improvements System**: Buildings that boost resource production
- **Trade System**: Exchange resources between players
- **Resource Storage**: Limits on how much resources can be stored
- **Resource Decay**: Some resources decrease over time
- **Special Resources**: Rare resources with unique properties 