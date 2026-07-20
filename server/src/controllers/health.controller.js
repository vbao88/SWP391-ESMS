import mongoose from "mongoose";
import { env } from "../config/env.js";
import { sendSuccess } from "../utils/response.js";

const databaseStates = ["disconnected", "connected", "connecting", "disconnecting"];

export function getHealth(_request, response) {
  return sendSuccess(response, {
    message: "ESMS API is running",
    data: {
      environment: env.nodeEnv,
      timestamp: new Date().toISOString(),
      database: databaseStates[mongoose.connection.readyState] ?? "unknown",
    },
  });
}
