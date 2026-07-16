"use client";

import { FormEvent, useState } from "react";
import { ArrowUp, LockKeyhole, Sparkles } from "lucide-react";
import { API_URL } from "@/lib/api";
import { localIsoDate } from "@/lib/local-clock";

type Message = { role: "user" | "assistant"; content: string };

type CoachSessionProps = {
  configured: boolean;
  model: string;
  privacy: string;
  weekKm: number;
  averageKm: number;
  longestKm: number;
  weightKg: number | null;
};

const quickPrompts = ["Analiza mi semana", "¿Qué corro mañana?", "¿Qué debo mejorar?"];

export function CoachSession(props: CoachSessionProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Tengo tu plan, tus carreras recientes y tu perfil de ${props.weightKg ?? "peso no informado"}${props.weightKg ? " kg" : ""}. ¿Qué quieres revisar?`,
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendMessage(text: string) {
    const clean = text.trim();
    if (!clean || busy || !props.configured) return;
    const prior = messages.slice(-10);
    const userMessage: Message = { role: "user", content: clean };
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/api/coach/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          history: prior,
          local_date: localIsoDate(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "El Coach AI no pudo responder.");
      setMessages((current) => [...current, { role: "assistant", content: result.answer }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  return (
    <div className="coach-layout">
      <section className="coach-main panel">
        <div className="coach-context" aria-label="Contexto del entrenador">
          <div><span>Esta semana</span><strong>{props.weekKm} km</strong></div>
          <div><span>Media 28 días</span><strong>{props.averageKm} km</strong></div>
          <div><span>Tirada larga</span><strong>{props.longestKm} km</strong></div>
          <div><span>Peso</span><strong>{props.weightKg ?? "—"} kg</strong></div>
        </div>

        {!props.configured ? (
          <div className="ai-setup">
            <div className="ai-orb"><LockKeyhole size={26} /></div>
            <span className="eyebrow">Activación necesaria</span>
            <h2>Conecta tu propia clave de OpenAI.</h2>
            <p>Agrega estas líneas al archivo <code>.env</code> del proyecto y reinicia la API:</p>
            <pre>OPENAI_API_KEY=tu_clave_privada{"\n"}OPENAI_MODEL={props.model}</pre>
            <small>La API de OpenAI se factura por separado. No pegues la clave en el chat ni en el navegador.</small>
          </div>
        ) : (
          <>
            <div className="chat-messages" aria-live="polite">
              {messages.map((message, index) => (
                <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                  {message.role === "assistant" && <Sparkles size={15} />}
                  <p>{message.content}</p>
                </div>
              ))}
              {busy && <div className="chat-message assistant thinking"><Sparkles size={15} /><p>Revisando carga, plan y recuperación…</p></div>}
            </div>
            <div className="quick-prompts">
              {quickPrompts.map((prompt) => <button disabled={busy} key={prompt} onClick={() => void sendMessage(prompt)}>{prompt}</button>)}
            </div>
            <form className="coach-composer" onSubmit={submit}>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Pregúntale por tu semana, ritmo o próxima sesión…" aria-label="Mensaje para el Coach AI" />
              <button disabled={busy || !draft.trim()} aria-label="Enviar"><ArrowUp size={18} /></button>
            </form>
            {error && <p className="form-message error">{error}</p>}
          </>
        )}
      </section>

      <aside className="coach-side panel">
        <span className="eyebrow">Cómo trabaja</span>
        <h2>Consejo con contexto real.</h2>
        <p>Lee volumen, ritmos, pulso, perfil y próximas sesiones. Tiene en cuenta tu rodilla y evita saltos bruscos de carga.</p>
        <div className="privacy-note"><LockKeyhole size={16} /><span>{props.privacy}</span></div>
        <p className="plan-note">El Coach analiza tu ejecución y tu estado. El calendario está bloqueado y solo cambia si tú lo pides expresamente.</p>
      </aside>
    </div>
  );
}
