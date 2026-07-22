import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { branchRouter } from "./branch.routes.js";
import { healthRouter } from "./health.routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/branches", branchRouter);
apiRouter.use("/health", healthRouter);
