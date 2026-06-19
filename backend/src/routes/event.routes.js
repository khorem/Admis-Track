const express = require("express");
const { UserRole } = require("@prisma/client");
const asyncHandler = require("../middleware/async-handler");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const prisma = require("../lib/prisma");
const { AppError } = require("../lib/errors");
const { isValidEmail, isValidPhone, isValidTimeHHmm } = require("../utils/validators");
const { parseISODateStrict, toISODate } = require("../lib/date");
const { nextEventCode } = require("../lib/id-generator");
const { pushAdminNotification } = require("../lib/notifications");
const { getEventStats, getRegistrationClosedReason } = require("../lib/event-rules");
const { serializeEvent, serializeParticipation, PARTICIPATION_INCLUDE } = require("../lib/serializers");

const router = express.Router();

function parseEventPayload(body) {
  const payload = {
    type: String(body?.type || "").trim(),
    title: String(body?.title || "").trim(),
    date: String(body?.date || "").trim(),
    city: String(body?.city || "").trim(),
    location: String(body?.location || "").trim(),
    startTime: String(body?.startTime || "").trim(),
    endTime: String(body?.endTime || "").trim(),
    need: Number(body?.need || 0),
    contactName: String(body?.contact?.name || body?.contactName || "").trim(),
    contactEmail: String(body?.contact?.email || body?.contactEmail || "").trim(),
    contactPhone: String(body?.contact?.phone || body?.contactPhone || "").trim(),
    description: String(body?.description || "").trim()
  };

  if (!payload.type || !payload.title || !payload.date || !payload.city || !payload.location || !payload.startTime || !payload.endTime) {
    throw new AppError("Champs obligatoires manquants (type, titre, date, ville, lieu, heures).", 400, "MISSING_FIELDS");
  }
  if (!isValidTimeHHmm(payload.startTime) || !isValidTimeHHmm(payload.endTime)) {
    throw new AppError("Format d'heure invalide (HH:mm attendu).", 400, "INVALID_TIME");
  }
  if (payload.startTime >= payload.endTime) {
    throw new AppError("L'heure de fin doit etre superieure a l'heure de debut.", 400, "INVALID_TIME_RANGE");
  }
  if (!Number.isInteger(payload.need) || payload.need <= 0) {
    throw new AppError("Le nombre d'etudiants requis doit etre superieur a 0.", 400, "INVALID_NEED");
  }
  if (payload.contactEmail && !isValidEmail(payload.contactEmail)) {
    throw new AppError("Email contact invalide.", 400, "INVALID_CONTACT_EMAIL");
  }
  if (payload.contactPhone && !isValidPhone(payload.contactPhone)) {
    throw new AppError("Telephone contact invalide.", 400, "INVALID_CONTACT_PHONE");
  }

  const eventDate = parseISODateStrict(payload.date);
  return {
    ...payload,
    dateObj: eventDate
  };
}

router.get("/", asyncHandler(async (req, res) => {
  const where = {
    deletedAt: null
  };
  if (req.query.type) {
    where.type = String(req.query.type).trim();
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { date: "asc" }
  });

  const enriched = await Promise.all(events.map(async (event) => {
    const stats = await getEventStats(event.id, event.need);
    const lockReason = getRegistrationClosedReason(event.date, event.need, stats.validatedCount);
    return {
      ...serializeEvent(event, stats),
      lockReason
    };
  }));

  return res.json({
    ok: true,
    events: enriched
  });
}));

router.get("/summary/types", requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  const events = await prisma.event.findMany({
    where: { deletedAt: null },
    orderBy: { type: "asc" }
  });

  const byType = {};
  for (const event of events) {
    if (!byType[event.type]) {
      byType[event.type] = { type: event.type, totalEvents: 0, totalSubmitted: 0, totalValidated: 0 };
    }
    const stats = await getEventStats(event.id, event.need);
    byType[event.type].totalEvents += 1;
    byType[event.type].totalSubmitted += stats.submittedCount;
    byType[event.type].totalValidated += stats.validatedCount;
  }

  return res.json({
    ok: true,
    summary: Object.values(byType)
  });
}));

