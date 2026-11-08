# Database

Supabase Postgres. The live database was dumped to `supabase/baseline/pure1_schema_dump.sql` (reference only — never re-run against production). Everything added since lives in `supabase/migrations/` and is **idempotent** (safe to run twice).

## Migrations

| File | Adds |
|---|---|
| `20261020010000_foundation_helpers` | `set_updated_at()`, `current_app_role()`, `is_admin()`, `is_staff()`; default-privilege lock-down |
| `20261020020000_profiles_and_auth` | idempotent profile trigger on sign-up, `ensure_my_profile()`, role-change guard, column-level grants, RLS |
| `20261020030000_catalogue` | constraints, `product_images`, `inventory_movements` (stock ledger), `delivery_zones`, search column + indexes, RLS |
| `20261020040000_orders_and_payments` | closes the open order-insert hole; `payments`, `payment_events`, `email_log`; checkout and payment state-machine functions |
| `20261020050000_audit_log` | append-only `audit_log` + triggers |
| `20261025010000_catalogue_management` | **Phase 4.** product lifecycle and publication rules, optimistic locking, category integrity, image integrity, admin functions, column-level privacy for internal product columns. See `docs/CATALOGUE.md` (rollback: `supabase/rollback/`) |

> Migrations 01–05 are already applied to the real project (confirmed by the owner). **Migration 06 is not**: follow "Applying migration 06" in `docs/CATALOGUE.md` (deploy the Phase 4 code first, back up, then run it).

### Applying them to the real project (needs your approval — nothing has been run against production)

1. **Back up first** (see below).
2. Supabase dashboard → SQL Editor: run the five files **in order**, one at a time. Or with the CLI: `supabase link --project-ref <ref>` then `supabase db push`.
3. Confirm: `select count(*) from public.categories;` still returns your 3 categories, and `select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r';` shows `true` for every table.
4. Add delivery zones (below) — checkout is intentionally closed until you do.

The migrations were tested by loading the baseline dump into a scratch Postgres 16, applying all five, applying them a second time, and running 100 database tests (`npm run test:db`). They were **not** run against the real Supabase project (this environment cannot reach it).

### Creating a migration

Add `supabase/migrations/<UTC timestamp>_<name>.sql`, make it re-runnable (`if not exists`, `create or replace`, `drop policy if exists`), then `npm run test:db`. The `app-contract` test also fails if application code calls a database function with the wrong argument names.

## Data you must provide (no invented values)

- **Delivery zones** → table `public.delivery_zones` (`name`, `fee` in GHS, optional `free_over`, `is_pickup`). It starts **empty**. `supabase/seed/dev_delivery_zones.sql` holds *sample, unverified* values for local development only — do not run it in production.
- **Products** → the live site currently lists none. Products are created in the database (admin UI arrives in Phase 7).

## Authorisation model

Roles: `customer` (default), `dispatch`, `admin` (`public.profiles.role`). The role is **only** read from `profiles`, never from user-editable metadata. A customer cannot change it: the column is not grantable to them, RLS limits updates to their own row, and a trigger blocks role/id changes from anyone except the database owner/service role.

### First admin (trusted process)

Register normally on the site, then in the SQL editor:

```sql
update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'owner@example.com');
```

### RLS matrix (every table has RLS on)

| Table | anon | authenticated (customer) | staff (dispatch/admin) |
|---|---|---|---|
| `categories`, `product_images` | read | read | admin: write |
| `products` | read active only | read active only | admin: read all + write |
| `delivery_zones` | read active | read active | admin: read all + write |
| `profiles` | – | read/update **own** (5 contact columns only) | admin: read all |
| `orders` | – | read **own** | read all; may update **only** `fulfillment_status` |
| `order_items` | – | read own | read all |
| `payments`, `payment_events`, `email_log`, `inventory_movements`, `audit_log` | – | – | admin: read |

No browser role can insert orders, order items, payments or stock changes. All of that happens in SECURITY DEFINER functions callable **only by `service_role`** (the server): `create_checkout_order`, `begin_payment_attempt`, `mark_payment_initialized`, `mark_payment_init_failed`, `record_payment_event`, `complete_payment_event`, `apply_payment_result`, `cancel_unpaid_order`, `expire_stale_pending_orders`, `claim_email`, `finish_email`.

## Money, stock and payment rules (as implemented and tested)

- Money is `numeric(10,2)` GHS. Paystack minor units (pesewas) are computed in the database: `(amount*100)::bigint`.
- `create_checkout_order` reads prices from `products`, checks stock and the delivery zone, snapshots title/SKU/price into `order_items`, and returns the amount. It is idempotent per `client_request_id`.
- **Stock is decremented only when payment is verified** (`apply_payment_result`), under row locks, with a conditional `UPDATE … WHERE stock >= qty`. Every change is written to `inventory_movements`.
  - Consequence: two buyers can both start paying for the last unit; the first verified payment gets the unit; the second order is recorded as paid but set to `requires_review` with fulfilment `on_hold` and a note, so stock never goes negative and a person decides (refund or wait for restock). Reservation-on-checkout is an alternative to decide before Phase 6 (see `docs/DECISIONS.md` D-7).
- One **successful** payment per order (unique partial index). A second success for the same order is recorded as `duplicate_payment` for refund review.
- Amount or currency mismatch → payment status `review`, order **not** marked paid.
- A late success after the order was cancelled → `paid_after_cancellation`, flagged for review.
- Nothing can be fulfilled unless the order is paid (CHECK constraint).
- Webhook events are de-duplicated in `payment_events`; replays are no-ops.

## Backups and recovery (Supabase Free plan)

Per Supabase's documentation, **daily backups apply to Pro/Team/Enterprise projects; Free projects should regularly export their data themselves** (the Supabase docs recommend the CLI `db dump`). Storage-API objects are not in database backups.

Minimum routine until you upgrade:

```bash
supabase db dump --db-url "$SUPABASE_DB_URL" -f backup-$(date +%F)-schema.sql
supabase db dump --db-url "$SUPABASE_DB_URL" --data-only -f backup-$(date +%F)-data.sql
```

Keep copies off the machine (and out of git — they contain customer data). Also note Free projects are **paused after one week of inactivity**; a live store needs a paid plan or a keep-alive decision (see `docs/COSTS.md`).

## Retention (proposed, needs your sign-off)

Orders and payment records: keep (accounting). `payment_events` payloads and `audit_log`: review after 12–24 months. Customer profiles: delete on request (orders keep their snapshot, `user_id` is set null). These are proposals, not approved policy.
