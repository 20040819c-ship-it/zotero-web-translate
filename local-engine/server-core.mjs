import http from 'node:http';
export function createServer(translate,{port=27184}={}) {
  let pending=0;
  let queue=Promise.resolve();
  const server=http.createServer(async(req,res)=>{
    const reply=(status,data)=>{
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify(data));
    };
    const host=req.headers.host;
    if(host!==`127.0.0.1:${port}` || req.headers.origin || req.headers['x-zotero-translate']!=='1') {
      reply(403,{error:'仅接受本机 Zotero 请求。'});return;
    }
    if(req.method==='GET' && req.url==='/health') {reply(200,{ready:true,offline:true});return;}
    if(req.method!=='POST' || req.url!=='/translate') {reply(404,{error:'Not found'});return;}
    if(!req.headers['content-type']?.startsWith('application/json')) {reply(415,{error:'JSON required'});return;}
    if(pending>=3) {reply(429,{error:'本地翻译繁忙，请稍后重选。'});return;}
    const buffers=[];let size=0;
    try {
      for await(const chunk of req) {
        size+=chunk.length;
        if(size>65536) {reply(413,{error:'原文过长'});return;}
        buffers.push(chunk);
      }
      const {text}=JSON.parse(Buffer.concat(buffers).toString('utf8'));
      if(typeof text!=='string' || !text.trim() || text.length>16000) {reply(400,{error:'原文为空或过长'});return;}
      pending++;
      const result=queue.then(()=>translate(text));
      queue=result.catch(()=>{});
      try {reply(200,{translation:await result});}
      finally {pending--;}
    } catch(error) {reply(500,{error:error.message || '本地翻译失败'});}
  });
  server.requestTimeout=150000;
  return server;
}
