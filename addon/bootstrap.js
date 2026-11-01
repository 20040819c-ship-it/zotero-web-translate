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
  for (const file of ['translation.js', 'web-frame.js']) Services.scriptloader.loadSubScript(WT_ROOT + file, globalThis, 'UTF-8');
  await Zotero.initializationPromise;
  await Zotero.uiReadyPromise;
  if (WT_STOPPED) return;
  for (const win of Zotero.getMainWindows()) wtAttach(win);
  WT_SELECTION = event => {
    const text = event.params?.annotation?.text;
    if (!text?.trim()) return;
    const button = event.doc.createElement('button');
    button.textContent = '文译 · 翻译选中文字';
    button.style.cssText = 'padding:5px 8px;cursor:pointer;';
    button.addEventListener('click', () => {
      const win = Zotero.getMainWindows().find(candidate => candidate.Zotero_Tabs?.selectedID === event.reader.tabID)
        || Zotero.getMainWindow();
      const state = WT_WINDOWS.get(win);
      if (!state) return;
      state.source.value = text;
      state.attachmentID = event.reader.itemID;
      state.translation.value = '';
      state.preview.value = '';
      state.show();
      state.status.textContent = '已提取选中文字。检查原文后，点击“生成提示词”。';
    });
    event.append(button);
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
  element('strong', heading, '文译 · 网页翻译');
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
  const notice = element('div', controls, '选中文字仅在你点击“填入网页”时交给所选网站。请检查后在网页点击发送。', 'font-size:12px;color:var(--fill-secondary,#666);');
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
  const status = element('div', controls, '先在下方网页登录，然后选择 PDF 中的文字。', 'font-size:12px;white-space:pre-wrap;');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const translation = area('译文（从网页复制后粘贴到这里）', 2);
  const footer = element('div', controls, '', 'display:flex;gap:6px;');
  const browser = doc.createXULElement('browser');
  browser.id = 'wt-web-browser';
  for (const [name,value] of Object.entries({type:'content', remote:'true', maychangeremoteness:'true', disableglobalhistory:'true', flex:'1'})) browser.setAttribute(name,value);
  browser.style.cssText = 'flex:1;min-height:180px;min-width:0;';
  browser.setAttribute('aria-label', '文译 AI 网页');
  panel.append(browser); host.append(panel);
  const state = { panel, source, preview, translation, status, browser, attachmentID:null, pending:null, loaded:false, menu:null };
  WT_WINDOWS.set(win, state);
  function navigate() {
    const provider = WebTranslation.providers[select.value];
    browser.loadURI(Services.io.newURI(provider.home), {triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
    state.loaded = true;
  }
  function show() {
    panel.hidden = false;
    app.style.setProperty('min-width','0'); app.style.setProperty('flex','1 1 0px');
    if (!state.loaded) navigate();
  }
  function hide() {
    panel.hidden = true;
    if (originalStyle === null) app.removeAttribute('style'); else app.setAttribute('style',originalStyle);
  }
  state.show = show; state.hide = hide;
  select.addEventListener('change', () => {
    state.pending?.();
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
    note.setNote(WebTranslation.noteHTML(source.value,translation.value,WebTranslation.providers[select.value].name));
    await note.saveTx();
    status.textContent = '已保存为“' + parent.getField('title') + '”下的笔记。';
  }));
  button(footer, '网页首页', attempt(() => { state.pending?.(); navigate(); }));
  const menu = doc.createXULElement('menuitem');
  menu.id = 'wt-tools-menu'; menu.setAttribute('label','文译 · 打开 / 收起翻译');
  menu.addEventListener('command', () => panel.hidden ? show() : hide());
  tools.append(menu); state.menu = menu;
}
function wtRemove(win) {
  const state = WT_WINDOWS.get(win);
  if (!state) return;
  state.pending?.(); state.hide(); state.menu?.remove(); state.panel.remove();
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
