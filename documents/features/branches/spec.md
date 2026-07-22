# ESMS Branch Public Read Specification

## 1. Feature

Public read access to active Lensora Optical branches.

## 2. Scope

### 2.1 In Scope

- List all active branches.
- View one active branch by MongoDB ObjectId.
- Allow the same public access to Guests and authenticated actors.
- Return only the approved public Branch DTO.
- Return branches in deterministic ascending `code` order.

### 2.2 Out of Scope

- Creating, updating, deleting, activating, or deactivating branches.
- Protected Branch Administration.
- Branch Manager or Super Administrator authorization.
- Inventory, products, appointments, staff assignments, or client integration.
- Pagination, filtering, sorting parameters, search, or status queries.
- Cache, geolocation, images, extended service metadata, or soft delete.
- Changes to the existing Branch model or new dependencies.

### 2.3 SRS Traceability

- Section 1.6.1, User, Family Profile, and Branch Management: Branch information management is part of the Core MVP.
- Section 2.2.1, Guest: Guests may view branch information.
- Section 7.2, Logical Collection Catalog: the `branches` collection stores branch identity, address, service status, operating hours, and contact information.
- Section 9.2, Initial REST Endpoint Catalog: `GET /branches` provides public branch information.
- BR-BRANCH-01: Lensora Optical operates three branches: Cau Giay, Dong Da, and Ha Dong.
- BR-BRANCH-03: all branches provide eye examinations daily from 09:00 to 21:00.
- UC-ADM-01 and protected branch-management permissions are outside this public-read phase.

## 3. Authorization

- Both endpoints are public and MUST NOT require an Access Token.
- Guests and authenticated actors receive the same public representation and active-only visibility.
- The routes MUST NOT use authentication or role-authorization middleware.
- Supplying an Authorization header does not grant additional fields or inactive-branch visibility.
- Inactive branches are not public resources and MUST NOT be disclosed through either endpoint.

## 4. API Contracts

### 4.1 List Active Branches

`GET /api/v1/branches`

#### Request

- No request body is used.
- No Access Token is required.

#### Query

This MVP defines no query parameters. In line with the current project validation convention,
unknown input keys are stripped rather than rejected. Therefore, supplied query parameters MUST
be ignored and MUST NOT alter filtering, ordering, fields, or response shape. No query parameter is
part of the public contract.

#### Successful Response

HTTP 200

```json
{
  "success": true,
  "message": "Branches retrieved successfully.",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "code": "CG",
      "name": "Lensora Optical - Cau Giay",
      "district": "Cau Giay",
      "city": "Ha Noi",
      "address": "Cau Giay, Ha Noi",
      "phone": "",
      "eyeExamEnabled": true,
      "operatingHours": {
        "open": "09:00",
        "close": "21:00"
      }
    }
  ]
}
```

#### Behavior

- The database query MUST include `status: "active"`.
- Results MUST be sorted by `code` in ascending order.
- If no active branch exists, the endpoint returns HTTP 200 with the exact empty-list shape:

```json
{
  "success": true,
  "message": "Branches retrieved successfully.",
  "data": []
}
```

#### Error Cases

- 429: the application-wide rate limiter may reject excessive requests. Its existing global
  response and headers are not redefined by this feature.
- 500: an unexpected server error returns the existing generic error contract.

### 4.2 View Active Branch Detail

`GET /api/v1/branches/:branchId`

#### Request

- No request body is used.
- No Access Token is required.
- `branchId` is required and MUST be a valid MongoDB ObjectId string.

#### Successful Response

HTTP 200

```json
{
  "success": true,
  "message": "Branch retrieved successfully.",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "code": "CG",
    "name": "Lensora Optical - Cau Giay",
    "district": "Cau Giay",
    "city": "Ha Noi",
    "address": "Cau Giay, Ha Noi",
    "phone": "",
    "eyeExamEnabled": true,
    "operatingHours": {
      "open": "09:00",
      "close": "21:00"
    }
  }
}
```

#### Path Validation and Lookup Behavior

- A malformed `branchId` returns HTTP 400 before the service performs a database lookup.
- A valid ObjectId that does not identify an active branch returns HTTP 404.
- An inactive branch returns the same HTTP 404 response as an unknown ObjectId.
- The business query MUST combine `_id: branchId` and `status: "active"`; it MUST NOT fetch an
  arbitrary branch and rely on the controller or client to hide an inactive result.
