# Authentication API and deployment

### Security review update — 20 November 2026

Step 4 is not production-ready. Authentication limits now use shared MySQL
counters as described below; deployment load testing and tuning remain needed.
Recovery delivery now uses a durable MySQL outbox. Account eligibility still
affects database work and timing; queue acceptance is not constant-time.

`TRUSTED_PROXY_CIDRS` accepts only explicit IP addresses or nonzero CIDRs,
comma-separated; empty means forwarding headers are untrusted. Verify the
actual Hostinger proxy topology and restrict direct access before configuring
it. A broad CIDR can still trust an attacker: validation cannot establish
ownership. Without verified trust, IP limits may group all users behind a proxy.
Production `CORS_ORIGIN` must contain explicit HTTPS origins. HTTPS enforcement
at the hosting edge and prevention of direct HTTP access remain deployment
requirements; this application does not enforce HTTPS itself.

The installed Prisma 7.10.1 CLI pulls Effect 3.20.0 through `@prisma/config`.
A clean production-only install with scripts disabled also contains this chain
because Prisma is an optional peer of `@prisma/client`; both audit modes report
three high entries for GHSA-7589-6fvf-x4pw. The project and inspected generated
runtime do not directly import Effect or Prisma config; the CLI configuration
does load Prisma config, whose distribution imports Effect. Its distribution
has no literal `TemplateLiteral` reference. These static checks do not prove
unreachability in all dependencies or tooling. Restrict CLI, build, migration
and configuration inputs to trusted sources; this is a mitigation, not a fix.

On 20 November 2026 the latest Prisma 7 release was 7.10.1 and its config
package pinned Effect 3.20.0 exactly. An isolated override to Effect 3.22.1
passed current generation, migration-status, startup, health, 19 unit and 24
guarded integration tests, and audits found no vulnerabilities in that copy.
It nevertheless violates the upstream exact pin and has not established Prisma
support or exhaustive compatibility; it was not applied. The original advisory
remains unresolved. Monitor Prisma for a compatible 7.x release that selects a
patched Effect version, upgrade Prisma packages together, and rerun generation,
migrations, tests and both audits. Do not use a forced downgrade.

For an isolated local integration account, an administrator can review and run
the following after replacing the password. It grants broad migration privileges
only on the test database, so the account must never be used for development
or production. Confirm the actual MySQL host matching rules and effective grants;
existing global or role grants could defeat isolation. No grant was applied here.

```sql
CREATE USER 'kilicart_test_runner'@'localhost' IDENTIFIED BY 'REPLACE_WITH_UNIQUE_SECRET';
GRANT ALL PRIVILEGES ON `kilicart_test`.* TO 'kilicart_test_runner'@'localhost';
SHOW GRANTS FOR 'kilicart_test_runner'@'localhost';
```

Set `TEST_DATABASE_URL` privately to this account and verify it cannot read
`kilicart_dev` or `kilicart_shadow`. The existing URL guard checks host and
database name, not the account's effective permissions. Measure rate-limit
write contention and storage growth under distributed load. Verify the worker
scheduler and monitor delayed jobs and token expiry.

This foundation is not production-ready. Delivery to a production mailbox and
an independent production security review remain outstanding.

### Authentication email outbox

Registration currently creates an unverified account but does not itself send
verification email; users request verification separately. Reset and verification
requests queue a token and job in the same transaction. The API returns the same
generic response for eligible and nonexistent accounts without contacting SMTP.
No recipient or job is created for a nonexistent account. A configuration or
database failure returns an error rather than promising delivery. There is a
residual enumeration risk if a database write fails only for eligible accounts.

Run `npm run auth-email:work` in `backend` to process a batch and exit. Configure
SMTP and `AUTH_EMAIL_OUTBOX_KEY` as 32 random bytes in hexadecimal in the ignored
environment file. All API and worker instances must share this separately managed
key; do not reuse the rate-limit key. A unique local development key was added to
the ignored `.env`. Losing or changing the key makes pending jobs undecryptable;
drain the queue before rotation and retain old keys securely until no longer
needed. The current implementation supports only one active key.

The queue stores an AES-256-GCM encrypted token, token hash reference, purpose,
state, scheduling, attempts, lease and sanitized result; the recipient is read
from the existing user record rather than copied into the queue. Payload is
erased on terminal outcome. Completed metadata is retained seven days by default
and up to 100 old records are deleted per worker run. Pending payloads remain
until a worker processes them, even if their token expires; scheduler outages
can therefore extend retention indefinitely. Deleting a user cascades through
tokens to its outbox rows. Backups may retain encrypted payloads for longer.

