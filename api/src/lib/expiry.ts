export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() < day) next.setDate(0);
  return next;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function laterOf(a: Date, b: Date) {
  return a > b ? a : b;
}