- HTTP 403 MUST NOT be used for an inactive branch because doing so would disclose that a
  non-public resource exists.

#### Error Cases

Invalid ObjectId, HTTP 400:

```json
{
  "success": false,
  "message": "Validation failed",
  "details": [
    "branchId must be a valid MongoDB ObjectId"
  ]
}
```

Unknown or inactive branch, HTTP 404:

```json
{
  "success": false,
  "message": "Branch not found",
  "details": null
}
```

Additional infrastructure errors:

- 429: the application-wide rate limiter may reject excessive requests. Its existing global
  response and headers are not redefined by this feature.
- 500: an unexpected server error returns the existing generic error contract.

## 5. Public Branch DTO

The public DTO is an explicit allowlist containing exactly:

- `id`: string representation of the MongoDB `_id`.
- `code`: branch code.
- `name`: branch name.
- `district`: district name.
- `city`: city name.
- `address`: public street or area address.
- `phone`: public contact phone; an empty string is valid under the current model.
- `eyeExamEnabled`: whether the branch currently provides eye-examination service.
- `operatingHours.open`: opening time string.
- `operatingHours.close`: closing time string.

Mapping requirements:

- `_id` MUST be converted to the string field `id`.
- `_id`, `__v`, `status`, `createdAt`, and `updatedAt` MUST NOT be returned.
- No other model or internal field may be returned.
- The DTO MUST be built from an explicit allowlist. A raw Mongoose document MUST NOT be passed
  directly to the response helper.

## 6. Error Contract

Branch validation and business errors use the existing project error envelope:

```json
{
  "success": false,
  "message": "Error message",
  "details": null
}
```

- Validation failures use HTTP 400 and the exact top-level message `Validation failed`.
- Validation `details` is an array of human-readable Joi validation messages.
- Unknown and inactive branch lookups use HTTP 404, message `Branch not found`, and
  `details: null`.
- Unexpected errors use HTTP 500 and message `Internal server error`.
- Production responses MUST NOT expose stack traces or raw database errors.
- This specification does not introduce an error code field or a new error envelope.

## 7. Security and Privacy Requirements

- Every list query MUST filter by `status: "active"` in the database operation.
- Every detail query MUST filter by both `_id` and `status: "active"` in the database operation.
- An inactive branch MUST be indistinguishable from an unknown branch through the public detail
  endpoint.
- The server MUST construct the public response from the DTO allowlist.
- The implementation MUST NOT depend on the client to hide `status` or other internal fields.
- Authentication state MUST NOT widen the public DTO or active-only scope.
- User, staff, inventory, appointment, and other operational data MUST NOT be populated or
  returned by these endpoints.

## 8. Acceptance Criteria

### AC-BRANCH-01: Guest lists active branches

Given active branches exist  
When a Guest requests `GET /api/v1/branches`  
Then the response is HTTP 200  
And only active branches are returned using the public DTO.

### AC-BRANCH-02: Authenticated actor retains public access

Given an authenticated actor  
When the actor requests either public Branch endpoint  
Then no additional authorization is required  
And the response has the same visibility and DTO as a Guest response.

### AC-BRANCH-03: Empty active-branch list

Given no active branches exist  
When the list endpoint is requested  
Then the response is HTTP 200  
And `data` is an empty array.

### AC-BRANCH-04: Deterministic ordering

Given multiple active branches exist  
When the list endpoint is requested repeatedly  
Then branches are returned in ascending `code` order.

### AC-BRANCH-05: Active branch detail

Given an active branch exists  
When its valid ObjectId is requested  
Then the response is HTTP 200  
And the response contains exactly the public DTO.

### AC-BRANCH-06: Invalid ObjectId

Given a malformed branchId  
When the detail endpoint is requested  
Then the response is HTTP 400 with `Validation failed`  
And no branch database lookup is performed.

### AC-BRANCH-07: Unknown branch

Given a valid ObjectId that does not identify a branch  
When the detail endpoint is requested  
Then the response is HTTP 404 with `Branch not found`.

### AC-BRANCH-08: Inactive branch concealment

