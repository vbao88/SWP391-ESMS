# ESMS Authentication Specification

## 1. Feature

Customer Registration and Email Verification.

## 2. Related Requirements

- UC-AUTH-01: Register Customer Account
- UC-AUTH-02: Verify Email Using OTP
- US-01: Register and Verify Customer Account
- FR-AUTH-01: Register with unique email and password
- FR-AUTH-02: Send time-limited OTP
- BR-AUTH-01: Each email belongs to only one account
- NFR-SEC-02: Passwords are hashed
- NFR-SEC-07: OTP expires after five minutes and is not stored in plain text

## 3. Scope

This phase includes:

- Register Customer account
- Generate verification OTP
- Display OTP in backend terminal during local development
- Verify Customer email
- Resend verification OTP with rate limiting

This phase does not include:

- Login
- Access Token
- Refresh Token
- Logout
- Forgot password
- Google authentication
- Staff account creation

## 4. API Contracts

### 4.1 Register Customer

`POST /api/v1/auth/register`

Request:

```json
{
  "fullName": "Le Van Bao",
  "email": "bao@example.com",
  "password": "Password123"
}
```

Successful response: HTTP 201

```json
{
  "success": true,
  "message": "Registration successful. Please verify your email.",
  "data": {
    "email": "bao@example.com",
    "status": "pending_activation"
  }
}
```

Possible errors:

- 400: Invalid input
- 409: Email already exists
- 429: Too many requests

### 4.2 Verify Email

`POST /api/v1/auth/verify-email`

Request:

```json
{
  "email": "bao@example.com",
  "otp": "123456"
}
```

Successful response: HTTP 200

```json
{
  "success": true,
  "message": "Email verified successfully.",
  "data": {
    "email": "bao@example.com",
    "status": "active"
  }
}
```

Possible errors:

- 400: OTP is incorrect or expired
- 404: Account does not exist
- 409: Email was already verified

### 4.3 Resend Verification OTP

`POST /api/v1/auth/resend-verification-otp`

Request:

```json
{
  "email": "bao@example.com"
}
```

Successful response: HTTP 200

```json
{
  "success": true,
  "message": "A new verification OTP has been generated.",
  "data": {
    "email": "bao@example.com"
  }
}
```

Possible errors:

- 404: Account does not exist
- 409: Email was already verified
- 429: OTP was requested too recently

## 5. Business Rules

- Registration always creates a Customer account.
- Email is converted to lowercase before storage.
- Email must be unique.
- Password must contain at least eight characters, one uppercase letter and one number.
- Password is hashed using bcrypt with cost factor 12.
- New accounts have status `pending_activation`.
- OTP contains exactly six digits.
- OTP expires after five minutes.
- OTP is hashed before being stored.
- A new OTP cannot be requested within 60 seconds.
- Successful verification changes account status to `active`.
- Successful verification records `emailVerifiedAt`.
- A used OTP cannot be reused.
- No authentication token is issued during this phase.

## 6. Acceptance Criteria

### AC-01: Successful registration

Given an unused valid email  
When the Guest submits valid registration information  
Then a pending Customer account is created  
And a six-digit OTP is generated.

### AC-02: Duplicate email

Given an email already exists  
When registration is submitted  
Then the request returns HTTP 409  
And no duplicate account is created.

### AC-03: Successful verification

Given an unexpired valid OTP  
When the Customer verifies the email  
Then the account becomes active  
And `emailVerifiedAt` is recorded.

### AC-04: Incorrect OTP

Given an incorrect OTP  
When verification is submitted  
Then the request is rejected  
And the account remains pending.

### AC-05: Expired OTP

Given an OTP older than five minutes  
When verification is submitted  
Then the request is rejected  
And a new OTP may be requested.

### AC-06: Resend restriction

Given an OTP was generated less than 60 seconds ago  
When another OTP is requested  
Then the request returns HTTP 429.

## 7. Validation Gate

The phase is complete only when:

- Backend tests pass
- Registration API works through Postman
- Duplicate email is rejected
- Correct OTP activates the account
- Incorrect OTP is rejected
- Expired OTP is rejected
- OTP is not stored in plain text
- Password is not returned by any API
- Swagger documentation is updated

---

## Phase 2 — Login and Session Management

### Scope and API Contracts

The approved future endpoints are:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

Login accepts an email address and password. A successful login will return a short-lived Access
Token and safe user data, and will set a Refresh Token only in an HTTP-only cookie. Refresh will
rotate the presented Refresh Token and issue a new Access Token. Logout will revoke the presented
refresh session and clear the cookie.

The email/password login endpoint is implemented in Checkpoint 3B. Refresh Token rotation is
implemented in Checkpoint 3C. Current-session logout is implemented in Checkpoint 3D.

#### Login

`POST /api/v1/auth/login`

Request:

```json
{
  "email": "bao@example.com",
  "password": "Password123"
}
```

A successful login returns HTTP 200 with an Access Token, its configured expiry, and safe user
data. The initial Refresh Token is returned only in the `esms_refresh_token` HTTP-only cookie.
Every authentication failure returns HTTP 401 with `Invalid email or password.` Malformed input
remains HTTP 400, and login-specific throttling may return HTTP 429.

#### Refresh Session

`POST /api/v1/auth/refresh`

Refresh reads the single-use Refresh Token only from the configured HTTP-only cookie. A successful
request atomically revokes the presented session, creates a successor in the same token family,
sets the rotated cookie, and returns only a new Access Token and its configured expiry. The old
Refresh Token becomes invalid immediately. Every invalid or expired refresh session returns HTTP
401 with `Invalid or expired session.` and clears the cookie. Refresh Tokens and session metadata
are never returned in JSON.

#### Logout

`POST /api/v1/auth/logout`

Logout reads only the configured Refresh Token cookie, revokes only its matching current session,
and always clears the cookie. The operation is idempotent: missing, invalid, expired, unknown, or
already-revoked sessions still return HTTP 200 with `Logout successful.` Existing Access Tokens
are not revoked and remain usable until their configured expiry.

### Approved Authentication and Session Rules

- Only users whose status is `active` and whose email is verified may log in.
- Every unsuccessful login case returns the generic message `Invalid email or password.`
- Five consecutive failed password attempts create a temporary account lock.
- The temporary lock lasts 15 minutes by default.
- Temporary locks use `lockedUntil` and do not change `status` to `locked`.
- `status=locked` is reserved for an administrative lock.
- Access Tokens normally expire after 15 minutes.
- Refresh Tokens normally expire after 7 days.
- A Refresh Token is stored only in an HTTP-only cookie.
- A raw Refresh Token is never stored in MongoDB; only its hash and session metadata are stored.
- Refresh Tokens are single-use and are rotated after a successful refresh.
- Logout revokes the refresh session represented by the presented Refresh Token.
- A user may have at most 10 active refresh sessions.
- Existing Access Tokens remain usable until their expiry after logout.
