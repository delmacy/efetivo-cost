import { addDays, endOfMonth, startOfMonth } from "./tiny-date";
import { prisma } from "./prisma";

function dateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}`;
}

function enumerateMonths(from: Date, to: Date) {
  const months: Date[] = [];
  for (let cursor = new Date(from.getFullYear(), from.getMonth(), 1); cursor <= to; cursor = addMonths(cursor, 1)) {
    months.push(new Date(cursor));
  }
  return months;
}

function isUnavailableOn(
  unavailabilities: Array<{ technicianId: number; startDate: Date; endDate: Date }>,
  technicianId: number,
  date: Date,
) {
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return unavailabilities.some(
    (item) => item.technicianId === technicianId && item.startDate <= endOfDay && item.endDate >= dateOnly(date),
  );
}

export async function ensureInitialData() {
  if (await prisma.technician.count()) return;

  const names = ["Técnico A", "Técnico B", "Técnico C", "Técnico D"];
  const technicians = [];
  for (let index = 0; index < names.length; index++) {
    technicians.push(await prisma.technician.create({
      data: {
        name: names[index],
        participatesScale: index < 3,
        referenceDate: new Date(2026, 6, index % 2 === 0 ? 1 : 2),
      },
    }));
  }

  await prisma.monthControl.create({
    data: { year: 2026, month: 7, status: "LOCKED", cutoffDate: new Date(2026, 5, 25) },
  });

  const dutyDays = [4, 5, 10, 11, 16, 18, 22, 24, 29, 31];
  for (let index = 0; index < dutyDays.length; index++) {
    await prisma.assignment.create({
      data: {
        date: new Date(2026, 6, dutyDays[index]),
        technicianId: technicians[index % 3].id,
      },
    });
  }
}

async function ensureMonthControls(from: Date, to: Date) {
  const today = dateOnly(new Date());
  const controls = [];

  for (const month of enumerateMonths(from, to)) {
    const year = month.getFullYear();
    const monthNumber = month.getMonth() + 1;
    const cutoffDate = addDays(month, -6);
    const mustBeLocked = today >= dateOnly(cutoffDate);

    const existing = await prisma.monthControl.findUnique({
      where: { year_month: { year, month: monthNumber } },
    });

    if (!existing) {
      controls.push(await prisma.monthControl.create({
        data: {
          year,
          month: monthNumber,
          cutoffDate,
          status: mustBeLocked ? "LOCKED" : "OPEN",
        },
      }));
      continue;
    }

    controls.push(await prisma.monthControl.update({
      where: { id: existing.id },
      data: {
        cutoffDate,
        ...(mustBeLocked && existing.status !== "LOCKED" ? { status: "LOCKED" } : {}),
      },
    }));
  }

  return controls;
}

async function ensureProjectedSchedule(from: Date, to: Date) {
  const participants = await prisma.technician.findMany({
    where: { active: true, participatesScale: true },
    orderBy: { id: "asc" },
  });
  if (participants.length === 0) return;

  const controls = await ensureMonthControls(from, to);
  const lockedMonths = new Set(
    controls.filter((item) => item.status === "LOCKED").map((item) => `${item.year}-${item.month}`),
  );

  const [unavailabilities, storedAssignments] = await Promise.all([
    prisma.unavailability.findMany({
      where: {
        status: "APPROVED",
        affectsScale: true,
        startDate: { lte: to },
        endDate: { gte: from },
      },
      select: { technicianId: true, startDate: true, endDate: true },
    }),
    prisma.assignment.findMany({
      where: { date: { gte: addDays(from, -2), lte: addDays(to, 2) } },
      orderBy: { date: "asc" },
    }),
  ]);

  const assignments = [...storedAssignments];

  function assignmentsForMonth(technicianId: number, date: Date) {
    return assignments.filter(
      (item) => item.technicianId === technicianId
        && item.date.getFullYear() === date.getFullYear()
        && item.date.getMonth() === date.getMonth(),
    ).length;
  }

  function totalAssignments(technicianId: number) {
    return assignments.filter((item) => item.technicianId === technicianId).length;
  }

  function proximityPenalty(technicianId: number, date: Date) {
    return assignments.reduce((penalty, item) => {
      if (item.technicianId !== technicianId || isSameDay(item.date, date)) return penalty;
      const distance = Math.abs(Math.round((dateOnly(item.date).getTime() - dateOnly(date).getTime()) / 86400000));
      if (distance === 1) return penalty + 10000;
      if (distance === 2) return penalty + 5000;
      return penalty;
    }, 0);
  }

  function rankCandidates(date: Date) {
    return [...participants].sort((a, b) => {
      const unavailableA = isUnavailableOn(unavailabilities, a.id, date) ? 1 : 0;
      const unavailableB = isUnavailableOn(unavailabilities, b.id, date) ? 1 : 0;
      const scoreA = unavailableA * 10000000
        + assignmentsForMonth(a.id, date) * 100000
        + proximityPenalty(a.id, date)
        + totalAssignments(a.id) * 10
        + a.id;
      const scoreB = unavailableB * 10000000
        + assignmentsForMonth(b.id, date) * 100000
        + proximityPenalty(b.id, date)
        + totalAssignments(b.id) * 10
        + b.id;
      return scoreA - scoreB;
    });
  }

  for (let date = dateOnly(from); date <= to; date = addDays(date, 1)) {
    const locked = lockedMonths.has(monthKey(date));
    const existing = assignments.find((item) => isSameDay(item.date, date));
    const existingInvalid = existing
      ? isUnavailableOn(unavailabilities, existing.technicianId, date)
      : false;

    // Em mês bloqueado, serviços publicados não são alterados automaticamente.
    // Entretanto, qualquer lacuna é preenchida para manter cobertura diária.
    if (existing && (!existingInvalid || locked)) continue;

    const ranked = rankCandidates(date);
    const preferred = ranked.find(
      (candidate) => !isUnavailableOn(unavailabilities, candidate.id, date) && proximityPenalty(candidate.id, date) === 0,
    ) ?? ranked.find((candidate) => !isUnavailableOn(unavailabilities, candidate.id, date))
      ?? ranked[0];

    if (!preferred) continue;

    const conflict = isUnavailableOn(unavailabilities, preferred.id, date);

    if (existing) {
      const updated = await prisma.assignment.update({
        where: { id: existing.id },
        data: {
          technicianId: preferred.id,
          origin: conflict ? "RECALCULATED_CONFLICT" : "RECALCULATED",
        },
      });
      existing.technicianId = updated.technicianId;
      existing.origin = updated.origin;
    } else {
      const created = await prisma.assignment.create({
        data: {
          date,
          technicianId: preferred.id,
          hours: 24,
          origin: conflict
            ? locked ? "BACKFILLED_CONFLICT" : "PROJECTED_CONFLICT"
            : locked ? "BACKFILLED" : "PROJECTED",
        },
      });
      assignments.push(created);
    }
  }
}

export async function getDashboard(year = 2026, month = 7, months = 1) {
  await ensureInitialData();
  const from = startOfMonth(year, month);
  const lastMonth = new Date(year, month - 1 + Math.max(1, months), 0);
  const to = endOfMonth(lastMonth.getFullYear(), lastMonth.getMonth() + 1);

  const today = new Date();
  const rollingProjectionFrom = new Date(today.getFullYear(), today.getMonth(), 1);
  const rollingProjectionTo = endOfMonth(today.getFullYear(), today.getMonth() + 13);
  const projectionFrom = from < rollingProjectionFrom ? from : rollingProjectionFrom;
  const projectionTo = to > rollingProjectionTo ? to : rollingProjectionTo;

  await ensureProjectedSchedule(projectionFrom, projectionTo);

  const [technicians, assignments, assignmentContext, unavailabilities, controls, adjustments] = await Promise.all([
    prisma.technician.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.assignment.findMany({
      where: { date: { gte: from, lte: to } },
      include: { technician: true },
      orderBy: { date: "asc" },
    }),
    prisma.assignment.findMany({ where: { date: { gte: addDays(from, -2), lte: to } } }),
    prisma.unavailability.findMany({
      where: { startDate: { lte: to }, endDate: { gte: from } },
      include: { technician: true },
      orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.monthControl.findMany({
      where: {
        OR: Array.from({ length: Math.max(1, months) }, (_, index) => {
          const date = new Date(year, month - 1 + index, 1);
          return { year: date.getFullYear(), month: date.getMonth() + 1 };
        }),
      },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    }),
    prisma.workAdjustment.findMany({ where: { date: { gte: from, lte: to } } }),
  ]);

  return {
    technicians,
    assignments,
    assignmentContext,
    unavailabilities,
    controls,
    control: controls[0] ?? null,
    adjustments,
    year: from.getFullYear(),
    month: from.getMonth() + 1,
    from,
    to,
  };
}

export async function approveAndRecalculate(id: number) {
  const item = await prisma.unavailability.findUnique({ where: { id } });
  if (!item) throw new Error("Indisponibilidade não encontrada.");

  const affected = await prisma.assignment.findMany({
    where: { technicianId: item.technicianId, date: { gte: item.startDate, lte: item.endDate } },
  });

  const candidates = await prisma.technician.findMany({
    where: { active: true, participatesScale: true, id: { not: item.technicianId } },
    include: { assignments: true, unavailabilities: { where: { status: "APPROVED", affectsScale: true } } },
  });

  for (const assignment of affected) {
    const ranked = [...candidates].sort((a, b) => {
      const unavailableA = a.unavailabilities.some((u) => u.startDate <= assignment.date && u.endDate >= assignment.date) ? 1 : 0;
      const unavailableB = b.unavailabilities.some((u) => u.startDate <= assignment.date && u.endDate >= assignment.date) ? 1 : 0;
      return unavailableA - unavailableB || a.assignments.length - b.assignments.length || a.id - b.id;
    });
    const replacement = ranked[0];
    if (!replacement) continue;

    const conflict = replacement.unavailabilities.some(
      (u) => u.startDate <= assignment.date && u.endDate >= assignment.date,
    );

    await prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        technicianId: replacement.id,
        origin: conflict ? "RECALCULATED_CONFLICT" : "RECALCULATED",
      },
    });
  }

  await prisma.unavailability.update({
    where: { id },
    data: { status: "APPROVED", reviewedAt: new Date(), reviewNote: "Aprovada com recálculo automático." },
  });

  const month = item.startDate.getMonth() + 1;
  const year = item.startDate.getFullYear();
  await prisma.monthControl.updateMany({ where: { year, month }, data: { version: { increment: 1 } } });
}