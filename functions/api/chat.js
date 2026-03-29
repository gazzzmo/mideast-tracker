/**
 * Cloudflare Pages Function — /api/chat
 *
 * This file lives at functions/api/chat.js which means Cloudflare Pages
 * automatically routes POST /api/chat here — no separate Worker deployment needed.
 *
 * Set your API key in the Pages dashboard:
 *   Settings → Environment variables → Add variable
 *   Name: ANTHROPIC_API_KEY  (mark as "Secret")
 */

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY not configured in Pages environment variables" },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Safety: strip any key accidentally sent by client
  delete body.api_key;

  const upstream = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

// Handle OPTIONS preflight (needed if you ever call from a different origin)
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
