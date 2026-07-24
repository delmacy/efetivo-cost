"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "../lib/prisma";
import { approveAndRecalculate } from "../lib/schedule";

function parseDate(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) throw new Error("Data inválida.");
  return new Date(`${value}T12:00:00`);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export async function createTechnician(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const referenceDate = parseDate(formData.get("referenceDate"));
  const dailyHours = Number(formData.get("dailyHours") || 8);
  const participatesScale = formData.get("participatesScale") === "on";

  if (!name || dailyHours <= 0) throw new Error("Confira os dados do técnico.");

  const technician = await prisma.technician.create({
    data: { name, referenceDate, dailyHours, participatesScale, active: true },
  });

  revalidatePath("/");
  revalidatePath("/tecnicos");
  redirect(`/tecnicos/${technician.id}`);
}

export async function createUnavailability(formData: FormData) {
  const technicianId = Number(formData.get("technicianId"));
  const startDate = parseDate(formData.get("startDate"));
  const endDate = parseDate(formData.get("endDate"));
  const reason = String(formData.get("reason") || "Indisponibilidade informada").trim();
  const affectsScale = formData.get("affectsScale") === "on";
  const affectsOffice = formData.get("affectsOffice") === "on";

  if (!technicianId || endDate < startDate) throw new Error("Confira o técnico e o intervalo informado.");

  const monthControl = await prisma.monthControl.findUnique({
    where: { year_month: { year: startDate.getFullYear(), month: startDate.getMonth() + 1 } },
  });

  await prisma.unavailability.create({
    data: {
      technicianId,
      startDate,
      endDate,
      reason,
      affectsScale,
      affectsOffice,
      status: monthControl?.status === "LOCKED" ? "PENDING" : "APPROVED",
    },
  });

  revalidatePath("/");
  revalidatePath(`/tecnicos/${technicianId}`);
}

export async function createOfficeAdjustment(formData: FormData) {
  const technicianId = Number(formData.get("technicianId"));
  const date = parseDate(formData.get("date"));
  const hours = Number(formData.get("hours") || 8);
  const reason = String(formData.get("reason") || "Convocação extraordinária").trim();

  if (!technicianId || hours <= 0 || hours > 24) throw new Error("Confira o técnico, a data e as horas informadas.");

  const technician = await prisma.technician.findUnique({ where: { id: technicianId } });
  if (!technician?.active) throw new Error("Técnico inválido ou inativo.");

  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

  const unavailable = await prisma.unavailability.findFirst({
    where: {
      technicianId,
      status: "APPROVED",
      affectsOffice: true,
      startDate: { lte: dayEnd },
      endDate: { gte: dayStart },
    },
  });
  if (unavailable) throw new Error("O técnico possui indisponibilidade de expediente aprovada nessa data.");

  const nearbyAssignments = await prisma.assignment.findMany({
    where: {
      technicianId,
      hours: { gte: 24 },
      date: { gte: addDays(dayStart, -2), lte: dayEnd },
    },
  });

  const blockedByService = nearbyAssignments.some((assignment) => (
    isSameDay(assignment.date, date)
    || isSameDay(addDays(assignment.date, 1), date)
    || isSameDay(addDays(assignment.date, 2), date)
  ));
  if (blockedByService) throw new Error("Não é possível incluir expediente no serviço de 24h, no dia de saída ou no descanso posterior.");

  const existing = await prisma.workAdjustment.findFirst({
    where: { technicianId, type: "INCLUDE_OFFICE", date: { gte: dayStart, lte: dayEnd } },
  });

  if (existing) {
    await prisma.workAdjustment.update({
      where: { id: existing.id },
      data: { date, hours, reason },
    });
  } else {
    await prisma.workAdjustment.create({
      data: { technicianId, date, type: "INCLUDE_OFFICE", hours, reason },
    });
  }

  revalidatePath("/");
  revalidatePath(`/tecnicos/${technicianId}`);
}

export async function approveUnavailability(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("Pendência inválida.");
  const item = await prisma.unavailability.findUnique({ where: { id } });
  await approveAndRecalculate(id);
  revalidatePath("/");
  if (item) revalidatePath(`/tecnicos/${item.technicianId}`);
}

export async function rejectUnavailability(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("Pendência inválida.");
  const item = await prisma.unavailability.update({
    where: { id },
    data: { status: "REJECTED", reviewedAt: new Date(), reviewNote: "Rejeitada pelo escalante." },
  });
  revalidatePath("/");
  revalidatePath(`/tecnicos/${item.technicianId}`);
}
