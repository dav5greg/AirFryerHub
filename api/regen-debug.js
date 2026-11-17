export default async function handler(req, res) {
  const q = "reheat fried calamari in air fryer";
  const targets = [
    ["brave", "https://search.brave.com/search?q=" + encodeURIComponent(q)],
    ["mojeek", "https://www.mojeek.com/search?q=" + encodeURIComponent(q)],
    ["yahoo", "https://search.yahoo.com/search?p=" + encodeURIComponent(q)],
    ["ecosia", "https://www.ecosia.org/search?q=" + encodeURIComponent(q)]
  ];
  const results = await Promise.all(targets.map(async ([name,url]) => {
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
      const index=html.toLowerCase().indexOf("calamari");
      return {name,status:response.status,length:html.length,index,hasAirFryer:/air fryer/i.test(html),excerpt:index>=0?html.slice(Math.max(0,index-250),index+500):html.slice(0,250)};
    } catch(error) { return {name,error:String(error)}; }
  }));
  return res.status(200).json(results);
}