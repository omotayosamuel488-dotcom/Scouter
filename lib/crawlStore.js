import { redis } from "./redis";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PAGES_TO_CHECK = ["/", "/pages/contact", "/pages/contact-us", "/pages/privacy-policy", "/policies/privacy-policy"];

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ScouterBot/1.0)" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function isShopifyHtml(html) {
  return (
    html.includes("cdn.shopify.com") ||
    html.includes("Shopify.theme") ||
    html.includes("myshopify.com")
  );
}

export async function crawlStore(domain) {
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  const cleanDomain = base.replace(/^https?:\/\//, "").replace(/\/$/, "");

  let isShopify = false;
  let storeName = null;
  const foundEmails = new Set();

  for (const path of PAGES_TO_CHECK) {
    const html = await fetchPage(`${base}${path}`);
    if (!html) continue;

    if (!isShopify && isShopifyHtml(html)) {
      isShopify = true;
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch) storeName = titleMatch[1].trim();
    }

    const emails = html.match(EMAIL_RE) || [];
    emails.forEach((e) => {
      const lower = e.toLowerCase();
      // Skip obvious placeholder/system emails
      if (!/sentry|example\.com|shopify\.com|wixpress|godaddy/.test(lower)) {
        foundEmails.add(lower);
      }
    });
  }

  if (!isShopify) {
    return { domain: cleanDomain, isShopify: false, emails: [] };
  }

  const emailList = Array.from(foundEmails);

  // Save to database: domain -> store info, and each email -> domain
  await redis.set(`store:${cleanDomain}`, JSON.stringify({
    domain: cleanDomain,
    storeName,
    emails: emailList,
    crawledAt: new Date().toISOString(),
  }));

  for (const email of emailList) {
    await redis.set(`email:${email}`, JSON.stringify({
      domain: cleanDomain,
      storeName,
    }));
  }

  return { domain: cleanDomain, isShopify: true, storeName, emails: emailList };
}
