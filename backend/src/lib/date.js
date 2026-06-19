const { AppError } = require("./errors");

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toISODate(dateValue) {
  if (!dateValue) return "";
  const d = new Date(dateValue);
  return d.toISOString().slice(0, 10);
}

function parseISODateStrict(dateIso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateIso || ""))) {
    throw new AppError("Invalid date format. Expected YYYY-MM-DD.", 400, "INVALID_DATE");
  }
  return new Date(`${dateIso}T00:00:00.000Z`);
}

function isUnlockedByDate(eventDate) {
  return todayISO() >= toISODate(eventDate);
}

function canRegisterByDate(eventDate) {
  return todayISO() < toISODate(eventDate);
}

module.exports = {
  todayISO,
  toISODate,
  parseISODateStrict,
  isUnlockedByDate,
  canRegisterByDate
};
