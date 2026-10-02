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

| Value          | Meaning                                                    |
| -------------- | ---------------------------------------------------------- |
| `super_admin`  | Creates tenants, sees all batches, and manages user roles. |
| `tenant_admin` | Creates medicine batches and issues codes for its tenant.  |
| `tenant_user`  | Read-only access to its own tenant's batch catalogue.      |

Clients cannot choose a role during registration. A valid `tenantId` is required and the API always persists `tenant_user`.

## Shared models

### User

```ts
interface User {
  id: string; // UUID
  email: string;
  role: UserRole;
  tenantId: string | null;
  tenantName: string | null;
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
  "tenantId": "9d2953d8-f03a-4aba-93f8-bf87338b0257",
  "tenantName": "Example Pharma",
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

| Method  | Endpoint                           | Authentication            | Success        |
| ------- | ---------------------------------- | ------------------------- | -------------- |
| `GET`   | `/health`                          | None                      | `200`          |
| `GET`   | `/ready`                           | None                      | `200` or `503` |
| `POST`  | `/api/v1/auth/register`            | Public                    | `201`          |
| `POST`  | `/api/v1/auth/login`               | Public                    | `200`          |
| `POST`  | `/api/v1/auth/refresh`             | Refresh cookie            | `200`          |
| `POST`  | `/api/v1/auth/logout`              | Refresh cookie optional   | `204`          |
| `GET`   | `/api/v1/users/me`                 | Access token              | `200`          |
| `GET`   | `/api/v1/tenants`                  | Public                    | `200`          |
| `POST`  | `/api/v1/admin/tenants`            | Super admin access token  | `201`          |
| `GET`   | `/api/v1/admin/users`              | Super admin access token  | `200`          |
| `PATCH` | `/api/v1/admin/users/:userId/role` | Super admin access token  | `200`          |
| `GET`   | `/api/v1/batches`                  | Access token              | `200`          |
| `GET`   | `/api/v1/batches/:batchNumber`     | Access token              | `200`          |
| `POST`  | `/api/v1/batches`                  | Tenant admin access token | `201`          |

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
  tenantId: string; // UUID selected from GET /api/v1/tenants
}
```

The email is trimmed and converted to lowercase.

```json
{
  "email": "person@example.com",
  "password": "correct-horse-battery-staple",
  "tenantId": "9d2953d8-f03a-4aba-93f8-bf87338b0257"
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
    "tenantId": "9d2953d8-f03a-4aba-93f8-bf87338b0257",
    "tenantName": "Example Pharma",
    "createdAt": "2026-01-01T10:30:00.000Z",
    "updatedAt": "2026-01-01T10:30:00.000Z"
  }
}
```

Expected errors:

- `400 VALIDATION_ERROR`: invalid email, password length, or tenant UUID.
- `404 NOT_FOUND`: selected tenant does not exist.
- `409 CONFLICT`: an account already uses the email.
- `429 TOO_MANY_REQUESTS`: registration limit exceeded.

Frontend example:

