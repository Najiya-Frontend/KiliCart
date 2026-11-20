# FULL HD MARKETPLACE
## Production Architecture & Development Specification

Version: 1.0
Status: Initial Architecture
Architecture: Node.js + Next.js + React Native + MySQL

---

# 1. PROJECT OVERVIEW

Full HD Marketplace is a commercial multi-vendor
e-commerce platform connecting small businesses,
customers, and independent delivery partners.

The business initially targets India.

Example seller categories:
- Homemade masala powders
- Pickles and packaged foods
- Hair oils and personal-care products
- Spices
- Handicrafts
- Other eligible locally manufactured products

The platform operator acts as a marketplace intermediary.
Sellers own and fulfill their product listings.

The platform earns revenue primarily through commissions
and may introduce additional service fees.

The operating company may also register as a seller
using the standard seller portal.

The platform must support both:
1. Local deliveries performed by independent riders.
2. Nationwide shipping through courier providers.

---

# 2. TECHNOLOGY STACK

Backend:
- Node.js
- Express.js
- JavaScript initially, with TypeScript recommended
- REST API
- Prisma ORM

Frontend:
- Next.js
- React
- TypeScript
- Responsive design

Mobile:
- React Native
- Expo
- Android and iOS
- Customer and delivery partner experiences

Database:
- MySQL
- Prisma schema and migrations
- Transactional operations for critical workflows

Deployment:
- Hostinger Business Web Hosting initially
- Separate website and API deployments
- External managed services where hosting limitations
  prevent persistent background jobs or WebSockets
- Future migration to VPS/cloud if required

Development:
- Visual Studio Code
- Git and GitHub
- Environment-specific configuration
- Automated testing and CI/CD

---

# 3. APPLICATIONS

## 3.1 Customer Website

Features:
- Customer registration and login
- Browse categories and products
- Search and filtering
- Seller storefronts
- Product details
- Shopping cart
- Addresses
- Checkout
- Online payments
- Order history
- Shipment tracking
- Returns and refunds
- Ratings and reviews
- Account management

## 3.2 Seller Portal

Features:
- Seller registration
- Business verification and approval
- Storefront management
- Product creation and editing
- Product images and variations
- Inventory management
- Order acceptance and preparation
- Pickup readiness
- Shipping management
- Commission and earnings reports
- Payout tracking
- Return management
- Seller staff and business locations

The marketplace operator may have its own seller account.

## 3.3 Delivery Partner Application

Features:
- Rider registration
- Identity and vehicle verification
- Admin approval
- Online/offline availability
- Available delivery job listings
- Job details and estimated earnings
- Accepting eligible jobs
- Navigation to pickup and drop-off
- Pickup verification
- Delivery verification
- Delivery history
- Rider earnings
- Payout status
- Support and dispute reporting

Only verified and approved riders may accept jobs.

## 3.4 Administration Portal

Features:
- Dashboard and business analytics
- Customer management
- Seller approval and suspension
- Rider verification and approval
- Product moderation
- Category management
- Order oversight
- Delivery oversight
- Courier shipment monitoring
- Commission configuration
- Payment and refund monitoring
- Settlement and payout management
- Customer support
- Audit logs
- Marketplace settings

---

# 4. BACKEND ARCHITECTURE

The backend uses a modular Express.js architecture.

Directory responsibilities:

controllers/
- Receive HTTP requests
- Return API responses
- Delegate business logic to services

services/
- Business rules
- Transactions
- Order processing
- Payment processing
- Delivery assignments
- Commission calculations

models/
- Database access abstractions
- Prisma-based data operations

routes/
- API endpoint definitions
- Router configuration

middleware/
- Authentication
- Authorization
- Request validation
- Rate limiting
- Error handling

config/
- Environment configuration
- Database setup
- Provider configuration

integrations/
- Payment providers
- Courier aggregators
- Maps and geocoding
- Email, SMS, push notifications

jobs/
- Scheduled processing
- Retryable operations
- Cleanup tasks
- Reconciliation

validators/
- API request validation schemas

prisma/
- Prisma schema
- Database migration history

tests/
- Unit tests
- Integration tests
- API tests

All client applications communicate with the
backend through versioned REST APIs.

Example API prefix:
 /api/v1/

Business logic must not be duplicated inside
controllers, web pages, or mobile screens.

---

# 5. USER ROLES AND ACCESS CONTROL

Primary roles:

CUSTOMER
SELLER
RIDER
ADMIN
SUPER_ADMIN

A person may have multiple roles.

Seller permissions must be scoped to the seller
business they belong to.

Riders must only access their own assignments.

Customers must only access their own private orders.

Admin actions must be permission-controlled and audited.

