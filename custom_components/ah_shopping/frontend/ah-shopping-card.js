import { decodeEANFromImageData, checksumOk } from './ean-decoder.js';

class AhShoppingCard extends HTMLElement {
  constructor(){super(); this.attachShadow({mode:'open'}); this._config={}; this._hass=null; this._listScrollTop=0; this._busy=false; this._refreshing=false; this._scanner=null; this._scanLoop=null; this._scanSessionTimer=null; this._facing='environment'; this._message=''; this._query=''; this._lastEntitySig=null; this._barcodeDetector=null; this._zxingReader=null; this._zxingTask=null; this._decoderMode='local'; this._scanCount=0; this._scanBusy=false; this._scanProcessing=false; this._scanQueue=[]; this._heldBarcode=''; this._heldBarcodeLastSeen=0; this._audioContext=null; this._scanProduct=null; this._scanPendingQty=new Map(); this._scanQtyWorkers=new Map(); this._pendingQty=new Map(); this._qtyWorkers=new Map();}
  static getStubConfig(){return {show_header:true,show_scan:true,show_products:true,product_source:'shopping_list'};}
  static getConfigForm(){return {schema:[
    {name:'entity',selector:{entity:{domain:'sensor'}}},
    {name:'title',selector:{text:{}}},
    {name:'show_header',selector:{boolean:{}}},
    {name:'show_scan',selector:{boolean:{}}},
    {name:'show_products',selector:{boolean:{}}},
    {name:'product_source',selector:{select:{options:[
      {value:'shopping_list',label:'Boodschappenlijst'},
      {value:'cart',label:'Winkelmandje'},
      {value:'next_order',label:'Volgende bestelling'},
      {value:'cart_and_order',label:'Winkelmandje + volgende bestelling'}
    ]}}},
    {name:'height',selector:{number:{min:160,max:1200,step:10,mode:'box',unit_of_measurement:'px'}}},
    {name:'scan_label',selector:{text:{}}}
  ]};}
  setConfig(config){
    const legacyScanOnly=config.mode==='scan_only';
    this._config={
      show_header:legacyScanOnly?false:true,
      show_scan:true,
      show_products:legacyScanOnly?false:true,
      product_source:'shopping_list',
      scan_label:'Scan product',
      ...config
    };
    this._render();
  }
  set hass(hass){
    this._hass=hass;
    const entities=[this._entity(),this._cartEntity(),this._orderEntity()].filter(Boolean);
    const sig=entities.map(e=>`${e.entity_id}|${e.last_updated}`).join(';')||'none';
    if(sig!==this._lastEntitySig){this._lastEntitySig=sig;if(!this._scanner)this._render();}
  }
  getCardSize(){
    if(this._config.show_products===false&&this._config.show_header===false)return this._config.show_scan===false?1:1;
    return 7;
  }
  _entity(){if(!this._hass)return null;if(this._config.entity&&this._hass.states[this._config.entity])return this._hass.states[this._config.entity];return Object.values(this._hass.states).find(s=>s.attributes?.ah_shopping_list===true)||null;}
  _cartEntity(){if(!this._hass)return null;return Object.values(this._hass.states).find(s=>s.attributes?.ah_active_cart===true)||null;}
  _orderEntity(){if(!this._hass)return null;return Object.values(this._hass.states).find(s=>s.attributes?.ah_next_order===true)||null;}
  _combinedItems(cartItems,orderItems){
    const map=new Map();
    for(const [source,items] of [['Winkelmandje',cartItems],['Bestelling',orderItems]]){
      for(const raw of items||[]){
        const key=raw.product_id>0?`p:${raw.product_id}`:`t:${String(raw.title||'').toLowerCase()}`;
        const existing=map.get(key);
        if(existing){
          existing.quantity=Number(existing.quantity||0)+Number(raw.quantity||0);
          existing.source_label=existing.source_label.includes(source)?existing.source_label:`${existing.source_label} + ${source}`;
          if(!existing.image_url&&raw.image_url)existing.image_url=raw.image_url;
          if(!existing.price_now&&raw.price_now)existing.price_now=raw.price_now;
        }else{
          map.set(key,{...raw,quantity:Number(raw.quantity||0),source_label:source});
        }
      }
    }
    return [...map.values()];
  }
  _viewData(){
    const source=this._config.product_source||'shopping_list';
    const list=this._entity()?.attributes||{};
    const cart=this._cartEntity()?.attributes||{};
    const order=this._orderEntity()?.attributes||{};

    if(source==='cart'){
      return {items:cart.items||[],total_quantity:cart.total_quantity||0,total_price:cart.total_price||0,unique_items:cart.unique_items||0,label:'Winkelmandje',read_only:false,edit_source:'cart',entity:this._cartEntity(),pending_changes:cart.pending_changes||0};
    }
    if(source==='next_order'){
      return {items:order.items||[],total_quantity:order.total_quantity||0,total_price:order.total_price||0,unique_items:order.unique_items||0,label:'Volgende bestelling',read_only:true,entity:this._orderEntity(),delivery:order.delivery_date_display||order.delivery_date||'',time:order.delivery_time_display||''};
    }
    if(source==='cart_and_order'){
      const items=this._combinedItems(cart.items||[],order.items||[]);
      return {items,total_quantity:items.reduce((sum,i)=>sum+Number(i.quantity||0),0),total_price:Number(cart.total_price||0)+Number(order.total_price||0),unique_items:items.length,label:'Winkelmandje + bestelling',read_only:true,entity:this._cartEntity()||this._orderEntity(),delivery:order.delivery_date_display||order.delivery_date||'',time:order.delivery_time_display||''};
    }
    return {items:list.items||[],total_quantity:list.total_quantity||0,total_price:list.estimated_total||0,unique_items:list.unique_items||0,label:'Boodschappenlijst',read_only:false,edit_source:'shopping_list',entity:this._entity(),bonus_savings:list.bonus_savings||0,pending_changes:list.pending_changes||0};
  }
  _esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  _money(n){return new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(Number(n||0));}
  async _service(service,data={}){if(!this._hass)throw new Error('Home Assistant is niet beschikbaar'); const result=await this._hass.callWS({type:'call_service',domain:'ah_shopping',service,service_data:data,return_response:true}); return result?.response||{};}
  _quantityKey(source,pid){return `${source}:${pid}`;}
  _adjustQuantity(source,pid,current,delta){
    const key=this._quantityKey(source,pid);
    const base=this._pendingQty.has(key)?this._pendingQty.get(key):Number(current||0);
    this._pendingQty.set(key,Math.max(0,base+delta));
    this._render();
    this._queueQuantityWrite(source,pid);
  }
  _remove(source,pid){
    const key=this._quantityKey(source,pid);
    this._pendingQty.set(key,0);
    this._render();
    this._queueQuantityWrite(source,pid);
  }
  _queueQuantityWrite(source,pid){
    const key=this._quantityKey(source,pid);
    if(this._qtyWorkers.has(key))return;
    const worker=(async()=>{
      while(this._pendingQty.has(key)){
        const target=this._pendingQty.get(key);
        const service=source==='cart'?'set_cart_quantity':'set_quantity';
        try{
          await this._service(service,{product_id:pid,quantity:target});
        }catch(e){
          this._pendingQty.delete(key);
          this._toast(e.message||String(e),true);
          break;
        }
        if(this._pendingQty.get(key)===target){
          this._pendingQty.delete(key);
          this._render();
          break;
        }
      }
    })().finally(()=>this._qtyWorkers.delete(key));
    this._qtyWorkers.set(key,worker);
  }

