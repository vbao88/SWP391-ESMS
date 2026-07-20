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
