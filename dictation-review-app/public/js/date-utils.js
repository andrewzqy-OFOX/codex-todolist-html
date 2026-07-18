const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidLocalDate(value) {
  if (typeof value !== "string" || !LOCAL_DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function assertLocalDate(value, fieldName = "date") {
  if (!isValidLocalDate(value)) {
    throw new Error(`${fieldName} must be a local date in YYYY-MM-DD format.`);
  }
}

export function toLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function compareLocalDates(left, right) {
  assertLocalDate(left, "left");
  assertLocalDate(right, "right");
  return left.localeCompare(right);
}

export function addDays(localDate, days) {
  assertLocalDate(localDate, "localDate");
  if (!Number.isInteger(days)) {
    throw new Error("days must be an integer.");
  }

  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}
