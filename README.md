# Full HD Marketplace

Full HD Marketplace is a multi-vendor e-commerce platform
connecting small businesses, customers, and independent
delivery partners across India.

## Technology

- Backend: Node.js + Express.js
- Website: Next.js + React + TypeScript
- Mobile: React Native + Expo
- Database: MySQL + Prisma
- Initial Hosting: Hostinger Business

## Documentation

Read [ARCHITECTURE.md](docs/ARCHITECTURE.md) before
implementing or modifying the application.

## Project Status

Phase 1: Foundation and architecture.

The Express API and Prisma database foundation are in place. The initial
identity migration has been applied to the local development database. See
the local database foundation section in the architecture document.

## Roles and authorization

The platform defines CUSTOMER, SELLER, RIDER, ADMIN and SUPER_ADMIN. An
account can hold multiple roles. A seller or rider role alone does not approve
a business or verify a rider; those workflows are future work. From `backend`,
run `npx prisma db seed` to create or update the five definitions without
changing assignments or creating users.

Internal services retrieve, assign and revoke roles; assignments are
idempotent, and revoking the final active SUPER_ADMIN is blocked. No role
management routes are exposed. `GET /api/v1/roles` publicly returns only role
codes, names and descriptions, which contain no account information. The
existing `/api/v1/health` and `/api/v1/health/database` routes remain available.

Authentication middleware resolves a bearer access token and loads the current
active user and roles from MySQL on each request. Authorization returns 401
without that context and 403 when none of the permitted roles match. Client
input is never used as identity or role data.

## Authentication

See [authentication API](docs/AUTHENTICATION.md) for endpoints and client
transport. Public registration creates CUSTOMER accounts only. Passwords use
Argon2id. Opaque access and refresh tokens are stored only as SHA-256 hashes;
refresh tokens rotate and reuse revokes the session. Logout and password reset
revoke sessions. Email verification and password recovery use a MySQL outbox
and a scheduled SMTP worker. Mailtrap sandbox SMTP has accepted
test messages; production mailbox delivery has not been tested. No administrator
is created.

For development, configure the Mailtrap Email Sandbox settings in the ignored
`backend/.env`. The diagnostic and isolated email workflow commands, manual
token confirmation procedure, and production limitations are documented in
[authentication documentation](docs/AUTHENTICATION.md). Do not paste secrets
into the terminal or use real customer accounts for sandbox testing.

Run `npx prisma migrate deploy`, `npx prisma generate`, `npx prisma db seed`
and `npm test` from `backend`. Configure `TEST_DATABASE_URL` for the local
`kilicart_test` database and run `npm run test:integration` for the guarded
MySQL suite. Existing health and role catalogue checks read the development
database. Do not run a database reset. This implementation has not passed a
production security review.

## Local database setup

Configure `DATABASE_URL` and `SHADOW_DATABASE_URL` in `backend/.env` using
`backend/.env.example` as a template. Use `kilicart_dev` for development and
a separate, disposable `kilicart_shadow` for Prisma migrations. A MySQL
administrator must create and grant access to the shadow database; Prisma
may reset it when using development migration commands. Inspect existing tables
and run `npx prisma migrate status` before applying reviewed migrations. From
`backend`, run `npx prisma validate`, `npx prisma generate`, and `npm test`.
The Prisma 7 CLI configuration is in `backend/prisma.config.ts`; seeding is
explicit. Prisma generates the JavaScript client during `npm install` and with
`npx prisma generate`. A build must include Prisma's CLI dev dependency and
`DATABASE_URL` when generating, then retain `backend/generated/prisma` in the
runtime artifact. The MySQL adapter uses a shared pool. The endpoint
`/api/v1/health/database` checks connectivity. phpMyAdmin is an
optional MySQL management interface. See the architecture document for
production guidance and the dependency audit.

## Run the account pages locally

Start the API from `backend` with `npm install` and `npm run dev`; it listens on
`http://localhost:5000`. In a second terminal, run `npm install` and `npm run dev`
from `website`; the site listens on `http://localhost:3000`. Optionally copy
`website/.env.example` to `website/.env.local` and set `NEXT_PUBLIC_API_BASE_URL`
to the API base URL. The default in development is `http://localhost:5000/api/v1`.
For a production build the environment variable must be set at build time.

The account pages are `/verify-email`, `/forgot-password`, and `/reset-password`.
Email links work locally only while the frontend is running. Run frontend tests
with `npm test` and its production build check with `npm run build` in `website`.
The test-only `.env.local` may point at port 5001; use the intended API URL for
any other environment. Mailtrap Sandbox is for development only. Configure and
verify an approved production email provider and review the outstanding backend
dependency advisory before production.
# Security status

Phase 1 Step 4 is not production-ready. Recovery email timing and delivery races,
worker scheduling, proxy verification, limiter load testing, and the Prisma
Effect advisory remain open. See [authentication and deployment guidance](docs/AUTHENTICATION.md).



## Development and CI

Use Node.js 24 and MySQL. Copy `backend/.env.example` to `backend/.env`
and `website/.env.example` to `website/.env.local`; supply local credentials
privately. Install dependencies with `npm ci` in each application. Prisma's
postinstall generates the ignored client; configure `DATABASE_URL` first.
Provision separate development, disposable shadow, and test databases as
described above and in the authentication guide. Never commit local settings.

Start the backend and website in separate terminals with `npm run dev` in
each directory. Run `npm run auth-email:work` in `backend` to process one
bounded email batch; SMTP and the outbox key must be configured. See the
authentication guide for scheduling, key management and sandbox limitations.

Review migration files and inspect the target database and migration status
before applying them. Use `npx prisma migrate dev` only for local development
with a separate disposable shadow database. Apply reviewed committed migrations
with `npx prisma migrate deploy`; back up and verify the procedure before any
production migration. Run `npx prisma generate` and `npx prisma db seed` in
`backend` as needed. Never reset a database containing useful data.

From `backend`, run `npm test`, `npx prisma validate`, and, with a dedicated
local `kilicart_test` account and database, `npm run test:integration`. The
ordinary backend suite also reads `kilicart_dev` and its seeded roles. From
`website`, run `npm test` and `npm run build`. Run `npm audit` and
`npm audit --omit=dev` in both directories.

GitHub Actions uses Node 24 and an ephemeral MySQL service with disposable
credentials scoped to its two CI databases. The integration guard requires a
loopback address and `kilicart_test`; the workflow does not use external
databases. CI needs GitHub Actions enabled and network access to npm and the
MySQL image; it needs no repository secrets for its disposable test values.
The audit jobs fail on reported vulnerabilities, including the unresolved
Prisma/Effect advisory. Review workflow runs on GitHub before relying on them.

Keep GitHub hosting private. Work on a branch, review the diff and ignored
files, run checks, and submit a pull request to `main`; never commit environment
files or credentials. Do not rewrite shared history. Configure branch
protection and required checks when the private repository is created.

Production remains blocked on the unresolved Prisma/Effect advisory and an
independent security review, plus recovery timing and delivery races, verified
worker scheduling and production mailbox delivery, proxy/HTTPS verification,
rate-limit load testing, and database health endpoint restrictions. See
[authentication guidance](docs/AUTHENTICATION.md) for details.
