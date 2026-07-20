import http from "node:http";
import { app } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { initializeSocket } from "./config/socket.js";

async function startServer() {
  await connectDatabase();

  const httpServer = http.createServer(app);
  initializeSocket(httpServer);

  httpServer.listen(env.port, () => {
    console.log(`ESMS API listening on http://localhost:${env.port}`);
    console.log(`Swagger available at http://localhost:${env.port}/api-docs`);
  });

  const shutdown = async (signal) => {
    console.log(`${signal} received. Shutting down...`);
    httpServer.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

startServer().catch((error) => {
  console.error("Failed to start ESMS server:", error);
  process.exit(1);
});