Given an inactive branch exists  
When its ObjectId is requested through the public detail endpoint  
Then the response is the same HTTP 404 contract used for an unknown branch.

### AC-BRANCH-09: No unsupported public fields

Given any successful Branch response  
When its JSON payload is inspected  
Then `_id`, `__v`, `status`, `createdAt`, `updatedAt`, and all non-allowlisted fields are absent.

### AC-BRANCH-10: Unsupported query input

Given a request supplies one or more query parameters  
When the list endpoint is processed  
Then those parameters are ignored under the current strip-unknown convention  
And they do not change active-only filtering, ascending-code ordering, DTO fields, or response
shape.

## 9. Planned Test Matrix

| ID | Scenario | Expected Result |
| --- | --- | --- |
| BR-PUB-01 | Guest lists active branches | HTTP 200 and public DTO list |
| BR-PUB-02 | Authenticated request lists or views an active branch | Same public access and representation as Guest |
| BR-PUB-03 | Active and inactive branches exist | Only active branches appear in list |
| BR-PUB-04 | No active branches exist | HTTP 200 with `data: []` |
| BR-PUB-05 | Branches were inserted out of code order | Results are sorted by ascending `code` |
| BR-PUB-06 | Guest requests an active branch by valid ObjectId | HTTP 200 and exact public DTO |
| BR-PUB-07 | Detail request uses malformed ObjectId | HTTP 400, `Validation failed`, no database lookup |
| BR-PUB-08 | Detail request uses unknown valid ObjectId | HTTP 404, `Branch not found` |
| BR-PUB-09 | Detail request targets inactive branch | Same HTTP 404 contract as unknown ObjectId |
| BR-PUB-10 | Successful list and detail payloads are inspected | No `_id`, `__v`, `status`, timestamps, or extra fields |
| BR-PUB-11 | Seed/default operating hours are returned | `open: "09:00"`, `close: "21:00"` serialize correctly |
| BR-PUB-12 | Unsupported query parameters are supplied | Parameters are ignored and cannot alter contracted behavior |

## 10. Validation Gate

The Branch Public Read MVP is complete only when:

- Both approved endpoints are implemented without authentication middleware.
- Active-only filtering occurs in service/database queries.
- The public DTO allowlist is enforced.
- Invalid, unknown, and inactive identifiers follow the approved 400/404 behavior.
- Empty-list and deterministic-ordering behavior is verified.
- Integration tests cover the planned test matrix.
- Swagger/OpenAPI and Postman examples match this specification.
- Existing Authentication behavior and tests remain unchanged.

---

# Protected Branch Administration

## 11. Scope and SRS Traceability

### 11.1 In Scope

- Create a branch.
- Partially update approved public branch information.
- Activate or deactivate a branch through its `status` field.
- Restrict all administration endpoints to a valid Super Administrator.
- Return an explicit Branch Admin DTO.

### 11.2 SRS Traceability

- Section 2.1: Administrator is divided into Branch Manager and Super Administrator levels.
- Section 2.2.5: a Branch Manager manages one assigned branch and may not create or delete
  branches or access another branch's internal data.
- Section 2.2.6: the Super Administrator manages branches and has system-wide, cross-branch
  authority.
- UC-ADM-01: `Manage Branch Information`, primary actor Super Administrator.
- Section 7.2: a Branch stores identity, address, service status, operating hours, and contact
  information.
- BR-BRANCH-01: the initial business has Cau Giay, Dong Da, and Ha Dong branches.
- The approved public-read rules in Sections 1-10 of this document remain unchanged.

## 12. Actor and Authorization Matrix

| Actor or principal | Create | Update information | Activate/deactivate |
| --- | --- | --- | --- |
| Guest | Denied: 401 | Denied: 401 | Denied: 401 |
| Customer | Denied: 403 | Denied: 403 | Denied: 403 |
| Sales Staff | Denied: 403 | Denied: 403 | Denied: 403 |
| Prescription Staff | Denied: 403 | Denied: 403 | Denied: 403 |
| Branch Manager | Denied: 403 | Denied: 403 | Denied: 403 |
| Administrator with missing, null, or unknown `adminLevel` | Denied: 403 | Denied: 403 | Denied: 403 |
| Super Administrator (`role=administrator`, `adminLevel=super_admin`) | Allowed | Allowed | Allowed |

