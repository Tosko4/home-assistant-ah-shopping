const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../custom_components/ah_shopping/frontend');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><body></body>');return;}
 const file=path.resolve(root,pathname.replace(/^\/ah_shopping\//,''));
 if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
 try{res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':'application/javascript');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.addScriptTag({url:'/ah_shopping/ah-shopping-card.js'});
  const results=await page.evaluate(async()=>{
   const card=document.createElement('ah-shopping-card');
   await card._initWasmWorker();
   const ean='4006381333931';
   let bits='101';const parity=EAN_PARITY[Number(ean[0])];
   for(let i=0;i<6;i++)bits+=(parity[i]==='L'?EAN_L:EAN_G)[Number(ean[i+1])];
   bits+='01010';for(let i=7;i<13;i++)bits+=EAN_R[Number(ean[i])];bits+='101';
   const canvas=document.createElement('canvas');canvas.width=500;canvas.height=180;
   const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,500,180);ctx.fillStyle='black';
   [...bits].forEach((v,i)=>{if(v==='1')ctx.fillRect(60+i*4,35,4,110);});
   let id=0;const decode=async c=>{card._scanCount=++id;return card._decodeWasm(c.getContext('2d').getImageData(0,0,c.width,c.height),true);};
   const normal=await decode(canvas);
   const rotated=document.createElement('canvas');rotated.width=180;rotated.height=500;
   const rctx=rotated.getContext('2d');rctx.translate(180,0);rctx.rotate(Math.PI/2);rctx.drawImage(canvas,0,0);
   const rotatedCode=await decode(rotated);
   const wide=document.createElement('canvas');wide.width=1280;wide.height=720;
   const wctx=wide.getContext('2d');wctx.fillStyle='white';wctx.fillRect(0,0,1280,720);wctx.drawImage(canvas,700,450);
   const offCenter=await decode(wide);
   const blank=document.createElement('canvas');blank.width=400;blank.height=200;
   const bctx=blank.getContext('2d');bctx.fillStyle='white';bctx.fillRect(0,0,400,200);
   const noFalsePositive=await decode(blank)==='';
   let additions=0;card._pulseScanner=()=>{};card._setScanStatus=()=>{};card._processScanQueue=()=>{additions++;};
   card._barcodeDetected(ean);card._barcodeDetected(ean);
   const duplicateProtected=additions===1;
   let callback,scheduled=0;
   card._scanner={querySelector:()=>({requestVideoFrameCallback:cb=>{callback=cb;scheduled++;return 1;},cancelVideoFrameCallback(){}})};
   card._stream={};card._scanFrame=()=>{};
   card._scheduleScan();const immediate=scheduled===1&&typeof callback==='function'&&card._scanLoop===null;
   card._scanCooldownUntil=Date.now()+350;card._scheduleScan();
   const cooldown=card._scanLoop!=null&&scheduled===1;
   card._cancelScheduledScan();card._stopWasmWorker();
   return {normal,rotatedCode,offCenter,immediate,cooldown,noFalsePositive,duplicateProtected};
  });
  for(const key of ['normal','rotatedCode','offCenter'])assert.equal(results[key],'4006381333931',key);
  assert.equal(results.noFalsePositive,true);assert.equal(results.duplicateProtected,true);
  assert.equal(results.immediate,true);assert.equal(results.cooldown,true);
  console.log('PASS: locally bundled WASM, EAN decoding, rotation, off-center full-frame search, frame scheduling and success-only cooldown');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
