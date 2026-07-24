import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ ano?: string; mes?: string }>;

function dateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isOfficeDay(referenceDate: Date, date: Date) {
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

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function holidaysFor(year: number) {
  const easter = easterSunday(year);
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
    [`${addDays(easter, -2).getFullYear()}-${addDays(easter, -2).getMonth()}-${addDays(easter, -2).getDate()}`, "Paixão de Cristo"],
  ]);
}

function monthHref(id: number, year: number, month: number) {
  const date = new Date(year, month - 1, 1);
  return `/tecnicos/${id}?ano=${date.getFullYear()}&mes=${date.getMonth() + 1}`;
}

export default async function TechnicianPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const query = await searchParams;
  const today = new Date();
  const selectedYear = Number(query.ano) || today.getFullYear();
  const selectedMonth = Math.min(12, Math.max(1, Number(query.mes) || today.getMonth() + 1));
  const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
  const monthEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);

  const technician = await prisma.technician.findUnique({
    where: { id: Number(id) },
    include: {
      unavailabilities: { orderBy: [{ createdAt: "desc" }, { startDate: "desc" }] },
      assignments: { where: { date: { gte: monthStart, lte: monthEnd } }, orderBy: { date: "asc" } },
    },
  });

  if (!technician) notFound();

  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const leadingDays = monthStart.getDay();
  const cells = Array.from({ length: leadingDays + daysInMonth }, (_, index) => index < leadingDays ? null : index - leadingDays + 1);
  while (cells.length % 7 !== 0) cells.push(null);

  const holidays = holidaysFor(selectedYear);
  const periodKind = monthEnd < dateOnly(today) ? "Cumprido" : monthStart > new Date(today.getFullYear(), today.getMonth(), 1) ? "Previsto" : "Em andamento";
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(monthStart);

  return (
    <main>
      <header className="topbar">
        <div><p className="eyebrow">Ficha individual</p><h1>{technician.name}</h1></div>
        <div className="header-actions"><Link className="button button-secondary" href="/tecnicos">Todos os técnicos</Link><Link className="button button-primary" href={`/#nova-indisponibilidade`}>Nova indisponibilidade</Link></div>
      </header>

      <section className="summary-grid technician-summary">
        <article className="summary-card"><span>Regime</span><strong>{technician.participatesScale ? "Escala + expediente" : "Expediente"}</strong><small>Ciclo dia sim, dia não</small></article>
        <article className="summary-card"><span>Jornada-base</span><strong>{technician.dailyHours} horas</strong><small>Por dia de expediente</small></article>
        <article className="summary-card"><span>Indisponibilidades</span><strong>{technician.unavailabilities.length}</strong><small>Histórico completo</small></article>
        <article className="summary-card"><span>Situação</span><strong>{technician.active ? "Ativo" : "Inativo"}</strong><small>Data-base: {technician.referenceDate.toLocaleDateString("pt-BR")}</small></article>
      </section>

      <section className="calendar-panel">
        <div className="calendar-toolbar">
          <Link className="calendar-arrow" href={monthHref(technician.id, selectedYear, selectedMonth - 1)} aria-label="Mês anterior">‹</Link>
          <div><p className="eyebrow">Agenda individual</p><h2 className="capitalize">{monthLabel}</h2><span className={`period-badge period-${periodKind === "Cumprido" ? "past" : periodKind === "Previsto" ? "future" : "current"}`}>{periodKind}</span></div>
          <Link className="calendar-arrow" href={monthHref(technician.id, selectedYear, selectedMonth + 1)} aria-label="Próximo mês">›</Link>
        </div>

        <div className="calendar-legend">
          <span><i className="legend-dot legend-office" />Expediente</span>
          <span><i className="legend-dot legend-duty" />Serviço</span>
          <span><i className="legend-dot legend-unavailable" />Indisponibilidade</span>
          <span><i className="legend-dot legend-holiday" />Feriado</span>
          <span><i className="legend-dot legend-weekend" />Fim de semana</span>
        </div>

        <div className="month-calendar">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((weekday) => <div className="calendar-weekday" key={weekday}>{weekday}</div>)}
          {cells.map((day, index) => {
            if (!day) return <div className="calendar-day calendar-empty" key={`empty-${index}`} />;
            const date = new Date(selectedYear, selectedMonth - 1, day);
            const weekend = date.getDay() === 0 || date.getDay() === 6;
            const holiday = holidays.get(`${selectedYear}-${selectedMonth - 1}-${day}`);
            const office = isOfficeDay(technician.referenceDate, date);
            const assignment = technician.assignments.find((item) => isSameDay(item.date, date));
            const unavailability = technician.unavailabilities.find((item) => item.status !== "REJECTED" && item.startDate <= new Date(selectedYear, selectedMonth - 1, day, 23, 59, 59) && item.endDate >= date);
            const past = dateOnly(date) < dateOnly(today);
            const current = isSameDay(date, today);

            return (
              <article className={`calendar-day ${weekend ? "calendar-weekend" : ""} ${holiday ? "calendar-holiday" : ""} ${past ? "calendar-past" : "calendar-planned"} ${current ? "calendar-today" : ""}`} key={day}>
                <header><strong>{day}</strong>{holiday && <span title={holiday}>Feriado</span>}</header>
                <div className="calendar-events">
                  {office && <span className="calendar-event event-office">Expediente</span>}
                  {assignment && <span className="calendar-event event-duty">Serviço · {assignment.hours}h</span>}
                  {unavailability && <span className={`calendar-event event-unavailable ${unavailability.status === "PENDING" ? "event-pending" : ""}`} title={unavailability.reason}>{unavailability.status === "PENDING" ? "Indisp. pendente" : "Indisponível"}</span>}
                  {holiday && <small>{holiday}</small>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
