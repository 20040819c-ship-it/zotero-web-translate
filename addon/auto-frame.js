/* One cancellable web translation. Never accesses credentials or other tabs.
 * Uses the visible site's composer and correlates the answer with the new user turn.
 */
async function autoTranslationFrame(channel, request, fillSource) {
  const doc = content.document;
  let cancelled = false;
  const cancel = () => { cancelled = true; };
  addMessageListener(channel + ':cancel', cancel);
  const compact = text => String(text || '').replace(/\s/g, '');
  const visible = node => node?.isConnected && node.getClientRects().length > 0
    && content.getComputedStyle(node).visibility !== 'hidden'
    && !node.closest('[hidden], [aria-hidden="true"], [inert]');
  const nodes = selector => [...doc.querySelectorAll(selector)].filter(visible);
  const deadline = Date.now() + (request.timeoutMS || 120000);
  const guard = () => {
    if (cancelled) throw new Error('翻译已取消。');
    if (content.document !== doc || doc.location.origin !== request.origin) throw new Error('网页已离开所选 AI 网站，请回到该网站重试。');
    if (Date.now() > deadline) throw new Error('等待译文超时，请检查网页是否登录、额度或验证码提示。');
  };
  const pause = () => new Promise(resolve => setTimeout(resolve, request.pollMS || 300));
  const notify = data => { if (!cancelled) sendAsyncMessage(channel, data); };
  try {
    guard();
    // A previous submitted selection may still be generating. Wait without clicking Stop.
    while (nodes(request.stop).length) { guard(); await pause(); }
    guard();
    const initialUsers = new Set(doc.querySelectorAll(request.user));
    const initialAnswers = new Set(doc.querySelectorAll(request.assistant));
    // Reuse the verified fill helper. Its reply is redirected to a local callback.
    let filled;
    fillSource(channel, request, data => { filled = data; });
    if (!filled?.ok) throw new Error(filled?.error || '无法填入网页。');
    let sends = [];
    const sendDeadline = Date.now() + 5000;
    do {
      guard();
      sends = nodes(request.send).filter(node => !node.disabled && node.getAttribute('aria-disabled') !== 'true');
      if (sends.length === 1) break;
      await pause();
    } while (Date.now() < sendDeadline);
    if (sends.length !== 1) throw new Error('未能唯一识别发送按钮。请在网页手动发送；自动翻译适配需要更新。');
    guard();
    sends[0].click();
    notify({stage:'sent'});
    let user = null;
    let lastText = '';
    let lastChange = Date.now();
    while (true) {
      guard();
      if (!user?.isConnected) user = nodes(request.user).find(node => !initialUsers.has(node)
        && compact(node.innerText || node.textContent) === compact(request.prompt));
      if (user) {
        // Reject answers from earlier turns and old/reused DOM nodes.
        const answers = nodes(request.assistant).filter(node => !initialAnswers.has(node)
          && (user.compareDocumentPosition(node) & 4));
        if (answers.length > 1) throw new Error('发现多个回答，无法确定本段译文。请查看网页。');
        const answer = answers[0];
        if (answer) {
          const body = answer.querySelector(request.answer);
          const text = (body?.innerText || body?.textContent || '').trim();
          if (text && text !== lastText) {
            lastText = text; lastChange = Date.now();
            notify({stage:'partial',text});
          }
          if (lastText && !nodes(request.stop).length && Date.now() - lastChange >= (request.stableMS || 2000)) {
            notify({ok:true,text:lastText});
            return;
          }
        }
      }
      await pause();
    }
  } catch (error) {
    notify({ok:false,error:error.message || String(error)});
  } finally { removeMessageListener(channel + ':cancel', cancel); }
}
if (typeof module !== 'undefined') module.exports = autoTranslationFrame;
