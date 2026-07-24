import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = {
  APPROVED: "Aprovada",
  PENDING: "Pendente",
  REJECTED: "Rejeitada",
};

export default async function TechnicianPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const technician = await prisma.technician.findUnique({
    where: { id: Number(id) },
    include: {
      unavailabilities: { orderBy: [{ createdAt: "desc" }, { startDate: "desc" }] },
      assignments: { orderBy: { date: "desc" }, take: 12 },
    },
  });

  if (!technician) notFound();

  return (
    <main>
      <header className="topbar">
        <div><p className="eyebrow">Ficha individual</p><h1>{technician.name}</h1></div>
        <div className="header-actions"><Link className="button button-secondary" href="/tecnicos">Todos os técnicos</Link><Link className="button button-primary" href="/#nova-indisponibilidade">Nova indisponibilidade</Link></div>
      </header>

      <section className="summary-grid technician-summary">
        <article className="summary-card"><span>Regime</span><strong>{technician.participatesScale ? "Escala + expediente" : "Expediente"}</strong><small>Ciclo dia sim, dia não</small></article>
        <article className="summary-card"><span>Jornada-base</span><strong>{technician.dailyHours} horas</strong><small>Por dia de expediente</small></article>
        <article className="summary-card"><span>Indisponibilidades</span><strong>{technician.unavailabilities.length}</strong><small>Histórico completo</small></article>
        <article className="summary-card"><span>Situação</span><strong>{technician.active ? "Ativo" : "Inativo"}</strong><small>Data-base: {technician.referenceDate.toLocaleDateString("pt-BR")}</small></article>
      </section>

      <section className="history-panel">
        <div className="section-heading"><div><p className="eyebrow">Histórico</p><h2>Indisponibilidades</h2></div><span>Mais recentes primeiro</span></div>
        {technician.unavailabilities.length === 0 ? (
          <div className="empty-panel"><strong>Nenhuma indisponibilidade cadastrada.</strong><span>Os registros futuros aparecerão nesta página.</span></div>
        ) : (
          <div className="history-list">
            {technician.unavailabilities.map((item) => (
              <article className="history-item" key={item.id}>
                <div className="history-date"><strong>{item.startDate.toLocaleDateString("pt-BR")}</strong><span>{item.endDate.toLocaleDateString("pt-BR")}</span></div>
                <div className="history-content"><strong>{item.reason}</strong><span>{item.affectsScale ? "Afeta escala" : "Não afeta escala"} · {item.affectsOffice ? "Afeta expediente" : "Não afeta expediente"}</span><small>Registrada em {item.createdAt.toLocaleString("pt-BR")}</small></div>
                <span className={`history-status status-text-${item.status.toLowerCase()}`}>{statusLabel[item.status]}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="history-panel">
        <div className="section-heading"><div><p className="eyebrow">Escala</p><h2>Serviços recentes</h2></div></div>
        <div className="service-list">
          {technician.assignments.length === 0 ? <span>Nenhum serviço cadastrado.</span> : technician.assignments.map((assignment) => <div className="service-row" key={assignment.id}><strong>{assignment.date.toLocaleDateString("pt-BR")}</strong><span>{assignment.hours} horas</span><small>{assignment.origin}</small></div>)}
        </div>
      </section>
    </main>
  );
}
