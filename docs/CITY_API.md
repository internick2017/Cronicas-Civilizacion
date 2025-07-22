# City System API Documentation

## Overview

The City System manages city founding, development, and production in Cronicas de Civilizacion. Players can found cities, grow their population, build improvements, and manage city resources.

## City Types

| Type | Name | Population | Defense | Description |
|------|------|------------|---------|-------------|
| **Capital** | Capital | 1000 | 10 | Main city of the civilization |
| **Major** | Major City | 500 | 5 | Large urban center |
| **Minor** | Minor City | 200 | 2 | Medium settlement |
| **Settlement** | Settlement | 50 | 1 | Small village (default) |

## API Endpoints

### Base URL
```
/api/cities
```

### 1. Get Player Cities
**GET** `/:gameId/:playerId`

Get all cities owned by a specific player in a game.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "city-uuid",
      "game_id": "game-uuid",
      "owner_id": "player-uuid",
      "tile_id": "tile-uuid",
      "name": "Rome",
      "city_type": "capital",
      "population": 1000,
      "defense": 10,
      "happiness": 95,
      "culture_level": 3,
      "science_level": 2,
      "x": 10,
      "y": 15,
      "terrain": "plains",
      "resources": "wheat",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### 2. Get Specific City
**GET** `/city/:cityId`

Get detailed information about a specific city.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "city-uuid",
    "name": "Rome",
    "city_type": "capital",
    "population": 1000,
    "defense": 10,
    "happiness": 95,
    "culture_level": 3,
    "science_level": 2,
    "x": 10,
    "y": 15,
    "terrain": "plains",
    "resources": "wheat"
  }
}
```

### 3. Found New City
**POST** `/:gameId/:playerId/found`

Found a new city on a specific tile.

**Request Body:**
```json
{
  "tileId": "tile-uuid",
  "cityName": "Rome",
  "cityType": "settlement"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "city": {
      "id": "city-uuid",
      "name": "Rome",
      "city_type": "settlement",
      "population": 50,
      "defense": 1
    },
    "message": "City \"Rome\" founded successfully"
  },
  "message": "City \"Rome\" founded successfully"
}
```

**Costs:**
- Food: 50
- Wood: 30
- Stone: 20

### 4. Grow City Population
**POST** `/:cityId/grow`

Grow the population of a city (requires food).

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
    "success": true,
    "city": {
      "population": 55,
      "happiness": 95
    },
    "growth": 5,
    "message": "City population grew by 5"
  },
  "message": "City population grew by 5"
}
```

### 5. Build Improvement
**POST** `/:cityId/improvement`

Build an improvement in a city.

**Request Body:**
```json
{
  "gameId": "game-uuid",
  "playerId": "player-uuid",
  "improvementType": "farm"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "city": {
      "happiness": 100,
      "defense": 1
    },
    "improvement": "farm",
    "message": "farm built successfully"
  },
  "message": "farm built successfully"
}
```

**Improvement Types:**

| Improvement | Cost | Effects | Description |
|-------------|------|---------|-------------|
| **Farm** | Wood: 25, Stone: 15, Gold: 10 | Food: +5, Happiness: +10 | Increases food production |
| **Mine** | Wood: 25, Stone: 15, Gold: 10 | Stone: +3, Gold: +2 | Extracts resources from mountains |
| **Lumbermill** | Wood: 25, Stone: 15, Gold: 10 | Wood: +4 | Processes wood from forests |
| **Library** | Wood: 25, Stone: 15, Gold: 10 | Science: +3, Culture: +1 | Advances knowledge |
| **Temple** | Wood: 25, Stone: 15, Gold: 10 | Culture: +2, Happiness: +15 | Increases culture and happiness |
| **Barracks** | Wood: 25, Stone: 15, Gold: 10 | Defense: +5, Army: +1 | Trains military units |

### 6. Get City Production
**GET** `/:cityId/production`

Get detailed production information for a city.

**Response:**
```json
{
  "success": true,
  "data": {
    "city": {
      "name": "Rome",
      "population": 1000,
      "happiness": 95,
      "culture_level": 3,
      "science_level": 2
    },
    "production": {
      "food": 25,
      "gold": 12,
      "wood": 18,
      "stone": 8,
      "science": 6,
      "culture": 4,
      "army": 0
    },
    "population": 1000,
    "happiness": 95
  }
}
```

