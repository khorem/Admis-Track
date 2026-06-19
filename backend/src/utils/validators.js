function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function isValidPhone(phone) {
  return /^(\+?\d[\d\s.-]{7,}\d)$/.test(String(phone || "").trim());
}

function isValidTimeHHmm(value) {
  return /^\d{2}:\d{2}$/.test(String(value || ""));
}

function requireFields(payload, fields) {
  const missing = fields.filter((field) => {
    const value = payload[field];
    return value === undefined || value === null || String(value).trim() === "";
  });
  return missing;
}

module.exports = {
  isValidEmail,
  isValidPhone,
  isValidTimeHHmm,
  requireFields
};
