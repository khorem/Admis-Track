const express = require("express");
const { UserRole } = require("@prisma/client");
const asyncHandler = require("../middleware/async-handler");
const { requireAuth, requireRole } = require("../middleware/auth");
const prisma = require("../lib/prisma");
const { AppError } = require("../lib/errors");
const { signToken } = require("../lib/jwt");
const { isValidEmail, isValidPhone } = require("../utils/validators");
const { serializeUser, serializeParticipation, PARTICIPATION_INCLUDE } = require("../lib/serializers");

const router = express.Router();

router.use(requireAuth);

router.get("/me", requireRole(UserRole.STUDENT), asyncHandler(async (req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.auth.userId } });
  if (!me) throw new AppError("Compte etudiant introuvable.", 404, "STUDENT_NOT_FOUND");

  return res.json({
    ok: true,
    profile: serializeUser(me)
  });
}));

router.put("/me", requireRole(UserRole.STUDENT), asyncHandler(async (req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.auth.userId } });
  if (!me) throw new AppError("Compte etudiant introuvable.", 404, "STUDENT_NOT_FOUND");

  const nextEmailRaw = req.body?.email === undefined ? me.email : String(req.body?.email || "").trim().toLowerCase();
  if (!isValidEmail(nextEmailRaw)) {
    throw new AppError("Email invalide.", 400, "INVALID_EMAIL");
  }

  const nextPhone = req.body?.phone === undefined ? (me.phone || "") : String(req.body?.phone || "").trim();
  if (nextPhone && !isValidPhone(nextPhone)) {
    throw new AppError("Numero de telephone invalide.", 400, "INVALID_PHONE");
  }

  if (nextEmailRaw !== me.email) {
    const collision = await prisma.user.findUnique({ where: { email: nextEmailRaw } });
    if (collision) {
      throw new AppError("Cet email est deja utilise.", 409, "EMAIL_ALREADY_USED");
    }
  }

  const updated = await prisma.user.update({
    where: { id: me.id },
    data: {
      email: nextEmailRaw,
      name: req.body?.name === undefined ? me.name : String(req.body?.name || "").trim(),
      formation: req.body?.formation === undefined ? me.formation : String(req.body?.formation || "").trim(),
      campus: req.body?.campus === undefined ? me.campus : String(req.body?.campus || "").trim(),
      phone: nextPhone,
      studyYear: req.body?.year === undefined ? me.studyYear : String(req.body?.year || "").trim(),
      defaultRoleWanted: req.body?.defaultRole === undefined ? me.defaultRoleWanted : String(req.body?.defaultRole || "").trim(),
      defaultTransport: req.body?.defaultTransport === undefined ? me.defaultTransport : String(req.body?.defaultTransport || "").trim(),
      defaultDepartFrom: req.body?.defaultDepartFrom === undefined ? me.defaultDepartFrom : String(req.body?.defaultDepartFrom || "").trim()
    }
  });

  return res.json({
    ok: true,
    profile: serializeUser(updated),
    token: signToken({ userId: updated.id, role: updated.role, email: updated.email })
  });
}));

router.get("/me/participations", requireRole(UserRole.STUDENT), asyncHandler(async (req, res) => {
  const list = await prisma.participation.findMany({
    where: { studentId: req.auth.userId },
    include: PARTICIPATION_INCLUDE,
    orderBy: { createdAt: "desc" }
  });

  return res.json({
    ok: true,
    participations: list.map(serializeParticipation)
  });
}));

module.exports = router;
