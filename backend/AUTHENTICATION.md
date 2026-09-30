# Authentication & Role-Based Access Control (RBAC) Specification

## 1. Overview
The **Local Food Waste ? Donation Matcher** backend implements a stateless, token-based authentication system backed by **Argon2id password hashing**, **signed JSON Web Tokens (JWT)**, and **Role-Based Access Control (RBAC)** guards.

---

## 2. Password Hashing (Argon2id)
We use **Argon2id** (the winner of the Password Hashing Competition, IETF RFC 9106) via the `argon2-cffi` library.

### Why Argon2id?
* **Memory-Hard Proof:** Requires 64 MB of RAM per hash evaluation, neutralizing parallel GPU/ASIC brute-force attacks.
* **Side-Channel Defense:** Combines data-independent memory access (Argon2i) with data-dependent access (Argon2d) to protect against cache-timing attacks.
* **No Plaintext or Fast Hashes:** Standard fast hashes (MD5, SHA-1, SHA-256) are vulnerable to hardware cracking and are strictly prohibited.

### Cryptographic Configuration
```python
PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MB
    parallelism=4,
    hash_len=32,
    type=argon2.Type.ID,
)
```

---

## 3. JWT Architecture

### Token Types & Lifecycles
* **Access Token:** Short-lived token (default: 30 minutes) used for API authorization in the HTTP `Authorization: Bearer <token>` header.
* **Refresh Token:** Long-lived token (default: 7 days) used strictly to obtain new access tokens at `/api/v1/auth/refresh`.

### JWT Claims Payload
```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "role": "FOOD_BUSINESS",
  "type": "access",
  "iat": 1727514000,
  "exp": 1727515800,
  "jti": "d3b07384-d113-40f2-95f2-9861614742a0"
}
```
*Note: Tokens contain only public identifier claims and no sensitive credentials or password hashes.*

---

## 4. Role-Based Access Control (RBAC) & Permissions

| Role | Scope & Permissions | Explicit Restrictions |
| :--- | :--- | :--- |
| **`FOOD_BUSINESS`** | Creates donations, manages kitchen profile, views own donation history and handoff codes. | Cannot manage organizations, volunteers, or administrative review queues. |
| **`ORGANIZATION`** | Configures storage capacity, accepts/declines incoming match invitations, manages intake deliveries. | Cannot create commercial food listings or perform admin verification. |
| **`VOLUNTEER`** | Sets delivery availability, views dispatch task board, updates transit milestones. | Cannot accept donations for facilities or alter donation listings. |
| **`ADMIN`** | Reviews organization charity records, verifies accounts, audits system logs. | Does not bypass tamper-evident audit logs. |

---

## 5. Authentication API Endpoints

### 1. Register User
* **Endpoint:** `POST /api/v1/auth/register`
* **Status:** `201 Created`
* **Payload:**
```json
{
  "email": "donor@kitchen.com",
  "password": "SecurePassword123!",
  "role": "FOOD_BUSINESS"
}
```
*Note: Direct self-registration as `ADMIN` is rejected at the schema level.*

### 2. Login
* **Endpoint:** `POST /api/v1/auth/login`
* **Status:** `200 OK`
* **Payload:**
```json
{
  "email": "donor@kitchen.com",
  "password": "SecurePassword123!"
}
```
* **Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1Ni...",
  "refresh_token": "eyJhbGciOiJIUzI1Ni...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "donor@kitchen.com",
    "role": "FOOD_BUSINESS",
    "is_active": true,
    "is_verified": false,
    "created_at": "2026-09-28T09:00:00Z",
    "updated_at": "2026-09-28T09:00:00Z"
  }
}
```

### 3. Refresh Token
* **Endpoint:** `POST /api/v1/auth/refresh`
* **Status:** `200 OK`
* **Payload:** `{"refresh_token": "eyJhbGciOiJIUzI1Ni..."}`

### 4. Get Current User Profile
* **Endpoint:** `GET /api/v1/auth/me`
* **Headers:** `Authorization: Bearer <access_token>`
* **Status:** `200 OK`

### 5. Change Password
* **Endpoint:** `POST /api/v1/auth/change-password`
* **Headers:** `Authorization: Bearer <access_token>`
* **Payload:**
```json
{
  "current_password": "OldPassword123!",
  "new_password": "NewSecurePassword456!"
}
```

---

## 6. Environment Configuration

Create a `.env` file in the `backend/` directory:

```env
POSTGRES_SERVER=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=food_waste_matcher

JWT_SECRET_KEY=generate_a_secure_random_32_character_minimum_secret_key_here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
```

---

## 7. Local Development & Testing Instructions

To run the automated authentication and security test suite:
```powershell
$env:PYTHONPATH="d:\Food Helper\backend"
.\venv\Scripts\pytest.exe -v tests/test_auth.py
```
