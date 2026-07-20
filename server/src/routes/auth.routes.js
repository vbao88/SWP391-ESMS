import { Router } from "express";
import {
  registerCustomer,
  resendVerificationOtp,
  verifyEmail,
} from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  registerSchema,
  resendVerificationOtpSchema,
  verifyEmailSchema,
} from "../validations/auth.validation.js";

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

/**
 * @openapi
 * /auth/verify-email:
 *   post:
 *     summary: Verify a customer email using the newest OTP
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: bao@example.com
 *               otp:
 *                 type: string
 *                 pattern: '^\\d{6}$'
 *                 example: '123456'
 *     responses:
 *       200:
 *         description: Email verified successfully
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
 *                   example: Email verified successfully.
 *                 data:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: bao@example.com
 *                     status:
 *                       type: string
 *                       enum: [active]
 *       400:
 *         description: OTP is incorrect or expired
 *       404:
 *         description: Account does not exist
 *       409:
 *         description: Account is already verified or is not eligible for verification
 *       429:
 *         description: Too many requests
 */
authRouter.post("/verify-email", validate(verifyEmailSchema), asyncHandler(verifyEmail));

/**
 * @openapi
 * /auth/resend-verification-otp:
 *   post:
 *     summary: Generate and deliver a new customer email verification OTP
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: bao@example.com
 *     responses:
 *       200:
 *         description: A new verification OTP was generated
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
 *                   example: A new verification OTP has been generated.
 *                 data:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: bao@example.com
 *       404:
 *         description: Account does not exist
 *       409:
 *         description: Account is already verified, not eligible, or has a conflicting request
 *       429:
 *         description: OTP was requested too recently
 *         headers:
 *           Retry-After:
 *             description: Whole seconds remaining before another OTP may be requested
 *             schema:
 *               type: integer
 *       503:
 *         description: OTP was generated but delivery failed
 */
authRouter.post(
  "/resend-verification-otp",
  validate(resendVerificationOtpSchema),
  asyncHandler(resendVerificationOtp),
);
