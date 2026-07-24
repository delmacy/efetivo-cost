import { addDays, endOfMonth, startOfMonth } from "./tiny-date";
import { prisma } from "./prisma";

export const DUTY_24H = "DUTY_24H";
export const ON_CALL = "ON_CALL";

type ScheduleType = typeof DUTY_24H | typeof ON_CALL;

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

const groupDefinitions = [
  { name: "Telefonia", slug: "telefonia" },
  { name: "Redes", slug: "redes" },
  { name: "Energia", slug: "energia" },
  { name: "Auxílios à Navegação", slug: "auxilios-navegacao" },
  { name: "Infraestrutura", slug: "infraestrutura" },
];

const technicianDefinitions = [
  { name: "Técnico A", duty: true, onCall: true, groups: ["telefonia", "redes"] },
  { name: "Técnico B", duty: true, onCall: true, groups: ["redes"] },
  { name: "Técnico C", duty: true, onCall: true, groups: ["energia", "auxilios-navegacao"] },
  { name: "Técnico D", duty: true, onCall: true, groups: ["auxilios-navegacao"] },
  { name: "Técnico E", duty: true, onCall: true, groups: ["telefonia"] },
  { name: "Técnico F", duty: true, onCall: true, groups: ["redes", "telefonia"] },
  { name: "Técnico G", duty: true, onCall: true, groups: ["energia"] },
  { name: "Técnico H", duty: true, onCall: true, groups: ["infraestrutura", "redes"] },
  { name: "Técnico I", duty: false, onCall: true, groups: ["infraestrutura"] },
  { name: "Técnico J", duty: false, onCall: true, groups: ["auxilios-navegacao", "energia"] },
];

