import wordlist from "../data/curacao_wordlist.json";

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyRules(text, rules, protectedSet) {
  let out = text;

  for (const rule of rules || []) {
    const src = (rule?.src || "").toString();
    const tgt = (rule?.tgt || "").toString();
    if (!src) continue;

    // Skip if src is protected
    if (protectedSet.has(src)) continue;

    const flags = rule.case_sensitive ? "g" : "gi";
    const pattern = rule.word_boundary
      ? `\\b${escapeRegex(src)}\\b`
      : `${escapeRegex(src)}`;

    const re = new RegExp(pattern, flags);
    out = out.replace(re, tgt);
  }
  return out;
}

function protectTokens(text, protectedList) {
  // Replace protected tokens with placeholders so other rules can't modify them
  const map = new Map();
  let out = text;

  (protectedList || []).forEach((token, i) => {
    const t = (token || "").toString();
    if (!t) return;

    const key = `__PROTECTED_${i}__`;
    map.set(key, t);

    // Replace all occurrences (case-sensitive, exact)
    // If you want case-insensitive protection, tell me and I’ll adjust.
    out = out.split(t).join(key);
  });

  return { text: out, map };
}

function unprotectTokens(text, map) {
  let out = text;
  for (const [key, val] of map.entries()) {
    out = out.split(key).join(val);
  }
  return out;
}

function normalizeSpacing(s) {
  return (s || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

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

  // --- Curaçao style translator instructions
  const system = `
Bo ta un traduktor profesional pa subtítulonan.
Tradusí di Hulandes (Dutch) pa Papiamentu di Kòrsou (Curaçao standard).
Output: SOLAMENTE e tradukshon na Papiamentu (sin komenta, sin komiña).
Mantené e frase kortiku i natural manera un subtítulo.
No repetí Hulandes.
Preservá nòmber propio, lugánan, brand.
Usa ortografia di Kòrsou ku aksèntnan ora mester (p.ej. è, ò, ù, ü).
`.trim();

  // Helpful anchors pulled from your wordlist phrase targets (optional)
  // (We keep this small so we don't “overfit”.)
  const anchors = `
Ejèmpelnan:
- "goedemorgen" -> "bon dia"
- "goedemiddag" -> "bon tardi"
- "goedenavond" -> "bon nochi"
- "hoe gaat het" -> "kon ta bai"
- "dank je wel" -> "masha danki"
`.trim();

  const user = `
${anchors}

Tradusí e siguiente frase di Hulandes pa Papiamentu di Kòrsou.
Output SOLAMENTE Papiamentu:

Hulandes: ${dutch}
`.trim();

  // Call OpenAI Responses API
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0,
      max_output_tokens: 140,
      input: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
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

  // --- Apply your wordlist deterministically
  const protectedList = wordlist?.protected || [];
  const protectedSet = new Set(protectedList.map(x => (x || "").toString()));

  // Protect names/brands first
  const protectedResult = protectTokens(out, protectedList);
  let fixed = protectedResult.text;

  // Apply in priority order
  fixed = applyRules(fixed, wordlist?.phrases, protectedSet);
  fixed = applyRules(fixed, wordlist?.words, protectedSet);
  fixed = applyRules(fixed, wordlist?.spelling_fixes, protectedSet);

  // Unprotect
  fixed = unprotectTokens(fixed, protectedResult.map);

  // Normalize whitespace/punctuation
  fixed = normalizeSpacing(fixed);

  return new Response(JSON.stringify({ translation: fixed }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

