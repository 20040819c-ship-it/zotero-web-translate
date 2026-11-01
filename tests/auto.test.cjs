const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {parseHTML} = require('linkedom');
const autoFrame = require('../addon/auto-frame.js');
const providers = require('../addon/translation.js').providers;

function fixture({draft=false, wrongReply=false, cancel=false, oldAnswer=false, noSend=false} = {}) {
  const {document,window} = parseHTML('<main><textarea id="chat-input"></textarea><button aria-label="Send">Send</button></main>');
  const main = document.querySelector('main');
  Object.defineProperty(document,'location',{value:{origin:'https://chat.deepseek.com'}});
  window.HTMLElement.prototype.getClientRects = () => [{}];
  const messages=[];
  const listeners=new Map();
  let clicked=0;
  let filled=0;
  const request={...providers.deepseek,prompt:'Translate this exact source',timeoutMS:1000,pollMS:2,stableMS:8};
  if (oldAnswer) {
    const old=document.createElement('div'); old.setAttribute('data-message-author-role','assistant');
    old.innerHTML='<div class="ds-markdown">OLD translation</div>'; main.prepend(old);
  }
  if (noSend) document.querySelector('button').remove();
  else document.querySelector('button').click=()=>{
    clicked++;
    if (cancel) { listeners.get('test:cancel')(); return; }
    const user=document.createElement('div');user.setAttribute('data-message-author-role','user');
    user.textContent=wrongReply?'A different question':request.prompt;
    main.append(user);
    const answer=document.createElement('div'); answer.setAttribute('data-message-author-role','assistant');
    answer.innerHTML='<div class="ds-markdown">正确译文</div>';main.append(answer);
  };
  const sandbox={content:{document,getComputedStyle:()=>({visibility:'visible'})},request,setTimeout,
    sendAsyncMessage:(_channel,data)=>messages.push(data),
    addMessageListener:(channel,handler)=>listeners.set(channel,handler),
    removeMessageListener:channel=>listeners.delete(channel),
    fill:(_channel,_request,reply)=>{filled++; reply(draft?{ok:false,error:'已有草稿'}:{ok:true});}
  };
  const run=async()=>{
    await vm.runInNewContext('(' + autoFrame.toString() + ')("test",request,fill)',sandbox);
    return {messages,clicked,filled,listeners};
  };
  return {run,request,sandbox,document};
}

test('auto translation sends once and returns only the correlated new answer',async()=>{
  const result=await fixture({oldAnswer:true}).run();
  assert.equal(result.clicked,1);
  assert.ok(result.messages.some(m=>m.stage==='partial' && m.text==='正确译文'));
  assert.equal(result.messages.at(-1).text,'正确译文');
  assert.equal(result.messages.at(-1).ok,true);
  assert.equal(result.listeners.size,0);
});
test('auto translation stops before sending when fill detects a draft',async()=>{
  const result=await fixture({draft:true}).run();
  assert.equal(result.clicked,0);
  assert.equal(result.messages.at(-1).ok,false);
  assert.match(result.messages.at(-1).error,/草稿/);
});
test('never returns a reply to a different user prompt',async()=>{
  const f=fixture({wrongReply:true});f.request.timeoutMS=50;
  const result=await f.run();
  assert.equal(result.messages.at(-1).ok,false);
  assert.ok(!result.messages.some(m=>m.text==='正确译文'));
});
test('cancel suppresses late answers and removes the frame listener',async()=>{
  const result=await fixture({cancel:true}).run();
  assert.equal(result.clicked,1);
  assert.equal(result.messages.length,0);
  assert.equal(result.listeners.size,0);
});
test('checks origin before accessing the composer or sending',async()=>{
  const f=fixture();f.document.location.origin='https://other.example';
  const result=await f.run();
  assert.equal(result.clicked,0);assert.equal(result.filled,0);
  assert.equal(result.messages.at(-1).ok,false);
});

// Exercise real selection scheduling without a running Zotero or user account.
async function scheduler() {
  const {document,window}=parseHTML('<html><body><div id="browser"><div id="appcontent"></div></div><div id="menu_ToolsPopup"></div></body></html>');
  // linkedom does not implement the native select.value setter/default choice.
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{
    configurable:true,
    get(){return this._testValue ?? this.querySelector('option')?.value;},
    set(value){this._testValue=value;}
  });
  document.createXULElement=tag=>document.createElement(tag);
  window.setTimeout=setTimeout; window.clearTimeout=clearTimeout;
  const requests=[];
  const sandbox={Zotero:{Prefs:{get:()=>undefined,set(){}},getMainWindows:()=>[window]},setTimeout,clearTimeout};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../addon/translation.js'),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../addon/bootstrap.js'),'utf8'),sandbox);
  sandbox.wtAttach(window);
  const state=sandbox.WT_WINDOWS.get(window);state.loaded=true;state.backend.value='ai';
  sandbox.wtAuto=async(_win,_state,request,partial)=>{
    requests.push(request.prompt);partial('译文：'+request.prompt);return '完成：'+request.prompt;
  };
  const output=()=>{const div=document.createElement('div');document.body.append(div);return div;};
  return {sandbox,state,window,requests,output};
}
test('rapid reselection sends only the newest paragraph and caches its answer',async()=>{
  const s=await scheduler();
  const first=s.output(),second=s.output();
  s.state.schedule('old source',1,first);
  s.state.schedule('new source',1,second);
  await new Promise(resolve=>setTimeout(resolve,520));
  assert.equal(s.requests.length,1);
  assert.ok(s.requests[0].includes('new source'));
  assert.ok(!s.requests[0].includes('old source'));
  const third=s.output();s.state.schedule('new source',1,third);
  assert.equal(s.requests.length,1);
  assert.equal(third.textContent,second.textContent);
  s.sandbox.wtRemove(s.window);
});
test('new selection ignores a late response from the previous request',async()=>{
  const s=await scheduler();const deferred=[];
  s.sandbox.wtAuto=(_win,_state,request,partial)=>new Promise(resolve=>deferred.push({resolve,partial}));
  const first=s.output(),second=s.output();
  s.state.schedule('first',1,first);
  await new Promise(resolve=>setTimeout(resolve,480));
  s.state.schedule('second',1,second);
  deferred[0].partial('STALE');deferred[0].resolve('STALE');
  await new Promise(resolve=>setTimeout(resolve,480));
  assert.ok(!s.state.translation.value.includes('STALE'));
  deferred[1].partial('LATEST');deferred[1].resolve('LATEST');
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(second.textContent,'LATEST');
  assert.equal(s.state.translation.value,'LATEST');
  s.sandbox.wtRemove(s.window);
});
