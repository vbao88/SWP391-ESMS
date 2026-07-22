# ESMS Product Catalog Core MVP Specification

## 1. Purpose and Scope

This document is the approved source of truth for the ESMS Product Catalog Core MVP. It defines
the Product domain foundation, public Frame and Lens catalog APIs, DTOs, query behavior, lifecycle,
seed requirements, and the authorization boundary for later administration checkpoints.

In scope:

- Brand and Category reference data.
- Frame and FrameVariant product data.
- Lens and LensOption product data.
- Product media metadata.
- Public Frame list and detail APIs.
- Public Lens list API.
- Super Administrator Product Management behavior for later protected checkpoints.

Out of scope is listed in Sections 22 and 25. This specification does not claim completion of
all of US-03 or US-04 because availability, configuration, and prescription compatibility are
deliberately deferred.

## 2. Sources and Approval Record

This specification incorporates:

- ESMS SRS Milestone 1: Product Management, US-03, US-04, UC-PROD-01 through UC-PROD-11,
  FR-PROD-01 through FR-PROD-10, the Product/Inventory boundary, TC-05 and TC-06.
- `documents/api/API_MODULES.md`.
- `documents/database/COLLECTION_PLAN.md`.
- Checkpoints 5.1A, 5.1B, and 5.1C.
- The project response, validation, authentication, and current-user authorization conventions.

All effective outcomes of PROD-DEC-01 through PROD-DEC-30 and PROD-CLOSE-01 through
PROD-CLOSE-14 are approved and incorporated. The approved LensOption amendment restricts its
initial types to `coating` and `tint`.

## 3. Actors and Authorization

### 3.1 Public Catalog

Guest and authenticated actors may call the approved public routes without an Access Token.
Public routes MUST NOT run `authenticate` or `requireSuperAdmin`. Supplying an invalid Bearer
Token MUST NOT make a public request fail or expose additional data.

Public APIs return only resources satisfying the effective visibility rules in Section 5.

### 3.2 Product Administration

Product mutations are restricted to a current active Super Administrator. Protected routes MUST
use this order:

```text
authenticate -> requireSuperAdmin -> validate params/body -> controller -> service
```

The current User loaded from the database is the final authorization source. Branch Managers,
Sales Staff, Prescription Staff, Customers, and ineligible Administrators are denied. The
existing authentication and authorization error contracts are reused.

This specification approves the administration capability and same-resource namespace
convention. Exact mutation paths are introduced only by their later implementation checkpoints;
this document does not invent unapproved Admin Read endpoints.

## 4. Domain Boundaries

Product Catalog owns:

- Brand, Category, Frame, FrameVariant, Lens, and LensOption.
- Product identity, attributes, prices, status, and media metadata.
- Public catalog queries and Product Admin mutation contracts.

Product Catalog does not own:

- Branch stock, quantities, reservations, or inventory transactions.
- Cart configuration persistence or order price snapshots.
- Prescription validation or medical compatibility.
- Reviews, rating, promotions, or price history.
- Cloudinary upload/delete workflows.
- Face recommendation or virtual try-on.

Frame inventory references FrameVariant. Lens inventory references Lens. LensOption is non-stock
and is not an SKU. Product `status` does not indicate inventory availability.

## 5. Product Lifecycle and Effective Public Visibility

All Product resources use exactly:

```text
active
inactive
```

The default is `active`. Core MVP uses soft deactivate/reactivate and does not hard-delete Product
resources. Setting the current status again is idempotent and returns HTTP 200 in later Admin
status contracts.

A Frame is public only when all conditions hold:

- Frame is active.
- Referenced Brand is active.
- Referenced Category is active.
- At least one referenced FrameVariant is active.

A Lens is public only when both Lens and referenced Brand are active.

Only active FrameVariants may contribute to public search, price, filters, or DTOs. An inactive
dependency conceals the resource without cascading or changing any stored status.

