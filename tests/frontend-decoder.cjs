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
   let nativeCalls=0;window.BarcodeDetector=class {static getSupportedFormats(){nativeCalls++;return new Promise(()=>{});}};
   await card._initScannerEngine();
   const nativeIndependent=nativeCalls===0&&card._decoderMode==='wasm';
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
   // Exercise the actual crop/full-frame path instead of only the decoder API.
   Object.defineProperties(canvas,{readyState:{value:4},videoWidth:{value:500},videoHeight:{value:180}});
   card._scanner={querySelector:s=>s==='video'?canvas:null};card._stream={};
   card._shouldScannerRun=()=>true;card._scanCanvas=document.createElement('canvas');
   let scanned='';const originalDetected=card._barcodeDetected;const originalSchedule=card._scheduleScan;
   card._barcodeDetected=code=>{scanned=code;};card._scheduleScan=()=>{};
   for(let i=0;i<4;i++)await card._scanFrame();
   const fullPipeline=scanned===ean&&!card._scanBusy;
   const worker=card._decodeWorker;card._decodeWorker={postMessage(){},terminate(){}};
   let timeoutRecovered=false;
   try{await decode(canvas);}catch(error){timeoutRecovered=/antwoordt niet/.test(error.message)&&card._workerPending===null;}
   card._decodeWorker=worker;
   card._barcodeDetector={detect:()=>new Promise(()=>{})};
   let nativeTimeout=false;
   try{await card._detectNative(canvas);}catch(error){nativeTimeout=/antwoordt niet/.test(error.message)&&card._barcodeDetector===null;}
   const originalDecode=card._decodeWasm;card._decodeWasm=async()=>{throw new Error('test worker failure');};
   let visibleError='';card._setScanStatus=text=>{visibleError=text;};
   await card._scanFrame();
   const failureRecovered=card._decoderMode==='local'&&!card._scanBusy&&visibleError.includes('test worker failure');
   card._decodeWasm=originalDecode;card._barcodeDetected=originalDetected;card._scheduleScan=originalSchedule;
   let additions=0;card._setScanStatus=()=>{};card._processScanQueue=()=>{additions++;};
   card._barcodeDetected(ean);card._barcodeDetected(ean);
   const duplicateProtected=additions===1;
   const feedback=document.createElement('ah-shopping-card');
   feedback._scanner=document.createElement('div');feedback._config={scanner_mode:'permanent'};
   feedback._playScanBeep=()=>{};feedback._renderScanResult=()=>{};feedback._promoteScannedProduct=()=>{};feedback._setScanStatus=()=>{};
   const originalNow=Date.now;let now=100000;Date.now=()=>now;
   let serviceCalls=0;feedback._service=async()=>{serviceCalls++;return {product:{id:1}};};
   feedback._scanQueue.push(ean);await feedback._processScanQueue();
   const successGreen=feedback._scanCooldownUntil===now+1200&&feedback._scanner.classList.contains('scanCooldown');
   feedback._barcodeDetected('8710400015727');
   const cooldownBlocks=serviceCalls===1&&feedback._scanQueue.length===0;
   now+=1201;feedback._scheduleScan();feedback._noteBarcodeAbsent();
   const redAfterCooldown=!feedback._scanner.classList.contains('scanCooldown');
   const pauseNotAbsence=feedback._heldBarcode===ean;
   feedback._barcodeDetected(ean);
   const heldAfterPause=serviceCalls===1;
   now+=20;feedback._noteBarcodeAbsent();now+=701;feedback._noteBarcodeAbsent();
   feedback._barcodeDetected(ean);await Promise.resolve();
   const deliberateRepeat=serviceCalls===2;
   feedback._scanCooldownUntil=0;feedback._heldBarcode='';feedback._scheduleScan();
   let resolveAdd;feedback._service=()=>new Promise(resolve=>{resolveAdd=resolve;});
   feedback._barcodeDetected(ean);feedback._barcodeDetected('8710400015727');
   const pendingBlocks=feedback._scanProcessing&&feedback._scanQueue.length===0;
   resolveAdd({product:{id:1}});await Promise.resolve();
   feedback._scanCooldownUntil=0;feedback._scheduleScan();feedback._service=async()=>{throw new Error('not found');};
   feedback._scanQueue.push('8710400015727');await feedback._processScanQueue();
   const failedNoCooldown=feedback._scanCooldownUntil===0&&!feedback._scanner.classList.contains('scanCooldown');
   const cleanVisuals=!feedback._scannerView(true).includes('scanhealth')&&!feedback._css().includes('scanHit');
   Date.now=originalNow;
   let callback,scheduled=0,videoCallbacks=0;
   const originalRAF=window.requestAnimationFrame,originalCancel=window.cancelAnimationFrame;
   window.requestAnimationFrame=cb=>{callback=cb;scheduled++;return 1;};window.cancelAnimationFrame=()=>{};
   card._scanner={querySelector:()=>({requestVideoFrameCallback:()=>{videoCallbacks++;},cancelVideoFrameCallback(){}})};
   card._stream={};card._scanFrame=()=>{};
   card._scheduleScan();const immediate=scheduled===1&&typeof callback==='function'&&card._scanLoop===null&&videoCallbacks===0;
   card._scanCooldownUntil=Date.now()+1200;card._scheduleScan();
   const cooldown=card._scanLoop!=null&&scheduled===1;
   card._cancelScheduledScan();window.requestAnimationFrame=originalRAF;window.cancelAnimationFrame=originalCancel;
   card._cancelScheduledScan();card._stopWasmWorker();
   return {normal,rotatedCode,offCenter,immediate,cooldown,noFalsePositive,duplicateProtected,nativeIndependent,fullPipeline,timeoutRecovered,nativeTimeout,failureRecovered,successGreen,cooldownBlocks,redAfterCooldown,pauseNotAbsence,heldAfterPause,deliberateRepeat,pendingBlocks,failedNoCooldown,cleanVisuals};
  });
  for(const key of ['normal','rotatedCode','offCenter'])assert.equal(results[key],'4006381333931',key);
  for(const key of ['nativeIndependent','fullPipeline','timeoutRecovered','nativeTimeout','failureRecovered'])assert.equal(results[key],true,key);
  for(const key of ['successGreen','cooldownBlocks','redAfterCooldown','pauseNotAbsence','heldAfterPause','deliberateRepeat','pendingBlocks','failedNoCooldown','cleanVisuals'])assert.equal(results[key],true,key);
  assert.equal(results.noFalsePositive,true);assert.equal(results.duplicateProtected,true);
  assert.equal(results.immediate,true);assert.equal(results.cooldown,true);
  console.log('PASS: locally bundled WASM, EAN decoding, rotation, off-center full-frame search, frame scheduling and success-only cooldown');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
