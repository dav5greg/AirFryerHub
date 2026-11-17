export default async function handler(req, res) {
  const q = "reheat fried calamari in air fryer";
  const urls = [
    ["google-basic","https://www.google.com/search?gbv=1&q="+encodeURIComponent(q)],
    ["google-ncr","https://www.google.com/search?udm=14&num=10&q="+encodeURIComponent(q)]
  ];
  const out=await Promise.all(urls.map(async ([name,url])=>{
    try{
      const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36","Accept":"text/html","Accept-Language":"en-US,en;q=0.9"},signal:AbortSignal.timeout(10000)});
      const t=await r.text();
      const i=t.toLowerCase().indexOf("calamari");
      return{name,status:r.status,length:t.length,index:i,excerpt:i>=0?t.slice(Math.max(0,i-250),i+800):t.slice(0,500),classes:[...t.matchAll(/class="([^"]+)"/g)].slice(0,30).map(m=>m[1])};
    }catch(e){return{name,error:String(e)}}
  }));
  return res.status(200).json(out);
}