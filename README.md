# Mera-Pe Backend (Assessment)

A Node.js (Express) backend for **Earned Wage Access**: employees can withdraw a portion of their earned salary before payday, with a cap of 3 withdrawals per month and up to 100% of net earned wages.

---

## Quick Start

```bash
# Install dependencies
npm install

#I have used PostgreSql for storing data locally
# Set up PostgreSQL and create DB
createdb mera_pe
#these two files will initialize db and insert dummy data 
psql -d mera_pe -f scripts/init-db.sql
psql -d mera_pe -f scripts/seed-assessment.sql

# I've also pushed .env in github repo

# Run server
npm start
```

**API**

- `GET /api/limit/:userId` — get available withdrawal limit (Task 1)
- `POST /api/withdraw` — process withdrawal (Task 2); body: `{ "userId", "amount", "idempotencyKey" }`

---

## Architecture & Design

### Folder structure

- `**src/config/`** — DB pool and env (no secrets in code).
- `**src/routes/`** — Route definitions; delegates to controllers.
- `**src/controllers/`** — HTTP layer: parse input, call services, set status and JSON.
- `**src/services/**` — Business logic: earned wage calculation and withdrawal processing (DB transactions, idempotency, locking).
- `**src/middleware/**` — Global error handler and rate limiter (429).
- `**scripts/**` — DB schema and seed SQL.

So: **routes → controllers → services → DB**. No business logic in routes or controllers.

### Task 1: Earned wage calculator

- **Formula**: `net_earned_so_far = (gross × (1 − deduction%)) × (days_worked / days_in_month)`; `available_limit = net_earned_so_far − total_withdrawn_this_month`.
- **Eligibility**: `available_limit > 0` and fewer than 3 completed withdrawals in the current month.
- Employee defaults (assessment): gross ₹60,000, 10% deductions, 30 days in month, 15 days worked. Withdrawals (₹5,000 + ₹2,000) come from DB; if DB is unavailable, the service falls back to in-memory defaults so the API still returns a valid payload.

### Task 2: Double-spend protection (concurrency & ledger)

- **Idempotency**: Every withdrawal request must send a client-generated `idempotencyKey`. The first request with that key is processed; later requests with the same key return the same result (no duplicate debit). Implemented by a unique constraint on `withdrawals.idempotency_key` and a “select before insert” check.
- **Row-level locking**: Inside a transaction we `SELECT ... FOR UPDATE` on the `employees` row for that user. So concurrent requests for the same user serialize: each re-computes `available_limit` inside the transaction and only one can commit a new withdrawal when the balance is tight (e.g. only ₹10,000 left and five requests of ₹10,000).
- **Transaction**: `BEGIN` → lock employee row → recompute limit → validate amount and eligibility → `INSERT` withdrawal with status `completed` → `COMMIT`. On any failure we `ROLLBACK`. So the ledger stays consistent and the user is debited only once.

### Task 3: Orphaned payout

**1) Eventual payment detection**

If the server crashes before processing the “Payment Successful” webhook from Razorpay, the system can still detect that the payout succeeded:

- **Polling Razorpay**: A scheduled job (e.g. cron or queue worker) periodically fetches payout status from Razorpay (by our internal payout ID or reference). For any payout we marked “pending” or “initiated,” we compare Razorpay’s status with our DB. If Razorpay says “success” and we don’t, we treat it as a missed webhook and run the same “payment success” flow (update ledger, mark payout completed, notify user).
- **Idempotent success handler**: The “payment success” handler must be idempotent (e.g. keyed by payout ID). So when we later discover the success (via poll or retried webhook), applying it again does not double-credit.

**2) Ledger reconciliation**

To keep our internal ledger aligned with Razorpay:

- **Daily reconciliation job**: For a time window (e.g. last 24–48 hours), fetch from Razorpay the list of payouts (and their statuses) that we initiated. For each, ensure we have a matching row in our `payouts`/`withdrawals` table and that our status matches (e.g. “success” vs “completed”). If Razorpay shows “success” but we have “pending,” we run the success flow and fix the ledger. If we show “success” but Razorpay shows “failed” or “reversed,” we run a correction flow (reverse ledger entry, alert).
- **Escrow vs ledger**: Compare our internal “escrow balance” (or the sum of debits we’ve made for payouts) with Razorpay’s view of payouts from the escrow. Discrepancies trigger alerts and manual or automated correction so our books match Razorpay’s reality and no “orphaned” payout stays unrecorded.

---

## HTTP status codes


| Code | Usage                                                                 |
| ---- | --------------------------------------------------------------------- |
| 200  | Success (limit response, withdrawal accepted)                         |
| 400  | Bad request (missing/invalid `userId`, `amount`, or `idempotencyKey`) |
| 422  | Withdrawal rejected (insufficient limit or 3/month exceeded)          |
| 429  | Too many requests (rate limit on `/api/withdraw`)                     |
| 500  | Server error (unhandled exception)                                    |


---

## DB (PostgreSQL)

- **employees**: `id` (PK), `gross_monthly_salary`, `deduction_percent`.
- **withdrawals**: `id` (PK), `user_id` (FK), `amount`, `idempotency_key` (UNIQUE), `status`, `created_at`.

Run `scripts/init-db.sql` then `scripts/seed-assessment.sql` to get the assessment scenario (user `user-001` with two prior withdrawals).

---

## Example requests

**Get limit (Task 1)**  
`GET /api/limit/user-001`

**Process withdrawal (Task 2)**  
`POST /api/withdraw`  
`Content-Type: application/json`  
`{ "userId": "user-001", "amount": 5000, "idempotencyKey": "unique-key-123" }`

For the double-spend scenario: send the same `idempotencyKey` with multiple concurrent requests; only one will create a new withdrawal, the rest return the same result (already processed).

---

## How it works (for frontend devs)

### Request flow

1. **GET /api/limit/:userId**
  The client calls this to show “You can withdraw up to ₹X.”  
  - The **route** (`/limit/:userId`) sends the request to the **limit controller**.  
  - The **controller** reads `userId` from the URL, calls the **earned wage service**, and returns the JSON (e.g. `net_earned_so_far`, `available_limit`, `is_eligible_for_withdrawal`).  
  - The **service** (Task 1) loads salary and deduction from the DB (or uses defaults), counts how many withdrawals the user already made this month and their total, then computes: *earned so far − already withdrawn* and whether they still have withdrawal slots (max 3 per month).  
  - If the DB is down, the service still returns a sensible response using default salary and zero withdrawals.
2. **POST /api/withdraw**
  The client sends `{ userId, amount, idempotencyKey }` when the user taps “Withdraw.”  
  - The **route** runs the **rate limiter** first (returns 429 if too many requests), then the **withdraw controller**.  
  - The **controller** validates the body and calls the **withdrawal service**.  
  - The **service** (Task 2):  
    - Looks up the **idempotency key** in the DB. If that key was already used, it returns the **same result** as the first time (no second debit).  
    - Opens a **DB transaction** and **locks** the user’s row so only one withdrawal at a time can update their balance.  
    - Recomputes the **available limit** inside the transaction, checks amount and 3-per-month limit, then inserts a new withdrawal row and commits.  
     So even if the user taps “Withdraw” 5 times on a slow network, only one withdrawal is created; the rest get the same response (idempotent).

### Important for the frontend

- **idempotencyKey**: Generate **one key per “withdraw” action** (e.g. UUID) and send it in every retry or duplicate request for that same action. The backend uses it to avoid double-spend.  
- **Errors**: Use status codes: 400 (fix the payload), 422 (limit exceeded or not eligible), 429 (wait and retry), 500 (show a generic error).

