const env = require("./config/env");
const app = require("./app");
const prisma = require("./lib/prisma");

const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API running on http://localhost:${env.PORT}`);
});

async function shutdown() {
  // eslint-disable-next-line no-console
  console.log("Shutting down server...");
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
