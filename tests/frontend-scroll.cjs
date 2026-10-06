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
 console.log('PASS: retained list/row/button nodes, scroll, focus and reordered delayed refreshes in all three views');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
