import {loadTranslator,translateText} from './model.mjs';
console.log('首次下载专用英译中模型。模型文件只保存在本组件 models 文件夹。');
try {
  const translator=await loadTranslator(true);
  console.log('示例验证：' + await translateText(translator,'Water molecules form hydrogen bonds.'));
  await translator.dispose();
  console.log('模型准备完成。以后运行 server.mjs 不允许联网下载模型。');
} catch(error) { console.error('模型准备失败：'+error.message);process.exitCode=1; }
