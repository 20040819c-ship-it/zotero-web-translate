const {test}=require('node:test');
const assert=require('node:assert/strict');
const engines=require('../addon/engines.js');

test('online segments preserve input and never exceed documented 500 UTF-8 bytes',()=>{
  const source=('A scientific sentence. 氢键 ε = 2.5. 😀\n').repeat(80);
  const chunks=engines.segments(source);
  assert.equal(chunks.join(''),source);
  assert.ok(chunks.every(chunk=>Buffer.byteLength(chunk,'utf8')<=450));
  const long=engines.segments('水'.repeat(1000));
  assert.equal(long.join(''),'水'.repeat(1000));
  assert.ok(long.every(chunk=>Buffer.byteLength(chunk)<=450));
});
test('ordinary online mode uses only official translation endpoint, without AI prompt',async()=>{
  const urls=[];const partial=[];
  const result=await engines.online('Water molecules.',async(method,url)=>{
    urls.push(url);assert.equal(method,'GET');
    return {response:{responseStatus:200,responseData:{translatedText:'水分子。'}}};
  },()=>{},value=>partial.push(value),value=>value);
  assert.equal(result,'水分子。');assert.equal(partial[0],result);
  assert.equal(new URL(urls[0]).hostname,'api.mymemory.translated.net');
  assert.equal(new URL(urls[0]).searchParams.get('q'),'Water molecules.');
});
test('online quota error is shown instead of being accepted as translated text',async()=>{
  await assert.rejects(engines.online('Text',async()=>({response:{responseStatus:403,responseDetails:'quota'}}),()=>{},()=>{},x=>x),/quota/);
});
test('offline mode sends source only to fixed loopback endpoint and handles unavailable engine',async()=>{
  const value=await engines.offline('Water',async(method,url,options)=>{
    assert.equal(method,'POST');assert.equal(url,'http://127.0.0.1:27184/translate');
    assert.deepEqual(JSON.parse(options.body),{text:'Water'});
    return {response:{translation:'水'}};
  },()=>{});
  assert.equal(value,'水');
  await assert.rejects(engines.offline('Water',async()=>{throw new Error('offline');},()=>{}),/启动离线翻译/);
});
test('local service accepts Zotero loopback requests but rejects browser origins',async t=>{
  const {createServer}=await import('../local-engine/server-core.mjs');
  // Bind port zero in test; use the real selected port in Host validation.
  const probe=require('node:net').createServer();
  await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const seen=[];
  const server=createServer(async text=>{seen.push(text);return '译文：'+text;},{port});
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${port}/translate`;
  const headers={'Content-Type':'application/json','X-Zotero-Translate':'1'};
  const result=await fetch(url,{method:'POST',headers,body:JSON.stringify({text:'Hydrogen 氢'})});
  assert.equal(result.status,200);assert.equal((await result.json()).translation,'译文：Hydrogen 氢');
  const blocked=await fetch(url,{method:'POST',headers:{...headers,Origin:'https://other.example'},body:JSON.stringify({text:'secret'})});
  assert.equal(blocked.status,403);assert.deepEqual(seen,['Hydrogen 氢']);
  const invalid=await fetch(url,{method:'POST',headers,body:JSON.stringify({text:''})});
  assert.equal(invalid.status,400);
});
