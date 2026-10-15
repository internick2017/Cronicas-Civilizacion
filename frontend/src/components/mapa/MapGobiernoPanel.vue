<!-- frontend/src/components/mapa/MapGobiernoPanel.vue -->
<script setup>
import { computed, ref } from 'vue'
import MapSubdivisiones from './MapSubdivisiones.vue'
import MapProblemas from './MapProblemas.vue'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true },
  constantes: { type: Object, required: true } // {gobiernos, gruposDeApoyo, enfriamientoVoto, ...}
})
const emit = defineEmits(['proponer', 'ventajas', 'forma', 'crearSubdivision', 'renombrarSubdivision', 'asignarCiudades', 'desasignarCiudades', 'quitarSubdivision', 'elegirCabecera', 'cerrar'])

const NOMBRE_GRUPO = { pueblo: 'Pueblo', lideres: 'Líderes', militares: 'Militares' }
const QUIEN_APRUEBA = {
  jugador: 'decidís vos',
  militares: 'hay que convencer a los militares',
  pueblo: 'hay que convencer a la mitad del pueblo',
  lideres: 'hay que convencer a la mitad de los líderes',
  mixto: 'pesan el pueblo (50%) y los líderes (50%)'
}

const yo = computed(() => props.vista.jugadores.find(j => j.id === props.jugadorId))
const gobiernos = computed(() => props.constantes.gobiernos || [])
const grupos = computed(() => props.constantes.gruposDeApoyo || [])
const oroPorPunto = computed(() => props.constantes.oroPorPuntoApoyo || 5)
const oroDisponible = computed(() => yo.value?.recursos?.gold ?? 0)
const nombreGobierno = (tipo) => gobiernos.value.find(g => g.tipo === tipo)?.nombre || tipo
const electoradoActual = computed(
  () => gobiernos.value.find(g => g.tipo === yo.value?.gobierno)?.electorado || 'jugador'
)

const hayVotacion = computed(() => electoradoActual.value !== 'jugador')
const enPoder = computed(() => yo.value?.enPoder !== false)
const bloqueadoHasta = computed(() => yo.value?.cambioBloqueadoHasta ?? 0)
const enEnfriamiento = computed(() => bloqueadoHasta.value > props.vista.turno)

// Los grupos que pueden echarte: avisa ANTES de que ocurra.
const grupoQueExpulsa = computed(() => (yo.value?.gobierno === 'estratocracia' ? 'militares' : 'lideres'))
const apoyoQueExpulsa = computed(() => yo.value?.apoyo?.[grupoQueExpulsa.value] ?? 100)
const enPeligro = computed(
  () => enPoder.value && yo.value?.gobierno !== 'despotismo' && apoyoQueExpulsa.value < 40
)

const oroOfrecido = ref(0)
const oroVentajas = ref(10)

const motivoProponer = computed(() => {
  if (!enPoder.value) return 'perdiste el poder'
  if (enEnfriamiento.value) return `podés volver a proponer en el turno ${bloqueadoHasta.value}`
  if (oroOfrecido.value > oroDisponible.value) return 'sin oro suficiente'
  return null
})
const motivoVentajas = computed(() =>
  (oroVentajas.value > oroDisponible.value ? 'sin oro suficiente' : null)
)

const proponer = (tipo) => {
  if (motivoProponer.value) return
  emit('proponer', tipo, hayVotacion.value ? Math.max(0, Math.floor(Number(oroOfrecido.value) || 0)) : 0)
}
const ventajas = (grupo) => {
  if (motivoVentajas.value) return
  emit('ventajas', grupo, Math.max(0, Math.floor(Number(oroVentajas.value) || 0)))
}
</script>

