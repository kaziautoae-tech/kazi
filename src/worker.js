// FJ ZONE admin: /admin (phone-friendly price & stock editor).
// Saves to data/overrides.json in GitHub -> Cloudflare rebuilds the site automatically.
// Secrets (set in Cloudflare > Worker > Settings > Variables and Secrets): ADMIN_PASSWORD, GITHUB_TOKEN
const REPO = 'kaziautoae-tech/kazi', BRANCH = 'cloudflare-site', FILE = 'data/overrides.json';
const enc = new TextEncoder();
async function sign(env, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode('fjz-admin:' + env.ADMIN_PASSWORD), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
function same(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
async function authed(req, env) {
  const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)fjzadm=(\d+)\.([0-9a-f]+)/);
  if (!m || Date.now() > +m[1]) return false;
  return same(m[2], await sign(env, m[1]));
}
const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...h } });
const gh = (env, path, init = {}) => fetch('https://api.github.com/repos/' + REPO + path, { ...init, headers: { authorization: 'Bearer ' + env.GITHUB_TOKEN, accept: 'application/vnd.github+json', 'user-agent': 'fjzone-admin', ...(init.headers || {}) } });
const b64 = s => btoa(String.fromCharCode(...enc.encode(s)));
const unb64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)));
async function readOverrides(env) {
  const r = await gh(env, '/contents/' + FILE + '?ref=' + BRANCH);
  if (r.status === 404) return { data: { sku: {} }, sha: null };
  if (!r.ok) throw new Error('GitHub read failed (' + r.status + ')');
  const j = await r.json(); return { data: JSON.parse(unb64(j.content)), sha: j.sha };
}
let fails = 0, failAt = 0;
export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname;
    if (p === '/admin' || p === '/admin/') return new Response(PAGE, { headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'x-frame-options': 'DENY' } });
    if (p.startsWith('/api/admin/')) {
      if (!env.ADMIN_PASSWORD || !env.GITHUB_TOKEN) return json({ error: 'Admin is not set up yet: add ADMIN_PASSWORD and GITHUB_TOKEN secrets in Cloudflare.' }, 503);
      if (p === '/api/admin/login' && req.method === 'POST') {
        if (fails >= 5 && Date.now() - failAt < 10 * 60e3) return json({ error: 'Too many tries. Wait 10 minutes.' }, 429);
        const { password } = await req.json().catch(() => ({}));
        if (typeof password !== 'string' || !same(password, env.ADMIN_PASSWORD)) { fails++; failAt = Date.now(); return json({ error: 'Wrong password' }, 401); }
        fails = 0; const exp = String(Date.now() + 30 * 864e5);
        return json({ ok: true }, 200, { 'set-cookie': `fjzadm=${exp}.${await sign(env, exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000` });
      }
      if (p === '/api/admin/logout') return json({ ok: true }, 200, { 'set-cookie': 'fjzadm=; Path=/; Max-Age=0' });
      if (!(await authed(req, env))) return json({ error: 'login' }, 401);
      try {
        if (p === '/api/admin/state') {
          const cat = await (await env.ASSETS.fetch(new URL('/data/catalog.json', url))).json();
          const ov = await readOverrides(env);
          const runs = await gh(env, '/commits?sha=' + BRANCH + '&path=' + FILE + '&per_page=5');
          const hist = runs.ok ? (await runs.json()).map(c => ({ when: c.commit.author.date, msg: c.commit.message })) : [];
          return json({ catalog: cat, overrides: ov.data.sku || {}, history: hist });
        }
        if (p === '/api/admin/save' && req.method === 'POST') {
          const { changes, note } = await req.json();
          if (!changes || typeof changes !== 'object') return json({ error: 'nothing to save' }, 400);
          let n = 0;
          for (let attempt = 0; attempt < 3; attempt++) {
            const ov = await readOverrides(env); const sku = ov.data.sku || (ov.data.sku = {}); n = 0;
            for (const [k, c] of Object.entries(changes)) {
              if (!/^[\w.-]{1,40}$/.test(k)) continue;
              const o = sku[k] || {};
              if (c.price != null) { const v = Number(c.price); if (!(v > 0 && v < 1e6)) return json({ error: 'Bad price for ' + k }, 400); o.price = Math.round(v * 100) / 100; }
              if (c.oos != null) o.oos = !!c.oos;
              sku[k] = o; n++;
            }
            const body = { message: 'Admin: update ' + n + ' item(s)' + (note ? ' - ' + String(note).slice(0, 80) : ''), content: b64(JSON.stringify(ov.data, null, 1) + '\n'), branch: BRANCH };
            if (ov.sha) body.sha = ov.sha;
            const r = await gh(env, '/contents/' + FILE, { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
            if (r.ok) return json({ ok: true, saved: n });
            if (r.status !== 409 && r.status !== 422) return json({ error: 'GitHub save failed (' + r.status + '). Check the GITHUB_TOKEN secret.' }, 502);
          }
          return json({ error: 'Busy, please try again' }, 409);
        }
      } catch (e) { return json({ error: String(e.message || e) }, 500); }
      return json({ error: 'not found' }, 404);
    }
    return env.ASSETS.fetch(req);
  }
};
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>FJ ZONE Admin</title>
<style>*{box-sizing:border-box}body{margin:0;font:15px/1.4 system-ui,-apple-system,sans-serif;background:#f4f4f2;color:#1b1b1b}
header{position:sticky;top:0;z-index:5;background:#141414;color:#fff;padding:10px 14px;display:flex;gap:10px;align-items:center}header b{flex:1}
button{font:inherit;border:0;border-radius:8px;padding:9px 14px;background:#e8e8e4;cursor:pointer}button.p{background:#e0761b;color:#fff;font-weight:600}button:disabled{opacity:.5}
input,select{font:inherit;padding:9px;border:1px solid #ccc;border-radius:8px;background:#fff}
.wrap{max-width:900px;margin:auto;padding:12px}.bar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}.bar input[type=search]{flex:1;min-width:180px}
.box{background:#fff;border-radius:12px;padding:12px;margin-bottom:10px}.bulk{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.bulk input{width:90px}
.it{background:#fff;border-radius:12px;padding:10px 12px;margin-bottom:8px}.it h4{margin:0 0 6px;font-size:14px}.it small{color:#777}
.v{display:flex;gap:8px;align-items:center;padding:5px 0;border-top:1px solid #eee}.v .l{flex:1;font-size:13px;color:#444}.v input{width:100px}.v.ch{background:#fff4e6}
.oos{font-size:13px;display:flex;gap:4px;align-items:center;white-space:nowrap}.msg{padding:10px;border-radius:8px;margin-bottom:10px}.ok{background:#e3f6e5}.er{background:#fde3e3}
#login{max-width:340px;margin:80px auto}.hist{font-size:13px;color:#555}.more{text-align:center;margin:12px}</style></head><body>
<header><b>FJ ZONE Admin</b><span id="cnt"></span><button class="p" id="pub" disabled>Publish</button></header>
<div class="wrap"><div id="login" class="box" hidden><h3>Sign in</h3><input id="pw" type="password" placeholder="Admin password" style="width:100%"><p><button class="p" id="go" style="width:100%">Sign in</button></p><div id="le"></div></div>
<div id="app" hidden><div id="m"></div>
<div class="bar"><input type="search" id="q" placeholder="Search name or SKU (e.g. lexus, FJZ-0522)"><select id="c"><option value="">All categories</option></select>
<select id="f"><option value="">All</option><option value="oos">Out of stock</option><option value="in">In stock</option><option value="ch">Unpublished edits</option></select></div>
<div class="box bulk"><b>Bulk for <span id="nf">0</span> shown items:</b><input id="bp" type="number" placeholder="% e.g. 10"><button id="ba">Change price %</button>
<button id="bo">Mark out of stock</button><button id="bi">Mark in stock</button><small>Use −10 for a 10% sale. Prices round to 5 AED.</small></div>
<div id="list"></div><div class="more"><button id="mo" hidden>Show more</button></div>
<div class="box hist"><b>Recent publishes</b><div id="h"></div><p><button id="lo">Sign out</button></p></div></div></div>
<script>
const $=s=>document.querySelector(s);let CAT=[],OV={},ED={},LIM=60;
const api=(p,b)=>fetch('/api/admin/'+p,b?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}:{}).then(async r=>{const j=await r.json().catch(()=>({error:'Server error'}));if(r.status==401&&j.error=='login'){show(0);throw 0}if(!r.ok)throw new Error(j.error);return j});
function show(a){$('#login').hidden=!!a;$('#app').hidden=!a}
function msg(t,ok){$('#m').innerHTML=t?'<div class="msg '+(ok?'ok':'er')+'">'+t+'</div>':''}
const cur=v=>{const e=ED[v.sku]||{},o=OV[v.sku]||{};return{price:e.price??o.price??v.price,oos:e.oos??o.oos??v.oos}};
async function load(){const s=await api('state');CAT=s.catalog;OV=s.overrides;show(1);
 const cs=[...new Set(CAT.map(p=>p.cat))].sort();$('#c').innerHTML='<option value="">All categories</option>'+cs.map(c=>'<option>'+esc(c)+'</option>').join('');
 $('#h').innerHTML=s.history.map(h=>'<div>'+new Date(h.when).toLocaleString()+' — '+esc(h.msg.split('\\n')[0])+'</div>').join('')||'None yet';render()}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
function shown(){const q=$('#q').value.trim().toLowerCase(),c=$('#c').value,f=$('#f').value;
 return CAT.filter(p=>(!c||p.cat==c)&&(!q||q.split(/\\s+/).every(w=>(p.name+' '+p.v.map(v=>v.sku).join(' ')).toLowerCase().includes(w)))
 &&(!f||p.v.some(v=>{const x=cur(v);return f=='oos'?x.oos:f=='in'?!x.oos:!!ED[v.sku]})))}
function render(){const s=shown();$('#nf').textContent=s.length;
 $('#list').innerHTML=s.slice(0,LIM).map(p=>'<div class="it"><h4>'+esc(p.name)+'</h4><small>'+esc(p.cat)+'</small>'+p.v.map(v=>{const x=cur(v);
 return '<div class="v'+(ED[v.sku]?' ch':'')+'" data-s="'+esc(v.sku)+'"><span class="l">'+esc(v.label||'')+' <small>'+esc(v.sku)+'</small></span>AED <input type="number" min="1" step="1" value="'+(x.price??'')+'"><label class="oos"><input type="checkbox"'+(x.oos?' checked':'')+'>Out</label></div>'}).join('')+'</div>').join('');
 $('#mo').hidden=s.length<=LIM;const n=Object.keys(ED).length;$('#cnt').textContent=n?n+' unsaved':'';$('#pub').disabled=!n}
function setv(sku,k,val){const base=CAT.flatMap(p=>p.v).find(v=>v.sku==sku);const o=OV[sku]||{};const was=(o[k]??base[k]);
 const e=ED[sku]||{};if(val===was)delete e[k];else e[k]=val;if(Object.keys(e).length)ED[sku]=e;else delete ED[sku]}
$('#list').addEventListener('change',e=>{const r=e.target.closest('.v');if(!r)return;const s=r.dataset.s;
 if(e.target.type=='checkbox')setv(s,'oos',e.target.checked);else{const v=+e.target.value;if(v>0)setv(s,'price',v)}render()});
['#q','#c','#f'].forEach(i=>$(i).addEventListener('input',()=>{LIM=60;render()}));$('#mo').onclick=()=>{LIM+=60;render()};
$('#ba').onclick=()=>{const pc=+$('#bp').value;if(!pc||pc<-90||pc>500)return alert('Enter a % between -90 and 500');const s=shown();
 if(!confirm('Change price by '+pc+'% on '+s.length+' products?'))return;s.forEach(p=>p.v.forEach(v=>{const x=cur(v);if(x.price)setv(v.sku,'price',Math.max(5,Math.round(x.price*(1+pc/100)/5)*5))}));render()};
const bulkOos=b=>{const s=shown();if(confirm((b?'Mark OUT of stock: ':'Mark IN stock: ')+s.length+' products?')){s.forEach(p=>p.v.forEach(v=>setv(v.sku,'oos',b)));render()}};
$('#bo').onclick=()=>bulkOos(true);$('#bi').onclick=()=>bulkOos(false);
$('#pub').onclick=async()=>{const n=Object.keys(ED).length;if(!confirm('Publish '+n+' change(s) to the live website?'))return;$('#pub').disabled=true;
 try{await api('save',{changes:ED});ED={};msg('Saved. The website and Google feed update in about 2–3 minutes.',1);await load()}catch(e){if(e)msg(e.message);render()}};
$('#go').onclick=async()=>{try{await api('login',{password:$('#pw').value});$('#pw').value='';$('#le').textContent='';await load()}catch(e){if(e)$('#le').textContent=e.message}};
$('#pw').onkeydown=e=>{if(e.key=='Enter')$('#go').click()};$('#lo').onclick=async()=>{await api('logout');show(0)};
window.onbeforeunload=()=>Object.keys(ED).length?true:undefined;
load().catch(e=>{show(0);if(e)$('#le').textContent=e.message});
</script></body></html>`;
