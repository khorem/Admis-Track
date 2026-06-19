const prisma = require("./prisma");

function parseNumericSuffix(code, prefix) {
  const raw = String(code || "");
  const regex = new RegExp(`^${prefix}-(\\d+)$`);
  const match = raw.match(regex);
  if (!match) return 0;
  return Number(match[1] || 0);
}

async function nextEventCode() {
  const last = await prisma.event.findFirst({
    orderBy: { id: "desc" },
    select: { code: true }
  });
  const n = parseNumericSuffix(last?.code, "EVT") + 1;
  return `EVT-${String(n).padStart(3, "0")}`;
}

async function randomCode(modelName, prefix, length = 6) {
  const alphabet = "0123456789ABCDEF";

  for (let i = 0; i < 10; i += 1) {
    let suffix = "";
    for (let j = 0; j < length; j += 1) {
      suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    const code = `${prefix}-${suffix}`;
    const exists = await prisma[modelName].findFirst({
      where: { code },
      select: { id: true }
    });
    if (!exists) return code;
  }

  // Fallback deterministic
  return `${prefix}-${Date.now().toString(16).toUpperCase()}`;
}

module.exports = {
  nextEventCode,
  randomCode
};
