<!-- frontend/src/components/mapa/MapAyuda.vue -->
<script setup>
import { computed } from 'vue'

// TODO el contenido sale de `constantes` (GET /api/map/constantes). Ningun
// numero se escribe a mano aca: si se toca el balance, esta pantalla cambia
// sola. Una ayuda con numeros copiados es peor que no tener ayuda, porque
// miente con cara de verdad.
const props = defineProps({
  constantes: { type: Object, default: null }
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

const porcentajeDominacion = computed(() =>
  Math.round((props.constantes?.porcentajeVictoriaDominacion ?? 0) * 100)
)
</script>

<template>
  <div v-if="constantes" class="ayuda">
    <section>
      <h4>Cómo se gana</h4>
      <p>
        Ganás si controlás el {{ porcentajeDominacion }}% de las casillas de tierra,
        o si quedás como el único jugador en pie.
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
            <td>{{ t.bonoDefensa > 1 ? `×${t.bonoDefensa}` : '—' }}</td>
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

    <section v-if="constantes.rasgosCulturales?.length">
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
              <small v-if="u.requiereTecnologia"> (necesita tecnología)</small>
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

    <section v-if="constantes.tecnologias?.length">
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
