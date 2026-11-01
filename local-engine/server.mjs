import {createServer} from './server-core.mjs';
import {loadTranslator,translateText} from './model.mjs';
console.log('正在从本地加载英译中模型（禁止远程模型下载）…');
try {
  const translator=await loadTranslator(false);
  const server=createServer(text=>translateText(translator,text));
  server.on('error',error=>{console.error('启动失败：'+error.message);process.exitCode=1;});
  server.listen(27184,'127.0.0.1',()=>console.log('离线翻译已就绪。保持此窗口开启，在 Zotero 选择“离线本地翻译”。'));
} catch(error) {console.error('无法加载模型，请先运行 prepare.mjs：'+error.message);process.exitCode=1;}
