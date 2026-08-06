// Domain Extraction — EXACT model/brand matching for product ER
export interface ProductFields { readonly brand: string; readonly models: readonly string[]; readonly specs: readonly string[]; readonly color: string; readonly size: string }
const BRANDS = new Set(['apple','samsung','sony','lg','dell','hp','lenovo','asus','acer','microsoft','google','amazon','bose','sennheiser','jbl','logitech','canon','nikon','gopro','fujifilm','panasonic','toshiba','philips','xiaomi','huawei','oneplus','motorola','nokia','sandisk','kingston','crucial','corsair','intel','amd','nvidia','belkin','anker','fitbit','garmin','polar','beats','dyson','irobot','nest','ring','tcl','hisense','vizio','sharp','linksys','netgear','tp-link','razer','steelseries','creative','yamaha','denon','onkyo','pioneer','brother','epson','bt','sky','eureka','hoover','bissell','shark','polaroid','kodak','olympus','sigma'])
const MODEL_RE = /\b([A-Z]{1,3}[\-]?\d{2,6}[A-Z]*(\/[A-Z0-9]+)?)\b/g
const DIGIT_RE = /\b(\d{2,}[A-Z]*|[A-Z]+\d{2,})\b/gi
const SIZE_RE = /\b(\d+(?:\.\d+)?\s*(?:GB|TB|MB|MHz|GHz|inch|'|"|mm|cm))\b/gi
export function extractElectronicsFields(name: string): ProductFields {
  const lo = name.toLowerCase().trim(); let br = ''
  for(const b of BRANDS) if(lo.includes(b)&&b.length>br.length) br=b
  const ms = new Set<string>() 
  for(const m of name.matchAll(MODEL_RE)) ms.add(m[0])
  for(const m of name.matchAll(DIGIT_RE)) ms.add(m[0])
  const sz: string[] = []; for(const m of name.matchAll(SIZE_RE)) sz.push(m[0])
  const sp: string[] = [] 
  for(const m of name.matchAll(/\b(\d[\d\.,\/]*[A-Za-z]*)\b/g)) { const t=m[0]; if(!ms.has(t)&&!sz.includes(t)) sp.push(t) }
  return { brand: br||'', models: [...ms], specs: [...new Set(sp)], color: '', size: [...new Set(sz)].join(' ') }
}
export function scoreProductPair(a: ProductFields, b: ProductFields): { score: number; modelMatch: number; brandMatch: number } {
  let mm=0; for(const ma of a.models) for(const mb of b.models) if(ma.toLowerCase()===mb.toLowerCase()){mm=1;break}
  const bm=(a.brand&&b.brand&&a.brand.toLowerCase()===b.brand.toLowerCase())?1:0
  let so=0; if(a.specs.length>0||b.specs.length>0){const as=new Set(a.specs.map(s=>s.toLowerCase()));const bs=new Set(b.specs.map(s=>s.toLowerCase()));let sh=0;for(const s of as)if(bs.has(s))sh++;so=(as.size+bs.size)>0?sh/(as.size+bs.size-sh):0}
  const sc=mm*0.4+bm*0.3+so*0.1; return { score:sc, modelMatch:mm, brandMatch:bm }
}
