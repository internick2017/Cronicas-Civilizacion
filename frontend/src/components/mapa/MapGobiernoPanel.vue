<!-- frontend/src/components/mapa/MapGobiernoPanel.vue -->
<script setup>
import { computed, ref, watch } from 'vue'
import MapSubdivisiones from './MapSubdivisiones.vue'
import MapProblemas from './MapProblemas.vue'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true },
  constantes: { type: Object, required: true } // {gobiernos, gruposDeApoyo, enfriamientoVoto, ...}
})
const emit = defineEmits(['proponer', 'ventajas', 'forma', 'crearSubdivision', 'renombrarSubdivision', 'asignarCiudades', 'desasignarCiudades', 'quitarSubdivision', 'elegirCabecera', 'nombrarMoneda', 'acunar', 'nombrarGobierno', 'impuestos', 'mandato', 'cerrar'])

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
// El gobierno actual puede ser una combinacion ('monarquia+parlamentarismo'): se nombra pieza por pieza.
const nombreCompuesto = (clave) => (clave || '').split('+').filter(Boolean).map(nombreGobierno).join(' + ')
const electoradoActual = computed(() => perfil.value.electorado || 'jugador')

const hayVotacion = computed(() => electoradoActual.value !== 'jugador')
const enPoder = computed(() => yo.value?.enPoder !== false)
const bloqueadoHasta = computed(() => yo.value?.cambioBloqueadoHasta ?? 0)
const enEnfriamiento = computed(() => bloqueadoHasta.value > props.vista.turno)

// Lo que importa del gobierno actual lo calcula el servidor (perfilGobierno) mezclando
// todas sus piezas: aca solo se lee.
const perfil = computed(() => yo.value?.perfilGobierno || {})
const grupoQueExpulsa = computed(() => perfil.value.sostenidoPor || 'lideres')
const apoyoQueExpulsa = computed(() => yo.value?.apoyo?.[grupoQueExpulsa.value] ?? 100)
const enPeligro = computed(
  () => enPoder.value && !perfil.value.inmortal && apoyoQueExpulsa.value < 40
)

// --- Gobierno combinable: una pieza por eje (Forma, Sistema, Regimen) o ninguna.
// Las piezas que se contradicen no se pueden elegir juntas (el servidor tambien lo valida).
const NOMBRE_EJE = { forma: 'Forma de jefatura', sistema: 'Sistema', regimen: 'Régimen' }
const ejes = computed(() => Object.entries(props.constantes.ejesGobierno || {}).map(([eje, piezas]) => ({
  eje, nombre: NOMBRE_EJE[eje] || eje, piezas
})))
const piezasActuales = () => (yo.value?.gobierno || '').split('+').filter(Boolean)
// Arranca en el gobierno actual: se cambia lo que se quiera de el.
const elegidas = ref({})
const iniciarElegidas = () => {
  const actuales = piezasActuales()
  elegidas.value = Object.fromEntries(ejes.value.map(({ eje, piezas }) => [eje, piezas.find(p => actuales.includes(p)) || '']))
}
iniciarElegidas()
watch(() => yo.value?.gobierno, iniciarElegidas)

const piezasElegidas = computed(() => ejes.value.map(({ eje }) => elegidas.value[eje]).filter(Boolean))
const claveElegida = computed(() => piezasElegidas.value.join('+'))
const incompatibles = computed(() => props.constantes.gobiernosIncompatibles || [])
// La pieza choca con alguna de las ya elegidas en OTRO eje.
const choca = (pieza, eje) => piezasElegidas.value.some(
  o => o !== elegidas.value[eje] && incompatibles.value.some(([a, b]) => (a === pieza && b === o) || (b === pieza && a === o)))
