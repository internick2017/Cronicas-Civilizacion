<!-- frontend/src/components/mapa/MapAyuda.vue -->
<script setup>
import { computed } from 'vue'

// TODO el contenido sale de `constantes` (GET /api/map/constantes). Ningun
// numero se escribe a mano aca: si se toca el balance, esta pantalla cambia
// sola. Una ayuda con numeros copiados es peor que no tener ayuda, porque
// miente con cara de verdad.
const props = defineProps({
  constantes: { type: Object, default: null },
  // Config de la partida en curso (objetivo de territorio, limite de rondas).
  config: { type: Object, default: null }
})

const NOMBRE_RECURSO = {
  food: 'comida', gold: 'oro', wood: 'madera',
  stone: 'piedra', science: 'ciencia', culture: 'cultura'
}

const listaRecursos = (obj) =>
  Object.entries(obj || {})
    .map(([recurso, cantidad]) => `${cantidad} ${NOMBRE_RECURSO[recurso] || recurso}`)
    .join(', ')

const costo = (obj) => listaRecursos(obj) || 'gratis'
const produccion = (obj) =>
  Object.keys(obj || {}).length ? `+${listaRecursos(obj).replace(/, /g, ', +')}` : 'nada'

const efectoRasgo = (rasgo) => {
  const partes = Object.entries(rasgo.produccionCiudad || {})
    .map(([recurso, cantidad]) => `+${cantidad} ${NOMBRE_RECURSO[recurso] || recurso} por ciudad`)
  if (rasgo.visionExtra) partes.push(`+${rasgo.visionExtra} de alcance al explorar`)
  if (rasgo.bonoDefensaCiudad) partes.push(`+${Math.round(rasgo.bonoDefensaCiudad * 100)}% de defensa en tus ciudades`)
  return partes.join(' · ')
}

// Una raza muestra lo que gana y lo que paga, ventajas primero. Las penalizaciones
// son los mismos campos con signo negativo: no hay una tabla aparte.
const efectoRaza = (raza) => {
  const partes = []
  for (const [recurso, fraccion] of Object.entries(raza.produccionPorcentual || {})) {
    const p = Math.round(fraccion * 100)
    partes.push({ texto: `${p > 0 ? '+' : ''}${p}% de ${NOMBRE_RECURSO[recurso] || recurso}`, bueno: p > 0 })
  }
  const a = raza.bonoAtaqueUnidades
  if (a) partes.push({ texto: `${a > 0 ? '+' : ''}${a} de ataque a tus unidades`, bueno: a > 0 })
  const d = raza.bonoDefensaUnidades
  if (d) partes.push({ texto: `${d > 0 ? '+' : ''}${d} de defensa a tus unidades`, bueno: d > 0 })
  const c = Math.round((raza.bonoDefensaCiudad || 0) * 100)
  if (c) partes.push({ texto: `${c > 0 ? '+' : ''}${c}% de defensa en tus ciudades`, bueno: c > 0 })
  if (raza.visionExtra) partes.push({ texto: `+${raza.visionExtra} de alcance al explorar`, bueno: true })
  return partes.sort((x, y) => Number(y.bueno) - Number(x.bueno)).map(p => p.texto).join(' · ')
}

const efectoTecnologia = (tec) => {
  const partes = []
  if (tec.bonoAtaqueUnidades) partes.push(`+${tec.bonoAtaqueUnidades} de ataque a tus unidades`)
  if (tec.bonoDefensaUnidades) partes.push(`+${tec.bonoDefensaUnidades} de defensa a tus unidades`)
  for (const [recurso, fraccion] of Object.entries(tec.produccionPorcentual || {})) {
    partes.push(`+${Math.round(fraccion * 100)}% de ${NOMBRE_RECURSO[recurso] || recurso}`)
  }
  if (tec.desbloqueaUnidad) partes.push('desbloquea una unidad')
  if (tec.desbloqueaEdificio) partes.push('desbloquea un edificio')
  return partes.join(' · ')
}

const terrenosProductivos = computed(() =>
  (props.constantes?.terrenos || []).filter(t => Object.keys(t.produccion || {}).length > 0)
)

// El objetivo y la duracion son de ESTA partida (se eligen al crearla), no del
// juego en general: el panel de reglas tiene que contar las reglas que se estan
// jugando ahora. Las constantes quedan de respaldo para partidas viejas.
const porcentajeDominacion = computed(() =>
  props.config?.porcentajeVictoria ??
  Math.round((props.constantes?.porcentajeVictoriaDominacion ?? 0) * 100)
)

