const express = require("express");
const { UserRole } = require("@prisma/client");
const asyncHandler = require("../middleware/async-handler");
const prisma = require("../lib/prisma");
const { AppError } = require("../lib/errors");
const { isValidEmail, isValidPhone, requireFields } = require("../utils/validators");
const { signToken } = require("../lib/jwt");
const { serializeUser } = require("../lib/serializers");

const router = express.Router();

function isProfileComplete(user) {
  return !!(user.name && user.email && user.formation && user.campus && user.phone && user.studyYear);
}

function authPayload(user) {
  return {
    token: signToken({
      userId: user.id,
      role: user.role,
      email: user.email
    }),
    user: serializeUser(user),
    profileComplete: isProfileComplete(user)
  };
}

router.post("/student/login", asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    throw new AppError("Email invalide.", 400, "INVALID_EMAIL");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.json({
      ok: true,
      exists: false,
      requiresRegistration: true
    });
  }
  if (user.role !== UserRole.STUDENT) {
    throw new AppError("Ce compte n'est pas un compte etudiant.", 403, "ROLE_MISMATCH");
  }

  return res.json({
    ok: true,
    exists: true,
    requiresRegistration: !isProfileComplete(user),
    ...authPayload(user)
  });
}));

router.post("/student/register", asyncHandler(async (req, res) => {
  const payload = {
    name: String(req.body?.name || "").trim(),
    email: String(req.body?.email || "").trim().toLowerCase(),
    formation: String(req.body?.formation || "").trim(),
    campus: String(req.body?.campus || "").trim(),
    phone: String(req.body?.phone || "").trim(),
    year: String(req.body?.year || "").trim(),
    defaultRole: String(req.body?.defaultRole || "Participant").trim() || "Participant",
    defaultTransport: String(req.body?.defaultTransport || "Transports").trim() || "Transports",
    defaultDepartFrom: String(req.body?.defaultDepartFrom || "").trim()
  };

  const missing = requireFields(payload, ["name", "email", "formation", "campus", "phone", "year"]);
  if (missing.length) {
    throw new AppError(`Champs obligatoires manquants: ${missing.join(", ")}`, 400, "MISSING_FIELDS", { missing });
  }
  if (!isValidEmail(payload.email)) {
    throw new AppError("Email invalide.", 400, "INVALID_EMAIL");
  }
  if (!isValidPhone(payload.phone)) {
    throw new AppError("Numero de telephone invalide.", 400, "INVALID_PHONE");
  }

  const existing = await prisma.user.findUnique({ where: { email: payload.email } });
  if (existing && existing.role !== UserRole.STUDENT) {
    throw new AppError("Cet email est deja utilise par un compte admissions.", 409, "EMAIL_ALREADY_USED");
  }

  const user = await prisma.user.upsert({
    where: { email: payload.email },
    update: {
      role: UserRole.STUDENT,
      name: payload.name,
      formation: payload.formation,
      campus: payload.campus,
      phone: payload.phone,
      studyYear: payload.year,
      defaultRoleWanted: payload.defaultRole,
      defaultTransport: payload.defaultTransport,
      defaultDepartFrom: payload.defaultDepartFrom
    },
    create: {
      email: payload.email,
      role: UserRole.STUDENT,
      name: payload.name,
      formation: payload.formation,
      campus: payload.campus,
      phone: payload.phone,
      studyYear: payload.year,
      defaultRoleWanted: payload.defaultRole,
      defaultTransport: payload.defaultTransport,
      defaultDepartFrom: payload.defaultDepartFrom
    }
  });

  return res.status(201).json({
    ok: true,
    ...authPayload(user)
  });
}));

router.post("/admin/login", asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const name = String(req.body?.name || "Admissions").trim();

  if (!isValidEmail(email)) {
    throw new AppError("Email invalide.", 400, "INVALID_EMAIL");
  }

  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Prototype: allow admin creation for school domain.
    if (!email.endsWith("@ecole.fr") && !email.endsWith("@esiee-it.fr")) {
      throw new AppError("Compte admissions introuvable pour cet email.", 403, "ADMIN_NOT_ALLOWED");
    }
    user = await prisma.user.create({
      data: {
        email,
        role: UserRole.ADMISSIONS,
        name
      }
    });
  } else if (user.role !== UserRole.ADMISSIONS) {
    throw new AppError("Ce compte n'a pas les droits admissions.", 403, "ROLE_MISMATCH");
  }

  return res.json({
    ok: true,
    token: signToken({ userId: user.id, role: user.role, email: user.email }),
    user: serializeUser(user)
  });
}));

module.exports = router;
