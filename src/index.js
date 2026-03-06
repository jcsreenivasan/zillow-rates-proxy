const ZILLOW_API_BASE = "https://mortgageapi.zillow.com/getCurrentRates";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const PRICE_POINTS = [
  { key: "p1", creditScoreBucket: "VeryHigh", loanToValueBucket: "Normal"   },
  { key: "p2", creditScoreBucket: "VeryHigh", loanToValueBucket: "High"     },
  { key: "p3", creditScoreBucket: "High",     loanToValueBucket: "Normal"   },
  { key: "p4", creditScoreBucket: "High",     loanToValueBucket: "High"     },
  { key: "p5", creditScoreBucket: "Low",      loanToValueBucket: "VeryHigh" },
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight for all routes
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── /explain — AI-generated rate card insight ──────────────────────────
    if (url.pathname === "/explain") {
      if (request.method !== "POST") {
        return new Response(
          JSON.stringify({ error: "Method Not Allowed" }),
          { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      try {
        const { tier, rate, apr, pts, program, refinance } = await request.json();

        const prompt =
          `You are a friendly, concise mortgage advisor. In 2–3 sentences explain why this specific mortgage option is a great fit. Be direct and specific. Stay under 55 words.\n\n` +
          `Loan: ${program} (${refinance ? "Refinance" : "Purchase"})\n` +
          `Credit tier: ${tier}\n` +
          `Interest rate: ${rate}%\n` +
          `APR: ${apr}%\n` +
          `Points: +${pts}`;

        const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          messages: [
            {
              role: "system",
              content: "You are a concise, friendly mortgage advisor. Give short, specific, encouraging explanations about mortgage products. Never use bullet points. Plain prose only.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 120,
        });

        return new Response(JSON.stringify({ text: aiResponse.response }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: "Failed to generate explanation", detail: err.message }),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Default: Zillow rates proxy ────────────────────────────────────────
    if (request.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "Method Not Allowed" }),
        { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    try {
      const program   = url.searchParams.get("program")   || "Fixed30Year";
      const loanType  = url.searchParams.get("loanType")  || "Conventional";
      const refinance = url.searchParams.get("refinance") === "true";

      const zillowUrl = new URL(ZILLOW_API_BASE);
      zillowUrl.searchParams.set("partnerId", "RD-PLYQVHG");

      for (const pp of PRICE_POINTS) {
        zillowUrl.searchParams.set(`queries.${pp.key}.program`,           program);
        zillowUrl.searchParams.set(`queries.${pp.key}.loanType`,          loanType);
        zillowUrl.searchParams.set(`queries.${pp.key}.refinance`,         String(refinance));
        zillowUrl.searchParams.set(`queries.${pp.key}.creditScoreBucket`, pp.creditScoreBucket);
        zillowUrl.searchParams.set(`queries.${pp.key}.loanToValueBucket`, pp.loanToValueBucket);
      }

      const zillowResponse = await fetch(zillowUrl.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; Cloudflare Worker; zillow-rates-proxy)",
        },
      });

      if (!zillowResponse.ok) {
        const errorText = await zillowResponse.text();
        return new Response(
          JSON.stringify({ error: "Zillow API returned an error", status: zillowResponse.status, detail: errorText }),
          { status: zillowResponse.status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      const data = await zillowResponse.json();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json;charset=UTF-8",
          "Cache-Control": "public, max-age=300",
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch mortgage rates", detail: err.message }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
  },
};
