// Constants for game rules extracted from legacy system
// All values are balance parameters for the turn-based civilization map mode

export const TERRENOS = ['plains', 'forest', 'mountains', 'desert', 'water', 'hills'];

export const RECURSOS = ['food', 'gold', 'wood', 'stone', 'science', 'culture'];

export const RECURSOS_DE_TILE = ['food', 'gold', 'wood', 'stone'];

export const RECURSOS_INICIALES = {
  food: 100,
  gold: 50,
  wood: 80,
  stone: 30,
  science: 0,
  culture: 0
};

export const COSTO_CIUDAD = {
  food: 50,
  wood: 30,
  stone: 20
};

export const EDIFICIOS = {
  granary: {
    costo: { food: 30, wood: 20 },
    produccion: { food: 3 }
  },
  market: {
    costo: { gold: 50, wood: 30 },
    produccion: { gold: 5 }
  },
  library: {
    costo: { science: 20, stone: 40 },
    produccion: { science: 3 }
  },
  barracks: {
    costo: { gold: 40, stone: 30 },
    produccion: {}
  }
};

export const UNIDADES = {
  warrior: {
    ataque: 10,
    defensa: 8,
    salud: 100,
    movimiento: 2,
    costo: { food: 20, gold: 30, wood: 10 },
    requiereBarracks: false
  },
  archer: {
    ataque: 15,
    defensa: 5,
    salud: 80,
    movimiento: 2,
    costo: { food: 15, gold: 25, wood: 15 },
    requiereBarracks: false
  },
  spearman: {
    ataque: 12,
    defensa: 15,
    salud: 90,
    movimiento: 2,
    costo: { food: 18, gold: 20, wood: 12 },
    requiereBarracks: false
  },
  cavalry: {
    ataque: 20,
    defensa: 12,
    salud: 120,
    movimiento: 3,
    costo: { food: 25, gold: 40, wood: 5 },
    requiereBarracks: true
  },
  catapult: {
    ataque: 25,
    defensa: 3,
    salud: 60,
    movimiento: 1,
    costo: { food: 10, gold: 50, wood: 30, stone: 20 },
    requiereBarracks: true
  }
};

export const BONO_TERRENO_PRODUCCION = {
  plains: { food: 2, gold: 1 },
  forest: { wood: 3, food: 1 },
  mountains: { stone: 4, gold: 2 },
  hills: { stone: 2, gold: 1, food: 1 },
  desert: { gold: 1 },
  water: {}
};

export const BONO_TERRENO_DEFENSA = {
  mountains: 1.25,
  hills: 1.25,
  forest: 1.1
};

export const PRODUCCION_BASE_CIUDAD = {
  food: 5,
  gold: 3,
  culture: 2
};

export const PORCENTAJE_VICTORIA_DOMINACION = 0.6;

export const BONO_DEFENSA_CIUDAD = 1.5;

// Helper functions for terrain and city defense bonuses
export const bonoDefensa = (terreno) => BONO_TERRENO_DEFENSA[terreno] ?? 1.0;

export const defensaCiudad = (nivel) => 8 + 2 * nivel;
