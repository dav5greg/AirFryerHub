const SEARCH_ENDPOINT = "https://freeserp.ai/api.php";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") return res.status(405).json({ found: false });

  const dish = String(req.query.dish || "").trim().slice(0, 100);
  if (dish.length < 3) return res.status(400).json({ found: false });

  const query = 'come riscaldare ' + dish + ' già cotto friggitrice ad aria';
  try {
    const url = SEARCH_ENDPOINT + "?index=web&q=" + encodeURIComponent(query) + "&size=5";
    const response = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0 AirFryerHub/1.0" },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error("Search provider returned HTTP " + response.status);

    const data = await response.json();
    const results = Array.isArray(data.results) ? data.results : [];
    const clean = results
      .filter(item => item && typeof item.title === "string" && typeof item.url === "string" && /^https?:\/\//i.test(item.url))
      .slice(0, 5)
      .map(item => ({
        title: item.title.slice(0, 180),
        url: item.url,
        snippet: String(item.snippet || "").slice(0, 420)
      }));

    return res.status(200).json({ found: clean.length > 0, results: clean, query });
  } catch (error) {
    console.error("Regen web search failed:", error);
    return res.status(200).json({ found: false, results: [], query });
  }
}
