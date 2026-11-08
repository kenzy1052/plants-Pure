/** Browser-side helper for the admin API. Always resolves; never throws on HTTP errors. */
export type ApiOk<T> = { ok: true; data: T };
export type ApiFail = { ok: false; status: number; code: string; message: string; fields: Record<string, string[]>; messages: string[] };
export type ApiResult<T> = ApiOk<T> | ApiFail;

export async function adminFetch<T = unknown>(method: "POST" | "PATCH" | "DELETE" | "GET", url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data: T }
      | { ok: false; error?: { code?: string; message?: string; details?: { messages?: string[]; field?: string } & Record<string, unknown> } }
      | null;
    if (res.ok && json && json.ok) return { ok: true, data: json.data };
    const err = json && json.ok === false ? json.error : undefined;
    const details = (err?.details ?? {}) as Record<string, unknown>;
    const fields: Record<string, string[]> = {};
    if (err?.code === "validation_failed") {
      for (const [k, v] of Object.entries(details)) if (Array.isArray(v) && v.every((x) => typeof x === "string")) fields[k] = v as string[];
    } else if (typeof details.field === "string") {
      fields[details.field] = [err?.message ?? "Invalid value."];
    }
    return {
      ok: false,
      status: res.status,
      code: err?.code ?? "network",
      message: err?.message ?? (res.status === 401 ? "Your session has ended. Sign in again." : "Something went wrong. Please try again."),
      fields,
      messages: Array.isArray(details.messages) ? (details.messages as string[]) : [],
    };
  } catch {
    return { ok: false, status: 0, code: "network", message: "Could not reach the server. Check your connection and try again.", fields: {}, messages: [] };
  }
}
