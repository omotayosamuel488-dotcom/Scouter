// Fetches a candidate domain and checks for Shopify's storefront signature.
// Shopify stores reliably load assets from cdn.shopify.com / myshopify.com
// and expose a predictable /products.json endpoint, so we check both.
export async function verifyShopify(domain) {
  const url = domain.startsWith("http") ? domain : `https://${domain}`;

  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ScouterBot/1.0)" },
    });
    const html = await res.text();

    const isShopify =
      html.includes("cdn.shopify.com") ||
      html.includes("Shopify.theme") ||
      html.includes("myshopify.com") ||
      res.headers.get("x-shopid") !== null;

    if (!isShopify) {
      return { domain, isShopify: false, storeName: null, productCount: null };
    }

    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const storeName = titleMatch ? titleMatch[1].trim() : null;

    let productCount = null;
    try {
      const productsRes = await fetch(`${url.replace(/\/$/, "")}/products.json?limit=1`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ScouterBot/1.0)" },
      });
      if (productsRes.ok) {
        const data = await productsRes.json();
        productCount = Array.isArray(data.products) ? data.products.length : null;
      }
    } catch {
      // products.json can be disabled; not fatal
    }

    return { domain, isShopify: true, storeName, productCount };
  } catch {
    return { domain, isShopify: false, storeName: null, productCount: null, error: true };
  }
}