`AUTH_EMAIL_WORKER_SECONDS` defaults to 60, `AUTH_EMAIL_LEASE_SECONDS` to 180
(must exceed runtime), `AUTH_EMAIL_BATCH_SIZE` to 10, `AUTH_EMAIL_MAX_ATTEMPTS`
to 5, and `AUTH_EMAIL_RETENTION_DAYS` to 7. A hard process deadline bounds each
command; database/SMTP timeouts and clean termination must be tested in hosting.
Claims are atomic and leases expire after crashes; keep API and worker clocks
synchronized because expiry and lease comparisons use application time. Temporary SMTP 4xx or network
failures get bounded exponential backoff with jitter; 5xx including 550 and
unknown errors are terminal. Retry exhaustion invalidates the token. Workers
check token expiry, use and account state immediately before sending, and never
extend token life. The worker assigns a stable Message-ID, but SMTP acceptance
is not idempotent: a crash or timeout after acceptance may produce a duplicate.
Token invalidation or suspension can race the final check and SMTP transmission,
so a stale link can still be sent in that narrow interval; it will be rejected
when used. This race remains a security and product review item.

Queue acceptance applies a randomized 100–120 ms minimum, but is not
constant-time: in one local test of ten service calls per case, known accounts
averaged 118.51 ms and unknown accounts 119.63 ms. These are not representative
network or production measurements, and slow database writes can exceed the
minimum and reveal differences. Distributed timing
analysis, database write failure behavior, edge controls and independent review
remain necessary before production.

Hostinger's [Node.js cron documentation](https://www.hostinger.com/support/how-to-run-cron-jobs-for-node-js-websites-at-hostinger/)
describes scheduled Node scripts, UTC schedules, a 30-minute limit and explicit
environment loading. Confirm those capabilities, schedule frequency, secret
file protection, logs, CPU and MySQL access on the actual Business account;
no scheduler has been configured or verified here. If unavailable, use a managed
scheduled job with private network/database access and the same key. Alert on
failed runs, backlog age, terminal failures and tokens expiring in the queue.
Never expose a public worker-trigger endpoint.

### Shared authentication throttling

The `auth_rate_limits` table stores HMAC-SHA256 keys, counts and expiry times,
never plaintext email or IP addresses. Production must set the same unique,
random 32-byte secret as 64 hexadecimal characters in
`AUTH_RATE_LIMIT_SECRET` on every instance; startup rejects a missing or
malformed production secret. Generate it securely and store it outside Git.
The fallback key is for local development only. Changing the key resets all
effective budgets; rotate deliberately and monitor abuse. All instances must
also use the same database. IPv6 addresses are grouped by /56.

Each budget is a fixed 15-minute window starting at its first request; denied
requests do not extend it. Login permits 20 requests per IP and 10 per
normalized account; registration permits 10 per IP and 5 per account.
Verification and password-reset requests each have independent budgets of 5
per IP and 5 per account. Refresh permits 30 per IP, and both confirmation
endpoints share 10 per IP. Budgets count attempts, including invalid and
successful requests. A valid normalized email is counted whether or not the
account exists; invalid emails still consume the IP budget. Requests at a
window boundary can consume two windows in quick succession. These limits
reduce abuse but a distributed attacker can temporarily exhaust a victim's
account budget; expiry prevents permanent lockout. Consider an edge limit and
additional abuse controls after deployment measurements.

Atomic MySQL upserts and row locks enforce limits across processes. Each
request uses one transaction with two statements per applicable identifier,
plus an indexed cleanup deleting at most 10 expired counters. Cleanup failures
are logged as fixed events and do not disable enforcement; if traffic stops,
expired rows remain until subsequent requests. Storage failure returns a
generic 503 and fails closed; quota exhaustion returns 429 and `Retry-After`.
Monitor failures, table size, query latency, database capacity and connection
pool contention. Cleanup has no hard storage cap during an intense attack or
prolonged failures; use hosting-supported scheduled, bounded cleanup and edge
protection if needed. Review thresholds, NAT impact, proxy configuration and
database load before production. The non-auth API's existing per-process
limit is separate and is not a distributed control.