const limiteRondas = computed(() => props.config?.limiteRondas ?? null)
const guerraPura = computed(() => props.config?.guerraPura === true)

// --- Gobierno -----------------------------------------------------------
// Los NUMEROS salen de las constantes; solo la explicacion esta escrita aca.
const pct = (fraccion) => `${Math.round(fraccion * 100)}%`
const rondasElecciones = computed(() => props.config?.rondasEntreElecciones ?? 8)
const bonosGobierno = computed(() => props.constantes?.bonosProduccionGobierno || {})
const listaBono = (obj) =>
  Object.entries(obj || {}).map(([r, f]) => `+${pct(f)} de ${NOMBRE_RECURSO[r] || r}`).join(' y ')
const probSucesion = computed(() => {
  const esperanza = props.constantes?.esperanzaDeVidaTurnos
  return esperanza ? `${(100 / esperanza).toFixed(2).replace('.', ',')}%` : ''
})

const tiposPorNivel = computed(() => {
  const nombres = []
  for (const t of props.constantes?.tiposSubdivision || []) {
    const mismos = (props.constantes?.tiposSubdivision || []).filter(x => x.nivel === t.nivel).map(x => x.nombre)
    const texto = mismos.join(' o ')
    if (!nombres.includes(texto)) nombres.push(texto)
  }
  return ['País', ...nombres].join(', ')
})

const topes = computed(() => {
  const cap = props.constantes?.capacidadCiudadesPorNivel || {}
  return Object.entries(cap)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([nivel, max]) => {
      const nombres = (props.constantes?.tiposSubdivision || []).filter(t => String(t.nivel) === nivel).map(t => t.nombre)
      return `${nombres.join(' o ')} ${max}`
    }).join(', ') + '; el resto no tiene tope'
})

const umbralAviso = computed(() =>
  Math.round((props.constantes?.umbralAvisoDominacion ?? 0) * 100)
)
</script>