export async function ensureInitialData() {
  const groups = new Map<string, number>();
  for (const definition of groupDefinitions) {
    const group = await prisma.technicianGroup.upsert({
      where: { slug: definition.slug },
      update: { name: definition.name },
      create: definition,
    });
    groups.set(definition.slug, group.id);
  }

  for (let index = 0; index < technicianDefinitions.length; index++) {
    const definition = technicianDefinitions[index];
    const technician = await prisma.technician.upsert({
      where: { name: definition.name },
      update: {
        active: true,
        participatesScale: definition.duty,
        participatesOnCall: definition.onCall,
      },
      create: {
        name: definition.name,
        active: true,
        participatesScale: definition.duty,
        participatesOnCall: definition.onCall,
        referenceDate: new Date(2026, 6, index % 2 === 0 ? 1 : 2),
        dailyHours: 8,
      },
    });

    const desiredGroupIds = definition.groups.map((slug) => groups.get(slug)).filter((id): id is number => Boolean(id));
    await prisma.technicianGroupMember.deleteMany({
      where: { technicianId: technician.id, groupId: { notIn: desiredGroupIds } },
    });

    for (let groupIndex = 0; groupIndex < desiredGroupIds.length; groupIndex++) {
      const groupId = desiredGroupIds[groupIndex];
      await prisma.technicianGroupMember.upsert({
        where: { technicianId_groupId: { technicianId: technician.id, groupId } },
        update: { isPrimary: groupIndex === 0 },
        create: { technicianId: technician.id, groupId, isPrimary: groupIndex === 0 },
      });
    }
  }

  await prisma.monthControl.upsert({
    where: { year_month: { year: 2026, month: 7 } },
    update: {},
    create: { year: 2026, month: 7, status: "LOCKED", cutoffDate: new Date(2026, 5, 25) },
  });
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
        data: { year, month: monthNumber, cutoffDate, status: mustBeLocked ? "LOCKED" : "OPEN" },
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
    where: { active: true, OR: [{ participatesScale: true }, { participatesOnCall: true }] },
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
      orderBy: [{ date: "asc" }, { scheduleType: "asc" }],
    }),
  ]);

  const assignments = [...storedAssignments];

  function eligibleFor(type: ScheduleType) {
    return participants.filter((item) => type === DUTY_24H ? item.participatesScale : item.participatesOnCall);
  }

  function assignmentsForMonth(technicianId: number, date: Date, type: ScheduleType) {
    return assignments.filter(
      (item) => item.technicianId === technicianId
        && item.scheduleType === type
        && item.date.getFullYear() === date.getFullYear()
        && item.date.getMonth() === date.getMonth(),
    ).length;
  }

  function totalAssignments(technicianId: number, type: ScheduleType) {
    return assignments.filter((item) => item.technicianId === technicianId && item.scheduleType === type).length;
  }

  function proximityPenalty(technicianId: number, date: Date, type: ScheduleType) {
    return assignments.reduce((penalty, item) => {
      if (item.technicianId !== technicianId || item.scheduleType !== type || isSameDay(item.date, date)) return penalty;
      const distance = Math.abs(Math.round((dateOnly(item.date).getTime() - dateOnly(date).getTime()) / 86400000));
      if (distance === 1) return penalty + (type === DUTY_24H ? 10000 : 1000);
      if (distance === 2) return penalty + (type === DUTY_24H ? 5000 : 250);
      return penalty;
    }, 0);
  }

  function sameDayOtherScalePenalty(technicianId: number, date: Date, type: ScheduleType) {
    return assignments.some((item) => item.technicianId === technicianId && item.scheduleType !== type && isSameDay(item.date, date))
      ? 5000000
      : 0;
  }

  function rankCandidates(date: Date, type: ScheduleType) {
    return eligibleFor(type).sort((a, b) => {
      const score = (candidate: typeof a) => (
        (isUnavailableOn(unavailabilities, candidate.id, date) ? 10000000 : 0)
        + sameDayOtherScalePenalty(candidate.id, date, type)
        + assignmentsForMonth(candidate.id, date, type) * 100000
        + proximityPenalty(candidate.id, date, type)
        + totalAssignments(candidate.id, type) * 10
        + candidate.id
      );
      return score(a) - score(b);
    });
  }

  const configurations: Array<{ type: ScheduleType; hours: number }> = [
    { type: DUTY_24H, hours: 24 },
    { type: ON_CALL, hours: 0 },
  ];

  for (let date = dateOnly(from); date <= to; date = addDays(date, 1)) {
    for (const configuration of configurations) {
      const locked = lockedMonths.has(monthKey(date));
      const existing = assignments.find((item) => item.scheduleType === configuration.type && isSameDay(item.date, date));
      const existingInvalid = existing ? isUnavailableOn(unavailabilities, existing.technicianId, date) : false;

      if (existing && (!existingInvalid || locked)) continue;

      const ranked = rankCandidates(date, configuration.type);
      const preferred = ranked.find((candidate) => (
        !isUnavailableOn(unavailabilities, candidate.id, date)
        && sameDayOtherScalePenalty(candidate.id, date, configuration.type) === 0
        && (configuration.type === ON_CALL || proximityPenalty(candidate.id, date, configuration.type) === 0)
      )) ?? ranked.find((candidate) => !isUnavailableOn(unavailabilities, candidate.id, date)) ?? ranked[0];

      if (!preferred) continue;
      const conflict = isUnavailableOn(unavailabilities, preferred.id, date);
      const prefix = configuration.type === DUTY_24H ? "DUTY" : "ON_CALL";

      if (existing) {
        const updated = await prisma.assignment.update({
          where: { id: existing.id },
          data: {
            technicianId: preferred.id,
            origin: conflict ? `${prefix}_RECALCULATED_CONFLICT` : `${prefix}_RECALCULATED`,
          },
        });
        existing.technicianId = updated.technicianId;
        existing.origin = updated.origin;
      } else {
        const created = await prisma.assignment.create({
          data: {
            date,
            technicianId: preferred.id,
            scheduleType: configuration.type,
            hours: configuration.hours,
            origin: conflict
              ? locked ? `${prefix}_BACKFILLED_CONFLICT` : `${prefix}_PROJECTED_CONFLICT`
              : locked ? `${prefix}_BACKFILLED` : `${prefix}_PROJECTED`,
          },
        });
        assignments.push(created);
      }
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

  const technicianInclude = { groups: { include: { group: true }, orderBy: { isPrimary: "desc" as const } } };

  const [technicians, assignments, assignmentContext, unavailabilities, controls, adjustments] = await Promise.all([
    prisma.technician.findMany({ where: { active: true }, include: technicianInclude, orderBy: { name: "asc" } }),
    prisma.assignment.findMany({
      where: { date: { gte: from, lte: to } },
      include: { technician: { include: technicianInclude } },
      orderBy: [{ date: "asc" }, { scheduleType: "asc" }],
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

  for (const assignment of affected) {
    const candidates = await prisma.technician.findMany({
      where: {
        active: true,
        id: { not: item.technicianId },
        ...(assignment.scheduleType === DUTY_24H ? { participatesScale: true } : { participatesOnCall: true }),
      },
      include: { assignments: true, unavailabilities: { where: { status: "APPROVED", affectsScale: true } } },
    });

    const ranked = [...candidates].sort((a, b) => {
      const unavailableA = a.unavailabilities.some((u) => u.startDate <= assignment.date && u.endDate >= assignment.date) ? 1 : 0;
      const unavailableB = b.unavailabilities.some((u) => u.startDate <= assignment.date && u.endDate >= assignment.date) ? 1 : 0;
      return unavailableA - unavailableB || a.assignments.length - b.assignments.length || a.id - b.id;
    });
    const replacement = ranked[0];
    if (!replacement) continue;

    const conflict = replacement.unavailabilities.some((u) => u.startDate <= assignment.date && u.endDate >= assignment.date);
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        technicianId: replacement.id,
        origin: conflict ? `${assignment.scheduleType}_RECALCULATED_CONFLICT` : `${assignment.scheduleType}_RECALCULATED`,
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
