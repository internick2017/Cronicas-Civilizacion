import { fileURLToPath, URL } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const certKeyPath = fileURLToPath(new URL('./.certs/key.pem', import.meta.url))
const certPath = fileURLToPath(new URL('./.certs/cert.pem', import.meta.url))
const backendPort = process.env.BACKEND_PORT || 3000

// HTTPS con certificado mkcert (de CONFIANZA), solo si existe en esta máquina.
// Necesario para que el micrófono (Web Speech API) funcione por la IP de la red
// desde celulares SIN advertencias.
// Generar:  cd frontend/.certs && mkcert -cert-file cert.pem -key-file key.pem 192.168.3.6 localhost 127.0.0.1
// SIN_HTTPS=1 sirve por HTTP plano: util para dispositivos de la red que no
// confian en la CA local de mkcert (tablets, celulares). Costo: el navegador ya
// no esta en contexto seguro, asi que el microfono (modo voz) no funciona ahi.
const https = process.env.SIN_HTTPS
  ? undefined
  : existsSync(certKeyPath) && existsSync(certPath)
    ? { key: readFileSync(certKeyPath), cert: readFileSync(certPath) }
    : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    host: true,
    port: 5173,
    https,
    proxy: {
      '/api': { target: `http://localhost:${backendPort}`, changeOrigin: true },
      '/socket.io': { target: `http://localhost:${backendPort}`, ws: true },
    },
  }
})
