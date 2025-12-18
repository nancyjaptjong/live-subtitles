export async function onRequestPost(context) {
  const apiKey = context.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const dutch = (body?.text || "").toString().trim();
  if (!dutch) {
    return new Response(JSON.stringify({ error: "Missing text" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Translation prompt (strong + consistent)
  const prompt =
    "Translate the following Dutch into Papiamentu.\n" +
    "Return ONLY the Papiamentu translation. No quotes. No extra text.\n\n" +
    "Dutch:\n" + dutch;

  // Use Responses API (simple + consistent)
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      input: prompt,
      temperature: 0.2,
    }),
  });

  const json = await r.json().catch(() => null);

  if (!r.ok) {
    return new Response(JSON.stringify({ error: "OpenAI error", status: r.status, raw: json }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Extract text safely from Responses API
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
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ translation: out }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
