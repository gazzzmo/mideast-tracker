/**
 * Cloudflare Worker — Anthropic API proxy
 *
 * Keeps your ANTHROPIC_API_KEY out of the browser bundle.
 * Deploy this as a Worker and set the secret via:
 *   wrangler secret put ANTHROPIC_API_KEY
 *
 * The Worker is bound to the same Pages project so it shares
 * the same domain — no CORS issues.
 */

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ALLOWED_ORIGIN = "*"; // Tighten to your Pages domain in production, e.g. "https://mideast-tracker.pages.dev"

export default {
  async fetch(request, env) {

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(ALLOWED_ORIGIN),
      });
    }

    // ── Only accept POST to /api/chat ───────────────────────────────────────
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/api/chat") {
      return new Response("Not found", { status: 404 });
    }

    // ── Validate we have the secret ─────────────────────────────────────────
    if (!env.ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY secret not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Forward the request body to Anthropic ───────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Strip any API key the client might have accidentally sent
    delete body.api_key;

    const anthropicResponse = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const responseData = await anthropicResponse.text();

    return new Response(responseData, {
      status: anthropicResponse.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(ALLOWED_ORIGIN),
      },
    });
  },
};

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