All routes use `/api/v1/auth`. JSON registration accepts `fullName`, `email`,
and `password` (12–256 UTF-8 bytes, at least 12 characters). Role fields are
rejected. Registration responds 202 for both new and existing addresses.
`POST /login` accepts email and password and returns 401 for invalid credentials
or inactive accounts. Unverified email is currently allowed to log in.

For a browser, send an allowed `Origin` and `X-KiliCart-Request: 1` on login
and refresh. Refresh is stored in an HttpOnly, SameSite=Strict cookie, Secure
in production; access tokens are returned in JSON and should be held in memory.
Send the access token as `Authorization: Bearer <token>` to `GET /me` and
`POST /logout`. Never store credentials in browser localStorage. For mobile,
send `transport: "mobile"` to login and refresh and include `refreshToken` in
the refresh JSON body. Store tokens in platform secure storage, never in source
code. Refresh rotates the token; reusing an old token revokes that session.
Concurrent refreshes using the same token trigger reuse detection.

`POST /verify-email/request` and `/password-reset/request` accept email and
return a generic response. `/verify-email/confirm` accepts `token`;
`/password-reset/confirm` accepts `token` and a new `password`. Eligible
requests atomically create a token hash and encrypted outbox job. Verification
expires after 24 hours and reset after one hour. Confirmation consumes the
token and invalidates other outstanding tokens of the same purpose; reset also
revokes sessions. Links put the token in the URL fragment, which the future
website must read and submit in the confirm request body. No token is returned
in API JSON or logged. No messages are sent without full SMTP configuration.

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` (`true` for implicit TLS,
`false` for required STARTTLS), `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, and
`APP_PUBLIC_URL` in the deployment environment. TLS certificates are verified
and SMTP connection, greeting and inactivity timeouts are bounded. Use HTTPS for the public URL;
HTTP is allowed only on loopback outside production. Supply Hostinger's actual
mailbox and SMTP values after provisioning them. Delivery errors are logged
without addresses, links, tokens, or SMTP diagnostics. Permanent failures and
exhausted retries invalidate the token. Mailtrap sandbox SMTP has accepted a
queued verification message; a production provider and mailbox have not been tested.

### Mailtrap development sandbox

In Mailtrap Email Testing, open a sandbox's Integration tab and copy its SMTP
credentials into the ignored `backend/.env`; do not share them in chat or commit
them. Use `SMTP_HOST=sandbox.smtp.mailtrap.io`, the port from the sandbox,
`SMTP_SECURE=false` for STARTTLS (e.g. 2525), and a safe test sender. Set
`SMTP_TEST_RECIPIENT=developer@example.invalid`, `NODE_ENV=development`, and
`APP_PUBLIC_URL=http://localhost:3000`. SMTP authentication is verified with
`npm run smtp:diagnostic`; add `-- --send` to send one harmless test message to
the designated reserved address. `npm run smtp:workflow -- --send` uses only
guarded `kilicart_test`, creates and removes an isolated account, sends one
queued verification message to the sandbox, and checks single-use confirmation.
The commands do not print credentials or tokens. SMTP acceptance alone does not
confirm inbox display: inspect the messages in Mailtrap Email Testing manually.
No message is delivered to a real external mailbox.

The Next.js `/verify-email` and `/reset-password` pages accept links with tokens
in the fragment (current emails) or query string (older links). Both remove the
token from the visible URL and retain it only in memory. Run `npm run dev` in
both `backend` and `website` to use local links; the site must be running on
port 3000. Set `NEXT_PUBLIC_API_BASE_URL` in `website/.env.local` from
`website/.env.example` if the API is not at the local default. The backend
must allow the frontend origin through `CORS_ORIGIN`. `/forgot-password` requests
a reset email. Backend responses intentionally do not distinguish an expired,
invalid or already-used token, so the pages show one safe message for these.

To test manually, run the API with a test-only database configuration, use a local HTTP client to register a temporary user
and request `/api/v1/auth/verify-email/request` or `/api/v1/auth/password-reset/request`,
then run `npm run auth-email:work` from `backend`.
Inspect the message in Mailtrap and privately copy the token after `#token=`
into the HTTP client's JSON body as `token`; send it to the corresponding
`/confirm` endpoint, adding `password` for reset. Keep tokens out of shell
history, shared logs and screenshots. Do not use third-party link previews.
Never use development or production user records as fixtures. For production,
replace sandbox settings with approved Hostinger Email or transactional SMTP
settings, an HTTPS public URL and the actual sender; production startup rejects
missing configuration and the known Mailtrap sandbox endpoint. Provider and
mailbox delivery still require independent verification.

