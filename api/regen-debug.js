export default async function handler(req, res) {
  const q = "how to reheat calamari in air fryer temperature time";
  try {
    const response = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q) + "&kl=it-it", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://html.duckduckgo.com/"
      },
      signal: AbortSignal.timeout(12000)
    });
    const html = await response.text();
    return res.status(200).json({
      status: response.status,
      length: html.length,
      resultMarker: html.includes("result__a"),
      snippetMarker: html.includes("result__snippet"),
      anomaly: /anomaly|unusual traffic|captcha/i.test(html),
      title: (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "",
      excerpt: html.slice(0, 1200)
    });
  } catch (error) {
    return res.status(200).json({ error: String(error) });
  }
}