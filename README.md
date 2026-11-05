# SDE Intern Assignment: Shared Bill Splitter

Welcome. In this assignment you build a small bill splitter for a shared home. It has two parts:

1. **Homes and members:** create a home and add members to it.
2. **Bill splitting:** split a bill between the members. Each member pays their own share.

The assignment is small on purpose. We want correct, safe, and clear code. We do not want many features.

## What we look at

- **Your code passes the tests.** The tests decide, not opinion. You get the visible tests. We also run extra tests that you do not see.
- **Your code is safe when things go wrong.** Wrong input, repeated requests, and two requests at the same time must not break your data.
- **Your code is typed.** Use TypeScript. Do not use `any`.
- **You understand your code.** You record a short video and explain it.

Take your time. A careful, correct solution is better than a fast one. We expect 2 to 3 days of real work.

## Stack (required)

- **API:** Hono on Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite). The binding is `DB` in `api/wrangler.jsonc`.
- **Web:** React, Vite, TanStack Router
- **Language:** TypeScript on both sides
- **Tests:** Vitest, running inside the Workers runtime
- **Quality:** Biome. `pnpm check` and `pnpm typecheck` must pass.

You choose the rest (styling, form library, validation library). Pick tools you can explain.

## The task

The assignment has two parts. Do Part 1 first. Part 2 builds on it.

**Database.** Write the schema as SQL migration files in `api/migrations/`. For example `0001_init.sql`. The tests apply every file in this folder. Your schema must have **at least 3 named constraints** that protect the data. For example a foreign key, a `CHECK`, or a `UNIQUE` key. Be ready to explain what each constraint stops.

**Errors.** Every error response is JSON: `{ "error": "message" }`.

## Part 1: Homes and members

Create a home and add members to it. The order in which members are added matters in Part 2.

#### `POST /api/homes`

- Request: `{ "name": string }`
- Success: `201` `{ id, name }`

#### `POST /api/homes/:homeId/members`

- Request: `{ "name": string }`
- Success: `201` `{ id, homeId, name }`
- Errors: `404` home not found

Visible tests: `api/test/homes.test.ts`.

## Part 2: Bill splitting

Add a bill to a home, split it between the members, and let each member pay their share.

All amounts are whole **cents** (integers). `100` cents is 1 dollar. Never use decimals for money.

#### `POST /api/homes/:homeId/bills`

- Request: `{ "title": string, "totalCents": number }`
- Success: `201` `{ id, homeId, title, totalCents, shares: [{ id, memberId, amountCents, paidAt: null }] }`
- Errors: `404` home not found. `422` total is not a positive whole number, or the home has no members.

#### `POST /api/bills/:billId/shares/:shareId/pay`

- Request: header `Idempotency-Key`
- Success: `200` `{ id, memberId, amountCents, paidAt }`
- Errors: `400` key missing. `404` bill or share not found. `409` share already paid with a different key.

#### `GET /api/homes/:homeId/balances`

- Success: `200` `{ balances: [{ memberId, name, outstandingCents }] }`
- Errors: `404` home not found

**Rules**

- **Split.** A bill is split between all members of the home. The shares always add up to `totalCents`. If the amount does not divide evenly, the extra cents go to the members one by one, in the order the members were added to the home. Example: 1000 cents between 3 members gives `334`, `333`, `333`.
- **Pay.** Paying marks one share as paid and sets `paidAt`. If the same `Idempotency-Key` is sent again for the same share, answer `200` with the same result. Do not pay twice. If two requests pay the same share at the same time, only one may succeed.
- **Balances.** `outstandingCents` is the sum of the member's unpaid shares, across all bills of the home. List the members in the order they were added.

Visible tests: `api/test/bills.test.ts` and `api/test/payments.test.ts`.

#### Web page

Build one page that:

- shows the bills of a home and the shares of each bill,
- lets a member pay a share,
- shows clear **loading**, **empty**, and **error** states,
- keeps the share unpaid and shows an error if the payment fails.

The page must not crash when the API answers with an error or is slow.

## Cases you must handle

You must handle these cases and talk about them in your video:

