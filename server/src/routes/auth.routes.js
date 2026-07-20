import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import {
  login,
  refreshSession,
  registerCustomer,
  resendVerificationOtp,
  verifyEmail,
} from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  loginSchema,
  refreshSchema,
  registerSchema,
  resendVerificationOtpSchema,
  verifyEmailSchema,
} from "../validations/auth.validation.js";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.nodeEnv === "test",
  handler: (_request, response) => response.status(429).json({
    success: false,
    message: "Too many login attempts. Please try again later.",
    details: null,
  }),
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.nodeEnv === "test",
  handler: (_request, response) => response.status(429).json({
    success: false,
    message: "Too many refresh attempts. Please try again later.",
    details: null,
  }),
});

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Log in with email and password
 *     description: Returns an Access Token for Bearer authentication and sets the Refresh Token only in an HTTP-only cookie. The Refresh Token is never returned in JSON.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: bao@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 maxLength: 72
 *                 example: Password123
 *     responses:
 *       200:
 *         description: Login successful; sets the HttpOnly esms_refresh_token cookie
 *         headers:
 *           Set-Cookie:
 *             description: HttpOnly, SameSite=Lax Refresh Token cookie scoped to /api/v1/auth
 *             schema:
 *               type: string
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
 *                   example: Login successful.
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       description: Use as a Bearer token for protected endpoints
 *                     expiresIn:
 *                       type: string
 *                       example: 15m
 *                     user:
 *                       type: object
 *                       properties:
 *                         id: { type: string }
 *                         fullName: { type: string }
 *                         email: { type: string, format: email }
 *                         role: { type: string }
 *                         adminLevel: { type: string, nullable: true }
 *                         branchId: { type: string, nullable: true }
 *                         status: { type: string, enum: [active] }
 *       400:
 *         description: Malformed login input
 *       401:
 *         description: Invalid email or password
 *       429:
 *         description: Too many login attempts from this IP
 *       500:
 *         description: Internal server error while completing login
 *       503:
 *         description: Login session could not be persisted after concurrent changes
 */
authRouter.post("/login", loginLimiter, validate(loginSchema), asyncHandler(login));

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Rotate a Refresh Token and issue a new Access Token
 *     description: Reads the single-use Refresh Token only from the HttpOnly cookie. Every success rotates the cookie and invalidates the old token. The Refresh Token never appears in JSON.
 *     tags:
 *       - Authentication
 *     security:
 *       - refreshCookie: []
 *     responses:
 *       200:
 *         description: Token refreshed successfully and rotated Refresh Cookie set
 *         headers:
 *           Set-Cookie:
 *             description: Rotated HttpOnly, SameSite=Lax Refresh Token cookie
 *             schema: { type: string }
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Token refreshed successfully. }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       description: Use as a Bearer token for protected endpoints
 *                     expiresIn: { type: string, example: 15m }
 *       401:
 *         description: Invalid or expired session; clears the Refresh Cookie
 *       429:
 *         description: Too many refresh attempts from this IP
 *       500:
 *         description: Internal server error
 *       503:
 *         description: Refresh rotation could not be completed
 */
authRouter.post(
  "/refresh",
  refreshLimiter,
  validate(refreshSchema),
  asyncHandler(refreshSession),
);

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
