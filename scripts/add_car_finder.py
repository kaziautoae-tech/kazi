"""Tag every product with the cars it fits and add a 'Find parts for your car' selector to the shop.
Run: python3 scripts/add_car_finder.py public   (safe to re-run)"""
import json,re,sys,os
ROOT=sys.argv[1] if len(sys.argv)>1 else 'public'
CARS=[ # key, English, Arabic, regex on English name
 ('fj','Toyota FJ Cruiser','تويوتا إف جي كروزر',r'\bfj\b|fj ?cruiser'),
 ('lc','Toyota Land Cruiser','تويوتا لاند كروزر',r'land ?cruiser|landcruiser|land cruser|lc ?200|lc-?100|lc ?300|\bvxr\b|\bgxr\b'),
 ('prado','Toyota Prado','تويوتا برادو',r'prado'),
 ('toyota','Toyota (Tundra, Camry, Crown)','تويوتا (تندرا، كامري، كراون)',r'tundra|camry|crown'),
 ('lexus','Lexus','لكزس',r'lexus|\blx ?-?[45]\d0|\bls ?-?4[36]0'),
 ('patrol','Nissan Patrol / Safari / Armada','نيسان باترول / سفاري / أرمادا',r'patrol|safari|vitic|\bvtc\b|armada'),
 ('nissan','Nissan (other models)','نيسان (موديلات أخرى)',r'pathfinder|pahfinder|maxima|murano|teana|370z|elgrand|quest'),
 ('infiniti','Infiniti','إنفينيتي',r'infinit'),
 ('landrover','Range Rover / Land Rover','رنج روفر / لاند روفر',r'range rover|land rover|defender|evo[gq]ue|discovery'),
 ('mercedes','Mercedes-Benz','مرسيدس بنز',r'mercedes|marcedes|maecedes|\bbenz\b'),
 ('bmw','BMW / Mini','بي إم دبليو / ميني',r'\bbmw\b|mini cooper'),
 ('audi','Audi','أودي',r'\baudi\b'),
 ('porsche','Porsche','بورشه',r'porsche'),
 ('gm','GMC / Chevrolet / Cadillac','جي إم سي / شيفروليه / كاديلاك',r'\bgmc\b|chevrolet|silverado|suburban|tahoe|yukon|camaro|cadillac|escalade'),
 ('ford','Ford','فورد',r'\bford\b|f-?150|mustang|expedition|explorer|taurus'),
 ('jeep','Jeep / Dodge','جيب / دودج',r'\bjeep\b|wrangler|cherokee|dodge|durango'),
 ('mitsubishi','Mitsubishi Pajero','ميتسوبيشي باجيرو',r'pajero|mitsubishi'),
 ('vw','Volkswagen','فولكس فاجن',r'volkswagen|\bvw\b'),
 ('exotic','Maserati / Lamborghini','مازيراتي / لامبورغيني',r'maserati|lamborghini'),
 ('universal','Universal (fits most cars)','عام (يناسب معظم السيارات)',None),
]
def tag(p):
    n=p.get('name','')+' '+' '.join(v.get('full','') or '' for v in p.get('v',[]))
    out=[k for k,_,_,rx in CARS if rx and re.search(rx,n,re.I)]
    if p.get('fj') and 'fj' not in out: out.append('fj')
    if not out or re.search(r'universal',n,re.I) or p.get('cat')=='Universal': out.append('universal')
    return sorted(set(out))
def load(h):
    i=h.find('[{"name"'); d,e=json.JSONDecoder().raw_decode(h,i); return d,i,e
en=open(os.path.join(ROOT,'index.html'),encoding='utf-8').read()
den,_,_=load(en); tags={p['id']:tag(p) for p in den}
for f,ar in [('index.html',False),('ar/index.html',True)]:
    path=os.path.join(ROOT,f); h=open(path,encoding='utf-8').read()
    d,i,e=load(h)
    for p in d: p['cars']=tags.get(p['id'],['universal'])
    h=h[:i]+json.dumps(d,ensure_ascii=False)+h[e:]
    # CARS list for the selector
    used={k for t in tags.values() for k in t}
    opts=[(k,(a if ar else en_)) for k,en_,a,_ in CARS if k in used]
    js='const CARLIST='+json.dumps(opts,ensure_ascii=False)+';'
    h=re.sub(r'const CARLIST=\[.*?\];\n?','',h)
    h=h.replace("const state={cat:'All',q:'',sort:'feat',inStock:false,shown:PAGE};", "const state={cat:'All',q:'',sort:'feat',inStock:false,shown:PAGE,car:''};")
    h=h.replace("const state={cat:'All'", js+"\nconst state={cat:'All'",1)
    h=h.replace("let list=P.filter(p=>(state.cat==='All'||p.cat===state.cat)&&(!state.inStock||inStock(p))&&",
                "let list=P.filter(p=>(state.cat==='All'||p.cat===state.cat)&&(!state.inStock||inStock(p))&&(!state.car||(p.cars||[]).includes(state.car))&&")
    lab='سيارتك' if ar else 'Your car'
    allc='كل السيارات' if ar else 'All cars'
    sel=f'<label class="toggle carpick" style="gap:6px">{lab}: <select id="carSel" aria-label="{lab}" style="height:34px;border:1.5px solid var(--line,#ccc);border-radius:8px;padding:0 8px;font:inherit;background:#fff;max-width:230px"><option value="">{allc}</option></select></label>'
    if 'id="carSel"' not in h:
        h=re.sub(r'(<label class="toggle"><input type="checkbox" id="inStock">)',sel+r'\1',h,count=1)
    hook=("\n/* car finder */\n(function(){const s=$('#carSel');if(!s)return;s.innerHTML+=CARLIST.map(([k,n])=>`<option value=\"${k}\">${n}</option>`).join('');"
          "const m=location.hash.match(/car=(\\w+)/)||location.search.match(/car=(\\w+)/);if(m&&CARLIST.some(c=>c[0]===m[1])){s.value=m[1];state.car=m[1];}"
          "s.onchange=e=>{state.car=e.target.value;state.shown=PAGE;render();if(state.car&&!location.hash.includes('#p='))history.replaceState(null,'','?car='+state.car+'#shop');};})();\n")
    if '/* car finder */' not in h:
        h=h.replace("$('#inStock').onchange=", hook+"$('#inStock').onchange=",1)
    h=h.replace("$('#clearF'); if(cf) cf.onclick=()=>{state.cat='All';state.q='';state.inStock=false;","$('#clearF'); if(cf) cf.onclick=()=>{state.cat='All';state.q='';state.inStock=false;state.car='';if($('#carSel'))$('#carSel').value='';")
    open(path,'w',encoding='utf-8').write(h)
import collections
c=collections.Counter(k for t in tags.values() for k in t); print(dict(c))
