const express = require("express");
const { UserRole } = require("@prisma/client");
const asyncHandler = require("../middleware/async-handler");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const prisma = require("../lib/prisma");
const { AppError } = require("../lib/errors");
const { randomCode } = require("../lib/id-generator");
const { pushAdminNotification } = require("../lib/notifications");
const { isUnlockedByDate, toISODate } = require("../lib/date");
const { getEventStats, getRegistrationClosedReason } = require("../lib/event-rules");
const { serializeParticipation, PARTICIPATION_INCLUDE } = require("../lib/serializers");

const router = express.Router();

function parseJustificatif(body, existingName = "", existingDataUrl = "", existingOwner = "") {
  const fromObject = body?.justificatif || {};
  const name = String(fromObject?.name || body?.justificatifName || existingName || "").trim();
  const dataUrl = String(fromObject?.dataUrl || body?.justificatifDataUrl || existingDataUrl || "").trim();
  const owner = String(fromObject?.ownerEmail || body?.justificatifOwnerEmail || existingOwner || "").trim();
  return { name, dataUrl, owner };
}

function assertCanAccessParticipation(participation, auth) {
  if (auth.role === UserRole.ADMISSIONS) return;
  if (auth.role === UserRole.STUDENT && participation.studentId === auth.userId) return;
  throw new AppError("Acces interdit a ce dossier.", 403, "FORBIDDEN");
}

function assertStudentOwner(participation, auth) {
  if (auth.role !== UserRole.STUDENT || participation.studentId !== auth.userId) {
    throw new AppError("Operation reservee a l'etudiant proprietaire.", 403, "FORBIDDEN");
  }
}

async function getParticipationByCode(code) {
  const part = await prisma.participation.findFirst({
    where: { code },
    include: PARTICIPATION_INCLUDE
  });
  if (!part) throw new AppError("Dossier introuvable.", 404, "PARTICIPATION_NOT_FOUND");
  return part;
}

function normalizeDistance(type, rawDistance) {
  if (type !== "Voiture") return 0;
  const d = Number(rawDistance || 0);
  if (Number.isNaN(d) || d <= 0) return 0;
  return d;
}

function computeDefraiement(eventType, type, distanceKmAR, breakfastWanted) {
  const isSalon = String(eventType || "").toLowerCase() === "salon";
  let car = 0;

  if (type === "Voiture") {
    if (distanceKmAR > 0 && distanceKmAR < 20) car = 10;
    if (distanceKmAR >= 20) car = 20;
  }

  const breakfast = isSalon && breakfastWanted ? 10 : 0;
  const total = car + breakfast;

  return {
    breakfast,
    total
  };
}

router.use(requireAuth);

