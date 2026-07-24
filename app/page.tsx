import { approveUnavailability, createUnavailability, rejectUnavailability } from "./actions";
import { getDashboard } from "../lib/schedule";

type DayStatus = "office" | "duty" | "unavailable" | "compensation" | "pending" | "off";

const statusLabel: Record<DayStatus, string> = {
  office: "Expediente",
  duty: "Serviço",
  unavailable: "Indisponível",
  compensation: "Compensação",
  pending: "Pendente",
  off: "Folga",
};

function StatusMark({ status }: { status: DayStatus }) {
  return <span className={`status status-${status}`} title={statusLabel[status]}>{statusLabel[status][0]}</span>;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function officeStatus(referenceDate: Date, date: Date): DayStatus {
  const diff = Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate()).getTime()) / 86400000);
  return Math.abs(diff) % 2 === 0 ? "office" : "off";
}

export const dynamic = "force-dynamic";

export default async function Home() {
  const dashboard = await getDashboard();
  const { technicians, assignments, unavailabilities, control, year, month } = dashboard;
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const pending = unavailabilities.filter((item) => item.status === "PENDING");
  const scaleParticipants = technicians.filter((item) => item.participatesScale);

  const dutyCount = (technicianId: number) => assignments.filter((item) => item.technicianId === technicianId).length;
  const monthlyHours = (technicianId: number) => {
    const technician = technicians.find((item) => item.id === technicianId)!;
    const officeDays = days.filter((day) => officeStatus(technician.referenceDate, new Date(year, month - 1, day)) === "office").length;
    return officeDays * technician.dailyHours + dutyCount(technicianId) * 24;
  };

  const lightest = [...scaleParticipants].sort((a, b) => monthlyHours(a.id) - monthlyHours(b.id))[0];

  function dayStatuses(technicianId: number, day: number): DayStatus[] {
    const technician = technicians.find((item) => item.id === technicianId)!;
    const date = new Date(year, month - 1, day);
    const statuses: DayStatus[] = [officeStatus(technician.referenceDate, date)];
    if (assignments.some((item) => item.technicianId === technicianId && isSameDay(item.date, date))) statuses.push("duty");
    const affecting = unavailabilities.find((item) => item.technicianId === technicianId && item.startDate <= date && item.endDate >= date && item.status !== "REJECTED");
    if (affecting) statuses.push(affecting.status === "PENDING" ? "pending" : "unavailable");
    return statuses;
  }

  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));

  return (
    <main>
      <header className="topbar">
        <div><p className="eyebrow">Planejamento operacional</p><h1>Efetivo COST</h1></div>
        <div className="header-actions"><a className="button button-secondary" href="#pendencias">Pendências <strong>{pending.length}</strong></a><a className="button button-primary" href="#nova-indisponibilidade">Nova indisponibilidade</a></div>
      </header>

      <section className="summary-grid">
        <article className="summary-card"><span>Mês exibido</span><strong className="capitalize">{monthName}</strong><small>Escala {control?.status === "LOCKED" ? "bloqueada" : "aberta"} · versão {control?.version ?? 1}</small></article>
        <article className="summary-card"><span>Participantes da escala</span><strong>{scaleParticipants.length} técnicos</strong><small>{assignments.length} serviços previstos</small></article>
        <article className="summary-card"><span>Indisponibilidades</span><strong>{pending.length} pendente{pending.length === 1 ? "" : "s"}</strong><small>{unavailabilities.length} registro(s) no mês</small></article>
        <article className="summary-card"><span>Menor carga atual</span><strong>{lightest?.name ?? "—"}</strong><small>{lightest ? monthlyHours(lightest.id) : 0} horas computadas</small></article>
      </section>

      <section className="toolbar">
        <div className="segmented"><button>Hoje</button><button className="active">Mês</button><button>Trimestre</button><button>Ano</button></div>
        <div className="segmented"><button>Escala</button><button>Expediente</button><button className="active">Combinado</button></div>
      </section>

      <section className="desktop-timeline" aria-label="Timeline mensal da equipe">
        <div className="timeline-scroll">
          <div className="timeline-grid timeline-header" style={{ gridTemplateColumns: `210px repeat(${daysInMonth}, 42px)` }}>
            <div className="technician-heading">Técnico</div>
            {days.map((day) => <div className="day-heading" key={day}><span>{day}</span><small>{new Intl.DateTimeFormat("pt-BR", { weekday: "narrow" }).format(new Date(year, month - 1, day))}</small></div>)}
          </div>
          {technicians.map((technician) => (
            <div className="timeline-grid timeline-row" style={{ gridTemplateColumns: `210px repeat(${daysInMonth}, 42px)` }} key={technician.id}>
              <div className="technician-cell"><strong>{technician.name}</strong><span>{technician.participatesScale ? "Escala + expediente" : "Expediente"}</span><small>{monthlyHours(technician.id)}h · {dutyCount(technician.id)} serviços</small></div>
              {days.map((day) => <div className="day-cell" key={day}>{dayStatuses(technician.id, day).map((status, index) => <StatusMark key={`${status}-${index}`} status={status} />)}</div>)}
            </div>
          ))}
        </div>
      </section>

      <section className="mobile-view">
        <div className="mobile-date"><button>‹</button><div><span>Visão da equipe</span><strong>Dia 24 de {monthName}</strong></div><button>›</button></div>
        <div className="mobile-list">{technicians.map((technician) => <article className="technician-card" key={technician.id}><div><strong>{technician.name}</strong><span>{technician.participatesScale ? "Escala + expediente" : "Expediente"}</span></div><div className="mobile-statuses">{dayStatuses(technician.id, 24).map((status, index) => <span className={`pill pill-${status}`} key={`${status}-${index}`}>{statusLabel[status]}</span>)}</div><footer><span>{monthlyHours(technician.id)}h no mês</span><span>{dutyCount(technician.id)} serviços</span></footer></article>)}</div>
      </section>

      <section className="form-panel" id="nova-indisponibilidade">
        <div><p className="eyebrow">Novo registro</p><h2>Informar indisponibilidade</h2><p>Em mês bloqueado, o registro ficará pendente até a decisão do escalante.</p></div>
        <form action={createUnavailability} className="unavailability-form">
          <label>Técnico<select name="technicianId" required>{technicians.map((technician) => <option value={technician.id} key={technician.id}>{technician.name}</option>)}</select></label>
          <label>Início<input type="date" name="startDate" defaultValue="2026-07-15" required /></label>
          <label>Fim<input type="date" name="endDate" defaultValue="2026-07-18" required /></label>
          <label className="reason-field">Motivo<input name="reason" placeholder="Ex.: afastamento não programado" required /></label>
          <label className="check"><input type="checkbox" name="affectsScale" defaultChecked /> Afeta escala</label>
          <label className="check"><input type="checkbox" name="affectsOffice" defaultChecked /> Afeta expediente</label>
          <button className="button button-primary" type="submit">Registrar</button>
        </form>
      </section>

      <section id="pendencias">
        {pending.length === 0 ? <div className="empty-panel"><strong>Nenhuma pendência.</strong><span>As indisponibilidades aprovadas já aparecem na timeline.</span></div> : pending.map((item) => {
          const affected = assignments.filter((assignment) => assignment.technicianId === item.technicianId && assignment.date >= item.startDate && assignment.date <= item.endDate);
          const suggestion = [...scaleParticipants].filter((candidate) => candidate.id !== item.technicianId).sort((a, b) => monthlyHours(a.id) - monthlyHours(b.id))[0];
          return <section className="pending-panel" key={item.id}><div><p className="eyebrow">Ação necessária</p><h2>Indisponibilidade em mês bloqueado</h2><p>{item.technician.name} informou indisponibilidade de {item.startDate.toLocaleDateString("pt-BR")} a {item.endDate.toLocaleDateString("pt-BR")}. {affected.length} serviço(s) afetado(s).</p></div><div className="suggestion"><span>Sugestão de substituição</span><strong>{suggestion?.name ?? "Sem candidato"}</strong><small>Menor carga mensal entre os participantes disponíveis.</small></div><div className="pending-actions"><form action={rejectUnavailability}><input type="hidden" name="id" value={item.id} /><button className="button button-secondary">Rejeitar</button></form><form action={approveUnavailability}><input type="hidden" name="id" value={item.id} /><button className="button button-primary">Aprovar e recalcular</button></form></div></section>;
        })}
      </section>
    </main>
  );
}
