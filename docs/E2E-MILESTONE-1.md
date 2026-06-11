# E2E Milestone 1 — Modo Narrativo Familiar (LAN)

**Estado:** PENDIENTE de ejecutar con dispositivos reales.
**Requisitos previos:**
1. API key de Gemini (gratis): https://aistudio.google.com/apikey → pegar en `backend/.env`:
   ```
   DATABASE_TYPE=sqlite
   GEMINI_API_KEY=<tu key>
   GEMINI_MODEL=gemini-2.5-flash
   ```
   (⚠️ el `.env` actual apunta a Neon/Postgres — cambiar `DATABASE_TYPE` a `sqlite` para el milestone)
2. Arrancar todo con UN comando desde la raíz: `npm run dev`
   El backend imprime: `📱 En tu WiFi: http://<IP>:3000` — los celulares entran a `http://<IP>:5173`

## Checklist (marcar PASS/FAIL + notas)

- [ ] PC: crear sesión (nombre del anfitrión, género fantasía, idioma **pt**) → código de 5 letras visible en grande
- [ ] Celular 1 y Celular 2: "Unirse" con código + nombre → aparecen en la sala de espera del anfitrión en vivo
- [ ] PC: "Comenzar" (deshabilitado con <2 jugadores) → los 3 ven la introducción de la IA **EN PORTUGUÉS**
- [ ] Ronda completa en orden (banner "✍️ Es tu turno" / "⏳ Le toca a X") → al cerrar la ronda la narración integra las 3 acciones
- [ ] Acción fuera de turno → input bloqueado en UI; API la rechaza (curl)
- [ ] Acción de 281+ caracteres → imposible en UI (contador 280); API la rechaza (curl)
- [ ] Celular 1 cierra el navegador → reentra con código + MISMO nombre → recupera su lugar
- [ ] "Saltar turno" (solo anfitrión) salta al jugador desconectado
- [ ] Reiniciar el backend a mitad de partida → la sesión se retoma con el mismo código (estado completo)
- [ ] Falla de IA simulada (apagar WiFi del server un momento al cerrar ronda) → alerta "Reintentar narración" en el cliente que actuó → retry funciona
- [ ] "Finalizar historia" → epílogo con marco dorado 📜 → modo lectura (input oculto)
- [ ] Segunda sesión en **español** → narración en español

## Resultados

_(completar al ejecutar)_
