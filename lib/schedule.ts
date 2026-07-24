import { addDays, endOfMonth, startOfMonth } from "./tiny-date";
import { prisma } from "./prisma";

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

export async function getDashboard(year = 2026, month = 7, months = 1) {
  await ensureInitialData();
  const from = startOfMonth(year, month);
  const lastMonth = new Date(year, month - 1 + Math.max(1, months), 0);
  const to = endOfMonth(lastMonth.getFullYear(), lastMonth.getMonth() + 1);

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
    include: { assignments: true, unavailabilities: { where: { status: "APPROVED" } } },
  });

  for (const assignment of affected) {
    const available = candidates
      .filter((candidate) => !candidate.unavailabilities.some((u) => u.startDate <= assignment.date && u.endDate >= assignment.date))
      .sort((a, b) => a.assignments.length - b.assignments.length)[0];
    if (available) {
      await prisma.assignment.update({
        where: { id: assignment.id },
        data: { technicianId: available.id, origin: "RECALCULATED" },
      });
    }
  }

  await prisma.unavailability.update({
    where: { id },
    data: { status: "APPROVED", reviewedAt: new Date(), reviewNote: "Aprovada com recálculo automático." },
  });

  const month = item.startDate.getMonth() + 1;
  const year = item.startDate.getFullYear();
  await prisma.monthControl.updateMany({ where: { year, month }, data: { version: { increment: 1 } } });
}
