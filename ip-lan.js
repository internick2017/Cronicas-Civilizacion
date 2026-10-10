// Imprime la IP de esta PC en la red de casa, para que los lanzadores
// (jugar.bat y jugar-oculto.vbs) le digan a la tablet y al celular donde entrar.
// Antes estaba escrita a mano y quedaba vieja cuando cambiaba el router.
//
// No alcanza con tomar "la primera direccion que no sea localhost": esta PC
// tiene ademas el adaptador virtual de WSL (192.168.208.1), que parece una IP
// de casa y no lo es. Por eso se le pregunta al sistema por DONDE saldria a
// internet: un socket UDP "conectado" no manda ningun paquete, solo hace que
// Windows elija la placa de salida, y esa es la que ve el resto de la WiFi.
//
// Si no hay salida (router apagado, sin cable) no imprime nada y sale con 1;
// los lanzadores muestran entonces el aviso de mirarla con ipconfig.

const dgram = require('dgram')
const os = require('os')

function ipPorAdaptadores() {
  for (const [nombre, direcciones] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|WSL|Docker|VirtualBox|VMware/i.test(nombre)) continue
    for (const d of direcciones) {
      if (d.family === 'IPv4' && !d.internal) return d.address
    }
  }
  return null
}

function terminar(ip) {
  if (!ip) process.exit(1)
  console.log(ip)
}

const socket = dgram.createSocket('udp4')
socket.on('error', () => {
  socket.close()
  terminar(ipPorAdaptadores())
})
socket.connect(53, '8.8.8.8', () => {
  const ip = socket.address().address
  socket.close()
  terminar(ip)
})
