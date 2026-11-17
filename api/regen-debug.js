export default async function handler(req, res) {
  const q = "reheat fried calamari in air fryer 350 F minutes";
  try {
    const response = await fetch("https://www.bing.com/search?q=" + encodeURIComponent(q) + "&count=10&setlang=en&cc=us", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      },
      signal: AbortSignal.timeout(10000)
    });
    const html = await response.text();
    const blocks = [...html.matchAll(/<li[^>]*class=["'][^"']*\bb_algo\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)].map(m => m[1]);
    const samples = blocks.slice(0,5).map(block => ({
      title: ((block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)||[])[1]||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim(),
      ps: [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>m[1].replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()).slice(0,2),
      hasCaption: /b_caption/i.test(block)
    }));
    return res.status(200).json({status:response.status,length:html.length,algoCount:blocks.length,samples});
  } catch (error) { return res.status(200).json({error:String(error)}); }
}