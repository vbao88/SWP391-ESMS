import { Router } from "express";
import { getHealth } from "../controllers/health.controller.js";

export const healthRouter = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Check API health
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: API status
 */
healthRouter.get("/", getHealth);
