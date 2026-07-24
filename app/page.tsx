import Link from "next/link";
import { approveUnavailability, rejectUnavailability } from "./actions";
import { TechnicianActions } from "./components/technician-actions";
import { getDashboard } from "../lib/schedule";

type DayStatus = "office" | "duty" | "unavailable" | "exit" | "rest" | "pending" | "off";
type Period = "month" | "quarter" | "year";
type Layer = "scale" | "office" | "combined";
type DashboardView = "timeline" | "agenda";
type SearchParams = Promise<{ ano?: string; mes?: string; periodo?: string; camada?: string; visao?: string }>;

const statusLabel: Record<DayStatus, string> = {
  office: "Expediente",
  duty: "Serviço 24h",
  unavailable: "Indisponível",
  exit: "Saída",
  rest: "Descanso",
  pending: "Pendente",
  off: "Folga",
};

const statusShort: Record<DayStatus, string> = {
  office: "E",
  duty: "S",
  unavailable: "I",
  exit: "Sa",
  rest: "D",
  pending: "P",
  off: "F",
};

function StatusMark({ status }: { status: DayStatus }) {
  return <span className={`status status-${status}`} title={statusLabel[status]}>{statusShort[status]}</span>;
}

function dateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isBaseOfficeDay(referenceDate: Date, date: Date) {
  const diff = Math.floor((dateOnly(date).getTime() - dateOnly(referenceDate).getTime()) / 86400000);
  return Math.abs(diff) % 2 === 0;
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function holidaysFor(year: number) {
  const easter = easterSunday(year);
  const goodFriday = addDays(easter, -2);
  return new Map([
    [`${year}-0-1`, "Confraternização Universal"],
    [`${year}-3-21`, "Tiradentes"],
    [`${year}-4-1`, "Dia do Trabalho"],
    [`${year}-8-7`, "Independência do Brasil"],
    [`${year}-9-12`, "Nossa Senhora Aparecida"],
    [`${year}-10-2`, "Finados"],
    [`${year}-10-15`, "Proclamação da República"],
    [`${year}-10-20`, "Consciência Negra"],
    [`${year}-11-25`, "Natal"],
    [`${goodFriday.getFullYear()}-${goodFriday.getMonth()}-${goodFriday.getDate()}`, "Paixão de Cristo"],
  ]);
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function inputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dashboardHref(date: Date, period: Period, layer: Layer, view: DashboardView) {
  return `/?ano=${date.getFullYear()}&mes=${date.getMonth() + 1}&periodo=${period}&camada=${layer}&visao=${view}`;
}

function periodStart(anchor: Date, period: Period) {
  if (period === "quarter") return new Date(anchor.getFullYear(), Math.floor(anchor.getMonth() / 3) * 3, 1);
  if (period === "year") return new Date(anchor.getFullYear(), 0, 1);
  return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
}

function periodMonths(period: Period) {
  if (period === "quarter") return 3;
  if (period === "year") return 12;
  return 1;
}

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const today = new Date();
  const anchor = new Date(Number(query.ano) || today.getFullYear(), (Number(query.mes) || today.getMonth() + 1) - 1, 1);
  const period: Period = query.periodo === "quarter" || query.periodo === "year" ? query.periodo : "month";
  const layer: Layer = query.camada === "scale" || query.camada === "office" ? query.camada : "combined";
  const view: DashboardView = query.visao === "agenda" ? "agenda" : "timeline";
  const start = periodStart(anchor, period);
  const monthsCount = periodMonths(period);
  const dashboard = await getDashboard(start.getFullYear(), start.getMonth() + 1, monthsCount);
  const { technicians, assignments, assignmentContext, unavailabilities, controls, from, to } = dashboard;

  const displayDays: Date[] = [];
  for (let date = new Date(from); date <= to; date = addDays(date, 1)) displayDays.push(new Date(date));

  const holidayMaps = new Map<number, Map<string, string>>();
  for (const date of displayDays) if (!holidayMaps.has(date.getFullYear())) holidayMaps.set(date.getFullYear(), holidaysFor(date.getFullYear()));
  const holidayFor = (date: Date) => holidayMaps.get(date.getFullYear())?.get(dateKey(date));

  const pending = unavailabilities.filter((item) => item.status === "PENDING");
  const visibleUnavailabilities = unavailabilities.filter((item) => item.status !== "REJECTED");
  const scaleParticipants = technicians.filter((item) => item.participatesScale);

  const dutyCount = (technicianId: number) => assignments.filter((item) => item.technicianId === technicianId).length;

  function workState(technicianId: number, date: Date) {
    const assignment = assignmentContext.find((item) => item.technicianId === technicianId && isSameDay(item.date, date));
    const exitDay = assignmentContext.some((item) => item.technicianId === technicianId && item.hours >= 24 && isSameDay(addDays(item.date, 1), date));
    const restDay = assignmentContext.some((item) => item.technicianId === technicianId && item.hours >= 24 && isSameDay(addDays(item.date, 2), date));
    const unavailability = visibleUnavailabilities.find((item) => item.technicianId === technicianId && item.startDate <= new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59) && item.endDate >= dateOnly(date));
    return { assignment, exitDay, restDay, unavailability };
  }

  function hasOffice(technicianId: number, date: Date) {
    const technician = technicians.find((item) => item.id === technicianId)!;
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const holiday = Boolean(holidayFor(date));
    const state = workState(technicianId, date);
    const approvedOfficeAbsence = state.unavailability?.status === "APPROVED" && state.unavailability.affectsOffice;
    return isBaseOfficeDay(technician.referenceDate, date) && !weekend && !holiday && !state.assignment && !state.exitDay && !state.restDay && !approvedOfficeAbsence;
  }

  const periodHours = (technicianId: number) => {
    const technician = technicians.find((item) => item.id === technicianId)!;
    const officeHours = displayDays.filter((date) => hasOffice(technicianId, date)).length * technician.dailyHours;
    const serviceHours = assignments.filter((item) => item.technicianId === technicianId).reduce((total, item) => total + item.hours, 0);
    return officeHours + serviceHours;
  };

  const lightest = [...scaleParticipants].sort((a, b) => periodHours(a.id) - periodHours(b.id))[0];

  function dayStatuses(technicianId: number, date: Date): DayStatus[] {
    const state = workState(technicianId, date);
    const statuses: DayStatus[] = [];

    if (layer !== "scale") {
      if (hasOffice(technicianId, date)) statuses.push("office");
      else if (!state.assignment && !state.exitDay && !state.restDay) statuses.push("off");
      if (state.exitDay) statuses.push("exit");
      if (state.restDay) statuses.push("rest");
    }

    if (layer !== "office" && state.assignment) statuses.push("duty");

    if (state.unavailability) {
      const affectsSelectedLayer = layer === "combined" || (layer === "scale" && state.unavailability.affectsScale) || (layer === "office" && state.unavailability.affectsOffice);
      if (affectsSelectedLayer) statuses.push(state.unavailability.status === "PENDING" ? "pending" : "unavailable");
    }

    return statuses.length ? statuses : ["off"];
  }

  const periodLabel = period === "year"
    ? String(start.getFullYear())
    : period === "quarter"
      ? `${Math.floor(start.getMonth() / 3) + 1}º trimestre de ${start.getFullYear()}`
      : new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(start);

  const shift = monthsCount;
  const previous = addMonths(start, -shift);
  const next = addMonths(start, shift);
  const focusDate = today >= from && today <= to ? today : from;
  const lockedCount = controls.filter((item) => item.status === "LOCKED").length;

  const occupations = [
    ...assignments.map((item) => ({
      key: `assignment-${item.id}`,
      date: item.date,
      endDate: item.date,
      technicianId: item.technicianId,
      technicianName: item.technician.name,
      title: `Serviço de ${item.hours} horas`,
      note: `Origem: ${item.origin.toLowerCase()}`,
      tags: [{ kind: "duty", label: `Serviço ${item.hours}h` }],
    })),
    ...visibleUnavailabilities.map((item) => ({
      key: `unavailability-${item.id}`,
      date: item.startDate,
      endDate: item.endDate,
      technicianId: item.technicianId,
      technicianName: item.technician.name,
      title: item.reason,
      note: `Registrada em ${item.createdAt.toLocaleDateString("pt-BR")}`,
      tags: [
        { kind: item.status === "PENDING" ? "pending" : "unavailable", label: item.status === "PENDING" ? "Pendente" : "Indisponível" },
        ...(item.affectsScale ? [{ kind: "scale", label: "Afeta escala" }] : []),
        ...(item.affectsOffice ? [{ kind: "office", label: "Afeta expediente" }] : []),
      ],
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const agendaDays = displayDays.map((date) => {
    const service = layer === "office" ? [] : assignments.filter((item) => isSameDay(item.date, date));
    const office = layer === "scale" ? [] : technicians.filter((technician) => hasOffice(technician.id, date));
    const unavailable = visibleUnavailabilities.filter((item) => {
      const overlaps = item.startDate <= new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59) && item.endDate >= dateOnly(date);
      if (!overlaps) return false;
      return layer === "combined" || (layer === "scale" && item.affectsScale) || (layer === "office" && item.affectsOffice);
    });
    return { date, service, office, unavailable, holiday: holidayFor(date) };
  });

  return (
    <main>
      <header className="topbar">
        <div><p className="eyebrow">Planejamento operacional</p><h1>Efetivo COST</h1><span className="page-hint">Clique no nome de um técnico para abrir ações rápidas.</span></div>
        <div className="header-actions"><Link className="button button-secondary" href="/tecnicos">Técnicos</Link><a className="button button-secondary" href="#pendencias">Pendências <strong>{pending.length}</strong></a></div>
      </header>

      <section className="summary-grid">
        <article className="summary-card"><span>Período exibido</span><strong className="capitalize">{periodLabel}</strong><small>{lockedCount} mês(es) bloqueado(s) · {monthsCount - lockedCount} em previsão</small></article>
        <article className="summary-card"><span>Participantes da escala</span><strong>{scaleParticipants.length} técnicos</strong><small>{assignments.length} serviços preenchidos</small></article>
        <article className="summary-card"><span>Indisponibilidades</span><strong>{pending.length} pendente{pending.length === 1 ? "" : "s"}</strong><small>{visibleUnavailabilities.length} registro(s) no período</small></article>
        <article className="summary-card"><span>Menor carga prevista</span><strong>{lightest?.name ?? "—"}</strong><small>{lightest ? periodHours(lightest.id) : 0} horas computadas</small></article>
      </section>

      <section className="period-toolbar">
        <div className="period-carousel">
          <Link className="carousel-arrow" href={dashboardHref(previous, period, layer, view)} aria-label="Período anterior">‹</Link>
          <div><span>{period === "month" ? "Mês" : period === "quarter" ? "Trimestre" : "Ano"}</span><strong className="capitalize">{periodLabel}</strong></div>
          <Link className="carousel-arrow" href={dashboardHref(next, period, layer, view)} aria-label="Próximo período">›</Link>
        </div>

        <div className="toolbar-groups">
          <div className="segmented">
            <Link href={dashboardHref(today, "month", layer, view)}>Hoje</Link>
            <Link className={period === "month" ? "active" : ""} href={dashboardHref(start, "month", layer, view)}>Mês</Link>
            <Link className={period === "quarter" ? "active" : ""} href={dashboardHref(start, "quarter", layer, view)}>Trimestre</Link>
            <Link className={period === "year" ? "active" : ""} href={dashboardHref(start, "year", layer, view)}>Ano</Link>
          </div>
          <div className="segmented">
            <Link className={layer === "scale" ? "active" : ""} href={dashboardHref(start, period, "scale", view)}>Escala</Link>
            <Link className={layer === "office" ? "active" : ""} href={dashboardHref(start, period, "office", view)}>Expediente</Link>
            <Link className={layer === "combined" ? "active" : ""} href={dashboardHref(start, period, "combined", view)}>Combinado</Link>
          </div>
          <div className="segmented">
            <Link className={view === "timeline" ? "active" : ""} href={dashboardHref(start, period, layer, "timeline")}>Timeline</Link>
            <Link className={view === "agenda" ? "active" : ""} href={dashboardHref(start, period, layer, "agenda")}>Agenda</Link>
          </div>
        </div>
      </section>

      {view === "timeline" ? (
        <>
          <section className="desktop-timeline" aria-label="Timeline da equipe">
            <div className="timeline-scroll">
              <div className="timeline-grid timeline-header" style={{ gridTemplateColumns: `230px repeat(${displayDays.length}, 48px)` }}>
                <div className="technician-heading">Técnico</div>
                {displayDays.map((date) => {
                  const holiday = holidayFor(date);
                  const weekend = date.getDay() === 0 || date.getDay() === 6;
                  return <div className={`day-heading ${weekend ? "heading-weekend" : ""} ${holiday ? "heading-holiday" : ""} ${date.getDate() === 1 ? "month-start" : ""}`} title={holiday} key={date.toISOString()}><span>{date.getDate()}</span><small>{new Intl.DateTimeFormat("pt-BR", { weekday: "narrow" }).format(date)} · {new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "")}</small></div>;
                })}
              </div>
              {technicians.map((technician) => (
                <div className="timeline-grid timeline-row" style={{ gridTemplateColumns: `230px repeat(${displayDays.length}, 48px)` }} key={technician.id}>
                  <TechnicianActions
                    technicianId={technician.id}
                    technicianName={technician.name}
                    profileHref={`/tecnicos/${technician.id}`}
                    defaultDate={inputDate(focusDate)}
                    roleLabel={technician.participatesScale ? "Escala + expediente" : "Expediente"}
                    summary={`${periodHours(technician.id)}h · ${dutyCount(technician.id)} serviços`}
                  />
                  {displayDays.map((date) => <div className={`day-cell ${isSameDay(date, today) ? "today" : ""}`} key={date.toISOString()}>{dayStatuses(technician.id, date).map((status, index) => <StatusMark key={`${status}-${index}`} status={status} />)}</div>)}
                </div>
              ))}
            </div>
          </section>

          <section className="mobile-view">
            <div className="mobile-date"><div><span>Visão da equipe</span><strong>{focusDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</strong></div></div>
            <div className="mobile-list">{technicians.map((technician) => <article className="technician-card" key={technician.id}><TechnicianActions technicianId={technician.id} technicianName={technician.name} profileHref={`/tecnicos/${technician.id}`} defaultDate={inputDate(focusDate)} roleLabel={technician.participatesScale ? "Escala + expediente" : "Expediente"} summary={`${periodHours(technician.id)}h · ${dutyCount(technician.id)} serviços`} /><div className="mobile-statuses">{dayStatuses(technician.id, focusDate).map((status, index) => <span className={`pill pill-${status}`} key={`${status}-${index}`}>{statusLabel[status]}</span>)}</div></article>)}</div>
          </section>
        </>
      ) : (
        <section className="team-agenda" aria-label="Agenda diária da equipe">
          <div className="agenda-legend">
            <span><i className="agenda-dot agenda-dot-duty" />Serviço</span>
            <span><i className="agenda-dot agenda-dot-office" />Expediente</span>
            <span><i className="agenda-dot agenda-dot-unavailable" />Indisponível</span>
            <span><i className="agenda-dot agenda-dot-pending" />Pendente</span>
          </div>
          <div className="agenda-days">
            {agendaDays.map((day) => {
              const weekend = day.date.getDay() === 0 || day.date.getDay() === 6;
              return (
                <article className={`agenda-day ${isSameDay(day.date, today) ? "agenda-today" : ""}`} key={day.date.toISOString()}>
                  <div className="agenda-date">
                    <strong>{day.date.getDate()}</strong>
                    <span>{new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(day.date).replace(".", "")}</span>
                    <small>{new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(day.date).replace(".", "")}</small>
                  </div>
                  <div className="agenda-content">
                    <div className="agenda-day-title">
                      <strong>{day.date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</strong>
                      <span>{day.holiday ?? (weekend ? "Fim de semana" : "Dia útil")}</span>
                    </div>
                    <div className="agenda-people">
                      {day.service.map((item) => <Link className="agenda-person agenda-duty" href={`/tecnicos/${item.technicianId}`} key={`service-${item.id}`}><small>Serviço</small><strong>{item.technician.name}</strong></Link>)}
                      {day.office.map((technician) => <Link className="agenda-person agenda-office" href={`/tecnicos/${technician.id}`} key={`office-${technician.id}`}><small>Expediente</small><strong>{technician.name}</strong></Link>)}
                      {day.unavailable.map((item) => <Link className={`agenda-person ${item.status === "PENDING" ? "agenda-pending" : "agenda-unavailable"}`} href={`/tecnicos/${item.technicianId}`} title={item.reason} key={`unavailable-${item.id}`}><small>{item.status === "PENDING" ? "Pendente" : "Indisponível"}</small><strong>{item.technician.name}</strong></Link>)}
                      {day.service.length === 0 && day.office.length === 0 && day.unavailable.length === 0 && <span className="agenda-empty">Nenhum técnico nesta camada.</span>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="occupations-panel" id="ocupacoes">
        <div className="section-heading"><div><p className="eyebrow">Resumo operacional</p><h2>Ocupações e indisponibilidades</h2></div><span className="capitalize">{periodLabel}</span></div>
        {occupations.length === 0 ? <div className="empty-panel"><strong>Nenhum registro no período.</strong><span>Serviços e indisponibilidades aparecerão aqui.</span></div> : <div className="occupation-list">{occupations.map((item) => <article className="occupation-row" key={item.key}><div className="occupation-date"><strong>{item.date.toLocaleDateString("pt-BR")}</strong>{!isSameDay(item.date, item.endDate) && <span>até {item.endDate.toLocaleDateString("pt-BR")}</span>}</div><div className="occupation-person"><Link href={`/tecnicos/${item.technicianId}`}>{item.technicianName}</Link><span>{item.title}</span><small>{item.note}</small></div><div className="event-tags">{item.tags.map((tag, index) => <span className={`event-tag tag-${tag.kind}`} key={`${tag.kind}-${index}`}>{tag.label}</span>)}</div></article>)}</div>}
      </section>

      <section id="pendencias">
        {pending.length === 0 ? <div className="empty-panel"><strong>Nenhuma pendência.</strong><span>As indisponibilidades aprovadas já aparecem na timeline, agenda e resumo do período.</span></div> : pending.map((item) => {
          const affected = assignments.filter((assignment) => assignment.technicianId === item.technicianId && assignment.date >= item.startDate && assignment.date <= item.endDate);
          const suggestion = [...scaleParticipants].filter((candidate) => candidate.id !== item.technicianId).sort((a, b) => periodHours(a.id) - periodHours(b.id))[0];
          return <section className="pending-panel" key={item.id}><div><p className="eyebrow">Ação necessária</p><h2>Indisponibilidade em período bloqueado</h2><p>{item.technician.name} informou indisponibilidade de {item.startDate.toLocaleDateString("pt-BR")} a {item.endDate.toLocaleDateString("pt-BR")}. {affected.length} serviço(s) afetado(s).</p></div><div className="suggestion"><span>Sugestão de substituição</span><strong>{suggestion?.name ?? "Sem candidato"}</strong><small>Menor carga entre os participantes disponíveis.</small></div><div className="pending-actions"><form action={rejectUnavailability}><input type="hidden" name="id" value={item.id} /><button className="button button-secondary">Rejeitar</button></form><form action={approveUnavailability}><input type="hidden" name="id" value={item.id} /><button className="button button-primary">Aprovar e recalcular</button></form></div></section>;
        })}
      </section>
    </main>
  );
}