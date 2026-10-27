const THEMES = {
  milk: { id: "milk", label: "Milk supplier", tagline: "Customers, crates, house by house.", noun: "customer", extra: "Litres / items", extraPh: "2L toned + 1 curd", done: "Delivered", mark: "M", accent: "#1f6f8b", accentSoft: "#e5f3f6", paper: "#f4f7f6", ink: "#10242c", card: "#ffffff" },
  service: { id: "service", label: "Technician", tagline: "Today’s jobs, one technician, one loop.", noun: "job", extra: "Job type", extraPh: "AC service · 45 min", done: "Done", mark: "T", accent: "#b45309", accentSoft: "#f8efe4", paper: "#f6f4f1", ink: "#1c1915", card: "#fffdf8" },
  custom: { id: "custom", label: "Custom route", tagline: "Any list of doors. Same shortest loop.", noun: "stop", extra: "Detail", extraPh: "Pickup, install, collection…", done: "Complete", mark: "R", accent: "#3f6212", accentSoft: "#eef3e4", paper: "#f5f6f2", ink: "#1a1f16", card: "#ffffff" }
};

const SAMPLES = {
  milk: [
    { name: "Meera Rao", phone: "9845011122", address: "14, 12th Main, Indiranagar, Bengaluru", note: "Leave at gate if no answer", extra: "2L + paneer", lat: 12.9789, lng: 77.6408 },
    { name: "Arjun Shetty", phone: "9845022233", address: "88, 100 Feet Road, Indiranagar", note: "Ring twice", extra: "1L", lat: 12.9718, lng: 77.6412 },
    { name: "Lakshmi Stores", phone: "9845033344", address: "CMH Road, Indiranagar, Bengaluru", note: "Shop opens 7am", extra: "12L crate", lat: 12.9784, lng: 77.6366 },
    { name: "Farhan Qureshi", phone: "9845044455", address: "4th Cross, Halasuru, Bengaluru", note: "", extra: "3L", lat: 12.9765, lng: 77.6268 },
    { name: "Nandini Iyer", phone: "9845055566", address: "Defence Colony, Indiranagar", note: "Dog in yard — call first", extra: "1L + curd", lat: 12.9816, lng: 77.6374 }
  ],
  service: [
    { name: "Priya Menon", phone: "9900011111", address: "201, Raheja Residency, Koramangala, Bengaluru", note: "Split AC not cooling", extra: "AC service", lat: 12.9352, lng: 77.6245 },
    { name: "Cafe Marble", phone: "9900022222", address: "80 Feet Road, Koramangala", note: "Ask for manager Ravi", extra: "Compressor check", lat: 12.941, lng: 77.6232 },
    { name: "Suresh Babu", phone: "9900033333", address: "Ejipura Main Road, Bengaluru", note: "Warranty visit", extra: "Install", lat: 12.9455, lng: 77.6278 },
    { name: "Anita D'Souza", phone: "9900044444", address: "Sony World Signal, Koramangala", note: "Parking in basement", extra: "Gas refill", lat: 12.9348, lng: 77.6145 }
  ]
};

