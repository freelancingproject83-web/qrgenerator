# QR Generator API contract

This document is the frontend integration reference for the QR Generator API. All request and response bodies use JSON unless an endpoint explicitly returns no content.

## Environments

| Environment | Base URL                                               |
| ----------- | ------------------------------------------------------ |
| Local       | `http://127.0.0.1:3000`                                |
| Production  | Set through `VITE_API_BASE_URL` in each Vercel project |

Versioned application endpoints start with `/api/v1`. Health endpoints are intentionally unversioned.

```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
```

## Shared enums

### UserRole

```ts
type UserRole = 'super_admin' | 'tenant_admin' | 'tenant_user';
```

| Value          | Meaning                                                         |
| -------------- | --------------------------------------------------------------- |
| `super_admin`  | Platform-level administrator. Can promote tenant users.         |
| `tenant_admin` | Tenant administrator. No tenant-management endpoints exist yet. |
| `tenant_user`  | Default role assigned by public registration.                   |

Clients cannot choose a role during registration. The API always persists `tenant_user`, even if an extra `role` property is submitted.

## Shared models

### User

```ts
interface User {
  id: string; // UUID
  email: string;
  role: UserRole;
  createdAt: string; // ISO 8601 date-time
  updatedAt: string; // ISO 8601 date-time
}
```

Example:

```json
{
  "id": "7ccafba9-27de-43bf-a5d2-1b1333338c57",
  "email": "person@example.com",
  "role": "tenant_user",
  "createdAt": "2026-01-01T10:30:00.000Z",
  "updatedAt": "2026-01-01T10:30:00.000Z"
}
```

### Authentication response

```ts
interface AuthResponse {
  accessToken: string;
  expiresIn: number; // Seconds, currently 900
  user: User;
}
```

The refresh token is never included in JSON. It is set by the API as an `HttpOnly` cookie and therefore cannot be read through frontend JavaScript.

## Authentication flow

1. Call register or login with `credentials: 'include'`.
2. Keep the returned access token in application memory.
3. Send the token as `Authorization: Bearer ACCESS_TOKEN` on protected endpoints.
4. When the API returns `401`, call the refresh endpoint once with `credentials: 'include'`.
5. Replace the in-memory access token with the new token and retry the original request once.
6. If refresh returns `401`, clear client authentication state and show the login screen.

Use a single in-flight refresh promise when multiple requests fail together. This prevents multiple browser requests from trying to rotate the same refresh token concurrently.

Production cookies use these properties:

- `HttpOnly`
- `Secure`
- `SameSite=None`
- `Path=/api/v1/auth`
- 30-day maximum age by default

Local-development cookies use `SameSite=Lax` and do not require HTTPS. All browser calls that create, refresh, or remove a session must use `credentials: 'include'`.

Example request helper:

```ts
async function apiRequest(path: string, init: RequestInit = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}
```

## Error format

All JSON errors use this structure:

```ts
interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Array<{
      path: string;
      message: string;
    }>;
  };
}
```

