const $ = id => document.getElementById(id);
let info = {url:'',videoId:'',title:'YouTube Video',channel:''}, segments = [], translated = [], summary = '', mindmap = null;
const fmt = s => {s=Math.max(0,Math.floor(Number(s)||0));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`};
function setStatus(s){$('status').textContent=s}
function safe(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function cfg(){return await chrome.storage.local.get({supadataKey:'',apiBase:'https://api.openai.com/v1',aiKey:'',model:'gpt-4o-mini',vault:'',folder:'YouTube'})}
async function loadCfg(){const c=await cfg(); for(const k of ['supadataKey','apiBase','aiKey','model','vault','folder']) $(k).value=c[k]}
async function videoInfo(){const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});if(!tab?.url?.includes('youtube.com/watch')){setStatus('请先打开 YouTube 普通视频页面。');return}try{info=await chrome.tabs.sendMessage(tab.id,{type:'GET_VIDEO_INFO'});}catch{info={url:tab.url.split('&')[0],videoId:new URL(tab.url).searchParams.get('v')||'',title:tab.title||'YouTube Video',channel:''}}$('videoTitle').textContent=info.title||'YouTube Video';$('channel').textContent=info.channel||info.url}
async function callAI(prompt){const c=await cfg();if(!c.aiKey)throw Error('请先在设置中填写 AI API Key');const base=c.apiBase.replace(/\/$/,'');const r=await fetch(base+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+c.aiKey},body:JSON.stringify({model:c.model||'gpt-4o-mini',temperature:0.2,messages:[{role:'system',content:'你是严谨的中文视频学习助手。只根据提供的字幕回答，不要编造信息。'}, {role:'user',content:prompt}]})});if(!r.ok)throw Error('AI API 请求失败：HTTP '+r.status+'。请检查 API 地址、Key 和模型。');const j=await r.json();return j.choices?.[0]?.message?.content||''}
async function requestTranscript(mode, lang='en'){
 const url='https://api.supadata.ai/v1/transcript?url='+encodeURIComponent(info.url||('https://www.youtube.com/watch?v='+info.videoId))+'&text=false&lang='+encodeURIComponent(lang)+'&mode='+encodeURIComponent(mode);
 const r=await fetch(url,{headers:{'x-api-key':(await cfg()).supadataKey}});
 const j=await r.json().catch(()=>({}));
 if(!r.ok && r.status!==202 && r.status!==206) throw Error('字幕服务返回 HTTP '+r.status+'：'+(j.message||j.error||'请求失败'));
 if(j.jobId){
  setStatus('正在进行 AI 语音转录，请稍候…');
  for(let i=0;i<30;i++){
   await new Promise(resolve=>setTimeout(resolve,2000));
   const pr=await fetch('https://api.supadata.ai/v1/transcript/'+encodeURIComponent(j.jobId),{headers:{'x-api-key':(await cfg()).supadataKey}});
   const pj=await pr.json().catch(()=>({}));
   if(!pr.ok) throw Error('查询转录任务失败：HTTP '+pr.status+' '+(pj.message||pj.error||''));
   if(pj.status==='completed'||pj.content) return pj;
   if(pj.status==='failed') throw Error('Supadata AI 转录失败：'+(pj.error||pj.message||'未知错误'));
  }
  throw Error('AI 转录仍在处理中，请稍后再次点击“获取字幕”。');
 }
 return j;
}
function normalizeTranscript(j){
 const content=Array.isArray(j.content)?j.content:(typeof j.content==='string'?[{text:j.content,offset:0,duration:0}]:(j.text?[{text:j.text,offset:0,duration:0}]:[]));
 return content.map(x=>{const offset=Number(x.offset??x.start??0);return {text:String(x.text||''),start:offset>0?offset/1000:0,duration:Number(x.duration||0)/1000};}).filter(x=>x.text.trim());
}
async function getTranscript(){
 await videoInfo();const c=await cfg();
 if(!info.videoId)return setStatus('没有识别到视频 ID');
 if(!c.supadataKey)return setStatus('请在设置中填写 Supadata API Key');
 setStatus('优先获取英语字幕；若没有可用字幕，将尝试 AI 语音转录…');
 try{
  let j=await requestTranscript('auto','en');
  let result=normalizeTranscript(j);
  let language=String(j.lang||j.content?.[0]?.lang||'unknown').toLowerCase();
  // If auto returns a non-English native caption (e.g. Arabic dubbing/captions), retry with generated English transcription.
  if(!result.length || (language!=='unknown' && language!=='en')){
   setStatus('返回的字幕语言为 '+language+'，正在尝试生成英语转录…');
   const generated=await requestTranscript('generate','en');
   const generatedSegments=normalizeTranscript(generated);
   const generatedLang=String(generated.lang||generated.content?.[0]?.lang||'unknown').toLowerCase();
   if(generatedSegments.length && (generatedLang==='en'||generatedLang==='unknown'||!result.length)){
    j=generated;result=generatedSegments;language=generatedLang;
   } else if(!result.length && generatedSegments.length){j=generated;result=generatedSegments;language=generatedLang;}
  }
  if(!result.length)throw Error('没有返回可用字幕或转录文本。请确认视频可访问，并检查 Supadata 额度。');
  segments=result;translated=[];renderTranscript();
  $('transcriptStatus').textContent=`已获取 ${segments.length} 段内容 · 识别语言：${language==='unknown'?'服务未注明':language}`;
  if(language!=='en' && language!=='unknown')setStatus('已获取内容，但语言仍为 '+language+'。若视频音轨本身是英语，请检查该视频是否使用了其他语言配音，或 Supadata 是否返回了非英语结果。');
  else setStatus('字幕/转录已加载（优先英语；无字幕时已尝试 AI 转录）。');
 }catch(e){setStatus(e.message+'。请检查 Supadata API Key、额度及视频是否可访问。')}
}
function renderTranscript(){const mode=$('viewMode').value;$('transcriptList').innerHTML=segments.map((s,i)=>`<div class="caption"><span class="time" data-seek="${s.start}">${fmt(s.start)}</span>${mode!=='zh'?`<div class="orig">${safe(s.text)}</div>`:''}${mode!=='original'&&translated[i]?`<div class="trans">${safe(translated[i])}</div>`:''}</div>`).join('');$('transcriptList').querySelectorAll('[data-seek]').forEach(el=>el.onclick=async()=>{const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});chrome.tabs.sendMessage(tab.id,{type:'SEEK_VIDEO',seconds:Number(el.dataset.seek)})})}
async function translate(){if(!segments.length)return setStatus('请先获取字幕');try{setStatus('正在翻译字幕…');const text=segments.map((s,i)=>`${i+1}. ${s.text}`).join('\n');const raw=await callAI('把以下视频字幕翻译成自然、准确的简体中文。按序号逐行返回，只输出“序号.译文”，不要合并或遗漏。字幕：\n'+text.slice(0,45000));const map=new Map([...raw.matchAll(/(?:^|\n)\s*(\d+)[.、:：]\s*(.+)/g)].map(m=>[Number(m[1])-1,m[2].trim()]));translated=segments.map((s,i)=>map.get(i)||'');renderTranscript();setStatus('翻译完成。若部分字幕未翻译，可缩短视频或分段处理。')}catch(e){setStatus(e.message)}}
function transcriptText(){return segments.map((s,i)=>`[${fmt(s.start)}] ${s.text}${translated[i]?'\n'+translated[i]:''}`).join('\n\n')}
async function summarize(){if(!segments.length)return setStatus('请先获取字幕');try{setStatus('AI 正在整理三个要点、证据和完整大纲…');summary=await callAI('请严格根据以下视频字幕，用简体中文输出学习笔记。要求：\n一、先用一句话概括主题。\n二、核心三要点：必须恰好3条。每条包括“观点”“证据/例子”“对应时间戳 [MM:SS]”。证据必须来自字幕；若字幕没有具体证据，明确写“字幕中未找到明确证据”，禁止编造。\n三、内容大纲：用层级编号整理视频的主要章节和观点；每个主要观点下写出字幕证据或例子，并尽可能标注时间戳。\n四、关键结论与可执行行动（仅当视频确实支持时提供）。\n不要把未经字幕支持的推断写成事实。视频标题：'+info.title+'\n字幕：\n'+segments.map(s=>`[${fmt(s.start)}] ${s.text}`).join('\n').slice(0,50000));$('summaryOut').textContent=summary;setStatus('总结已生成：三个要点、证据和大纲。')}catch(e){setStatus(e.message)}}
async function makeMindmap(){if(!segments.length)return setStatus('请先获取字幕');try{setStatus('正在生成脑图…');const raw=await callAI('根据字幕生成适合 XMind 层级结构的知识脑图。一级分支应是主要观点，二级节点尽量包含支持证据或例子；不要编造。只返回合法 JSON，不要 Markdown 代码围栏，格式为 {"title":"主题","children":[{"title":"分支","children":[{"title":"子要点","time":"00:00"}]}]}。最多6个一级分支，每个最多5个子节点。视频：'+info.title+'\n字幕：'+segments.map(s=>`[${fmt(s.start)}] ${s.text}`).join('\n').slice(0,40000));mindmap=JSON.parse(raw.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));$('mindmapOut').classList.remove('muted');$('mindmapOut').innerHTML=renderMap(mindmap);$('mindmapOut').querySelectorAll('[data-time]').forEach(el=>el.onclick=async()=>{const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});chrome.tabs.sendMessage(tab.id,{type:'SEEK_VIDEO',seconds:el.dataset.time.split(':').reduce((a,v)=>a*60+Number(v),0)})});setStatus('脑图已生成。')}catch(e){setStatus('脑图生成失败：'+e.message)}}
function renderMap(m){return `<div class="node root">${safe(m.title||info.title)}</div>`+(m.children||[]).map(c=>`<div class="node child">${safe(c.title)}${(c.children||[]).map(n=>`<div class="node leaf" ${n.time?`data-time="${safe(n.time)}" title="点击跳转 ${safe(n.time)}"`:''}>${safe(n.title)} ${n.time?`<span class="time">${safe(n.time)}</span>`:''}</div>`).join('')}</div>`).join('')}
function mermaid(m){return 'mindmap\n  root(('+String(m.title||info.title).replace(/[()]/g,'')+'))\n'+(m.children||[]).map(c=>'    '+c.title.replace(/[()]/g,'')+'\n'+(c.children||[]).map(n=>'      '+n.title.replace(/[()]/g,'')).join('\n')).join('\n')}
function xmindMarkdown(){
 const title=info.title||mindmap?.title||'YouTube 视频脑图';
 const lines=['# '+title];
 const root=mindmap||{title,children:[]};
 for(const c of (root.children||[])){
  lines.push('- '+c.title);
  for(const n of (c.children||[])) lines.push('  - '+n.title+(n.time?' ['+n.time+']':''));
 }
 return lines.join('\\n')+'\\n';
}
function exportXmindMarkdown(){
 if(!mindmap)return setStatus('请先生成脑图');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([xmindMarkdown()],{type:'text/markdown;charset=utf-8'}));
 a.download=(info.title||'youtube-mindmap').replace(/[\\\\/:*?"<>|]/g,'_')+'-XMind.md';a.click();URL.revokeObjectURL(a.href);
 setStatus('已导出 XMind 可导入的 Markdown 脑图。打开 XMind → 文件 → 导入 → Markdown 即可生成可编辑思维导图。');
}
function markdown(){return `---\ntitle: "${info.title.replace(/"/g,'\\"')}"\nsource: "${info.url}"\nchannel: "${info.channel||''}"\ntags: [youtube, video-notes]\n---\n\n# ${info.title}\n\n- 视频链接：${info.url}\n- 频道：${info.channel||'未知'}\n\n## AI 总结\n\n${summary||'尚未生成总结。'}\n\n## 脑图\n\n${mindmap?'```mermaid\n'+mermaid(mindmap)+'\n```':'尚未生成脑图。'}\n\n## 字幕与翻译\n\n${transcriptText()||'尚未获取字幕。'}\n`}
function download(){const blob=new Blob([markdown()],{type:'text/markdown;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(info.title||'youtube-note').replace(/[\\/:*?"<>|]/g,'_')+'.md';a.click();URL.revokeObjectURL(a.href);setStatus('Markdown 已下载。')}
async function saveObsidian(){const c=await cfg();if(!c.vault)return setStatus('请先在设置中填写 Obsidian Vault 名称');const file=(c.folder?c.folder.replace(/^\/+|\/+$/g,'')+'/':'')+(info.title||'YouTube Note').replace(/[\\/:*?"<>|]/g,'-')+'.md';const params=new URLSearchParams({vault:c.vault,file,content:markdown()});const url='obsidian://new?'+params.toString();if(url.length>60000){download();return setStatus('内容太长，已改为下载 Markdown；请将文件放入 Obsidian Vault。')}location.href=url;setStatus('已请求 Obsidian 创建笔记。如未弹出，请允许浏览器打开 Obsidian 链接，或使用“下载 Markdown”。')}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab,.pane').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.tab).classList.add('active')});$('settingsBtn').onclick=()=>document.querySelector('[data-tab="settings"]').click();$('loadTranscript').onclick=getTranscript;$('translateBtn').onclick=translate;$('summarizeBtn').onclick=summarize;$('mindmapBtn').onclick=makeMindmap;$('saveObsidian').onclick=saveObsidian;$('downloadMd').onclick=download;$('viewMode').onchange=renderTranscript;$('exportMindmap').onclick=()=>{if(!mindmap)return setStatus('请先生成脑图');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([mermaid(mindmap)],{type:'text/plain'}));a.download='youtube-mindmap.mmd';a.click()};$('exportXmindMd').onclick=exportXmindMarkdown;$('saveSettings').onclick=async()=>{const data={};for(const k of ['supadataKey','apiBase','aiKey','model','vault','folder'])data[k]=$(k).value.trim();await chrome.storage.local.set(data);setStatus('设置已保存在本机 Chrome。')};loadCfg();videoInfo();
