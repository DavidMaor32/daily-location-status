# Run Instructions

This document provides instructions for running the project in both Docker and native setups. The project consists of a backend (TypeScript), a frontend (Vite), and a MySQL database.

## Prerequisites

- **Docker**: Ensure Docker and Docker Compose are installed.
- **Node.js**: Version 18+ is required for native setup.
- **MySQL**: Docker Compose will handle this automatically.

## Environment Variables

The project uses an `.env` file to configure runtime variables. An example file, `.env.example`, is provided. Copy it to `.env` and update the values as needed:

```bash
cp .env.example .env
```

### Key Variables

- **`DATABASE_URL`**: Connection string for the MySQL database. Example:
  ```
  DATABASE_URL=mysql://user:password@localhost:3306/database_name
  ```
- **`TELEGRAM_BOT_TOKEN`**: Token for the Telegram bot (if applicable).

## Docker Setup

1. **Build and Start Containers**:
   ```bash
   docker-compose up --build -d
   ```

2. **Verify Services**:
   - Backend: `http://localhost:8000/api/health`
   - Frontend: `http://localhost:5173`

3. **Stop Containers**:
   ```bash
   docker-compose down
   ```

## Native Setup

### Backend

1. **Install Dependencies**:
   ```bash
   cd backend
   npm install
   ```

2. **Run Backend**:
   ```bash
   npm run dev
   ```

3. **Verify Backend**:
   - Health endpoint: `http://localhost:8000/api/health`

### Frontend

#### Development Mode

1. **Install Dependencies**:
   ```bash
   cd frontend
   npm install
   ```

2. **Run Frontend**:
   ```bash
   npm run dev
   ```

3. **Access Frontend**:
   - Development server: `http://localhost:5173`

#### Production Mode

1. **Build Frontend**:
   ```bash
   npm run build
   ```

2. **Serve Frontend**:
   Use a static file server (e.g., `serve` or Nginx) to serve the `dist` folder.

## Testing

- **Backend Tests**:
  ```bash
  cd backend
  npm run test
  ```

- **Frontend Tests**: Not implemented yet.

## Notes

- The MySQL database is managed by Docker Compose. Ensure the `DATABASE_URL` matches the database configuration in the `docker-compose.yml` file.
- For production, ensure all environment variables are correctly set in the runtime environment.
