const { Prisma } = require("@prisma/client");
const { AppError } = require("../lib/errors");

function errorHandler(err, req, res, _next) {
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "Unexpected server error.";
  let details = null;

  if (err instanceof AppError) {
    status = err.status;
    code = err.code;
    message = err.message;
    details = err.details || null;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    status = 400;
    code = err.code || "PRISMA_ERROR";
    message = "Database request error.";
    details = { prismaCode: err.code, meta: err.meta || null };
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    status = 400;
    code = "PRISMA_VALIDATION_ERROR";
    message = "Invalid database payload.";
  } else if (err && err.name === "JsonWebTokenError") {
    status = 401;
    code = "INVALID_TOKEN";
    message = "Invalid authentication token.";
  } else if (err && err.name === "TokenExpiredError") {
    status = 401;
    code = "TOKEN_EXPIRED";
    message = "Authentication token expired.";
  }

  if (process.env.NODE_ENV !== "production" && !details) {
    details = err?.stack || null;
  }

  res.status(status).json({
    ok: false,
    code,
    message,
    details
  });
}

module.exports = errorHandler;
