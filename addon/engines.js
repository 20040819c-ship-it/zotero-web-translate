/* Non-chat translation backends. All cloud requests go only to MyMemory. */
var WT_Engines = {
  // Preserve input exactly while keeping each UTF-8 segment below API limits.
  segments(text, limit = 450) {
    const output = [];
    let current = '', bytes = 0;
    for (const token of String(text).match(/\S+\s*|\s+/gu) || []) {
      const size = encodeURIComponent(token).replace(/%[0-9a-f]{2}/gi,'x').length;
      if (current && bytes + size > limit) { output.push(current); current = ''; bytes = 0; }
      if (size <= limit) { current += token; bytes += size; continue; }
      for (const char of token) {
        const n = encodeURIComponent(char).replace(/%[0-9a-f]{2}/gi,'x').length;
        if (bytes + n > limit) { output.push(current); current = ''; bytes = 0; }
        current += char; bytes += n;
      }
    }
    if (current) output.push(current);
    return output;
  },
  async online(text, http, guard, partial, decode) {
    const translated = [];
    for (const segment of this.segments(text)) {
      guard();
      const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(segment) + '&langpair=en%7Czh-CN';
      const response = await http('GET',url,{responseType:'json',timeout:25000});
      guard();
      const data = response.response;
      if (Number(data?.responseStatus) !== 200 || data?.quotaFinished) throw new Error(data?.responseDetails || '普通在线翻译额度已用完或服务暂时不可用。');
      const result = data?.responseData?.translatedText;
      if (typeof result !== 'string' || !result.trim()) throw new Error('翻译服务未返回有效译文。');
      translated.push(decode(result)); partial(translated.join('\n'));
    }
    return translated.join('\n');
  },
  async offline(text, http, guard) {
    guard();
    let response;
    try {
      response = await http('POST','http://127.0.0.1:27184/translate',{
        headers:{'Content-Type':'application/json','X-Zotero-Translate':'1'},
        body:JSON.stringify({text}),responseType:'json',timeout:120000
      });
    } catch (_) { throw new Error('离线翻译未连接。请先下载模型，并运行本地组件的“启动离线翻译.cmd”。'); }
    guard();
    if (typeof response.response?.translation !== 'string' || !response.response.translation.trim()) throw new Error(response.response?.error || '本地模型没有返回译文。');
    return response.response.translation;
  }
};
if (typeof module !== 'undefined') module.exports = WT_Engines;
