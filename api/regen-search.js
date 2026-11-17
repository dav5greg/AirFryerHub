const SEARCH_ENDPOINT = "https://html.duckduckgo.com/html/";

function cleanText(value) {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&#x27;|&#39;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ").trim();
}

function extractCandidates(text) {
  const normalized = text.replace(/,/g, ".").replace(/\u00a0/g, " ");
  const temps = [...normalized.matchAll(/(?:a\s*)?(\d{2,3})\s*°?\s*(?:c|gradi|degrees?)/gi)]
    .map(m => Number(m[1])).filter(n => n >= 100 && n <= 220);
  const minutes = [...normalized.matchAll(/(\d{1,2})\s*(?:-|–|a|to)?\s*(\d{1,2})?\s*(?:minuti|minuti|min|mins?)\b/gi)]
    .flatMap(m => m[2] ? [Number(m[1]), Number(m[2])] : [Number(m[1])])
    .filter(n => n >= 1 && n <= 30);
  return { temps, minutes };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ found: false });
  const dish = String(req.query.dish || "").trim().slice(0, 100);
  if (dish.length < 3) return res.status(400).json({ found: false });

  try {
    const query = 'come riscaldare ' + dish + ' già cotto avanzato friggitrice ad aria';
    const url = SEARCH_ENDPOINT + '?q=' + encodeURIComponent(query);
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AirFryerHub/1.0)" },
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) throw new Error("Search provider unavailable");
    const html = await response.text();
    const blocks = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map(match => cleanText(match[1]))
      .filter(Boolean)
      .filter(text => /riscald|avanzi|già cot|already cooked|reheat|leftover/i.test(text));

    const all = blocks.map(extractCandidates);
    const temperatures = all.flatMap(item => item.temps);
    const times = all.flatMap(item => item.minutes);
    if (!temperatures.length || !times.length || !blocks.length) {
      return res.status(200).json({ found: false });
    }

    const median = values => {
      const sorted = [...values].sort((a,b) => a-b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle-1] + sorted[middle]) / 2);
    };
    const temperature = median(temperatures);
    const minutes = median(times);
    if (temperature < 100 || temperature > 220 || minutes < 1 || minutes > 30) {
      return res.status(200).json({ found: false });
    }
    return res.status(200).json({ found: true, temperature, minutes });
  } catch (error) {
    return res.status(200).json({ found: false });
  }
}
