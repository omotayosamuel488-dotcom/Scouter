import { crawlStore } from "../../lib/crawlStore";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { domains } = req.body || {};
  if (!Array.isArray(domains) || domains.length === 0) {
    return res.status(400).json({ error: "Provide a non-empty array of domains or URLs" });
  }

  const results = [];
  for (const domain of domains.slice(0, 10)) {
    try {
      const result = await crawlStore(domain.trim());
      results.push(result);
    } catch (err) {
      results.push({ domain, isShopify: false, error: String(err) });
    }
  }

  return res.status(200).json({ results });
}