Authorization MUST fail closed. No missing or unrecognized claim may default to Super
Administrator access.

## 13. Authentication and Current-User Policy

### 13.1 Middleware Shape

The recommended route-level shape is:

```text
authenticate -> requireSuperAdmin -> validate -> controller
```

- `authenticate` remains responsible for missing, malformed, invalid, expired, or wrong-type
  tokens and for attaching the normalized JWT principal.
- A dedicated `requireSuperAdmin` middleware is preferred over changing `authorizeRoles` because
  the existing helper intentionally checks only base roles and is already covered by that
  contract.
- `requireSuperAdmin` MUST require both `role === "administrator"` and
  `adminLevel === "super_admin"`.
- Authorization logic MUST NOT be duplicated in controllers.
- Missing/malformed/invalid/expired Access Tokens return HTTP 401.
- A valid Access Token with insufficient role or admin level returns HTTP 403.

### 13.2 Approved Current-User Database Lookup

| Concern | A. Trust JWT until expiry | B. Load current User for each administration request |
| --- | --- | --- |
| Locked/inactive after token issue | Retains administration access until token expiry | Can be denied immediately from current status |
| Role/adminLevel changed | Old privileges remain until token expiry | Current privileges are enforced immediately |
| User deleted | Token remains accepted until expiry | Request can be rejected because User no longer exists |
| Database cost | No additional read | One indexed User lookup per protected request |
| Consistency with current auth middleware | Fully consistent with current claim-only middleware | Requires a new administration-specific authorization step, without changing `authenticate` |
| Risk for branch mutation | Higher stale-privilege window | Lower stale-privilege risk |

Protected Branch Administration MUST use option B because these endpoints mutate system-wide
reference data. `requireSuperAdmin` MUST use the verified JWT `userId` to load the current User and
MUST treat the database result, not stale JWT role/adminLevel claims, as the final authorization
source.

The current User MUST exist and simultaneously have `status=active`, `role=administrator`, and
`adminLevel=super_admin`. A deleted or nonexistent current User returns HTTP 401 with
`Invalid or expired access token`. An existing User with any other status, role, or admin level
returns HTTP 403 with `Insufficient permission`. The response MUST NOT disclose whether the
account was locked, deactivated, downgraded, or otherwise made ineligible.

This lookup applies only to Protected Branch Administration. Public Branch Read MUST remain
public and MUST NOT perform a current-User lookup. The global `authenticate` middleware is not
changed by this policy.

## 14. Create Branch Contract

`POST /api/v1/branches`

### 14.1 Request

Required headers:

```text
Authorization: Bearer <access-token>
Content-Type: application/json
```

Request body:

```json
{
  "code": "HN",
  "name": "Lensora Optical - Hoan Kiem",
  "district": "Hoan Kiem",
  "city": "Ha Noi",
  "address": "Hoan Kiem, Ha Noi",
  "phone": "0240000000",
  "eyeExamEnabled": true,
  "operatingHours": {
    "open": "09:00",
    "close": "21:00"
  }
}
```

Required fields:

- `code`
- `name`
- `district`
- `address`

Optional fields and current model defaults:

- `city`: defaults to `Ha Noi` under the current model.
- `phone`: defaults to an empty string.
- `eyeExamEnabled`: defaults to `true`.
- `operatingHours.open`: defaults to `09:00`.
- `operatingHours.close`: defaults to `21:00`.
- `status` is not accepted by create; the model default creates the branch as `active`.

### 14.2 Successful Response

HTTP 201

```json
{
  "success": true,
  "message": "Branch created successfully.",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "code": "HN",
    "name": "Lensora Optical - Hoan Kiem",
    "district": "Hoan Kiem",
    "city": "Ha Noi",
    "address": "Hoan Kiem, Ha Noi",
    "phone": "0240000000",
    "eyeExamEnabled": true,
    "operatingHours": {
      "open": "09:00",
      "close": "21:00"
    },
    "status": "active",
    "createdAt": "2026-07-21T10:00:00.000Z",
    "updatedAt": "2026-07-21T10:00:00.000Z"
  }
}
```

### 14.3 Duplicate Code

