import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ ano?: string; mes?: string; view?: string }>;
type ViewMode = "calendar" | "list";
type TagKind = "office" | "duty" | "exit" | "rest" | "unavailable" | "pending" | "holiday" | "weekend" | "off";
type EventTag = { kind: TagKind; label: string; title?: string };

function dateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
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

function monthHref(id: number, year: number, month: number, view: ViewMode) {
  const date = new Date(year, month - 1, 1);
  return `/tecnicos/${id}?ano=${date.getFullYear()}&mes=${date.getMonth() + 1}&view=${view}`;
}

function viewHref(id: number, year: number, month: number, view: ViewMode) {
  return `/tecnicos/${id}?ano=${year}&mes=${month}&view=${view}`;
}

export default async function TechnicianPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const query = await searchParams;
  const today = new Date();
  const selectedYear = Number(query.ano) || today.getFullYear();
  const selectedMonth = Math.min(12, Math.max(1, Number(query.mes) || today.getMonth() + 1));
  const view: ViewMode = query.view === "list" ? "list" : "calendar";
  const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
  const monthEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);

  const technician = await prisma.technician.findUnique({
    where: { id: Number(id) },
    include: {
      unavailabilities: { orderBy: [{ createdAt: "desc" }, { startDate: "desc" }] },
      assignments: { where: { date: { gte: addDays(monthStart, -2), lte: monthEnd } }, orderBy: { date: "asc" } },
      workAdjustments: { where: { date: { gte: monthStart, lte: monthEnd } }, orderBy: { date: "asc" } },
    },
  });

  if (!technician) notFound();

  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const leadingDays = monthStart.getDay();
  const holidays = holidaysFor(selectedYear);
  const periodKind = monthEnd < dateOnly(today) ? "Cumprido" : monthStart > new Date(today.getFullYear(), today.getMonth(), 1) ? "Previsto" : "Em andamento";
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(monthStart);

  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = new Date(selectedYear, selectedMonth - 1, day);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const holiday = holidays.get(`${selectedYear}-${selectedMonth - 1}-${day}`);
    const assignment = technician.assignments.find((item) => isSameDay(item.date, date));
    const exitDay = technician.assignments.some((item) => item.hours >= 24 && isSameDay(addDays(item.date, 1), date));
    const restDay = technician.assignments.some((item) => item.hours >= 24 && isSameDay(addDays(item.date, 2), date));
    const unavailability = technician.unavailabilities.find((item) => item.status !== "REJECTED" && item.startDate <= new Date(selectedYear, selectedMonth - 1, day, 23, 59, 59) && item.endDate >= date);
    const officeAdjustment = technician.workAdjustments.find((item) => item.type === "INCLUDE_OFFICE" && isSameDay(item.date, date));
    const approvedOfficeAbsence = unavailability?.status === "APPROVED" && unavailability.affectsOffice;
    const office = !approvedOfficeAbsence && Boolean(
      officeAdjustment
      || (isBaseOfficeDay(technician.referenceDate, date) && !weekend && !holiday && !assignment && !exitDay && !restDay),
    );
    const past = dateOnly(date) < dateOnly(today);
    const current = isSameDay(date, today);
    const tags: EventTag[] = [];

    if (office) tags.push({ kind: "office", label: officeAdjustment ? `Expediente incluído · ${officeAdjustment.hours}h` : "Expediente", title: officeAdjustment?.reason });
    if (assignment) tags.push({ kind: "duty", label: `Serviço ${assignment.hours}h` });
    if (exitDay) tags.push({ kind: "exit", label: "Saída do serviço" });
    if (restDay) tags.push({ kind: "rest", label: "Descanso pós-serviço" });
    if (unavailability) tags.push({ kind: unavailability.status === "PENDING" ? "pending" : "unavailable", label: unavailability.status === "PENDING" ? "Indisponibilidade pendente" : "Indisponível", title: unavailability.reason });
    if (holiday) tags.push({ kind: "holiday", label: "Feriado", title: holiday });
    if (weekend) tags.push({ kind: "weekend", label: "Fim de semana" });
    if (tags.length === 0) tags.push({ kind: "off", label: "Sem expediente" });

    return { day, date, weekend, holiday, assignment, exitDay, restDay, office, officeAdjustment, unavailability, past, current, tags };
  });

  const cells: Array<(typeof days)[number] | null> = [...Array.from({ length: leadingDays }, () => null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <main>
      <header className="topbar">
        <div><p className="eyebrow">Ficha individual</p><h1>{technician.name}</h1></div>
        <div className="header-actions"><Link className="button button-secondary" href="/tecnicos">Todos os técnicos</Link><Link className="button button-primary" href="/">Abrir painel</Link></div>
      </header>

      <section className="summary-grid technician-summary">
        <article className="summary-card"><span>Regime</span><strong>{technician.participatesScale ? "Escala + expediente" : "Expediente"}</strong><small>Ciclo dia sim, dia não</small></article>
        <article className="summary-card"><span>Jornada-base</span><strong>{technician.dailyHours} horas</strong><small>Por dia útil de expediente</small></article>
        <article className="summary-card"><span>Indisponibilidades</span><strong>{technician.unavailabilities.length}</strong><small>Histórico completo</small></article>
        <article className="summary-card"><span>Situação</span><strong>{technician.active ? "Ativo" : "Inativo"}</strong><small>Data-base: {technician.referenceDate.toLocaleDateString("pt-BR")}</small></article>
      </section>

      <section className="calendar-panel">
        <div className="calendar-header-row">
          <div className="calendar-toolbar">
            <Link className="calendar-arrow" href={monthHref(technician.id, selectedYear, selectedMonth - 1, view)} aria-label="Mês anterior">‹</Link>
            <div><p className="eyebrow">Agenda individual</p><h2 className="capitalize">{monthLabel}</h2><span className={`period-badge period-${periodKind === "Cumprido" ? "past" : periodKind === "Previsto" ? "future" : "current"}`}>{periodKind}</span></div>
            <Link className="calendar-arrow" href={monthHref(technician.id, selectedYear, selectedMonth + 1, view)} aria-label="Próximo mês">›</Link>
          </div>

          <div className="view-switcher" aria-label="Tipo de visualização">
            <Link className={view === "calendar" ? "active" : ""} href={viewHref(technician.id, selectedYear, selectedMonth, "calendar")}>▦ Calendário</Link>
            <Link className={view === "list" ? "active" : ""} href={viewHref(technician.id, selectedYear, selectedMonth, "list")}>☷ Lista</Link>
          </div>
        </div>

        <div className="calendar-legend">
          <span><i className="legend-dot legend-office" />Expediente</span>
          <span><i className="legend-dot legend-duty" />Serviço 24h</span>
          <span><i className="legend-dot legend-exit" />Saída</span>
          <span><i className="legend-dot legend-rest" />Descanso</span>
          <span><i className="legend-dot legend-unavailable" />Indisponibilidade</span>
          <span><i className="legend-dot legend-holiday" />Feriado</span>
          <span><i className="legend-dot legend-weekend" />Fim de semana</span>
        </div>

        {view === "calendar" ? (
          <div className="month-calendar">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((weekday) => <div className="calendar-weekday" key={weekday}>{weekday}</div>)}
            {cells.map((item, index) => {
              if (!item) return <div className="calendar-day calendar-empty" key={`empty-${index}`} />;
              return (
                <article className={`calendar-day ${item.weekend ? "calendar-weekend" : ""} ${item.holiday ? "calendar-holiday" : ""} ${item.past ? "calendar-past" : "calendar-planned"} ${item.current ? "calendar-today" : ""}`} key={item.day}>
                  <header><strong>{item.day}</strong>{item.holiday && <span title={item.holiday}>Feriado</span>}</header>
                  <div className="calendar-events">
                    {item.office && <span className="calendar-event event-office" title={item.officeAdjustment?.reason}>{item.officeAdjustment ? `Expediente incluído · ${item.officeAdjustment.hours}h` : "Expediente"}</span>}
                    {item.assignment && <span className="calendar-event event-duty">Serviço · {item.assignment.hours}h</span>}
                    {item.exitDay && <span className="calendar-event event-exit">Saída do serviço</span>}
                    {item.restDay && <span className="calendar-event event-rest">Descanso pós-serviço</span>}
                    {item.unavailability && <span className={`calendar-event event-unavailable ${item.unavailability.status === "PENDING" ? "event-pending" : ""}`} title={item.unavailability.reason}>{item.unavailability.status === "PENDING" ? "Indisp. pendente" : "Indisponível"}</span>}
                    {item.holiday && <small>{item.holiday}</small>}
                    {item.weekend && !item.holiday && !item.officeAdjustment && <small>Sem expediente</small>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="event-list">
            {days.map((item) => {
              const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(item.date);
              const phase = item.current ? "Hoje" : item.past ? "Cumprido" : "Previsto";
              const note = item.unavailability?.reason || item.officeAdjustment?.reason || item.holiday || (item.assignment ? `Origem: ${item.assignment.origin.toLowerCase()}` : "");
              return (
                <article className={`event-list-row ${item.past ? "list-past" : ""} ${item.current ? "list-today" : ""}`} key={item.day}>
                  <div className="event-list-date"><strong>{item.day}</strong><span>{new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(item.date).replace(".", "")}</span></div>
                  <div className="event-list-weekday"><strong className="capitalize">{weekday}</strong><span>{item.date.toLocaleDateString("pt-BR")}</span></div>
                  <div className="event-tags">
                    {item.tags.map((tag, index) => <span className={`event-tag tag-${tag.kind}`} title={tag.title} key={`${tag.kind}-${index}`}>{tag.label}</span>)}
                    <span className={`event-tag tag-period ${item.current ? "tag-period-current" : !item.past ? "tag-period-future" : ""}`}>{phase}</span>
                  </div>
                  <span className="event-list-note">{note}</span>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
