# Tickora AI Frontend

React + TypeScript frontend for Tickora AI, an employee attendance assistant. The frontend provides email/password sign-in and a chat interface for asking questions about employee attendance and related HR records.

## Technology stack

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- Lucide React icons
- Fetch API for communication with the FastAPI backend

## Features

- Email and password login
- JWT access-token session handling
- Employee profile display after login
- Chat interface connected to the backend AI endpoint
- Bearer token attached to chatbot requests
- Sign-out flow
- Session-expiry handling for unauthorized chatbot requests
- Responsive UI with a light theme and blue accents

## Project structure

```text
src/
├── App.tsx
├── App.css
├── LoginPage.tsx
├── index.css
├── main.tsx
├── assets/
└── service/
    ├── authService.ts
    └── chatService.ts
```

The exact structure can vary as the application evolves. Update this tree when files are added or renamed.

## Prerequisites

- Node.js version compatible with the installed Vite version
- npm
- The Tickora AI FastAPI backend running locally or deployed
- A backend login endpoint at `POST /api/auth/login`

## Environment variables

Create a `.env` file in the frontend project root:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

`VITE_API_BASE_URL` is the base URL used by the frontend to contact the backend. For a deployed environment, set it to the deployed API origin.

Do not put passwords, JWT secrets, database credentials, or other server-side secrets in frontend environment variables. Variables prefixed with `VITE_` are exposed to the browser bundle.

If the frontend still contains `VITE_EMPLOYEE_CODE`, remove it after confirming no code uses it. The authenticated employee profile should determine the employee code used for protected requests.

## Install dependencies

From the frontend project root:

```powershell
npm install
```

## Run the development server

```powershell
npm run dev
```

Vite prints the local URL, commonly:

```text
http://localhost:5173
```

## Build for production

```powershell
npm run build
```

This runs TypeScript project checks and builds the production assets with Vite.

Preview the production build locally:

```powershell
npm run preview
```

Run lint checks with:

```powershell
npm run lint
```

## Authentication flow

1. The user enters their registered email and password on `LoginPage.tsx`.
2. `authService.ts` sends the credentials to `POST /api/auth/login`.
3. On success, the backend returns an access token and employee profile.
4. The frontend keeps the session in `sessionStorage`.
5. The chat service reads the token and authenticated employee code.
6. The chat request includes `Authorization: Bearer <access_token>`.
7. If the backend returns `401 Unauthorized`, the frontend clears the session and returns the user to the login page.
8. The user can sign out to clear the local session.

The frontend's token-expiration check is a convenience for the UI, not a replacement for backend JWT verification. The backend remains responsible for validating every protected request.

## Backend integration

The frontend currently uses the following endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | Sign in with email and password |
| `POST` | `/api/chat/{employee_code}` | Send a question to Tickora AI |

The chat service should attach the bearer token to each protected request. If additional frontend screens call attendance, leave, timesheet, WFH, or schedule endpoints, those requests must also include the token.

## CORS

When the frontend and backend use different origins, the FastAPI backend must allow the frontend origin through its CORS configuration. For local development, the frontend commonly runs on port `5173`; verify the actual Vite URL and backend CORS settings.

## UI theme

The frontend uses a light interface with blue accents. Keep the login page and chatbot theme consistent when adjusting button, icon, focus, and hover colors. Preserve distinct status colors for success and error messages.

## Troubleshooting

### Login request fails to connect
- Confirm the backend is running.
- Verify `VITE_API_BASE_URL` in `.env`.
- Restart Vite after changing `.env`.
- Check the browser developer console and Network tab.

### CORS error
- Check the FastAPI CORS allowlist.
- Make sure the exact frontend origin is allowed.

### `401 Unauthorized`
- Sign in again to get a valid token.
- Confirm protected requests include `Authorization: Bearer <token>`.
- Check that the backend and frontend use the same API base URL.

### TypeScript build error
Run:

```powershell
npm run build
```

Resolve the reported file path and line number before deploying.

## Security notes

- Never commit `.env` files.
- Do not store secrets in `VITE_*` variables.
- The current implementation uses `sessionStorage`, which is cleared when the browser tab's session ends. It is still accessible to JavaScript running on the page, so protect the app against cross-site scripting (XSS).
- Use HTTPS in production.
- Consider a server-managed `HttpOnly`, `Secure`, `SameSite` cookie strategy for higher-security production sessions.
- Do not log passwords or access tokens.
