# Chicago Marathon Coach

Visualizador local para preparar la Maratón de Chicago 2026 con Apple Health como fuente principal.

El repositorio contiene solamente el código. Las claves, la base de datos y los archivos personales de Strava quedan fuera de Git.

## Qué muestra

- La próxima sesión y los dos pasos siguientes.
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

1. **Chicago · Workouts**: `Workouts`, JSON v2, rutas y métricas incluidas, agrupación por minutos.
2. **Chicago · Recovery**: `Health Metrics`, JSON v2, sueño agregado y agrupación diaria.

Activa `Batch Requests` y utiliza `X-API-Key` como encabezado. La Raspberry debe tener una URL alcanzable desde el iPhone; para acceso fuera de la red local utiliza HTTPS.

El ZIP oficial de Apple Health sirve para cargar el historial inicial. La importación ZIP se añadirá separadamente para no mezclarla con los envíos automáticos.

## Importación anterior desde Strava

La app conserva compatibilidad con el ZIP oficial de Strava. La importación lee `activities.csv`, evita duplicados y guarda los detalles FIT/GPX cuando están disponibles.

## Coach AI

El Coach AI recibe métricas agregadas, perfil, molestias, carreras recientes y próximas semanas. No envía rutas GPS ni el ZIP. Se activa en `.env`:

```text
OPENAI_API_KEY=tu_clave_privada
OPENAI_MODEL=gpt-5.6-luna
APPLE_HEALTH_API_KEY=una_clave_larga_y_aleatoria
```

La API de OpenAI se factura por separado y la clave permanece en el backend local.

## Ejecutar

### Instalación inicial

Requisitos: Python 3.11 o superior y Node.js 20 o superior.

En Windows PowerShell:

```powershell
git clone https://github.com/Ivo196/strava-agent.git
Set-Location strava-agent
./setup.ps1
```

El script crea el entorno virtual, instala backend y frontend, y genera `.env` desde el ejemplo sin incluir ninguna clave.

Para activar Coach AI, completa `OPENAI_API_KEY` dentro de `.env`. La aplicación funciona sin esa clave; solamente el chat estará desactivado.

### Iniciar la aplicación

Backend:

```powershell
./.venv/Scripts/python.exe -m uvicorn api:app --reload --port 8000
```

Frontend:

```powershell
Set-Location frontend
npm run dev
```

Abre <http://localhost:3000>.

Después de una instalación nueva, entra en **Perfil** e importa tu propio ZIP de Strava. La base se crea localmente en `data/strava_agent.db` y nunca se sube al repositorio.

## Uso con OpenClaw

OpenClaw puede clonar este repositorio y seguir la sección **Instalación inicial**. Si el repositorio es privado, debe disponer de una credencial de GitHub con acceso de lectura.

## Verificación

```powershell
./.venv/Scripts/python.exe -m pytest -q --basetemp "$env:USERPROFILE/codex-pytest-strava" -p no:cacheprovider
Set-Location frontend
npm run lint
npm run build
```

## Alcance deportivo

La carga es una referencia para comparar semanas, no una predicción de lesión. La app no modifica el calendario automáticamente; ante dolor o enfermedad, detén la sesión y busca orientación profesional. No sustituye una evaluación médica.
