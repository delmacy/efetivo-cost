"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createOfficeAdjustment, createUnavailability } from "../actions";

type Props = {
  technicianId: number;
  technicianName: string;
  profileHref: string;
  defaultDate: string;
  roleLabel: string;
  summary: string;
  groupLabels?: string[];
};

type ModalKind = "unavailability" | "office" | null;

export function TechnicianActions({ technicianId, technicianName, profileHref, defaultDate, roleLabel, summary, groupLabels = [] }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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

  function openModal(kind: Exclude<ModalKind, null>) {
    setError("");
    setMenuOpen(false);
    setModal(kind);
  }

  return (
    <div className="technician-actions">
      <button className="technician-cell technician-trigger" type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen}>
        <strong>{technicianName}</strong>
        <span>{roleLabel}</span>
        {groupLabels.length > 0 && <span className="technician-group-tags">{groupLabels.slice(0, 3).map((group) => <b key={group}>{group}</b>)}</span>}
        <small>{summary}</small>
        <i aria-hidden="true">⌄</i>
      </button>

      {menuOpen && (
        <div className="technician-menu" role="menu">
          <Link href={profileHref} role="menuitem" onClick={() => setMenuOpen(false)}>Abrir ficha individual</Link>
          <button type="button" role="menuitem" onClick={() => openModal("unavailability")}>Registrar indisponibilidade</button>
          <button type="button" role="menuitem" onClick={() => openModal("office")}>Incluir expediente</button>
        </div>
      )}

      {modal && (
        <div className="modal-layer" role="presentation">
          <button className="modal-backdrop" type="button" aria-label="Fechar" onClick={() => setModal(null)} />
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby={`modal-title-${technicianId}`}>
            <header className="modal-header">
              <div>
                <p className="eyebrow">Novo registro</p>
                <h2 id={`modal-title-${technicianId}`}>{modal === "office" ? `Incluir expediente para ${technicianName}` : `Indisponibilidade de ${technicianName}`}</h2>
              </div>
              <button className="modal-close" type="button" onClick={() => setModal(null)} aria-label="Fechar">×</button>
            </header>

            <p className="modal-help">
              {modal === "office"
                ? "Use para registrar comparecimento excepcional em um dia que não estava previsto no expediente."
                : "Se o mês estiver bloqueado, o registro ficará pendente até a aprovação do escalante."}
            </p>

            <form ref={formRef} className="modal-form" onSubmit={submit}>
              <input type="hidden" name="technicianId" value={technicianId} />
              {modal === "office" ? (
                <>
                  <label>Data<input type="date" name="date" defaultValue={defaultDate} required /></label>
                  <label>Horas<input type="number" name="hours" min="1" max="24" defaultValue="8" required /></label>
                  <label className="modal-reason">Motivo<input name="reason" placeholder="Ex.: convocação extraordinária" required /></label>
                </>
              ) : (
                <>
                  <label>Início<input type="date" name="startDate" defaultValue={defaultDate} required /></label>
                  <label>Fim<input type="date" name="endDate" defaultValue={defaultDate} required /></label>
                  <label className="modal-reason">Motivo<input name="reason" placeholder="Ex.: férias, consulta ou afastamento" required /></label>
                  <label className="check"><input type="checkbox" name="affectsScale" defaultChecked /> Afeta as escalas</label>
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
