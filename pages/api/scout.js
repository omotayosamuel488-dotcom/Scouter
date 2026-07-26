import { verifyShopify } from "../../lib/verifyShopify";

const MAX_EMAILS_PER_REQUEST = 15;

function extractDomainsFromSerp(serperJson) {
  const domains = new Set();
  const results = serperJson.organic || [];
  for (const r of results) {
    try {
      const host = new URL(r.link).hostname.replace(/^www\./, "");
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
  return Array.from(domains).slice(0, 3);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { emails } = req.body || {};
  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: "Provide a non-empty array of emails" });
  }

  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error:
        "SERPER_API_KEY is not set. Add it in your hosting provider's environment variables (see README).",
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
      const serperRes = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: `"${cleanEmail}"` }),
      });
      const serperJson = await serperRes.json();
      const candidates = extractDomainsFromSerp(serperJson);

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