- `code` is normalized by trim and uppercase before persistence.
- A duplicate normalized code returns HTTP 409.
- Exact error message: `Branch code already exists`.
- The response uses the standard error envelope with `details: null`.
- Duplicate-key error code 11000 MUST be translated to this controlled conflict, including a
  concurrent create race.

## 15. Update Branch Information Contract

`PATCH /api/v1/branches/:branchId`

### 15.1 Path and Partial Update

- `branchId` MUST be a valid MongoDB ObjectId; malformed input returns HTTP 400.
- A valid but unknown ObjectId returns HTTP 404 with `Branch not found`.
- A Super Administrator may update both active and inactive branches so inactive data can be
  corrected before reactivation.
- The request is a partial update. At least one approved field MUST remain after validation.

### 15.2 Update Allowlist

Allowed fields:

- `name`
- `district`
- `city`
- `address`
- `phone`
- `eyeExamEnabled`
- `operatingHours.open`
- `operatingHours.close`

Disallowed fields:

- `_id`, `id`, `__v`
- `status` (use the dedicated status endpoint)
- `createdAt`, `updatedAt`
- Any internal or unrecognized field
- `code`, which is immutable after creation

The implementation MUST build an explicit update object from the validated allowlist and MUST NOT
pass `request.body` directly to a Mongoose update operation.

Nested `operatingHours` updates are partial: updating only `open` MUST preserve the existing
`close`, and updating only `close` MUST preserve the existing `open`.

`code` is immutable after branch creation. If `code` appears in an update body, whether alone or
alongside otherwise valid fields, the entire request MUST be rejected with HTTP 400 and no field
may change. Duplicate-code HTTP 409 behavior therefore applies only to branch creation.

### 15.3 Unknown and Empty Bodies

- Unknown fields are stripped under the current validation convention, except that `code` is a
  recognized forbidden mutation field and causes HTTP 400 when present.
- Unknown fields supplied alongside approved fields are ignored unless the body also contains
  `code`, in which case the entire request is rejected.
- An empty body, or a body containing only unknown/disallowed fields after stripping, returns
  HTTP 400 with `Validation failed`.

### 15.4 Successful Response

HTTP 200

```json
{
  "success": true,
  "message": "Branch updated successfully.",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "code": "HN",
    "name": "Lensora Optical - Hoan Kiem",
    "district": "Hoan Kiem",
    "city": "Ha Noi",
    "address": "Updated public address",
    "phone": "0240000000",
    "eyeExamEnabled": true,
    "operatingHours": {
      "open": "09:00",
      "close": "21:00"
    },
    "status": "active",
    "createdAt": "2026-07-21T10:00:00.000Z",
    "updatedAt": "2026-07-21T11:00:00.000Z"
  }
}
```

The update MUST use Mongoose update validators and return the post-update document.

## 16. Branch Status Contract

`PATCH /api/v1/branches/:branchId/status`

### 16.1 Request

The body accepts exactly one supported field:

```json
{
  "status": "inactive"
}
```

- `status` is required and accepts only `active` or `inactive`.
- Unknown fields are stripped under the current validation convention.
- A missing or invalid status returns HTTP 400 with `Validation failed`.
- A malformed `branchId` returns HTTP 400.
- A valid but unknown branch returns HTTP 404 with `Branch not found`.

### 16.2 Idempotency

Setting a branch to its current status is idempotent and returns HTTP 200 with the current Branch
Admin DTO. The contract does not require `updatedAt` to change for a no-op request.

### 16.3 Successful Response

HTTP 200

```json
{
  "success": true,
  "message": "Branch status updated successfully.",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "code": "HN",
    "name": "Lensora Optical - Hoan Kiem",
    "district": "Hoan Kiem",
    "city": "Ha Noi",
    "address": "Hoan Kiem, Ha Noi",
    "phone": "0240000000",
    "eyeExamEnabled": true,
    "operatingHours": {
      "open": "09:00",
      "close": "21:00"
    },
    "status": "inactive",
    "createdAt": "2026-07-21T10:00:00.000Z",
    "updatedAt": "2026-07-21T11:00:00.000Z"
  }
}
```

After deactivation, the branch MUST disappear from `GET /api/v1/branches`, and its public detail
MUST return the existing HTTP 404 contract. After reactivation, it becomes publicly readable
again.

## 17. Validation and Normalization

### 17.1 Common Rules

