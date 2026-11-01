/* Sidebar/frame transport approach adapted from Li Yang's AI Web for Zotero (MIT).
 * Selection integration uses Zotero.Reader's documented event API.
 */
var WT_WINDOWS = new Map();
var WT_ID = "web-translate-for-zotero@20040819c-ship-it";
var WT_ROOT;
var WT_STOPPED = false;
var WT_SELECTION;
var WT_NS = "http://www.w3.org/1999/xhtml";

function install() {}
function uninstall() {}
async function startup(data) {
  WT_STOPPED = false;
  WT_ID = data.id;
  WT_ROOT = data.rootURI;
  for (const file of ['translation.js', 'web-frame.js', 'auto-frame.js', 'engines.js']) Services.scriptloader.loadSubScript(WT_ROOT + file, globalThis, 'UTF-8');
  await Zotero.initializationPromise;
  await Zotero.uiReadyPromise;
  if (WT_STOPPED) return;
  for (const win of Zotero.getMainWindows()) wtAttach(win);
  WT_SELECTION = event => {
    const text = event.params?.annotation?.text;
    if (!text?.trim()) return;
    const win = Zotero.getMainWindows().find(candidate => candidate.Zotero_Tabs?.selectedID === event.reader.tabID);
    const state = WT_WINDOWS.get(win);
    if (!state) return;
    const box = event.doc.createElement('div');
    box.style.cssText = 'max-width:420px;min-width:240px;max-height:240px;overflow:auto;padding:8px;white-space:pre-wrap;font:13px/1.6 system-ui;user-select:text;';
    box.setAttribute('role','status'); box.setAttribute('aria-live','polite');
    const output = event.doc.createElement('div');
    box.append(output);
    const retry = event.doc.createElement('button');
    retry.textContent = '重新翻译';
    retry.style.cssText = 'margin-top:6px;';
    retry.addEventListener('click', () => state.schedule(text,event.reader.itemID,output,true));
    box.append(retry); event.append(box);
    if (state.auto.checked) state.schedule(text,event.reader.itemID,output);
    else output.textContent = '文译自动翻译已关闭，可在侧栏开启，或点击“重新翻译”。';
  };
  Zotero.Reader.registerEventListener('renderTextSelectionPopup', WT_SELECTION, data.id);
}
function onMainWindowLoad({window}) { if (!WT_STOPPED) wtAttach(window); }
function onMainWindowUnload({window}) { wtRemove(window); }
function shutdown(data, reason) {
  WT_STOPPED = true;
  if (WT_SELECTION) Zotero.Reader.unregisterEventListener('renderTextSelectionPopup', WT_SELECTION);
  WT_SELECTION = null;
  if (reason === APP_SHUTDOWN) return;
  for (const win of [...WT_WINDOWS.keys()]) wtRemove(win);
}
function wtAttach(win) {
  if (WT_WINDOWS.has(win)) return;
  const doc = win.document;
  const host = doc.getElementById('browser');
  const app = doc.getElementById('appcontent');
  const tools = doc.getElementById('menu_ToolsPopup');
  if (!host || !app || !tools) return;
  const element = (tag, parent, text, css) => {
    const node = doc.createElementNS(WT_NS, tag);
    if (text) node.textContent = text;
    if (css) node.style.cssText = css;
    parent.append(node); return node;
  };
  const originalStyle = app.getAttribute('style');
  const panel = doc.createXULElement('vbox');
  panel.id = 'wt-panel'; panel.hidden = true;
  panel.style.cssText = 'width:560px;min-width:320px;max-width:70vw;min-height:0;flex:0 0 auto;border-left:1px solid #8888;background:var(--material-background,Canvas);color:CanvasText;';
  const controls = element('div', panel, '', 'padding:10px;display:flex;flex-direction:column;gap:7px;font:13px system-ui;max-height:55vh;overflow:auto;');
  const heading = element('div', controls, '', 'display:flex;align-items:center;gap:8px;');
  element('strong', heading, '文译 · 选中即译');
  const backend = element('select',heading);
  backend.setAttribute('aria-label','翻译模式');
  for(const [id,label] of [['online','普通在线翻译'],['offline','离线本地翻译'],['ai','AI 网页翻译']]) element('option',backend,label).value=id;
  const storedBackend=Zotero.Prefs.get('extensions.webTranslate.backend',true);
  backend.value=['online','offline','ai'].includes(storedBackend)?storedBackend:'online';
  const select = element('select', heading);
  select.setAttribute('aria-label', 'AI 网站');
  for (const [id, provider] of Object.entries(WebTranslation.providers)) {
    const option = element('option', select, provider.name); option.value = id;
  }
  const stored = Zotero.Prefs.get('extensions.webTranslate.provider', true);
  select.value = WebTranslation.providers[stored] ? stored : 'chatgpt';
  const button = (parent, label, action) => {
    const node = element('button', parent, label, 'padding:5px 8px;cursor:pointer;font:inherit;');
    node.type = 'button'; node.addEventListener('click', action); return node;
  };
  button(heading, '收起', () => hide());
  const autoLabel = element('label', controls, '', 'display:flex;align-items:center;gap:6px;');
  const auto = element('input',autoLabel); auto.type = 'checkbox';
  auto.checked = Zotero.Prefs.get('extensions.webTranslate.auto',true) !== false;
  element('span',autoLabel,'选中即翻译');
  const notice = element('div', controls, '', 'font-size:12px;color:var(--fill-secondary,#666);');
  const area = (label, rows) => {
    const wrapper = element('label', controls, label);
    const field = element('textarea', wrapper, '', 'box-sizing:border-box;display:block;width:100%;resize:vertical;padding:6px;font:13px/1.5 system-ui;');
    field.rows = rows; return field;
  };
  const source = area('原文（可修改或粘贴）', 3);
  const modeLine = element('label', controls, '翻译方式：');
  const mode = element('select', modeLine);
  for (const [id, label] of [['translate','仅翻译'], ['explain','翻译并解释术语']]) {
    element('option', mode, label).value = id;
  }
  const preview = area('提示词预览（可修改）', 2);
  const actions = element('div', controls, '', 'display:flex;flex-wrap:wrap;gap:6px;');
  const status = element('div', controls, '在 PDF 中选中英文并松开鼠标，即可翻译。', 'font-size:12px;white-space:pre-wrap;');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const translation = area('译文（自动显示，也可粘贴修改）', 3);
  const footer = element('div', controls, '', 'display:flex;gap:6px;');
  const browser = doc.createXULElement('browser');
  browser.id = 'wt-web-browser';
  for (const [name,value] of Object.entries({type:'content', remote:'true', maychangeremoteness:'true', disableglobalhistory:'true', flex:'1'})) browser.setAttribute(name,value);
  browser.style.cssText = 'flex:1;min-height:180px;min-width:0;';
  browser.setAttribute('aria-label', '文译 AI 网页');
  panel.append(browser); host.append(panel);
  const state = { panel, source, preview, translation, status, browser, auto, backend, attachmentID:null, pending:null, loaded:false, menu:null,
    sequence:0, debounce:null, cache:new Map(), activeKey:null, listeners:new Set() };
  WT_WINDOWS.set(win, state);
  function navigate() {
    const provider = WebTranslation.providers[select.value];
    browser.loadURI(Services.io.newURI(provider.home), {triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
    state.loaded = true;
  }
  function show(load = true) {
    panel.hidden = false;
    app.style.setProperty('min-width','0'); app.style.setProperty('flex','1 1 0px');
    if (load && backend.value==='ai' && !state.loaded) navigate();
  }
  function hide() {
    panel.hidden = true;
    if (originalStyle === null) app.removeAttribute('style'); else app.setAttribute('style',originalStyle);
  }
  state.show = show; state.hide = hide;
  function refreshBackend() {
    const ai=backend.value==='ai';
    select.hidden=!ai; browser.hidden=!ai; modeLine.hidden=!ai;
    preview.parentElement.hidden=!ai; actions.hidden=!ai;
    notice.textContent=ai ? '选中文字自动发送到已登录的 AI 网站，并读回译文。' : backend.value==='online'
      ? '普通在线：选中文字发送到 MyMemory 翻译服务，无需 AI 账号。匿名免费额度有限。'
      : '离线：只连接本机英译中模型，不上传原文。首次需下载模型并启动离线组件。';
    controls.style.maxHeight=ai?'55vh':'90vh';
  }
  refreshBackend();
  state.cancelAuto = () => {
    state.sequence++;
    win.clearTimeout(state.debounce); state.debounce = null;
    state.pending?.(); state.activeKey = null; state.listeners.clear();
  };
  auto.addEventListener('change', () => {
    Zotero.Prefs.set('extensions.webTranslate.auto',auto.checked,true);
    if (!auto.checked) { state.cancelAuto(); status.textContent = '已关闭选中即翻译；已发送的网页请求可能继续生成。'; }
  });
  state.schedule = (text, attachmentID, output, force = false) => {
    const provider = WebTranslation.providers[select.value];
    const engine = backend.value;
    const key = JSON.stringify([attachmentID,engine,select.value,mode.value,text]);
    if (!force && state.activeKey === key) {
      state.listeners.add(output); output.textContent = translation.value || status.textContent;
      return;
    }
    state.cancelAuto();
    const sequence = state.sequence;
    state.activeKey = key; state.listeners.add(output);
    source.value = text; state.attachmentID = attachmentID;
    translation.value = ''; preview.value = '';
    const update = message => {
      if (sequence !== state.sequence) return;
      status.textContent = message;
      for (const target of state.listeners) if (target.isConnected) target.textContent = message;
    };
    if (!force && state.cache.has(key)) {
      translation.value = state.cache.get(key); update(translation.value);
      state.activeKey = null; return;
    }
    update('文译：正在准备翻译…');
    state.debounce = win.setTimeout(async () => {
      state.debounce = null;
      if (sequence !== state.sequence) return;
      try {
        const guard=()=>{if(sequence!==state.sequence) throw new Error('翻译已取消。');};
        const partial = value => {
          if (sequence !== state.sequence) return;
          translation.value = value; update(value);
        };
        let result;
        if(engine==='ai') {
          preview.value = WebTranslation.prompt(text,mode.value);
          if (!state.loaded) {
            show();
            throw new Error('请先在文译侧栏登录 ' + provider.name + '，完成后重新选择文字即可自动翻译。');
          }
          show(false);
          update('文译：正在等待 ' + provider.name + ' 返回译文…');
          result=await wtAuto(win,state,{...provider,prompt:preview.value,automatic:true},partial);
        } else {
          const http=(...args)=>Zotero.HTTP.request(...args);
          if(!text.trim() || text.length>16000) throw new Error('请选择 16000 字符以内的英文段落。');
          if(engine==='offline') {
            update('文译：本地模型正在翻译…');
            result=await WT_Engines.offline(text,http,guard);
          } else {
            update('文译：普通在线翻译中…');
            const decode=value=>{
              const decoder=doc.createElementNS(WT_NS,'textarea');
              decoder.innerHTML=value;
              return decoder.value;
            };
            result=await WT_Engines.online(text,http,guard,partial,decode);
          }
        }
        if (sequence !== state.sequence) return;
        translation.value = result; update(result);
        state.cache.set(key,result);
        if (state.cache.size > 30) state.cache.delete(state.cache.keys().next().value);
      } catch (error) {
        update('文译：' + (error.message || String(error)));
      } finally {
        if (sequence === state.sequence) state.activeKey = null;
      }
    },450);
  };
  backend.addEventListener('change',()=>{
    state.cancelAuto();
    Zotero.Prefs.set('extensions.webTranslate.backend',backend.value,true);
    translation.value=''; refreshBackend();
    if(backend.value==='ai' && !state.loaded) navigate();
    status.textContent='已切换翻译模式，重新选择英文即可自动翻译。';
  });
  select.addEventListener('change', () => {
    state.cancelAuto();
    Zotero.Prefs.set('extensions.webTranslate.provider', select.value, true);
    navigate(); status.textContent = '已切换网站，请完成登录后再填入提示词。';
  });
  const attempt = action => async () => {
    try { await action(); } catch (error) { status.textContent = error.message || String(error); Zotero.logError(error); }
  };
  button(actions, '生成提示词', attempt(() => {
    preview.value = WebTranslation.prompt(source.value, mode.value);
    status.textContent = '提示词已生成，请检查后填入网页。';
  }));
  button(actions, '复制提示词', attempt(() => {
    if (!preview.value.trim()) preview.value = WebTranslation.prompt(source.value, mode.value);
    Components.classes['@mozilla.org/widget/clipboardhelper;1'].getService(Components.interfaces.nsIClipboardHelper).copyString(preview.value);
    status.textContent = '已复制。可在下方网页输入框粘贴并发送。';
  }));
  const fill = button(actions, '填入网页', attempt(async () => {
    state.cancelAuto();
    if (!preview.value.trim()) preview.value = WebTranslation.prompt(source.value, mode.value);
    const provider = WebTranslation.providers[select.value];
    const providerName = provider.name;
    fill.disabled = true;
    status.textContent = '正在填入 ' + providerName + '…';
    try {
      await wtFill(win, state, {...provider, prompt:preview.value});
      status.textContent = '已填入 ' + providerName + '。请在网页里检查并点击发送；译文会显示在网页中。';
    } finally { fill.disabled = false; }
  }));
  button(footer, '保存为文献笔记', attempt(async () => {
    if (!source.value.trim() || !translation.value.trim()) throw new Error('请保留原文，并将网页译文粘贴到“译文”框。');
    if (!state.attachmentID) throw new Error('请先在要关联的 PDF 中选择文字并点击“文译”，再保存。');
    const attachment = Zotero.Items.get(state.attachmentID);
    if (!attachment?.isAttachment()) throw new Error('找不到来源 PDF，请重新选中文字。');
    const parent = attachment.parentItem;
    if (!parent) throw new Error('这是独立 PDF。请先在文献库为它创建父条目，再保存笔记。');
    const note = new Zotero.Item('note');
    note.libraryID = parent.libraryID; note.parentID = parent.id;
    const service=backend.value==='online'?'MyMemory 普通在线翻译':backend.value==='offline'?'OPUS-MT 本地离线翻译':WebTranslation.providers[select.value].name;
    note.setNote(WebTranslation.noteHTML(source.value,translation.value,service));
    await note.saveTx();
    status.textContent = '已保存为“' + parent.getField('title') + '”下的笔记。';
  }));
  button(footer, '网页首页', attempt(() => { state.cancelAuto(); navigate(); }));
  const menu = doc.createXULElement('menuitem');
  menu.id = 'wt-tools-menu'; menu.setAttribute('label','文译 · 打开 / 收起翻译');
  menu.addEventListener('command', () => panel.hidden ? show() : hide());
  tools.append(menu); state.menu = menu;
}
function wtRemove(win) {
  const state = WT_WINDOWS.get(win);
  if (!state) return;
  state.cancelAuto(); state.hide(); state.menu?.remove(); state.panel.remove();
  WT_WINDOWS.delete(win);
}
function wtFill(win, state, request) {
  if (state.pending) return Promise.reject(new Error('请等待上一次填入完成。'));
  const manager = state.browser.messageManager || state.browser.frameLoader?.messageManager;
  if (!manager?.loadFrameScript) return Promise.reject(new Error('网页未就绪，请等待加载或使用“复制提示词”。'));
  const channel = 'WebTranslate:Fill:' + Services.uuid.generateUUID();
  return new Promise((resolve,reject) => {
    let done = false;
    const finish = result => {
      if (done) return;
      done = true; win.clearTimeout(timer); manager.removeMessageListener(channel,onMessage); state.pending = null;
      result.ok ? resolve() : reject(new Error(result.error));
    };
    const onMessage = message => finish(message.data);
    const timer = win.setTimeout(() => finish({error:'填入超时，请使用“复制提示词”，在网页手动粘贴。'}),8000);
    state.pending = () => finish({error:'填入已取消。'});
    manager.addMessageListener(channel,onMessage);
    try {
      const script = '(' + fillTranslationFrame.toString() + ')(' + JSON.stringify(channel) + ',' + JSON.stringify(request) + ');';
      manager.loadFrameScript('data:application/javascript;charset=utf-8,' + encodeURIComponent(script),false);
    } catch (error) { finish({error:error.message}); }
  });
}

function wtAuto(win, state, request, onPartial) {
  const manager = state.browser.messageManager || state.browser.frameLoader?.messageManager;
  if (!manager?.loadFrameScript) return Promise.reject(new Error('AI 网页尚未加载，请先打开文译侧栏登录，再选中文字。'));
  const channel = 'WebTranslate:Auto:' + Services.uuid.generateUUID();
  return new Promise((resolve,reject) => {
    let done = false;
    const finish = result => {
      if (done) return;
      done = true; win.clearTimeout(timer); manager.removeMessageListener(channel,onMessage);
      try { manager.sendAsyncMessage(channel + ':cancel',{}); } catch (_) {}
      state.pending = null;
      result.ok ? resolve(result.text) : reject(new Error(result.error));
    };
    const onMessage = message => {
      if (message.data.stage === 'partial') onPartial(message.data.text);
      else if (!message.data.stage) finish(message.data);
    };
    const timer = win.setTimeout(() => finish({error:'等待翻译超时，请检查下方网页。'}),125000);
    state.pending = () => finish({error:'翻译已取消。'});
    manager.addMessageListener(channel,onMessage);
    const script = '(' + autoTranslationFrame.toString() + ')(' + JSON.stringify(channel) + ',' + JSON.stringify(request)
      + ',(' + fillTranslationFrame.toString() + '));';
    try { manager.loadFrameScript('data:application/javascript;charset=utf-8,' + encodeURIComponent(script),false); }
    catch (error) { finish({error:error.message}); }
  });
}
