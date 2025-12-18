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

  // Curaçao/Bonaire Papiamentu uses diacritics and stress marks (Curaçao orthography). :contentReference[oaicite:1]{index=1}
  const system = `
Bo ta un traduktor profesional pa subtítulonan.
Tradusí di Hulandes (Dutch) pa Papiamentu di Kòrsou (Curaçao standard).
Output: SOLAMENTE e tradukshon na Papiamentu (sin komenta, sin komiña, sin "Dutch:" label).
Mantené e frase kortiku i natural manera un subtítulo.
No repetí Hulandes.
Preservá nòmber propio, lugánan, brand.
Usa ortografia di Kòrsou ku aksèntnan ora mester (p.ej. è, ò, ù, ü) i aksènt di énfasis ora ta necesario. :contentReference[oaicite:2]{index=2}
`;

  // A few “anchor” examples in common Curaçao phrasing.
  // (These are widely used forms in practice.) :contentReference[oaicite:3]{index=3}
  const examples = `
Ejèmpelnan (Hulandes -> Papiamentu di Kòrsou):
- "Goedemorgen, hoe gaat het?" -> "Bon dia, kon ta bai?"
- "Goedemiddag." -> "Bon tardi."
- "Goedenavond." -> "Bon nochi."
- "Dank je wel!" -> "Masha danki!"
- "Tot later." -> "Te otro biaha."
- "Ik begrijp het niet." -> "Mi no ta komprondé."
`;

  const user = `
${examples}

Tradusí e siguiente frase di Hulandes pa Papiamentu di Kòrsou.
Output SOLAMENTE Papiamentu:

Hulandes: ${dutch}
`.trim();

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",       // stronger for low-resource languages
      temperature: 0,        // remove “creative” drift
      max_output_tokens: 120,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const json = await r.json().catch(() => null);

  if (!r.ok) {
    return new Response(JSON.stringify({ error: "OpenAI error", status: r.status, raw: json }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  // Extract text from Responses API output
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
