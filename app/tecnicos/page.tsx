import Link from "next/link";
import { createTechnician } from "../actions";
import { prisma } from "../../lib/prisma";
import { ensureInitialData, DUTY_24H, ON_CALL } from "../../lib/schedule";

export const dynamic = "force-dynamic";

export default async function TechniciansPage() {
  await ensureInitialData();

  const [technicians, groups] = await Promise.all([
    prisma.technician.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: {
        groups: { include: { group: true }, orderBy: { isPrimary: "desc" } },
        assignments: { select: { scheduleType: true } },
        _count: { select: { unavailabilities: true } },
      },
    }),
    prisma.technicianGroup.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <main>
      <header className="topbar">
        <div><p className="eyebrow">Administração</p><h1>Técnicos</h1><span className="page-hint">10 técnicos de demonstração, com escalas e especialidades configuráveis.</span></div>
        <div className="header-actions"><Link className="button button-secondary" href="/grupos">Grupos</Link><Link className="button button-secondary" href="/">Voltar à escala</Link></div>
      </header>

      <section className="form-panel">
        <div><p className="eyebrow">Novo cadastro</p><h2>Cadastrar técnico</h2><p>A data de referência define o primeiro dia de expediente do ciclo dia sim, dia não.</p></div>
        <form action={createTechnician} className="technician-form expanded-technician-form">
          <label className="reason-field">Nome<input name="name" placeholder="Nome do técnico" required /></label>
          <label>Data-base do expediente<input type="date" name="referenceDate" required /></label>
          <label>Horas por expediente<input type="number" name="dailyHours" min="1" max="24" defaultValue="8" required /></label>
          <label className="check"><input type="checkbox" name="participatesScale" defaultChecked /> Participa da escala 24h</label>
          <label className="check"><input type="checkbox" name="participatesOnCall" defaultChecked /> Participa do sobreaviso</label>
          <fieldset className="group-selector">
            <legend>Grupos de especialidade</legend>
            {groups.map((group) => <label className="check group-option" key={group.id}><input type="checkbox" name="groupIds" value={group.id} /> {group.name}</label>)}
          </fieldset>
          <button className="button button-primary" type="submit">Cadastrar técnico</button>
        </form>
      </section>

      <section className="people-grid">
        {technicians.map((technician) => {
          const dutyCount = technician.assignments.filter((item) => item.scheduleType === DUTY_24H).length;
          const onCallCount = technician.assignments.filter((item) => item.scheduleType === ON_CALL).length;
          return (
            <Link className="person-card" href={`/tecnicos/${technician.id}`} key={technician.id}>
              <div>
                <strong>{technician.name}</strong>
                <span>{[technician.participatesScale ? "24h" : "", technician.participatesOnCall ? "Sobreaviso" : "", "Expediente"].filter(Boolean).join(" + ")}</span>
                <div className="person-group-tags">{technician.groups.map((membership) => <b key={membership.groupId}>{membership.group.name}</b>)}</div>
              </div>
              <div className="person-metrics"><span>{dutyCount} serviços 24h</span><span>{onCallCount} sobreavisos</span><span>{technician._count.unavailabilities} indisponibilidades</span></div>
              <small>{technician.active ? "Ativo" : "Inativo"} · {technician.dailyHours}h por expediente</small>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
