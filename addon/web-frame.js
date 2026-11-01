/* Runs only in the embedded browser. Does not submit, read answers or credentials. */
function fillTranslationFrame(channel, request, reply = null) {
  const respond = data => reply ? reply(data) : sendAsyncMessage(channel,data);
  try {
    const doc = content.document;
    if (doc.location.origin !== request.origin) throw new Error("网站已切换或正在登录，请回到所选 AI 网站后重试。");
    const visible = node => node.isConnected && node.getClientRects().length
      && content.getComputedStyle(node).visibility !== "hidden"
      && !node.closest('nav, aside, [hidden], [aria-hidden="true"], [data-message-author-role], [role="dialog"]');
    let editors = [];
    for (const selector of request.selectors) {
      editors = [...doc.querySelectorAll(selector)].filter(node => visible(node)
        && !node.disabled && !node.readOnly && node.getAttribute('contenteditable') !== 'false');
      if (editors.length) break;
    }
    if (editors.length !== 1) throw new Error(editors.length ? "发现多个输入框，请关闭其他编辑框后重试。" : "找不到聊天输入框。请先登录并等待网页加载，或使用复制提示词。");
    const editor = editors[0];
    const text = editor.tagName.toLowerCase() === 'textarea' ? editor.value : editor.textContent;
    if (String(text || '').trim()) throw new Error("网页输入框里已有内容。请先发送或清空，插件不会覆盖草稿。");
    // In auto mode, avoid taking keyboard focus away from the PDF selection.
    const oldFocus = doc.activeElement;
    editor.focus();
    if (editor.tagName.toLowerCase() === 'textarea') {
      // Use the page realm's native setter so controlled inputs receive the update.
      const page = content.wrappedJSObject || content;
      const setter = Object.getOwnPropertyDescriptor(page.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(editor.wrappedJSObject || editor, request.prompt);
      editor.dispatchEvent(new content.Event('input', {bubbles: true}));
    } else {
      const selection = content.getSelection();
      const range = doc.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges(); selection.addRange(range);
      if (!doc.execCommand('insertText', false, request.prompt)) throw new Error("网页不接受自动填入，请使用复制提示词。");
    }
    const actual = editor.tagName.toLowerCase() === 'textarea' ? editor.value : editor.textContent;
    const compact = value => String(value || '').replace(/\s/g, '');
    if (compact(actual) !== compact(request.prompt)) throw new Error("填入结果未通过检查，请使用复制提示词。");
    if (request.automatic && oldFocus && oldFocus !== editor) oldFocus.focus();
    respond({ok: true});
  } catch (error) {
    respond({ok: false, error: error.message || String(error)});
  }
}
if (typeof module !== "undefined") module.exports = fillTranslationFrame;
