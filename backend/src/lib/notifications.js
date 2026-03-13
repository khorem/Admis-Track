const prisma = require("./prisma");
const { randomCode } = require("./id-generator");

async function pushAdminNotification({ kind, message, meta = null, actorId = null }) {
  const code = await randomCode("notification", "NTF", 8);
  return prisma.notification.create({
    data: {
      code,
      kind,
      message,
      meta: meta || undefined,
      actorId: actorId || undefined
    }
  });
}

module.exports = { pushAdminNotification };
