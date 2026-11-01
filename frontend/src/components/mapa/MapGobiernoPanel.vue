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
const emit = defineEmits(['proponer', 'ventajas', 'forma', 'crearSubdivision', 'renombrarSubdivision', 'asignarCiudades', 'desasignarCiudades', 'quitarSubdivision', 'elegirCabecera', 'nombrarMoneda', 'acunar', 'nombrarGobierno', 'impuestos', 'mandato', 'emergencia', 'cerrar'])

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
// El grupo mas descontento: bajo el umbral se puede alzar, sea cual sea el gobierno.
const grupoDescontento = computed(() => Object.entries(yo.value?.apoyo ?? {}).sort((a, b) => a[1] - b[1])[0] ?? null)
const riesgoLevantamiento = computed(() =>
  props.vista.reglas?.levantamientos !== false
    && enPoder.value && grupoDescontento.value?.[1] < (props.constantes.umbralesGobierno?.levantamiento ?? 25))
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
    .map(p => `${nombrePoder(p)} independiente`)
  return [...partes, ...respeto, ...poderes].join(', ') || 'Sin bonos.'
})

// --- Separacion de poderes: el Ejecutivo siempre es tuyo; los otros diez son
// independientes o no segun el gobierno. El texto de cada uno lo manda el servidor.
const nombrePoder = (clave) => (props.constantes.poderes || []).find(p => p.clave === clave)?.nombre || clave
const tengoPoder = (clave) => (perfil.value.poderes || []).includes(clave)
// Sin la lista (backend viejo) estan todos.
const enLaPartida = (clave) => clave === 'ejecutivo' || !props.vista.reglas?.poderes || props.vista.reglas.poderes.includes(clave)
const poderesSeparadosDe = (tipo) => (props.constantes.poderesGobierno?.[tipo] || []).filter(enLaPartida)
const estadoDePoder = (clave) => {
  if (clave === 'ejecutivo') return 'tuyo'
  if (tengoPoder(clave)) return 'independiente'
  return (perfil.value.concentrados || []).includes(clave) ? 'concentrado' : 'no existe'
}
const poderesDelGobierno = computed(() => (props.constantes.poderes || [])
  .filter(p => enLaPartida(p.clave))
  .map(p => ({ ...p, estado: estadoDePoder(p.clave) })))
const costoInstituciones = computed(() =>
  Math.round(Math.abs(props.constantes.efectosPoderes?.ejecutivo?.oroPorInstitucion ?? 0) * (perfil.value.poderes || []).length * 100))

// --- Estado de excepcion ---
const reglasEmergencia = computed(() => props.constantes.efectosPoderes?.emergencia || {})
const emergenciaActiva = computed(() => (yo.value?.emergenciaHasta ?? -1) >= props.vista.turno)
const costoEmergencia = computed(() =>
  -(tengoPoder('emergencia') ? reglasEmergencia.value.apoyoPuebloRegulada : reglasEmergencia.value.apoyoPueblo))