const contradiccion = computed(() => {
  const p = piezasElegidas.value
  const par = incompatibles.value.find(([a, b]) => p.includes(a) && p.includes(b))
  return par ? `${nombreGobierno(par[0])} y ${nombreGobierno(par[1])} se contradicen` : null
})
const nombreElegido = computed(() => piezasElegidas.value.map(nombreGobierno).join(' + '))
const esElActual = computed(() => claveElegida.value === (yo.value?.gobierno || ''))
const electoradoElegido = computed(() => {
  const orden = [...ejes.value].reverse() // regimen, sistema, forma
  for (const { eje } of orden) {
    const e = gobiernos.value.find(g => g.tipo === elegidas.value[eje])?.electorado
    if (e && e !== 'jugador') return e
  }
  return 'jugador'
})

const NOMBRE_RECURSO = { food: 'comida', gold: 'oro', wood: 'madera', stone: 'piedra', science: 'ciencia', culture: 'cultura' }
const sumarPorPieza = (tabla) => piezasElegidas.value.reduce((acc, p) => {
  for (const [k, v] of Object.entries(tabla?.[p] || {})) acc[k] = (acc[k] ?? 0) + v
  return acc
}, {})
const efectosElegido = computed(() => {
  if (!piezasElegidas.value.length) return ''
  const bonos = sumarPorPieza(props.constantes.bonosProduccionGobierno)
  if (piezasElegidas.value.some(p => p.startsWith('republica_'))) {
    bonos.todo = (bonos.todo ?? 0) + (props.constantes.bonoProduccionRepublica || 0)
  }
  const partes = Object.entries(bonos).map(([r, f]) => `+${Math.round(f * 100)}% de ${r === 'todo' ? 'todo' : NOMBRE_RECURSO[r] || r}`)
  const respeto = Object.entries(sumarPorPieza(props.constantes.respetoGobierno))
    .filter(([, n]) => n !== 0)
    .map(([g, n]) => `${n > 0 ? '+' : ''}${n} respeto de ${NOMBRE_GRUPO[g].toLowerCase()}`)
  const poderes = [...new Set(piezasElegidas.value.flatMap(p => poderesSeparadosDe(p)))]
    .map(p => `${NOMBRE_PODER[p]} independiente`)
  return [...partes, ...respeto, ...poderes].join(', ') || 'Sin bonos.'
})

// --- Separacion de poderes: el Ejecutivo siempre es tuyo; los otros tres son
// independientes o no segun el gobierno, y cada uno separado da un efecto.
const NOMBRE_PODER = { legislativo: 'Legislativo', judiciario: 'Judiciario', moderador: 'Moderador' }
const EXPLICACION_PODER = (poder) => {
  const e = props.constantes.efectosPoderes?.[poder] || {}
  if (poder === 'legislativo') return `+${e.apoyoPueblo ?? 0} de apoyo del pueblo por ronda`
  if (poder === 'judiciario') return `${Math.round((1 - (e.crisis ?? 1)) * 100)}% menos de probabilidad de crisis`
  return `te echan recién con el apoyo bajo ${(props.constantes.umbralesGobierno?.expulsion ?? 25) + (e.expulsion ?? 0)}`
}
const poderesSeparadosDe = (tipo) => props.constantes.poderesGobierno?.[tipo] || []
const poderesDelGobierno = computed(() => {
  const separados = perfil.value.poderes || []
  return (props.constantes.poderes || []).map(p => ({
    poder: p, nombre: NOMBRE_PODER[p] || p, separado: separados.includes(p), efecto: EXPLICACION_PODER(p)
  }))
})
const umbralExpulsionActual = computed(() => {
  const base = props.constantes.umbralesGobierno?.expulsion ?? 25
  return base + ((perfil.value.poderes || []).includes('moderador')
    ? (props.constantes.efectosPoderes?.moderador?.expulsion ?? 0) : 0)
})

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