Public Frame Detail MUST return the same HTTP 404 contract for an unknown Frame and for a Frame
that is inactive, references an inactive Brand/Category, or has no active variant. Public responses
MUST NOT reveal which eligibility condition failed.

## 6. Brand Contract

| Field | Type | Requirement/default | Validation/normalization | Mutability and visibility |
|---|---|---|---|---|
| `_id` | ObjectId | Database generated | MongoDB ObjectId | Immutable; mapped to public/admin `id` |
| `name` | String | Required | Trimmed, non-empty; case-insensitive global uniqueness | Mutable by Super Admin; public/admin |
| `status` | String | Required; default `active` | `active` or `inactive` | Mutable only through status behavior; Admin only |
| `createdAt` | Date | System generated | Mongoose timestamp | Immutable; Admin only |
| `updatedAt` | Date | System generated | Mongoose timestamp | System managed; Admin only |

Required index: case-insensitive unique Brand `name`. Duplicate normalized names return HTTP 409
with `Brand name already exists`.

## 7. Category Contract

Core MVP Categories form a flat list; no parent/tree fields exist.

| Field | Type | Requirement/default | Validation/normalization | Mutability and visibility |
|---|---|---|---|---|
| `_id` | ObjectId | Database generated | MongoDB ObjectId | Immutable; mapped to `id` |
| `name` | String | Required | Trimmed, non-empty; case-insensitive global uniqueness | Mutable by Super Admin; public/admin |
| `status` | String | Required; default `active` | `active` or `inactive` | Status behavior only; Admin only |
| `createdAt` | Date | System generated | Mongoose timestamp | Immutable; Admin only |
| `updatedAt` | Date | System generated | Mongoose timestamp | System managed; Admin only |

Required index: case-insensitive unique Category `name`. Duplicate normalized names return HTTP
409 with `Category name already exists`.

## 8. Frame Contract

Controlled values:

```text
shape:      round | square | rectangle | oval
material:   acetate | metal | titanium | plastic
gender:     unisex | men | women | kids
faceShapes: oval | round | square | heart
```

| Field | Type | Requirement/default | Validation/normalization | Mutability and visibility |
|---|---|---|---|---|
| `_id` | ObjectId | Generated | ObjectId | Immutable; mapped to `id` |
| `name` | String | Required | Trimmed, non-empty | Mutable; public/admin |
| `description` | String | Not required; default `""` | Trimmed | Mutable; detail/admin |
| `brandId` | ObjectId ref Brand | Required | Existing Brand reference | Mutable; exposed as Brand DTO |
| `categoryId` | ObjectId ref Category | Required | Existing Category reference | Mutable; exposed as Category DTO |
| `shape` | String | Required | Controlled allowlist | Mutable; public/admin |
| `material` | String | Required | Controlled allowlist | Mutable; public/admin |
| `gender` | String | Required | Controlled allowlist | Mutable; public/admin |
| `faceShapes` | String[] | Required; at least one value | Unique controlled values | Mutable; public/admin |
| `images` | Media[] | Required array; default `[]` | Section 12 | Mutable; public/admin allowlists differ |
| `status` | String | Required; default `active` | Lifecycle allowlist | Status behavior only; Admin |
| `createdAt` | Date | Generated | Timestamp | Immutable; Admin; available for sort internally |
| `updatedAt` | Date | Generated | Timestamp | System managed; Admin |

Frame has no authoritative `basePrice`. `priceFrom` is a derived public value described in
Section 9.

Recommended query indexes include `{ brandId: 1, categoryId: 1, status: 1 }`; implementation may
add query-supporting non-unique indexes without changing the public contract.

## 9. FrameVariant Contract

`size` is a controlled label, not a physical eyewear measurement:

```text
S | M | L
```