- `branchId`: exactly 24 hexadecimal characters.
- `code`, `name`, `district`, `city`, and `address`: strings trimmed by validation before use.
- `code`: normalized to uppercase before uniqueness checks and persistence.
- Required strings MUST remain non-empty after trimming.
- `phone`: optional string, trimmed; the empty string is allowed. The SRS and model define no
  stricter phone format.
- `eyeExamEnabled`: boolean only; string coercion should not be part of the public contract.
- `status`: enum `active` or `inactive` only.
- Unknown fields are stripped, matching the current `validate` middleware convention.

### 17.2 Operating Hours

Approved validation:

- `open` and `close` use 24-hour `HH:mm` strings.
- Hours must be real times from `00:00` through `23:59`.
- The resulting opening time must be earlier than the closing time.
- Create may omit one or both values and use model defaults for omitted values.
- Update may provide either value and validate the merged result against the preserved value.

The request schema MUST validate the time format. Create MUST validate the final interval after
combining request values with model/spec defaults. A partial update MUST load the current branch,
merge the supplied side with the stored counterpart, validate the final `open < close` invariant,
and only then persist the atomic update. Overnight intervals, equal times, and reversed intervals
are invalid and return HTTP 400 with `Validation failed`.

## 18. Public DTO and Branch Admin DTO

The Public DTO defined in Section 5 is unchanged.

The Branch Admin DTO is an explicit allowlist containing:

- All Public DTO fields: `id`, `code`, `name`, `district`, `city`, `address`, `phone`,
  `eyeExamEnabled`, `operatingHours.open`, and `operatingHours.close`.
- `status`.
- `createdAt` and `updatedAt` serialized as ISO-8601 strings.

The Admin DTO MUST map `_id` to `id` and MUST NOT return `_id`, `__v`, unknown storage fields,
User data, JWT claims, session data, or authorization metadata. A raw Mongoose document MUST NOT
be passed directly to the response helper.

## 19. Error Contract and Status Codes

All validation and business errors use the existing envelope:

```json
{
  "success": false,
  "message": "Error message",
  "details": null
}
```

| Status | Exact message | Applies when |
| --- | --- | --- |
| 400 | `Validation failed` | Invalid path/body, invalid enum/time, or empty effective update |
| 401 | `Authentication required` | Access Token is missing or malformed |
| 401 | `Invalid or expired access token` | Token is invalid, expired, or not an Access Token |
| 403 | `Insufficient permission` | Valid principal is not a current Super Administrator |
| 404 | `Branch not found` | Valid ObjectId does not identify a branch |
| 409 | `Branch code already exists` | Create code uniqueness conflict |
| 429 | Existing global limiter response | Application-wide rate limit exceeded |
| 500 | `Internal server error` | Unexpected server/database error |

- Validation `details` is an array of Joi messages.
- Other controlled errors use `details: null`.
- Raw MongoDB/Mongoose errors MUST NOT be returned.
- This phase does not add a new error envelope or error-code property.

## 20. Security and Database Requirements

- Every administration route MUST run authentication before authorization and business logic.
- Authorization MUST require both the administrator role and Super Administrator level.
- Branch Manager MUST be denied on every administration route.
- Controllers MUST NOT perform authorization decisions.
- Create and update MUST use explicit input allowlists.
- Create and update responses MUST use the Branch Admin DTO allowlist.
- Update MUST use an atomic single-document operation with `runValidators: true` and return the
  updated document.
- A duplicate pre-check may improve the normal error path, but the unique-index duplicate-key
  error MUST still be caught to handle concurrent requests correctly.
- A single-document create or update does not require a MongoDB transaction.
- Two concurrent creates with the same normalized code MUST produce at most one created branch;
  every loser returns the controlled HTTP 409 contract.
- Status changes MUST update only `status`; hard delete and `deletedAt` are forbidden.
- Deactivation MUST NOT modify the existing Public Read implementation to expose inactive data.

## 21. Acceptance Criteria

### AC-BRANCH-ADMIN-01: Super Administrator authorization

Given a valid authorized Super Administrator  
When any Branch Administration endpoint is requested  
Then the request may proceed to validation and business processing.

### AC-BRANCH-ADMIN-02: Authentication and fail-closed authorization

