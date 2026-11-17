export default async function handler(req, res) {
  const q = "how to reheat fried calamari in air fryer temperature time";
  const urls = [
    ["jina-google", "https://r.jina.ai/http://www.google.com/search?q=" + encodeURIComponent(q)],
    ["jina-bing", "https://r.jina.ai/http://www.bing.com/search?q=" + encodeURIComponent(q)],
    ["jina-ddg", "https://r.jina.ai/http://html.duckduckgo.com/html/?q=" + encodeURIComponent(q)]
  ];
  const out = await Promise.all(urls.map(async ([name,url]) => {
    try {
      const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0","Accept":"text/plain"},signal:AbortSignal.timeout(15000)});
      const t=await r.text();
      const i=t.toLowerCase().indexOf("calamari");
      return {name,status:r.status,length:t.length,index:i,excerpt:i>=0?t.slice(Math.max(0,i-250),i+700):t.slice(0,500)};
    } catch(e) { return {name,error:String(e)}; }
  }));
  return res.status(200).json(out);
}