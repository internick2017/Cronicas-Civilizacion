@echo off
title Cronicas de Civilizacion - Lanzador
setlocal

set "PROYECTO=%~dp0"

echo ================================================
echo   Cronicas de Civilizacion
echo ================================================
echo.
echo Iniciando el backend y el frontend...
echo (se van a abrir 3 ventanas negras: son los servidores, no las cierres
echo  mientras jugas; si algo falla, ahi se ve el motivo)
echo.

start "Cronicas - Backend" cmd /k "cd /d "%PROYECTO%backend" && yarn dev-sqlite"

start "Cronicas - Frontend (esta PC, HTTPS)" cmd /k "cd /d "%PROYECTO%frontend" && yarn dev"

start "Cronicas - Frontend (tablet o celular, HTTP)" cmd /k "cd /d "%PROYECTO%frontend" && set SIN_HTTPS=1 && node_modules\.bin\vite.cmd --port 5174 --strictPort"

echo Esperando a que los servidores terminen de arrancar...
timeout /t 10 /nobreak >nul

start https://localhost:5173

echo.
echo ================================================
echo Listo. El juego deberia haberse abierto en el navegador.
echo.
echo   - En ESTA PC entra solo:     https://localhost:5173
echo   - En tablet o celular (misma WiFi):  http://192.168.3.6:5174
echo     (si esa direccion no funciona, la IP de la PC cambio; para verla
echo      de nuevo abri una ventana negra de Windows y escribi: ipconfig)
echo.
echo Para CERRAR el juego: cerra las 3 ventanas negras de los servidores.
echo Esta ventana se puede cerrar apenas quieras.
echo ================================================
echo.
pause