router.post("/events/:eventCode", asyncHandler(async (req, res) => {
  if (req.auth.role !== UserRole.STUDENT) {
    throw new AppError("Seuls les etudiants peuvent ouvrir un dossier.", 403, "FORBIDDEN");
  }

  const event = await prisma.event.findFirst({
    where: { code: req.params.eventCode, deletedAt: null }
  });
  if (!event) throw new AppError("Evenement introuvable.", 404, "EVENT_NOT_FOUND");

  const student = await prisma.user.findUnique({ where: { id: req.auth.userId } });
  if (!student || student.role !== UserRole.STUDENT) {
    throw new AppError("Compte etudiant introuvable.", 404, "STUDENT_NOT_FOUND");
  }

  const existing = await prisma.participation.findUnique({
    where: {
      studentId_eventId: {
        studentId: student.id,
        eventId: event.id
      }
    },
    include: PARTICIPATION_INCLUDE
  });

  const stats = await getEventStats(event.id, event.need);
  const lockReason = getRegistrationClosedReason(event.date, event.need, stats.validatedCount);

  if (existing && existing.status !== "Retire") {
    return res.json({ ok: true, participation: serializeParticipation(existing) });
  }

  if (lockReason) {
    throw new AppError(lockReason, 409, "REGISTRATION_LOCKED");
  }

  if (existing && existing.status === "Retire") {
    const reactivated = await prisma.participation.update({
      where: { id: existing.id },
      data: {
        status: "Brouillon",
        inscription: {
          upsert: {
            update: {
              available: "oui",
              roleWanted: student.defaultRoleWanted || "Participant",
              motivation: ""
            },
            create: {
              available: "oui",
              roleWanted: student.defaultRoleWanted || "Participant",
              motivation: ""
            }
          }
        },
        presence: {
          upsert: {
            update: {
              present: "non",
              arrivedAt: "",
              leftAt: "",
              transport: student.defaultTransport || "Transports",
              departFrom: student.defaultDepartFrom || "",
              departTime: "",
              notes: "",
              justificatifName: "",
              justificatifDataUrl: "",
              justificatifOwnerEmail: ""
            },
            create: {
              present: "non",
              arrivedAt: "",
              leftAt: "",
              transport: student.defaultTransport || "Transports",
              departFrom: student.defaultDepartFrom || "",
              departTime: "",
              notes: "",
              justificatifName: "",
              justificatifDataUrl: "",
              justificatifOwnerEmail: ""
            }
          }
        },
        defraiement: {
          upsert: {
            update: {
              type: "Transports",
              trajetA: "",
              trajetB: "",
              distanceKmAR: null,
              amountCalculated: null,
              breakfastWanted: false,
              lunchSalon: 0,
              justificatifName: "",
              justificatifDataUrl: "",
              justificatifOwnerEmail: "",
              status: "Non demande",
              adminMessage: ""
            },
            create: {
              type: "Transports",
              trajetA: "",
              trajetB: "",
              distanceKmAR: null,
              amountCalculated: null,
              breakfastWanted: false,
              lunchSalon: 0,
              justificatifName: "",
              justificatifDataUrl: "",
              justificatifOwnerEmail: "",
              status: "Non demande",
              adminMessage: ""
            }
          }
        },
        internalReview: {
          upsert: {
            update: {
              confirmedBySchool: "non",
              managedBy: "Admissions",
              internalComment: "",
              amountValidated: null,
              ccDonnes: "non"
            },
            create: {
              confirmedBySchool: "non",
              managedBy: "Admissions",
              internalComment: "",
              amountValidated: null,
              ccDonnes: "non"
            }
          }
        }
      },
      include: PARTICIPATION_INCLUDE
    });
    return res.json({ ok: true, participation: serializeParticipation(reactivated) });
  }

  const code = await randomCode("participation", "PART", 6);
  const created = await prisma.participation.create({
    data: {
      code,
      status: "Brouillon",
      studentId: student.id,
      eventId: event.id,
      inscription: {
        create: {
          available: "oui",
          roleWanted: student.defaultRoleWanted || "Participant",
          motivation: ""
        }
      },
      presence: {
        create: {
          present: "non",
          arrivedAt: "",
          leftAt: "",
          transport: student.defaultTransport || "Transports",
          departFrom: student.defaultDepartFrom || "",
          departTime: "",
          notes: "",
          justificatifName: "",
          justificatifDataUrl: "",
          justificatifOwnerEmail: ""
        }
      },
      defraiement: {
        create: {
          type: "Transports",
          trajetA: "",
          trajetB: "",
          distanceKmAR: null,
          amountCalculated: null,
          breakfastWanted: false,
          lunchSalon: 0,
          justificatifName: "",
          justificatifDataUrl: "",
          justificatifOwnerEmail: "",
          status: "Non demande",
          adminMessage: ""
        }
      },
      internalReview: {
        create: {
          confirmedBySchool: "non",
          managedBy: "Admissions",
          internalComment: "",
          amountValidated: null,
          ccDonnes: "non"
        }
      }
    },
    include: PARTICIPATION_INCLUDE
  });

  return res.status(201).json({
    ok: true,
    participation: serializeParticipation(created)
  });
}));

router.get("/:partCode", asyncHandler(async (req, res) => {
  const part = await getParticipationByCode(req.params.partCode);
  assertCanAccessParticipation(part, req.auth);
  return res.json({
    ok: true,
    participation: serializeParticipation(part)
  });
}));

router.put("/:partCode/inscription", asyncHandler(async (req, res) => {
  const part = await getParticipationByCode(req.params.partCode);
  assertCanAccessParticipation(part, req.auth);
  if (part.status === "Retire") {
    throw new AppError("Ce dossier est retire.", 409, "PARTICIPATION_RETIRED");
  }

  const available = String(req.body?.available || part.inscription?.available || "oui").trim() || "oui";
  const roleWanted = String(req.body?.roleWanted || part.inscription?.roleWanted || "Participant").trim() || "Participant";
  const motivation = String(req.body?.motivation || "").trim();
  const submit = !!req.body?.submit;

  const updated = await prisma.participation.update({
    where: { id: part.id },
    data: {
      status: submit ? "Soumis" : part.status,
      inscription: {
        upsert: {
          update: { available, roleWanted, motivation },
          create: { available, roleWanted, motivation }
        }
      }
    },
    include: PARTICIPATION_INCLUDE
  });

  if (submit) {
    await pushAdminNotification({
      kind: "new_registration",
      message: `${updated.student.name || "Etudiant"} a soumis un dossier pour ${updated.event.title}.`,
      meta: { partId: updated.code, eventId: updated.event.code, studentEmail: updated.student.email },
      actorId: req.auth.userId
    });
  }

  return res.json({ ok: true, participation: serializeParticipation(updated) });
}));

