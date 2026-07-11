# 🚀 Guía de Instalación - Backend sin Docker

## 📋 Resumen de Opciones

El backend de **Crónicas de Civilización** ahora tiene **múltiples opciones** de instalación para adaptarse a diferentes necesidades:

### 🟢 **Opción 1: SQLite (Recomendado para desarrollo rápido)**
- ✅ **Sin instalaciones externas** - Todo incluido
- ✅ **Base de datos en archivo** - No necesita servidor
- ✅ **Cache en memoria** - Sin Redis requerido
- ✅ **Configuración automática**

### 🟡 **Opción 2: PostgreSQL + Memurai**
- ✅ **Instalación automática** con Chocolatey
- ✅ **Base de datos profesional** - PostgreSQL
- ✅ **Cache real** - Memurai (Redis para Windows)
- ⚠️ Requiere permisos de administrador

---

## 🎯 **INSTALACIÓN RÁPIDA (SQLite)**

### Paso 1: Ejecutar setup automático
```bash
cd backend
setup-sqlite.bat
```

### Paso 2: Iniciar servidor
```bash
npm run dev-sqlite
```

¡Listo! El servidor estará en http://localhost:3000

---

## 🏢 **INSTALACIÓN COMPLETA (PostgreSQL)**

### Paso 1: Ejecutar como Administrador
```bash
# Clic derecho > "Ejecutar como administrador"
cd backend
setup-local.bat
```

### Paso 2: Configurar .env (si es necesario)
El script crea automáticamente el archivo `.env`, pero puedes editarlo:

```env
# Configuración de base de datos
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cronicas_civilizacion
DB_USER=postgres
DB_PASSWORD=password

# Redis (Memurai)
REDIS_HOST=localhost
REDIS_PORT=6379

# Gemini (opcional)
GEMINI_API_KEY=tu_clave_aqui
```

### Paso 3: Iniciar servidor
```bash
npm run dev-postgres
```

---

## ⚙️ **Scripts Disponibles**

| Script | Descripción |
|--------|-------------|
| `npm run setup-sqlite` | Instalación rápida con SQLite |
| `npm run setup-local` | Instalación completa con PostgreSQL |
| `npm run dev-sqlite` | Desarrollo con SQLite |
| `npm run dev-postgres` | Desarrollo con PostgreSQL |
| `npm run dev` | Desarrollo (detección automática) |
| `npm run test-connections` | Probar conexiones |
| `npm start` | Producción |

---

## 🔍 **Verificación**

### Endpoints de prueba:
- **Health Check**: http://localhost:3000/health
- **Configuración**: http://localhost:3000/config
- **Frontend**: http://localhost:5173 (cuando esté ejecutándose)

### Verificar conexiones:
```bash
npm run test-connections
```

---

## 🗂️ **Estructura de Archivos**

```
backend/
├── src/
│   ├── config/
│   │   ├── index.js           # Configuración dinámica
│   │   ├── database.js        # PostgreSQL
│   │   ├── database-sqlite.js # SQLite
│   │   ├── redis.js          # Redis real
│   │   └── redis-memory.js   # Redis en memoria
│   ├── server-dynamic.js     # Servidor adaptable
│   └── ...
├── data/                     # Base de datos SQLite
├── setup-sqlite.bat         # Setup rápido
├── setup-local.bat          # Setup completo
└── test-connections.js      # Test de conexiones
```

---

## 🛠️ **Solución de Problemas**

### ❌ Error: "No se puede ejecutar scripts"
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### ❌ PostgreSQL no se conecta
1. Verificar que el servicio esté corriendo:
   ```cmd
   services.msc → PostgreSQL
   ```
2. Reiniciar PostgreSQL:
   ```cmd
   net stop postgresql-x64-13
   net start postgresql-x64-13
   ```

### ❌ Memurai no funciona
1. Verificar servicio:
   ```cmd
   services.msc → Memurai
   ```
2. Usar fallback a memoria:
   ```bash
   set CACHE_TYPE=memory
   npm run dev
   ```

### ❌ Puerto 3000 ocupado
```bash
# Cambiar puerto en .env
PORT=3001
```

---

## 📊 **Comparación de Opciones**

| Característica | SQLite | PostgreSQL |
|----------------|--------|------------|
| **Instalación** | 2 minutos | 5-10 minutos |
| **Dependencias** | Ninguna | PostgreSQL + Memurai |
| **Rendimiento** | Bueno para desarrollo | Excelente |
| **Escalabilidad** | Limitada | Alta |
| **Concurrencia** | Básica | Avanzada |
| **Persistencia** | Archivo local | Servidor |

---

## 🔄 **Cambiar entre Configuraciones**

### De SQLite a PostgreSQL:
1. Ejecutar `setup-local.bat`
2. Usar `npm run dev-postgres`

### De PostgreSQL a SQLite:
1. Ejecutar `setup-sqlite.bat`  
2. Usar `npm run dev-sqlite`

### Detección automática:
- Usar `npm run dev` - detecta automáticamente según `.env`

---

## 📝 **Variables de Entorno Importantes**

```env
# Tipo de base de datos
DATABASE_TYPE=sqlite          # o postgresql

# SQLite
SQLITE_PATH=./data/cronicas.db

# Cache
CACHE_TYPE=memory            # o redis

# Servidor
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Gemini (opcional para IA)
GEMINI_API_KEY=tu_clave_aqui
GEMINI_MODEL=gemini-2.5-flash

# JWT
JWT_SECRET=tu_secreto_seguro
```

---

## 🎉 **¡Listo para desarrollar!**

Después de seguir cualquiera de las opciones:

1. **Backend**: http://localhost:3000
2. **Health Check**: http://localhost:3000/health  
3. **API Docs**: Próximamente

### Próximos pasos:
- Configurar frontend (Vue.js)
- Agregar clave de Gemini para funciones de IA (gratis en https://aistudio.google.com/apikey)
- Probar la funcionalidad del juego

---

**¿Problemas?** Revisa la sección de solución de problemas o ejecuta `npm run test-connections` para diagnosticar. 