"use client";

import { Check, LoaderCircle, Watch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { DailyAgendaItem } from "@/lib/types";

type CompletionState = Pick<
  DailyAgendaItem,
  "completed" | "completion_source" | "completion_locked"
>;

function sourceLabel(source: DailyAgendaItem["completion_source"]) {
  if (source === "apple_watch") return "Apple Watch";
  if (source === "fitbit") return "Fitbit";
  return "Hecho";
}

export function SessionCompletionCheck({
  date,
  initial,
  onChange,
  compact = false,
}: {
  date: string;
  initial: CompletionState;
  onChange?: (next: CompletionState) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setState(initial);
  }, [initial.completed, initial.completion_locked, initial.completion_source]);

  async function toggle() {
    if (state.completion_locked || saving) return;
    const previous = state;
    const next: CompletionState = {
      completed: !state.completed,
      completion_source: state.completed ? null : "manual",
      completion_locked: false,
    };
    setState(next);
    onChange?.(next);
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/backend/plan/completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_date: date,
          completed: next.completed,
        }),
      });
      if (!response.ok) throw new Error("No se pudo guardar");
      router.refresh();
    } catch {
      setState(previous);
      onChange?.(previous);
      setError("No se guardó. Inténtalo otra vez.");
    } finally {
      setSaving(false);
    }
  }

  const detected = state.completion_locked;
  return (
    <div className={`session-check-wrap${compact ? " is-compact" : ""}`}>
      <button
        aria-checked={state.completed}
        aria-label={
          detected
            ? `Sesión detectada automáticamente por ${sourceLabel(state.completion_source)}`
            : state.completed
              ? "Marcar sesión como pendiente"
              : "Marcar sesión como hecha"
        }
        className={`session-check${state.completed ? " is-checked" : ""}${detected ? " is-detected" : ""}`}
        disabled={detected || saving}
        onClick={toggle}
        role="checkbox"
        type="button"
      >
        <span aria-hidden="true">
          {saving ? <LoaderCircle className="session-check-spinner" size={15} /> : detected ? <Watch size={15} /> : <Check size={15} />}
        </span>
        <b>{detected ? sourceLabel(state.completion_source) : state.completed ? "Hecho" : "Pendiente"}</b>
      </button>
      {error && <small className="session-check-error" role="alert">{error}</small>}
    </div>
  );
}