`ACCESS_TOKEN_SECONDS` defaults to 900 (maximum 3600), and `SESSION_SECONDS`
defaults to 2592000 (maximum 7776000). Tokens are random, so no signing secret
is required. `NODE_ENV=production` enables secure cookies. Configure exact
trusted origins in `CORS_ORIGIN` and HTTPS for the site and API. SameSite=Strict
requires a compatible same-site deployment. The custom header and origin check
protect cookie-based login and refresh from cross-origin browser requests; do
not relax CORS to arbitrary origins. Configure Express proxy trust only for the
actual hosting proxy topology before relying on client IP rate limits. Configure
trust proxy only for known Hostinger proxy ranges;
blindly trusting client forwarding headers allows rate-limit bypass. Restrict the database health
endpoint before production. Plan retention/cleanup for expired token and audit
rows, backup and restore, and monitoring without logging secrets. SMTP 550 is
terminal and is not retried. Queue timing and delivery races remain below.

For integration tests set `TEST_DATABASE_URL` in `backend/.env` to a local
`kilicart_test` database with a dedicated account and migration permissions.
`npm run test:integration` verifies the host and database name, deploys the
committed migrations without reset, and runs MySQL-backed tests. It refuses
remote hosts, missing/invalid URLs, and databases with other names. Tests use
unique fixture addresses and delete only their own users and roles. The
SUPER_ADMIN concurrency check requires no existing active super administrator
in the test database. `npm test` runs fixture/unit and API regression checks;
the existing health and catalogue checks read the configured development DB.
On 19 November 2026, 13 unit/fixture and regression tests and seven grouped
MySQL integration tests passed, including concurrent refresh, registration,
reset and SUPER_ADMIN state changes. Re-run them before deployment.

Prisma CLI/client and `@prisma/adapter-mariadb` are 7.10.1. The adapter owns
one shared MySQL connection pool and disconnects on shutdown. `DATABASE_URL`
is read at runtime, and `prisma.config.ts` explicitly loads environment variables
for CLI configuration, migration paths, shadow URL and seed command. Run
`npx prisma db seed` explicitly; it updates platform role definitions.

The Prisma 7-compatible `prisma-client-js` generator is deprecated but retained
to provide JavaScript output without converting the application to TypeScript.
Generate its ignored `backend/generated/prisma` output with `npm install` or
`npx prisma generate` before running or deploying. The build requires the Prisma
CLI dev dependency and `DATABASE_URL`; verify the generated output is retained
in the runtime artifact. Production-only installs that omit the CLI cannot run
the project's postinstall generator without a separate build step.

Pool defaults are five connections and ten-second connect/acquisition timeouts;
driver URL parameters may override these. Confirm hosting connection limits,
TLS/certificate requirements and URL options; pool size is per process. Hostinger
documents Express and Node 24 support, but this application, native Argon2 build,
database TLS and Prisma generation have not been tested on Hostinger.

On 20 November 2026 both backend npm audit modes reported three high-severity
entries for a newly published Effect ReDoS advisory, GHSA-7589-6fvf-x4pw,
through `prisma -> @prisma/config -> effect@3.20.0`. The advisory is fixed in
Effect 3.22.1; Prisma 7.10.1 pins 3.20.0 and was the latest available 7.x at
review. Request-path reachability is unverified. The frontend audits reported
zero vulnerabilities. Track an upstream-compatible fix and reassess before
production; do not apply `npm audit fix --force`.

The local Mailtrap verification and password-reset pages have been manually
exercised against `kilicart_test`. A controlled MySQL fixture verifies reset
token replay rejection, rejection of the old password, acceptance of the new
password, and invalidation of previously issued access and refresh credentials.
Mailtrap remains a development-only sandbox; production requires a real,
approved SMTP service and an actual mailbox delivery test. The current test
frontend may have `.env.local` pointing to the test API on port 5001: set the
correct `NEXT_PUBLIC_API_BASE_URL` before any production build. Email links use
fragments; legacy query tokens can reach server, proxy or browser history logs
before client-side removal, so do not generate query-token links in production.
