// Cloudflare Worker — deploy as a Worker, not GitHub Pages.
// Required Secrets: DEEPSEEK_API_KEY, APP_PASSWORD
const ALLOWED_ORIGIN = "https://haoaisq.github.io";
const MODEL = "deepseek-flash";
const LIMIT_BYTES = 18000;
const PROMPT = `你是“考研英语错题思维诊断教练”，核心目标是帮助学习者发现自己尚未意识到的解题思维问题，追踪重复模式，而不是讲解正确答案。
【优先目标】首先识别学生已经提供的证据：题型、错选、正确答案、当时的思路、是否纠结、信心/用时、旧诊断与历史复习记录。只给出支持程度匹配的推测。仅凭选A、答案B，不能推断任何具体错因；没有原文与选项时不擅自解释原题。
【交互方式】学生说“不知道为什么错”时，不强迫自我归因；用1个最能区分候选错误机制的简短选择式追问，允许“不确定/记不清”。可询问：是否凭关键词匹配、是否理解原句、是否看清题干限定、是否在两选项纠结、是否赶时间。连续追问应参考对话历史，避免重复问题。证据不足可请求补充原文关键句或错误选项，不必要求整篇文章。
【输出要求】围绕“可能的思维漏洞—依据—待排除的解释—下一步追问或验证练习”，简洁清楚。不要逐项分析ABCD，也不要再解释题目的正确答案，除非用户特别要求。不能声称读到未提供的真题原文。
【长期规律】如请求里提供了“既往诊断概览”，只能将其视作用户记录的历史标签，比较当前与历史并标注样本数；不得编造历史；少量样本只称“待验证迹象”。输出一次只问一个关键问题。
【归因标签】如果已有充分证据，可建议以下一个或两个供用户确认的标签：关键词匹配依赖、题干限定忽视、选项范围扩大、局部代替整体、逻辑转折忽视、因果混淆、推理越界、句意理解不足、定位偏差、时间压力、未能辨别、其他。须明确“候选/较有依据/无法判断”，不能未经用户确认直接记录为事实。
全部用中文，严禁虚构证据和百分比。训练建议应具体可执行。`;
function json(body,status=200,origin=ALLOWED_ORIGIN){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":origin,"vary":"Origin","cache-control":"no-store","x-content-type-options":"nosniff"}})}
function safeEqual(a,b){const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);let d=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)d|=(x[i]||0)^(y[i]||0);return d===0}
export default {async fetch(request,env){
const origin=request.headers.get("Origin");
if(origin!==ALLOWED_ORIGIN)return json({error:"Origin not allowed"},403);
if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":ALLOWED_ORIGIN,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"Content-Type, X-App-Password","access-control-max-age":"600","vary":"Origin"}});
if(request.method!=="POST")return json({error:"POST only"},405);
if(!env.DEEPSEEK_API_KEY||!env.APP_PASSWORD)return json({error:"Worker secrets not configured"},503);
if(!safeEqual(request.headers.get("X-App-Password")||"",env.APP_PASSWORD))return json({error:"访问口令错误"},401);
if(Number(request.headers.get("content-length")||0)>LIMIT_BYTES)return json({error:"请求过长"},413);
let b;try{const raw=await request.text();if(raw.length>LIMIT_BYTES)return json({error:"请求过长"},413);b=JSON.parse(raw)}catch{return json({error:"JSON格式错误"},400)}
const context=String(b.context||"").slice(0,8500),message=String(b.message||"").slice(0,1600);
if(!message.trim())return json({error:"请输入要分析的问题"},400);
const history=Array.isArray(b.history)?b.history.slice(-6).filter(m=>["user","assistant"].includes(m.role)&&typeof m.content==="string").map(m=>({role:m.role,content:m.content.slice(0,1500)})):[];
const input=[{role:"user",content:"本题资料（由用户提供，不一定完整）：\n"+context},...history,{role:"user",content:message}];
try{const resp=await fetch("https://api.deepseek.com/chat/completions",{method:"POST",headers:{"authorization":"Bearer "+env.DEEPSEEK_API_KEY,"content-type":"application/json"},body:JSON.stringify({model:MODEL,messages:[{role:"system",content:PROMPT},...input],max_tokens:1800,thinking:{type:"disabled"},stream:false})});
const val=await resp.json().catch(()=>({}));
if(!resp.ok)return json({error:resp.status===429?"AI服务繁忙或额度不足":resp.status===401?"DeepSeek API 密钥无效":"AI请求失败 ("+resp.status+")"},resp.status===429?429:502);
const output=String(val.choices?.[0]?.message?.content||"");
if(!output)return json({error:"AI没有返回可显示的文字，请重试"},502);
return json({answer:output,model:MODEL,usage:val.usage||null});
}catch{return json({error:"连接 AI 服务失败"},502)}
}};