1. A home with no members.
2. An amount that is zero, negative, or not a whole number.
3. An amount that does not divide evenly.
4. The same payment request sent twice.
5. Two members paying the same share at the same time.
6. A bill or share that does not exist.
7. The API answers with a 500 error or is slow. The web page must not crash.

## Run it

This is a pnpm workspace. Install once at the root.

```bash
pnpm install
pnpm dev          # api on :8787 and web on :5173
```

Open http://localhost:5173. The starter page shows a title. `/api/health` returns `{ "status": "ok" }`.

```bash
pnpm test         # run the visible tests in api/test
pnpm check        # Biome: format and lint. Must pass.
pnpm check:fix    # fix what Biome can fix
pnpm typecheck    # tsc on both packages. Must pass.
pnpm build        # production build of the web app
```

`pnpm dev` applies your migrations to a local database before it starts the API.

If pnpm says some build scripts were ignored, run `pnpm approve-builds` and allow `esbuild` and `workerd`.

When you change `api/wrangler.jsonc`, refresh the `Env` types:

```bash
pnpm --filter bill-splitter-api cf-typegen
```

## Rules for the tests

- The visible tests are in `api/test`. They start with a failing result. Your job is to make them pass.
- Do **not** change the visible tests or `api/test/helpers.ts`. We compare them with the original.
- We run extra tests after you submit. They test the cases in "Cases you must handle" more closely.

## AI policy

You can use AI tools. Tell us which ones and where in your answers on the form.
You must understand every line you submit. We check this with your video and in a live call. "The AI wrote it" is not an answer.

## How to submit

1. Click **Use this template**, then **Create a new repository**. Make the repository **public**.
2. Build your solution in your new repository. Small, clear commits are welcome.
3. Update this README with a short section called **Decisions**. Write 3 decisions you made and why.
4. Record a video of **3 minutes or less** (Loom or unlisted YouTube). Show the architecture, the data flow, and one trade-off you made. Make sure anyone with the link can view it.
5. Paste the repository link and the video link in the application form.

We will run `pnpm install && pnpm check && pnpm typecheck && pnpm test` on your repository.





---

## Application Workflow

The web page follows this user journey. Each step maps to one API call.

| Step | What the user does | API call |

| 1. Create or open a home | Creates a new household, or enters an existing home ID | `POST /api/homes`, or `GET /api/homes/:homeId/balances` to open an existing one |
| 2. Add members | Registers each person who shares the home | `POST /api/homes/:homeId/members` |
| 3. Create a bill | Enters a title and a total amount in naira | `POST /api/homes/:homeId/bills` |
| 4. Split the bill | The API divides the total between all members and returns one share per member | (same response as step 3) |
| 5. View balances | Sees what each member still owes | `GET /api/homes/:homeId/balances` |
| 6. Pay a share | Clicks "Mark as paid" on a share | `POST /api/bills/:billId/shares/:shareId/pay` |
| 7. Update balances | The page refreshes the balances after a payment | `GET /api/homes/:homeId/balances` |

How the page protects the data:

- The amount field accepts only digits with at most two decimals. Anything else, such as `10.555`, is rejected in the form and never silently rounded. The amount is converted to whole kobo with integer maths, not by multiplying a floating-point number.
- A bill cannot be submitted until the home has at least one member. The API enforces the same rule, so the form is a convenience and not the only protection.
- Every payment click sends an `Idempotency-Key`. The key is kept if the request fails or times out, so pressing the button again retries the same payment instead of creating a second one. The key is removed only after the server confirms the payment.
- A second click on the same share is ignored while its request is still running. Different shares can be paid at the same time, and each one shows its own "Processing..." state.
- If a payment fails, the share stays unpaid and an error message is shown. If the payment succeeded but the balance refresh fails, the page says so instead of reporting the payment as failed.
- Requests time out after 15 seconds, and the page shows an error message instead of freezing.

Current behaviour: the page keeps the bills and members you create in the current browser session. Opening an existing home loads its balances. The API also provides `GET /api/homes/:homeId/bills`, but the page does not call it yet, so bills from earlier sessions are not shown after reopening a home.