Use secure authentication, short-lived access credentials
where appropriate, safe refresh/session handling,
password hashing, and server-side authorization.

Never trust a user role supplied by the frontend.

### Current role foundation

CUSTOMER, SELLER, RIDER, ADMIN and SUPER_ADMIN are centrally defined and
seeded with `npx prisma db seed` from `backend`. Seeding upserts definitions
only. Accounts may hold multiple roles. Internal services check users and role
codes, make assignment idempotent, and serialize SUPER_ADMIN revocations to
protect the final active holder. Any future user deactivation or deletion
workflow must enforce the same invariant and coordinate on the SUPER_ADMIN
role row; direct database changes bypass this service protection. Role changes
are not exposed through an API. Seller business approval and rider verification
are separate future workflows; a role alone does not grant approval.

`GET /api/v1/roles` exposes only public role codes, display names and general
descriptions. The health endpoints remain available. Authentication resolves
opaque access tokens against MySQL, checks active account and session state,
and loads current roles on every request. Authorization middleware returns 401
for missing identity and 403 for insufficient roles. No administrative role
management endpoints are exposed.

### Authentication foundation and remaining work

20 November 2026 review: production CORS now requires exact HTTPS origins;
proxy forwarding is trusted only for explicitly configured IPs/CIDRs. The
hosting proxy topology and HTTPS enforcement still require deployment review.
Shared MySQL authentication throttling is implemented; deployment load testing
and tuning remain necessary. Authentication delivery uses a MySQL outbox and
a bounded scheduled worker; delivery races and scheduling require review. See `docs/AUTHENTICATION.md` for
the test-account grant proposal, dependency exposure and remediation plan.

Public registration creates a CUSTOMER assignment transactionally. Argon2id
stores password credentials. Random opaque access and rotating refresh tokens
are stored as hashes; refresh reuse revokes the session. Sessions have an
absolute expiration, and logout, password reset, and the internal account
suspension service revoke sessions. The suspension service shares the
SUPER_ADMIN role lock and protects the final active holder. Direct database
edits or future deletion flows must enforce the same invariant. No public
bootstrap or default administrator exists.

Email verification and recovery use expiring hashed single-use tokens and an
encrypted outbox processed by an SMTP worker. Dedicated MySQL
integration and concurrency tests have passed, and Mailtrap sandbox SMTP has
accepted development messages. Production mailbox delivery and a security
review remain outstanding. See `docs/AUTHENTICATION.md`
for deployment requirements.

---

# 6. DATABASE ARCHITECTURE

Primary database: MySQL
ORM: Prisma

Proposed logical entities:

Identity:
- users
- roles
- user_roles
- addresses
- verification_records

Sellers:
- sellers
- seller_members
- seller_locations
- seller_documents

Catalogue:
- categories
- products
- product_variants
- product_images
- inventory

Commerce:
- carts
- cart_items
- orders
- seller_orders
- order_items

Fulfillment:
- fulfillments
- shipments
- shipment_events
- delivery_jobs
- delivery_assignments

Riders:
- rider_profiles
- rider_documents
- rider_locations
- rider_earnings

Finance:
- payments
- refunds
- ledger_entries
- commission_records
- seller_payouts
- rider_payouts

Support:
- return_requests
- disputes
- notifications
- audit_logs

These are initial logical entities. Actual schema design
must establish relations, indexes, foreign keys,
constraints and state transitions.

The Prisma schema is the source of truth for
database structure and migrations.

### Local database foundation

The development database is `kilicart_dev` on MySQL. phpMyAdmin
is an optional web administration interface to MySQL, not the database
server itself. Configure `DATABASE_URL` in `backend/.env` using the
placeholder format in `backend/.env.example`; never commit credentials.
Percent-encode special characters in the username and password.
Use a dedicated local account with migration permissions scoped to
`kilicart_dev` and the dedicated `kilicart_shadow` database. Set
`SHADOW_DATABASE_URL` in `backend/.env` to the shadow database URL.
An administrator must create it and grant the account privileges on that
database. Prisma may reset the shadow database during `migrate dev`; never
point it at the development database or a database containing useful data.

Prisma 7.10.1 uses `backend/prisma/schema.prisma`, `backend/prisma.config.ts`
and version-controlled migration files in `backend/prisma/migrations/`.
From `backend`, run `npx prisma validate` and `npx prisma generate`.
Inspect an existing database and migration history before applying changes;
do not reset or overwrite existing data. Verify connectivity with
`GET /api/v1/health/database`. Run `npm test` from `backend` to exercise
the configured local database and health responses without writing data.
Restrict that endpoint or replace it with
a safe readiness check before production.