router.post("/:partCode/withdraw", asyncHandler(async (req, res) => {
  const part = await getParticipationByCode(req.params.partCode);
  assertStudentOwner(part, req.auth);
  if (part.status === "Retire") return res.json({ ok: true, participation: serializeParticipation(part) });

  const note = `${part.internalReview?.internalComment || ""}\nRetrait etudiant: ${new Date().toISOString()}`.trim();

  const updated = await prisma.participation.update({
    where: { id: part.id },
    data: {
      status: "Retire",
      internalReview: {
        upsert: {
          update: {
            confirmedBySchool: "non",
            internalComment: note
          },
          create: {
            confirmedBySchool: "non",
            managedBy: "Admissions",
            internalComment: note,
            amountValidated: null,
            ccDonnes: "non"
          }
        }
      }
    },
    include: PARTICIPATION_INCLUDE
  });

  await pushAdminNotification({
    kind: "student_withdraw",
    message: `${updated.student.name || "Etudiant"} s'est desiste de ${updated.event.title}.`,
    meta: { partId: updated.code, eventId: updated.event.code, studentEmail: updated.student.email },
    actorId: req.auth.userId
  });

  return res.json({ ok: true, participation: serializeParticipation(updated) });
}));

router.put("/:partCode/presence", asyncHandler(async (req, res) => {
  const part = await getParticipationByCode(req.params.partCode);
  assertCanAccessParticipation(part, req.auth);
  if (!isUnlockedByDate(part.event.date)) {
    throw new AppError(`Presence debloquee a partir du ${toISODate(part.event.date)}.`, 409, "TOO_EARLY");
  }

  const present = String(req.body?.present || part.presence?.present || "non").trim() || "non";
  const arrivedAt = String(req.body?.arrivedAt || "").trim();
  const leftAt = String(req.body?.leftAt || "").trim();
  const transport = String(req.body?.transport || part.presence?.transport || "Transports").trim() || "Transports";
  const departFrom = String(req.body?.departFrom || "").trim();
  const departTime = String(req.body?.departTime || "").trim();
  const notes = String(req.body?.notes || "").trim();

  const justif = parseJustificatif(req.body, part.presence?.justificatifName, part.presence?.justificatifDataUrl, part.presence?.justificatifOwnerEmail);
  const ownerEmail = part.student.email;

  if (present === "oui" && !justif.dataUrl) {
    throw new AppError("Justificatif obligatoire si present = oui.", 400, "JUSTIFICATIF_REQUIRED");
  }

  const updated = await prisma.participation.update({
    where: { id: part.id },
    data: {
      status: "Presence renseignee",
      presence: {
        upsert: {
          update: {
            present,
            arrivedAt,
            leftAt,
            transport,
            departFrom,
            departTime,
            notes,
            justificatifName: justif.name,
            justificatifDataUrl: justif.dataUrl,
            justificatifOwnerEmail: justif.owner || ownerEmail
          },
          create: {
            present,
            arrivedAt,
            leftAt,
            transport,
            departFrom,
            departTime,
            notes,
            justificatifName: justif.name,
            justificatifDataUrl: justif.dataUrl,
            justificatifOwnerEmail: justif.owner || ownerEmail
          }
        }
      }
    },
    include: PARTICIPATION_INCLUDE
  });

  return res.json({ ok: true, participation: serializeParticipation(updated) });
}));

