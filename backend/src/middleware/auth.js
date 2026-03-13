const { UserRole } = require("@prisma/client");
const prisma = require("../lib/prisma");
const { AppError } = require("../lib/errors");
const { verifyToken } = require("../lib/jwt");

async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      return next(new AppError("Authentication required.", 401, "AUTH_REQUIRED"));
    }

    const token = header.slice(7).trim();
    if (!token) {
      return next(new AppError("Authentication token missing.", 401, "AUTH_REQUIRED"));
    }

    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true
      }
    });

    if (!user || !user.isActive) {
      return next(new AppError("User not found or inactive.", 401, "AUTH_USER_INVALID"));
    }

    req.auth = {
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenPayload: decoded
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

function requireRole(...roles) {
  return function roleCheck(req, _res, next) {
    if (!req.auth) {
      return next(new AppError("Authentication required.", 401, "AUTH_REQUIRED"));
    }
    if (!roles.includes(req.auth.role)) {
      return next(new AppError("Forbidden: insufficient role.", 403, "FORBIDDEN"));
    }
    return next();
  };
}

function requireAdmin(req, res, next) {
  return requireRole(UserRole.ADMISSIONS)(req, res, next);
}

module.exports = {
  requireAuth,
  requireRole,
  requireAdmin
};