---

## Decisions

These are the three main decisions I made and why.

**1. Money is stored and calculated as whole integer cents (kobo).**
Floating-point numbers cannot represent values such as 0.1 exactly, so splitting and summing them gives errors. Integers are exact. Each member gets `floor(total / members)`, and the first `total % members` members, in the order they were added, get one extra cent. The shares therefore always add up to the bill total exactly. For example, 1000 cents between 3 members gives 334, 333, 333. The code also checks that the shares add up to the total before saving.

**2. Duplicate and concurrent requests are blocked in the database, not only in code.**
Checking "was this already paid?" in code and then writing leaves a gap where two simultaneous requests both pass the check. Payment is one conditional `UPDATE ... WHERE paid_at IS NULL`, so only one request can succeed. A unique index stops one `Idempotency-Key` from being used on two different shares. A retry with the same key returns the original result with `200`, and a different key on a paid share returns `409`. The same idea protects creation: a bill is inserted together with its shares in one atomic D1 batch, and the batch only inserts if the home still has the members it was split between. Creating a home, member or bill with an `Idempotency-Key` stores a record of the key in the same batch, so a retry after a timeout returns the original resource instead of creating a duplicate.

**3. The API is split into routes, services and repositories.**
Each feature module (`homes`, `members`, `bills`, `payments`, `balances`) has routes that read and validate the request, a service that holds the business rules (for example "a home with no members cannot have a bill"), and a repository that holds the SQL. This keeps each file small, lets the rules be tested without HTTP, and means a change to the database touches one place.

---

## Database

The schema is defined in SQL migration files in `api/migrations/`, which the tests and `pnpm dev` apply in order.

| File | Purpose |

| `0001_init.sql` | Creates the `homes`, `members`, `bills` and `bill_shares` tables with their foreign keys, `CHECK` constraints and unique constraints |
| `0003_idempotency.sql` | Adds the `idempotency_keys` table and the extra unique indexes that protect payments and shares |

### Tables

- `homes`: a shared household.
- `members`: people in a home. `position` is the order they were added, which decides who gets the extra cents and the order of the balances.
- `bills`: an expense with `total_cents`, belonging to a home.
- `bill_shares`: one row per member per bill, with `amount_cents`, `paid_at` and the `idempotency_key` of the payment that paid it.
- `idempotency_keys`: a record of each create request that carried an `Idempotency-Key`.

### What each constraint protects against

Constraints in `0001_init.sql`:

| Constraint | What it protects against |

| `fk_members_home` | Creating a member for a home that does not exist |
| `fk_bills_home` | Creating a bill without a valid home |
| `fk_shares_bill` | Creating a share for a bill that does not exist |
| `fk_shares_member` | Assigning a share to a member that does not exist |
| `ck_homes_name_not_empty` | Empty or whitespace-only home names |
| `ck_members_position_positive` | Zero or negative member positions |
| `ck_bills_total_positive` | Zero, negative or non-integer bill totals |
| `uq_bill_member` | Giving the same member two shares of one bill |
| `ck_share_amount_non_negative` | Negative or non-integer share amounts |

Constraints and indexes in `0003_idempotency.sql`:

| Constraint or index | What it protects against |

| `PRIMARY KEY (scope, idempotency_key)` on `idempotency_keys` | Storing the same key twice for the same kind of operation, so a retry cannot create a duplicate home, member or bill |
| `request_hash` column | Reusing a key with a different request body. The API rejects it with `422` |
| `resource_id` column | Finding the resource the original request created, so a retry can return it |
| `idx_bill_shares_idempotency_key` (unique, only where the key is set) | One payment key being used to pay two different shares |
| `idx_bill_shares_bill_member` (unique) | Duplicate shares for the same member on one bill |
| `idx_members_home_position` (unique) | Two members of one home having the same position |

One limit to be aware of: the foreign keys check that a bill's home exists and that a share's member exists, but they do not by themselves guarantee that a share's member belongs to the same home as its bill. The API guarantees this by building shares only from the members of the bill's home.