```ts
const response = await apiRequest('/api/v1/auth/register', {
  method: 'POST',
  body: JSON.stringify({ email, password, tenantId }),
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
    "tenantId": "9d2953d8-f03a-4aba-93f8-bf87338b0257",
    "tenantName": "Example Pharma",
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

Changes a user's role to `tenant_user`, `tenant_admin`, or `super_admin`. The API loads the acting user from PostgreSQL and requires their current role to be `super_admin`; it does not rely only on the role embedded in the access token.

Path parameter:

| Name     | Type | Description                           |
| -------- | ---- | ------------------------------------- |
| `userId` | UUID | ID of the tenant user being promoted. |

Request:

```ts
interface PromoteUserRequest {
  role: 'tenant_user' | 'tenant_admin' | 'super_admin';
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
- A super admin cannot change their own role through this endpoint.
- Assigning `super_admin` removes the user's tenant association.
- A tenant role requires the user to have an existing tenant association.

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

## Tenant and medicine-batch endpoints

`GET /api/v1/tenants` is public because registration uses it to populate the tenant dropdown. Only a super admin can create a tenant with `POST /api/v1/admin/tenants` and `{ "name": "Example Pharma" }`.

All newly registered accounts belong to the selected tenant and start as `tenant_user`. Tenant isolation is enforced by repository queries: a tenant user or tenant admin never receives another tenant's batches. A super admin may list all batches.

Only a `tenant_admin` can create a batch:

```http
POST /api/v1/batches
Authorization: Bearer ACCESS_TOKEN
```

```json
{
  "medicineName": "Paracetamol",
  "medicineType": "Tablet",
  "manufactureDate": "2026-10-01",
  "expiryDate": "2028-09-30",
  "cautions": ["Keep away from children"],
  "variants": ["500 mg", "650 mg"],
  "usages": ["Temporary relief of fever"],
  "dosages": ["Use only as directed by a qualified professional"],
  "eligibleUsers": ["Adults when medically appropriate"],
  "sideEffects": ["Nausea", "Allergic reaction"]
}
```

The server generates `batchNumber`; clients cannot supply it. It is the PostgreSQL primary key. A random candidate is retried on conflict, and the primary-key constraint makes duplicate committed batch numbers impossible. `slug` is derived from medicine name and type for display only and is never used as record identity.

## Identifier endpoints

All management endpoints require `Authorization: Bearer ACCESS_TOKEN`. Codes and jobs are scoped through their batch's tenant. Tenant users cannot generate or download artwork; tenant admins operate only within their tenant; super admins can inspect all tenant data. Send JSON request bodies with `Content-Type: application/json`.

### Preview artwork

```http
POST /api/v1/code-jobs/preview
```

The request identifies an existing batch and contains its print options. The server verifies that the tenant admin owns the batch. A preview is an unissued sizing proof: its random URL is not stored and must never be printed on a product.

```json
{
  "batchNumber": "BAT-20261002-AB12CD34EF56AB12CD34",
  "print": {
    "format": "qr",
    "errorCorrection": "M",
    "moduleSizeMm": 0.25,
    "printerDpi": 600,
    "printMode": "standard"
  }
}
```

`format` may be `qr` or `data_matrix`. QR accepts error correction `L`, `M`, `Q`, or `H`; level `L` requires `printMode: "experimental"`. The response contains `issued: false`, an SVG string, the temporary scan URL, and the complete print report.

### Issue codes for a batch

```http
POST /api/v1/code-jobs
Idempotency-Key: RANDOM_UUID
```

```json
{
  "quantity": 10,
  "batchNumber": "BAT-20261002-AB12CD34EF56AB12CD34",
  "print": {
    "format": "qr",
    "errorCorrection": "M",
    "moduleSizeMm": 0.25,
    "printerDpi": 600,
    "printMode": "standard"
  }
}
```

Quantity must be between 1 and 50. Repeating the same idempotency key and body returns the original job with `replayed: true`; changing the body for a used key returns `409 IDEMPOTENCY_CONFLICT`. A new job returns `201`, while a replay returns `200`.

Each response unit contains its UUID, position, unique token, public `scanUrl`, status, print report, and relative SVG/PDF download paths.

### Read jobs and units

```http
GET /api/v1/code-jobs/:id
GET /api/v1/codes/:id
```

These return records inside the authenticated administrator's tenant. A missing or cross-tenant identifier returns `404`; super admins may access all tenants.

### Download issued artwork

```http
GET /api/v1/codes/:id/artwork.svg
GET /api/v1/codes/:id/artwork.pdf
```

Downloads require the bearer token and return attachment data, not JSON. The server regenerates artwork from the retained matrix and verifies the SVG hash before returning it. Revoked artwork returns `409 CODE_REVOKED`.

### Revoke an identifier

```http
POST /api/v1/codes/:id/revoke
```

```json
{ "reason": "Packaging damaged" }
```

The reason must contain 1–300 characters. Revocation is permanent and changes the public lookup result immediately.

### Public scan lookup

```http
GET /api/v1/public/codes/:token
```

This endpoint does not require authentication. It returns whether a registered token is `active` or `revoked` together with the associated medicine batch, including dates, cautions, variants, usages, dosage guidance, eligible users, side effects, and tenant name. A successful lookup does not by itself prove authenticity because a printed code can be copied. Unknown and malformed identifiers return `404` and `400`, respectively.
