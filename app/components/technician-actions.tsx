"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createUnavailability } from "../actions";

type Props = {
  technicianId: number;
  technicianName: string;
  profileHref: string;
  defaultDate: string;
  roleLabel: string;
  summary: string;
};

export function TechnicianActions({ technicianId, technicianName, profileHref, defaultDate, roleLabel, summary }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await createUnavailability(new FormData(event.currentTarget));
      formRef.current?.reset();
      setModalOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar a indisponibilidade.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="technician-actions">
      <button className="technician-cell technician-trigger" type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen}>
        <strong>{technicianName}</strong>
        <span>{roleLabel}</span>
        <small>{summary}</small>
        <i aria-hidden="true">⌄</i>
      </button>

      {menuOpen && (
        <div className="technician-menu" role="menu">
          <Link href={profileHref} role="menuitem" onClick={() => setMenuOpen(false)}>Abrir ficha individual</Link>
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setModalOpen(true); }}>Registrar indisponibilidade</button>
        </div>
      )}

      {modalOpen && (
        <div className="modal-layer" role="presentation">
          <button className="modal-backdrop" type="button" aria-label="Fechar" onClick={() => setModalOpen(false)} />
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby={`modal-title-${technicianId}`}>
            <header className="modal-header">
              <div>
                <p className="eyebrow">Novo registro</p>
                <h2 id={`modal-title-${technicianId}`}>Indisponibilidade de {technicianName}</h2>
              </div>
              <button className="modal-close" type="button" onClick={() => setModalOpen(false)} aria-label="Fechar">×</button>
            </header>

            <p className="modal-help">Se o mês estiver bloqueado, o registro ficará pendente até a aprovação do escalante.</p>

            <form ref={formRef} className="modal-form" onSubmit={submit}>
              <input type="hidden" name="technicianId" value={technicianId} />
              <label>Início<input type="date" name="startDate" defaultValue={defaultDate} required /></label>
              <label>Fim<input type="date" name="endDate" defaultValue={defaultDate} required /></label>
              <label className="modal-reason">Motivo<input name="reason" placeholder="Ex.: férias, consulta ou afastamento" required /></label>
              <label className="check"><input type="checkbox" name="affectsScale" defaultChecked /> Afeta escala</label>
              <label className="check"><input type="checkbox" name="affectsOffice" defaultChecked /> Afeta expediente</label>
              {error && <p className="form-error">{error}</p>}
              <div className="modal-actions">
                <button className="button button-secondary" type="button" onClick={() => setModalOpen(false)}>Cancelar</button>
                <button className="button button-primary" type="submit" disabled={submitting}>{submitting ? "Registrando..." : "Registrar"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
