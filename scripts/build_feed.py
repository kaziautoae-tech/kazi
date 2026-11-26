"""Builds public/google-products.xml (Google Merchant feed) from the product pages.
Runs automatically on every Cloudflare deploy (see wrangler.jsonc). Manual: python3 scripts/build_feed.py public"""
import json,os,re,html,sys
from xml.sax.saxutils import escape
os.chdir(sys.argv[1] if len(sys.argv)>1 else "public")
items=[];skipped_noimg=0;skipped_noprice=0
for sl in sorted(os.listdir('products')):
    f=f'products/{sl}/index.html'
    if not os.path.exists(f): continue
    t=open(f,encoding='utf-8').read()
    prod=None
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>',t,re.S):
        try: j=json.loads(m.group(1))
        except Exception: continue
        for o in j.get('@graph',[j]):
            if o.get('@type')=='Product': prod=o
    if not prod: continue
    off=prod.get('offers') or {}
    if isinstance(off,list): off=off[0]
    price=off.get('price') or off.get('lowPrice')
    if not price or float(price)<=0: skipped_noprice+=1; continue
    imgs=[i if isinstance(i,str) else i.get('url') for i in (prod.get('image') or [])]
    imgs=[i for i in imgs if i and not re.search(r'logo-|truck-',i)]
    if not imgs: skipped_noimg+=1; continue
    av='out_of_stock' if 'OutOfStock' in off.get('availability','') else 'in_stock'
    brand=prod.get('brand'); brand=brand.get('name') if isinstance(brand,dict) else (brand or 'FJ ZONE')
    desc=re.sub(r'\s+',' ',html.unescape(prod.get('description') or prod['name'])).strip()[:4900]
    items.append(dict(id=(prod.get('sku') or sl)[:50],title=prod['name'][:150],desc=desc,link=prod['url'],img=imgs[0],extra=imgs[1:10],price=f"{float(price):.2f} AED",av=av,brand=brand,ptype=prod.get('category','')))
out=['<?xml version="1.0" encoding="UTF-8"?>','<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">','<channel>','<title>FJ ZONE by Kazi Auto</title>','<link>https://kaziautotrading.com/</link>','<description>FJ ZONE product feed for Google Merchant Center</description>']
seen=set()
for it in items:
    if it['id'] in seen: it['id']=(it['id']+'-'+it['link'].rstrip('/').split('/')[-1])[:50]
    seen.add(it['id'])
    e=lambda s:escape(str(s))
    out.append('<item>')
    out+= [f'<g:id>{e(it["id"])}</g:id>',f'<g:title>{e(it["title"])}</g:title>',f'<g:description>{e(it["desc"])}</g:description>',f'<g:link>{e(it["link"])}</g:link>',f'<g:image_link>{e(it["img"])}</g:image_link>']
    out+=[f'<g:additional_image_link>{e(x)}</g:additional_image_link>' for x in it['extra']]
    out+=[f'<g:price>{it["price"]}</g:price>',f'<g:availability>{it["av"]}</g:availability>','<g:condition>new</g:condition>',f'<g:brand>{e(it["brand"])}</g:brand>',f'<g:product_type>{e(it["ptype"])}</g:product_type>','<g:identifier_exists>no</g:identifier_exists>',
          '<g:shipping><g:country>AE</g:country><g:price>0.00 AED</g:price></g:shipping>' if float(it['price'].split()[0])>=500 else '<g:shipping><g:country>AE</g:country><g:price>30.00 AED</g:price></g:shipping>']
    out.append('</item>')
out+=['</channel>','</rss>']
open('google-products.xml','w',encoding='utf-8').write('\n'.join(out)+'\n')
print('items',len(items),'no image',skipped_noimg,'no price',skipped_noprice)