| Field | Type | Requirement/default | Validation/normalization | Mutability and visibility |
|---|---|---|---|---|
| `_id` | ObjectId | Generated | ObjectId | Immutable; mapped to `id` |
| `frameId` | ObjectId ref Frame | Required | Existing Frame | Immutable after creation; Admin/internal relation |
| `sku` | String | Required | Trim + uppercase; `^[A-Z0-9][A-Z0-9_-]{2,63}$` | Immutable; public/admin |
| `color` | String | Required | Trim, collapse whitespace, non-empty | Mutable display value; public/admin |
| `colorNormalized` | String | Required derived value | Trim/collapse/lowercase from color | System managed; never in DTO |
| `size` | String | Required | `S`, `M`, or `L` | Mutable; public/admin |
| `sizeNormalized` | String | Required derived value | Lowercase canonical size label | System managed; never in DTO |
| `price` | Number | Required | Non-negative integer VND | Mutable; public/admin |
| `images` | Media[] | Required array; default `[]` | Section 12 | Mutable; public/admin allowlists differ |
| `tryOnAssetUrl` | — | Not present in Core MVP foundation | Deferred | No DTO exposure |
| `status` | String | Required; default `active` | Lifecycle allowlist | Status behavior only; Admin |
| `createdAt` | Date | Generated | Timestamp | Immutable; Admin |
| `updatedAt` | Date | Generated | Timestamp | System managed; Admin |

Required indexes:

```text
{ sku: 1 } unique
{ frameId: 1, status: 1 }
{ frameId: 1, colorNormalized: 1, sizeNormalized: 1 } unique
```

Two variants of one Frame cannot share the same normalized color and size even if their SKUs
differ. Duplicate errors are:

```text
409 Frame variant SKU already exists
409 Frame variant color and size already exist for this frame
```

`FrameVariant.price` is the final selling price. Public `Frame.priceFrom` is the minimum price of
all active variants, regardless of the variant filter that caused a Frame to match. Inactive
variants never affect `priceFrom`. A Frame with no active variant is not public and never returns
a fake or null price.

## 10. Lens Contract

Controlled values:

```text
visionType:       non_prescription | single_vision
refractiveIndex:  "1.50" | "1.56" | "1.60" | "1.67"
features:         blue_light | photochromic
```

`refractiveIndex` is stored and returned as a canonical decimal string.

| Field | Type | Requirement/default | Validation/normalization | Mutability and visibility |
|---|---|---|---|---|
| `_id` | ObjectId | Generated | ObjectId | Immutable; mapped to `id` |
| `name` | String | Required | Trimmed, non-empty | Mutable; public/admin |
| `description` | String | Not required; default `""` | Trimmed | Mutable; public/admin |
| `brandId` | ObjectId ref Brand | Required | Existing Brand | Mutable; exposed as Brand DTO |
| `visionType` | String | Required | Controlled allowlist | Mutable; public/admin |
| `refractiveIndex` | String | Required | Controlled canonical-string allowlist | Mutable; public/admin |
| `features` | String[] | Required array; default `[]` | Unique controlled values | Mutable; public/admin |
| `basePrice` | Number | Required | Non-negative integer VND | Mutable; public/admin |
| `images` | Media[] | Required array; default `[]` | Section 12 | Mutable; public/admin allowlists differ |
| `status` | String | Required; default `active` | Lifecycle allowlist | Status behavior only; Admin |
| `createdAt` | Date | Generated | Timestamp | Immutable; Admin/internal sorting |
| `updatedAt` | Date | Generated | Timestamp | System managed; Admin |

Lens foundation MUST NOT contain `supportedRange`, SPH/CYL/AXIS/ADD limit fields, or an
unvalidated compatibility placeholder. Public Lens List neither filters nor returns supported
ranges. Prescription compatibility is deferred until its own approved contract.

## 11. LensOption Contract

