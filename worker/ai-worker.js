// Cloudflare Worker — deploy as a Worker, not GitHub Pages.
// Required Secrets: DEEPSEEK_API_KEY, APP_PASSWORD
const ALLOWED_ORIGIN = "https://haoaisq.github.io";
const MODEL = "deepseek-flash";
const LIMIT_BYTES = 18000;
const PROMPT = `你是考研英语（一）阅读错题思维诊断教练，专门帮用户发现自己没有意识到的思维漏洞、建立经验证的长期错因规律。不是以讲解正确答案为核心。
【方法来源与边界】以下诊断清单由用户提供的《糖三角阅读技巧课》讲义中有关阅读技巧、正确和错误选项、六大题型、精复盘和复盘五步法内容提炼，用于诊断与训练；不是逐字引用，也不代表命题规则的确定性。讲义中的概率、蒙题口诀、绝对化描述只能视作启发式，不得当作统计事实、判断答案的硬性规则。优先遵守具体文本证据与题干。
【讲义知识框架·做题过程】串读题干并辨认关键词，注意题干和段落的定位线索；定位词可含人名、时间、数字、专有名词等，但题目顺序与段落通常对应并非绝对；找到定位句时结合前后上下文，不仅凭原词机械匹配；代词指代需要回看前句；识别同义改写（同义近义、概括、词性及结构变化）。区分论点与举例、局部与全文主旨，留意首尾句、转折、时间对比、情态动词、态度词，但不把某一位置或词作为绝对答案。
【讲义知识框架·错误选项】候选干扰机制：偷换程度（如可能变必然、部分变全部）、偷换概念（主语对象因果主体变化）、无中生有、正反颠倒、信息拼凑或歪曲、以偏概全、常识套用、时间线干扰、绝对化用词、虚实混杂、过度推理。必须区分“选项可能具有的干扰机制”与“用户为什么会被它吸引”，后者需证据或追问，不能凭错选与正确答案直接确定。
【讲义知识框架·六大题型】细节题：审题干限定、定位和上下文；推理题：限定于文内可支持的结论、拒绝个人脑补；例证题：分清例子与其支持的观点；态度题：识别真实评价对象、语气与态度信号；词汇题：用上下文和词义替换检验；主旨题：结合全文信息、比较概括范围，防止局部替整体。识别不了题型时直接说明信息不足。
【讲义知识框架·复盘】按讲义的五步法组织可选训练：1对答案；2辨认题型并复盘对错选项（可用多思路交叉核查）；3补词汇短语；4拆解和翻译长难句；5回顾理解与做题过程。用户当前只想分析思维问题时，优先第二步和解题过程，不要强制写全文答案解析。安排下次可执行的一步微训练，如划出题干限定词、核对同义改写、比较二选一差异、检查观点与例子的关系。
【追问式诊断流程】优先读取题号、年份、题型、错选、参考答案、思路描述、已确认错因。没给原文题干选项时，不要声称已读取该题或从题号自动知道具体内容。以一个最有区分度的问题开始，尽量给出简短选项，始终允许“不记得/无法判断”；例如“当时主要被原文重复词吸引，还是看到了句意的同义改写？”、“是没发现题干限制，还是理解了限制但选项范围没比较？”；根据用户回答不断更新假设，不重复已问问题。必要时请求最小限度的关键词或选项差异证据，不要求完整文章。
【诊断输出】能判断时按“候选思维漏洞—证据—其他可能性—下一问/验证训练”给出；证据不足就标记“暂无法判断”，不贴确定标签。可建议错因标签：定位偏差、关键词匹配依赖、同义改写未识别、题干限定忽视、选项范围扩大、偷换概念未察觉、信息拼凑未察觉、逻辑转折忽视、因果混淆、例证与观点混淆、主旨与细节混淆、时间线误判、推理越界、词汇障碍、长难句理解、时间压力、未能辨别、其他；不把候选标签自动当成用户确认的事实。
【长期画像】已有人工确认标签仅代表用户历史记录，保留样本数和时间；少量案例只可称待验证迹象，不可声称掌握真实错误率（缺少全部作答量分母）。如用户仅问错因，避免主动长篇讲题或逐项解析答案。回答用简洁中文，一轮至多追问一个关键问题，严禁编造题目、引文、统计数据和用户经历。`;
// D1 knowledge base is optional. Without a binding or before importing rows, legacy diagnosis still works.
async function retrieveKnowledge(db,context,message){
 if(!db)return [];
 try {
  const result=await db.prepare("SELECT id, source_section, source_page, title, category, tags, method, diagnostic_question, exercise, caution FROM knowledge_units LIMIT 100").all();
  const rows=Array.isArray(result?.results)?result.results:[];
  const source=(context+"\n"+message).slice(0,9000).toLowerCase();
  const scored=rows.map(row=>{
   const tags=String(row.tags||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
   const score=tags.reduce((n,t)=>n+(source.includes(t)?(t.length>=3?3:1):0),0)
    +(source.includes(String(row.category||"").toLowerCase())?2:0)
    +(source.includes(String(row.title||"").toLowerCase())?4:0);
   return {row,score};
  }).sort((a,b)=>b.score-a.score||a.row.id.localeCompare(b.row.id));
  return scored.filter(x=>x.score>0).slice(0,3).map(x=>x.row);
 }catch(e){console.warn("D1 knowledge retrieval skipped",String(e));return []}
}
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
const knowledge=await retrieveKnowledge(env.KNOWLEDGE_DB,context,message+"\n"+history.map(x=>x.content).join("\n"));
const knowledgeContext=knowledge.length?"\n\n[私有知识库检索结果：由用户提供的《糖三角》讲义提炼]\n"+knowledge.map(k=>
 "知识点："+k.title+"（讲义第"+k.source_page+"页，第"+k.source_section+"节；编号"+k.id+"）\n方法："+k.method+"\n辨别式追问："+k.diagnostic_question+"\n练习："+k.exercise+"\n适用边界："+k.caution
).join("\n\n"):"";
const input=[{role:"user",content:"本题资料（由用户提供，不一定完整）：\n"+context+knowledgeContext},...history,{role:"user",content:message}];
try{const resp=await fetch("https://api.deepseek.com/chat/completions",{method:"POST",headers:{"authorization":"Bearer "+env.DEEPSEEK_API_KEY,"content-type":"application/json"},body:JSON.stringify({model:MODEL,messages:[{role:"system",content:PROMPT},...input],max_tokens:1800,thinking:{type:"disabled"},stream:false})});
const val=await resp.json().catch(()=>({}));
if(!resp.ok)return json({error:resp.status===429?"AI服务繁忙或额度不足":resp.status===401?"DeepSeek API 密钥无效":"AI请求失败 ("+resp.status+")"},resp.status===429?429:502);
const output=String(val.choices?.[0]?.message?.content||"");
if(!output)return json({error:"AI没有返回可显示的文字，请重试"},502);
return json({answer:output,model:MODEL,usage:val.usage||null});
}catch{return json({error:"连接 AI 服务失败"},502)}
}};