const motivoEmergencia = computed(() => {
  if (!enPoder.value) return 'perdiste el poder'
  if (tengoPoder('tribunicio')) return 'el Tribuno la veta'
  if (estadoDePoder('emergencia') === 'no existe') return 'tu gobierno no tiene este poder'
  if (emergenciaActiva.value) return `dura hasta la ronda ${yo.value.emergenciaHasta}`
  const bloqueada = yo.value?.emergenciaBloqueadaHasta ?? 0
  return bloqueada > props.vista.turno ? `podés volver a declararla en la ronda ${bloqueada}` : null
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
// Con un poder de Control independiente no se compran votos.
const puedeComprarVotos = computed(() => hayVotacion.value && !tengoPoder('control'))
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
const impuestoVetado = (nivel) => nivel === 'altos' && tengoPoder('tribunicio')
const efectoImpuestos = (nivel) => {
  if (impuestoVetado(nivel)) return 'vetados por el Tribuno'
  const { oro = 0, apoyoPueblo = 0 } = impuestos.value[nivel] || {}
  if (!oro && !apoyoPueblo) return 'sin efecto'
  const signo = (n) => (n > 0 ? `+${n}` : `${n}`)
  return `${signo(Math.round(oro * 100))}% de oro, ${signo(apoyoPueblo)} de apoyo del pueblo por ronda`
}

const esRepublica = computed(() => perfil.value.republica === true)
const limitesMandato = computed(() => {
  const limites = props.constantes.limitesMandato || { min: 2, max: 50 }
  return tengoPoder('electoral')
    ? { ...limites, max: props.constantes.efectosPoderes?.electoral?.mandatoMaximo ?? limites.max }
    : limites
})
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
  emit('proponer', tipo, puedeComprarVotos.value ? Math.max(0, Math.floor(Number(oroOfrecido.value) || 0)) : 0)
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
      <em v-else-if="riesgoLevantamiento" class="alerta">
        {{ grupoDescontento[0] === 'pueblo' ? 'Riesgo de revolución' : 'Riesgo de golpe de Estado' }}:
        apoyo de {{ grupoDescontento[1] }} en {{ NOMBRE_GRUPO[grupoDescontento[0]] }}. Dales ventajas antes de que se alcen.
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
      <small>Mantener las instituciones cuesta {{ costoInstituciones }}% de oro.</small>
      <details v-for="p in poderesDelGobierno" :key="p.clave" class="poder">
        <summary>
          <span>{{ p.nombre }}</span>
          <small :class="{ independiente: p.estado === 'independiente' }">{{ p.estado }}</small>
        </summary>
        <small>{{ p.funcion }}</small>
        <small v-if="p.estado === 'no existe'">Tu gobierno no tiene este poder.</small>
        <small v-else-if="p.estado === 'concentrado'">
          Lo ejercés vos, sin bono ni costo. {{ p.concentrado }}
        </small>
        <template v-else>
          <small class="gana">{{ p.gana }}</small>
          <small class="paga">{{ p.paga }}</small>
        </template>
      </details>
    </section>

    <section v-if="hayGobierno && enLaPartida('emergencia')">
      <h4>Estado de excepción</h4>
      <small>
        {{ reglasEmergencia.rondas }} rondas con -{{ Math.round((reglasEmergencia.descuentoReclutar ?? 0) * 100) }}% al
        reclutar y +{{ Math.round((reglasEmergencia.defensaCiudad ?? 0) * 100) }}% de defensa en tus ciudades.
        {{ tengoPoder('emergencia') ? 'Regulado por ley: no te protege del cargo.' : 'Sin controles: nadie te saca del cargo salvo un levantamiento.' }}
      </small>
      <button class="btn-secundario" :disabled="motivoEmergencia !== null" @click="emit('emergencia')">
        <strong>Declarar</strong><small>Cuesta {{ costoEmergencia }} de apoyo del pueblo</small>
      </button>
      <em v-if="motivoEmergencia">{{ motivoEmergencia }}</em>
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
      <small v-if="hayVotacion && !puedeComprarVotos">El poder de Control no deja comprar votos: se vota sin oro.</small>
      <template v-else-if="hayVotacion">
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
          :disabled="!enPoder || (yo.impuestos || 'normales') === nivel || impuestoVetado(nivel)"
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

    <section v-if="hayGobierno && yo.formaEstado === 'federal' && vista.reglas?.problemas !== false">
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
.barra { height: 0.55rem; border-radius: calc(var(--t-radio) * 4px); background: rgb(var(--t-tinta) / 0.12); overflow: hidden; }
.barra-llena { height: 100%; background: rgb(var(--t-exito)); }
.valor { text-align: right; opacity: 0.8; }
.poder summary {
  min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  cursor: pointer; font-size: 0.85rem; border-bottom: 1px solid rgb(var(--t-tinta) / 0.1);
}
.poder[open] { display: flex; flex-direction: column; gap: 0.2rem; padding-bottom: 0.5rem; }
.poder .independiente { color: rgb(var(--t-exito)); opacity: 1; }
.poder .gana { color: rgb(var(--t-exito)); opacity: 1; }
.poder .paga { color: rgb(var(--t-alerta)); opacity: 1; }
.selector-gobierno {
  width: 100%; padding: 0.45rem 0.5rem; border-radius: calc(var(--t-radio) * 6px); border: 1px solid rgb(var(--t-tinta) / 0.25);
  background: rgb(var(--t-tinta) / 0.1); color: inherit; font: inherit;
}
.selector-gobierno option, .selector-gobierno optgroup { color: #111; }
.eje-gobierno { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; }
.detalle-gobierno { display: flex; flex-direction: column; gap: 0.15rem; }
.fila-botones { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.entrada-oro {
  width: 6rem; padding: 0.35rem 0.5rem; border-radius: calc(var(--t-radio) * 6px);
  border: 1px solid rgb(var(--t-tinta) / 0.2); background: rgb(var(--t-sombra) / 0.25); color: rgb(var(--t-texto));
}
.btn-secundario {
  background: rgb(var(--t-tinta) / 0.1); color: rgb(var(--t-texto));
  border: 1px solid rgb(var(--t-tinta) / 0.15); border-radius: calc(var(--t-radio) * 6px);
  padding: 0.5rem 0.8rem; cursor: pointer; text-align: left;
  display: flex; flex-direction: column; gap: 0.1rem;
}
.btn-secundario:hover:not(:disabled) { background: rgb(var(--t-tinta) / 0.2); }
.btn-secundario:disabled { opacity: 0.45; cursor: not-allowed; }
.entrada-oro.ancha { width: 100%; box-sizing: border-box; }
.entrada-oro.ancha-media { width: 9rem; }
.entrada-oro.corta { width: 4rem; }
.subdivision { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
.subdivision small { display: block; }
.ciudad-check { font-size: 0.8rem; display: flex; gap: 0.4rem; align-items: center; }
.btn-secundario.activo { border-color: rgb(var(--t-exito)); }
small { opacity: 0.7; font-size: 0.75rem; }
em { font-size: 0.72rem; font-style: normal; color: rgb(var(--t-alerta)); }
.alerta { color: rgb(var(--t-peligro)); }
.aviso { color: rgb(var(--t-aviso)); }
</style>
