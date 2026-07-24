import Link from "next/link";
import { approveUnavailability, rejectUnavailability } from "./actions";
import { TechnicianActions } from "./components/technician-actions";
import { TimelineDayActions } from "./components/timeline-day-actions";
import { DUTY_24H, getDashboard, ON_CALL } from "../lib/schedule";

type DayStatus = "office" | "duty" | "oncall" | "unavailable" | "exit" | "rest" | "pending";
type Period = "month" | "quarter" | "year";
type Layer = "duty" | "oncall" | "office" | "combined";
type SearchParams = Promise<{ ano?: string; mes?: string; periodo?: string; camada?: string }>;

const statusLabel: Record<DayStatus, string> = {
  office: "Expediente",
  duty: "Serviço 24h",
  oncall: "Sobreaviso",
  unavailable: "Indisponível",
  exit: "Saída",
  rest: "Descanso",
  pending: "Pendente",
};

const statusShort: Record<DayStatus, string> = {
  office: "E",
  duty: "S",
  oncall: "So",
  unavailable: "I",
  exit: "Sa",
  rest: "D",
  pending: "P",
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

function dashboardHref(date: Date, period: Period, layer: Layer) {
  return `/?ano=${date.getFullYear()}&mes=${date.getMonth() + 1}&periodo=${period}&camada=${layer}`;
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
  const layer: Layer = query.camada === "duty" || query.camada === "oncall" || query.camada === "office"
    ? query.camada
    : query.camada === "scale" ? "duty" : "combined";
  const start = periodStart(anchor, period);
  const monthsCount = periodMonths(period);
  const dashboard = await getDashboard(start.getFullYear(), start.getMonth() + 1, monthsCount);
  const { technicians, assignments, assignmentContext, unavailabilities, adjustments, from, to } = dashboard;

  const displayDays: Date[] = [];
  for (let date = new Date(from); date <= to; date = addDays(date, 1)) displayDays.push(new Date(date));

  const holidayMaps = new Map<number, Map<string, string>>();
  for (const date of displayDays) if (!holidayMaps.has(date.getFullYear())) holidayMaps.set(date.getFullYear(), holidaysFor(date.getFullYear()));
  const holidayFor = (date: Date) => holidayMaps.get(date.getFullYear())?.get(dateKey(date));

  const pending = unavailabilities.filter((item) => item.status === "PENDING");
  const visibleUnavailabilities = unavailabilities.filter((item) => item.status !== "REJECTED");
  const dutyParticipants = technicians.filter((item) => item.participatesScale);
  const onCallParticipants = technicians.filter((item) => item.participatesOnCall);

  const dutyCount = (technicianId: number) => assignments.filter((item) => item.technicianId === technicianId && item.scheduleType === DUTY_24H).length;
  const onCallCount = (technicianId: number) => assignments.filter((item) => item.technicianId === technicianId && item.scheduleType === ON_CALL).length;

  function workState(technicianId: number, date: Date) {
    const dutyAssignment = assignmentContext.find((item) => item.technicianId === technicianId && item.scheduleType === DUTY_24H && isSameDay(item.date, date));
    const onCallAssignment = assignmentContext.find((item) => item.technicianId === technicianId && item.scheduleType === ON_CALL && isSameDay(item.date, date));
    const exitDay = assignmentContext.some((item) => item.technicianId === technicianId && item.scheduleType === DUTY_24H && isSameDay(addDays(item.date, 1), date));
    const restDay = assignmentContext.some((item) => item.technicianId === technicianId && item.scheduleType === DUTY_24H && isSameDay(addDays(item.date, 2), date));
    const unavailability = visibleUnavailabilities.find((item) => item.technicianId === technicianId && item.startDate <= new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59) && item.endDate >= dateOnly(date));
    const officeAdjustment = adjustments.find((item) => item.technicianId === technicianId && item.type === "INCLUDE_OFFICE" && isSameDay(item.date, date));
    return { dutyAssignment, onCallAssignment, exitDay, restDay, unavailability, officeAdjustment };
  }

  function hasOffice(technicianId: number, date: Date) {
    const technician = technicians.find((item) => item.id === technicianId)!;
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const holiday = Boolean(holidayFor(date));
    const state = workState(technicianId, date);
    const approvedOfficeAbsence = state.unavailability?.status === "APPROVED" && state.unavailability.affectsOffice;

    if (approvedOfficeAbsence) return false;
    if (state.officeAdjustment) return true;

    return isBaseOfficeDay(technician.referenceDate, date)
      && !weekend
      && !holiday
      && !state.dutyAssignment
      && !state.exitDay
      && !state.restDay;
  }

  const periodHours = (technicianId: number) => {
    const technician = technicians.find((item) => item.id === technicianId)!;
    const officeHours = displayDays.reduce((total, date) => {
      if (!hasOffice(technicianId, date)) return total;
      const adjustment = adjustments.find((item) => item.technicianId === technicianId && item.type === "INCLUDE_OFFICE" && isSameDay(item.date, date));
      return total + (adjustment?.hours ?? technician.dailyHours);
    }, 0);
    const serviceHours = assignments
      .filter((item) => item.technicianId === technicianId && item.scheduleType === DUTY_24H)
      .reduce((total, item) => total + item.hours, 0);
    return officeHours + serviceHours;
  };

  function dayStatuses(technicianId: number, date: Date): DayStatus[] {
    const state = workState(technicianId, date);
    const statuses: DayStatus[] = [];

    if (layer === "office" || layer === "combined") {
      if (hasOffice(technicianId, date)) statuses.push("office");
      if (state.exitDay) statuses.push("exit");
      if (state.restDay) statuses.push("rest");
    }
    if ((layer === "duty" || layer === "combined") && state.dutyAssignment) statuses.push("duty");
    if ((layer === "oncall" || layer === "combined") && state.onCallAssignment) statuses.push("oncall");

    if (state.unavailability) {
      const affectsSelectedLayer = layer === "combined"
        || (layer === "office" && state.unavailability.affectsOffice)
        || ((layer === "duty" || layer === "oncall") && state.unavailability.affectsScale);
      if (affectsSelectedLayer) statuses.push(state.unavailability.status === "PENDING" ? "pending" : "unavailable");
    }

    return statuses;
  }

  const periodLabel = period === "year"
    ? String(start.getFullYear())
    : period === "quarter"
      ? `${Math.floor(start.getMonth() / 3) + 1}º trimestre de ${start.getFullYear()}`
      : new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(start);

  const previous = addMonths(start, -monthsCount);
  const next = addMonths(start, monthsCount);
  const focusDate = today >= from && today <= to ? today : from;

  const agendaDays = displayDays.map((date) => {
    const duty = layer === "duty" || layer === "combined"
      ? assignments.filter((item) => item.scheduleType === DUTY_24H && isSameDay(item.date, date))
      : [];
    const onCall = layer === "oncall" || layer === "combined"
      ? assignments.filter((item) => item.scheduleType === ON_CALL && isSameDay(item.date, date))
      : [];
    const office = layer === "office" || layer === "combined"
      ? technicians.filter((technician) => hasOffice(technician.id, date))
      : [];
    const unavailable = visibleUnavailabilities.filter((item) => {
      const overlaps = item.startDate <= new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59) && item.endDate >= dateOnly(date);
      if (!overlaps) return false;
      return layer === "combined"
        || (layer === "office" && item.affectsOffice)
        || ((layer === "duty" || layer === "oncall") && item.affectsScale);
    });
    return { date, duty, onCall, office, unavailable, holiday: holidayFor(date) };
  });

  return (
    <main>
      <header className="topbar compact-topbar">
        <div>
          <p className="eyebrow">Planejamento operacional</p>
          <h1>Efetivo COST</h1>
          <span className="page-hint">Clique no técnico ou em uma célula para registrar indisponibilidade ou incluir expediente.</span>
        </div>
        <div className="header-actions"><Link className="button button-secondary" href="/tecnicos">Técnicos</Link><a className="button button-secondary" href="#pendencias">Pendências <strong>{pending.length}</strong></a></div>
      </header>

      <section className="period-toolbar dashboard-toolbar">
        <div className="period-carousel">
          <Link className="carousel-arrow" href={dashboardHref(previous, period, layer)} aria-label="Período anterior">‹</Link>
          <div><span>{period === "month" ? "Mês" : period === "quarter" ? "Trimestre" : "Ano"}</span><strong className="capitalize">{periodLabel}</strong></div>
          <Link className="carousel-arrow" href={dashboardHref(next, period, layer)} aria-label="Próximo período">›</Link>
        </div>

        <div className="toolbar-groups">
          <div className="segmented">
            <Link href={dashboardHref(today, "month", layer)}>Hoje</Link>
            <Link className={period === "month" ? "active" : ""} href={dashboardHref(start, "month", layer)}>Mês</Link>
            <Link className={period === "quarter" ? "active" : ""} href={dashboardHref(start, "quarter", layer)}>Trimestre</Link>
            <Link className={period === "year" ? "active" : ""} href={dashboardHref(start, "year", layer)}>Ano</Link>
          </div>
          <div className="segmented schedule-selector">
            <Link className={layer === "duty" ? "active" : ""} href={dashboardHref(start, period, "duty")}>24h</Link>
            <Link className={layer === "oncall" ? "active" : ""} href={dashboardHref(start, period, "oncall")}>Sobreaviso</Link>
            <Link className={layer === "office" ? "active" : ""} href={dashboardHref(start, period, "office")}>Expediente</Link>
            <Link className={layer === "combined" ? "active" : ""} href={dashboardHref(start, period, "combined")}>Combinado</Link>
          </div>
        </div>
      </section>

      <section className="desktop-timeline" aria-label="Timeline da equipe">
        <div className="timeline-scroll">
          <div className="timeline-grid timeline-header" style={{ gridTemplateColumns: `250px repeat(${displayDays.length}, 48px)` }}>
            <div className="technician-heading">Técnico</div>
            {displayDays.map((date) => {
              const holiday = holidayFor(date);
              const weekend = date.getDay() === 0 || date.getDay() === 6;
              return <div className={`day-heading ${weekend ? "heading-weekend" : ""} ${holiday ? "heading-holiday" : ""} ${date.getDate() === 1 ? "month-start" : ""}`} title={holiday ?? (weekend ? "Fim de semana" : "Dia útil")} key={date.toISOString()}><span>{date.getDate()}</span><small>{new Intl.DateTimeFormat("pt-BR", { weekday: "narrow" }).format(date)} · {new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "")}</small></div>;
            })}
          </div>
          {technicians.map((technician) => {
            const groups = technician.groups.map((membership) => membership.group.name);
            const roleParts = [technician.participatesScale ? "24h" : "", technician.participatesOnCall ? "Sobreaviso" : "", "Expediente"].filter(Boolean);
            return (
              <div className="timeline-grid timeline-row" style={{ gridTemplateColumns: `250px repeat(${displayDays.length}, 48px)` }} key={technician.id}>
                <TechnicianActions
                  technicianId={technician.id}
                  technicianName={technician.name}
                  profileHref={`/tecnicos/${technician.id}`}
                  defaultDate={inputDate(focusDate)}
                  roleLabel={roleParts.join(" + ")}
                  groupLabels={groups}
                  summary={`${periodHours(technician.id)}h · ${dutyCount(technician.id)}×24h · ${onCallCount(technician.id)}×sobreaviso`}
                />
                {displayDays.map((date) => {
                  const statuses = dayStatuses(technician.id, date);
                  const weekend = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <TimelineDayActions
                      technicianId={technician.id}
                      technicianName={technician.name}
                      date={inputDate(date)}
                      dateLabel={date.toLocaleDateString("pt-BR")}
                      className={`${isSameDay(date, today) ? "today" : ""} ${weekend ? "timeline-weekend" : ""}`}
                      key={date.toISOString()}
                    >
                      {statuses.map((status, index) => <StatusMark key={`${status}-${index}`} status={status} />)}
                    </TimelineDayActions>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mobile-view">
        <div className="mobile-date"><div><span>Visão da equipe</span><strong>{focusDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</strong></div></div>
        <div className="mobile-list">
          {technicians.map((technician) => {
            const statuses = dayStatuses(technician.id, focusDate);
            return <article className="technician-card" key={technician.id}><TechnicianActions technicianId={technician.id} technicianName={technician.name} profileHref={`/tecnicos/${technician.id}`} defaultDate={inputDate(focusDate)} roleLabel="Agenda individual" groupLabels={technician.groups.map((membership) => membership.group.name)} summary={`${dutyCount(technician.id)}×24h · ${onCallCount(technician.id)}×sobreaviso`} />{statuses.length > 0 && <div className="mobile-statuses">{statuses.map((status, index) => <span className={`pill pill-${status}`} key={`${status}-${index}`}>{statusLabel[status]}</span>)}</div>}</article>;
          })}
        </div>
      </section>

      <section className="agenda-section" aria-label="Agenda diária da equipe">
        <div className="section-heading"><div><p className="eyebrow">Agenda do período</p><h2>Técnicos agrupados por data</h2></div><span className="capitalize">{periodLabel}</span></div>
        <div className="team-agenda">
          <div className="agenda-legend">
            <span><i className="agenda-dot agenda-dot-duty" />Serviço 24h</span>
            <span><i className="agenda-dot agenda-dot-oncall" />Sobreaviso</span>
            <span><i className="agenda-dot agenda-dot-office" />Expediente</span>
            <span><i className="agenda-dot agenda-dot-unavailable" />Indisponível</span>
            <span><i className="agenda-dot agenda-dot-pending" />Pendente</span>
          </div>
          <div className="agenda-days">
            {agendaDays.map((day) => {
              const weekend = day.date.getDay() === 0 || day.date.getDay() === 6;
              return (
                <article className={`agenda-day ${isSameDay(day.date, today) ? "agenda-today" : ""} ${weekend ? "agenda-weekend" : ""}`} key={day.date.toISOString()}>
                  <div className="agenda-date"><strong>{day.date.getDate()}</strong><span>{new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(day.date).replace(".", "")}</span><small>{new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(day.date).replace(".", "")}</small></div>
                  <div className="agenda-content">
                    <div className="agenda-day-title"><strong>{day.date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</strong><span>{day.holiday ?? (weekend ? "Fim de semana" : "Dia útil")}</span></div>
                    <div className="agenda-people">
                      {day.duty.map((item) => <Link className="agenda-person agenda-duty" href={`/tecnicos/${item.technicianId}`} key={`duty-${item.id}`}><small>Serviço 24h</small><strong>{item.technician.name}</strong></Link>)}
                      {day.onCall.map((item) => <Link className="agenda-person agenda-oncall" href={`/tecnicos/${item.technicianId}`} key={`oncall-${item.id}`}><small>Sobreaviso</small><strong>{item.technician.name}</strong></Link>)}
                      {day.office.map((technician) => <Link className="agenda-person agenda-office" href={`/tecnicos/${technician.id}`} key={`office-${technician.id}`}><small>Expediente</small><strong>{technician.name}</strong></Link>)}
                      {day.unavailable.map((item) => <Link className={`agenda-person ${item.status === "PENDING" ? "agenda-pending" : "agenda-unavailable"}`} href={`/tecnicos/${item.technicianId}`} title={item.reason} key={`unavailable-${item.id}`}><small>{item.status === "PENDING" ? "Pendente" : "Indisponível"}</small><strong>{item.technician.name}</strong></Link>)}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="pendencias">
        {pending.length === 0 ? <div className="empty-panel"><strong>Nenhuma pendência.</strong><span>As indisponibilidades aprovadas já aparecem na timeline e na agenda.</span></div> : pending.map((item) => {
          const affected = assignments.filter((assignment) => assignment.technicianId === item.technicianId && assignment.date >= item.startDate && assignment.date <= item.endDate);
          const firstType = affected[0]?.scheduleType;
          const pool = firstType === ON_CALL ? onCallParticipants : dutyParticipants;
          const suggestion = [...pool].filter((candidate) => candidate.id !== item.technicianId).sort((a, b) => periodHours(a.id) - periodHours(b.id))[0];
          return <section className="pending-panel" key={item.id}><div><p className="eyebrow">Ação necessária</p><h2>Indisponibilidade em período bloqueado</h2><p>{item.technician.name} informou indisponibilidade de {item.startDate.toLocaleDateString("pt-BR")} a {item.endDate.toLocaleDateString("pt-BR")}. {affected.length} escala(s) afetada(s).</p></div><div className="suggestion"><span>Sugestão de substituição</span><strong>{suggestion?.name ?? "Sem candidato"}</strong><small>Menor carga entre os participantes disponíveis.</small></div><div className="pending-actions"><form action={rejectUnavailability}><input type="hidden" name="id" value={item.id} /><button className="button button-secondary">Rejeitar</button></form><form action={approveUnavailability}><input type="hidden" name="id" value={item.id} /><button className="button button-primary">Aprovar e recalcular</button></form></div></section>;
        })}
      </section>
    </main>
  );
}