router.get("/:eventCode", asyncHandler(async (req, res) => {
  const event = await prisma.event.findFirst({
    where: {
      code: req.params.eventCode,
      deletedAt: null
    }
  });
  if (!event) throw new AppError("Evenement introuvable.", 404, "EVENT_NOT_FOUND");

  const stats = await getEventStats(event.id, event.need);
  return res.json({
    ok: true,
    event: {
      ...serializeEvent(event, stats),
      lockReason: getRegistrationClosedReason(event.date, event.need, stats.validatedCount)
    }
  });
}));

router.post("/", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const data = parseEventPayload(req.body);
  const code = await nextEventCode();

  const event = await prisma.event.create({
    data: {
      code,
      type: data.type,
      title: data.title,
      date: data.dateObj,
      city: data.city,
      location: data.location,
      startTime: data.startTime,
      endTime: data.endTime,
      hours: `${data.startTime} - ${data.endTime}`,
      need: data.need,
      contactName: data.contactName || null,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone || null,
      description: data.description || null,
      createdById: req.auth.userId
    }
  });

  await pushAdminNotification({
    kind: "event_created",
    message: `Evenement cree: ${event.title} (${event.code}).`,
    meta: { eventId: event.code },
    actorId: req.auth.userId
  });

  return res.status(201).json({
    ok: true,
    event: serializeEvent(event)
  });
}));

router.put("/:eventCode", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const existing = await prisma.event.findFirst({
    where: { code: req.params.eventCode, deletedAt: null }
  });
  if (!existing) throw new AppError("Evenement introuvable.", 404, "EVENT_NOT_FOUND");

  const data = parseEventPayload(req.body);
  const event = await prisma.event.update({
    where: { id: existing.id },
    data: {
      type: data.type,
      title: data.title,
      date: data.dateObj,
      city: data.city,
      location: data.location,
      startTime: data.startTime,
      endTime: data.endTime,
      hours: `${data.startTime} - ${data.endTime}`,
      need: data.need,
      contactName: data.contactName || null,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone || null,
      description: data.description || null
    }
  });

  await pushAdminNotification({
    kind: "event_updated",
    message: `Evenement modifie: ${event.title} (${event.code}).`,
    meta: { eventId: event.code },
    actorId: req.auth.userId
  });

  return res.json({
    ok: true,
    event: serializeEvent(event)
  });
}));

router.delete("/:eventCode", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const event = await prisma.event.findFirst({
    where: { code: req.params.eventCode, deletedAt: null }
  });
  if (!event) throw new AppError("Evenement introuvable.", 404, "EVENT_NOT_FOUND");

  await prisma.event.delete({ where: { id: event.id } });

  await pushAdminNotification({
    kind: "event_deleted",
    message: `Evenement supprime: ${event.title} (${event.code}).`,
    meta: { eventId: event.code },
    actorId: req.auth.userId
  });

  return res.json({ ok: true });
}));

router.get("/:eventCode/participations", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const event = await prisma.event.findFirst({
    where: { code: req.params.eventCode, deletedAt: null }
  });
  if (!event) throw new AppError("Evenement introuvable.", 404, "EVENT_NOT_FOUND");

  const activeOnly = String(req.query.activeOnly || "true").toLowerCase() !== "false";

  const participations = await prisma.participation.findMany({
    where: {
      eventId: event.id,
      ...(activeOnly ? { status: { not: "Retire" } } : {})
    },
    include: PARTICIPATION_INCLUDE,
    orderBy: { createdAt: "desc" }
  });

  return res.json({
    ok: true,
    event: {
      id: event.code,
      date: toISODate(event.date),
      title: event.title
    },
    participations: participations.map(serializeParticipation)
  });
}));

module.exports = router;
