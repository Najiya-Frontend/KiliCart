# Catalogue and seller management

`Category` supports an active/inactive state and a parent/child hierarchy.
`Product` belongs to a `Store` and category, has an exact `DECIMAL(10,2)` price,
an unsigned stock count and a reviewed lifecycle. A seller account has at most
one store. Product variants are not modeled because the current workflow does
not define variant pricing or inventory rules.

## Store review lifecycle

Stores transition `DRAFT` or `REJECTED` → `PENDING_REVIEW` → `ACTIVE` or
`REJECTED`. A seller may edit a rejected store and resubmit it. Editing an
active store returns it to `DRAFT`, removing it from public discovery until it
is reviewed again. A pending store cannot be edited. Store names, descriptions,
contact phone and location are seller-managed; contact and location are not
returned to public catalogue responses until a safe public-location policy is
defined.

## Product review lifecycle

Products transition `DRAFT` or `REJECTED` → `PENDING_REVIEW` → `PUBLISHED` or
`REJECTED`. Sellers may correct and resubmit rejected products. Editing a
published product's public details or price returns it to `DRAFT`; a
stock-only update may retain `PUBLISHED`. Sellers must have an active seller
account for every write. Product submission requires an active approved store
and active category. Product approval requires the seller, store and category
to remain active. Archiving removes a product from public results.

Admin decisions lock the seller account before the store/product row. This
serializes approval against seller suspension. An administrator cannot approve
content while its seller account is suspended; the account must be explicitly
reactivated first. Each store/product create, submission, public-content
unpublish, archive and admin decision is recorded in `CatalogueReviewAudit`
with actor, target, prior and resulting status, reason where applicable and
timestamp.

Seller endpoints are under `/api/v1/seller`: `POST /stores`,
`GET/PATCH /stores/me`, `POST /stores/me/submit`, `GET/POST /products`,
`GET/PATCH /products/:id`, `POST /products/:id/submit`, and
`POST /products/:id/archive`. Ownership and store association come from the
authenticated user and seller account, never request fields.

Admin endpoints are under `/api/v1/admin`: `GET /stores/pending`,
`GET /stores/:id`, `POST /stores/:id/decision`, corresponding `/products`
routes, and `GET /catalogue-audits` filtered by one seller, store or product.
Store/product decision requests require a reason for both approvals and
rejections. Admin routes require `ADMIN` or `SUPER_ADMIN`.

## Public visibility

Public product queries require `ProductStatus.PUBLISHED`, active category,
active store and active seller account together. Public store queries require
an active store and active seller account. These conditions apply to home,
category listings, product listings and details, store listings and details,
store products and search. Public selects omit seller account, contact/location
and review fields. Rejected, pending, draft, archived and suspended content is not
returned. Search paginates products, stores and categories independently under
the shared API pagination envelope.

Product variants, ratings, discounts, local delivery, and courier serviceability
are not represented and are not returned or filterable. Category product counts
are omitted rather than implying a count that cannot be made public.

## Product images

Product image files live in Cloudinary; MySQL stores only the secure URL,
provider name and provider public asset id, alt text, status and ordering.
Cloudinary is behind `ImageStorageProvider` in the backend, so a future storage
provider can implement the same upload/delete contract. Credentials are backend
environment variables only: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and
`CLOUDINARY_API_SECRET`. Leave them unset in local development if no account is
available; upload requests then return a safe 503 response. Never put the
provider secret in a website `NEXT_PUBLIC_*` variable or in the Expo app.

Authenticated seller routes are `GET/POST /api/v1/seller/products/:id/images`,
`PUT/DELETE /api/v1/seller/products/:id/images/:imageId`, and
`PATCH /api/v1/seller/products/:id/images/order` with `{ imageIds: [...] }`.
Multipart uploads use the `image` field and optional `altText`. JPEG, PNG and
WebP are detected from bytes, capped at 10 MB, 8000 pixels per side and 40 MP,
then normalized to metadata-stripped WebP (maximum 2500 pixels per side).
Products support up to 8 images. Position zero is the main image. Only the
authenticated owner with an active seller account can manage images; pending
review and archived products cannot be edited. Changing images on a published
product returns it to DRAFT and records a catalogue audit, so image upload does
not publish or approve a listing.

Uploads use memory-only multipart handling and never write temporary files.
If database insertion fails after provider upload, the service compensates by
deleting the provider asset. Deletion first hides the image as `DELETE_PENDING`,
then removes the provider asset and database row. If provider deletion is
temporarily unavailable, the seller image endpoint retains a hidden retryable
cleanup row; the seller clients expose a retry-delete action. Replacement uses
the same pending cleanup mechanism for the old provider asset. This is a
recoverable cross-service workflow; configure provider monitoring and reconcile
old assets during operations.

Public catalogue selects return only ACTIVE image metadata belonging to
products already filtered as PUBLISHED with active categories, stores and
sellers. Provider asset ids and cleanup state are never exposed publicly.
Product requests continue to reject image URL fields. Clients must use the
authenticated upload routes rather than supplying arbitrary URLs.

## Development fixtures

Fixtures are manual and are restricted in code to `NODE_ENV=development` and a
loopback MySQL URL whose database name is exactly `kilicart_dev`. They are never
part of application startup, Prisma seeding, migrations, or production setup.
The fixture command verifies the selected database before writing.

From `backend`, run:

```powershell
$env:NODE_ENV = 'development'
npm run catalogue:fixtures
```

This idempotently creates the ten sample category rows, using reserved
`dev-fixture-` slugs. By default, no seller or product is created. To add two
non-public sample products, set `KILICART_DEV_FIXTURE_STORE_ID` to an existing
development store ID owned by an ACTIVE seller account, then run the command
again. The products use reserved fixture slugs, `DRAFT` status, zero stock, and
sample prices; the script does not create users, sellers, stores, or approvals.

To remove only those two product fixture slugs and unused fixture categories:

```powershell
$env:NODE_ENV = 'development'
npm run catalogue:fixtures -- --reset
```

The reset does not drop tables or delete unrelated rows. Categories referenced
by other products or child categories are retained. Never point the fixture
command at a production or shared database.