  _toast(msg,error=false){this._message=msg;this._messageError=error;this._render();clearTimeout(this._msgTimer);this._msgTimer=setTimeout(()=>{this._message='';this._render();},2800);}
  _render(){
    if(!this.shadowRoot)return;

    const oldList=this.shadowRoot.querySelector('.items');
    if(oldList)this._listScrollTop=oldList.scrollTop;

    const view=this._viewData();
    const entity=view.entity;
    const items=view.items||[];
    const title=this._config.title||view.label;
    const showHeader=this._config.show_header!==false;
    const showScan=this._config.show_scan!==false;
    const showProducts=this._config.show_products!==false;
    const scanLabel=this._config.scan_label||'Scan product';
    const configuredHeight=Number(this._config.height||0);
    const fixedHeight=showProducts&&Number.isFinite(configuredHeight)&&configuredHeight>=160?Math.round(configuredHeight):0;
    const cardClass=fixedHeight?'fullCard fixedHeight':'fullCard';
    const cardStyle=fixedHeight?`height:${fixedHeight}px;`:'';
    const syncText=view.pending_changes? ` · ${view.pending_changes} wijziging${view.pending_changes===1?'':'en'} bezig` : '';
    const sourceText=view.delivery?`${view.label} · ${view.delivery}${view.time?` · ${view.time}`:''}`:view.label;
    const totalNote=view.bonus_savings? `Bonus −${this._money(view.bonus_savings)}` : sourceText;

    const header=showHeader
      ? `<div class="head"><div><div class="title">${this._esc(title)}</div><div class="sub">${items.length} artikelen · ${view.total_quantity??0} stuks${syncText}</div></div><div class="total">${this._money(view.total_price||0)}<small>${this._esc(totalNote)}</small></div></div>`
      : '';
    const scan=showScan
      ? `<div class="scanArea"><button id="scan" class="primary scanWide">▣ ${this._esc(scanLabel)}</button></div>`
      : '';
    const products=showProducts
      ? `<div class="items">${items.length?items.map(i=>this._item(i,view.edit_source||null)).join(''):`<div class="empty">Geen producten in ${this._esc(view.label.toLowerCase())}.</div>`}</div>`
      : '';

    this.shadowRoot.innerHTML=`<style>${this._css()}</style><ha-card class="${cardClass}" style="${cardStyle}">${header}${!entity&&showProducts?'<div class="empty">Deze gegevensbron is nog niet beschikbaar.</div>':''}${scan}${products}${this._message?`<div class="toast ${this._messageError?'error':''}">${this._esc(this._message)}</div>`:''}</ha-card>`;

    this.shadowRoot.querySelector('#scan')?.addEventListener('click',()=>this._openScanner());
    this.shadowRoot.querySelectorAll('[data-minus]').forEach(el=>el.addEventListener('click',()=>this._adjustQuantity(el.dataset.source,Number(el.dataset.pid),Number(el.dataset.qty),-1)));
    this.shadowRoot.querySelectorAll('[data-plus]').forEach(el=>el.addEventListener('click',()=>this._adjustQuantity(el.dataset.source,Number(el.dataset.pid),Number(el.dataset.qty),1)));
    this.shadowRoot.querySelectorAll('[data-remove]').forEach(el=>el.addEventListener('click',()=>this._remove(el.dataset.source,Number(el.dataset.pid))));

    const list=this.shadowRoot.querySelector('.items');
    if(list)list.scrollTop=this._listScrollTop;
  }
  _item(i,editSource=null){const key=editSource?this._quantityKey(editSource,i.product_id):''; const qty=key&&this._pendingQty.has(key)?this._pendingQty.get(key):i.quantity; const bonus=i.is_bonus?`<div class="bonus">BONUS · ${this._esc(i.bonus_mechanism||'Aanbieding')}</div>`:''; const source=i.source_label?`<small>${this._esc(i.source_label)}</small>`:''; const old=i.is_bonus&&i.price_was>i.price_now?`<s>${this._money(i.price_was)}</s> `:''; const price=i.price_now?`<div class="price">${old}${this._money(i.price_now)}</div>`:''; const controls=editSource&&i.product_id>0?`<div class="qty"><button data-minus data-source="${editSource}" data-pid="${i.product_id}" data-qty="${qty}">−</button><span>${qty}</span><button data-plus data-source="${editSource}" data-pid="${i.product_id}" data-qty="${qty}">+</button><button class="trash" data-remove data-source="${editSource}" data-pid="${i.product_id}">×</button></div>`:`<div class="qty"><span>${qty}×</span></div>`; return `<div class="item">${i.image_url?`<img src="${this._esc(i.image_url)}">`:'<div class="ph">🛒</div>'}<div class="info"><b>${this._esc(i.title)}</b><small>${this._esc(i.unit_size||'')}</small>${price}${bonus}${source}</div>${controls}</div>`;}
  async _openScanner(){
    if(!navigator.mediaDevices?.getUserMedia){this._toast('Camera is niet beschikbaar. Gebruik HTTPS en geef cameratoegang.',true);return;}
    this._armScanAudio();
    this._scanQueue=[];
    this._scanProcessing=false;
    this._heldBarcode='';
    this._heldBarcodeLastSeen=0;
    this._scanProduct=null;

    const modal=document.createElement('div');
    modal.className='scanner';
    modal.innerHTML=`<style>${this._css()}</style><div class="scanbox"><div class="scanhead"><div><b>Barcode scannen</b><small>Camera maximaal 1 minuut actief</small></div><button id="close">×</button></div><div class="scanbody"><div class="scanCameraPane"><div class="videoWrap"><video playsinline muted autoplay></video><div class="guide"></div></div><div id="scanstatus">Richt de barcode horizontaal in het kader</div><div class="scanbuttons"><button id="flip">↻ Voor/achter</button><button id="cancel">Klaar</button></div></div><div id="scanresult" class="scanResult"><div class="scanPlaceholder"><span>🛒</span><b>Nog niets gescand</b><small>Een succesvol gescand product verschijnt hier.</small></div></div></div></div>`;
    this.shadowRoot.appendChild(modal);
    this._scanner=modal;
    modal.querySelector('#close').onclick=()=>this._closeScanner();
    modal.querySelector('#cancel').onclick=()=>this._closeScanner();
    modal.querySelector('#flip').onclick=async()=>{this._facing=this._facing==='environment'?'user':'environment';await this._startCamera();};

    this._armScannerTimeout(60000);
    await this._startCamera();
  }

