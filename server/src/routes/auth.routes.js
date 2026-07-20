import { Router } from "express";
import { registerCustomer } from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { registerSchema } from "../validations/auth.validation.js";

export const authRouter = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a customer account
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, email, password]
 *             properties:
 *               fullName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 example: Le Van Bao
 *               email:
 *                 type: string
 *                 format: email
 *                 example: bao@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 maxLength: 72
 *                 example: Password123
 *     responses:
 *       201:
 *         description: Customer account created and verification OTP delivered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Registration successful. Please verify your email.
 *                 data:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: bao@example.com
 *                     status:
 *                       type: string
 *                       enum: [pending_activation]
 *       400:
 *         description: Invalid registration input
 *       409:
 *         description: Email already exists
 *       429:
 *         description: Too many requests
 *       503:
 *         description: Account created but verification OTP delivery failed
 */
authRouter.post("/register", validate(registerSchema), asyncHandler(registerCustomer));
