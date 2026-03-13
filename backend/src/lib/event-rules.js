const prisma = require("./prisma");
const { canRegisterByDate } = require("./date");

async function getEventStats(eventId, need = 0) {
  const submittedCount = await prisma.participation.count({
    where: {
      eventId,
      status: { notIn: ["Retire", "Brouillon"] }
    }
  });

  const validatedCount = await prisma.internalReview.count({
    where: {
      confirmedBySchool: "oui",
      participation: {
        eventId,
        status: { not: "Retire" }
      }
    }
  });

  const remaining = need > 0 ? Math.max(need - validatedCount, 0) : 0;

  return {
    submittedCount,
    validatedCount,
    remaining
  };
}

function getRegistrationClosedReason(eventDate, need, validatedCount) {
  if (!canRegisterByDate(eventDate)) {
    return "Inscriptions fermees le jour J.";
  }
  if ((Number(need) || 0) > 0 && (Number(validatedCount) || 0) >= Number(need)) {
    return "Evenement complet (quota valide atteint).";
  }
  return "";
}

module.exports = {
  getEventStats,
  getRegistrationClosedReason
};
