export default async function handler(req, res) {
  const q = "how to reheat fried calamari in air fryer";
  const hosts = [
    ["searx.be","https://searx.be/search?format=json&q="],
    ["search.sapti.me","https://search.sapti.me/search?format=json&q="],
    ["searx.tiekoetter.com","https://searx.tiekoetter.com/search?format=json&q="],
    ["search.ononoki.org","https://search.ononoki.org/search?format=json&q="]
  ];
  const out=await Promise.all(hosts.map(async ([name,base])=>{
    try{
      const r=await fetch(base+encodeURIComponent(q),{headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"},signal:AbortSignal.timeout(12000)});
      const t=await r.text();
      let parsed=null; try{parsed=JSON.parse(t)}catch{}
      return {name,status:r.status,length:t.length,contentType:r.headers.get("content-type"),results:parsed?.results?.slice(0,5).map(x=>({title:x.title,content:x.content,url:x.url}))||null,excerpt:parsed?undefined:t.slice(0,250)};
    }catch(e){return{name,error:String(e)}}
  }));
  return res.status(200).json(out);
}