// --- Nombre propio, impuestos y mandato ---
const nombreDelGobierno = computed(() => yo.value?.nombreGobierno || nombreCompuesto(yo.value?.gobierno))
const largoNombreGobierno = computed(() => props.constantes.largoNombreGobierno || 40)
const nombreGobiernoNuevo = ref(yo.value?.nombreGobierno ?? '')
// Vacio vuelve al nombre del tipo de gobierno.
const nombrarGobierno = () => emit('nombrarGobierno', nombreGobiernoNuevo.value.trim())

const NIVELES_IMPUESTOS = { bajos: 'Bajos', normales: 'Normales', altos: 'Altos' }
const impuestos = computed(() => props.constantes.impuestos || {})
const efectoImpuestos = (nivel) => {
  const { oro = 0, apoyoPueblo = 0 } = impuestos.value[nivel] || {}
  if (!oro && !apoyoPueblo) return 'sin efecto'
  const signo = (n) => (n > 0 ? `+${n}` : `${n}`)
  return `${signo(Math.round(oro * 100))}% de oro, ${signo(apoyoPueblo)} de apoyo del pueblo por ronda`
}

const esRepublica = computed(() => perfil.value.republica === true)
const limitesMandato = computed(() => props.constantes.limitesMandato || { min: 2, max: 50 })
const mandatoNuevo = ref(yo.value?.mandato ?? 8)
const motivoMandato = computed(() => {
  const r = Number(mandatoNuevo.value)
  if (!Number.isInteger(r) || r < limitesMandato.value.min || r > limitesMandato.value.max) {
    return `de ${limitesMandato.value.min} a ${limitesMandato.value.max} rondas`
  }
  return null
})
const fijarMandato = () => {
  if (!motivoMandato.value) emit('mandato', Number(mandatoNuevo.value))
}

// Sin la mecanica Gobierno el panel muestra solo la moneda (si esa sigue prendida).
const hayGobierno = computed(() => props.vista.reglas?.gobierno !== false)

// --- Moneda: el nombre es gratis y sin turno; acuñar da oro a cambio de inflacion ---
const reglasMoneda = computed(() => props.constantes.moneda || { largoNombre: 20, largoSimbolo: 3 })
const acunacion = computed(() => props.constantes.acunacion || null)
const nombreMoneda = ref(yo.value?.moneda?.nombre ?? '')
const simboloMoneda = ref(yo.value?.moneda?.simbolo ?? '')
const puedeNombrarMoneda = computed(() => nombreMoneda.value.trim() !== '' && simboloMoneda.value.trim() !== '')
const nombrarMoneda = () => {
  if (puedeNombrarMoneda.value) emit('nombrarMoneda', nombreMoneda.value.trim(), simboloMoneda.value.trim())
}
const oroAcunar = ref(10)
const inflacionAcunada = computed(() => yo.value?.inflacionAcunada ?? 0)
const quedaAcunar = computed(() => (acunacion.value?.maximoPorRonda ?? 0) - (yo.value?.acunadoEstaRonda ?? 0))
const inflacionTras = computed(() => Math.round(
  (inflacionAcunada.value + (Number(oroAcunar.value) || 0) * (acunacion.value?.puntosPorOro ?? 0)) * 100) / 100)