Validation example:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "path": "password",
        "message": "Too small: expected string to have >=8 characters"
      }
    ]
  }
}
```

Common codes:

| HTTP status | Code                    | Meaning                                                           |
| ----------- | ----------------------- | ----------------------------------------------------------------- |
| `400`       | `VALIDATION_ERROR`      | Body or path parameters are invalid.                              |
| `401`       | `UNAUTHORIZED`          | Credentials, access token, or refresh session are invalid.        |
| `403`       | `FORBIDDEN`             | The user lacks permission or the browser origin is not trusted.   |
| `404`       | `NOT_FOUND`             | The requested user does not exist.                                |
| `409`       | `CONFLICT`              | Email already exists or the requested role transition is invalid. |
| `429`       | `TOO_MANY_REQUESTS`     | Endpoint rate limit exceeded.                                     |
| `500`       | `INTERNAL_SERVER_ERROR` | Unexpected server failure.                                        |

## Endpoint summary

| Method  | Endpoint                           | Authentication           | Success        |
| ------- | ---------------------------------- | ------------------------ | -------------- |
| `GET`   | `/health`                          | None                     | `200`          |
| `GET`   | `/ready`                           | None                     | `200` or `503` |
| `POST`  | `/api/v1/auth/register`            | Public                   | `201`          |
| `POST`  | `/api/v1/auth/login`               | Public                   | `200`          |
| `POST`  | `/api/v1/auth/refresh`             | Refresh cookie           | `200`          |
| `POST`  | `/api/v1/auth/logout`              | Refresh cookie optional  | `204`          |
| `GET`   | `/api/v1/users/me`                 | Access token             | `200`          |
| `PATCH` | `/api/v1/admin/users/:userId/role` | Super admin access token | `200`          |

## Health endpoints

### Process health

```http
GET /health
```

This endpoint confirms that the API process is running. It does not query PostgreSQL.

Response `200`:

```json
{ "status": "ok" }
```

### Database readiness

```http
GET /ready
```

This endpoint confirms that the API can execute a PostgreSQL query.

Response `200`:

```json
{ "status": "ok" }
```

Response `503`:

```json
{ "status": "unavailable" }
```

## Authentication endpoints

### Create account

```http
POST /api/v1/auth/register
```

Creates an account with the `tenant_user` role, starts a refresh session, sets the refresh cookie, and returns an access token.

Rate limit: 5 requests per minute per API instance and client IP.

Request:

```ts
interface CreateAccountRequest {
  email: string; // Valid email, maximum 320 characters
  password: string; // 8-128 characters
}
```

The email is trimmed and converted to lowercase.

```json
{
  "email": "person@example.com",
  "password": "correct-horse-battery-staple"
}
```

Response `201`:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900,
  "user": {
    "id": "7ccafba9-27de-43bf-a5d2-1b1333338c57",
    "email": "person@example.com",
    "role": "tenant_user",
    "createdAt": "2026-01-01T10:30:00.000Z",
    "updatedAt": "2026-01-01T10:30:00.000Z"
  }
}
```

Expected errors:

- `400 VALIDATION_ERROR`: invalid email or password length.
- `409 CONFLICT`: an account already uses the email.
- `429 TOO_MANY_REQUESTS`: registration limit exceeded.

Frontend example:

```ts
const response = await apiRequest('/api/v1/auth/register', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});
```

### Login

```http
POST /api/v1/auth/login
```

Verifies the email and password, creates a new refresh session, sets the refresh cookie, and returns an access token. The response intentionally does not reveal whether the email or password was incorrect.

Rate limit: 10 requests per minute per API instance and client IP.

Request:

```json
{
  "email": "person@example.com",
  "password": "correct-horse-battery-staple"
}
```

Response `200`: `AuthResponse`, identical in shape to the registration response.

Expected errors:

- `400 VALIDATION_ERROR`: invalid request data.
- `401 UNAUTHORIZED`: `Invalid email or password`.
- `429 TOO_MANY_REQUESTS`: login limit exceeded.

Frontend example:

```ts
const response = await apiRequest('/api/v1/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});
```

### Refresh access token

```http
POST /api/v1/auth/refresh
```

Reads the refresh cookie, revokes that refresh session, creates a replacement session, sets the new cookie, and returns a new access token. No request body or bearer token is required.

Rate limit: 30 requests per minute per API instance and client IP.

Response `200`: `AuthResponse`.

Expected errors:

- `401 UNAUTHORIZED`: cookie missing, session invalid, session expired, or rotated token reused.
- `403 FORBIDDEN`: browser origin is not listed in API `CORS_ORIGINS`.
- `429 TOO_MANY_REQUESTS`: refresh limit exceeded.

Frontend example:

