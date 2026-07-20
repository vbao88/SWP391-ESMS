# BẮT ĐẦU TỪ ĐÂY — ESMS

Đây là project skeleton có thể chạy cho **Eyewear Shop Management System**.

## 1. Yêu cầu trên máy

- Node.js đáp ứng `^20.19.0` hoặc `>=22.13.0`
- npm
- Docker Desktop
- Git

Kiểm tra:

```bash
node -v
npm -v
docker -v
git --version
```

## 2. Cấu hình môi trường

Trên Windows PowerShell:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

Hoặc Command Prompt:

```cmd
copy server\.env.example server\.env
copy client\.env.example client\.env
```

## 3. Khởi động MongoDB replica set

```bash
docker compose up -d
```

Kiểm tra:

```bash
docker compose ps
```

## 4. Cài thư viện

```bash
npm install
npm run install:all
```

## 5. Seed ba chi nhánh

```bash
npm run seed
```

## 6. Chạy cả frontend và backend

```bash
npm run dev
```

Địa chỉ:

- Frontend: http://localhost:5173
- Backend health: http://localhost:8080/api/v1/health
- Swagger: http://localhost:8080/api-docs

## 7. Chạy kiểm thử

```bash
npm test
```

## 8. Commit Git đề xuất

```bash
git init
git add .
git commit -m "chore: initialize ESMS monorepo skeleton"
```