Given a missing, invalid, expired, or Refresh Token  
When an administration endpoint is requested  
Then the response is HTTP 401.  
Given a valid token without both approved role and admin level  
Then the response is HTTP 403.

### AC-BRANCH-ADMIN-03: Create branch

Given valid unique branch information  
When a Super Administrator creates a branch  
Then the response is HTTP 201  
And normalization/defaults are applied  
And the Branch Admin DTO is returned.

### AC-BRANCH-ADMIN-04: Duplicate branch code

Given an existing normalized branch code  
When the same code is created concurrently or sequentially  
Then no duplicate branch is created  
And each losing request returns HTTP 409 with `Branch code already exists`.

### AC-BRANCH-ADMIN-05: Partial information update

Given an existing branch and at least one allowed update field  
When a Super Administrator updates it  
Then only allowlisted fields change  
And the post-update Branch Admin DTO is returned.

### AC-BRANCH-ADMIN-06: Invalid or empty update

Given an empty body or a body containing only unsupported fields  
When the update endpoint is requested  
Then the response is HTTP 400  
And no branch field changes.

### AC-BRANCH-ADMIN-07: Status lifecycle

Given an existing branch  
When a Super Administrator deactivates it  
Then the admin response reports `inactive`  
And the branch disappears from public list/detail.  
When it is reactivated  
Then it becomes publicly readable again.

### AC-BRANCH-ADMIN-08: Idempotent status update

Given a branch already has the requested status  
When the same status is submitted  
Then the response is HTTP 200 with the current Branch Admin DTO  
And no duplicate resource or state transition is created.

### AC-BRANCH-ADMIN-09: DTO containment

Given any successful administration response  
When the payload is inspected  
Then only Branch Admin DTO fields are returned  
And no internal Branch field, User field, or JWT/session information is disclosed.

## 22. Planned Test Matrix

### 22.1 Authorization

| ID | Scenario | Expected Result |
| --- | --- | --- |
| BR-ADM-AUTH-01 | No Authorization header | 401 `Authentication required` |
| BR-ADM-AUTH-02 | Malformed, invalid, expired, or Refresh Token | 401 `Invalid or expired access token` as applicable |
| BR-ADM-AUTH-03 | Customer, Sales Staff, or Prescription Staff token | 403 `Insufficient permission` |
| BR-ADM-AUTH-04 | Branch Manager token | 403 `Insufficient permission` |
| BR-ADM-AUTH-05 | Administrator with null, missing, or unknown adminLevel | 403 `Insufficient permission` |
| BR-ADM-AUTH-06 | Valid current Super Administrator | Request proceeds |
| BR-ADM-AUTH-07 | Valid token refers to a deleted/nonexistent User | 401 `Invalid or expired access token` |
| BR-ADM-AUTH-08 | JWT says super_admin but current User is locked, inactive, or pending | 403 `Insufficient permission` |
| BR-ADM-AUTH-09 | JWT says super_admin but current role/adminLevel was downgraded | 403 `Insufficient permission` |
| BR-ADM-AUTH-10 | JWT claims conflict with current database state | Current database state wins and access fails closed |

### 22.2 Create

| ID | Scenario | Expected Result |
| --- | --- | --- |
| BR-ADM-CREATE-01 | Valid unique body | 201, exact message and Admin DTO |
| BR-ADM-CREATE-02 | Required field missing/blank | 400 `Validation failed` |
| BR-ADM-CREATE-03 | Unknown/internal field supplied | Field stripped and not persisted/returned |
| BR-ADM-CREATE-04 | Duplicate normalized code | 409 controlled conflict |
| BR-ADM-CREATE-05 | Optional values and operatingHours omitted | Defaults form valid `09:00`-`21:00`; code normalization applied |
| BR-ADM-CREATE-06 | Response/storage contains extra field | Admin DTO does not expose it |
| BR-ADM-CREATE-07 | Concurrent same-code creates | Exactly one 201; losers receive 409 |
| BR-ADM-CREATE-08 | Operating time is not valid `HH:mm` | 400 `Validation failed` |
| BR-ADM-CREATE-09 | Opening and closing times are equal | 400 `Validation failed` |
| BR-ADM-CREATE-10 | Opening time is later than closing time | 400 `Validation failed` |

### 22.3 Update

