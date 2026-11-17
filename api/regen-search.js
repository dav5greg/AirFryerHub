const SEARCH_ENDPOINT = "https://html.duckduckgo.com/html/";

function cleanText(value) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&deg;/gi, "°")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function parseSearchResults(html) {
  const snippets = [...html.matchAll(/class=["'][^"']*\bresult__snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/gi)]
    .map(match => cleanText(match[1]))
    .filter(Boolean);

  const titles = [...html.matchAll(/class=["'][^"']*\bresult__a\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(match => cleanText(match[1]));

  return snippets.map((snippet, index) => ({
    title: titles[index] || "",
    snippet,
    text: (titles[index] || "") + " " + snippet
  }));
}

function extractTemperatures(text) {
  const values = [];
  const pattern = /\b(1[0-9]{2}|2[0-2][0-9])\s*(?:°\s*C|°C|degrees?\s*C|\bCelsius\b|\bgradi\b)/gi;
  for (const match of text.matchAll(pattern)) {
    const value = Number(match[1]);
    if (value >= 100 && value <= 220) values.push(value);
  }
  return values;
}

function extractMinutes(text) {
  const values = [];
  const pattern = /\b(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*(?:min(?:uti)?|minutes?)\b/gi;
  for (const match of text.matchAll(pattern)) {
    const first = Number(match[1]);
    const second = match[2] ? Number(match[2]) : first;
    if (first >= 1 && first <= 30 && second >= 1 && second <= 30) {
      values.push(Math.round((first + second) / 2));
    }
  }
  return values;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

async function search(query) {
  const url = SEARCH_ENDPOINT + "?q=" + encodeURIComponent(query) + "&kl=it-it";
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
      "Referer": "https://html.duckduckgo.com/"
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) throw new Error("Search provider returned HTTP " + response.status);
  const html = await response.text();
  if (/anomaly|unusual traffic|captcha/i.test(html) && !/result__snippet|result__a/i.test(html)) {
    throw new Error("Search provider returned an anti-bot page");
  }
  return parseSearchResults(html);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") return res.status(405).json({ found: false });

  const dish = String(req.query.dish || "").trim().slice(0, 100);
  if (dish.length < 3) return res.status(400).json({ found: false });

  try {
    const queries = [
      'come riscaldare ' + dish + ' già cotto friggitrice ad aria temperatura minuti',
      'how to reheat ' + dish + ' in air fryer temperature time'
    ];

    const results = (await Promise.all(queries.map(search))).flat();
    const relevant = results.filter(result =>
      /air fryer|friggitrice|riscald|reheat|leftover|avanzi|riscaldare/i.test(result.text)
    );

    // Ogni risultato contribuisce con i valori che contiene; non è più necessario
    // che temperatura e durata compaiano nello stesso snippet.
    const usable = relevant.length ? relevant : results;
    const temperatures = usable.flatMap(result => extractTemperatures(result.text));
    const minutes = usable.flatMap(result => extractMinutes(result.text));

    if (!temperatures.length || !minutes.length) {
      console.warn("Regen search: no usable values", {
        dish,
        resultCount: results.length,
        relevantCount: relevant.length,
        temperatureCount: temperatures.length,
        minuteCount: minutes.length
      });
      return res.status(200).json({ found: false });
    }

    const temperature = median(temperatures);
    const duration = median(minutes);

    if (temperature < 100 || temperature > 220 || duration < 1 || duration > 30) {
      return res.status(200).json({ found: false });
    }

    return res.status(200).json({
      found: true,
      temperature,
      minutes: duration
    });
  } catch (error) {
    console.error("Regen search failed:", error);
    return res.status(200).json({ found: false });
  }
}
