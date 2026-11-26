"""Apply price / stock changes saved from the admin page (data/overrides.json) to the static site.
Runs automatically on every Cloudflare deploy (wrangler.jsonc build command), before build_feed.py.
Format of data/overrides.json: {"sku": {"FJZ-0522": {"price": 350, "oos": false}, ...}}
Safe to re-run: values are absolute."""
import json,os,re,sys
ROOT=sys.argv[1] if len(sys.argv)>1 else 'public'
OV=sys.argv[2] if len(sys.argv)>2 else 'data/overrides.json'
if not os.path.exists(OV): print('no overrides'); sys.exit(0)
ov=json.load(open(OV,encoding='utf-8')).get('sku',{})
if not ov: print('no overrides'); sys.exit(0)
def rd(p): return open(p,encoding='utf-8').read()
def wr(p,t): open(p,'w',encoding='utf-8').write(t)
def load(h):
    i=h.find('[{"name"'); d,e=json.JSONDecoder().raw_decode(h,i); return d,i,e
n=lambda x:f"{int(round(x)):,}" if float(x).is_integer() else f"{x:,.2f}"
def labels(vs):
    ps=[v['price'] for v in vs if v.get('price')]
    if not ps: return None
    lo,hi=min(ps),max(ps)
    if lo==hi: return dict(en=f'AED {n(lo)}',ar=f'{n(lo)} درهم',cen=f'AED {n(lo)}',car=f'{n(lo)} درهم',lo=lo,hi=hi,multi=False)
    return dict(en=f'AED {n(lo)} – AED {n(hi)}',ar=f'{n(lo)} درهم – {n(hi)} درهم',cen=f'from AED {n(lo)}',car=f'من {n(lo)} درهم',lo=lo,hi=hi,multi=True)
idx=os.path.join(ROOT,'index.html'); aidx=os.path.join(ROOT,'ar/index.html')
H=rd(idx); D,i,e=load(H)
slug=json.loads(re.search(r'const SLUG=(\{.*?\});',H,re.S).group(1))
changed={}   # slug -> (old,new,variants_old,variants_new,id)
for p in D:
    if not any(v.get('sku') in ov for v in p['v']): continue
    old=[dict(v) for v in p['v']]; ol=labels(old)
    for v in p['v']:
        o=ov.get(v.get('sku'))
        if not o: continue
        if o.get('price') is not None: v['price']=float(o['price'])
        if o.get('oos') is not None: v['oos']=bool(o['oos'])
    ps=[v['price'] for v in p['v'] if v.get('price')]
    if ps: p['min']=float(min(ps))
    nl=labels(p['v'])
    if [ (v.get('price'),v.get('oos')) for v in old]!=[(v.get('price'),v.get('oos')) for v in p['v']] and p['id'] in slug:
        changed[slug[p['id']]]=(ol,nl,old,p['v'],p['id'])
H=H[:i]+json.dumps(D,ensure_ascii=False)+H[e:]; wr(idx,H)
byid={p['id']:p for p in D}
A=rd(aidx); DA,i,e=load(A)
for p in DA:
    if p['id'] in byid:
        src=byid[p['id']]
        for va,ve in zip(p['v'],src['v']): va['price']=ve.get('price'); va['oos']=ve.get('oos')
        p['min']=src.get('min')
wr(aidx,A[:i]+json.dumps(DA,ensure_ascii=False)+A[e:])
print('products changed',len(changed))
if not changed: sys.exit(0)
def fix_ld(t,nl,vs):
    def r(m):
        try: j=json.loads(m.group(1))
        except Exception: return m.group(0)
        ch=False
        for o in j.get('@graph',[j]):
            if o.get('@type')!='Product' or not isinstance(o.get('offers'),dict): continue
            off=o['offers']; anyin=any(not v.get('oos') for v in vs)
            off['availability']='https://schema.org/InStock' if anyin else 'https://schema.org/OutOfStock'
            if off.get('@type')=='AggregateOffer': off['lowPrice']=f"{nl['lo']:.2f}"; off['highPrice']=f"{nl['hi']:.2f}"
            else: off['price']=f"{nl['lo']:.2f}"
            ch=True
        return '<script type="application/ld+json">'+json.dumps(j,ensure_ascii=False)+'</script>' if ch else m.group(0)
    return re.sub(r'<script type="application/ld\+json">(.*?)</script>',r,t,flags=re.S)
def money(x,ar): return f'{n(x)} درهم' if ar else f'AED {n(x)}'
STOCK={False:('In stock','متوفر'),True:('Out of stock','غير متوفر')}
pages=0
for sl,(ol,nl,vo,vn,pid) in changed.items():
    for ar in (False,True):
        f=os.path.join(ROOT,('ar/' if ar else '')+f'products/{sl}/index.html')
        if not os.path.exists(f) or not ol or not nl: continue
        t=rd(f); k='ar' if ar else 'en'
        t=t.replace(f'<div class="price">{ol[k]}</div>',f'<div class="price">{nl[k]}</div>')
        t=re.sub(r'(<meta (?:name="description"|property="og:description"|name="twitter:description") content="[^"]*)'+re.escape(ol[k]),lambda m:m.group(1)+nl[k],t)
        for a,b in zip(vo,vn):
            if a.get('label') is None: continue
            old_row=f"<tr><td>{a.get('label','')}</td><td>{money(a['price'],ar) if a.get('price') else ''}</td><td>{STOCK[bool(a.get('oos'))][1 if ar else 0]}</td></tr>"
            new_row=f"<tr><td>{b.get('label','')}</td><td>{money(b['price'],ar) if b.get('price') else ''}</td><td>{STOCK[bool(b.get('oos'))][1 if ar else 0]}</td></tr>"
            t=t.replace(old_row,new_row)
        t=fix_ld(t,nl,vn); wr(f,t); pages+=1
cards=0
for dp,_,fs in os.walk(ROOT):
    for fn in fs:
        if not fn.endswith('.html'): continue
        p=os.path.join(dp,fn); t=rd(p)
        if '<a class="card"' not in t: continue
        def r(m):
            global cards
            sl=m.group(2)
            if sl not in changed: return m.group(0)
            ol,nl,*_=changed[sl]; ar=bool(m.group(1))
            k='car' if ar else 'cen'
            s=m.group(0).replace(f'<div class="pr">{ol[k]}</div>',f'<div class="pr">{nl[k]}</div>')
            if s!=m.group(0): cards+=1
            return s
        t2=re.sub(r'<a class="card" href="(/ar)?/products/([^/"]+)/">.*?</a>',r,t,flags=re.S)
        if t2!=t: wr(p,t2)
print('product pages updated',pages,'cards updated',cards)
