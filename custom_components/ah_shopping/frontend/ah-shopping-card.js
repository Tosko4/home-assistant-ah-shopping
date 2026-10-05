import { decodeEANFromImageData, checksumOk } from './ean-decoder.js';

class AhShoppingCard extends HTMLElement {
  constructor(){super(); this.attachShadow({mode:'open'}); this._config={}; this._hass=null; this._search=[]; this._busy=false; this._scanner=null; this._scanLoop=null; this._facing='environment'; this._message=''; this._query=''; this._lastEntitySig=null; this._barcodeDetector=null; this._decoderMode='local'; this._scanCount=0; this._scanBusy=false;}
  static getStubConfig(){return {title:'Boodschappen',mode:'full'};}
  static getConfigForm(){return {schema:[
    {name:'entity',selector:{entity:{domain:'sensor'}}},
    {name:'title',selector:{text:{}}},
    {name:'mode',selector:{select:{options:[
      {value:'full',label:'Volledige boodschappenlijst'},
      {value:'scan_only',label:'Alleen scanknop'}
    ]}}},
    {name:'height',selector:{number:{min:240,max:1200,step:10,mode:'box',unit_of_measurement:'px'}}},
    {name:'scan_label',selector:{text:{}}}
  ]};}
  setConfig(config){this._config={title:'Boodschappen',mode:'full',scan_label:'Scan product',...config}; this._render();}
  set hass(hass){this._hass=hass; const e=this._entity(); const sig=e?`${e.entity_id}|${e.last_updated}`:'none'; if(sig!==this._lastEntitySig){this._lastEntitySig=sig; this._render();}}
  getCardSize(){return this._config.mode==='scan_only'?1:7;}
  _entity(){if(!this._hass)return null; if(this._config.entity&&this._hass.states[this._config.entity])return this._hass.states[this._config.entity]; return Object.values(this._hass.states).find(s=>s.attributes?.ah_shopping_list===true)||null;}
  _esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  _money(n){return new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(Number(n||0));}
  async _service(service,data={}){if(!this._hass)throw new Error('Home Assistant is niet beschikbaar'); const result=await this._hass.callWS({type:'call_service',domain:'ah_shopping',service,service_data:data,return_response:true}); return result?.response||{};}
  async _change(pid,qty){if(this._busy)return; this._busy=true; try{await this._service('set_quantity',{product_id:pid,quantity:Math.max(0,qty)});}catch(e){this._toast(e.message||String(e),true);}finally{this._busy=false;}}
  async _remove(pid){return this._change(pid,0);}
  async _searchProducts(q){this._query=q; q=q.trim(); if(q.length<2){this._search=[];this._render();return;} try{const r=await this._service('search_products',{query:q,limit:6});this._search=r.products||[];}catch(e){this._toast(e.message||String(e),true);}this._render();}
  async _addProduct(pid){if(this._busy)return;this._busy=true;try{await this._service('add_product',{product_id:pid,quantity:1});this._search=[];this._query='';this._toast('Toegevoegd');}catch(e){this._toast(e.message||String(e),true);}finally{this._busy=false;this._render();}}
  _toast(msg,error=false){this._message=msg;this._messageError=error;this._render();clearTimeout(this._msgTimer);this._msgTimer=setTimeout(()=>{this._message='';this._render();},2800);}
  _render(){
    if(!this.shadowRoot)return;
    const mode=this._config.mode||'full';
    const scanLabel=this._config.scan_label||'Scan product';

    if(mode==='scan_only'){
      this.shadowRoot.innerHTML=`<style>${this._css()}</style><ha-card class="scanOnlyCard"><button id="scan" class="primary scanOnlyButton">▣ ${this._esc(scanLabel)}</button>${this._message?`<div class="toast ${this._messageError?'error':''}">${this._esc(this._message)}</div>`:''}</ha-card>`;
      this.shadowRoot.querySelector('#scan')?.addEventListener('click',()=>this._openScanner());
      return;
    }

    const entity=this._entity(); const a=entity?.attributes||{}; const items=a.items||[]; const title=this._config.title||'Boodschappen';
    const configuredHeight=Number(this._config.height||0);
    const fixedHeight=Number.isFinite(configuredHeight)&&configuredHeight>=240?Math.round(configuredHeight):0;
    const cardClass=fixedHeight?'fullCard fixedHeight':'fullCard';
    const cardStyle=fixedHeight?`height:${fixedHeight}px;`:'';
    this.shadowRoot.innerHTML=`<style>${this._css()}</style><ha-card class="${cardClass}" style="${cardStyle}"><div class="head"><div><div class="title">${this._esc(title)}</div><div class="sub">${items.length} producten · ${a.total_quantity??0} stuks</div></div><div class="total">${this._money(a.estimated_total||0)}<small>geschat totaal</small></div></div>
    ${!entity?'<div class="empty">Geen Albert Heijn Shopping List-sensor gevonden.</div>':''}
    <div class="search"><input id="q" value="${this._esc(this._query)}" placeholder="Product zoeken…"/><button id="scan" class="primary">▣ Scan</button></div>
    ${this._search.length?`<div class="results">${this._search.map(p=>`<button class="result" data-add="${p.id}"><span>${p.image_url?`<img src="${this._esc(p.image_url)}">`:''}</span><span><b>${this._esc(p.title)}</b><small>${this._esc(p.unit_size||'')} · ${this._money(p.price_now)}</small></span>${p.is_bonus?`<em>BONUS<br>${this._esc(p.bonus_mechanism||'Aanbieding')}</em>`:''}</button>`).join('')}</div>`:''}
    <div class="items">${items.length?items.map(i=>this._item(i)).join(''):'<div class="empty">Je boodschappenlijst is leeg.</div>'}</div>
    ${this._message?`<div class="toast ${this._messageError?'error':''}">${this._esc(this._message)}</div>`:''}
    </ha-card>`;
    const q=this.shadowRoot.querySelector('#q'); if(q){let t;q.addEventListener('input',e=>{this._query=e.target.value;clearTimeout(t);t=setTimeout(()=>this._searchProducts(e.target.value),300);});}
    this.shadowRoot.querySelector('#scan')?.addEventListener('click',()=>this._openScanner());
    this.shadowRoot.querySelectorAll('[data-add]').forEach(el=>el.addEventListener('click',()=>this._addProduct(Number(el.dataset.add))));
    this.shadowRoot.querySelectorAll('[data-minus]').forEach(el=>el.addEventListener('click',()=>this._change(Number(el.dataset.pid),Number(el.dataset.qty)-1)));
    this.shadowRoot.querySelectorAll('[data-plus]').forEach(el=>el.addEventListener('click',()=>this._change(Number(el.dataset.pid),Number(el.dataset.qty)+1)));
    this.shadowRoot.querySelectorAll('[data-remove]').forEach(el=>el.addEventListener('click',()=>this._remove(Number(el.dataset.pid))));
  }
  _item(i){const bonus=i.is_bonus?`<div class="bonus">BONUS · ${this._esc(i.bonus_mechanism||'Aanbieding')}</div>`:''; const old=i.is_bonus&&i.price_was>i.price_now?`<s>${this._money(i.price_was)}</s> `:''; const price=i.is_product?`<div class="price">${old}${this._money(i.price_now)}</div>`:'<small>Tekstitem</small>'; const controls=i.is_product?`<div class="qty"><button data-minus data-pid="${i.product_id}" data-qty="${i.quantity}">−</button><span>${i.quantity}</span><button data-plus data-pid="${i.product_id}" data-qty="${i.quantity}">+</button><button class="trash" data-remove data-pid="${i.product_id}">×</button></div>`:`<div class="qty"><span>${i.quantity}×</span></div>`; return `<div class="item">${i.image_url?`<img src="${this._esc(i.image_url)}">`:'<div class="ph">🛒</div>'}<div class="info"><b>${this._esc(i.title)}</b><small>${this._esc(i.unit_size||'')}</small>${price}${bonus}</div>${controls}</div>`;}
  async _openScanner(){
    if(!navigator.mediaDevices?.getUserMedia){this._toast('Camera is niet beschikbaar. Gebruik HTTPS en geef cameratoegang.',true);return;}
    const modal=document.createElement('div');modal.className='scanner';modal.innerHTML=`<style>${this._css()}</style><div class="scanbox"><div class="scanhead"><b>Barcode scannen</b><button id="close">×</button></div><div class="videoWrap"><video playsinline muted autoplay></video><div class="guide"></div></div><div id="scanstatus">Richt de barcode horizontaal in het kader</div><div class="scanbuttons"><button id="flip">↻ Voor/achter</button><button id="cancel">Klaar</button></div></div>`;
    this.shadowRoot.appendChild(modal);this._scanner=modal;modal.querySelector('#close').onclick=()=>this._closeScanner();modal.querySelector('#cancel').onclick=()=>this._closeScanner();modal.querySelector('#flip').onclick=async()=>{this._facing=this._facing==='environment'?'user':'environment';await this._startCamera();}; await this._startCamera();
  }
  async _startCamera(){
    if(!this._scanner)return;
    this._stopCamera();
    this._scanCount=0;
    this._scanBusy=false;
    const video=this._scanner.querySelector('video'),status=this._scanner.querySelector('#scanstatus');
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:this._facing},width:{ideal:1920},height:{ideal:1080}},audio:false});
      this._stream=stream;
      video.srcObject=stream;
      await video.play();
      this._scanCanvas=document.createElement('canvas');
      await this._initBarcodeDetector();
      status.textContent=`${this._facing==='environment'?'Achtercamera':'Frontcamera'} · scanner: ${this._decoderMode==='native'?'native':'fallback'} · zoeken…`;
      this._scheduleScan();
    }
    catch(e){status.textContent=`Camera kon niet openen: ${e.message||e}`;}
  }

  async _initBarcodeDetector(){
    this._barcodeDetector=null;
    this._decoderMode='local';
    if(!('BarcodeDetector' in window)) return;
    try{
      const wanted=['ean_13','ean_8','upc_a','upc_e'];
      let formats=wanted;
      if(typeof window.BarcodeDetector.getSupportedFormats==='function'){
        const supported=await window.BarcodeDetector.getSupportedFormats();
        formats=wanted.filter(f=>supported.includes(f));
      }
      if(!formats.length) return;
      this._barcodeDetector=new window.BarcodeDetector({formats});
      this._decoderMode='native';
    }catch(e){
      this._barcodeDetector=null;
      this._decoderMode='local';
    }
  }
  _scheduleScan(){clearTimeout(this._scanLoop);this._scanLoop=setTimeout(()=>this._scanFrame(),140);}
  async _scanFrame(){
    if(!this._scanner||!this._stream||this._scanBusy)return;
    const video=this._scanner.querySelector('video');
    if(video.readyState<2||!video.videoWidth){this._scheduleScan();return;}
    this._scanBusy=true;
    this._scanCount++;
    const status=this._scanner.querySelector('#scanstatus');
    let code=null;

    if(this._barcodeDetector){
      try{
        const found=await this._barcodeDetector.detect(video);
        const hit=(found||[]).find(x=>x?.rawValue);
        if(hit) code=String(hit.rawValue).replace(/\D/g,'');
      }catch(e){}
    }

    if(!code){
      const c=this._scanCanvas,ctx=c.getContext('2d',{willReadFrequently:true});
      const vw=video.videoWidth,vh=video.videoHeight;
      const rw=Math.floor(vw*.92),rh=Math.floor(vh*.50),sx=Math.floor((vw-rw)/2),sy=Math.floor((vh-rh)/2);
      c.width=Math.min(1200,rw);
      c.height=Math.max(160,Math.floor(rh*c.width/rw));
      ctx.drawImage(video,sx,sy,rw,rh,0,0,c.width,c.height);
      try{code=decodeEANFromImageData(ctx.getImageData(0,0,c.width,c.height));}catch(e){}
    }

    if(code && (/^\d{8}$/.test(code)||/^\d{12,14}$/.test(code)) && (code.length===12||code.length===14||checksumOk(code))){
      this._scanBusy=false;
      await this._barcodeFound(code);
      return;
    }

    if(status && this._scanCount%8===0){
      status.textContent=`${this._decoderMode==='native'?'Native scanner':'Fallback scanner'} actief · ${this._scanCount} frames gecontroleerd`;
    }
    this._scanBusy=false;
    this._scheduleScan();
  }
  async _barcodeFound(code){const status=this._scanner?.querySelector('#scanstatus'); if(status)status.textContent=`Gevonden: ${code} — toevoegen…`; this._stopCamera(false); try{const r=await this._service('add_barcode',{barcode:code,quantity:1}); const p=r.product||{}; if(status)status.textContent=`✓ ${p.title||code} · ${p.quantity_on_list||1}× op de lijst`; if(navigator.vibrate)navigator.vibrate(80); setTimeout(()=>this._closeScanner(),1000);}catch(e){if(status)status.textContent=e.message||String(e);setTimeout(()=>this._startCamera(),1800);}}
  _stopCamera(clear=true){clearTimeout(this._scanLoop);this._scanLoop=null;this._scanBusy=false;if(this._stream){this._stream.getTracks().forEach(t=>t.stop());this._stream=null;}if(clear){this._scanCanvas=null;this._barcodeDetector=null;}}
  _closeScanner(){this._stopCamera();this._scanner?.remove();this._scanner=null;}
  disconnectedCallback(){this._closeScanner();}
  _css(){return `:host{display:block}ha-card{overflow:hidden}.fullCard.fixedHeight{display:flex;flex-direction:column}.fullCard.fixedHeight .head,.fullCard.fixedHeight .search,.fullCard.fixedHeight .results{flex:0 0 auto}.fullCard.fixedHeight .items{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain}.fullCard.fixedHeight .results{max-height:35%;overflow-y:auto}.scanOnlyCard{padding:10px}.scanOnlyButton{display:block;width:100%;min-height:48px;font-size:16px}.head{display:flex;justify-content:space-between;align-items:flex-start;padding:18px 18px 12px}.title{font-size:20px;font-weight:700}.sub,small{display:block;color:var(--secondary-text-color);font-size:12px;margin-top:3px}.total{text-align:right;font-size:21px;font-weight:700}.total small{font-weight:400}.search{display:flex;gap:8px;padding:0 18px 12px}.search input{flex:1;min-width:0;padding:11px 12px;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);color:var(--primary-text-color);font-size:15px}button{border:0;border-radius:10px;padding:9px 12px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:14px}.primary{background:var(--primary-color);color:var(--text-primary-color,#fff);font-weight:600}.items{padding:0 10px 12px}.item{display:grid;grid-template-columns:54px 1fr auto;gap:10px;align-items:center;padding:10px 8px;border-top:1px solid var(--divider-color)}.item img,.ph{width:50px;height:50px;object-fit:contain;border-radius:8px}.ph{display:grid;place-items:center;background:var(--secondary-background-color)}.info{min-width:0}.info b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.price{font-weight:650;margin-top:3px}.price s{font-weight:400;color:var(--secondary-text-color);font-size:12px}.bonus{display:inline-block;margin-top:4px;padding:2px 5px;border-radius:5px;background:#00a03c;color:white;font-size:10px;font-weight:800}.qty{display:flex;align-items:center;gap:5px}.qty button{width:34px;height:34px;padding:0;font-size:20px}.qty span{min-width:20px;text-align:center;font-weight:700}.qty .trash{margin-left:3px;color:var(--error-color);font-size:17px}.empty{padding:22px;text-align:center;color:var(--secondary-text-color)}.results{margin:0 18px 12px;border:1px solid var(--divider-color);border-radius:10px;overflow:hidden}.result{width:100%;display:grid;grid-template-columns:40px 1fr auto;gap:8px;text-align:left;align-items:center;border-radius:0;border-bottom:1px solid var(--divider-color);background:var(--card-background-color)}.result:last-child{border-bottom:0}.result img{width:36px;height:36px;object-fit:contain}.result em{font-size:9px;color:#00a03c;font-style:normal;text-align:right}.toast{position:fixed;z-index:10001;left:50%;bottom:26px;transform:translateX(-50%);background:#2e7d32;color:white;padding:10px 16px;border-radius:20px;box-shadow:0 4px 16px #0005}.toast.error{background:var(--error-color,#c62828)}.scanner{position:fixed;z-index:10000;inset:0;background:#000e;display:grid;place-items:center;padding:12px}.scanbox{width:min(720px,100%);background:var(--card-background-color);border-radius:16px;overflow:hidden}.scanhead{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;font-size:18px}.scanhead button{font-size:24px}.videoWrap{position:relative;background:#000;aspect-ratio:4/3}.videoWrap video{width:100%;height:100%;object-fit:cover}.guide{position:absolute;left:8%;right:8%;top:35%;height:30%;border:3px solid #fff;border-radius:12px;box-shadow:0 0 0 9999px #0005}.guide:after{content:'';position:absolute;left:5%;right:5%;top:50%;height:2px;background:#f33}.scanbuttons{display:flex;gap:8px;justify-content:center;padding:12px}.scanbuttons button{min-width:130px}#scanstatus{text-align:center;padding:10px 12px 0;color:var(--secondary-text-color)}@media(max-width:520px){.item{grid-template-columns:46px 1fr}.item img,.ph{width:42px;height:42px}.qty{grid-column:2;justify-content:flex-end}.head{padding:14px}.search{padding-left:14px;padding-right:14px}}`;}
}
customElements.define('ah-shopping-card',AhShoppingCard);
window.customCards=window.customCards||[];window.customCards.push({type:'ah-shopping-card',name:'Albert Heijn Shopping',description:'Beheer je AH-boodschappenlijst en scan EAN-barcodes.'});
