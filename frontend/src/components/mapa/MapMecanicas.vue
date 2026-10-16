<script setup>
// La clave es la que entiende el backend (config.mecanicas); el nombre es solo la etiqueta.
const MECANICAS = [
  { clave: 'ciencia', nombre: 'Ciencia', ayuda: 'Tecnologías, biblioteca, universidad y subir de nivel las ciudades.' },
  { clave: 'cultura', nombre: 'Cultura', ayuda: 'Rasgos culturales.' },
  { clave: 'armada', nombre: 'Buques de guerra', ayuda: 'Solo los barcos que pelean. El transporte y las tropas de tierra siguen.' },
  { clave: 'alianzas', nombre: 'Alianzas', ayuda: 'Aliarse y regalarse recursos.' },
  { clave: 'moneda', nombre: 'Moneda', ayuda: 'Nombre propio de la moneda y acuñar oro.' },
  { clave: 'capital', nombre: 'Capital', ayuda: 'La capital rinde y defiende más, y se puede mudar.' },
]

const mecanicas = defineModel({ type: Object, required: true })

const cambiar = (clave, prendida) => {
  mecanicas.value = { ...mecanicas.value, [clave]: prendida }
}
</script>

<template>
  <div class="mecanicas">
    <template v-for="m in MECANICAS" :key="m.clave">
      <label class="casilla">
        <input type="checkbox" :checked="mecanicas[m.clave]" @change="cambiar(m.clave, $event.target.checked)" />
        <span>{{ m.nombre }}</span>
      </label>
      <p class="ayuda-casilla">{{ m.ayuda }}</p>
    </template>
  </div>
</template>

<style scoped>
.casilla {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.ayuda-casilla {
  margin: 0.25rem 0 0.75rem;
  font-size: 0.8rem;
  color: #95a5a6;
}
</style>
