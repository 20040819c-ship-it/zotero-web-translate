const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {parseHTML} = require('linkedom');
const translation = require('../addon/translation.js');
const frame = require('../addon/web-frame.js');

test('prompt preserves scientific symbols, references and source paragraphs', () => {
  const source = 'Pt(111), ε = 2.5 [13–16]\nSecond paragraph.';
  const result = translation.prompt(source,'translate');
  assert.ok(result.includes(source));
  assert.ok(result.includes('只输出译文'));
  assert.ok(translation.prompt(source,'explain').includes('补充解释'));
  assert.throws(() => translation.prompt('   '), /选择文字/);
  assert.throws(() => translation.prompt('a'.repeat(16001)), /16000/);
});

test('notes escape pasted HTML instead of executing website markup', () => {
  const note = translation.noteHTML('<script>alert(1)</script>', '<img src=x onerror=alert(1)>\n中文', 'A&B');
  assert.ok(!note.includes('<script>'));
  assert.ok(!note.includes('<img'));
  assert.ok(note.includes('&lt;script&gt;'));
  assert.ok(note.includes('A&amp;B'));
  assert.ok(note.includes('<br>中文'));
});

function runFrame(html, options = {}) {
  const {document,window} = parseHTML(html);
  const messages = [];
  const events = [];
  const origin = options.origin || 'https://chat.deepseek.com';
  Object.defineProperty(document,'location',{value:{origin}});
  window.getComputedStyle = () => ({visibility:'visible'});
  // Simulate Gecko's native text area value setter and input event.
  class NativeTextArea {}
  Object.defineProperty(NativeTextArea.prototype,'value',{
    set(value) { this.value = value; }, get() {return this.value;}
  });
  const content = {document,getComputedStyle:window.getComputedStyle,Event:window.Event,
    HTMLTextAreaElement:NativeTextArea};
  for (const editor of document.querySelectorAll('textarea,[contenteditable]')) {
    editor.getClientRects = () => [{}];
    editor.focus = () => {};
    editor.addEventListener('input',() => events.push('input'));
  }
  const sendAsyncMessage = (_,data) => messages.push(data);
  const request = {...translation.providers.deepseek,prompt:'翻译 Pt(111)\nε = 2.5'};
  const sandbox = {content,sendAsyncMessage,request,document};
  vm.runInNewContext('(' + frame.toString() + ')("test", request)',sandbox);
  return {document,messages,events};
}

test('fills one visible editor and triggers input without clicking send', () => {
  const result = runFrame('<textarea id="chat-input"></textarea><button id="send">Send</button>');
  assert.equal(result.messages[0].ok,true);
  assert.equal(result.document.querySelector('textarea').value,'翻译 Pt(111)\nε = 2.5');
  assert.deepEqual(result.events,['input']);
});

test('rejects a page outside selected provider origin', () => {
  const result = runFrame('<textarea id="chat-input"></textarea>',{origin:'https://evil.example'});
  assert.equal(result.messages[0].ok,false);
  assert.equal(result.document.querySelector('textarea').value,'');
});

test('does not overwrite an existing user draft', () => {
  const result = runFrame('<textarea id="chat-input">My unsent draft</textarea>');
  assert.equal(result.messages[0].ok,false);
  assert.match(result.messages[0].error,/已有内容/);
  assert.equal(result.document.querySelector('textarea').value,'My unsent draft');
});

test('fails closed when multiple composer candidates exist', () => {
  const result = runFrame('<textarea placeholder="one"></textarea><textarea placeholder="two"></textarea>');
  assert.equal(result.messages[0].ok,false);
  assert.match(result.messages[0].error,/多个/);
});

test('reports missing editor and leaves read-only fields alone', () => {
  assert.equal(runFrame('<div>Sign in</div>').messages[0].ok,false);
  const {document} = parseHTML('<textarea id="chat-input"></textarea>');
  document.querySelector('textarea').disabled = true;
  document.querySelector('textarea').getClientRects = () => [{}];
  const messages=[];
  Object.defineProperty(document,'location',{value:{origin:'https://chat.deepseek.com'}});
  vm.runInNewContext('(' + frame.toString() + ')("test", request)',{
    content:{document,getComputedStyle:()=>({visibility:'visible'})},
    request:{...translation.providers.deepseek,prompt:'text'},
    sendAsyncMessage:(_,data)=>messages.push(data)
  });
  assert.equal(messages[0].ok,false);
});

test('contenteditable insertion is verified and failures are reported', () => {
  const {document,window} = parseHTML('<div id="prompt-textarea" contenteditable="true"></div>');
  const editor=document.querySelector('div');
  editor.getClientRects=()=>[{}]; editor.focus=()=>{};
  const range={selectNodeContents(){}};
  document.createRange=()=>range;
  document.execCommand=(_command,_ui,text)=>{editor.textContent=text; return true;};
  Object.defineProperty(document,'location',{value:{origin:'https://chatgpt.com'}});
  const messages=[];
  const content={document,Event:window.Event,getComputedStyle:()=>({visibility:'visible'}),
    getSelection:()=>({removeAllRanges(){},addRange(){}})};
  const request={...translation.providers.chatgpt,prompt:'Translation prompt'};
  vm.runInNewContext('(' + frame.toString() + ')("test",request)',{content,request,sendAsyncMessage:(_,data)=>messages.push(data)});
  assert.equal(messages[0].ok,true); assert.equal(editor.textContent,request.prompt);
  editor.textContent=''; document.execCommand=()=>false;
  vm.runInNewContext('(' + frame.toString() + ')("test",request)',{content,request,sendAsyncMessage:(_,data)=>messages.push(data)});
  assert.equal(messages[1].ok,false);
});

test('bootstrap unregisters selection hooks at shutdown', () => {
  const code=fs.readFileSync(path.join(__dirname,'../addon/bootstrap.js'),'utf8');
  new vm.Script(code);
  const sandbox={Zotero:{Reader:{unregisterEventListener(type,handler){this.removed={type,handler};}}},APP_SHUTDOWN:2};
  vm.createContext(sandbox); vm.runInContext(code,sandbox);
  sandbox.WT_SELECTION=()=>{};
  sandbox.shutdown({},2);
  assert.equal(sandbox.Zotero.Reader.removed.type,'renderTextSelectionPopup');
  assert.equal(sandbox.WT_STOPPED,true);
  assert.equal(sandbox.WT_SELECTION,null);
});
