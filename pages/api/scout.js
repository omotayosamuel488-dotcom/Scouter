import { verifyShopify } from "../../lib/verifyShopify";

// Keep batches small - serverless functions on Vercel's free tier
// time out around 10s, and each email needs a search + a fetch.
const MAX_EMAILS_PER_REQUEST = 15;

function extractDomainsFromSerp(serpJson) {
  const domains = new Set();
  const results = serpJson.organic_results || [];
  for (const r of results) {
    try {
      const host = new URL(r.link).hostname.replace(/^www\./, "");
      // Skip obvious non-store domains (social, marketplaces, aggregators)
      if (
        !/facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|youtube\.com|pinterest\.com|amazon\.com|ebay\.com|google\.com/.test(
          host
        )
      ) {
        domains.add(host);
      }
    } catch {
      // skip malformed URLs
    }
  }
  return Array.from(domains).slice(0, 3); // check top 3 candidates per email
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { emails } = req.body || {};
  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: "Provide a non-empty array of emails" });
  }

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error:
        "SERPAPI_KEY is not set. Add it in your hosting provider's environment variables (see README).",
    });
  }

  const batch = emails.slice(0, MAX_EMAILS_PER_REQUEST);
  const results = [];

  for (const email of batch) {
    const cleanEmail = String(email).trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      results.push({ email: cleanEmail, status: "skipped", reason: "not a valid email" });
      continue;
    }

    try {
      const searchUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(
        `"${cleanEmail}"`
      )}&api_key=${apiKey}`;
      const serpRes = await fetch(searchUrl);
      const serpJson = await serpRes.json();
      const candidates = extractDomainsFromSerp(serpJson);

      if (candidates.length === 0) {
        results.push({ email: cleanEmail, status: "no_match", store: null });
        continue;
      }

      let matched = null;
      for (const domain of candidates) {
        const check = await verifyShopify(domain);
        if (check.isShopify) {
          matched = check;
          break;
        }
      }

      results.push({
        email: cleanEmail,
        status: matched ? "found" : "no_shopify_match",
        store: matched
          ? {
              domain: matched.domain,
              storeName: matched.storeName,
              productCount: matched.productCount,
            }
          : null,
        candidatesChecked: candidates,
      });
    } catch (err) {
      results.push({ email: cleanEmail, status: "error", reason: String(err) });
    }
  }

  return res.status(200).json({
    results,
    processed: batch.length,
    remaining: emails.length - batch.length,
  });
}