Dependency audit (20 November 2026): Prisma CLI, client and the MariaDB driver
adapter remain 7.10.1. Both backend audit modes report three high entries for
GHSA-7589-6fvf-x4pw: `prisma -> @prisma/config -> effect@3.20.0`. A clean
`npm ci --omit=dev --ignore-scripts` also installed that chain because the
client declares Prisma as an optional peer. The patched Effect version is
3.22.1; Prisma config pins 3.20.0 exactly, and the registry listed no newer
stable 7.x release. An isolated override to 3.22.1 passed generation, schema
validation, migration status, backend startup and the current test suites, but
violates that exact upstream pin and is not an upstream-supported dependency
combination. It was not applied to the project. The advisory remains unresolved.

Application source imports the generated client and MariaDB adapter, while
Prisma CLI configuration imports `prisma/config`; installed `@prisma/config`
requires Effect. No `Schema.TemplateLiteral` reference was found in its shipped
distribution, and no direct Effect or config reference was found in the
inspected application and generated runtime JavaScript. This does not prove
that a vulnerable path is unreachable in every dependency or tool. Restrict
builds, migrations and configuration to trusted inputs and monitor upstream
Prisma for a 7.x release pinning a patched Effect version. Then upgrade and
test the Prisma packages together and rerun both audits. See
`docs/AUTHENTICATION.md` for release blockers and the override assessment.

The MariaDB adapter connects to MySQL and owns a shared connection pool, closed
by `prisma.$disconnect()` on shutdown. Defaults are five connections and ten
seconds for connection and pool acquisition; URL parameters can override these.
Review pool limits across application instances, TLS and driver URL options for
the hosting environment. The Prisma 7-compatible `prisma-client-js` generator
is deprecated but retained for this JavaScript application; it generates into
ignored `backend/generated/prisma` and must be generated before startup.

For Hostinger, provide a separate production MySQL database and credentials
through the hosting environment, verify Node.js and database support, and
use reviewed committed migrations with `npx prisma migrate deploy`.
Do not use development migration commands against production. Back up and
verify the deployment process before applying production migrations.

---

# 7. MULTI-VENDOR ORDER ARCHITECTURE

A customer may purchase products from different sellers
through a single checkout.

The system creates:

1. Parent customer order
2. Seller-specific orders
3. Individual order items
4. One or more fulfillment records
5. Shipment or local delivery assignments
6. Corresponding payment and settlement records

Different seller orders may use different
delivery methods.

Example:
- Pickle from a nearby seller: Local rider
- Masala from another state: Courier shipping

Shipping charges must be calculated before checkout.

Each fulfillment tracks status independently.

Product details and prices must be snapshotted
when an order is created.

Inventory reservations must be transactional
to prevent overselling.

Critical operations must be idempotent and
safe under concurrent requests.

---

# 8. LOCAL DELIVERY SYSTEM

Local deliveries use independent verified riders.

Delivery workflow:

1. Customer places an eligible local order.
2. Seller confirms and prepares the order.
3. Seller marks the package ready for pickup.
4. Delivery system publishes an eligible job.
5. Available verified riders can view the job.
6. One rider successfully claims the job.
7. Rider travels to the seller.
8. Pickup is verified with OTP or equivalent proof.
9. Rider delivers to the customer.
10. Delivery is verified.
11. Rider earnings and settlement records are updated.

Only one rider may claim a given active job.

Use database transactions and atomic state transitions
to prevent duplicate assignments.

Delivery jobs must support:
- Cancellation
- Assignment expiration
- Rider no-show
- Reassignment
- Failed delivery
- Disputes

Actual rider location tracking must respect
privacy, permission, and retention requirements.

Hostinger-compatible polling may be used initially.
Managed realtime infrastructure can be integrated later.

---

# 9. NATIONWIDE COURIER SHIPPING

The shipping module must support integrations
through a provider-independent adapter.

Required functions:

- Pickup PIN-code validation
- Destination serviceability
- Shipping rate estimation
- Shipping booking
- Label generation
- AWB/tracking number storage
- Tracking events
- Delivery confirmation
- Failed delivery handling
- Return-to-origin
- Returns processing

Shipping providers must not determine
the internal order data model.

Store provider references separately from
internal shipment identifiers.

Courier webhooks must be verified, deduplicated,
and processed idempotently.

---

# 10. PAYMENTS AND COMMISSIONS

Payments must use an approved provider supporting
the required marketplace business model.

Core requirements:
- Online prepaid checkout
- Payment initiation
- Server-side verification
- Signed webhook handling
- Payment reconciliation
- Refund processing
- Marketplace commission calculation
- Seller settlement accounting
- Rider earning calculations
- Payout tracking

Use exact monetary representations.

Record money movements using an auditable ledger.

Do not treat a payment redirect as proof of payment.

Actual seller/rider settlement mechanisms must
follow payment-provider and regulatory requirements.

