const COOKIE = "laundry_session";
const SESSION_MS = 12 * 60 * 60 * 1000;
const METHODS = ["Cash", "UPI", "Card"];
const fails = new Map();

function json(data, status = 200, extraHeaders) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (extraHeaders) Object.assign(headers, extraHeaders);
  return new Response(JSON.stringify(data), { status, headers });
}

function configured(env) {
  return Boolean(env.LAUNDRY_USER && env.LAUNDRY_PASSWORD && env.LAUNDRY_SESSION_SECRET);
}

function readCookie(header, name) {
  if (!header) return "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return ""; }
    }
  }
  return "";
}

function bytesToB64url(bytes) {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

function bytesEqual(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

async function sameSecret(input, secret) {
  const left = await sha256(`wash:${input}`);
  const right = await sha256(`wash:${secret}`);
  return bytesEqual(left, right);
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return bytesToB64url(sig);
}

async function fingerprint(env) {
  const digest = await sha256(`fp:${env.LAUNDRY_USER}\n${env.LAUNDRY_PASSWORD}`);
  return bytesToB64url(digest).slice(0, 16);
}

function safeEqualText(left, right) {
  return bytesEqual(new TextEncoder().encode(left), new TextEncoder().encode(right));
}

async function makeToken(env) {
  const exp = Date.now() + SESSION_MS;
  const fp = await fingerprint(env);
  const body = `v1.${exp}.${fp}`;
  return `${body}.${await hmac(env.LAUNDRY_SESSION_SECRET, body)}`;
}

async function sessionValid(request, env) {
  if (!configured(env)) return false;
  const token = readCookie(request.headers.get("cookie"), COOKIE);
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isSafeInteger(exp) || exp < Date.now() || exp - Date.now() > SESSION_MS + 60_000) return false;
  if (!safeEqualText(parts[2], await fingerprint(env))) return false;
  const expected = await hmac(env.LAUNDRY_SESSION_SECRET, `v1.${parts[1]}.${parts[2]}`);
  return safeEqualText(parts[3], expected);
}

function cookie(token, secure) {
  const bits = [`${COOKIE}=${encodeURIComponent(token)}`, "HttpOnly", "Path=/", "SameSite=Lax", `Max-Age=${SESSION_MS / 1000}`];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

function clearCookie(secure) {
  const bits = [`${COOKIE}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

function tooMany(ip) {
  const now = Date.now();
  const recent = (fails.get(ip) || []).filter((stamp) => now - stamp < 15 * 60 * 1000);
  fails.set(ip, recent);
  return recent.length >= 8;
}

function noteFail(ip) {
  const recent = fails.get(ip) || [];
  recent.push(Date.now());
  fails.set(ip, recent);
}

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 2000 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function toPaise(value) {
  const raw = typeof value === "number" ? String(value) : String(value ?? "").trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const [whole, frac = ""] = raw.split(".");
  const paise = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(paise) || paise > 1_000_000_000) return null;
  return paise;
}

function text(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function saleOut(row) {
  return {
    id: row.id,
    date: row.occurred_on,
    customer: row.customer,
    service: row.service,
    pieces: row.pieces,
    weightKg: row.weight_kg,
    amountPaise: row.amount_paise,
    paid: Boolean(row.paid),
    method: row.method,
    note: row.note || ""
  };
}

function expenseOut(row) {
  return {
    id: row.id,
    date: row.occurred_on,
    category: row.category,
    payee: row.payee || "",
    amountPaise: row.amount_paise,
    method: row.method,
    note: row.note || ""
  };
}

function loginPage(ready) {
  const note = ready
    ? "This desk does not use the rounds phone PIN. The name and passphrase live in Cloudflare secrets, not in the GitHub repo."
    : "This desk is not open yet. Set LAUNDRY_USER, LAUNDRY_PASSWORD and LAUNDRY_SESSION_SECRET with wrangler secret put. Do not commit them.";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<meta name="theme-color" content="#14221f" />
<title>Wash books</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560;9..144,640&family=Outfit:wght@380;500;600&display=swap" />
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100%; font-family: Outfit, "Segoe UI", sans-serif; color: #14221f; background: #f3efe6; }
  main { min-height: 100vh; display: grid; place-items: center; padding: 28px 16px; }
  form, section { width: min(440px, 100%); background: #fffdf8; border: 1px solid #e4ddd2; border-radius: 24px; padding: 22px; }
  .mark { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; background: #14221f; color: #f6f1e8; font-family: Fraunces, serif; }
  h1 { font-family: Fraunces, serif; font-weight: 640; letter-spacing: -0.03em; margin: 12px 0 6px; }
  p { color: #5c6560; font-size: 14px; line-height: 1.5; }
  label { display: block; font-size: 12px; color: #5c6560; margin: 12px 0 4px; }
  input { width: 100%; height: 44px; border: 1px solid #e4ddd2; border-radius: 12px; padding: 0 12px; font: inherit; background: #fffdf8; }
  button { width: 100%; height: 44px; margin-top: 16px; border: 0; border-radius: 12px; background: #115e59; color: #f4fffd; font: inherit; cursor: pointer; }
  button:disabled { opacity: 0.6; }
  .err { color: #8f3d1b; min-height: 18px; font-size: 13px; }
  .warn { background: #f8ece6; color: #8f3d1b; border-radius: 12px; padding: 10px 12px; }
</style>
</head>
<body>
<main>
  <section>
    <div class="mark">W</div>
    <h1>Wash books</h1>
    <p class="${ready ? "" : "warn"}">${note}</p>
    <form id="gate">
      <label for="username">Name</label>
      <input id="username" name="username" autocomplete="username" ${ready ? "" : "disabled"} />
      <label for="password">Passphrase</label>
      <input id="password" name="password" type="password" autocomplete="current-password" ${ready ? "" : "disabled"} />
      <p class="err" id="err" role="status"></p>
      <button type="submit" ${ready ? "" : "disabled"}>Open the books</button>
    </form>
  </section>
</main>
<script>
document.getElementById("gate").onsubmit = async (event) => {
  event.preventDefault();
  const button = event.target.querySelector("button");
  const err = document.getElementById("err");
  button.disabled = true;
  err.textContent = "";
  const body = Object.fromEntries(new FormData(event.target).entries());
  try {
    const res = await fetch("/api/laundry/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { err.textContent = data.error || "Could not open the books."; button.disabled = false; return; }
    location.reload();
  } catch {
    err.textContent = "Could not reach the desk.";
    button.disabled = false;
  }
};
</script>
</body>
</html>`;
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function dbError(error) {
  const message = String(error && error.message || error);
  if (message.includes("no such table")) return json({ error: "Laundry tables are missing. Apply the D1 migration, then try again." }, 500);
  return json({ error: "Could not open the books." }, 500);
}

export async function handleLaundry(request, env, url) {
  const https = url.protocol === "https:";
  try {
    if ((url.pathname === "/laundry" || url.pathname === "/laundry.html") && request.method === "GET") {
      if (!(await sessionValid(request, env))) {
        return new Response(loginPage(configured(env)), {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" }
        });
      }
      const asset = await env.ASSETS.fetch(new Request(new URL("/laundry.html", url.origin), request));
      const headers = new Headers(asset.headers);
      headers.set("Cache-Control", "private, no-store");
      headers.set("X-Robots-Tag", "noindex");
      return new Response(asset.body, { status: asset.status, headers });
    }

    if (url.pathname === "/api/laundry/login" && request.method === "POST") {
      if (!configured(env)) return json({ error: "This desk is not open yet." }, 503);
      const ip = request.headers.get("CF-Connecting-IP") || "local";
      if (tooMany(ip)) return json({ error: "Too many tries. Wait a few minutes." }, 429);
      const body = await readJson(request);
      const userOk = await sameSecret(String(body.username || "").trim(), env.LAUNDRY_USER);
      const passOk = await sameSecret(String(body.password || ""), env.LAUNDRY_PASSWORD);
      if (!userOk || !passOk) {
        noteFail(ip);
        await new Promise((resolve) => setTimeout(resolve, 400));
        return json({ error: "That name or passphrase is not right." }, 401);
      }
      return json({ ok: true }, 200, { "Set-Cookie": cookie(await makeToken(env), https) });
    }

    if (url.pathname === "/api/laundry/logout" && request.method === "POST") {
      return json({ ok: true }, 200, { "Set-Cookie": clearCookie(https) });
    }

    if (!url.pathname.startsWith("/api/laundry")) return json({ error: "Not found" }, 404);
    if (!(await sessionValid(request, env))) return json({ error: "Sign in again." }, 401);

    if (url.pathname === "/api/laundry/ledger" && request.method === "GET") {
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      if (!isDate(from) || !isDate(to) || from > to) return json({ error: "That month is not valid." }, 400);
      const sales = await env.DB.prepare(
        "SELECT * FROM laundry_sales WHERE occurred_on >= ? AND occurred_on <= ? ORDER BY occurred_on DESC, created_at DESC"
      ).bind(from, to).all();
      const expenses = await env.DB.prepare(
        "SELECT * FROM laundry_expenses WHERE occurred_on >= ? AND occurred_on <= ? ORDER BY occurred_on DESC, created_at DESC"
      ).bind(from, to).all();
      return json({ sales: sales.results.map(saleOut), expenses: expenses.results.map(expenseOut) });
    }

    if (url.pathname === "/api/laundry/sales" && request.method === "POST") {
      const body = await readJson(request);
      const date = String(body.date || "");
      const customer = text(body.customer, 80);
      const service = text(body.service, 60);
      const pieces = Number(body.pieces);
      const amountPaise = Number.isInteger(body.amountPaise) ? body.amountPaise : toPaise(body.amount);
      let weight = body.weightKg;
      if (weight === "" || weight === undefined || weight === null) weight = null;
      else weight = Number(weight);
      if (!isDate(date)) return json({ error: "Pick a real date." }, 400);
      if (!customer) return json({ error: "Enter the customer." }, 400);
      if (!service) return json({ error: "Enter the service." }, 400);
      if (!Number.isInteger(pieces) || pieces < 0 || pieces > 9999) return json({ error: "Enter how many pieces." }, 400);
      if (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 500)) return json({ error: "Weight should be like 2.5." }, 400);
      if (amountPaise === null || amountPaise < 0) return json({ error: "Enter an amount like 180 or 180.50." }, 400);
      if (!METHODS.includes(body.method)) return json({ error: "Pick how they paid." }, 400);
      const note = text(body.note, 240);
      const paid = body.paid ? 1 : 0;
      const id = text(body.id, 80);
      if (id) {
        const result = await env.DB.prepare(
          `UPDATE laundry_sales SET occurred_on=?, customer=?, service=?, pieces=?, weight_kg=?, amount_paise=?, paid=?, method=?, note=? WHERE id=?`
        ).bind(date, customer, service, pieces, weight, amountPaise, paid, body.method, note, id).run();
        if (!result.meta.changes) return json({ error: "That slip is gone." }, 404);
        return json({ ok: true, id });
      }
      const created = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
      await env.DB.prepare(
        `INSERT INTO laundry_sales (id, occurred_on, customer, service, pieces, weight_kg, amount_paise, paid, method, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(created, date, customer, service, pieces, weight, amountPaise, paid, body.method, note, Date.now()).run();
      return json({ ok: true, id: created });
    }

    if (url.pathname === "/api/laundry/sales" && request.method === "DELETE") {
      const id = text(url.searchParams.get("id"), 80);
      const result = await env.DB.prepare("DELETE FROM laundry_sales WHERE id = ?").bind(id).run();
      if (!result.meta.changes) return json({ error: "That slip is gone." }, 404);
      return json({ ok: true });
    }

    if (url.pathname === "/api/laundry/expenses" && request.method === "POST") {
      const body = await readJson(request);
      const date = String(body.date || "");
      const category = text(body.category, 60);
      const payee = text(body.payee, 80);
      const amountPaise = Number.isInteger(body.amountPaise) ? body.amountPaise : toPaise(body.amount);
      if (!isDate(date)) return json({ error: "Pick a real date." }, 400);
      if (!category) return json({ error: "Enter what this was for." }, 400);
      if (amountPaise === null || amountPaise < 0) return json({ error: "Enter an amount like 180 or 180.50." }, 400);
      if (!METHODS.includes(body.method)) return json({ error: "Pick how you paid." }, 400);
      const note = text(body.note, 240);
      const id = text(body.id, 80);
      if (id) {
        const result = await env.DB.prepare(
          `UPDATE laundry_expenses SET occurred_on=?, category=?, payee=?, amount_paise=?, method=?, note=? WHERE id=?`
        ).bind(date, category, payee, amountPaise, body.method, note, id).run();
        if (!result.meta.changes) return json({ error: "That expense is gone." }, 404);
        return json({ ok: true, id });
      }
      const created = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
      await env.DB.prepare(
        `INSERT INTO laundry_expenses (id, occurred_on, category, payee, amount_paise, method, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(created, date, category, payee, amountPaise, body.method, note, Date.now()).run();
      return json({ ok: true, id: created });
    }

    if (url.pathname === "/api/laundry/expenses" && request.method === "DELETE") {
      const id = text(url.searchParams.get("id"), 80);
      const result = await env.DB.prepare("DELETE FROM laundry_expenses WHERE id = ?").bind(id).run();
      if (!result.meta.changes) return json({ error: "That expense is gone." }, 404);
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    return dbError(error);
  }
}