| Field | Type | Requirement/default | Validation/normalization | Mutability and visibility |
|---|---|---|---|---|
| `_id` | ObjectId | Generated | ObjectId | Immutable; mapped to `id` |
| `lensId` | ObjectId ref Lens | Required | Existing Lens | Immutable after creation; Admin/internal |
| `type` | String | Required | `coating` or `tint` | Immutable after creation; Admin |
| `value` | String | Required | Trimmed, non-empty | Mutable; Admin |
| `valueNormalized` | String | Required derived value | Trim/collapse/lowercase from value | System managed; never returned |
| `priceAdjustment` | Number | Required; default `0` | Signed integer VND | Mutable; Admin |
| `status` | String | Required; default `active` | Lifecycle allowlist | Status behavior only; Admin |
| `createdAt` | Date | Generated | Timestamp | Immutable; Admin |
| `updatedAt` | Date | Generated | Timestamp | System managed; Admin |

Required unique index:

```text
{ lensId: 1, type: 1, valueNormalized: 1 } unique
```

LensOption is non-stock, is not an SKU, and has no `compatibility` field in Core MVP foundation.
A later configuration may choose at most one option per type and may combine one `coating` with
one `tint`. Initial Public Lens List does not return LensOptions. No Lens detail or configuration
endpoint is introduced here.

## 12. Media Contract

| Field | Type | Requirement | Validation | Public/Admin visibility |
|---|---|---|---|---|
| `url` | String | Required | Absolute HTTP or HTTPS URL | Public/Admin |
| `publicId` | String | Not required | Trimmed, non-empty when present | Admin only |
| `altText` | String | Required | Trimmed; length 1–160 | Public/Admin |
| `sortOrder` | Number | Required | Integer 0–1000 | Public/Admin |
| `isPrimary` | Boolean | Required | Strict boolean | Public/Admin |

Each owner image array permits at most one `isPrimary=true`. A mutation with multiple primaries
is rejected atomically with HTTP 400 `Validation failed`.

If no primary exists, presentation selects the lowest `sortOrder`, then stable array order,
without rewriting storage.

Frame card/detail uses Frame images. A displayed variant uses its own primary/first image, falls
back to the Frame primary/first image, and finally returns `null`. Public DTOs never expose
`publicId`.

Public Frame Detail returns both Frame and FrameVariant image arrays ordered by `sortOrder`
ascending, then by original stored-array index ascending. The stored-array-index tie-breaker is a
deterministic presentation rule and does not add an identifier to Media or rewrite storage.

For both Frame and FrameVariant media, primary-image presentation first considers images where
`isPrimary=true`; multiple primary images are resolved by `sortOrder` ascending, then original
stored-array index ascending. If no primary exists, it selects the first image using that same
ordering. An empty image array selects `null`. A variant `primaryImage` uses its selected image,
then the selected Frame image, then `null`; the Frame fallback is not copied into `variant.images`.

## 13. Public Frame List API

`GET /api/v1/frames`

No authentication is required.

### 13.1 Query allowlist

```text
page, pageSize, search, brandId, categoryId, shape, material, color, gender, faceShape,
minPrice, maxPrice, sort, order
```

Defaults and limits:

```text
page = 1; integer >= 1
pageSize = 20; integer 1–100
sort = name | price | createdAt; default name
order = asc | desc; default asc
```

For Frame List, `sort=price` uses the derived `priceFrom`, and `sort=createdAt` uses the
Frame `createdAt` timestamp. A `sort` or `order` value outside these exact allowlists returns
HTTP 400 `Validation failed`.

`brandId` and `categoryId` use 24-hex ObjectId strings. `minPrice` and `maxPrice` are non-negative
integer VND, with `minPrice <= maxPrice`.

Multi-value filters use comma-separated values. Values are trimmed and deduplicated. Values
within a filter are OR; different filter groups are AND. Controlled attribute values MUST match
the allowlists in Sections 8–10.

Unknown query keys or invalid values return HTTP 400 `Validation failed`. No availability,
rating, or branch filter is accepted.

### 13.2 Search

Search input is trimmed, repeated whitespace is collapsed, and matching is case-insensitive. The
contract does not promise diacritic-insensitive search.

Search matches exactly:

- Frame name.
- Active Brand name.
- Active FrameVariant SKU.

It does not search description or Category name. A Frame appears once even if multiple variants
match.

### 13.3 Processing order

