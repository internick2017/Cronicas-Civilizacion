<!-- frontend/src/components/mapa/ModeSelect.vue -->
<script setup>
const emit = defineEmits(['elegir-modo'])
</script>

<template>
  <div class="mode-select">
    <h1>Crónicas de Civilización</h1>
    <p class="subtitle">Elegí cómo querés jugar</p>
    <div class="mode-cards">
      <button class="mode-card" @click="emit('elegir-modo', 'narrativo')">
        <h2>📖 Modo narrativo</h2>
        <p>Historia colaborativa guiada por un narrador IA.</p>
      </button>
      <button class="mode-card" @click="emit('elegir-modo', 'mapa')">
        <h2>🗺️ Modo mapa <span class="beta">beta</span></h2>
        <p>Estrategia por turnos sobre un mapa de casillas.</p>
      </button>
    </div>
  </div>
</template>

<style scoped>
.mode-select {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  color: #ecf0f1;
  text-align: center;
  padding: 2rem;
}

.subtitle {
  color: #bdc3c7;
  margin: 0;
}

.mode-cards {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

.mode-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 2rem;
  width: 260px;
  color: #ecf0f1;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.mode-card:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #3498db;
}

.mode-card h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.2rem;
}

.mode-card p {
  margin: 0;
  color: #bdc3c7;
  font-size: 0.9rem;
}

.beta {
  font-size: 0.6rem;
  background: #e74c3c;
  padding: 2px 6px;
  border-radius: 4px;
  vertical-align: middle;
  margin-left: 4px;
}
</style>
