export default async function handler(req, res) {
  const queries = [
    "reheat calamari in air fryer",
    "how to reheat fried calamari",
    "fried calamari air fryer leftovers"
  ];
  const results = await Promise.all(queries.map(async q => {
    try {
      const url = "https://r.jina.ai/http://www.bing.com/search?q=" + encodeURIComponent(q);
      const r = await fetch(url,{headers:{"User-Agent":"Mozilla/5.0","Accept":"text/plain"},signal:AbortSignal.timeout(15000)});
      const t = await r.text();
      const headings=[...t.matchAll(/^\d+\.\s+##\s+\[([^\]]+)\]\(([^)]+)\)/gm)].map(m=>({title:m[1],url:m[2]}));
      return {q,status:r.status,length:t.length,headings:headings.slice(0,10),mentionsCalamari:t.toLowerCase().includes("calamari")};
    } catch(e) { return {q,error:String(e)}; }
  }));
  return res.status(200).json(results);
}