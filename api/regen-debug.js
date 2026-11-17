export default async function handler(req, res) {
  const q = "how to reheat calamari in air fryer temperature time";
  const targets = [
    ["bing", "https://www.bing.com/search?q=" + encodeURIComponent(q)],
    ["google", "https://www.google.com/search?q=" + encodeURIComponent(q)],
    ["ddg-lite", "https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(q)]
  ];
  const results = await Promise.all(targets.map(async ([name, url]) => {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9"
        },
        signal: AbortSignal.timeout(10000)
      });
      const html = await response.text();
      return {
        name, status: response.status, length: html.length,
        resultMarker: /b_algo|MjjYud|result-link|result__a/i.test(html),
        excerpt: html.slice(0, 350)
      };
    } catch (error) {
      return { name, error: String(error) };
    }
  }));
  return res.status(200).json(results);
}