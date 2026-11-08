// Checkout + payment state-machine tests, run against real PostgreSQL.
// Covers: server-side pricing, idempotency, amount/currency validation,
// duplicate notifications, failed / abandoned / cancelled payments,
// stock accounting and concurrent purchases.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyResult, beginPayment, commitAs, createOrder, createUser, customerArgs, expectPgError, hasDb, insertProduct,
  seedCatalogue, setupDb, stockOf, uuid, type Fixture, type TestDb,
} from "./helpers";

describe.skipIf(!hasDb)("checkout and payments (PostgreSQL)", () => {
  let db: TestDb;
  let fx: Fixture;
  let svc: Awaited<ReturnType<TestDb["newClient"]>>;
  const [alpha, beta, lastUnit, draft] = [0, 1, 2, 3];

  beforeAll(async () => {
    db = await setupDb();
    fx = await seedCatalogue(db.su);
    svc = await db.newClient();
  });
  afterAll(async () => {
    await db?.drop();
  });

  const item = (i: number, quantity: number) => ({ product_id: fx.products[i].id, quantity });
  const callAs = <T>(fn: () => Promise<T>) => commitAs(svc, { role: "service_role" }, fn);
  const orderRow = async (id: string) =>
    (await db.su.query("select * from public.orders where id = $1", [id])).rows[0];
  const paymentRow = async (ref: string) =>
    (await db.su.query("select * from public.payments where reference = $1", [ref])).rows[0];

  describe("create_checkout_order — the server is authoritative", () => {
    it("prices every line from the database and adds the delivery fee from the zone", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 2), item(beta, 1)]);
      expect(Number(o.subtotal)).toBe(45.5); // 2×10.00 + 25.50
      expect(Number(o.delivery_fee)).toBe(30.0);
      expect(Number(o.total_amount)).toBe(75.5);
      expect(o.currency).toBe("GHS");
      expect(Number(o.amount_minor)).toBe(7550);
      expect(o.payment_status).toBe("pending");
    });

    it("ignores any client-supplied price (extra fields are not read)", async () => {
      const o = await createOrder(svc, fx.zoneId, [{ ...item(alpha, 1), unit_price: 0.01, price: 0.01, total: 0.01 }]);
      expect(Number(o.subtotal)).toBe(10.0);
    });

    it("applies the free-delivery threshold only when the business configured one", async () => {
      const paid = await createOrder(svc, fx.freeZoneId, [item(alpha, 10)]); // 100.00 ≥ 100.00
      expect(Number(paid.delivery_fee)).toBe(0.0);
      const under = await createOrder(svc, fx.freeZoneId, [item(alpha, 1)]);
      expect(Number(under.delivery_fee)).toBe(30.0);
      const noThreshold = await createOrder(svc, fx.zoneId, [item(alpha, 10)]);
      expect(Number(noThreshold.delivery_fee)).toBe(30.0);
    });

    it("supports pickup zones with a zero fee", async () => {
      const o = await createOrder(svc, fx.pickupZoneId, [item(alpha, 1)]);
      expect(Number(o.total_amount)).toBe(10.0);
    });

    it("merges duplicate lines", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1), item(alpha, 2)]);
      expect(Number(o.subtotal)).toBe(30.0);
      const lines = await db.su.query("select quantity from public.order_items where order_id = $1", [o.order_id]);
      expect(lines.rows).toEqual([{ quantity: 3 }]);
    });

    it("stores a purchase-time snapshot on each line", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(beta, 1)]);
      const r = await db.su.query("select product_title, product_slug, product_sku, snapshot from public.order_items where order_id = $1", [o.order_id]);
      expect(r.rows[0]).toMatchObject({ product_title: "Test test-beta", product_slug: "test-beta", product_sku: "SKU-test-beta" });
      expect(r.rows[0].snapshot).toMatchObject({ title: "Test test-beta", slug: "test-beta" });
    });

    it("is idempotent on the client request id (double-click / retry safe)", async () => {
      const key = uuid();
      const a = await createOrder(svc, fx.zoneId, [item(alpha, 1)], { clientRequestId: key });
      const b = await createOrder(svc, fx.zoneId, [item(alpha, 1)], { clientRequestId: key });
      expect(b.order_id).toBe(a.order_id);
      expect(b.reused).toBe(true);
      const n = await db.su.query("select count(*)::int as n from public.orders where client_request_id = $1", [key]);
      expect(n.rows[0].n).toBe(1);
    });

    it("concurrent submissions with the same key still create exactly one order", async () => {
      const key = uuid();
      const clients = await Promise.all([1, 2, 3, 4].map(() => db.newClient()));
      const results = await Promise.all(clients.map((c) => createOrder(c, fx.zoneId, [item(alpha, 1)], { clientRequestId: key })));
      expect(new Set(results.map((r) => r.order_id)).size).toBe(1);
    });

    it("refuses to hand an existing order to a different user with the same key", async () => {
      const key = uuid();
      const u1 = await createUser(db.su);
      const u2 = await createUser(db.su);
      await createOrder(svc, fx.zoneId, [item(alpha, 1)], { clientRequestId: key, userId: u1 });
      await expect(createOrder(svc, fx.zoneId, [item(alpha, 1)], { clientRequestId: key, userId: u2 })).rejects.toMatchObject({
        message: "IDEMPOTENCY_KEY_CONFLICT",
      });
    });

    const rejects = (items: unknown, code: string, over: Record<string, unknown> = {}, zone = () => fx.zoneId) =>
      expect(createOrder(svc, zone(), items, over)).rejects.toMatchObject({ message: code });

    it("rejects negative, zero, fractional, string and oversized quantities", async () => {
      await rejects([{ product_id: fx.products[alpha].id, quantity: -3 }], "INVALID_ITEMS");
      await rejects([{ product_id: fx.products[alpha].id, quantity: 0 }], "INVALID_ITEMS");
      await rejects([{ product_id: fx.products[alpha].id, quantity: 1.5 }], "INVALID_ITEMS");
      await rejects([{ product_id: fx.products[alpha].id, quantity: "2" }], "INVALID_ITEMS");
      await rejects([{ product_id: fx.products[alpha].id, quantity: 101 }], "INVALID_ITEMS");
      await rejects([{ product_id: fx.products[alpha].id }], "INVALID_ITEMS");
    });

    it("rejects malformed carts", async () => {
      await rejects([], "INVALID_ITEMS");
      await rejects({}, "INVALID_ITEMS");
      await rejects(null, "INVALID_ITEMS");
      await rejects([{ product_id: "not-a-uuid", quantity: 1 }], "INVALID_ITEMS");
      await rejects(["x"], "INVALID_ITEMS");
      await rejects(Array.from({ length: 51 }, () => item(alpha, 1)), "INVALID_ITEMS");
    });

    it("rejects unknown, draft and archived products", async () => {
      await rejects([{ product_id: uuid(), quantity: 1 }], "PRODUCT_UNAVAILABLE");
      await rejects([item(draft, 1)], "PRODUCT_UNAVAILABLE");
      await db.su.query("update public.products set is_active = false, archived_at = now() where id = $1", [fx.products[beta].id]);
      await rejects([item(beta, 1)], "PRODUCT_UNAVAILABLE");
      await db.su.query("update public.products set archived_at = null, is_active = true where id = $1", [fx.products[beta].id]);
    });

    it("rejects quantities above available stock and reports the available amount", async () => {
      const err = await createOrder(svc, fx.zoneId, [item(lastUnit, 2)]).catch((e) => e);
      expect(err.message).toBe("INSUFFICIENT_STOCK");
      expect(err.detail).toBe(`${fx.products[lastUnit].id}|1`);
    });

    it("rejects an unknown or inactive delivery zone", async () => {
      await rejects([item(alpha, 1)], "DELIVERY_ZONE_INVALID", {}, () => uuid());
      await db.su.query("update public.delivery_zones set is_active = false where id = $1", [fx.pickupZoneId]);
      await rejects([item(alpha, 1)], "DELIVERY_ZONE_INVALID", {}, () => fx.pickupZoneId);
      await db.su.query("update public.delivery_zones set is_active = true where id = $1", [fx.pickupZoneId]);
    });

    it("validates customer details", async () => {
      const bad = [
        { name: "A" }, { phone: "abc" }, { phone: "" }, { address: "x" }, { email: "not-an-email" }, { name: "x".repeat(200) },
      ];
      for (const over of bad) {
        await expect(createOrder(svc, fx.zoneId, [item(alpha, 1)], over)).rejects.toMatchObject({ message: "INVALID_CUSTOMER_DETAILS" });
      }
      const noEmail = await createOrder(svc, fx.zoneId, [item(alpha, 1)], { email: null });
      expect(noEmail.order_id).toBeTruthy();
    });

    it("does not reserve or change stock (stock only moves on verified payment)", async () => {
      const before = await stockOf(db.su, fx.products[alpha].id);
      await createOrder(svc, fx.zoneId, [item(alpha, 3)]);
      expect(await stockOf(db.su, fx.products[alpha].id)).toBe(before);
    });
  });

  describe("payment attempts", () => {
    it("creates an 'initiated' attempt whose expected amount comes from the order", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const p = await beginPayment(svc, o.order_id);
      expect(p.status).toBe("initiated");
      expect(Number(p.amount_minor)).toBe(4000);
      expect(p.reused).toBe(false);
    });

    it("reuses a recent open attempt after it has been initialised with Paystack", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const p = await beginPayment(svc, o.order_id);
      await callAs(() => svc.query("select public.mark_payment_initialized($1,'ac_123','https://checkout.example/pay/ac_123')", [p.reference]));
      const again = await beginPayment(svc, o.order_id);
      expect(again.reused).toBe(true);
      expect(again.reference).toBe(p.reference);
      expect(again.authorization_url).toBe("https://checkout.example/pay/ac_123");
    });

    it("blocks a second initialisation while the first is still in flight", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      await beginPayment(svc, o.order_id);
      await expect(beginPayment(svc, o.order_id)).rejects.toMatchObject({ message: "PAYMENT_INIT_IN_PROGRESS" });
    });

    it("supersedes a stale attempt with a new reference", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const first = await beginPayment(svc, o.order_id);
      await db.su.query("update public.payments set created_at = now() - interval '5 minutes' where reference = $1", [first.reference]);
      const second = await beginPayment(svc, o.order_id);
      expect(second.reference).not.toBe(first.reference);
      expect((await paymentRow(first.reference)).status).toBe("abandoned");
    });

    it("rejects malformed references and unpayable orders", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      await expectPgError(
        commitAs(svc, { role: "service_role" }, () => svc.query("select public.begin_payment_attempt($1, 'bad ref!')", [o.order_id])),
        "23514",
      );
      await callAs(() => svc.query("select public.cancel_unpaid_order($1)", [o.order_id]));
      await expect(beginPayment(svc, o.order_id)).rejects.toMatchObject({ message: "ORDER_NOT_PAYABLE" });
    });
  });

  describe("apply_payment_result — success path", () => {
    it("marks the order paid, records the verified amount and decrements stock once", async () => {
      const before = await stockOf(db.su, fx.products[beta].id);
      const o = await createOrder(svc, fx.zoneId, [item(beta, 2)]);
      const p = await beginPayment(svc, o.order_id);
      const r = await applyResult(svc, p.reference, "success", Number(o.amount_minor));
      expect(r).toMatchObject({ outcome: "paid", transitioned: true, payment_status: "paid" });

      const order = await orderRow(o.order_id);
      expect(order.payment_status).toBe("paid");
      expect(order.paid_at).not.toBeNull();
      const pay = await paymentRow(p.reference);
      expect(pay).toMatchObject({ status: "success", paid_currency: "GHS" });
      expect(Number(pay.paid_amount_minor)).toBe(Number(o.amount_minor));
      expect(await stockOf(db.su, fx.products[beta].id)).toBe(before - 2);

      const ledger = await db.su.query(
        "select delta, reason, order_id from public.inventory_movements where order_id = $1",
        [o.order_id],
      );
      expect(ledger.rows).toEqual([{ delta: -2, reason: "sale", order_id: o.order_id }]);
    });

    it("is idempotent: replaying the same success changes nothing", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const p = await beginPayment(svc, o.order_id);
      const before = await stockOf(db.su, fx.products[alpha].id);
      const first = await applyResult(svc, p.reference, "success", Number(o.amount_minor));
      const second = await applyResult(svc, p.reference, "success", Number(o.amount_minor));
      const third = await applyResult(svc, p.reference, "success", Number(o.amount_minor));
      expect(first.transitioned).toBe(true);
      expect(second).toMatchObject({ outcome: "already_success", transitioned: false });
      expect(third.transitioned).toBe(false);
      expect(await stockOf(db.su, fx.products[alpha].id)).toBe(before - 1);
    });

    it("five simultaneous notifications for one payment: exactly one transition, stock decremented once", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 2)]);
      const p = await beginPayment(svc, o.order_id);
      const before = await stockOf(db.su, fx.products[alpha].id);
      const clients = await Promise.all([1, 2, 3, 4, 5].map(() => db.newClient()));
      const results = await Promise.all(clients.map((c) => applyResult(c, p.reference, "success", Number(o.amount_minor))));
      expect(results.filter((r) => r.transitioned).length).toBe(1);
      expect(results.filter((r) => r.outcome === "already_success").length).toBe(4);
      expect(await stockOf(db.su, fx.products[alpha].id)).toBe(before - 2);
    });
  });

  describe("apply_payment_result — never trusts a bad success", () => {
    it("wrong amount → 'review', order NOT paid, stock untouched", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const p = await beginPayment(svc, o.order_id);
      const before = await stockOf(db.su, fx.products[alpha].id);
      const r = await applyResult(svc, p.reference, "success", 100); // customer "paid" GH₵1.00
      expect(r).toMatchObject({ outcome: "mismatch", transitioned: false, payment_status: "review" });
      const order = await orderRow(o.order_id);
      expect(order).toMatchObject({ payment_status: "review", requires_review: true });
      expect(order.paid_at).toBeNull();
      expect((await paymentRow(p.reference)).status).toBe("review");
      expect(await stockOf(db.su, fx.products[alpha].id)).toBe(before);
    });

    it("wrong currency → 'review'", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const p = await beginPayment(svc, o.order_id);
      const r = await applyResult(svc, p.reference, "success", Number(o.amount_minor), "USD");
      expect(r.outcome).toBe("mismatch");
      expect((await orderRow(o.order_id)).payment_status).toBe("review");
    });

    it("missing amount → 'review'", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const p = await beginPayment(svc, o.order_id);
      expect((await applyResult(svc, p.reference, "success", null)).outcome).toBe("mismatch");
    });

    it("an unknown reference changes nothing", async () => {
      expect(await applyResult(svc, "PP-DOES-NOT-EXIST", "success", 100)).toMatchObject({ outcome: "unknown_reference", transitioned: false });
    });

    it("an unknown provider status is rejected loudly", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const p = await beginPayment(svc, o.order_id);
      await expect(applyResult(svc, p.reference, "teleported", 1)).rejects.toMatchObject({ message: "UNKNOWN_PROVIDER_STATUS" });
    });

    it("a second successful payment for an already-paid order is a duplicate charge → review, order stays paid", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const first = await beginPayment(svc, o.order_id);
      await db.su.query("update public.payments set created_at = now() - interval '5 minutes' where reference = $1", [first.reference]);
      const second = await beginPayment(svc, o.order_id);
      const stock = await stockOf(db.su, fx.products[alpha].id);
      expect((await applyResult(svc, first.reference, "success", Number(o.amount_minor))).transitioned).toBe(true);
      const dup = await applyResult(svc, second.reference, "success", Number(o.amount_minor));
      expect(dup).toMatchObject({ outcome: "duplicate_payment", transitioned: false });
      expect((await paymentRow(second.reference)).status).toBe("review");
      expect((await orderRow(o.order_id)).payment_status).toBe("paid");
      expect(await stockOf(db.su, fx.products[alpha].id)).toBe(stock - 1);
    });

    it("money arriving after the order was cancelled → review, no stock movement", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const p = await beginPayment(svc, o.order_id);
      await callAs(() => svc.query("select public.cancel_unpaid_order($1)", [o.order_id]));
      const stock = await stockOf(db.su, fx.products[alpha].id);
      const r = await applyResult(svc, p.reference, "success", Number(o.amount_minor));
      expect(r.outcome).toBe("paid_after_cancellation");
      expect((await orderRow(o.order_id))).toMatchObject({ payment_status: "review", requires_review: true });
      expect(await stockOf(db.su, fx.products[alpha].id)).toBe(stock);
    });
  });

  describe("apply_payment_result — failed, abandoned, cancelled and pending", () => {
    it("failed → order 'failed', can retry with a NEW reference, retry can succeed", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const p1 = await beginPayment(svc, o.order_id);
      const f = await applyResult(svc, p1.reference, "failed", null, null);
      expect(f).toMatchObject({ outcome: "failed", transitioned: false, payment_status: "failed" });
      expect((await orderRow(o.order_id)).payment_status).toBe("failed");

      const p2 = await beginPayment(svc, o.order_id);
      expect(p2.reference).not.toBe(p1.reference);
      expect((await orderRow(o.order_id)).payment_status).toBe("pending");
      expect((await applyResult(svc, p2.reference, "success", Number(o.amount_minor))).transitioned).toBe(true);
    });

    it("a failed notice after success never downgrades a paid order", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const p = await beginPayment(svc, o.order_id);
      await applyResult(svc, p.reference, "success", Number(o.amount_minor));
      const late = await applyResult(svc, p.reference, "failed", null, null);
      expect(late.outcome).toBe("already_success");
      expect((await orderRow(o.order_id)).payment_status).toBe("paid");
      expect((await paymentRow(p.reference)).status).toBe("success");
    });

    it("abandoned and pending never mark an order paid", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const p = await beginPayment(svc, o.order_id);
      expect((await applyResult(svc, p.reference, "ongoing", null, null)).outcome).toBe("pending");
      expect((await paymentRow(p.reference)).status).toBe("pending");
      expect((await applyResult(svc, p.reference, "abandoned", null, null)).outcome).toBe("abandoned");
      expect((await paymentRow(p.reference)).status).toBe("abandoned");
      const order = await orderRow(o.order_id);
      expect(order.payment_status).toBe("pending");
      expect(order.paid_at).toBeNull();
    });

    it("a late success on an abandoned attempt is still honoured (money was taken)", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const p = await beginPayment(svc, o.order_id);
      await applyResult(svc, p.reference, "abandoned", null, null);
      const r = await applyResult(svc, p.reference, "success", Number(o.amount_minor));
      expect(r).toMatchObject({ outcome: "paid", transitioned: true });
    });

    it("cancel_unpaid_order cancels open payments and refuses paid orders", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const p = await beginPayment(svc, o.order_id);
      const c = await callAs(() => svc.query("select public.cancel_unpaid_order($1) as r", [o.order_id]));
      expect(c.rows[0].r.outcome).toBe("cancelled");
      expect((await paymentRow(p.reference)).status).toBe("cancelled");
      expect(await orderRow(o.order_id)).toMatchObject({ payment_status: "cancelled", fulfillment_status: "cancelled" });

      const o2 = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const p2 = await beginPayment(svc, o2.order_id);
      await applyResult(svc, p2.reference, "success", Number(o2.amount_minor));
      const c2 = await callAs(() => svc.query("select public.cancel_unpaid_order($1) as r", [o2.order_id]));
      expect(c2.rows[0].r.outcome).toBe("not_cancellable");
    });

    it("expire_stale_pending_orders cancels only old unpaid orders", async () => {
      const old = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const fresh = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const paid = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const p = await beginPayment(svc, paid.order_id);
      await applyResult(svc, p.reference, "success", Number(paid.amount_minor));
      await db.su.query("update public.orders set created_at = now() - interval '3 days' where id = any($1)", [[old.order_id, paid.order_id]]);
      const n = await callAs(() => svc.query("select public.expire_stale_pending_orders(interval '24 hours') as n"));
      expect(n.rows[0].n).toBeGreaterThanOrEqual(1);
      expect((await orderRow(old.order_id)).payment_status).toBe("cancelled");
      expect((await orderRow(fresh.order_id)).payment_status).toBe("pending");
      expect((await orderRow(paid.order_id)).payment_status).toBe("paid");
      await expectPgError(callAs(() => svc.query("select public.expire_stale_pending_orders(interval '1 minute')")), "P0001");
    });
  });

  describe("inventory under concurrency", () => {
    it("two customers pay for the last unit at the same time: one gets it, the other is held for review, stock never goes negative", async () => {
      const a = await createOrder(svc, fx.zoneId, [item(lastUnit, 1)]);
      const b = await createOrder(svc, fx.zoneId, [item(lastUnit, 1)]);
      const pa = await beginPayment(svc, a.order_id);
      const pb = await beginPayment(svc, b.order_id);
      const [c1, c2] = await Promise.all([db.newClient(), db.newClient()]);
      const [ra, rb] = await Promise.all([
        applyResult(c1, pa.reference, "success", Number(a.amount_minor)),
        applyResult(c2, pb.reference, "success", Number(b.amount_minor)),
      ]);
      expect(await stockOf(db.su, fx.products[lastUnit].id)).toBe(0);
      const shortfalls = [ra, rb].filter((r) => (r.shortfalls?.length ?? 0) > 0);
      expect(shortfalls.length).toBe(1);
      const loserId = shortfalls[0].order_id!;
      const loser = await orderRow(loserId);
      expect(loser).toMatchObject({ payment_status: "paid", requires_review: true, fulfillment_status: "on_hold" });
      const note = (await db.su.query("select review_note from public.payments where order_id = $1", [loserId])).rows[0].review_note;
      expect(note).toContain("insufficient");
      const winners = [a.order_id, b.order_id].filter((id) => id !== loserId);
      expect((await orderRow(winners[0])).requires_review).toBe(false);
    });

    it("many simultaneous buyers never oversell: sold units == initial stock", async () => {
      const p = await insertProduct(db.su, { categoryId: fx.categoryId, title: "Scarce", slug: "scarce-item", price: 10, stock: 3 });
      const orders: Awaited<ReturnType<typeof createOrder>>[] = [];
      const pays: Awaited<ReturnType<typeof beginPayment>>[] = [];
      for (let i = 0; i < 8; i++) {
        // sequential on purpose: one connection cannot interleave transactions
        const o = await createOrder(svc, fx.zoneId, [{ product_id: p, quantity: 1 }]);
        orders.push(o);
        pays.push(await beginPayment(svc, o.order_id));
      }
      const clients = await Promise.all(pays.map(() => db.newClient()));
      const results = await Promise.all(pays.map((pay, i) => applyResult(clients[i], pay.reference, "success", Number(orders[i].amount_minor))));
      expect(results.every((r) => r.transitioned)).toBe(true); // all 8 were charged
      expect(await stockOf(db.su, p)).toBe(0);
      expect(results.filter((r) => (r.shortfalls?.length ?? 0) > 0).length).toBe(5); // 5 held for review
      const sold = await db.su.query("select coalesce(-sum(delta),0)::int as n from public.inventory_movements where product_id = $1 and reason = 'sale'", [p]);
      expect(sold.rows[0].n).toBe(3);
    });
  });

  describe("webhook ledger (record_payment_event)", () => {
    const rec = (key: string) =>
      callAs(() => svc.query("select public.record_payment_event($1,'charge.success','PP-LEDGER-1','{\"a\":1}'::jsonb) as r", [key]));

    it("first delivery is new; a duplicate of an unfinished event may be retried; a finished one is skipped", async () => {
      const key = `charge.success:${uuid()}:success`;
      const first = (await rec(key)).rows[0].r;
      expect(first.already_processed).toBe(false);

      const retry = (await rec(key)).rows[0].r; // crashed before completion → process again
      expect(retry.event_id).toBe(first.event_id);
      expect(retry.already_processed).toBe(false);

      await callAs(() => svc.query("select public.complete_payment_event($1,'processed')", [first.event_id]));
      const dup = (await rec(key)).rows[0].r;
      expect(dup).toMatchObject({ event_id: first.event_id, already_processed: true });

      const count = await db.su.query("select count(*)::int as n, max(attempts) as attempts from public.payment_events where dedupe_key = $1", [key]);
      expect(count.rows[0].n).toBe(1);
      expect(count.rows[0].attempts).toBe(3);
    });

    it("concurrent identical deliveries produce a single ledger row", async () => {
      const key = `charge.success:${uuid()}:success`;
      const clients = await Promise.all([1, 2, 3, 4].map(() => db.newClient()));
      await Promise.all(clients.map((c) => commitAs(c, { role: "service_role" }, () =>
        c.query("select public.record_payment_event($1,'charge.success','PP-LEDGER-2','{}'::jsonb)", [key]))));
      const n = await db.su.query("select count(*)::int as n from public.payment_events where dedupe_key = $1", [key]);
      expect(n.rows[0].n).toBe(1);
    });

    it("the ledger rejects deletes by the application role", async () => {
      await expectPgError(callAs(() => svc.query("delete from public.payment_events")), "42501");
    });
  });

  describe("send-once transactional e-mail", () => {
    it("only one caller wins the claim; failures can be retried; sent mail is never re-sent", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const claim = async () =>
        (await callAs(() => svc.query("select public.claim_email('order_confirmation', $1, 'a@b.co') as ok", [o.order_id]))).rows[0].ok as boolean;
      const finish = (status: string) =>
        callAs(() => svc.query("select public.finish_email('order_confirmation', $1, $2, 'msg_1', null)", [o.order_id, status]));

      expect(await claim()).toBe(true);
      expect(await claim()).toBe(false); // someone is already sending
      await finish("failed");
      expect(await claim()).toBe(true); // retry after failure
      await finish("sent");
      expect(await claim()).toBe(false); // never again
    });

    it("concurrent claimers: exactly one wins", async () => {
      const o = await createOrder(svc, fx.zoneId, [item(alpha, 1)]);
      const clients = await Promise.all([1, 2, 3, 4, 5].map(() => db.newClient()));
      const wins = await Promise.all(clients.map(async (c) =>
        (await commitAs(c, { role: "service_role" }, () => c.query("select public.claim_email('order_confirmation', $1, 'a@b.co') as ok", [o.order_id]))).rows[0].ok as boolean));
      expect(wins.filter(Boolean).length).toBe(1);
    });
  });

  it("customer fixtures helper stays in sync with the RPC argument list", () => {
    expect(Object.keys(customerArgs())).toEqual(["clientRequestId", "userId", "name", "phone", "email", "address", "notes"]);
  });
});