  _armScannerTimeout(ms){
    clearTimeout(this._scanSessionTimer);
    this._scanSessionTimer=setTimeout(()=>{
      if(this._scanProcessing||this._scanQueue.length){
        this._armScannerTimeout(1000);
        return;
      }
      this._closeScanner();
    },ms);
  }

  _armScanAudio(){
    try{
      const AudioCtx=window.AudioContext||window.webkitAudioContext;
      if(!AudioCtx)return;
      if(!this._audioContext)this._audioContext=new AudioCtx();
      if(this._audioContext.state==='suspended')this._audioContext.resume();
    }catch(e){}
  }

  _playScanBeep(){
    try{
      const ctx=this._audioContext;
      if(!ctx)return;
      const now=ctx.currentTime;
      const osc=ctx.createOscillator();
      const gain=ctx.createGain();
      osc.type='square';
      osc.frequency.setValueAtTime(1380,now);
      osc.frequency.setValueAtTime(1680,now+0.045);
      gain.gain.setValueAtTime(0.0001,now);
      gain.gain.exponentialRampToValueAtTime(0.12,now+0.004);
      gain.gain.setValueAtTime(0.12,now+0.075);
      gain.gain.exponentialRampToValueAtTime(0.0001,now+0.115);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now+0.12);
    }catch(e){}
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
      await this._initScannerEngine();
      const label=this._decoderMode==='native'?'native':this._decoderMode==='zxing'?'ZXing':'lokale fallback';
      status.textContent=`${this._facing==='environment'?'Achtercamera':'Frontcamera'} · scanner: ${label} · zoeken…`;
      if(this._decoderMode==='zxing')this._startZXing(video);
      else this._scheduleScan();
    }catch(e){
      status.textContent=`Camera kon niet openen: ${e.message||e}`;
    }
  }

  async _initScannerEngine(){
    this._barcodeDetector=null;
    this._zxingReader=null;
    this._decoderMode='local';

    if('BarcodeDetector' in window){
      try{
        const wanted=['ean_13','ean_8','upc_a','upc_e'];
        let formats=wanted;
        if(typeof window.BarcodeDetector.getSupportedFormats==='function'){
          const supported=await window.BarcodeDetector.getSupportedFormats();
          formats=wanted.filter(f=>supported.includes(f));
        }
        if(formats.length){
          this._barcodeDetector=new window.BarcodeDetector({formats});
          this._decoderMode='native';
          return;
        }
      }catch(e){}
    }

    try{
      await this._loadZXing();
      if(window.ZXing?.BrowserMultiFormatReader){
        const hints=new Map();
        if(window.ZXing.DecodeHintType&&window.ZXing.BarcodeFormat){
          hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS,[
            window.ZXing.BarcodeFormat.EAN_13,
            window.ZXing.BarcodeFormat.EAN_8,
            window.ZXing.BarcodeFormat.UPC_A,
            window.ZXing.BarcodeFormat.UPC_E
          ]);
          hints.set(window.ZXing.DecodeHintType.TRY_HARDER,true);
        }
        this._zxingReader=new window.ZXing.BrowserMultiFormatReader(hints,250);
        this._decoderMode='zxing';
        return;
      }
    }catch(e){
      console.warn('AH Shopping: ZXing could not be loaded',e);
    }
    this._decoderMode='local';
  }

  async _loadZXing(){
    if(window.ZXing?.BrowserMultiFormatReader)return;
    if(window.__ahShoppingZXingPromise){await window.__ahShoppingZXingPromise;return;}
    window.__ahShoppingZXingPromise=new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-ah-shopping-zxing]');
      if(existing){
        existing.addEventListener('load',resolve,{once:true});
        existing.addEventListener('error',()=>reject(new Error('ZXing kon niet worden geladen')),{once:true});
        if(window.ZXing?.BrowserMultiFormatReader)resolve();
        return;
      }
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/@zxing/library@0.23.0/umd/index.min.js';
      script.async=true;
      script.dataset.ahShoppingZxing='true';
      script.onload=()=>resolve();
      script.onerror=()=>reject(new Error('ZXing CDN kon niet worden geladen'));
      document.head.appendChild(script);
    });
    await window.__ahShoppingZXingPromise;
  }

  _startZXing(video){
    if(!this._zxingReader)return;
    const status=this._scanner?.querySelector('#scanstatus');
    this._zxingTask=this._zxingReader.decodeFromVideoElementContinuously(video,(result,err)=>{
      if(!this._scanner||!this._stream)return;
      this._scanCount++;
      if(result){
        const raw=typeof result.getText==='function'?result.getText():result.text;
        const code=String(raw||'').replace(/\D/g,'');
        if(code)this._barcodeDetected(code);
      }else{
        this._noteBarcodeAbsent();
      }
      if(status&&this._scanCount%10===0&&!this._scanProcessing){
        status.textContent=`ZXing actief · ${this._scanCount} frames gecontroleerd`;
      }
      if(err&&window.ZXing?.NotFoundException&&!(err instanceof window.ZXing.NotFoundException)){
        console.debug('AH Shopping ZXing scan error',err);
      }
    }).catch(err=>{
      console.warn('AH Shopping: ZXing scanning stopped',err);
      if(!this._scanner||!this._stream)return;
      this._decoderMode='local';
      if(status)status.textContent='ZXing gestopt · lokale fallback actief';
      this._scheduleScan();
    });
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
        if(hit)code=String(hit.rawValue).replace(/\D/g,'');
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

    if(code&&(/^\d{8}$/.test(code)||/^\d{12,14}$/.test(code))&&(code.length===12||code.length===14||checksumOk(code))){
      this._barcodeDetected(code);
    }else{
      this._noteBarcodeAbsent();
    }

    if(status&&this._scanCount%8===0&&!this._scanProcessing){
      status.textContent=`${this._decoderMode==='native'?'Native scanner':'Lokale fallback'} actief · ${this._scanCount} frames gecontroleerd`;
    }
    this._scanBusy=false;
    this._scheduleScan();
  }

  _noteBarcodeAbsent(){
    if(this._heldBarcode&&Date.now()-this._heldBarcodeLastSeen>700){
      this._heldBarcode='';
      this._heldBarcodeLastSeen=0;
    }
  }

  _barcodeDetected(code){
    const now=Date.now();
    if(this._heldBarcode===code){
      this._heldBarcodeLastSeen=now;
      return;
    }
    this._heldBarcode=code;
    this._heldBarcodeLastSeen=now;
    this._scanQueue.push(code);
    const status=this._scanner?.querySelector('#scanstatus');
    if(status)status.textContent=`Gevonden: ${code} · verwerken…`;
    this._processScanQueue();
  }

  async _processScanQueue(){
    if(this._scanProcessing)return;
    this._scanProcessing=true;
    while(this._scanner&&this._scanQueue.length){
      const code=this._scanQueue.shift();
      const status=this._scanner.querySelector('#scanstatus');
      try{
        const r=await this._service('add_barcode',{barcode:code,quantity:1});
        const p={...(r.product||{})};
        p.barcode=code;
        p.quantity_on_list=Math.max(1,Number(p.quantity_on_list||1));
        this._scanProduct=p;
        this._playScanBeep();
        if(navigator.vibrate)navigator.vibrate(70);
        this._renderScanResult();
        if(status)status.textContent=`✓ ${p.title||code} · blijf scannen · sluit 5 sec na laatste scan`;
        this._armScannerTimeout(5000);
      }catch(e){
        if(status)status.textContent=e.message||String(e);
      }
    }
    this._scanProcessing=false;
  }

  _renderScanResult(){
    const result=this._scanner?.querySelector('#scanresult');
    const p=this._scanProduct;
    if(!result||!p)return;
    const qty=Math.max(1,Number(p.quantity_on_list||1));
    const old=p.price_was>p.price_now?`<s>${this._money(p.price_was)}</s> `:'';
    const bonus=p.is_bonus?`<div class="scanBonus">BONUS · ${this._esc(p.bonus_mechanism||'Aanbieding')}</div>`:'';
    const image=p.image_url?`<img src="${this._esc(p.image_url)}" alt="">`:'<div class="scanPh">🛒</div>';
    result.innerHTML=`<div class="scanSuccess">✓ Gescand</div><div class="scanProduct">${image}<div class="scanProductInfo"><b>${this._esc(p.title||p.barcode||'Product')}</b><small>${this._esc(p.unit_size||'')}</small><div class="scanPrice">${old}${this._money(p.price_now)}</div>${bonus}</div></div><div class="scanQtyRow"><span>Aantal op lijst</span><div class="scanQty"><button id="scanMinus">−</button><strong>${qty}</strong><button id="scanPlus">+</button></div></div><small class="scanHint">De camera blijft actief. Haal dezelfde barcode kort uit beeld voordat je hem opnieuw scant.</small>`;
    result.querySelector('#scanMinus')?.addEventListener('click',()=>this._adjustScanQuantity(-1));
    result.querySelector('#scanPlus')?.addEventListener('click',()=>this._adjustScanQuantity(1));
  }

  _adjustScanQuantity(delta){
    const p=this._scanProduct;
    if(!p?.id)return;
    const next=Math.max(1,Number(p.quantity_on_list||1)+delta);
    p.quantity_on_list=next;
    this._scanPendingQty.set(Number(p.id),next);
    this._renderScanResult();
    this._queueScanQuantity(Number(p.id));
  }

  _queueScanQuantity(pid){
    if(this._scanQtyWorkers.has(pid))return;
    const worker=(async()=>{
      while(this._scanPendingQty.has(pid)){
        const target=this._scanPendingQty.get(pid);
        try{
          await this._service('set_quantity',{product_id:pid,quantity:target});
        }catch(e){
          this._scanPendingQty.delete(pid);
          const result=this._scanner?.querySelector('#scanresult');
          if(result){
            const error=document.createElement('div');
            error.className='scanError';
            error.textContent=e.message||String(e);
            result.prepend(error);
          }
          break;
        }
        if(this._scanPendingQty.get(pid)===target)this._scanPendingQty.delete(pid);
      }
    })().finally(()=>this._scanQtyWorkers.delete(pid));
    this._scanQtyWorkers.set(pid,worker);
  }

  _stopCamera(clear=true){
    clearTimeout(this._scanLoop);
    this._scanLoop=null;
    this._scanBusy=false;
    try{this._zxingReader?.reset();}catch(e){}
    this._zxingReader=null;
    this._zxingTask=null;
    if(this._stream){
      this._stream.getTracks().forEach(t=>t.stop());
      this._stream=null;
    }
    if(clear){
      this._scanCanvas=null;
      this._barcodeDetector=null;
    }
  }

  _closeScanner(){
    clearTimeout(this._scanSessionTimer);
    this._scanSessionTimer=null;
    this._scanQueue=[];
    this._stopCamera();
    this._scanner?.remove();
    this._scanner=null;
    this._scanProduct=null;
    this._scanProcessing=false;
    this._heldBarcode='';
    this._render();
  }

  disconnectedCallback(){this._closeScanner();}

  _css(){return `:host{display:block}ha-card{overflow:hidden}.fullCard.fixedHeight{display:flex;flex-direction:column}.fullCard.fixedHeight .head,.fullCard.fixedHeight .scanArea{flex:0 0 auto}.fullCard.fixedHeight .items{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain}.scanArea{padding:0 18px 14px}.scanWide{display:block;width:100%;min-height:48px;font-size:16px}.head{display:flex;justify-content:space-between;align-items:flex-start;padding:18px 18px 12px}.title{font-size:20px;font-weight:700}.sub,small{display:block;color:var(--secondary-text-color);font-size:12px;margin-top:3px}.total{text-align:right;font-size:21px;font-weight:700}.total small{font-weight:400}button{border:0;border-radius:10px;padding:9px 12px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:14px}.primary{background:var(--primary-color);color:var(--text-primary-color,#fff);font-weight:600}.items{padding:0 10px 12px}.item{display:grid;grid-template-columns:54px 1fr auto;gap:10px;align-items:center;padding:10px 8px;border-top:1px solid var(--divider-color)}.item img,.ph{width:50px;height:50px;object-fit:contain;border-radius:8px}.ph{display:grid;place-items:center;background:var(--secondary-background-color)}.info{min-width:0}.info b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.price{font-weight:650;margin-top:3px}.price s{font-weight:400;color:var(--secondary-text-color);font-size:12px}.bonus{display:inline-block;margin-top:4px;padding:2px 5px;border-radius:5px;background:#00a03c;color:white;font-size:10px;font-weight:800}.qty{display:flex;align-items:center;gap:5px}.qty button{width:34px;height:34px;padding:0;font-size:20px}.qty span{min-width:20px;text-align:center;font-weight:700}.qty .trash{margin-left:3px;color:var(--error-color);font-size:17px}.empty{padding:22px;text-align:center;color:var(--secondary-text-color)}.toast{position:fixed;z-index:10001;left:50%;bottom:26px;transform:translateX(-50%);background:#2e7d32;color:white;padding:10px 16px;border-radius:20px;box-shadow:0 4px 16px #0005}.toast.error{background:var(--error-color,#c62828)}.scanner{position:fixed;z-index:10000;inset:0;background:#000e;display:grid;place-items:center;padding:12px}.scanbox{width:min(1120px,100%);max-height:calc(100vh - 24px);background:var(--card-background-color);border-radius:16px;overflow:auto}.scanhead{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;font-size:18px}.scanhead button{font-size:24px}.scanbody{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(300px,.8fr);min-height:0}.scanCameraPane{min-width:0;border-right:1px solid var(--divider-color)}.videoWrap{position:relative;background:#000;aspect-ratio:4/3}.videoWrap video{width:100%;height:100%;object-fit:cover}.guide{position:absolute;left:8%;right:8%;top:35%;height:30%;border:3px solid #fff;border-radius:12px;box-shadow:0 0 0 9999px #0005}.guide:after{content:'';position:absolute;left:5%;right:5%;top:50%;height:2px;background:#f33}.scanbuttons{display:flex;gap:8px;justify-content:center;padding:12px}.scanbuttons button{min-width:130px}#scanstatus{text-align:center;padding:10px 12px 0;color:var(--secondary-text-color)}.scanResult{padding:18px;display:flex;flex-direction:column;justify-content:center}.scanPlaceholder{text-align:center;color:var(--secondary-text-color);padding:32px 10px}.scanPlaceholder span{display:block;font-size:38px;margin-bottom:8px}.scanPlaceholder b{display:block;color:var(--primary-text-color);margin-bottom:5px}.scanSuccess{font-weight:800;color:#00a03c;margin-bottom:12px}.scanProduct{display:grid;grid-template-columns:96px 1fr;gap:14px;align-items:center}.scanProduct img,.scanPh{width:92px;height:92px;object-fit:contain;border-radius:12px;background:var(--secondary-background-color)}.scanPh{display:grid;place-items:center;font-size:32px}.scanProductInfo b{display:block;font-size:18px;line-height:1.25}.scanPrice{font-size:25px;font-weight:800;margin-top:7px}.scanPrice s{font-size:13px;font-weight:400;color:var(--secondary-text-color)}.scanBonus{display:inline-block;margin-top:6px;padding:3px 7px;border-radius:6px;background:#00a03c;color:#fff;font-size:11px;font-weight:800}.scanQtyRow{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:20px;padding-top:15px;border-top:1px solid var(--divider-color)}.scanQty{display:flex;align-items:center;gap:8px}.scanQty button{width:44px;height:44px;padding:0;font-size:25px}.scanQty strong{min-width:34px;text-align:center;font-size:20px}.scanHint{margin-top:14px;line-height:1.35}.scanError{margin-bottom:10px;padding:8px 10px;border-radius:8px;background:var(--error-color,#c62828);color:#fff;font-size:12px}@media(max-width:800px){.scanbox{width:min(720px,100%)}.scanbody{grid-template-columns:1fr}.scanCameraPane{border-right:0;border-bottom:1px solid var(--divider-color)}.scanResult{min-height:210px}}@media(max-width:520px){.item{grid-template-columns:46px 1fr}.item img,.ph{width:42px;height:42px}.qty{grid-column:2;justify-content:flex-end}.head{padding:14px}.scanArea{padding-left:14px;padding-right:14px}}`;}
}
if(!customElements.get('ah-shopping-card'))customElements.define('ah-shopping-card',AhShoppingCard);
window.customCards=window.customCards||[];
if(!window.customCards.some(c=>c.type==='ah-shopping-card'))window.customCards.push({type:'ah-shopping-card',name:'Albert Heijn Shopping',description:'Beheer je AH-boodschappenlijst en scan EAN-barcodes.'});
