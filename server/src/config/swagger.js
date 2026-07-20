import swaggerJsdoc from "swagger-jsdoc";
import { env } from "./env.js";

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "ESMS REST API",
      version: "0.1.0",
      description: "Eyewear Shop Management System API documentation",
    },
    servers: [
      { url: `http://localhost:${env.port}/api/v1`, description: "Local development" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        refreshCookie: {
          type: "apiKey",
          in: "cookie",
          name: env.refreshCookieName,
        },
      },
    },
  },
  apis: ["./src/routes/*.js"],
});