<template>
  <div v-if="constantes" class="ayuda">
    <section v-if="config?.modoTurno === 'simultaneo'">
      <h4>Turnos: todos a la vez</h4>
      <p>
        En esta partida <strong>todos juegan la misma ronda al mismo tiempo</strong>: mové, construí y
        atacá cuando quieras, sin esperar a nadie. Lo que hacés pasa en el momento, así que si dos
        quieren la misma casilla se la queda el que llega primero. Cuando termines tocá
        <strong>Terminar turno</strong>: ya no podés hacer nada más en esa ronda, y la ronda cierra
        (se cobra la producción y las tropas recuperan su movimiento) recién cuando terminaron todos.
        La máquina juega cuando terminó el último jugador.
      </p>
    </section>
    <section>
      <h4>Alianzas</h4>
      <p>
        Desde el botón <strong>🤝 Alianzas</strong> le podés proponer una alianza a otro jugador, y él la
        acepta o la rechaza. Los aliados <strong>ganan juntos</strong>: su territorio se suma para llegar al
        objetivo, y si solo quedan aliados en pie también ganan. Por eso no puede haber una alianza de todos:
        siempre tiene que quedar al menos un rival afuera.
      </p>
      <p>
        Entre aliados no se pueden atacar, ven el mismo mapa, pueden caminar por la tierra del otro sin
        quitársela (pero no entrar a sus ciudades) y se pueden regalar recursos.
      </p>
      <p>
        Se puede <strong>salir de la alianza</strong> cuando quieras, pero con aviso: queda una tregua hasta
        que termine la ronda y recién en la siguiente se pueden atacar.
      </p>
      <p>
        La <strong>máquina</strong> nunca propone una alianza. Si se la proponés contesta en el momento, y
        solo acepta cuando va perdiendo (alguien tiene más territorio que ella). Dos máquinas nunca se alían.
      </p>
    </section>

    <section v-if="guerraPura">
      <h4>Guerra pura</h4>
      <p>
        Esta partida es de <strong>guerra pura</strong>: no existen la ciencia ni la cultura.
        No se producen, no hay tecnologías, rasgos culturales, biblioteca ni universidad, y las
        ciudades no suben de nivel. Todo se juega con comida, oro, madera y piedra. Las unidades
        que pedían una tecnología (como el legionario) están disponibles desde el inicio.
      </p>
    </section>

    <section>
      <h4>Cómo se gana</h4>
      <p>
        Ganás si controlás el {{ porcentajeDominacion }}% de las casillas de tierra,
        o si quedás como el único jugador en pie.
      </p>
      <p v-if="limiteRondas">
        Esta partida tiene un límite de <strong>{{ limiteRondas }} rondas</strong>: si nadie
        llega al {{ porcentajeDominacion }}% antes, gana quien controle más territorio.
      </p>
      <p>
        <!-- "El mar", no "el agua": el rio TAMBIEN es agua a la vista, pero es
             tierra vadeable y si cuenta para el porcentaje. Con la palabra
             vieja el jugador leia que ninguna casilla azul contaba. -->
        El <strong>mar</strong> no cuenta para ese porcentaje, pero los ríos sí:
        se cruzan a pie y se poseen como cualquier tierra. Se reclama territorio
        <strong>fundando ciudades</strong>, que se quedan con las casillas de alrededor,
        y <strong>capturando</strong> las ciudades de los demás. Tu progreso lo ves en la
        barra 🏆 del panel superior; cuando alguien pasa el
        {{ umbralAviso }}% del mundo, aparece un aviso para todos, aunque sin revelar
        dónde está su territorio.
      </p>
    </section>

    <section>
      <h4>De dónde salen los recursos</h4>
      <p>
        Solo producen las casillas <strong>con ciudad</strong>: el territorio que
        controlás alrededor no rinde nada por sí solo. Cada ciudad da
        <strong>{{ produccion(constantes.produccionBaseCiudad) }}</strong> por turno,
        más lo que aporte el terreno donde la fundaste.
      </p>
      <table>
        <thead>
          <tr><th>Terreno</th><th>Produce por turno</th><th>Defensa</th></tr>
        </thead>
        <tbody>
          <tr v-for="t in terrenosProductivos" :key="t.tipo">
            <td>{{ t.nombre }}</td>
            <td>{{ produccion(t.produccion) }}</td>
            <!-- Se compara contra 1, no "mayor que 1": el rio es el primer
                 terreno que PERJUDICA la defensa (×0.8), y con la condicion
                 vieja su penalidad se mostraba como "—", o sea que la ayuda
                 escondia justamente lo que hay que saber antes de cruzarlo. -->
            <td>{{ t.bonoDefensa === 1 ? '—' : `×${t.bonoDefensa}` }}</td>
          </tr>
        </tbody>
      </table>
      <p class="aviso">
        Ojo: madera y piedra solo entran si fundaste sobre bosque, montaña o
        colinas. Ningún edificio las produce.
      </p>
    </section>

    <section>
      <h4>Ciudades y edificios</h4>
      <p>Fundar una ciudad cuesta {{ costo(constantes.costoCiudad) }}.</p>
      <table>
        <thead>
          <tr><th>Edificio</th><th>Cuesta</th><th>Produce por turno</th></tr>
        </thead>
        <tbody>
          <tr v-for="e in constantes.edificios" :key="e.tipo">
            <td>{{ e.nombre }}<small v-if="e.requiereTecnologia"> (necesita tecnología)</small></td>
            <td>{{ costo(e.costo) }}</td>
            <td>{{ produccion(e.produccion) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="aviso">
        Además de construir, una ciudad se puede <strong>mejorar de nivel</strong>
        (con ciencia y oro, cada vez más caro): sube su defensa. Es por ciudad,
        no una tecnología de toda la civilización.
      </p>
      <p v-if="constantes.cuartel">
        El <strong>cuartel</strong> no solo desbloquea caballería y catapulta:
        la ciudad donde está sube +{{ constantes.cuartel.bonoDefensaCiudad }} de
        defensa, cura +{{ constantes.cuartel.curacionPorRonda }} de vida por
        turno a la tropa parada ahí, y lo que reclutes ahí sale
        {{ Math.round(constantes.cuartel.descuentoReclutar * 100) }}% más barato
        y con +{{ constantes.cuartel.bonoMovimiento }} de movimiento.
      </p>
    </section>

    <section v-if="constantes.capital">
      <h4>Capital</h4>
      <p>
        Tu primera ciudad es la <strong>capital</strong> (👑 en el mapa). Rinde
        +{{ Math.round(constantes.capital.bonoProduccion * 100) }}% de todo y se defiende con
        +{{ constantes.capital.bonoDefensa }} de defensa.
      </p>
      <p>
        Desde el menú de cualquier otra ciudad tuya podés mudarla por {{ costo(constantes.capital.costoMover) }}
        (la inflación lo encarece). La nueva capital no produce nada durante
        {{ constantes.capital.rondasSinProducir }} ronda{{ constantes.capital.rondasSinProducir === 1 ? '' : 's' }}
        mientras se instala. Si te capturan la capital, pasa sola a tu ciudad de mayor nivel.
      </p>
    </section>

    <section v-if="constantes.rasgosCulturales?.length && !guerraPura">
      <h4>Cultura</h4>
      <p>
        La cultura se gasta en <strong>rasgos</strong> que tu civilización adopta
        una sola vez y conserva para siempre. Son acumulativos: podés tenerlos
        todos si juntás la cultura.
      </p>
      <table>
        <thead>
          <tr><th>Rasgo</th><th>Cuesta</th><th>Efecto</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in constantes.rasgosCulturales" :key="r.tipo">
            <td>{{ r.nombre }}</td>
            <td>{{ r.costo.culture }} cultura</td>
            <td>{{ efectoRasgo(r) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="constantes.razas?.length">
      <h4>Razas</h4>
      <p>
        Cada jugador elige una raza al entrar y la conserva toda la partida. Cada una
        gana algo y paga algo, y se suma a lo que ya te dan los rasgos y las tecnologías.
      </p>
      <table>
        <thead>
          <tr><th>Raza</th><th>Efecto</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in constantes.razas" :key="r.tipo">
            <td>{{ r.icono }} {{ r.nombre }}</td>
            <td>{{ efectoRaza(r) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section>
      <h4>Unidades</h4>
      <table>
        <thead>
          <tr><th>Unidad</th><th>Atq</th><th>Def</th><th>Vida</th><th>Mov</th><th>Cuesta</th></tr>
        </thead>
        <tbody>
          <tr v-for="u in constantes.unidades" :key="u.tipo">
            <td>
              {{ u.nombre }}
              <small v-if="u.requiereBarracks"> (necesita cuartel)</small>
              <small v-if="u.requierePuerto"> (necesita puerto)</small>
              <small v-if="u.requiereTecnologia"> (necesita tecnología)</small>
              <!-- Que solo navegue no es un detalle de reclutamiento sino la
                   regla central de la unidad: sin decirlo, el jugador la
                   compra esperando que camine. -->
              <small v-if="u.naval"> · solo navega, nunca pisa tierra</small>
              <small v-if="u.capacidad"> · lleva {{ u.capacidad }} unidades; si lo hunden, se hunden con él</small>
              <small v-if="u.ataque === 0"> · no ataca</small>
            </td>
            <td>{{ u.ataque }}</td>
            <td>{{ u.defensa }}</td>
            <td>{{ u.salud }}</td>
            <td>{{ u.movimiento }}</td>
            <td>{{ costo(u.costo) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="constantes.tecnologias?.length && !guerraPura">
      <h4>Ciencia</h4>
      <p>
        La ciencia se gasta en <strong>tecnologías</strong>: se investigan una
        sola vez, valen para siempre, y son independientes entre sí (no hace
        falta una para desbloquear otra).
      </p>
      <table>
        <thead>
          <tr><th>Tecnología</th><th>Cuesta</th><th>Efecto</th></tr>
        </thead>
        <tbody>
          <tr v-for="t in constantes.tecnologias" :key="t.tipo">
            <td>{{ t.nombre }}</td>
            <td>{{ t.costo.science }} ciencia</td>
            <td>{{ efectoTecnologia(t) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="constantes.gobiernos?.length">
      <h4>Gobierno y forma de Estado</h4>
      <p>
        Con el botón <strong>🏛️ Gobierno</strong> elegís <strong>quién decide</strong> en tu civilización.
        Empezás en despotismo (mandás vos). Cambiar de gobierno no cuesta nada, pero hay que
        <strong>ganar la votación</strong> del gobierno en el que estás.
      </p>
      <table>
        <thead>
          <tr><th>Gobierno</th><th>Quién aprueba un cambio</th><th>Qué te da</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Despotismo</td>
            <td>Vos</td>
            <td>Nada extra, pero tampoco perdés nunca el poder.</td>
          </tr>
          <tr>
            <td>Monarquía</td>
            <td>Vos, si sos el líder</td>
            <td>
              {{ listaBono(bonosGobierno.monarquia) }} y más respeto de pueblo y líderes. Cada turno hay
              {{ probSucesion }} de probabilidad de que un bot asuma el poder (y la misma de que vuelvas).
            </td>
          </tr>
          <tr>
            <td>Estratocracia</td>
            <td>Los militares</td>
            <td>{{ listaBono(bonosGobierno.estratocracia) }} y más respeto del ejército. Para volver al poder necesitás apoyo militar de {{ constantes.umbralesGobierno?.regresoMilitar }}.</td>
          </tr>
          <tr>
            <td>República representativa</td>
            <td>La mitad de los líderes</td>
            <td>+{{ pct(constantes.bonoProduccionRepublica) }} de producción en todo: los líderes elegidos mejoran el país.</td>
          </tr>
          <tr>
            <td>República semidirecta</td>
            <td>Pueblo (50%) y líderes (50%)</td>
            <td>El mismo bono; las decisiones pesan por mitades.</td>
          </tr>
          <tr>
            <td>República directa</td>
            <td>La mitad del pueblo</td>
            <td>El mismo bono; decide la población.</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>El apoyo</strong> de pueblo, líderes y militares (barras del panel) es tu moneda política.
        Sube {{ constantes.variacionApoyo?.sube }} por ronda si controlás más territorio que los demás y baja
        {{ constantes.variacionApoyo?.baja }} si controlás menos (nunca por debajo de {{ constantes.variacionApoyo?.piso }}
        por eso solo). Quien no manda recupera {{ constantes.variacionApoyo?.recuperacion }} por ronda hacia 50.
      </p>
      <p>
        Para ganar una votación hay <strong>dos caminos</strong>: <strong>comprar votos con oro</strong>
        (el oro se pierde aunque la votación falle, y tras un rechazo esperás
        {{ constantes.enfriamientoVoto }} turnos para volver a proponer) o
        <strong>conquistarlos</strong> dando ventajas: cada {{ constantes.oroPorPuntoApoyo }} de oro suben 1 punto
        el apoyo de un grupo, y se queda. A la hora de votar pesa más si prefieren el gobierno nuevo al actual
        que cuánto te apoyan.
      </p>
      <p class="aviso">
        <strong>Podés perder el poder</strong> (nunca la partida): por una crisis, por una expulsión si el apoyo de
        los líderes (o de los militares, en estratocracia) cae por debajo de {{ constantes.umbralesGobierno?.expulsion }},
        por sucesión en la monarquía, o en las elecciones de las repúblicas, que son cada {{ rondasElecciones }} rondas.
        Sin poder, <strong>la máquina juega tus turnos</strong> y el botón pasa a "Esperar". Mientras tanto
        solo podés dar ventajas para volver a ganar apoyo.
      </p>
      <p>
        <strong>Forma de Estado.</strong> En el Estado <strong>unitario</strong> mandás vos en cada ciudad. En el
        <strong>federal</strong>, todas tus ciudades se administran solas al terminar tu turno: construyen según su
        prioridad (economía por defecto) y después se mejoran, hasta el nivel {{ constantes.nivelMaximoAdministrado }}.
        Creando <strong>subdivisiones</strong> agrupás ciudades y les elegís otra prioridad
        ({{ (constantes.prioridadesSubdivision || []).join(', ') }}). Pasar de uno a otro es gratis.
      </p>
      <p>
        Además, en el menú de cada ciudad propia podés <strong>renombrarla</strong> cuando quieras.
      </p>
    </section>

    <section v-if="constantes.tiposSubdivision?.length">
      <h4>Subdivisiones y problemas sociales</h4>
      <p>
        En el Estado federal armás un <strong>árbol de subdivisiones</strong> dentro del País, de mayor a menor:
        <strong>{{ tiposPorNivel }}</strong>. Cada una se puede renombrar, tener una prioridad propia (si no, hereda
        la de la de arriba) y contener ciudades y otras subdivisiones más chicas. Una subdivisión solo puede estar
        dentro de otra de nivel mayor. Si quitás una, sus hijas y sus ciudades pasan a la de arriba. Cada nivel abarca hasta un máximo de ciudades (contando las de sus hijas): {{ topes }}.
      </p>
      <p>
        Cada ciudad acumula <strong>diez problemas sociales</strong>:
        {{ (constantes.problemasSociales || []).map(p => p.nombre.toLowerCase()).join(', ') }}.
        Los medidores suben o bajan según lo que tengas construido (un cuartel contiene la inseguridad, una
        biblioteca la mala educación, un granero la pobreza y la mala salud, un aserradero o una cantera la falta
        de infraestructura, un mercado la corrupción).
      </p>
      <p>
        Primero aparecen <strong>señales de aviso</strong> (desde {{ constantes.limitesProblemas?.senal }} de 100):
        da tiempo de prevenir. Al llegar a {{ constantes.limitesProblemas?.problema }} aparece el
        <strong>problema</strong>, que abarca a la ciudad y a las vecinas que ya estaban en aviso.
        Lo resuelve <strong>la subdivisión de menor nivel que cubra todas las ciudades afectadas</strong> (o el País
        si ninguna las cubre), sola, pagando oro. Cuanto más chica la subdivisión, más rápido y barato:
      </p>
      <table>
        <thead>
          <tr><th>Resuelve</th><th>Tarda</th><th>Cuesta</th></tr>
        </thead>
        <tbody>
          <tr v-for="(datos, nivel) in constantes.resolucionPorNivel" :key="nivel">
            <td>{{ nivel === '1' ? 'País' : (constantes.tiposSubdivision.filter(t => String(t.nivel) === nivel).map(t => t.nombre).join(' / ')) }}</td>
            <td>{{ datos.rondas }} ronda(s)</td>
            <td>{{ datos.oro }} de oro</td>
          </tr>
        </tbody>
      </table>
      <p class="aviso">
        Si no hay oro, el problema <strong>empeora</strong> (hasta gravedad {{ constantes.limitesProblemas?.gravedadMaxima }})
        y su castigo crece. Un árbol bien repartido resuelve barato: muchas Freguesias chicas cuestan menos que mandar
        todo al País. Mientras dura, cada problema castiga: desempleo baja la producción de la ciudad, mala
        educación la ciencia, la crisis climática la comida, la corrupción se lleva oro, la inmigración consume
        comida, la inseguridad y la falta de infraestructura bajan su defensa, la inflación encarece construir y
        reclutar, la mala salud baja la población y la pobreza baja el apoyo del pueblo. El botón
        <strong>🏛️ Gobierno</strong> muestra un número naranja cuando hay avisos o problemas.
      </p>
    </section>

    <section>
      <h4>Cómo se resuelve un combate</h4>
      <p>
        Se enfrentan el <strong>ataque</strong> del atacante contra la
        <strong>defensa</strong> del defensor. A cada lado se le aplica un dado
        de suerte, y el defensor además multiplica por el bono de su terreno y
        por ×{{ constantes.bonoDefensaCiudad }} si está dentro de una ciudad.
      </p>
      <p>
        Gana el número más alto, pero <strong>los dos lados reciben daño</strong>:
        cada uno pega según su peso en el combate y el golpe del perdedor vale
        la mitad. Cuanto más parejo el combate, más se desgasta también el que
        gana, así que encadenar peleas sin recuperarse se paga caro.
      </p>
      <p class="aviso">
        Atacar de frente a una unidad defensiva parada en altura o dentro de
        una ciudad suele salir mal. Un atacante muy debilitado puede caer por
        la réplica aunque gane, y en ese caso la ciudad no se captura.
      </p>
    </section>
  </div>
  <p v-else class="ayuda-vacia">No se pudieron cargar las reglas del juego.</p>
</template>

<style scoped>
.ayuda { display: flex; flex-direction: column; gap: 1rem; font-size: 0.9rem; }
.ayuda section { display: flex; flex-direction: column; gap: 0.4rem; }
.ayuda h4 { margin: 0; color: #f1c40f; font-size: 0.95rem; }
.ayuda p { margin: 0; line-height: 1.45; }
.aviso { color: #e67e22; }
.ayuda-vacia { opacity: 0.7; font-style: italic; }

table { border-collapse: collapse; width: 100%; font-size: 0.82rem; }
th, td { text-align: left; padding: 0.25rem 0.4rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
th { color: #bdc3c7; font-weight: 600; }
td small { opacity: 0.6; }
</style>
