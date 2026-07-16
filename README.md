# Chicago Marathon Coach

Visualizador local para preparar la Maratón de Chicago 2026 con entrenamientos exportados desde Strava.

El repositorio contiene solamente el código. Las claves, la base de datos y los archivos personales de Strava quedan fuera de Git.

## Qué muestra

- La próxima sesión y los dos pasos siguientes.
- Volumen actual, promedio semanal y tirada más larga.
- Evolución por semanas e historial de carreras.
- Plan fijo hasta el 11 de octubre de 2026, separado del seguimiento real.
- Coach AI con el contexto real del atleta.

## Actualización semanal

La ruta gratuita usa el ZIP oficial de Strava:

1. En Strava web abre **Settings → My Account**.
2. En **Download your account**, pulsa **Get Started → Request download**.
3. Descarga el ZIP recibido.
4. En la aplicación abre **Perfil → Cargar entrenamientos**.

La importación lee `activities.csv` y actualiza carreras sin duplicarlas. Guarda distancia, tiempo, desnivel y frecuencia cardiaca cuando están disponibles.

## Coach AI

El Coach AI recibe métricas agregadas, perfil, molestias, carreras recientes y próximas semanas. No envía rutas GPS ni el ZIP. Se activa en `.env`:

```text
OPENAI_API_KEY=tu_clave_privada
OPENAI_MODEL=gpt-5.6-luna
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