Cash on delivery may be added later,
after operational and reconciliation workflows
are established.

---

# 11. PRODUCT AND SELLER COMPLIANCE

Product listings must support category-specific fields.

For packaged food:
- Ingredients
- Net quantity
- Applicable FSSAI details
- Batch information
- Manufacturing/expiry or best-before details
- Storage instructions

For personal care:
- Ingredients
- Quantity
- Manufacturer details
- Applicable labeling and regulatory details

Before production launch review:
- Applicable FSSAI licensing
- Seller verification requirements
- GST and invoicing rules
- Consumer-protection obligations
- Privacy and data-protection requirements
- Product labeling
- Delivery partner obligations
- Refund and cancellation policies

Legal and regulatory compliance must be verified
with qualified professionals before launch.

---

# 12. HOSTING ARCHITECTURE

Initial target: Hostinger Business Web Hosting.

Proposed deployments:

Customer site:
https://fullhdmarketplace.com

REST API:
https://api.fullhdmarketplace.com

Seller dashboard:
https://fullhdmarketplace.com/seller

Admin dashboard:
https://fullhdmarketplace.com/admin

These are illustrative URLs, not confirmed domains.

The actual deployment will depend on hosting
resource limits and available Node.js features.

Avoid relying on:
- Custom listening ports
- Persistent background workers
- Self-hosted WebSocket infrastructure
- Self-hosted Redis
- Docker services

Use supported external services for features
that exceed shared hosting capabilities.

Design deployment configuration so migration
to a VPS or managed cloud remains possible.

---

# 13. SECURITY AND RELIABILITY

Production requirements:

- HTTPS everywhere
- Secure password hashing
- Role-based authorization
- Request validation
- Rate limiting
- Restricted CORS configuration
- Secrets in environment variables
- Secure file uploads
- Webhook signature verification
- Idempotent payment processing
- Atomic inventory updates
- Atomic delivery job assignment
- Database backups and restore tests
- Structured logs
- Error monitoring
- Automated tests
- Audit trails
- Secure deployment workflow
- Environment separation

Never store payment credentials, passwords,
tokens, or sensitive configuration in Git.

---

# 14. DEVELOPMENT PHASES

PHASE 1: FOUNDATION
- Initialize Node.js and Express
- Configure MySQL and Prisma
- Establish API structure
- Implement users, roles, authentication
- Create tests and environment configuration

PHASE 2: MARKETPLACE
- Next.js customer website
- Seller registration and approval
- Product catalogue
- Seller storefronts
- Cart
- Inventory
- Order creation
- Basic administration

PHASE 3: PAYMENTS
- Payment provider integration
- Verified checkout
- Commission rules
- Refunds
- Settlement ledger
- Payout records

PHASE 4: LOCAL DELIVERY
- Rider registration and verification
- Available delivery jobs
- Job acceptance and assignment
- Pickup and drop-off verification
- Rider earnings
- Local delivery pilot

PHASE 5: NATIONWIDE SHIPPING
- Courier integration
- Shipping quotes
- Serviceability
- Shipping labels
- Tracking
- Returns and failed deliveries

PHASE 6: MOBILE APPLICATIONS
- React Native customer app
- React Native rider app
- Shared backend APIs
- Push notifications
- Android and iOS testing
- Store submissions

Mobile development may begin before Phase 6.
This phase marks production release readiness.

PHASE 7: LAUNCH
- Security review
- Legal and compliance checks
- Load testing
- Restore testing
- Monitoring
- Production deployment
- Limited geographic launch
- Gradual expansion

---

# 15. DEVELOPMENT RULES

1. Treat this document as the initial architectural
   reference for Full HD Marketplace.

2. Keep business logic inside backend services.

3. Never trust client-supplied prices, roles,
   commission rates, or order totals.

4. Make financial and inventory operations
   transactional and idempotent.

5. Keep shipping and payment providers replaceable.

6. Never expose another seller's private records.

7. Use migrations for every database change.

8. Maintain API documentation and tests.

9. Design all features for real business operation,
   not demonstration-only workflows.

10. Update this document whenever major architecture
    decisions change.

---

# 16. CURRENT PROJECT STATE

Project name: Full HD Marketplace

Business model:
Multi-vendor marketplace for small businesses.

Revenue:
Primarily marketplace commissions.

Fulfillment:
Local independent riders and nationwide couriers.

Backend:
Node.js + Express.

Frontend:
Next.js + React.

Mobile:
React Native + Expo.

Database:
MySQL + Prisma.

Initial hosting:
Hostinger Business.

Development environment:
Visual Studio Code.

Current milestone:
Phase 1 - Foundation.

Next task:
Complete authentication integration testing, delivery integration and security review.
