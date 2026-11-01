import {pipeline,env} from '@huggingface/transformers';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
export const MODEL = 'Xenova/opus-mt-en-zh';
export async function loadTranslator(download = false) {
  env.cacheDir = path.join(root,'models');
  env.allowRemoteModels = download;
  env.allowLocalModels = true;
  // Quantized OPUS-MT: a dedicated English-to-Chinese model, no chat service.
  return pipeline('translation',MODEL,{
    dtype:'q8',device:'cpu',local_files_only:!download,
    progress_callback:download ? data => {
      if(data.status === 'done') console.log('已准备：' + data.file);
    } : undefined
  });
}
export function splitText(text) {
  // Bound each inference input; do not silently truncate a whole long selection.
  const parts = [];
  for (const paragraph of text.split(/\n+/).filter(s=>s.trim())) {
    let current = '';
    for(const word of paragraph.match(/\S+\s*/g) || []) {
      if(current.length + word.length > 300 && current) {parts.push(current.trim());current='';}
      if(word.length > 300) {
        if(current) {parts.push(current.trim());current='';}
        for(let i=0;i<word.length;i+=300) parts.push(word.slice(i,i+300));
      } else current += word;
    }
    if(current.trim()) parts.push(current.trim());
  }
  return parts;
}
export async function translateText(translator,text) {
  const outputs=[];
  for(const part of splitText(text)) {
    const result=await translator(part,{max_new_tokens:384});
    if(!result[0]?.translation_text?.trim()) throw new Error('本地模型未返回译文。');
    outputs.push(result[0].translation_text.trim());
  }
  return outputs.join('\n');
}
