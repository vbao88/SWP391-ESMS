# Eyewear Shop Management System (ESMS)

ESMS is a web application for Lensora Optical, a fictional three-branch eyewear retailer in Hanoi. The repository contains the React frontend, Express backend, MongoDB local environment, documentation, tests, and starter API documentation.

## Technology stack

### Client
- React + Vite
- Tailwind CSS
- shadcn/ui-compatible source structure
- React Router
- Axios
- TanStack Query
- Zustand
- React Hook Form + Zod
- Vitest + React Testing Library

### Server
- Node.js + Express.js using ES Modules
- MongoDB + Mongoose
- Joi validation
- JWT-ready middleware structure
- Socket.IO
- Swagger/OpenAPI
- Vitest + Supertest

### Infrastructure
- MongoDB replica set through Docker Compose
- MongoDB Atlas for deployment
- Vercel for the client
- Railway for the server
- Cloudinary, VNPAY Sandbox, GHN, email and AI providers as later integrations

## Repository structure

```text
eyewear-shop-management-system/
├── client/
├── server/
├── documents/
├── docker/
├── docker-compose.yml
├── README_FIRST.md
└── README.md
```

Read `README_FIRST.md` for beginner-friendly setup instructions.
