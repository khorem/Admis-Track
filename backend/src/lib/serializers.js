const { toISODate } = require("./date");

function toPlainNumber(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isNaN(n) ? fallback : n;
  }
  if (typeof value.toNumber === "function") return value.toNumber();
  return fallback;
}

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name || "",
    formation: user.formation || "",
    campus: user.campus || "",
    phone: user.phone || "",
    year: user.studyYear || "",
    defaultRole: user.defaultRoleWanted || "Participant",
    defaultTransport: user.defaultTransport || "Transports",
    defaultDepartFrom: user.defaultDepartFrom || ""
  };
}

function serializeEvent(event, stats = null) {
  return {
    id: event.code,
    type: event.type,
    title: event.title,
    date: toISODate(event.date),
    city: event.city,
    location: event.location,
    startTime: event.startTime,
    endTime: event.endTime,
    hours: event.hours || `${event.startTime} - ${event.endTime}`,
    need: event.need,
    contact: {
      name: event.contactName || "",
      email: event.contactEmail || "",
      phone: event.contactPhone || ""
    },
    description: event.description || "",
    submittedCount: stats?.submittedCount ?? undefined,
    validatedCount: stats?.validatedCount ?? undefined,
    remaining: stats?.remaining ?? undefined
  };
}

function serializeParticipation(participation) {
  const inscription = participation.inscription || {};
  const presence = participation.presence || {};
  const defraiement = participation.defraiement || {};
  const internal = participation.internalReview || {};

  return {
    id: participation.code,
    status: participation.status,
    createdAt: participation.createdAt,
    event: serializeEvent(participation.event),
    student: {
      name: participation.student?.name || "Etudiant",
      email: participation.student?.email || "",
      phone: participation.student?.phone || "",
      formation: participation.student?.formation || "",
      campus: participation.student?.campus || "",
      year: participation.student?.studyYear || "",
      address: ""
    },
    inscription: {
      available: inscription.available || "oui",
      roleWanted: inscription.roleWanted || "Participant",
      motivation: inscription.motivation || ""
    },
    presence: {
      present: presence.present || "non",
      arrivedAt: presence.arrivedAt || "",
      leftAt: presence.leftAt || "",
      transport: presence.transport || "Transports",
      departFrom: presence.departFrom || "",
      departTime: presence.departTime || "",
      notes: presence.notes || "",
      justificatifName: presence.justificatifName || "",
      justificatifDataUrl: presence.justificatifDataUrl || "",
      justificatifOwnerEmail: presence.justificatifOwnerEmail || ""
    },
    defraiement: {
      type: defraiement.type || "Transports",
      trajetA: defraiement.trajetA || "",
      trajetB: defraiement.trajetB || "",
      distanceKmAR: defraiement.distanceKmAR === null || defraiement.distanceKmAR === undefined ? "" : String(defraiement.distanceKmAR),
      amountCalculated: toPlainNumber(defraiement.amountCalculated, "") === "" ? "" : String(toPlainNumber(defraiement.amountCalculated, 0).toFixed(0)),
      breakfastWanted: !!defraiement.breakfastWanted,
      lunchSalon: toPlainNumber(defraiement.lunchSalon, 0),
      justificatifName: defraiement.justificatifName || "",
      justificatifDataUrl: defraiement.justificatifDataUrl || "",
      justificatifOwnerEmail: defraiement.justificatifOwnerEmail || "",
      status: defraiement.status || "Non demande",
      adminMessage: defraiement.adminMessage || ""
    },
    internal: {
      confirmedBySchool: internal.confirmedBySchool || "non",
      managedBy: internal.managedBy || "Admissions",
      internalComment: internal.internalComment || "",
      amountValidated: toPlainNumber(internal.amountValidated, "") === "" ? "" : String(toPlainNumber(internal.amountValidated, 0)),
      ccDonnes: internal.ccDonnes || "non"
    }
  };
}

const PARTICIPATION_INCLUDE = {
  student: true,
  event: true,
  inscription: true,
  presence: true,
  defraiement: true,
  internalReview: true
};

module.exports = {
  serializeUser,
  serializeEvent,
  serializeParticipation,
  PARTICIPATION_INCLUDE
};