1. Effective public eligibility.
2. Active variant join.
3. Search normalization.
4. Search.
5. Frame-level filters.
6. Variant-existence filters.
7. `priceFrom` filters.
8. Deduplicate Frame by ID.
9. Project DTO.
10. Deterministic sort.
11. Count matching Frames.
12. Pagination.

Variant filters do not change displayed `priceFrom`.

### 13.4 Deterministic sorting

Final `_id` tie-breaker is always ascending:

| Mode | Ascending | Descending |
|---|---|---|
| `name` | normalized name asc, `_id` asc | normalized name desc, `_id` asc |
| `price` | `priceFrom` asc, normalized name asc, `_id` asc | `priceFrom` desc, normalized name asc, `_id` asc |
| `createdAt` | `createdAt` asc, `_id` asc | `createdAt` desc, `_id` asc |

### 13.5 Success

HTTP 200, exact message `Frames retrieved successfully.`

```json
{
  "success": true,
  "message": "Frames retrieved successfully.",
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 0,
      "totalPages": 0
    }
  }
}
```

An empty result uses the exact zero-item shape above.

## 14. Public Frame Detail API

`GET /api/v1/frames/:frameId`

No authentication is required. `frameId` must be exactly 24 hexadecimal characters.

- Malformed ID: HTTP 400 `Validation failed` before a database lookup.
- Unknown valid ID: HTTP 404 `Frame not found`.
- Inactive/ineligible existing Frame: the same HTTP 404 contract.
- Eligible Frame: HTTP 200, message `Frame retrieved successfully.` and Public Frame Detail DTO.

The business query MUST enforce effective visibility and MUST NOT rely on the controller/client
to hide ineligible resources.

Returned active FrameVariants are ordered by canonical stored `color` ascending, then canonical
stored `size` ascending, canonical stored `sku` ascending, and `_id` ascending. Frame and variant
image ordering and primary-image fallback follow Section 12.

## 15. Public Lens List API

`GET /api/v1/lenses`

No authentication is required.

Query allowlist:

```text
page, pageSize, search, brandId, visionType, refractiveIndex, feature,
minPrice, maxPrice, sort, order
```

It uses the same pagination, multi-value, unknown-query, price-range, and deterministic sorting
rules as Frame List. Its exact sort validation contract is:

```text
sort = name | price | createdAt; default name
order = asc | desc; default asc
```

For Lens List, `sort=price` uses `basePrice`, and `sort=createdAt` uses the Lens `createdAt`
timestamp. A `sort` or `order` value outside these exact allowlists returns HTTP 400
`Validation failed`. Search matches Lens name and active Brand name; Lens has no SKU search.
Effective eligibility requires active Lens and Brand.

The endpoint does not accept supported-range or availability filters and does not return
LensOptions.

Success is HTTP 200 with exact message `Lenses retrieved successfully.` and the same
`items/pagination` envelope. Empty results return `items: []`, `totalItems: 0`, and
`totalPages: 0`.

## 16. Admin Product Management Scope

Later checkpoints provide Super Administrator management of:

- Brand and Category information/status.
- Frame and FrameVariant information/status/prices.
- Lens and LensOption information/status/prices.
- Product media metadata.

Protected mutations use the same resource namespaces as public APIs and the middleware order in
Section 3. Exact endpoint paths and request contracts are defined by their approved implementation
checkpoints. No hard delete, cascade status mutation, Branch Manager permission, dependency
protection rule, or unapproved Admin Read route is implied.

## 17. Query Contract Summary

- Public queries reject unknown keys rather than stripping them.
- Controlled filters reject values outside approved allowlists.
- Search is trim/collapse/case-insensitive only.
- Comma-separated values implement OR within a filter.
- Filter groups combine with AND.
- Frame List and Lens List accept only `sort=name|price|createdAt` and `order=asc|desc`, with
  defaults `sort=name` and `order=asc`; invalid values return HTTP 400 `Validation failed`.
