/**
 * Cloudflare Pages Function — handles POST /api/chat
 *
 * File path: functions/api/chat.js
 * This maps automatically to the route: /api/chat
 *
 * Set your secret in the Cloudflare Pages dashboard:
 *   Settings → Environment variables → ANTHROPIC_API_KEY (encrypted)
 */

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

// POST handler — proxies request to Anthropic with the server-side API key
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not set in Pages environment variables." },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Never forward an API key from the client
  delete body.api_key;

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return Response.json(
      { error: `Failed to reach Anthropic API: ${err.message}` },
      { status: 502 }
    );
  }

  const responseText = await upstream.text();

  return new Response(responseText, {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// OPTIONS handler — CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
