// The PayPal adapter behind core's PaymentPort (ADR 0002). Lives in server/ so
// no SDK and no secret can reach the browser bundle. Reading an order and refunding a capture go through PayPal's Agent
// Toolkit (ADR 0010), as a client library: its tools are never handed to the model. Create, capture, authorize, capture
// an authorization and void stay plain REST: Toolkit 1.11.0 has no authorize, capture-authorization or void tool, and
// its capture can't send the demo's PayPal-Mock-Response header. This is the only file that imports the Toolkit.
// Sandbox only, by hard rule: the constructor refuses anything else.

import type { Authorization, BoundCart, OrderSnapshot, PaymentIntent } from "./cart.ts";
import type { PaymentPort } from "./guard.ts";
import { fromCents, toCents, type Cents } from "./money.ts";
import { orderRequestId } from "./undo.ts";
import type { WebhookHeaders } from "./webhook.ts";

const SANDBOX = "https://api-m.sandbox.paypal.com";
/** The name PayPal's approval page shows the shopper, in place of the sandbox app's own name ("Test Store"). */
export const BRAND_NAME = "Gilded Goose";
/**
 * Every PayPal call gives up after this long: a hung read then throws into the guard's "PayPal didn't answer" refusal,
 * which releases the cart's hold, instead of leaving the hold counted against the week.
 */
export const PAYPAL_TIMEOUT_MS = 10_000;

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  environment: string;
  /** For the demo's decline beat: a PayPal-Mock-Response code sent on capture. */
  mockOnCapture?: string;
  /** The sandbox webhook's id from PayPal's dashboard (an id, not a secret): webhooks are verified against it. */
  webhookId?: string;
  /** The Toolkit's two tools; tests pass their own. Left out, it's PayPal's Agent Toolkit with these credentials. */
  toolkit?: ToolkitCalls;
}

/**
 * The only Toolkit actions Goose turns on (ADR 0010), six tools: get_order, create_refund, (PayPal additions 1, Joshua
 * Oct 29) create_shipment_tracking and get_shipment_tracking, (additions 2) list_disputes and (additions 3)
 * list_transactions. Nothing else; core/test/toolkit.test.ts (toolkit_exposes_six_tools) holds the list.
 */
export const TOOLKIT_ACTIONS = { orders: { get: true }, payments: { createRefund: true }, shipment: { create: true, get: true }, disputes: { list: true }, transactions: { list: true } };
/**
 * The Toolkit keeps its access token on the instance forever, so the reading instance is rebuilt this often, well inside a
 * sandbox token's life. Each refund gets an instance of its own, because PayPal-Request-Id rides in the instance's context.
 */
export const TOOLKIT_READER_MS = 30 * 60_000;

/** Goose's two Toolkit calls, each answering the tool's own JSON text, as the Toolkit's run() gives it. */
export interface ToolkitCalls {
  getOrder(orderId: string): Promise<string>;
  createRefund(captureId: string, requestId: string): Promise<string>;
  /** PayPal additions 1: the seller's tracking for a capture (`transaction_id`), through create_shipment_tracking. */
  createShipment?(captureId: string, trackingNumber: string, carrier: string): Promise<string>;
  /** PayPal additions 1: the tracking PayPal holds for a capture, read back through get_shipment_tracking. */
  getShipment?(captureId: string): Promise<string>;
  /** PayPal additions 2: the disputes PayPal holds on a capture (`disputed_transaction_id`), through list_disputes. */
  listDisputes?(captureId: string): Promise<string>;
  /** PayPal additions 3: PayPal's transaction report between two ISO times, through list_transactions. */
  listTransactions?(startIso: string, endIso: string): Promise<string>;
}
/** One Toolkit instance, as Goose uses it: the names of the tools it turned on, and a way to run one by name. */
export interface ToolkitInstance { tools: string[]; run(name: string, args: object): Promise<unknown> }
/** Builds a Toolkit instance for one context (the real one imports @paypal/agent-toolkit). */
export type ToolkitMaker = (context: { sandbox: true; request_id?: string }) => Promise<ToolkitInstance>;