- Frame price sorting uses derived `priceFrom`; Lens price sorting uses `basePrice`; each
  `createdAt` sort uses the corresponding root resource timestamp.
- Search/filter/deduplication occur before count and pagination.
- Every sort mode has stable tie-breakers.
- Public queries never expose inactive resources or children.

## 18. Response DTO Allowlists

### 18.1 Public DTOs

Brand:

```text
id, name
```

Category:

```text
id, name
```

Media:

```text
url, altText, sortOrder, isPrimary
```

Frame Card:

```text
id, name, brand{id,name}, category{id,name}, shape, material, gender, faceShapes,
primaryImage{url,altText}|null, priceFrom
```

Frame Detail:

```text
all Frame Card fields, description, images[Media], variants[Public FrameVariant]
```

FrameVariant:

```text
id, sku, color, size, price, images[Media], primaryImage{url,altText}|null
```

Lens:

```text
id, name, description, brand{id,name}, visionType, refractiveIndex, features,
basePrice, primaryImage{url,altText}|null
```

Pagination:

```text
page, pageSize, totalItems, totalPages
```

### 18.2 Admin DTOs

Admin Brand and Category DTOs contain their respective public fields plus:

```text
status, createdAt, updatedAt
```

Admin Frame DTO:

```text
id, name, description, brand{id,name,status}, category{id,name,status}, shape, material,
gender, faceShapes, images[Admin Media], status, createdAt, updatedAt
```

Admin FrameVariant DTO:

```text
id, frameId, sku, color, size, price, images[Admin Media], status, createdAt, updatedAt
```

Admin Lens DTO:

```text
id, name, description, brand{id,name,status}, visionType, refractiveIndex, features,
basePrice, images[Admin Media], status, createdAt, updatedAt
```

Admin LensOption DTO:

```text
id, lensId, type, value, priceAdjustment, status, createdAt, updatedAt
```

Admin Media equals Public Media plus `publicId` when stored.

No DTO returns `_id`, `__v`, normalized comparison fields, aggregation fields, inventory data,
availability, rating, User/auth/session context, or Cloudinary secret/context.

## 19. Error Contract

Errors use:

```json
{
  "success": false,
  "message": "Error message",
  "details": null
}
```

Joi validation errors use an array in `details`. No symbolic error-code property is added.

| Scenario | HTTP | Exact message |
|---|---:|---|
| Invalid query/body/ObjectId | 400 | `Validation failed` |
| Unknown/ineligible public Frame | 404 | `Frame not found` |
| Missing/malformed Authorization | 401 | `Authentication required` |
| Invalid/expired/wrong Access Token | 401 | `Invalid or expired access token` |
| Current User lacks permission | 403 | `Insufficient permission` |
| Duplicate Brand name | 409 | `Brand name already exists` |
| Duplicate Category name | 409 | `Category name already exists` |
| Duplicate FrameVariant SKU | 409 | `Frame variant SKU already exists` |
| Duplicate Frame color/size | 409 | `Frame variant color and size already exist for this frame` |
| Unexpected database/server error | 500 | `Internal server error` |

## 20. Seed Requirements

The deterministic, idempotent Product seed contains at least:

- Two Brands.
- Three Categories.
- Ten Frames.
- Two FrameVariants per Frame.
- Four Lenses.
- One LensOption per Lens.
- Deterministic image URLs.

It does not seed Inventory. It uses natural unique keys and upsert behavior compatible with the
existing Branch seed, does not create duplicates when rerun, and does not delete non-seed records.

Integration tests MUST create and clean their own Product fixtures in the approved test database,
MUST NOT depend on seed execution, and MUST NOT depend on test order.

## 21. Test Strategy and Required Matrix

### 21.1 Foundation/model tests

- Exact fields/defaults/controlled values.
- Case-insensitive Brand/Category uniqueness.
- SKU normalization, regex, immutability, and global uniqueness.
- Frame color/size compound uniqueness.
- Integer/non-negative prices and signed LensOption adjustment.
- Media validation and single-primary rule.
- LensOption uniqueness and type allowlist.
- Deterministic/idempotent seed behavior without test dependency on seed.

