const express = require("express");
const asyncHandler = require("../middleware/async-handler");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const prisma = require("../lib/prisma");

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/", asyncHandler(async (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 30)));
  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: limit
  });
  return res.json({
    ok: true,
    notifications: notifications.map((n) => ({
      id: n.code,
      kind: n.kind,
      message: n.message,
      meta: n.meta,
      createdAt: n.createdAt
    }))
  });
}));

router.delete("/", asyncHandler(async (_req, res) => {
  await prisma.notification.deleteMany({});
  return res.json({ ok: true });
}));

module.exports = router;