// The Toolkit's plain entry, `/openai`: unlike `/ai-sdk`, `/langchain` and `/mcp`, it loads no AI framework at run time,
// so pnpm-workspace.yaml leaves those out of the install. Only its tool-call shape is OpenAI's; no OpenAI code runs.
let toolkitModule: Promise<typeof import("@paypal/agent-toolkit/openai")> | null = null;
/** Loaded once, on first use: the import takes a moment, so the server boots and the tests run without it. */
const loadToolkit = () => (toolkitModule ??= import("@paypal/agent-toolkit/openai"));

/** PayPal's Agent Toolkit with these credentials, in sandbox, with only TOOLKIT_ACTIONS turned on. */
export function realToolkitMaker(clientId: string, clientSecret: string): ToolkitMaker {
  return async (context) => {
    const { PayPalAgentToolkit } = await loadToolkit();
    const kit = new PayPalAgentToolkit({ clientId, clientSecret, configuration: { actions: TOOLKIT_ACTIONS, context } });
    return {
      tools: kit.getTools().map((t: { function: { name: string } }) => t.function.name),
      // handleToolCall runs any tool by name, turned on or not, so toolkitOf checks the name against `tools` first.
      run: async (name, args) => (await kit.handleToolCall({ id: "goose", type: "function", function: { name, arguments: JSON.stringify(args) } } as never)).content,
    };
  };
}

/** Goose's two calls on top of a ToolkitMaker: one reading instance, rebuilt every TOOLKIT_READER_MS; one instance per refund. */
export function toolkitOf(make: ToolkitMaker, now: () => number = Date.now): ToolkitCalls {
  let reader: { at: number; kit: Promise<ToolkitInstance> } | null = null;
  const run = async (instance: Promise<ToolkitInstance>, name: string, args: object): Promise<string> => {
    const kit = await instance;
    if (!kit.tools.includes(name)) throw new Error(`paypal toolkit: no ${name} tool`);
    return String(await kit.run(name, args));
  };
  return {
    getOrder(orderId) {
      if (!reader || now() - reader.at >= TOOLKIT_READER_MS) {
        const mine = { at: now(), kit: make({ sandbox: true }) };
        // A failed build (the import, say) isn't kept for half an hour: the next read builds again.
        mine.kit.catch(() => { if (reader === mine) reader = null; });
        reader = mine;
      }
      return run(reader.kit, "get_order", { id: orderId });
    },
    createRefund(captureId, requestId) {
      return run(make({ sandbox: true, request_id: requestId }), "create_refund", { capture_id: captureId });
    },
    createShipment(captureId, trackingNumber, carrier) {
      return run(make({ sandbox: true }), "create_shipment_tracking", { transaction_id: captureId, tracking_number: trackingNumber, carrier, status: "SHIPPED" });
    },
    getShipment(captureId) {
      return run(make({ sandbox: true }), "get_shipment_tracking", { transaction_id: captureId });
    },
    listDisputes(captureId) {
      return run(make({ sandbox: true }), "list_disputes", { disputed_transaction_id: captureId });
    },
    // Never by `transaction_id`: in that mode the Toolkit 1.11.0 searches month by month and swallows each error, so a
    // refused report reads as "not found". By dates, PayPal's error comes back as one.
    listTransactions(startIso, endIso) {
      return run(make({ sandbox: true }), "list_transactions", { start_date: startIso, end_date: endIso, transaction_status: "S", page_size: 500 });
    },
  };
}

export class PayPalPort implements PaymentPort, ShippingPort, DisputesPort, ReportPort {
  private token: { value: string; expiresAt: number } | null = null;
  private readonly cfg: PayPalConfig;
  private readonly toolkit: ToolkitCalls;