const motivoAcunar = computed(() => {
  const oro = Number(oroAcunar.value)
  if (!Number.isInteger(oro) || oro < 1) return 'elegí cuánto oro acuñar'
  if (oro > quedaAcunar.value) return `esta ronda podés acuñar hasta ${quedaAcunar.value}`
  if (inflacionTras.value > (acunacion.value?.techo ?? 100) + 1e-9) return 'pasaría el techo de inflación'
  return null
})
const acunar = () => {
  if (!motivoAcunar.value) emit('acunar', Number(oroAcunar.value))
}

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
    <section v-if="hayGobierno">
      <h4>Gobierno actual</h4>
      <p class="actual">{{ nombreDelGobierno }}</p>
      <small v-if="yo.nombreGobierno">{{ nombreCompuesto(yo.gobierno) }}</small>
      <div class="fila-botones">
        <input
          v-model="nombreGobiernoNuevo"
          class="entrada-oro ancha-media"
          :maxlength="largoNombreGobierno"
          placeholder="Nombre propio (vacío: el del tipo)"
          @keyup.enter="nombrarGobierno"
        >
        <button class="btn-secundario" @click="nombrarGobierno"><strong>Nombrar</strong></button>
      </div>
      <small>Para cambiarlo: {{ QUIEN_APRUEBA[electoradoActual] }}.</small>
      <em v-if="!enPoder" class="alerta">
        Perdiste el poder: la máquina juega tus turnos. Podés dar ventajas para ganar apoyo y recuperarlo.
      </em>
      <em v-else-if="enPeligro" class="alerta">
        {{ NOMBRE_GRUPO[grupoQueExpulsa] }} te miran raro: si el apoyo baja de {{ umbralExpulsionActual }} te echan.
      </em>
      <em v-if="enEnfriamiento && enPoder" class="aviso">
        Tu último pedido fue rechazado. Podés volver a proponer en el turno {{ bloqueadoHasta }}.
      </em>
    </section>

    <section v-if="hayGobierno && poderesDelGobierno.length">
      <h4>Poderes</h4>
      <small>Ejecutivo: decidís vos.</small>
      <small v-for="p in poderesDelGobierno" :key="p.poder">
        {{ p.nombre }}: {{ p.separado ? `independiente (${p.efecto})` : 'concentrado en quien manda' }}
      </small>
    </section>

    <section v-if="hayGobierno">
      <h4>Apoyo</h4>
      <div v-for="g in grupos" :key="g" class="barra-fila">
        <span>{{ NOMBRE_GRUPO[g] }}</span>
        <div class="barra"><div class="barra-llena" :style="{ width: (yo.apoyo?.[g] ?? 0) + '%' }" /></div>
        <span class="valor">{{ yo.apoyo?.[g] ?? 0 }}</span>
      </div>
    </section>

    <section v-if="hayGobierno">
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

    <section v-if="hayGobierno">
      <h4>Proponer otro gobierno</h4>
      <template v-if="hayVotacion">
        <small>Oro para comprar votos (se pierde aunque la votación falle): tenés {{ oroDisponible }}.</small>
        <input v-model.number="oroOfrecido" class="entrada-oro" type="number" min="0" step="5">
      </template>
      <small v-else>Decidís vos: no hay votación ni oro que ofrecer.</small>
      <small>Un gobierno combina una pieza de cada eje; las que se contradicen no se pueden juntar.</small>
      <label v-for="e in ejes" :key="e.eje" class="eje-gobierno">
        <span>{{ e.nombre }}</span>
        <select v-model="elegidas[e.eje]" class="selector-gobierno">
          <option value="">Ninguna</option>
          <option v-for="p in e.piezas" :key="p" :value="p" :disabled="choca(p, e.eje)">
            {{ nombreGobierno(p) }}{{ choca(p, e.eje) ? ' (se contradice)' : '' }}
          </option>
        </select>
      </label>
      <div v-if="piezasElegidas.length" class="detalle-gobierno">
        <strong>{{ nombreElegido }}</strong>
        <small>Para cambiarlo después: {{ QUIEN_APRUEBA[electoradoElegido] }}.</small>
        <small>{{ efectosElegido }}</small>
      </div>
      <button
        class="btn-secundario"
        :disabled="motivoProponer !== null || !piezasElegidas.length || esElActual || contradiccion !== null"
        @click="proponer(claveElegida)"
      >
        <strong>Proponer {{ nombreElegido }}</strong>
      </button>
      <em v-if="contradiccion">{{ contradiccion }}</em>
      <em v-else-if="esElActual && piezasElegidas.length">es tu gobierno actual</em>
      <em v-if="motivoProponer">{{ motivoProponer }}</em>
    </section>

    <section v-if="hayGobierno && Object.keys(impuestos).length">
      <h4>Impuestos</h4>
      <div class="fila-botones">
        <button
          v-for="(etiqueta, nivel) in NIVELES_IMPUESTOS"
          :key="nivel"
          class="btn-secundario"
          :class="{ activo: (yo.impuestos || 'normales') === nivel }"
          :disabled="!enPoder || (yo.impuestos || 'normales') === nivel"
          @click="emit('impuestos', nivel)"
        >
          <strong>{{ etiqueta }}</strong><small>{{ efectoImpuestos(nivel) }}</small>
        </button>
      </div>
    </section>

    <section v-if="hayGobierno && esRepublica">
      <h4>Mandato</h4>
      <small>Hay elecciones cada {{ yo.mandato }} rondas.</small>
      <div class="fila-botones">
        <input
          v-model.number="mandatoNuevo"
          class="entrada-oro"
          type="number"
          :min="limitesMandato.min"
          :max="limitesMandato.max"
        >
        <button class="btn-secundario" :disabled="!enPoder || motivoMandato !== null" @click="fijarMandato">
          <strong>Fijar mandato</strong>
        </button>
      </div>
      <em v-if="motivoMandato">{{ motivoMandato }}</em>
    </section>

    <section v-if="vista.reglas?.moneda !== false">
      <h4>Moneda</h4>
      <div class="fila-botones">
        <input v-model="nombreMoneda" class="entrada-oro ancha-media" :maxlength="reglasMoneda.largoNombre" placeholder="Nombre">
        <input v-model="simboloMoneda" class="entrada-oro corta" placeholder="Símbolo" @keyup.enter="nombrarMoneda">
        <button class="btn-secundario" :disabled="!puedeNombrarMoneda" @click="nombrarMoneda">
          <strong>Nombrar</strong>
        </button>
      </div>
      <template v-if="acunacion">
        <small>
          Acuñar da oro al instante pero encarece todo lo que comprás: cada {{ Math.round(1 / acunacion.puntosPorOro) }}
          de oro suman 1% a los costos. Baja {{ acunacion.bajadaPorRonda }} puntos por ronda.
        </small>
        <p class="actual">Inflación por acuñar: {{ inflacionAcunada }}%</p>
        <div class="fila-botones">
          <input v-model.number="oroAcunar" class="entrada-oro" type="number" min="1" :max="quedaAcunar">
          <button class="btn-secundario" :disabled="motivoAcunar !== null" @click="acunar">
            <strong>Acuñar</strong><small>Quedaría en {{ inflacionTras }}%</small>
          </button>
        </div>
        <em v-if="motivoAcunar">{{ motivoAcunar }}</em>
      </template>
    </section>

    <section v-if="hayGobierno">
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

    <section v-if="hayGobierno && yo.formaEstado === 'federal'">
      <h4>Problemas sociales</h4>
      <MapProblemas :vista="vista" :jugador-id="jugadorId" :constantes="constantes" />
    </section>

    <section v-if="hayGobierno && yo.formaEstado === 'federal'">
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
.selector-gobierno {
  width: 100%; padding: 0.45rem 0.5rem; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.1); color: inherit; font: inherit;
}
.selector-gobierno option, .selector-gobierno optgroup { color: #111; }
.eje-gobierno { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; }
.detalle-gobierno { display: flex; flex-direction: column; gap: 0.15rem; }
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
.entrada-oro.ancha-media { width: 9rem; }
.entrada-oro.corta { width: 4rem; }
.subdivision { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
.subdivision small { display: block; }
.ciudad-check { font-size: 0.8rem; display: flex; gap: 0.4rem; align-items: center; }
.btn-secundario.activo { border-color: #2ecc71; }
small { opacity: 0.7; font-size: 0.75rem; }
em { font-size: 0.72rem; font-style: normal; color: #e67e22; }
.alerta { color: #e74c3c; }
.aviso { color: #f1c40f; }
</style>
