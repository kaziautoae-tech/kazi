"""Write public/data/catalog.json (name, category, variants with SKU/price/stock) for the admin page."""
import json,os,sys
ROOT=sys.argv[1] if len(sys.argv)>1 else 'public'
h=open(os.path.join(ROOT,'index.html'),encoding='utf-8').read()
d,_=json.JSONDecoder().raw_decode(h,h.find('[{"name"'))
out=[{'id':p['id'],'name':p['name'],'cat':p.get('cat',''),
      'v':[{'sku':v.get('sku'),'label':v.get('label') or '','price':v.get('price'),'oos':bool(v.get('oos'))} for v in p['v'] if v.get('sku')]} for p in d]
os.makedirs(os.path.join(ROOT,'data'),exist_ok=True)
json.dump(out,open(os.path.join(ROOT,'data/catalog.json'),'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
print('catalog',len(out),'products')
