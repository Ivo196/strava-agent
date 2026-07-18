# PaceOS

Plataforma local de running intelligence con Apple Health como fuente principal, análisis por actividad, recuperación, dinámica de carrera, plan fijo y Coach AI.

Google Health complementa Apple Health con los datos de recuperación de Fitbit: sueño, HRV, frecuencia cardiaca en reposo, SpO₂, respiración, temperatura, zonas cardiacas y VO₂ máx.

El repositorio contiene solamente el código. Las claves, la base de datos y los datos personales de salud quedan fuera de Git.

## Qué muestra

- Qué hacer hoy, mañana y pasado: carrera, fuerza, bicicleta o descanso.
- La agenda integrada de los próximos siete días.
- Volumen actual, promedio semanal y tirada más larga.
- Evolución por semanas e historial de carreras.
- Plan fijo hasta el 11 de octubre de 2026, separado del seguimiento real.
- Coach AI con el contexto real del atleta.

## Sincronización automática con Apple Health

Health Auto Export puede enviar automáticamente los entrenamientos y las métricas de recuperación a:

```text
POST https://tu-servidor/api/import/apple-health
X-API-Key: la-clave-configurada-en-env
Content-Type: application/json
```

Configura `APPLE_HEALTH_API_KEY` en `.env` antes de iniciar la API. El receptor acepta el formato JSON v2 de Health Auto Export, deduplica los reenvíos y conserva:

- Carreras, distancia, duración, frecuencia cardiaca, elevación y recorrido.
- Sueño, HRV, frecuencia cardiaca en reposo, peso, pasos y demás métricas enviadas.
- Otros entrenamientos como fuerza y bicicleta para análisis posterior.

Se recomiendan dos automatizaciones:

1. **PaceOS · Workouts**: `Workouts`, JSON v2, rutas y métricas incluidas, agrupación por minutos.
2. **PaceOS · Recovery**: `Health Metrics`, JSON v2, sueño agregado y agrupación diaria.

Activa `Batch Requests` y utiliza `X-API-Key` como encabezado. La Raspberry debe tener una URL alcanzable desde el iPhone; para acceso fuera de la red local utiliza HTTPS.

El ZIP oficial de Apple Health sirve para cargar el historial inicial. La importación ZIP se añadirá separadamente para no mezclarla con los envíos automáticos.

## Google Health y Fitbit

Registra un cliente web en Google Cloud con Google Health API y agrega este callback:

```text
http://localhost:8000/api/google-health/callback
```

Descarga el JSON del cliente en `data/google-health-client.json`. Esa carpeta está excluida de Git. En **Datos**, pulsa **Conectar con Google** y autoriza los permisos de solo lectura. La primera conexión carga el historial reciente y las siguientes sincronizaciones actualizan solamente la base local.

## Coach AI

El Coach AI recibe métricas agregadas, perfil, molestias, carreras recientes y próximas semanas. No envía rutas GPS ni el ZIP. Se activa en `.env`:

```text
OPENAI_API_KEY=tu_clave_privada
OPENAI_MODEL=gpt-5.6-luna
APPLE_HEALTH_API_KEY=una_clave_larga_y_aleatoria
```

La API de OpenAI se factura por separado y la clave permanece en el backend local.

## Instalación reproducible

El repositorio es público y no requiere una credencial de GitHub para clonarlo:

```text
https://github.com/Ivo196/strava-agent
```

### Requisitos

- Git.
- Python 3.11 o superior.
- Node.js 20 o superior con npm.
- Windows PowerShell 5+ o Linux/macOS/Raspberry Pi con Bash y `curl`.

### Windows

En PowerShell:

```powershell
git clone https://github.com/Ivo196/strava-agent.git
Set-Location strava-agent
powershell -ExecutionPolicy Bypass -File ./setup.ps1
powershell -ExecutionPolicy Bypass -File ./start.ps1
```

Abre <http://localhost:3100>. Para detenerlo:

```powershell
powershell -ExecutionPolicy Bypass -File ./stop.ps1
```

### Linux, macOS o Raspberry Pi

```bash
git clone https://github.com/Ivo196/strava-agent.git
cd strava-agent
./setup.sh
./start.sh
```

Abre `http://IP-DEL-EQUIPO:3100`. Para detenerlo:

```bash
./stop.sh
```

Los scripts:

- crean el entorno virtual;
- instalan backend y frontend;
- compilan Next.js en modo producción;
- crean `.env` con una clave aleatoria para Health Auto Export;
- arrancan API en el puerto `8000` y web en el `3100`;
- guardan PID y logs locales en `.run/`, que está fuera de Git.

Para activar Coach AI, completa `OPENAI_API_KEY` dentro de `.env` antes de arrancar. La aplicación funciona sin esa clave; solamente el chat estará desactivado.

## Qué configurar después de instalar

### Instalación limpia

1. Abre `.env` y, si quieres Coach AI, agrega `OPENAI_API_KEY`.
2. Copia el valor local de `APPLE_HEALTH_API_KEY` en el encabezado `X-API-Key` de las automatizaciones de Health Auto Export.
3. Cambia la URL de esas automatizaciones a `http://IP-DEL-EQUIPO:8000/api/import/apple-health`.
4. Copia el JSON OAuth de Google en `data/google-health-client.json`.
5. En Google Cloud agrega como redirect URI `http://localhost:8000/api/google-health/callback` para uso en la misma computadora.
6. Abre **Datos** y conecta Fitbit/Google Health.

La base nueva se crea en `data/strava_agent.db`. Apple Health y Fitbit volverán a poblarla al sincronizar.

### Migrar exactamente esta instalación

GitHub no contiene datos médicos ni secretos. Para conservar el historial y las conexiones actuales, copia por un canal privado desde la máquina anterior:

- `.env`
- la carpeta `data/`

Colócalos en la raíz del repositorio nuevo **después de clonarlo y antes de arrancar**. Nunca los agregues a Git, a un issue o a un mensaje público.

## Uso con OpenClaw

OpenClaw necesita acceso a la herramienta de shell/`exec`, Git y salida de red hacia GitHub. El repositorio es público, por lo que no necesita token.

Mensaje recomendado para OpenClaw en Windows:

```text
Clona https://github.com/Ivo196/strava-agent.git en una carpeta local llamada paceos.
Lee el README completo. Comprueba Git, Python 3.11+ y Node.js 20+.
En Windows ejecuta setup.ps1 y start.ps1 con ExecutionPolicy Bypass.
En Linux/Raspberry ejecuta setup.sh y start.sh. No publiques ni confirmes en Git .env,
data/, credenciales, tokens ni archivos de salud. Verifica que respondan
http://127.0.0.1:8000/api/health y http://127.0.0.1:3100.
Al terminar, dime la ruta de instalación, la URL local y qué configuración
manual falta para Apple Health, Google Health y Coach AI.
```

En Linux/Raspberry reemplaza `setup.ps1` y `start.ps1` por `setup.sh` y `start.sh`.

OpenClaw no debe inventar claves ni pedirte que las pegues en el chat. Puede generar la instalación limpia; las credenciales privadas se agregan localmente.

## Verificación

```powershell
./.venv/Scripts/python.exe -m pytest -q --basetemp "$env:USERPROFILE/codex-pytest-paceos" -p no:cacheprovider
Set-Location frontend
npm run lint
npm run build
```

## Alcance deportivo

La carga es una referencia para comparar semanas, no una predicción de lesión. La app no modifica el calendario automáticamente; ante dolor o enfermedad, detén la sesión y busca orientación profesional. No sustituye una evaluación médica.
