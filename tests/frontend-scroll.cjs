// Run with NODE_PATH pointing to an installation containing playwright.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try {
 const page=await browser.newPage();
 await page.setContent('<style>body{margin:0}ah-shopping-card{display:block;width:450px;height:440px}</style>');
 await page.addScriptTag({path:path.resolve(__dirname,'../custom_components/ah_shopping/frontend/ah-shopping-card.js')});
 for(const source of ['shopping_list','shopping_list_and_order','next_order']){
 const result=await page.evaluate(async source=>{
  document.querySelector('ah-shopping-card')?.remove();
  const card=document.createElement('ah-shopping-card');
  card.setConfig({product_source:source});document.body.append(card);
  let seq=0;let items=Array.from({length:50},(_,i)=>({product_id:i+1,title:'Product '+(i+1),quantity:2,price_now:2}));
  const publish=()=>card.hass={states:{'todo.list':{entity_id:'todo.list',last_updated:String(++seq),attributes:{ah_shopping_list:true,items:items.map(i=>({...i})),estimated_total:200}},'sensor.order':{entity_id:'sensor.order',last_updated:String(seq),attributes:{ah_next_order:true,items:items.map(i=>({...i})),total_price:200}}}};
  publish();
  const list=card.shadowRoot.querySelector('.items');list.scrollTop=850;
  const row=[...list.children].find(x=>x.getBoundingClientRect().top>=list.getBoundingClientRect().top);
  const button=row.querySelector('[data-plus]');button?.focus();
  const top=list.scrollTop, y=row.getBoundingClientRect().top;
  let resolve;card._service=()=>new Promise(r=>resolve=r);
  button?.click();
  items.reverse();publish(); // Stale reordered state while the write is pending.
  if(resolve){resolve({});await Promise.resolve();await Promise.resolve();}
  publish(); // Confirmed refresh.
  await new Promise(requestAnimationFrame);
  const stable={container:list===card.shadowRoot.querySelector('.items'),row:row===list.querySelector(`[data-row-key="${row.dataset.rowKey}"]`),scroll:list.scrollTop===top,y:row.getBoundingClientRect().top===y,focus:!button||card.shadowRoot.activeElement===button};
  list.scrollTop+=50;const userScroll=list.scrollTop;
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  stable.userScroll=list.scrollTop===userScroll;
  return stable;
 },source);
 for(const [key,value] of Object.entries(result))assert.equal(value,true,`${source}: ${key}`);
 }
 const fallbackPreservesResult=await page.evaluate(async()=>{
  const card=document.createElement('ah-shopping-card');
  let reads=0,detected='';
  const pixels=new Uint8ClampedArray(320*120*4);
  const ctx={drawImage(){},getImageData(){return {width:320,height:120,data:pixels};}};
  card._scanner={querySelector:()=>({readyState:2,videoWidth:640})};
  card._stream={};card._config={scan_decoder:'auto'};card._decoderMode='zxing';
  card._decoderMisses=3;card._scanCanvas={getContext:()=>ctx};
  card._scanBandCanvas={getContext:()=>ctx};
  card._scanSourceRect=()=>({sx:0,sy:0,sw:320,sh:120});
  card._shouldScannerRun=()=>true;card._scheduleScan=()=>{};
  card._zxingReader={decodeFromCanvas(){if(++reads===1)throw new Error('No code');return {getText:()=> '4006381333931'};}};
  card._barcodeDetected=code=>detected=code;
  await card._scanFrame();return detected==='4006381333931';
 });
 assert.equal(fallbackPreservesResult,true,'Fallback must preserve a successful central-band decode');
 const lifecycle=await page.evaluate(async()=>{
  document.querySelector('ah-shopping-card')?.remove();
  const errors=[];window.addEventListener('error',e=>errors.push(e.message));
  const card=document.createElement('ah-shopping-card');
  let route='/dashboard/shopping',starts=0;
  card._routeKey=()=>route;
  card._startCamera=async()=>{starts++;card._stream={getTracks:()=>[{stop(){}}]};};
  card.setConfig({scanner_mode:'button_auto'});
  document.body.append(card);
  const settle=()=>new Promise(r=>setTimeout(r,100));
  await settle();const initial=starts===1&&card._scanInlineActive;
  card._closeScanner();await card._syncScannerVisibility();
  const staysClosed=starts===1&&!card._scanInlineActive;
  route='/dashboard/other';card.style.display='none';
  window.dispatchEvent(new Event('location-changed'));await settle();
  const away=starts===1&&!card._stream;
  route='/dashboard/shopping';card.style.display='';
  window.dispatchEvent(new Event('location-changed'));await settle();
  const revisit=starts===2&&card._scanInlineActive;
  card._closeScanner();card.remove();document.body.append(card);await settle();
  const reconnect=starts===3&&card._scanInlineActive;
  card._closeScanner();
  card._entity=()=>({attributes:{items:[],estimated_total:12,bonus_savings:3}});
  card._orderEntity=()=>({attributes:{items:[],estimated_product_total:10,bonus_savings:2,bonus_savings_estimated:true}});
  card._config.product_source='shopping_list_and_order';
  card._render();
  const noApprox=!card.shadowRoot.querySelector('.head').textContent.includes('≈');
  card.remove();return {initial,staysClosed,away,revisit,reconnect,noApprox,noErrors:errors.length===0};
 });
 for(const [key,value] of Object.entries(lifecycle))assert.equal(value,true,`scanner lifecycle: ${key}`);
 console.log('PASS: scanner initial visit, route return, reconnect, closed-session stability and exact header text');
 console.log('PASS: retained list/row/button nodes, scroll, focus and reordered delayed refreshes in all three views');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
