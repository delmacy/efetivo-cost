"use client";

import { FormEvent, ReactNode, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createOfficeAdjustment, createUnavailability } from "../actions";

type Props = {
  technicianId: number;
  technicianName: string;
  date: string;
  dateLabel: string;
  className?: string;
  children: ReactNode;
};

type ModalKind = "unavailability" | "office" | null;

export function TimelineDayActions({ technicianId, technicianName, date, dateLabel, className = "", children }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function openModal(kind: Exclude<ModalKind, null>) {
    setError("");
    setMenuOpen(false);
    setModal(kind);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const formData = new FormData(event.currentTarget);
      if (modal === "office") await createOfficeAdjustment(formData);
      else await createUnavailability(formData);
      formRef.current?.reset();
      setModal(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o registro.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`day-cell day-actions ${className}`}>
      <button
        className="day-action-trigger"
        type="button"
        title={`${technicianName} em ${dateLabel}`}
        aria-label={`Ações para ${technicianName} em ${dateLabel}`}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((value) => !value)}
      >
        {children}
      </button>

      {menuOpen && (
        <div className="technician-menu day-action-menu" role="menu">
          <strong>{technicianName}</strong>
          <small>{dateLabel}</small>
          <button type="button" role="menuitem" onClick={() => openModal("unavailability")}>Registrar indisponibilidade</button>
          <button type="button" role="menuitem" onClick={() => openModal("office")}>Incluir expediente</button>
        </div>
      )}

      {modal && (
        <div className="modal-layer" role="presentation">
          <button className="modal-backdrop" type="button" aria-label="Fechar" onClick={() => setModal(null)} />
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby={`day-modal-title-${technicianId}-${date}`}>
            <header className="modal-header">
              <div>
                <p className="eyebrow">{dateLabel}</p>
                <h2 id={`day-modal-title-${technicianId}-${date}`}>{modal === "office" ? `Incluir expediente para ${technicianName}` : `Indisponibilidade de ${technicianName}`}</h2>
              </div>
              <button className="modal-close" type="button" onClick={() => setModal(null)} aria-label="Fechar">×</button>
            </header>

            <p className="modal-help">
              {modal === "office"
                ? "O expediente será incluído como comparecimento excepcional nessa data."
                : "Em mês bloqueado, a indisponibilidade ficará pendente de aprovação."}
            </p>

            <form ref={formRef} className="modal-form" onSubmit={submit}>
              <input type="hidden" name="technicianId" value={technicianId} />
              {modal === "office" ? (
                <>
                  <label>Data<input type="date" name="date" defaultValue={date} required /></label>
                  <label>Horas<input type="number" name="hours" min="1" max="24" defaultValue="8" required /></label>
                  <label className="modal-reason">Motivo<input name="reason" placeholder="Ex.: convocação extraordinária" required /></label>
                </>
              ) : (
                <>
                  <label>Início<input type="date" name="startDate" defaultValue={date} required /></label>
                  <label>Fim<input type="date" name="endDate" defaultValue={date} required /></label>
                  <label className="modal-reason">Motivo<input name="reason" placeholder="Ex.: férias, consulta ou afastamento" required /></label>
                  <label className="check"><input type="checkbox" name="affectsScale" defaultChecked /> Afeta escala</label>
                  <label className="check"><input type="checkbox" name="affectsOffice" defaultChecked /> Afeta expediente</label>
                </>
              )}
              {error && <p className="form-error">{error}</p>}
              <div className="modal-actions">
                <button className="button button-secondary" type="button" onClick={() => setModal(null)}>Cancelar</button>
                <button className="button button-primary" type="submit" disabled={submitting}>{submitting ? "Salvando..." : "Salvar"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