<template>
  <div v-if="yo" class="gobierno-panel">
    <section>
      <h4>Gobierno actual</h4>
      <p class="actual">{{ nombreGobierno(yo.gobierno) }}</p>
      <small>Para cambiarlo: {{ QUIEN_APRUEBA[electoradoActual] }}.</small>
      <em v-if="!enPoder" class="alerta">
        Perdiste el poder: la máquina juega tus turnos. Podés dar ventajas para ganar apoyo y recuperarlo.
      </em>
      <em v-else-if="enPeligro" class="alerta">
        {{ NOMBRE_GRUPO[grupoQueExpulsa] }} te miran raro: si el apoyo baja de 25 te echan.
      </em>
      <em v-if="enEnfriamiento && enPoder" class="aviso">
        Tu último pedido fue rechazado. Podés volver a proponer en el turno {{ bloqueadoHasta }}.
      </em>
    </section>

    <section>
      <h4>Apoyo</h4>
      <div v-for="g in grupos" :key="g" class="barra-fila">
        <span>{{ NOMBRE_GRUPO[g] }}</span>
        <div class="barra"><div class="barra-llena" :style="{ width: (yo.apoyo?.[g] ?? 0) + '%' }" /></div>
        <span class="valor">{{ yo.apoyo?.[g] ?? 0 }}</span>
      </div>
    </section>

    <section>
      <h4>Conquistar apoyo (dar ventajas)</h4>
      <small>Cada {{ oroPorPunto }} de oro suben 1 punto el apoyo de un grupo. Se queda.</small>
      <input v-model.number="oroVentajas" class="entrada-oro" type="number" min="5" step="5">
      <div class="fila-botones">
        <button
          v-for="g in grupos"
          :key="g"
          class="btn-secundario"
          :disabled="motivoVentajas !== null"
          @click="ventajas(g)"
        >
          <strong>{{ NOMBRE_GRUPO[g] }}</strong>
        </button>
      </div>
      <em v-if="motivoVentajas">{{ motivoVentajas }}</em>
    </section>

    <section>
      <h4>Proponer otro gobierno</h4>
      <template v-if="hayVotacion">
        <small>Oro para comprar votos (se pierde aunque la votación falle): tenés {{ oroDisponible }}.</small>
        <input v-model.number="oroOfrecido" class="entrada-oro" type="number" min="0" step="5">
      </template>
      <small v-else>Decidís vos: no hay votación ni oro que ofrecer.</small>
      <button
        v-for="g in gobiernos.filter(x => x.tipo !== yo.gobierno)"
        :key="g.tipo"
        class="btn-secundario"
        :disabled="motivoProponer !== null"
        @click="proponer(g.tipo)"
      >
        <strong>{{ g.nombre }}</strong>
      </button>
      <em v-if="motivoProponer">{{ motivoProponer }}</em>
    </section>

    <section>
      <h4>Forma de Estado</h4>
      <div class="fila-botones">
        <button
          class="btn-secundario"
          :class="{ activo: yo.formaEstado === 'unitario' }"
          :disabled="!enPoder || yo.formaEstado === 'unitario'"
          @click="emit('forma', 'unitario')"
        >
          <strong>Unitario</strong><small>Mandás vos en cada ciudad.</small>
        </button>
        <button
          class="btn-secundario"
          :class="{ activo: yo.formaEstado === 'federal' }"
          :disabled="!enPoder || yo.formaEstado === 'federal'"
          @click="emit('forma', 'federal')"
        >
          <strong>Federal</strong><small>Las subdivisiones se administran solas.</small>
        </button>
      </div>
    </section>

    <section v-if="yo.formaEstado === 'federal'">
      <h4>Problemas sociales</h4>
      <MapProblemas :vista="vista" :jugador-id="jugadorId" :constantes="constantes" />
    </section>

    <section v-if="yo.formaEstado === 'federal'">
      <h4>Subdivisiones</h4>
      <MapSubdivisiones
        :vista="vista"
        :jugador-id="jugadorId"
        :constantes="constantes"
        @crear="(datos) => emit('crearSubdivision', datos)"
        @renombrar="(id, nombre) => emit('renombrarSubdivision', id, nombre)"
        @asignar="(id, ciudades) => emit('asignarCiudades', id, ciudades)"
        @desasignar="(id, ciudades) => emit('desasignarCiudades', id, ciudades)"
        @quitar="(id) => emit('quitarSubdivision', id)"
        @cabecera="(id, ciudad) => emit('elegirCabecera', id, ciudad)"
      />
    </section>
  </div>
</template>

<style scoped>
.gobierno-panel { display: flex; flex-direction: column; gap: 1rem; }
h4 { margin: 0 0 0.4rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; }
section { display: flex; flex-direction: column; gap: 0.35rem; }
.actual { margin: 0; font-size: 1.1rem; font-weight: 600; }
.barra-fila { display: grid; grid-template-columns: 5.5rem 1fr 2rem; align-items: center; gap: 0.5rem; font-size: 0.8rem; }
.barra { height: 0.55rem; border-radius: 4px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }
.barra-llena { height: 100%; background: #2ecc71; }
.valor { text-align: right; opacity: 0.8; }
.fila-botones { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.entrada-oro {
  width: 6rem; padding: 0.35rem 0.5rem; border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.25); color: #ecf0f1;
}
.btn-secundario {
  background: rgba(255, 255, 255, 0.1); color: #ecf0f1;
  border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 6px;
  padding: 0.5rem 0.8rem; cursor: pointer; text-align: left;
  display: flex; flex-direction: column; gap: 0.1rem;
}
.btn-secundario:hover:not(:disabled) { background: rgba(255, 255, 255, 0.2); }
.btn-secundario:disabled { opacity: 0.45; cursor: not-allowed; }
.entrada-oro.ancha { width: 100%; box-sizing: border-box; }
.subdivision { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
.subdivision small { display: block; }
.ciudad-check { font-size: 0.8rem; display: flex; gap: 0.4rem; align-items: center; }
.btn-secundario.activo { border-color: #2ecc71; }
small { opacity: 0.7; font-size: 0.75rem; }
em { font-size: 0.72rem; font-style: normal; color: #e67e22; }
.alerta { color: #e74c3c; }
.aviso { color: #f1c40f; }
</style>
