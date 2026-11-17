export default async function handler(req, res) {
  const q = "reheat fried calamari in air fryer";
  try {
    const response = await fetch("https://www.bing.com/search?format=rss&q=" + encodeURIComponent(q), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml,application/xml,text/xml,*/*"
      },
      signal: AbortSignal.timeout(10000)
    });
    const xml = await response.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m=>m[1]);
    const strip = s => s.replace(/<!\[CDATA\[|\]\]>/g,"").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g," ").trim();
    const samples=items.slice(0,10).map(item=>({
      title:strip((item.match(/<title>([\s\S]*?)<\/title>/i)||[])[1]||""),
      description:strip((item.match(/<description>([\s\S]*?)<\/description>/i)||[])[1]||"")
    }));
    return res.status(200).json({status:response.status,length:xml.length,items:items.length,samples});
  } catch(error) { return res.status(200).json({error:String(error)}); }
}