function id(prefix) {
  return prefix + crypto.randomUUID().slice(0, 8);
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
function sampleBag(trade) {
  const stops = (SAMPLES[trade] || []).map((s) => ({ id: id("s"), done: false, ...s }));
  return { roundtrip: true, stops, book: stops.map((s) => ({ ...s })), summary: null, geometry: null };
}
async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}
async function auth(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.name, u.phone, u.role, u.business_id, b.name AS biz_name, b.trade, b.code
     FROM sessions s JOIN users u ON u.id = s.user_id JOIN businesses b ON b.id = u.business_id
     WHERE s.token = ?`
  ).bind(token).first();
  if (!row) return null;
  return {
    token,
    user: { id: row.id, name: row.name, phone: row.phone, role: row.role },
    business: { id: row.business_id, name: row.biz_name, trade: row.trade, code: row.code }
  };
}
async function ensureBag(env, businessId, trade) {
  const row = await env.DB.prepare("SELECT data FROM bags WHERE business_id = ?").bind(businessId).first();
  if (row) return JSON.parse(row.data);
  const bag = sampleBag(trade);
  await env.DB.prepare("INSERT INTO bags (business_id, data) VALUES (?, ?)").bind(businessId, JSON.stringify(bag)).run();
  return bag;
}
function publicUser(session) {
  return {
    user: session.user,
    business: {
      id: session.business.id,
      name: session.business.name,
      trade: session.business.trade,
      code: session.user.role === "owner" ? session.business.code : undefined
    },
    theme: THEMES[session.business.trade] || THEMES.custom
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
    }

    try {
      if (url.pathname === "/api/login" && request.method === "POST") {
        const body = await readBody(request);
        const user = await env.DB.prepare("SELECT * FROM users WHERE phone = ? AND pin = ?").bind(String(body.phone || "").trim(), String(body.pin || "").trim()).first();
        if (!user) return json({ error: "Phone or PIN is wrong" }, 401);
        const business = await env.DB.prepare("SELECT * FROM businesses WHERE id = ?").bind(user.business_id).first();
        const token = crypto.randomUUID().replaceAll("-", "");
        await env.DB.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").bind(token, user.id, Date.now()).run();
        await ensureBag(env, business.id, business.trade);
        return json({ token, ...publicUser({ user, business }) });
      }

      if (url.pathname === "/api/register" && request.method === "POST") {
        const body = await readBody(request);
        const phone = String(body.phone || "").trim();
        if (await env.DB.prepare("SELECT id FROM users WHERE phone = ?").bind(phone).first()) return json({ error: "Phone already used" }, 409);
        const trade = THEMES[body.trade] ? body.trade : "custom";
        const businessId = id("biz-");
        const code = String(body.biz || "BIZ").replace(/[^a-z]/gi, "").slice(0, 4).toUpperCase() + Math.floor(10 + Math.random() * 89);
        const user = { id: id("u-"), name: String(body.name || "").trim(), phone, role: "owner" };
        const business = { id: businessId, name: String(body.biz || "New round").trim(), trade, code };
        await env.DB.batch([
          env.DB.prepare("INSERT INTO businesses (id, name, trade, code) VALUES (?, ?, ?, ?)").bind(business.id, business.name, business.trade, business.code),
          env.DB.prepare("INSERT INTO users (id, name, phone, pin, role, business_id) VALUES (?, ?, ?, ?, ?, ?)").bind(user.id, user.name, user.phone, String(body.pin || "").trim(), "owner", business.id),
          env.DB.prepare("INSERT INTO bags (business_id, data) VALUES (?, ?)").bind(business.id, JSON.stringify(sampleBag(trade)))
        ]);
        const token = crypto.randomUUID().replaceAll("-", "");
        await env.DB.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").bind(token, user.id, Date.now()).run();
        return json({ token, ...publicUser({ user, business }) });
      }

      if (url.pathname === "/api/join" && request.method === "POST") {
        const body = await readBody(request);
        const business = await env.DB.prepare("SELECT * FROM businesses WHERE lower(code) = lower(?)").bind(String(body.code || "").trim()).first();
        if (!business) return json({ error: "No business with that code" }, 404);
        const phone = String(body.phone || "").trim();
        if (await env.DB.prepare("SELECT id FROM users WHERE phone = ?").bind(phone).first()) return json({ error: "Phone already used" }, 409);
        const user = { id: id("u-"), name: String(body.name || "").trim(), phone, role: "field" };
        await env.DB.prepare("INSERT INTO users (id, name, phone, pin, role, business_id) VALUES (?, ?, ?, ?, ?, ?)").bind(user.id, user.name, user.phone, String(body.pin || "").trim(), "field", business.id).run();
        const token = crypto.randomUUID().replaceAll("-", "");
        await env.DB.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").bind(token, user.id, Date.now()).run();
        return json({ token, ...publicUser({ user, business }) });
      }

      const session = await auth(request, env);
      if (!session && url.pathname.startsWith("/api/")) return json({ error: "Sign in again" }, 401);

      if (url.pathname === "/api/me" && request.method === "GET") {
        const crew = session.user.role === "owner"
          ? (await env.DB.prepare("SELECT name, phone, role FROM users WHERE business_id = ?").bind(session.business.id).all()).results
          : [];
        return json({ ...publicUser(session), crew });
      }

      if (url.pathname === "/api/bag" && request.method === "GET") {
        return json(await ensureBag(env, session.business.id, session.business.trade));
      }

      if (url.pathname === "/api/bag" && request.method === "PUT") {
        const bag = await readBody(request);
        const clean = {
          roundtrip: !!bag.roundtrip,
          stops: Array.isArray(bag.stops) ? bag.stops : [],
          book: Array.isArray(bag.book) ? bag.book : [],
          summary: bag.summary || null,
          geometry: bag.geometry || null
        };
        await env.DB.prepare("INSERT INTO bags (business_id, data) VALUES (?, ?) ON CONFLICT(business_id) DO UPDATE SET data = excluded.data")
          .bind(session.business.id, JSON.stringify(clean)).run();
        return json({ ok: true });
      }

      if (url.pathname === "/api/logout" && request.method === "POST") {
        await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(session.token).run();
        return json({ ok: true });
      }

      if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
      return env.ASSETS.fetch(request);
    } catch (err) {
      return json({ error: "Server error" }, 500);
    }
  }
};
