const ZILLOW_API_BASE = "https://mortgageapi.zillow.com/getCurrentRates";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// 5 price-point tiers built from valid creditScoreBucket × loanToValueBucket combos
const PRICE_POINTS = [
  { key: "p1", creditScoreBucket: "VeryHigh", loanToValueBucket: "Normal"   },
  { key: "p2", creditScoreBucket: "VeryHigh", loanToValueBucket: "High"     },
  { key: "p3", creditScoreBucket: "High",     loanToValueBucket: "Normal"   },
  { key: "p4", creditScoreBucket: "High",     loanToValueBucket: "High"     },
  { key: "p5", creditScoreBucket: "Low",      loanToValueBucket: "VeryHigh" },
];

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "Method Not Allowed" }),
        { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    try {
      const incoming = new URL(request.url);
      const program   = incoming.searchParams.get("program")   || "Fixed30Year";
      const loanType  = incoming.searchParams.get("loanType")  || "Conventional";
      const refinance = incoming.searchParams.get("refinance") === "true";

      const zillowUrl = new URL(ZILLOW_API_BASE);
      zillowUrl.searchParams.set("partnerId", "RD-PLYQVHG");

      // Build one multi-query request for all 5 price points
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
