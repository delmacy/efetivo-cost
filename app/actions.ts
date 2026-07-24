"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../lib/prisma";
import { approveAndRecalculate } from "../lib/schedule";

function parseDate(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) throw new Error("Data inválida.");
  return new Date(`${value}T12:00:00`);
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
}

export async function approveUnavailability(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("Pendência inválida.");
  await approveAndRecalculate(id);
  revalidatePath("/");
}

export async function rejectUnavailability(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("Pendência inválida.");
  await prisma.unavailability.update({
    where: { id },
    data: { status: "REJECTED", reviewedAt: new Date(), reviewNote: "Rejeitada pelo escalante." },
  });
  revalidatePath("/");
}