router.put("/:partCode/defraiement", asyncHandler(async (req, res) => {
  const part = await getParticipationByCode(req.params.partCode);
  assertCanAccessParticipation(part, req.auth);
  if (!isUnlockedByDate(part.event.date)) {
    throw new AppError(`Defraiement debloque a partir du ${toISODate(part.event.date)}.`, 409, "TOO_EARLY");
  }

  const type = String(req.body?.type || part.defraiement?.type || "Transports").trim() || "Transports";
  const trajetA = String(req.body?.trajetA || "").trim();
  const trajetB = String(req.body?.trajetB || "").trim();
  const breakfastWanted = !!req.body?.breakfastWanted;
  const distanceKmAR = normalizeDistance(type, req.body?.distanceKmAR);
  const submit = !!req.body?.submit;

  const justif = parseJustificatif(req.body, part.defraiement?.justificatifName, part.defraiement?.justificatifDataUrl, part.defraiement?.justificatifOwnerEmail);
  const ownerEmail = part.student.email;

  const calc = computeDefraiement(part.event.type, type, distanceKmAR, breakfastWanted);
  const nextDefStatus = submit ? "En attente" : (part.defraiement?.status || "Non demande");
  const nextPartStatus = submit ? "Defraiement demande" : part.status;

  const updated = await prisma.participation.update({
    where: { id: part.id },
    data: {
      status: nextPartStatus,
      defraiement: {
        upsert: {
          update: {
            type,
            trajetA,
            trajetB,
            distanceKmAR: type === "Voiture" ? distanceKmAR : null,
            amountCalculated: calc.total,
            breakfastWanted: String(part.event.type || "").toLowerCase() === "salon" ? breakfastWanted : false,
            lunchSalon: calc.breakfast,
            justificatifName: justif.name,
            justificatifDataUrl: justif.dataUrl,
            justificatifOwnerEmail: justif.owner || ownerEmail,
            status: nextDefStatus
          },
          create: {
            type,
            trajetA,
            trajetB,
            distanceKmAR: type === "Voiture" ? distanceKmAR : null,
            amountCalculated: calc.total,
            breakfastWanted: String(part.event.type || "").toLowerCase() === "salon" ? breakfastWanted : false,
            lunchSalon: calc.breakfast,
            justificatifName: justif.name,
            justificatifDataUrl: justif.dataUrl,
            justificatifOwnerEmail: justif.owner || ownerEmail,
            status: nextDefStatus
          }
        }
      }
    },
    include: PARTICIPATION_INCLUDE
  });

  return res.json({ ok: true, participation: serializeParticipation(updated) });
}));

router.put("/:partCode/internal", requireAdmin, asyncHandler(async (req, res) => {
  const part = await getParticipationByCode(req.params.partCode);

  const confirmedBySchool = req.body?.confirmedBySchool === undefined
    ? (part.internalReview?.confirmedBySchool || "non")
    : String(req.body.confirmedBySchool || "non").trim();

  const managedBy = req.body?.managedBy === undefined
    ? (part.internalReview?.managedBy || "Admissions")
    : String(req.body.managedBy || "Admissions").trim();

  const internalComment = req.body?.internalComment === undefined
    ? (part.internalReview?.internalComment || "")
    : String(req.body.internalComment || "").trim();

  const amountValidated = req.body?.amountValidated === undefined || req.body?.amountValidated === ""
    ? part.internalReview?.amountValidated ?? null
    : Number(req.body.amountValidated);

  const ccDonnes = req.body?.ccDonnes === undefined
    ? (part.internalReview?.ccDonnes || "non")
    : String(req.body.ccDonnes || "non").trim();

  const defStatus = req.body?.defStatus === undefined
    ? (part.defraiement?.status || "Non demande")
    : String(req.body.defStatus || "Non demande").trim();
  const defMsg = req.body?.defMsg === undefined
    ? (part.defraiement?.adminMessage || "")
    : String(req.body.defMsg || "").trim();

  const updated = await prisma.participation.update({
    where: { id: part.id },
    data: {
      internalReview: {
        upsert: {
          update: {
            confirmedBySchool,
            managedBy,
            internalComment,
            amountValidated: Number.isNaN(amountValidated) ? null : amountValidated,
            ccDonnes
          },
          create: {
            confirmedBySchool,
            managedBy,
            internalComment,
            amountValidated: Number.isNaN(amountValidated) ? null : amountValidated,
            ccDonnes
          }
        }
      },
      defraiement: {
        upsert: {
          update: {
            status: defStatus,
            adminMessage: defMsg
          },
          create: {
            type: "Transports",
            trajetA: "",
            trajetB: "",
            distanceKmAR: null,
            amountCalculated: null,
            breakfastWanted: false,
            lunchSalon: 0,
            justificatifName: "",
            justificatifDataUrl: "",
            justificatifOwnerEmail: part.student.email,
            status: defStatus,
            adminMessage: defMsg
          }
        }
      }
    },
    include: PARTICIPATION_INCLUDE
  });

  return res.json({ ok: true, participation: serializeParticipation(updated) });
}));

router.delete("/:partCode", requireAdmin, asyncHandler(async (req, res) => {
  const part = await getParticipationByCode(req.params.partCode);

  await prisma.participation.delete({ where: { id: part.id } });
  await pushAdminNotification({
    kind: "participation_deleted",
    message: `Dossier supprime: ${part.student.name || "Etudiant"} - ${part.event.title} (${part.code}).`,
    meta: { partId: part.code, eventId: part.event.code, studentEmail: part.student.email },
    actorId: req.auth.userId
  });

  return res.json({ ok: true });
}));

module.exports = router;