### 7. Get All Cities in Game
**GET** `/game/:gameId`

Get all cities in a specific game.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "city-uuid",
      "name": "Rome",
      "owner_name": "Player1",
      "civilization_name": "Romans",
      "city_type": "capital",
      "population": 1000,
      "x": 10,
      "y": 15
    }
  ]
}
```

### 8. Check if Can Found City
**POST** `/:gameId/:playerId/can-found`

Check if a player can found a city on a specific tile.

**Request Body:**
```json
{
  "tileId": "tile-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "canFound": true,
    "costs": {
      "food": 50,
      "wood": 30,
      "stone": 20
    }
  }
}
```

### 9. Update City Stats
**PUT** `/:cityId`

Update city statistics.

**Request Body:**
```json
{
  "updates": {
    "happiness": 100,
    "defense": 15
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "happiness": 100,
    "defense": 15,
    "updated_at": "2024-01-15T10:30:00Z"
  },
  "message": "City updated successfully"
}
```

### 10. Get City Types
**GET** `/types`

Get information about all city types.

**Response:**
```json
{
  "success": true,
  "data": {
    "capital": {
      "name": "Capital",
      "population": 1000,
      "defense": 10
    },
    "major": {
      "name": "Major City",
      "population": 500,
      "defense": 5
    }
  }
}
```

### 11. Get Improvement Types
**GET** `/improvements`

Get information about all improvement types.

**Response:**
```json
{
  "success": true,
  "data": {
    "farm": {
      "name": "Farm",
      "description": "Increases food production and happiness",
      "effects": {
        "food": 5,
        "happiness": 10
      }
    },
    "mine": {
      "name": "Mine",
      "description": "Extracts stone and gold from mountains",
      "effects": {
        "stone": 3,
        "gold": 2
      }
    }
  }
}
```

## City Growth Mechanics

### Population Growth
- **Growth Rate**: Based on happiness (max 10% per turn)
- **Food Cost**: 1 food per population point
- **Formula**: `newPopulation = currentPopulation * (1 + happiness/1000)`

### Happiness System
- **Base**: 100 for new cities
- **Maximum**: 100
- **Effects**: 
  - Higher happiness = faster population growth
  - Low happiness = slower growth or population decline

### City Levels
- **Culture Level**: Increases culture production
- **Science Level**: Increases science production
- **Defense**: Protects against attacks

## Production Calculation

City production is calculated as follows:

1. **Base Production**: Each city provides base production
2. **Terrain Bonuses**: Based on city location
3. **Population Bonus**: Larger cities produce more
4. **Level Bonuses**: Culture and science levels add production
5. **Improvements**: Buildings provide additional bonuses

### Formula
```
Total Production = Base + Terrain + Population + Levels + Improvements
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
- `400` - Bad Request (invalid parameters, insufficient resources)
- `404` - Not Found (city/tile not found)
- `500` - Internal Server Error (database/processing error)

## Usage Examples

### JavaScript/Node.js
```javascript
// Found a new city
const response = await fetch('/api/cities/game-123/player-456/found', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tileId: 'tile-789',
    cityName: 'Rome',
    cityType: 'settlement'
  })
});

// Build improvement
const improvement = await fetch('/api/cities/city-123/improvement', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    gameId: 'game-123',
    playerId: 'player-456',
    improvementType: 'farm'
  })
});

// Get city production
const production = await fetch('/api/cities/city-123/production');
```

### cURL
```bash
# Found city
curl -X POST http://localhost:3000/api/cities/game-123/player-456/found \
  -H "Content-Type: application/json" \
  -d '{"tileId": "tile-789", "cityName": "Rome", "cityType": "settlement"}'

# Build improvement
curl -X POST http://localhost:3000/api/cities/city-123/improvement \
  -H "Content-Type: application/json" \
  -d '{"gameId": "game-123", "playerId": "player-456", "improvementType": "farm"}'

# Get player cities
curl http://localhost:3000/api/cities/game-123/player-456
```

## Future Enhancements

- **City Specialization**: Different city types with unique bonuses
- **City Districts**: Specialized areas within cities
- **City Wonders**: Unique buildings with powerful effects
- **City Trade**: Inter-city resource exchange
- **City Events**: Random events affecting city development
- **City Siege**: Military attacks on cities
- **City Culture**: Unique cultural developments per city 