```ts
const response = await apiRequest('/api/v1/auth/refresh', {
  method: 'POST',
});
```

If a previously rotated refresh token is reused, the API treats it as possible token theft and revokes all active refresh sessions belonging to that user.

### Logout

```http
POST /api/v1/auth/logout
```

Revokes the current refresh session when present and clears the refresh cookie. No request body or bearer token is required. Calling logout without a cookie is safe and still succeeds.

Rate limit: 30 requests per minute per API instance and client IP.

Response `204`: no response body.

Frontend example:

```ts
await apiRequest('/api/v1/auth/logout', { method: 'POST' });
```

The frontend must also remove its in-memory access token after logout.

## User endpoints

### Get current user

```http
GET /api/v1/users/me
Authorization: Bearer ACCESS_TOKEN
```

Returns the latest user data from PostgreSQL. This means role changes are reflected even when the access token contains an older role claim.

Response `200`:

```json
{
  "user": {
    "id": "7ccafba9-27de-43bf-a5d2-1b1333338c57",
    "email": "person@example.com",
    "role": "tenant_user",
    "createdAt": "2026-01-01T10:30:00.000Z",
    "updatedAt": "2026-01-01T10:30:00.000Z"
  }
}
```

Expected errors:

- `401 UNAUTHORIZED`: access token missing, invalid, expired, or user deleted.

Frontend example:

```ts
const response = await apiRequest('/api/v1/users/me', {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

## Super-admin endpoints

### Promote user

```http
PATCH /api/v1/admin/users/:userId/role
Authorization: Bearer ACCESS_TOKEN
```

Promotes a `tenant_user` to either `tenant_admin` or `super_admin`. The API loads the acting user from PostgreSQL and requires their current role to be `super_admin`; it does not rely only on the role embedded in the access token.

Path parameter:

| Name     | Type | Description                           |
| -------- | ---- | ------------------------------------- |
| `userId` | UUID | ID of the tenant user being promoted. |

Request:

```ts
interface PromoteUserRequest {
  role: 'tenant_admin' | 'super_admin';
}
```

```json
{ "role": "tenant_admin" }
```

Response `200`:

```json
{
  "user": {
    "id": "7ccafba9-27de-43bf-a5d2-1b1333338c57",
    "email": "person@example.com",
    "role": "tenant_admin",
    "createdAt": "2026-01-01T10:30:00.000Z",
    "updatedAt": "2026-01-02T08:15:00.000Z"
  }
}
```

Rules:

- Only a current `super_admin` can perform the operation.
- Only a current `tenant_user` can be promoted.
- A super admin cannot change their own role through this endpoint.
- This endpoint does not support demotion.

Expected errors:

- `400 VALIDATION_ERROR`: invalid UUID or requested role.
- `401 UNAUTHORIZED`: access token missing, invalid, expired, or actor deleted.
- `403 FORBIDDEN`: actor is not a current super admin.
- `404 NOT_FOUND`: target user does not exist.
- `409 CONFLICT`: target is not a tenant user or actor targets themselves.

Frontend example:

```ts
const response = await apiRequest(`/api/v1/admin/users/${userId}/role`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({ role: 'tenant_admin' }),
});
```

## Frontend implementation notes

- Never store the refresh token manually. The browser manages it as an `HttpOnly` cookie.
- Prefer keeping the access token in memory rather than persistent browser storage.
- Always use `credentials: 'include'` for authentication requests.
- Do not decode a JWT and treat its role as authoritative. Use `/users/me` and API authorization responses.
- Handle `401` with one refresh attempt only; do not create an infinite refresh loop.
- Handle `429` by disabling repeated submissions and asking the user to retry later.
- Production and preview frontend origins must be present in the API `CORS_ORIGINS` configuration.

The source-of-truth runtime schemas and inferred TypeScript types live in `packages/contracts/src/index.ts` and can be imported from `@qrgenerator/contracts` inside this monorepo.