  constructor(cfg: PayPalConfig) {
    this.cfg = cfg;
    if (cfg.environment.toUpperCase() !== "SANDBOX") throw new Error("hard rule: PayPal sandbox only");
    if (!cfg.clientId || !cfg.clientSecret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing from .env");
    if (cfg.toolkit) this.toolkit = cfg.toolkit;
    else {
      this.toolkit = toolkitOf(realToolkitMaker(cfg.clientId, cfg.clientSecret));
      loadToolkit().catch(() => undefined); // warm now, so the first payment doesn't wait for the import; a failure shows on first use
    }
  }

  static fromEnv(env: NodeJS.ProcessEnv, extra: Partial<PayPalConfig> = {}): PayPalPort {
    return new PayPalPort({ clientId: env.PAYPAL_CLIENT_ID ?? "", clientSecret: env.PAYPAL_CLIENT_SECRET ?? "", environment: env.PAYPAL_ENVIRONMENT ?? "", ...(env.PAYPAL_WEBHOOK_ID ? { webhookId: env.PAYPAL_WEBHOOK_ID } : {}), ...extra });
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 60_000) return this.token.value;
    const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64");
    const r = await fetch(`${SANDBOX}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(PAYPAL_TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`paypal oauth ${r.status}`);
    const j = (await r.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  }

  /** `body` is sent as JSON; a `RawJson` body is sent as its text, already JSON (the webhook postback's event). */
  private async call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; json: any }> {
    const sent = body === undefined ? undefined : body instanceof RawJson ? body.text : JSON.stringify(body);
    const r = await fetch(`${SANDBOX}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": "application/json", "PayPal-Request-Id": `goose-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...extra },
      ...(sent === undefined ? {} : { body: sent }),
      signal: AbortSignal.timeout(PAYPAL_TIMEOUT_MS),
    });
    const text = await r.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { status: r.status, json };
  }

  /** The amount comes from the bound cart, never from any text; the cart hash rides in custom_id. */
  async create(b: BoundCart, returnUrl: string, intent: PaymentIntent = "CAPTURE"): Promise<{ orderId: string; approveUrl: string }> {
    const res = await this.call("POST", "/v2/checkout/orders", {
      intent,
      purchase_units: [{ reference_id: "goose", custom_id: b.hash, description: b.cart.item.slice(0, 127), amount: { currency_code: b.cart.currency, value: fromCents(b.cart.price) }, ...(b.cart.payee === undefined ? {} : { payee: { merchant_id: b.cart.payee } }) }],
      payment_source: { paypal: { experience_context: { brand_name: BRAND_NAME, user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", return_url: returnUrl, cancel_url: returnUrl + (returnUrl.includes("?") ? "&" : "?") + "cancel=1" } } },
    }, { "PayPal-Request-Id": orderRequestId(b.hash) }); // one id per bound cart: a retried create returns the same order
    if (res.status !== 200 && res.status !== 201) throw new Error(`paypal create ${res.status}: ${issueOf(res.json)}`);
    const approve = (res.json.links as { rel: string; href: string }[]).find((l) => l.rel === "payer-action" || l.rel === "approve");
    if (!approve) throw new Error("paypal create: no approve link");
    return { orderId: idOf(res.json.id), approveUrl: approve.href };
  }

  /** Through the Toolkit's get_order. It pastes the id into the URL as it is, so a bent id throws here, before any call. */
  async get(orderId: string): Promise<OrderSnapshot> {
    const json = toolReply(await withTimeout(this.toolkit.getOrder(idOf(orderId)), "get"), "get");
    const pu = json.purchase_units?.[0] ?? {};
    const auth = pu.payments?.authorizations?.[0];
    // The capture's id once PayPal took the money: Undo's refund when the capture's own reply was lost. Read like every id
    // (letters, digits, dashes), and left out when unreadable, so a bent capture id never breaks reading the order.
    const captureId = optionalId(pu.payments?.captures?.[0]?.id);
    return {
      id: json.id, status: json.status, amount: amountOf(pu.amount), currency: String(pu.amount?.currency_code ?? ""), customId: pu.custom_id,
      ...(pu.payee?.merchant_id === undefined ? {} : { payee: String(pu.payee.merchant_id) }),
      ...(json.intent === undefined ? {} : { intent: String(json.intent) }),
      ...(auth === undefined ? {} : { authorization: authorizationOf(auth) }),
      ...(captureId === undefined ? {} : { captureId }),
    };
  }

  async capture(orderId: string): Promise<{ status: string; captureId: string }> {
    const extra = this.cfg.mockOnCapture ? { "PayPal-Mock-Response": JSON.stringify({ mock_application_codes: this.cfg.mockOnCapture }) } : {};
    const res = await this.call("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, extra);
    if (res.status !== 201) throw new Error(issueOf(res.json));
    // The capture's own status, not the order's: an order can read COMPLETED while its capture is still PENDING. No
    // capture in the reply is no status, which the guard never reads as paid.
    const cap = res.json.purchase_units?.[0]?.payments?.captures?.[0];
    return { status: String(cap?.status ?? ""), captureId: cap?.id === undefined ? "" : idOf(cap.id) };
  }

  /** AUTHORIZE (021 §4 item 4): PayPal holds the approved order's money. REST: Agent Toolkit 1.11.0 has no authorize tool. */
  async authorize(orderId: string, requestId: string): Promise<Authorization> {
    const res = await this.call("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {}, { "PayPal-Request-Id": requestId, Prefer: "return=representation" });
    if (res.status !== 200 && res.status !== 201) throw new Error(issueOf(res.json));
    const auth = res.json.purchase_units?.[0]?.payments?.authorizations?.[0];
    if (!auth) throw new Error("paypal authorize: no authorization in the reply");
    return authorizationOf(auth);
  }

  /**
   * Capture exactly `amount` of an authorization, `final` so PayPal closes it to any later capture. The amount is sent,
   * never left to PayPal's default (the whole authorization). REST: Agent Toolkit 1.11.0 has no capture-authorization tool.
   */
  async captureAuthorization(authorizationId: string, req: { amount: Cents; currency: string; final: boolean; requestId: string }): Promise<{ status: string; captureId: string; amount: Cents; currency: string }> {
    const res = await this.call("POST", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`, { amount: { currency_code: req.currency, value: fromCents(req.amount) }, final_capture: req.final }, { "PayPal-Request-Id": req.requestId, Prefer: "return=representation" });
    if (res.status !== 200 && res.status !== 201) throw new Error(issueOf(res.json));
    return { status: String(res.json.status), captureId: idOf(res.json.id), amount: amountOf(res.json.amount), currency: String(res.json.amount?.currency_code ?? "") };
  }

  /** Release the hold. REST: Agent Toolkit 1.11.0 has no void tool. PayPal answers 204 (or 200 with the voided body). */
  async voidAuthorization(authorizationId: string, requestId: string): Promise<{ status: string }> {
    const res = await this.call("POST", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, undefined, { "PayPal-Request-Id": requestId });
    if (res.status !== 200 && res.status !== 204) throw new Error(issueOf(res.json));
    return { status: "VOIDED" };
  }

  /**
   * 021 §4 item 6: ask PayPal whether it signed this webhook (POST /v1/notifications/verify-webhook-signature,
   * docs/claims.md). REST: the Toolkit has no such tool. The event goes back exactly as it arrived, spliced in as text and
   * never re-serialized, since the signature covers those bytes. PayPal checks `cert_url` itself, so this server never
   * fetches a URL a request names. True only on "SUCCESS"; any other answer or status is false, and a call that fails
   * throws, so the route can answer PayPal "try again" instead of "forged".
   */
  async verifyWebhook(h: WebhookHeaders, rawBody: string): Promise<boolean> {
    if (!this.cfg.webhookId) throw new Error("paypal webhook: PAYPAL_WEBHOOK_ID isn't set");
    const head = JSON.stringify({ auth_algo: h.authAlgo, cert_url: h.certUrl, transmission_id: h.transmissionId, transmission_sig: h.transmissionSig, transmission_time: h.transmissionTime, webhook_id: this.cfg.webhookId });
    const res = await this.call("POST", "/v1/notifications/verify-webhook-signature", new RawJson(`${head.slice(0, -1)},"webhook_event":${rawBody}}`));
    if (res.status >= 500) throw new Error(`paypal webhook verify ${res.status}`);
    return res.status === 200 && res.json?.verification_status === "SUCCESS";
  }

  /**
   * Refund a capture in full (Undo, H2), through the Toolkit's create_refund. `requestId` goes out as PayPal-Request-Id,
   * fixed per run by the caller, so PayPal answers a retry with the first refund instead of making a second one: that is
   * also why a refund that timed out here is safe to ask for again. The capture id is the server's own, checked like every
   * id before it reaches the Toolkit's URL. The refund id goes into a row's words, so an unreadable one is left out.
   */
  async refund(captureId: string, requestId: string): Promise<RefundReply> {
    const json = toolReply(await withTimeout(this.toolkit.createRefund(idOf(captureId), idOf(requestId)), "refund"), "refund");
    return { status: String(json.status ?? ""), refundId: optionalId(json.id) ?? "" };
  }

  /**
   * PayPal additions 1: give PayPal the seller's tracking for a capture (create_shipment_tracking), then read back what
   * PayPal holds for it (get_shipment_tracking). The batch answers 200 even when it took no tracker, so only the read
   * back says it was held. Ids and the tracking number are checked before they reach the Toolkit's URL or body.
   */
  async ship(captureId: string, trackingNumber: string, carrier: string): Promise<ShipmentReply> {
    const { createShipment, getShipment } = this.toolkit;
    if (!createShipment || !getShipment) throw new Error("paypal toolkit: no shipment tools");
    toolReply(await withTimeout(createShipment(idOf(captureId), idOf(trackingNumber), idOf(carrier)), "ship"), "ship");
    const json = toolReply(await withTimeout(getShipment(idOf(captureId)), "tracking"), "tracking");
    const all: unknown[] = Array.isArray(json.trackers) ? json.trackers : [json];
    const mine = all.find((t) => typeof t === "object" && t !== null && (t as { tracking_number?: unknown }).tracking_number === trackingNumber) as { status?: unknown } | undefined;
    return mine ? { held: true, status: trackerStatus(mine.status) } : { held: false, status: null };
  }

  /**
   * PayPal additions 2: the disputes PayPal holds on one capture (list_disputes, filtered by the capture id), each as
   * its documented status and reason words or null, never PayPal's text. The sandbox spike (Oct 29) found list_disputes
   * answers for this app; get_dispute is not used (each listed item already carries its status and reason).
   */
  async disputes(captureId: string): Promise<DisputeReply[]> {
    const { listDisputes } = this.toolkit;
    if (!listDisputes) throw new Error("paypal toolkit: no dispute tools");
    const json = toolReply(await withTimeout(listDisputes(idOf(captureId)), "disputes"), "disputes");
    if (!Array.isArray(json.items)) throw new Error("paypal disputes: no items list");
    return json.items.slice(0, 50).map((d: unknown) => {
      const o = (typeof d === "object" && d !== null ? d : {}) as { status?: unknown; reason?: unknown };
      return { status: disputeStatus(o.status), reason: disputeReason(o.reason) };
    });
  }

  /**
   * PayPal additions 3: what PayPal's transaction report lists for one capture, from `since` to `now` (list_transactions,
   * one page of up to 500 completed transactions; the report allows 31 days). The capture is found by its id here, and its
   * amount and currency kept only when well formed. `complete` is false when the page didn't hold everything and the
   * capture wasn't on it, so "not listed" is never said from a partial page.
   */
  async reported(captureId: string, since: number, now: number): Promise<ReportReply> {
    const { listTransactions } = this.toolkit;
    if (!listTransactions) throw new Error("paypal toolkit: no transaction report tool");
    const id = idOf(captureId);
    const start = new Date(Math.max(since, now - 31 * 86_400_000) - 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const end = new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
    const json = toolReply(await withTimeout(listTransactions(start, end), "report"), "report");
    if (!Array.isArray(json.transaction_details)) throw new Error("paypal report: no transaction list");
    const info = json.transaction_details.map((d: unknown) => (typeof d === "object" && d !== null ? (d as { transaction_info?: unknown }).transaction_info : null));
    const mine = info.find((i: unknown) => typeof i === "object" && i !== null && (i as { transaction_id?: unknown }).transaction_id === id) as { transaction_amount?: { value?: unknown; currency_code?: unknown } } | undefined;
    if (!mine) return { listed: false, amount: null, currency: null, complete: !(typeof json.total_pages === "number" && json.total_pages > 1) };
    const value = mine.transaction_amount?.value, code = mine.transaction_amount?.currency_code;
    return { listed: true, amount: typeof value === "string" && /^\d{1,9}\.\d{2}$/.test(value) ? value : null, currency: typeof code === "string" && /^[A-Z]{3}$/.test(code) ? code : null, complete: true };
  }
}

export interface RefundReply { status: string; refundId: string }

/**
 * PayPal additions 1: what PayPal holds for the seller's tracking, read back after it was given. `status` is PayPal's
 * tracker status when it is one of the four it documents, else null (never PayPal's text). `held` is false when PayPal
 * took no tracker for this capture.
 */
export interface ShipmentReply { held: boolean; status: "SHIPPED" | "ON_HOLD" | "DELIVERED" | "CANCELLED" | null }
/** A port that can hand PayPal a seller's tracking (PayPalPort, and the fake port in tests). */
export interface ShippingPort { ship(captureId: string, trackingNumber: string, carrier: string): Promise<ShipmentReply> }
const TRACKER_STATUS = new Set(["SHIPPED", "ON_HOLD", "DELIVERED", "CANCELLED"]);
/** A tracker's status from PayPal's reply, or null: only the four documented words, never other text. */
export function trackerStatus(v: unknown): ShipmentReply["status"] {
  return typeof v === "string" && TRACKER_STATUS.has(v) ? (v as ShipmentReply["status"]) : null;
}

/**
 * PayPal additions 2: one dispute PayPal holds on a capture. `status` and `reason` are PayPal's documented words when
 * they are ones we name, else null; never PayPal's text.
 */
export interface DisputeReply {
  status: "OPEN" | "WAITING_FOR_BUYER_RESPONSE" | "WAITING_FOR_SELLER_RESPONSE" | "UNDER_REVIEW" | "RESOLVED" | null;
  reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED" | "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED" | null;
}
/** A port that can say which disputes PayPal holds on a capture (PayPalPort, and the fake port in tests). */
export interface DisputesPort { disputes(captureId: string): Promise<DisputeReply[]> }
const DISPUTE_STATUS = new Set(["OPEN", "WAITING_FOR_BUYER_RESPONSE", "WAITING_FOR_SELLER_RESPONSE", "UNDER_REVIEW", "RESOLVED"]);
const DISPUTE_REASON = new Set(["MERCHANDISE_OR_SERVICE_NOT_RECEIVED", "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED"]);
/** A dispute's status from PayPal's reply, or null: only the words we name, never other text. */
export const disputeStatus = (v: unknown): DisputeReply["status"] => (typeof v === "string" && DISPUTE_STATUS.has(v) ? (v as DisputeReply["status"]) : null);
/** A dispute's reason from PayPal's reply, or null (another reason, said as such). */
export const disputeReason = (v: unknown): DisputeReply["reason"] => (typeof v === "string" && DISPUTE_REASON.has(v) ? (v as DisputeReply["reason"]) : null);

/**
 * PayPal additions 3: what PayPal's transaction report says of one capture. `listed`: it is on the report. `amount` and
 * `currency`: PayPal's, when well formed, else null. `complete`: the report page held everything asked for.
 */
export interface ReportReply { listed: boolean; amount: string | null; currency: string | null; complete: boolean }
/** A port that can read PayPal's transaction report (PayPalPort, and the fake port in tests). */
export interface ReportPort { reported(captureId: string, since: number, now: number): Promise<ReportReply> }

/** A request body that is already JSON text, sent as it is. */
class RawJson { readonly text: string; constructor(text: string) { this.text = text; } }

/** A Toolkit call that hasn't answered in PAYPAL_TIMEOUT_MS throws, like a REST call (the Toolkit's axios has no timeout). */
function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`paypal ${what}: no answer in ${PAYPAL_TIMEOUT_MS} ms`)), PAYPAL_TIMEOUT_MS); });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}
/**
 * A Toolkit tool's JSON text, as PayPal's object. The Toolkit never throws: a PayPal error comes back as
 * {ok:false,status,code,message} and anything else as {error:{…}}, so both throw here, as does text that isn't an object.
 * The message is PayPal's, for the server log only: Undo and the guard write fixed words (Lesson 15).
 */
function toolReply(text: string, what: string): any {
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`paypal ${what}: unreadable reply`); }
  if (json === null || typeof json !== "object" || Array.isArray(json)) throw new Error(`paypal ${what}: unreadable reply`);
  if (json.ok === false) throw new Error(`paypal ${what} ${String(json.status ?? "?")}: ${String(json.code ?? "UNKNOWN")} ${String(json.message ?? "").slice(0, 200)}`);
  if (json.error !== undefined) throw new Error(`paypal ${what}: ${String(json.error?.type ?? "error")} ${String(json.error?.message ?? "").slice(0, 200)}`);
  return json;
}
/** PayPal's authorization object, as the guard reads it: the amount in cents, never PayPal's text. */
function authorizationOf(a: any): Authorization {
  return { id: idOf(a.id), status: String(a.status ?? ""), amount: amountOf(a.amount), currency: String(a.amount?.currency_code ?? "") };
}
/**
 * A PayPal id, as the guard writes it into a ledger row's words (Fable F2, Lesson 15): letters, digits and dashes only, as
 * PayPal's are. Anything else throws, so a reply carrying text where an id should be is a reply we can't read, never words.
 */
function idOf(v: unknown): string {
  const s = String(v ?? "");
  if (!/^[A-Za-z0-9-]{1,64}$/.test(s)) throw new Error("paypal: unreadable id in the reply");
  return s;
}
/** An id read like idOf, or undefined when unreadable: for ids a reply may lack without being unreadable. */
function optionalId(v: unknown): string | undefined {
  return typeof v === "string" && /^[A-Za-z0-9-]{1,64}$/.test(v) ? v : undefined;
}
/**
 * PayPal's amount in cents, or NaN when the reply carries none or an unreadable one: never 0, which would log a capture
 * as $0.00 and leave the week under-counted. NaN equals no amount, so the guard can't read it as the cart's.
 */
function amountOf(a: any): Cents {
  try { return a?.value === undefined ? Number.NaN : toCents(String(a.value)); } catch { return Number.NaN; }
}
/** PayPal's machine-readable issue code (ORDER_NOT_APPROVED, INSTRUMENT_DECLINED…), or the top-level name. */
export function issueOf(json: any): string {
  return String(json?.details?.[0]?.issue ?? json?.name ?? "UNKNOWN");
}