### 21.2 Public Frame List

- Guest and authenticated public access; invalid Bearer ignored.
- Effective Frame/Brand/Category/Variant visibility.
- Active-only variant contribution.
- `priceFrom` derivation and exclusion of no-active-variant Frames.
- Search by Frame name, Brand name, and active Variant SKU.
- SKU deduplication when multiple variants match.
- Exact filter allowlist, OR/AND semantics, and variant filters.
- Variant filter does not redefine `priceFrom`.
- All deterministic sort modes and tie-breakers.
- Search/filter/deduplication before count/pagination.
- Empty result and exact response envelope.
- Unknown/invalid query returns 400.
- DTO containment and database error behavior.
- TC-05 combined-filter coverage.

### 21.3 Public Frame Detail

- Active eligible detail success.
- Invalid ID before database lookup.
- Unknown, inactive, inactive-dependency, and no-active-variant all return the same 404.
- Only active variants returned.
- Image precedence/fallback/null behavior.
- DTO containment and database errors.

### 21.4 Public Lens List

- Effective Lens/Brand visibility.
- Controlled filters, search, sorting, pagination, and empty result.
- No LensOptions, supportedRange, availability, or rating.
- DTO containment, invalid query, and database errors.

### 21.5 Later Admin mutations

- Authentication/current-user authorization before validation and Product lookup.
- Only current active Super Administrator succeeds.
- Input/DTO allowlists and no hard delete/cascade.
- Status idempotency and inactive Admin access.
- Duplicate-index errors and unexpected database errors.

## 22. Inventory Boundary

- Inventory owns branch-specific `quantity`, `reservedQuantity`, `availableQuantity`, thresholds,
  transactions, and reservations.
- Frame stock references FrameVariant.
- Lens stock references Lens.
- LensOption has no stock and no SKU.
- Product Catalog does not persist quantity or perform reservation transactions.
- Initial public APIs do not query Inventory and do not return availability.
- Product active status and inventory availability are independent.

## 23. Deferred Capabilities

- Branch availability filter and Product availability.
- Inventory quantities and reservations.
- Lens `supportedRange` and supported-range filtering.
- Prescription compatibility, FR-PROD-08, and TC-06.
- Product configuration and LensOption public access.
- Lens detail endpoint.
- Rating and Reviews integration.
- Promotion and price history.
- Cloudinary upload/delete/reorder workflow.
- Physical Frame measurements.
- Virtual try-on and face recommendation.

US-03 remains incomplete until branch availability integration. US-04 and TC-06 remain incomplete
until Product Configuration and Prescription Compatibility are implemented.

## 24. Implementation Checkpoint Order

1. **5.2B — Product Catalog Model & Seed Foundation.** Split implementation into:
   - 5.2B.1 Brand/Category foundation.
   - 5.2B.2 Frame/FrameVariant foundation.
   - 5.2B.3 Lens/LensOption foundation.
2. **5.3A — Public Frame List.**
3. **5.3B — Public Frame Detail.**
4. **5.4A — Public Lens List.**
5. **5.5A+ — Admin Product Management**, divided by aggregate and mutation type.
6. **Later — Product Configuration and Prescription Compatibility.**
7. **Later — Product–Inventory Integration.**

Admin Brand/Category CRUD does not block Public Frame List; approved models and deterministic seed
provide its initial references.

## 25. Explicit Non-Goals

- Hard delete or cascade status changes.
- Branch Manager, Sales Staff, or Prescription Staff Product administration.
- Admin Read routes not explicitly approved by later checkpoints.
- Inventory API, stock, reservation, transaction, or checkout behavior.
- Cart/order persistence or price snapshots.
- Prescription medical validation or range compatibility.
- Lens detail/configuration API.
- Rating, Reviews, promotions, or price history.
- Cloudinary upload implementation.
- Physical eyewear measurements.
- Face recommendation or virtual try-on.
- Client integration.
