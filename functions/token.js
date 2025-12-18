export async function onRequestGet(context) {
  const apiKey = context.env.OPENAI_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: { type: "realtime", model: "gpt-realtime" },
    }),
  });

  const json = await r.json().catch(() => null);

  // OpenAI returns the ephemeral key as `value` (and some older shapes use `client_secret.value`)
  const value = json?.value ?? json?.client_secret?.value;

  if (!value) {
    return new Response(JSON.stringify({ error: "Token response missing value", raw: json }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ value }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
