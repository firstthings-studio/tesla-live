// Cloudflare Worker: CORS relay for Teslemetry, for one owner.
// Variable ALLOWED_ORIGIN must be set to the GitHub Pages origin only: https://firstthings-studio.github.io
// Reads (GET) pass through. Writes (POST) are limited to a short list of car controls used by the app's Car page.
// The token arrives in the Authorization header and is passed straight through.
// It is never logged or stored, and a token in the address is refused so it can't end up in any log.
const UPSTREAM = "https://api.teslemetry.com";
const OK_PATH = /^\/(sse(\/[A-Za-z0-9]{10,20})?|api\/1\/(products|vehicles(\/[A-Za-z0-9]{10,20}(\/(vehicle_data|data|telemetry))?)?))$/;
const CMD_PATH = /^\/api\/1\/vehicles\/[A-Za-z0-9]{10,20}\/(wake_up|command\/(auto_conditioning_start|auto_conditioning_stop|set_temps|set_preconditioning_max|remote_seat_heater_request|door_lock|door_unlock|set_sentry_mode|charge_port_door_open|charge_port_door_close|actuate_trunk|charge_start|charge_stop|set_charge_limit|window_control|flash_lights|honk_horn))$/;

export default {
  async fetch(req, env) {
    const origin = env.ALLOWED_ORIGIN;
    if (!origin) return new Response("Relay not configured", { status: 500 });
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization, Accept, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    if (req.method === "OPTIONS") {
      // The browser's permission pre-check: answer it here, never forward it.
      return req.headers.get("Origin") === origin ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
    }
    if (req.headers.get("Origin") !== origin) return new Response("Forbidden", { status: 403 });
    const url = new URL(req.url);
    const isGet = req.method === "GET" && OK_PATH.test(url.pathname);
    const isCmd = req.method === "POST" && CMD_PATH.test(url.pathname) && !url.search;
    if (!isGet && !isCmd) return new Response("Not allowed", { status: 404, headers: cors });
    if (url.searchParams.has("token")) return new Response("Send the token in the Authorization header", { status: 400, headers: cors });
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response("Missing token", { status: 401, headers: cors });
    const init = { method: req.method, headers: { Authorization: auth, Accept: req.headers.get("Accept") || "*/*" } };
    if (isCmd) {
      // Small JSON object bodies only (e.g. {"percent":80}); anything else is refused.
      const text = await req.text();
      if (text.length > 512) return new Response("Body too large", { status: 413, headers: cors });
      let body = {};
      try { body = text ? JSON.parse(text) : {}; } catch (e) { return new Response("Bad body", { status: 400, headers: cors }); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return new Response("Bad body", { status: 400, headers: cors });
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const up = await fetch(UPSTREAM + url.pathname + url.search, init);
    const h = new Headers(up.headers);
    for (const k of Object.keys(cors)) h.set(k, cors[k]);
    h.set("Cache-Control", "no-store");
    return new Response(up.body, { status: up.status, headers: h });
  },
};
