"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, BrainCircuit, LockKeyhole, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  goalPaceSeconds: number | null;
};

function welcomeMessage(weightKg: number | null): Message {
  return {
    role: "assistant",
    content: `### Listo para entrenarte

Ya tengo tu **plan fijo**, tus carreras recientes y tu perfil${weightKg ? ` de **${weightKg} kg**` : ""}. Puedo revisar tu carga, ritmo, pulso, recuperación y rodilla para decirte qué va bien y qué conviene mejorar.`,
  };
}

function formatGoalPace(seconds: number | null) {
  if (!seconds) return "—";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function CoachSession(props: CoachSessionProps) {
  const [messages, setMessages] = useState<Message[]>([welcomeMessage(props.weightKg)]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const quickPrompts = [
    "Analiza mi semana",
    "¿Qué debo mejorar?",
    "¿Cómo corro la próxima sesión?",
    `Evalúa mi objetivo de ${formatGoalPace(props.goalPaceSeconds)}/km`,
  ];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [busy, messages]);

  async function sendMessage(text: string) {
    const clean = text.trim();
    if (!clean || busy || !props.configured) return;
    const prior = messages.slice(-10);
    setMessages((current) => [...current, { role: "user", content: clean }]);
    setDraft("");
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/backend/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean, history: prior, local_date: localIsoDate() }),
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

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(draft);
    }
  }

  function resetConversation() {
    setMessages([welcomeMessage(props.weightKg)]);
    setDraft("");
    setError("");
  }

  return (
    <div className="coach-workspace">
      <section className="coach-chat panel">
        <header className="coach-toolbar">
          <div className="coach-identity">
            <span className="coach-avatar"><BrainCircuit size={19} /></span>
            <span><strong>PaceOS Coach</strong><small><i /> Conectado a tus datos</small></span>
          </div>
          <button className="new-chat-button" type="button" onClick={resetConversation} disabled={busy}>
            <RotateCcw size={14} /> Nueva conversación
          </button>
        </header>

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
            <div className="chat-thread" aria-live="polite">
              {messages.map((message, index) => (
                <article className={`chat-turn ${message.role}`} key={`${message.role}-${index}`}>
                  <div className="turn-avatar" aria-hidden="true">{message.role === "assistant" ? <Sparkles size={15} /> : "I"}</div>
                  <div className="turn-body">
                    <span className="turn-author">{message.role === "assistant" ? "Coach" : "Tú"}</span>
                    {message.role === "assistant" ? (
                      <div className="coach-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>
                    ) : <p>{message.content}</p>}
                  </div>
                </article>
              ))}
              {busy && (
                <article className="chat-turn assistant">
                  <div className="turn-avatar"><Sparkles size={15} /></div>
                  <div className="turn-body"><span className="turn-author">Coach</span><div className="typing-indicator" aria-label="Analizando"><i /><i /><i /></div></div>
                </article>
              )}
              <div ref={endRef} />
            </div>

            {messages.length === 1 && (
              <div className="prompt-grid" aria-label="Preguntas sugeridas">
                {quickPrompts.map((prompt) => <button type="button" disabled={busy} key={prompt} onClick={() => void sendMessage(prompt)}>{prompt}<ArrowUp size={13} /></button>)}
              </div>
            )}

            <div className="composer-wrap">
              {error && <p className="chat-error">{error}</p>}
              <form className="coach-composer" onSubmit={submit}>
                <textarea rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} maxLength={2000} placeholder="Pregunta por tu semana, recuperación o próxima carrera…" aria-label="Mensaje para el Coach AI" />
                <button disabled={busy || !draft.trim()} aria-label="Enviar mensaje"><ArrowUp size={18} /></button>
              </form>
              <small className="composer-hint">Enter para enviar · Shift + Enter para una nueva línea</small>
            </div>
          </>
        )}
      </section>

      <aside className="coach-data-rail">
        <section className="coach-rail-section">
          <span className="eyebrow">Contexto activo</span>
          <h2>Lo que estoy viendo.</h2>
          <div className="coach-metrics">
            <div><span>Esta semana</span><strong>{props.weekKm}<small> km</small></strong></div>
            <div><span>Media 28 días</span><strong>{props.averageKm}<small> km</small></strong></div>
            <div><span>Tirada más larga</span><strong>{props.longestKm}<small> km</small></strong></div>
          </div>
        </section>
        <section className="coach-rail-section coach-guardrail">
          <ShieldCheck size={18} />
          <div><strong>Plan protegido</strong><p>Analizo tu ejecución y tu estado, pero nunca modifico el calendario sin tu permiso.</p></div>
        </section>
        <section className="coach-rail-section coach-privacy">
          <LockKeyhole size={15} /><p>{props.privacy}</p>
        </section>
      </aside>
    </div>
  );
}
