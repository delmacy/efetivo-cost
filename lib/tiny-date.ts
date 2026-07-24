export function startOfMonth(year: number, month: number) {
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

export function endOfMonth(year: number, month: number) {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

export function addDays(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}
