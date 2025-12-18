export async function onRequest(context) {
  // CORS preflight
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (context.request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const dutch = (body?.text || "").toString().trim();
  if (!dutch) {
    return new Response(JSON.stringify({ error: "Missing text" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  // 🔒 Strong, dialect-stable instruction + a few examples.
  // If you want Curaçao vs Aruba style, tell me which and I’ll tune the examples/spelling.
  const system = `
You are a professional subtitle translator.
Translate from DUTCH to PAPIAMENTU.
Output ONLY the Papiamentu subtitle text. No quotes. No extra commentary.
Keep it short, natural, and spoken.
Preserve names/places/brands. If a term is unknown, keep it as-is.
Use consistent Papiamentu spelling and grammar.
`;

  const examples = `
Examples (Dutch -> Papiamentu):
- "Goedemorgen, hoe gaat het?" -> "Bon dia, kon ta bai?"
- "Dank je wel!" -> "Masha danki!"
- "Tot straks." -> "Te awor aki."
- "Ik begrijp het niet." -> "Mi no ta komprondé."
- "Kun je dat herhalen?" -> "Bo por repetí esey?"
`;

  const user = `Translate this Dutch sentence into Papiamentu:\n${dutch}\n\n${examples}`;

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0,
      input: [
        { role: "system", content: system.trim() },
        { role: "user", content: user }
      ],
      max_output_tokens: 120
    }),
  });

  const json = await r.json().catch(() => null);

  if (!r.ok) {
    return new Response(JSON.stringify({ error: "OpenAI error", status: r.status, raw: json }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  // Extract text from Responses API
  let out = "";
  try {
    const parts = json.output?.[0]?.content || [];
    out = parts
      .filter(p => p.type === "output_text")
      .map(p => p.text)
      .join("")
      .trim();
  } catch {}

  if (!out) {
    return new Response(JSON.stringify({ error: "Empty translation", raw: json }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  return new Response(JSON.stringify({ translation: out }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