| ID | Scenario | Expected Result |
| --- | --- | --- |
| BR-ADM-UPDATE-01 | One or more allowed fields | 200, partial update, exact message and Admin DTO |
| BR-ADM-UPDATE-02 | Malformed branchId | 400 before branch update query |
| BR-ADM-UPDATE-03 | Unknown valid branchId | 404 `Branch not found` |
| BR-ADM-UPDATE-04 | Empty body | 400 `Validation failed` |
| BR-ADM-UPDATE-05 | Unsupported-only body | 400 after stripping, no mutation |
| BR-ADM-UPDATE-06 | Unknown plus allowed field | Unknown field ignored; only allowed field changes |
| BR-ADM-UPDATE-07 | Invalid field value | 400; update validators prevent invalid persistence |
| BR-ADM-UPDATE-08 | Allowed information update targets inactive branch | 200; update succeeds and status remains inactive |
| BR-ADM-UPDATE-09 | Partial operatingHours update | Other stored time is preserved and merged value validated |
| BR-ADM-UPDATE-10 | Attempt to update status through information endpoint | Stripped; 400 if no allowed field remains |
| BR-ADM-UPDATE-11 | Code appears alone or with valid update fields | 400; entire request rejected and data remain unchanged |
| BR-ADM-UPDATE-12 | Partial operatingHours produces invalid final interval | 400 and stored hours remain unchanged |
| BR-ADM-UPDATE-13 | General information update succeeds | Existing branch status remains unchanged |

### 22.4 Status

| ID | Scenario | Expected Result |
| --- | --- | --- |
| BR-ADM-STATUS-01 | Deactivate active branch | 200 and Admin DTO status `inactive` |
| BR-ADM-STATUS-02 | Read deactivated branch publicly | Missing from list; detail returns existing 404 contract |
| BR-ADM-STATUS-03 | Reactivate inactive branch | 200 and branch is publicly readable again |
| BR-ADM-STATUS-04 | Request current status | Idempotent HTTP 200 |
| BR-ADM-STATUS-05 | Missing/invalid status | 400 `Validation failed` |
| BR-ADM-STATUS-06 | Unknown valid branchId | 404 `Branch not found` |

### 22.5 Security Regression

| ID | Scenario | Expected Result |
| --- | --- | --- |
| BR-ADM-SEC-01 | Branch Manager calls each admin endpoint | Every request returns 403 and causes no mutation |
| BR-ADM-SEC-02 | Guest calls public Branch endpoints while User lookup is observed | Existing public success behavior; no current-User lookup |
| BR-ADM-SEC-03 | Invalid Bearer token is sent to a public Branch endpoint | Existing public endpoint remains accessible |
| BR-ADM-SEC-04 | Authentication/login/refresh/logout regression suite | Existing public contract and behavior remain unchanged |
| BR-ADM-SEC-05 | Admin response includes injected/unknown stored data | Only Admin DTO allowlist is returned |

The Protected Branch Administration matrix contains 44 planned cases: 10 authorization, 10
create, 13 update, 6 status, and 5 security-regression cases.

## 23. Out of Scope

- Hard delete and `deletedAt`.
- Branch Manager administration permissions.
- Staff creation, assignment, transfer, or scheduling.
- Inventory, product, appointment, order, payment, or client integration.
- General-purpose audit-log infrastructure.
- Cache, pagination, search, geolocation, branch images, or extended service metadata.
- Any change to the Public Branch Read endpoint paths, visibility, DTO, errors, or query behavior.
- Any change to Authentication token, session, login, refresh, or logout contracts.

## 24. Resolved Decisions

All decisions previously pending approval are resolved:

1. Protected administration uses a current-User database lookup and does not authorize solely
   from JWT role/adminLevel claims.
2. A deleted/nonexistent current User returns HTTP 401; an existing but locked, inactive,
   pending, downgraded, or otherwise ineligible User returns the generic HTTP 403 contract.
3. Branch `code` is immutable after creation, and any update body containing `code` is rejected
   atomically with HTTP 400.
4. Public information for both active and inactive branches may be updated without changing
   status.
5. Operating hours use strict 24-hour `HH:mm`, require `open < close`, do not support overnight
   ranges, and validate the final merged interval for partial updates.

There are no remaining approval decisions blocking Protected Branch Administration
implementation.
