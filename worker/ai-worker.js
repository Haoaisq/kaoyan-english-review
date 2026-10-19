// Cloudflare Worker — deploy as a Worker, not GitHub Pages.
// Required Secrets: OPENAI_API_KEY, APP_PASSWORD
const ALLOWED_ORIGIN = "https://haoaisq.github.io";
const MODEL = "gpt-4.1-mini";
const LIMIT_BYTES = 18000;
const PROMPT = `你是严谨、耐心的考研英语阅读导师。专长于英语一/二阅读篇章逻辑、长难句、干扰项与错因归纳。
请完全使用中文，关键英语短语可保留英语。禁止编造原文或题干。用户若只提供年份和题号却未提供可靠原文/题干和四个选项，应先说明信息不足，要求粘贴原文关键段、题干、选项；不能凭记忆自信复述原题。
当用户给出了足够证据时，依次：①文章/段落论证逻辑；②定位依据（引述用户提供的关键短句）；③正确答案与错选项比较、逐项分析；④针对用户实际解题思路做“已证实/可能/尚不能判定”的错误原因分类；⑤可操作的下一题训练建议；⑥最后用一个简短追问检查理解。
不要把错选选项直接等同于固定错误原因；提醒用户多次错题才能构成重复模式。严禁输出凭空捏造的来源、分数、统计。`;
function json(body,status=200,origin=ALLOWED_ORIGIN){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":origin,"vary":"Origin","cache-control":"no-store","x-content-type-options":"nosniff"}})}
function safeEqual(a,b){const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);let d=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)d|=(x[i]||0)^(y[i]||0);return d===0}
export default {async fetch(request,env){
const origin=request.headers.get("Origin");
if(origin!==ALLOWED_ORIGIN)return json({error:"Origin not allowed"},403);
if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":ALLOWED_ORIGIN,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"Content-Type, X-App-Password","access-control-max-age":"600","vary":"Origin"}});
if(request.method!=="POST")return json({error:"POST only"},405);
if(!env.OPENAI_API_KEY||!env.APP_PASSWORD)return json({error:"Worker secrets not configured"},503);
if(!safeEqual(request.headers.get("X-App-Password")||"",env.APP_PASSWORD))return json({error:"访问口令错误"},401);
if(Number(request.headers.get("content-length")||0)>LIMIT_BYTES)return json({error:"请求过长"},413);
let b;try{const raw=await request.text();if(raw.length>LIMIT_BYTES)return json({error:"请求过长"},413);b=JSON.parse(raw)}catch{return json({error:"JSON格式错误"},400)}
const context=String(b.context||"").slice(0,8500),message=String(b.message||"").slice(0,1600);
if(!message.trim())return json({error:"请输入要分析的问题"},400);
const history=Array.isArray(b.history)?b.history.slice(-6).filter(m=>["user","assistant"].includes(m.role)&&typeof m.content==="string").map(m=>({role:m.role,content:m.content.slice(0,1500)})):[];
const input=[{role:"user",content:"本题资料（由用户提供，不一定完整）：\n"+context},...history,{role:"user",content:message}];
try{const resp=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"authorization":"Bearer "+env.OPENAI_API_KEY,"content-type":"application/json"},body:JSON.stringify({model:MODEL,instructions:PROMPT,input,max_output_tokens:1600,store:false})});
const val=await resp.json().catch(()=>({}));
if(!resp.ok)return json({error:resp.status===429?"AI服务繁忙或额度不足":resp.status===401?"OpenAI API 密钥无效":"AI请求失败 ("+resp.status+")"},resp.status===429?429:502);
const output=(val.output||[]).flatMap(x=>x.type==="message"?(x.content||[]):[]).filter(x=>x.type==="output_text").map(x=>x.text).join("\n");
if(!output)return json({error:"AI没有返回可显示的文字，请重试"},502);
return json({answer:output,model:MODEL,usage:val.usage||null});
}catch{return json({error:"连接 AI 服务失败"},502)}
}};