# External REST API — Stage 1 Design

**Date:** 2026-04-26  
**Status:** Implemented

## Problem

Temple Raids guild members (primarily raid managers) need to interact with raid and attendance data programmatically — the primary use case being conversation with Claude Code, which calls the API via curl/HTTP. The existing tRPC layer is browser-only; the existing `/api/discord/*` endpoints are shared-token only (no per-user identity).

## Solution

A versioned REST API at `/api/v1/` in the existing Next.js app. Personal API tokens (one per user, generated from the profile page) provide per-user identity and permission scoping. An OpenAPI 3.0 spec is auto-generated from Zod schemas and served at `/api/v1/openapi.json`.

## Auth

- `apiToken: text` column added to `auth_user` table (unique index, nullable)
- Token format: `tera_<32-char random hex>` — stored as `SHA-256(token)` in DB; plaintext shown once at generation
- Only raid managers and admins can generate/revoke tokens (enforced at tRPC layer)
- Every `/api/v1/*` request must include `Authorization: Bearer <plaintext-token>`
- `validateApiToken(request)` in `src/server/api/v1-auth.ts` hashes the incoming token, queries DB, returns user or 401

## Endpoints — Stage 1

| Method | Path                                | Auth   | Description                           |
| ------ | ----------------------------------- | ------ | ------------------------------------- |
| GET    | `/api/v1/openapi.json`              | None   | OpenAPI 3.0 spec                      |
| GET    | `/api/v1/me`                        | Bearer | Authenticated user + linked character |
| GET    | `/api/v1/characters?q&type`         | Bearer | Search characters (limit 200)         |
| GET    | `/api/v1/characters/:id`            | Bearer | Character detail + family             |
| GET    | `/api/v1/characters/:id/attendance` | Bearer | 6-week attendance                     |

## Key Decisions

- **Token hashing**: Plaintext tokens never stored in DB — SHA-256 hash only. Prevents credential exposure if DB is compromised.
- **Attendance percentage**: Sourced from the `primary_raid_attendance_l6lockoutwk` materialized view (same source as the rest of the app) to prevent divergence.
- **No MCP**: Users interact via Claude Code + curl. The OpenAPI spec provides Claude the context it needs to call the API correctly.
- **Compression skipped**: `/api/v1/` uses standard `NextResponse.json()` instead of `compressResponse()`. CDN/nginx handles compression at the network layer.

## Staging Plan

| Stage    | Scope                                                 | Auth level      |
| -------- | ----------------------------------------------------- | --------------- |
| 1 (done) | Read-only character search & attendance               | Any valid token |
| 2        | Character family management (set primary/secondaries) | isRaidManager   |
| 3        | Raid plan CRUD                                        | isRaidManager   |

## Files

| File                                                 | Role                                           |
| ---------------------------------------------------- | ---------------------------------------------- |
| `src/server/db/models/auth-schema.ts`                | `apiToken` column + unique index               |
| `src/server/api/routers/profile.ts`                  | `generateApiToken`, `revokeApiToken` mutations |
| `src/server/api/v1-auth.ts`                          | `validateApiToken()` helper                    |
| `src/components/profile/api-access-card.tsx`         | Token management UI                            |
| `src/lib/openapi-registry.ts`                        | OpenAPI registry + `buildOpenApiSpec()`        |
| `src/app/api/v1/openapi.json/route.ts`               | Spec endpoint                                  |
| `src/app/api/v1/me/route.ts`                         | User identity endpoint                         |
| `src/app/api/v1/characters/route.ts`                 | Character list/search                          |
| `src/app/api/v1/characters/[id]/route.ts`            | Character detail                               |
| `src/app/api/v1/characters/[id]/attendance/route.ts` | Attendance                                     |
