import { ServerOff } from "lucide-react";

export function OfflineState() {
  return (
    <main className="offline-state">
      <ServerOff size={26} />
      <h1>No pude conectar con el entrenador</h1>
      <p>Inicia la API local con <code>python -m uvicorn api:app --reload</code>.</p>
    </main>
  );
}
