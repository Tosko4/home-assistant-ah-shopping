const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const R = L.map(p => [...p].map(c => c === "1" ? "0" : "1").join(""));
const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

function checksumOk(code) {
  if (!/^\d+$/.test(code) || ![8,12,13,14].includes(code.length)) return false;
  const digits=[...code].map(Number); const check=digits.pop(); let sum=0, weight=3;
  for(let i=digits.length-1;i>=0;i--){sum += digits[i]*weight; weight=weight===3?1:3;}
  return (10-(sum%10))%10===check;
}
function hamming(a,b){let d=0; for(let i=0;i<a.length;i++) if(a[i]!==b[i]) d++; return d;}
function matchDigit(pattern, sets){let best=null; for(const [type,arr] of sets){for(let d=0;d<10;d++){const dist=hamming(pattern,arr[d]); if(best===null||dist<best.dist) best={digit:d,type,dist};}} return best&&best.dist<=1?best:null;}
function guardOk(s, expected){return s.length===expected.length && hamming(s,expected)<=1;}

function decodeModules(modules){
  const s=modules.join("");
  if(s.length===95 && guardOk(s.slice(0,3),"101") && guardOk(s.slice(45,50),"01010") && guardOk(s.slice(92),"101")){
    let left="", parity="", right="";
    for(let i=0;i<6;i++){const m=matchDigit(s.slice(3+i*7,10+i*7),[["L",L],["G",G]]); if(!m)return null; left+=m.digit; parity+=m.type;}
    const first=PARITY.indexOf(parity); if(first<0)return null;
    for(let i=0;i<6;i++){const m=matchDigit(s.slice(50+i*7,57+i*7),[["R",R]]); if(!m)return null; right+=m.digit;}
    const code=`${first}${left}${right}`; return checksumOk(code)?code:null;
  }
  if(s.length===67 && guardOk(s.slice(0,3),"101") && guardOk(s.slice(31,36),"01010") && guardOk(s.slice(64),"101")){
    let code="";
    for(let i=0;i<4;i++){const m=matchDigit(s.slice(3+i*7,10+i*7),[["L",L]]); if(!m)return null; code+=m.digit;}
    for(let i=0;i<4;i++){const m=matchDigit(s.slice(36+i*7,43+i*7),[["R",R]]); if(!m)return null; code+=m.digit;}
    return checksumOk(code)?code:null;
  }
  return null;
}

function percentiles(values){const sorted=[...values].sort((a,b)=>a-b); return [sorted[Math.floor(sorted.length*.1)],sorted[Math.floor(sorted.length*.9)]];}
function binarize(values){const [lo,hi]=percentiles(values); if(hi-lo<35)return null; const t=(lo+hi)/2; return values.map(v=>v<t?1:0);}
function runs(bits){const out=[]; let value=bits[0],start=0; for(let i=1;i<=bits.length;i++){if(i===bits.length||bits[i]!==value){out.push({value,start,len:i-start}); if(i<bits.length){value=bits[i];start=i;}}} return out;}
function sample(bits,start,moduleWidth,count){const result=[]; for(let i=0;i<count;i++){const a=Math.max(0,Math.floor(start+i*moduleWidth)); const b=Math.min(bits.length,Math.ceil(start+(i+1)*moduleWidth)); if(b<=a)return null; let ones=0; for(let x=a;x<b;x++)ones+=bits[x]; result.push(ones/(b-a)>.5?"1":"0");} return result;}
function tryRuns(bits,count){const rs=runs(bits); for(let i=0;i<rs.length-2;i++){if(rs[i].value!==1||rs[i+1].value!==0||rs[i+2].value!==1)continue; const lens=[rs[i].len,rs[i+1].len,rs[i+2].len]; const min=Math.min(...lens),max=Math.max(...lens); if(min<1||max/min>2.0)continue; const base=(lens[0]+lens[1]+lens[2])/3; for(const scale of [.90,.94,.97,1,1.03,1.06,1.10]){const w=base*scale; if(rs[i].start+w*count>bits.length)continue; const modules=sample(bits,rs[i].start,w,count); if(!modules)continue; const code=decodeModules(modules); if(code)return code;}}
  return null;
}
function decodeRow(values){const bits=binarize(values); if(!bits)return null; return tryRuns(bits,95)||tryRuns(bits,67)||tryRuns([...bits].reverse(),95)||tryRuns([...bits].reverse(),67);}

export function decodeEANFromImageData(imageData){
  const {data,width,height}=imageData; const rows=[.30,.38,.46,.50,.54,.62,.70].map(v=>Math.max(0,Math.min(height-1,Math.floor(height*v))));
  for(const y of rows){const values=[]; for(let x=0;x<width;x++){const p=(y*width+x)*4; values.push(.299*data[p]+.587*data[p+1]+.114*data[p+2]);} const code=decodeRow(values); if(code)return code;}
  return null;
}
export {checksumOk, decodeModules};
