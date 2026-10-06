const EAN_L=["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const EAN_G=["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const EAN_R=EAN_L.map(p=>[...p].map(c=>c==="1"?"0":"1").join(""));
const EAN_PARITY=["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

function checksumOk(code){
  if(!/^\d+$/.test(code)||![8,12,13,14].includes(code.length))return false;
  const digits=[...code].map(Number),check=digits.pop(); let sum=0,weight=3;
  for(let i=digits.length-1;i>=0;i--){sum+=digits[i]*weight;weight=weight===3?1:3;}
  return (10-(sum%10))%10===check;
}
function eanHamming(a,b){let d=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])d++;return d;}
function eanMatchDigit(pattern,sets){let best=null;for(const [type,arr] of sets){for(let d=0;d<10;d++){const dist=eanHamming(pattern,arr[d]);if(best===null||dist<best.dist)best={digit:d,type,dist};}}return best&&best.dist<=1?best:null;}
function eanGuardOk(s,expected){return s.length===expected.length&&eanHamming(s,expected)<=1;}
function eanDecodeModules(modules){
  const value=modules.join("");
  if(value.length===95&&eanGuardOk(value.slice(0,3),"101")&&eanGuardOk(value.slice(45,50),"01010")&&eanGuardOk(value.slice(92),"101")){
    let left="",parity="",right="";
    for(let i=0;i<6;i++){const m=eanMatchDigit(value.slice(3+i*7,10+i*7),[["L",EAN_L],["G",EAN_G]]);if(!m)return null;left+=m.digit;parity+=m.type;}
    const first=EAN_PARITY.indexOf(parity);if(first<0)return null;
    for(let i=0;i<6;i++){const m=eanMatchDigit(value.slice(50+i*7,57+i*7),[["R",EAN_R]]);if(!m)return null;right+=m.digit;}
    const code=`${first}${left}${right}`;return checksumOk(code)?code:null;
  }
  if(value.length===67&&eanGuardOk(value.slice(0,3),"101")&&eanGuardOk(value.slice(31,36),"01010")&&eanGuardOk(value.slice(64),"101")){
    let code="";
    for(let i=0;i<4;i++){const m=eanMatchDigit(value.slice(3+i*7,10+i*7),[["L",EAN_L]]);if(!m)return null;code+=m.digit;}
    for(let i=0;i<4;i++){const m=eanMatchDigit(value.slice(36+i*7,43+i*7),[["R",EAN_R]]);if(!m)return null;code+=m.digit;}
    return checksumOk(code)?code:null;
  }
  return null;
}
function eanPercentiles(values){const sorted=[...values].sort((a,b)=>a-b);return [sorted[Math.floor(sorted.length*.1)],sorted[Math.floor(sorted.length*.9)]];}
function eanBinarize(values){const [lo,hi]=eanPercentiles(values);if(hi-lo<35)return null;const t=(lo+hi)/2;return values.map(v=>v<t?1:0);}
function eanRuns(bits){const out=[];let value=bits[0],start=0;for(let i=1;i<=bits.length;i++){if(i===bits.length||bits[i]!==value){out.push({value,start,len:i-start});if(i<bits.length){value=bits[i];start=i;}}}return out;}
function eanSample(bits,start,moduleWidth,count){const result=[];for(let i=0;i<count;i++){const a=Math.max(0,Math.floor(start+i*moduleWidth)),b=Math.min(bits.length,Math.ceil(start+(i+1)*moduleWidth));if(b<=a)return null;let ones=0;for(let x=a;x<b;x++)ones+=bits[x];result.push(ones/(b-a)>.5?"1":"0");}return result;}
function eanTryRuns(bits,count){const rs=eanRuns(bits);for(let i=0;i<rs.length-2;i++){if(rs[i].value!==1||rs[i+1].value!==0||rs[i+2].value!==1)continue;const lens=[rs[i].len,rs[i+1].len,rs[i+2].len],min=Math.min(...lens),max=Math.max(...lens);if(min<1||max/min>2)continue;const base=(lens[0]+lens[1]+lens[2])/3;for(const scale of [.90,.94,.97,1,1.03,1.06,1.10]){const w=base*scale;if(rs[i].start+w*count>bits.length)continue;const modules=eanSample(bits,rs[i].start,w,count);if(!modules)continue;const code=eanDecodeModules(modules);if(code)return code;}}return null;}
function eanDecodeRow(values){const bits=eanBinarize(values);if(!bits)return null;return eanTryRuns(bits,95)||eanTryRuns(bits,67)||eanTryRuns([...bits].reverse(),95)||eanTryRuns([...bits].reverse(),67);}
function decodeEANFromImageData(imageData){
  const {data,width,height}=imageData,rows=[.30,.38,.46,.50,.54,.62,.70].map(v=>Math.max(0,Math.min(height-1,Math.floor(height*v))));
  for(const y of rows){const values=[];for(let x=0;x<width;x++){const p=(y*width+x)*4;values.push(.299*data[p]+.587*data[p+1]+.114*data[p+2]);}const code=eanDecodeRow(values);if(code)return code;}
  return null;
}

class AhShoppingCard extends HTMLElement {
  constructor(){super(); this.attachShadow({mode:'open'}); this._config={}; this._hass=null; this._listScrollTop=0; this._scanner=null; this._scanLoop=null; this._facing='user'; this._message=''; this._lastEntitySig=null; this._barcodeDetector=null; this._zxingReader=null; this._decoderMode='local'; this._cameraInfo=''; this._scanCount=0; this._scanBusy=false; this._scanProcessing=false; this._scanQueue=[]; this._heldBarcode=''; this._heldBarcodeLastSeen=0; this._audioContext=null; this._scanProduct=null; this._scanPendingQty=new Map(); this._scanQtyWorkers=new Map(); this._pendingQty=new Map(); this._qtyWorkers=new Map(); this._stableItemOrder=new Map(); this._stableItemSeq=0; this._scanInlineActive=false; this._scanRecent=[]; this._intersecting=false; this._visibilityObserver=null; this._visibilitySetup=false; this._cameraStarting=false; this._digitalZoom=1; this._nativeZoom=1; this._decoderMisses=0; this._scannerRoute=''; this._scanTimer=null; this._scanTimerTick=null; this._scanDeadline=0; this._listScrollAnchor=null; this._scanBandCanvas=null; this._scanStatusTimer=null; this._isAndroid=/Android/i.test(navigator.userAgent||''); window.__ahShoppingScanOrder=window.__ahShoppingScanOrder||{seq:0,products:new Map()}; this._scanOrderState=window.__ahShoppingScanOrder; this._visibilityHandler=()=>this._syncScannerVisibility(); this._locationHandler=()=>requestAnimationFrame(()=>this._handleLocationChange());}
  static getStubConfig(){return {show_header:true,show_scan:true,show_products:true,product_source:'shopping_list',scanner_mode:'button',scan_camera:'front',scan_zoom:2};}
  static getConfigForm(){return {schema:[
    {name:'entity',selector:{entity:{domain:'sensor'}}},
    {name:'title',selector:{text:{}}},
    {name:'show_header',selector:{boolean:{}}},
    {name:'show_scan',selector:{boolean:{}}},
    {name:'show_products',selector:{boolean:{}}},
    {name:'scanner_mode',selector:{select:{options:[
      {value:'button',label:'Via scan button'},
      {value:'permanent',label:'Permanent camera feed'}
    ]}}},
    {name:'scan_camera',selector:{select:{options:[
      {value:'front',label:'Front camera'},
      {value:'rear',label:'Rear camera'}
    ]}}},
    {name:'scan_zoom',selector:{number:{min:1,max:4,step:0.25,mode:'slider'}}},
    {name:'product_source',selector:{select:{options:[
      {value:'shopping_list',label:'Winkelmandje'},
      {value:'next_order',label:'Volgende bestelling'},
      {value:'shopping_list_and_order',label:'Winkelmandje + volgende bestelling'}
    ]}}},
    {name:'scan_label',selector:{text:{}}}
  ]};}
  setConfig(config){
    const legacyScanOnly=config.mode==='scan_only';
    const legacySource=config.product_source==='cart'
      ? 'shopping_list'
      : config.product_source==='cart_and_order'
        ? 'shopping_list_and_order'
        : config.product_source;
    const previousCamera=this._config.scan_camera;
    const previousZoom=this._config.scan_zoom;
    const previousMode=this._config.scanner_mode;
    const {height:_legacyHeight,...cleanConfig}=config;
    this._config={
      show_header:legacyScanOnly?false:true,
      show_scan:true,
      show_products:legacyScanOnly?false:true,
      product_source:'shopping_list',
      scan_label:'Scan product',
      scanner_mode:'button',
      scan_camera:'front',
      scan_zoom:2,
      ...cleanConfig,
      ...(legacySource?{product_source:legacySource}:{})
    };
    this._config.scan_zoom=Math.min(4,Math.max(1,Number(this._config.scan_zoom||2)));
    this._facing=this._config.scan_camera==='rear'?'environment':'user';

    if(this._config.scanner_mode==='permanent'){
      this._clearScannerTimer();
      this._scanInlineActive=true;
    }else if(previousMode==='permanent'){
      this._scanInlineActive=false;
      this._scannerRoute='';
      this._clearScanSession();
    }

    if(this._stream&&(previousCamera!==this._config.scan_camera||Number(previousZoom)!==this._config.scan_zoom)){
      this._stopCamera();
    }
    this._render();
  }
  set hass(hass){
    this._hass=hass;
    const entities=[this._entity(),this._orderEntity()].filter(Boolean);
    const sig=entities.map(e=>`${e.entity_id}|${e.last_updated}`).join(';')||'none';
    if(sig!==this._lastEntitySig){this._lastEntitySig=sig;if(!this._scanner)this._render();}
  }
  getCardSize(){
    if(this._config.show_products===false&&this._config.show_header===false)return 1;
    return 7;
  }
  getGridOptions(){
    const permanent=this._config.scanner_mode==='permanent';
    const compact=this._config.show_products===false&&!permanent;
    return {
      columns:12,
      rows:compact?2:6,
      min_columns:6,
      min_rows:compact?1:2
    };
  }
  _entity(){if(!this._hass)return null;if(this._config.entity&&this._hass.states[this._config.entity])return this._hass.states[this._config.entity];return Object.values(this._hass.states).find(s=>s.attributes?.ah_shopping_list===true)||null;}
  _orderEntity(){if(!this._hass)return null;return Object.values(this._hass.states).find(s=>s.attributes?.ah_next_order===true)||null;}
  _stableItemKey(item,scope){
    const productId=Number(item?.product_id||0);
    const rawId=item?.list_item_id??item?.id??'';
    const fallback=String(item?.title||item?.description||'').trim().toLowerCase();
    const key=productId>0?`p:${productId}`:rawId?`i:${rawId}`:`t:${fallback}`;
    return `${scope}:${key}`;
  }
  _stableItems(items,scope){
    const rows=[...(items||[])];
    for(const item of rows){
      const key=this._stableItemKey(item,scope);
      if(!this._stableItemOrder.has(key)){
        this._stableItemOrder.set(key,this._stableItemSeq++);
      }
    }
    return rows.sort((a,b)=>
      this._stableItemOrder.get(this._stableItemKey(a,scope))-
      this._stableItemOrder.get(this._stableItemKey(b,scope))
    );
  }

  _promoteScannedProduct(productId){
    const pid=Number(productId||0);
    if(pid<=0)return;
    this._scanOrderState.products.set(pid,++this._scanOrderState.seq);
  }

  _chronologicalShoppingItems(items){
    return [...(items||[])].sort((a,b)=>{
      const aSeq=this._scanOrderState.products.get(Number(a?.product_id||a?.id||0))||0;
      const bSeq=this._scanOrderState.products.get(Number(b?.product_id||b?.id||0))||0;
      return bSeq-aSeq;
    });
  }

  _combinedItems(listItems,orderItems){
    const map=new Map();

    const add=(raw,source)=>{
      const key=raw.product_id>0?`p:${raw.product_id}`:`t:${String(raw.title||'').toLowerCase()}`;
      let item=map.get(key);
      if(!item){
        item={
          ...raw,
          quantity:0,
          shopping_quantity:0,
          order_quantity:0,
          combined:true
        };
        map.set(key,item);
      }else{
        if(!item.image_url&&raw.image_url)item.image_url=raw.image_url;
        if(!item.price_now&&raw.price_now)item.price_now=raw.price_now;
        if(!item.unit_size&&raw.unit_size)item.unit_size=raw.unit_size;
        if(!item.is_bonus&&raw.is_bonus){
          item.is_bonus=raw.is_bonus;
          item.bonus_mechanism=raw.bonus_mechanism||'';
        }
      }

      const qty=Number(raw.quantity||0);
      if(source==='shopping')item.shopping_quantity+=qty;
      else item.order_quantity+=qty;
      item.quantity=item.shopping_quantity+item.order_quantity;
    };

    for(const raw of listItems||[])add(raw,'shopping');
    for(const raw of orderItems||[])add(raw,'order');
    return [...map.values()];
  }
  _viewData(){
    const source=this._config.product_source||'shopping_list';
    const list=this._entity()?.attributes||{};
    const order=this._orderEntity()?.attributes||{};

    if(source==='next_order'){
      return {
        items:this._stableItems(order.items||[],'next_order'),
        total_quantity:order.total_quantity||0,
        total_price:order.total_price||0,
        unique_items:order.unique_items||0,
        label:'Volgende bestelling',
        edit_source:null,
        entity:this._orderEntity(),
        delivery:order.delivery_date_display||order.delivery_date||'',
        time:order.delivery_time_display||''
      };
    }

    if(source==='shopping_list_and_order'){
      const items=this._combinedItems(this._chronologicalShoppingItems(list.items||[]),order.items||[]);
      return {
        items,
        total_quantity:items.reduce((sum,i)=>sum+Number(i.quantity||0),0),
        total_price:Number(list.estimated_total||0)+Number(order.total_price||0),
        unique_items:items.length,
        label:'Winkelmandje + bestelling',
        edit_source:'shopping_list',
        combined:true,
        entity:this._entity()||this._orderEntity(),
        delivery:order.delivery_date_display||order.delivery_date||'',
        time:order.delivery_time_display||'',
        bonus_savings:list.bonus_savings||0
      };
    }

    return {
      items:this._chronologicalShoppingItems(list.items||[]),
      total_quantity:list.total_quantity||0,
      total_price:list.estimated_total||0,
      unique_items:list.unique_items||0,
      label:'Winkelmandje',
      edit_source:'shopping_list',
      entity:this._entity(),
      bonus_savings:list.bonus_savings||0,
      pending_changes:list.pending_changes||0
    };
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
        try{
          await this._service('set_quantity',{product_id:pid,quantity:target});
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

  _rowDomKey(item){
    const productId=Number(item?.product_id||item?.id||0);
    if(productId>0)return `p:${productId}`;
    const rawId=item?.item_id??item?.list_item_id??'';
    if(rawId)return `i:${rawId}`;
    return `t:${String(item?.title||item?.description||'').trim().toLowerCase()}`;
  }

  _captureListScroll(){
    const list=this.shadowRoot?.querySelector('.items');
    if(!list)return;
    this._listScrollTop=list.scrollTop;
    const listRect=list.getBoundingClientRect();
    const rows=[...list.querySelectorAll('[data-row-key]')];
    const anchor=rows.find(row=>row.getBoundingClientRect().bottom>listRect.top+1);
    this._listScrollAnchor=anchor
      ? {key:anchor.dataset.rowKey,offset:anchor.getBoundingClientRect().top-listRect.top}
      : null;
  }

  _restoreListScroll(){
    const list=this.shadowRoot?.querySelector('.items');
    if(!list)return;
    const anchorState=this._listScrollAnchor;
    const restore=()=>{
      if(!list.isConnected)return;
      list.scrollTop=this._listScrollTop;
      if(anchorState){
        const row=[...list.querySelectorAll('[data-row-key]')].find(el=>el.dataset.rowKey===anchorState.key);
        if(row){
          const delta=(row.getBoundingClientRect().top-list.getBoundingClientRect().top)-anchorState.offset;
          if(Math.abs(delta)>.5)list.scrollTop+=delta;
        }
      }
      this._listScrollTop=list.scrollTop;
    };
    restore();
    requestAnimationFrame(()=>{restore();requestAnimationFrame(restore);});
    list.addEventListener('scroll',()=>{this._listScrollTop=list.scrollTop;},{passive:true});
  }

  _render(){
    if(!this.shadowRoot)return;

    if(this._stream)this._stopCamera();

    this._captureListScroll();

    const view=this._viewData();
    const entity=view.entity;
    const items=view.items||[];
    const title=this._config.title||view.label;
    const showHeader=this._config.show_header!==false;
    const showScan=this._config.show_scan!==false;
    const showProducts=this._config.show_products!==false;
    const permanent=this._config.scanner_mode==='permanent';
    const scannerActive=permanent||this._scanInlineActive;
    const scanLabel=this._config.scan_label||'Scan product';
    const cardClass='fullCard';
    const syncText=view.pending_changes? ` · ${view.pending_changes} wijziging${view.pending_changes===1?'':'en'} bezig` : '';
    const articleCount=Number(view.unique_items??items.length);
    const articleText=`${articleCount} ${articleCount===1?'artikel':'artikelen'}`;
    const leftNote=view.delivery
      ? `${view.delivery}${view.time?` · ${view.time}`:''}${syncText}`
      : `${view.total_quantity??0} stuks${syncText}`;
    const totalMeta=[view.bonus_savings? `Bonus −${this._money(view.bonus_savings)}`:'',articleText].filter(Boolean).join(' · ');

    const header=showHeader
      ? `<div class="head"><div class="title">${this._esc(title)}</div><div class="total">${this._money(view.total_price||0)}</div><div class="sub headerSub">${this._esc(leftNote)}</div><div class="headerMeta">${this._esc(totalMeta)}</div></div>`
      : '';
    const scan=showScan&&!scannerActive
      ? `<div class="scanArea"><ha-button id="scan" class="scanWide" appearance="filled"><ha-icon icon="mdi:barcode-scan" slot="start"></ha-icon>${this._esc(scanLabel)}</ha-button></div>`
      : '';
    const products=showProducts
      ? `<div class="items">${items.length?items.map(i=>this._item(i,view.edit_source||null,view.combined===true)).join(''):`<div class="empty">Geen producten in ${this._esc(view.label.toLowerCase())}.</div>`}</div>`
      : '';
    const body=scannerActive?this._scannerView(permanent):products;

    this.shadowRoot.innerHTML=`<style>${this._css()}</style><ha-card class="${cardClass}">${header}${!entity&&showProducts&&!scannerActive?'<div class="empty">Deze gegevensbron is nog niet beschikbaar.</div>':''}${scan}${body}${this._message?`<div class="toast ${this._messageError?'error':''}">${this._esc(this._message)}</div>`:''}</ha-card>`;

    this.shadowRoot.querySelector('#scan')?.addEventListener('click',()=>this._openScanner());
    this.shadowRoot.querySelectorAll('[data-minus]').forEach(el=>el.addEventListener('click',()=>this._adjustQuantity(el.dataset.source,Number(el.dataset.pid),Number(el.dataset.qty),-1)));
    this.shadowRoot.querySelectorAll('[data-plus]').forEach(el=>el.addEventListener('click',()=>this._adjustQuantity(el.dataset.source,Number(el.dataset.pid),Number(el.dataset.qty),1)));
    this.shadowRoot.querySelectorAll('[data-remove]').forEach(el=>el.addEventListener('click',()=>this._remove(el.dataset.source,Number(el.dataset.pid))));

    this._restoreListScroll();

    if(scannerActive){
      this._scanner=this.shadowRoot.querySelector('#inlineScanner');
      this.shadowRoot.querySelector('#scanClose')?.addEventListener('click',()=>this._closeScanner());
      this._renderScanResult();
      requestAnimationFrame(()=>this._syncScannerVisibility());
    }else{
      this._scanner=null;
    }
  }

  _scannerView(permanent){
    return `<div id="inlineScanner" class="inlineScanner">
      <video playsinline muted autoplay></video>
      <div class="scanGuide"></div>
      <div id="scanRecent" class="scanRecent ${permanent?'':'withClose'}"></div>
      ${permanent?'':`<button id="scanClose" class="scanClose" aria-label="Sluit scanner">×</button>`}
      <div class="scanHud">
        <span id="scanstatus" class="scanPill scanStatus" hidden></span>
        ${permanent?'':`<span id="scanTimer" class="scanPill scanTimer">Auto sluiten · 1:00</span>`}
      </div>
    </div>`;
  }

  _productRow(i,{controls='',compact=false,rowClass='',style='',metaHtml=null,rowKey=''}={}){
    const image=i.image_url
      ? `<img src="${this._esc(i.image_url)}" alt="">`
      : '<div class="ph">🛒</div>';
    const old=i.is_bonus&&i.price_was>i.price_now?`<s>${this._money(i.price_was)}</s> `:'';
    const price=i.price_now?`<span class="price">${old}${this._money(i.price_now)}</span>`:'';
    const bonus=i.is_bonus?`<span class="bonus">BONUS · ${this._esc(i.bonus_mechanism||'Aanbieding')}</span>`:'';
    const details=metaHtml!==null
      ? `<div class="compactMeta">${metaHtml}</div>`
      : `<small>${this._esc(i.unit_size||'')}</small>${price}${bonus}`;
    const classes=['item',compact?'compactItem':'',rowClass].filter(Boolean).join(' ');
    const styleAttr=style?` style="${style}"`:'';
    const keyAttr=rowKey?` data-row-key="${this._esc(rowKey)}"`:'';
    return `<div class="${classes}"${styleAttr}${keyAttr}>${image}<div class="info"><b>${this._esc(i.title||i.description||'Product')}</b>${details}</div>${controls}</div>`;
  }

  _item(i,editSource=null,combined=false){
    const editableQty=combined?Number(i.shopping_quantity||0):Number(i.quantity||0);
    const key=editSource&&i.product_id>0?this._quantityKey(editSource,i.product_id):'';
    const pendingQty=key&&this._pendingQty.has(key)?this._pendingQty.get(key):editableQty;
    const displayQty=combined?pendingQty+Number(i.order_quantity||0):(key&&this._pendingQty.has(key)?pendingQty:Number(i.quantity||0));

    if(combined){
      const orderQty=Number(i.order_quantity||0);
      const shoppingQty=pendingQty;
      const totalQty=orderQty+shoppingQty;
      const old=i.is_bonus&&i.price_was>i.price_now?`<s>${this._money(i.price_was)}</s> `:'';
      const price=i.price_now?`<span class="price">${old}${this._money(i.price_now)}</span>`:'';
      const bonus=i.is_bonus?`<span class="bonus">BONUS · ${this._esc(i.bonus_mechanism||'Aanbieding')}</span>`:'';
      const breakdown=orderQty>0
        ? `${orderQty} besteld${shoppingQty>0?` · ${shoppingQty} extra`:''}`
        : `${shoppingQty} in winkelmandje`;
      const unit=i.unit_size?`<span class="unitSize">${this._esc(i.unit_size)}</span>`:'';
      const meta=[unit,price,`<span class="combinedBreakdown">${this._esc(breakdown)}</span>`,bonus].filter(Boolean).join('');
      const controls=i.product_id>0
        ? `<div class="qty compactQty combinedQty">${shoppingQty>0?`<button data-minus data-source="${editSource}" data-pid="${i.product_id}" data-qty="${shoppingQty}" aria-label="Verlaag totaal">−</button>`:''}<span title="${orderQty} besteld + ${shoppingQty} winkelmandje">${totalQty}</span><button data-plus data-source="${editSource}" data-pid="${i.product_id}" data-qty="${shoppingQty}" aria-label="Voeg toe aan winkelmandje">+</button></div>`
        : `<div class="qty readonlyQty"><span>${totalQty}×</span></div>`;
      return this._productRow(i,{controls,compact:true,metaHtml:meta,rowKey:this._rowDomKey(i)});
    }

    const old=i.is_bonus&&i.price_was>i.price_now?`<s>${this._money(i.price_was)}</s> `:'';
    const price=i.price_now?`<span class="price">${old}${this._money(i.price_now)}</span>`:'';
    const unit=i.unit_size?`<span class="unitSize">${this._esc(i.unit_size)}</span>`:'';
    const bonus=i.is_bonus?`<span class="bonus">BONUS · ${this._esc(i.bonus_mechanism||'Aanbieding')}</span>`:'';
    const meta=[unit,price,bonus].filter(Boolean).join('');
    const controls=editSource&&i.product_id>0
      ? `<div class="qty compactQty"><button data-minus data-source="${editSource}" data-pid="${i.product_id}" data-qty="${displayQty}">−</button><span>${displayQty}</span><button data-plus data-source="${editSource}" data-pid="${i.product_id}" data-qty="${displayQty}">+</button><button class="trash" data-remove data-source="${editSource}" data-pid="${i.product_id}">×</button></div>`
      : `<div class="qty compactQty readonlyQty"><span>${displayQty}×</span></div>`;
    return this._productRow(i,{controls,compact:true,metaHtml:meta,rowKey:this._rowDomKey(i)});
  }

  _openScanner(){
    if(!navigator.mediaDevices?.getUserMedia){
      this._toast('Camera is niet beschikbaar. Gebruik HTTPS en geef cameratoegang.',true);
      return;
    }
    this._armScanAudio();
    this._scanQueue=[];
    this._scanProcessing=false;
    this._heldBarcode='';
    this._heldBarcodeLastSeen=0;
    this._scanProduct=null;
    this._scanRecent=[];
    this._scannerRoute=this._routeKey();
    this._scanInlineActive=true;
    this._render();
    this._armScannerTimer(60000);
  }

  _armScannerTimer(ms){
    if(this._config.scanner_mode==='permanent')return;
    this._clearScannerTimer();
    this._scanDeadline=Date.now()+ms;
    this._updateScannerTimer();
    this._scanTimerTick=setInterval(()=>this._updateScannerTimer(),250);
    this._scanTimer=setTimeout(()=>{
      if(this._scanProcessing||this._scanQueue.length){
        this._armScannerTimer(1000);
        return;
      }
      this._closeScanner();
    },ms);
  }

  _updateScannerTimer(){
    const el=this._scanner?.querySelector('#scanTimer');
    if(!el||!this._scanDeadline)return;
    const seconds=Math.max(0,Math.ceil((this._scanDeadline-Date.now())/1000));
    const minutes=Math.floor(seconds/60);
    el.textContent=`Auto sluiten · ${minutes}:${String(seconds%60).padStart(2,'0')}`;
  }

  _clearScannerTimer(){
    clearTimeout(this._scanTimer);
    clearInterval(this._scanTimerTick);
    this._scanTimer=null;
    this._scanTimerTick=null;
    this._scanDeadline=0;
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
    if(!this._scanner||!this._shouldScannerRun())return;
    this._stopCamera();
    this._scanCount=0;
    this._scanBusy=false;
    const video=this._scanner.querySelector('video');
    try{
      const stream=await navigator.mediaDevices.getUserMedia({
        video:{
          facingMode:{ideal:this._facing},
          width:{ideal:this._isAndroid?1280:1920},
          height:{ideal:this._isAndroid?720:1080},
          frameRate:{ideal:30,max:30}
        },
        audio:false
      });

      if(!this._shouldScannerRun()){
        stream.getTracks().forEach(track=>track.stop());
        return;
      }

      this._stream=stream;
      const track=stream.getVideoTracks()[0];
      await this._tuneCameraTrack(track);

      video.srcObject=stream;
      video.style.transform=`scale(${this._digitalZoom})`;
      await video.play();

      this._scanCanvas=document.createElement('canvas');
      this._scanBandCanvas=document.createElement('canvas');
      await this._initScannerEngine();
      this._setScanStatus('');
      this._scheduleScan();
    }catch(e){
      this._setScanStatus(`Camera: ${e.message||e}`,true);
    }
  }

  async _tuneCameraTrack(track){
    const desired=Math.min(4,Math.max(1,Number(this._config.scan_zoom||2)));
    this._nativeZoom=1;
    this._digitalZoom=desired;
    if(!track?.getCapabilities||!track?.applyConstraints)return;

    try{
      const caps=track.getCapabilities()||{};
      const advanced={};

      if(Array.isArray(caps.focusMode)&&caps.focusMode.includes('continuous')){
        advanced.focusMode='continuous';
      }
      if(Array.isArray(caps.exposureMode)&&caps.exposureMode.includes('continuous')){
        advanced.exposureMode='continuous';
      }
      if(Array.isArray(caps.whiteBalanceMode)&&caps.whiteBalanceMode.includes('continuous')){
        advanced.whiteBalanceMode='continuous';
      }
      if(caps.zoom&&Number.isFinite(Number(caps.zoom.min))&&Number.isFinite(Number(caps.zoom.max))){
        advanced.zoom=Math.min(Number(caps.zoom.max),Math.max(Number(caps.zoom.min),desired));
      }

      if(Object.keys(advanced).length){
        await track.applyConstraints({advanced:[advanced]});
      }

      const settings=track.getSettings?.()||{};
      const appliedZoom=Number(settings.zoom||1);
      this._nativeZoom=Number.isFinite(appliedZoom)&&appliedZoom>0?appliedZoom:1;
      this._digitalZoom=Math.max(1,desired/this._nativeZoom);
    }catch(e){
      this._nativeZoom=1;
      this._digitalZoom=desired;
      console.debug('AH Shopping: camera tuning not supported',e);
    }
  }

  _setScanStatus(text,error=false,timeout=0){
    clearTimeout(this._scanStatusTimer);
    this._scanStatusTimer=null;
    const status=this._scanner?.querySelector('#scanstatus');
    if(!status)return;
    status.textContent=error?text:'';
    status.hidden=!error;
    status.classList.toggle('error',Boolean(error));
    if(error&&timeout>0){
      this._scanStatusTimer=setTimeout(()=>{
        if(status.isConnected){
          status.textContent='';
          status.hidden=true;
          status.classList.remove('error');
        }
      },timeout);
    }
  }

  async _initScannerEngine(){
    this._barcodeDetector=null;
    this._zxingReader=null;
    this._decoderMode='local';

    const tryZXing=async()=>{
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
          this._zxingReader=new window.ZXing.BrowserMultiFormatReader(hints,80);
          this._decoderMode='zxing';
          return true;
        }
      }catch(e){
        console.warn('AH Shopping: ZXing could not be loaded',e);
      }
      return false;
    };

    const tryNative=async()=>{
      if(!('BarcodeDetector' in window))return false;
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
          return true;
        }
      }catch(e){}
      return false;
    };

    if(await tryZXing()){
      const primary=this._decoderMode;
      await tryNative();
      this._decoderMode=primary;
      return;
    }
    if(await tryNative())return;

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

  _scheduleScan(){clearTimeout(this._scanLoop);this._scanLoop=setTimeout(()=>this._scanFrame(),90);}

  _scanSourceRect(video){
    const vw=video.videoWidth,vh=video.videoHeight;
    const stage=this._scanner;
    const guide=stage?.querySelector('.scanGuide');
    if(!stage||!guide||!vw||!vh){
      const sw=Math.floor(vw*.62/Math.max(1,Number(this._digitalZoom||1)));
      const sh=Math.floor(vh*.24/Math.max(1,Number(this._digitalZoom||1)));
      return {sx:Math.max(0,Math.floor((vw-sw)/2)),sy:Math.max(0,Math.floor((vh-sh)/2)),sw,sh};
    }

    const stageRect=stage.getBoundingClientRect();
    const guideRect=guide.getBoundingClientRect();
    const cw=stageRect.width,ch=stageRect.height;
    if(cw<=0||ch<=0)return {sx:0,sy:0,sw:vw,sh:vh};

    const zoom=Math.max(1,Number(this._digitalZoom||1));
    const inverseZoom=(value,center)=>(value-center)/zoom+center;

    const gx1=guideRect.left-stageRect.left;
    const gy1=guideRect.top-stageRect.top;
    const gx2=guideRect.right-stageRect.left;
    const gy2=guideRect.bottom-stageRect.top;

    const ux1=inverseZoom(gx1,cw/2);
    const uy1=inverseZoom(gy1,ch/2);
    const ux2=inverseZoom(gx2,cw/2);
    const uy2=inverseZoom(gy2,ch/2);

    const coverScale=Math.max(cw/vw,ch/vh);
    const displayedW=vw*coverScale;
    const displayedH=vh*coverScale;
    const offsetX=(cw-displayedW)/2;
    const offsetY=(ch-displayedH)/2;

    let sx=(ux1-offsetX)/coverScale;
    let sy=(uy1-offsetY)/coverScale;
    let ex=(ux2-offsetX)/coverScale;
    let ey=(uy2-offsetY)/coverScale;

    sx=Math.max(0,Math.min(vw-1,sx));
    sy=Math.max(0,Math.min(vh-1,sy));
    ex=Math.max(sx+1,Math.min(vw,ex));
    ey=Math.max(sy+1,Math.min(vh,ey));

    return {
      sx:Math.floor(sx),
      sy:Math.floor(sy),
      sw:Math.max(1,Math.floor(ex-sx)),
      sh:Math.max(1,Math.floor(ey-sy))
    };
  }

  async _scanFrame(){
    if(!this._scanner||!this._stream||this._scanBusy)return;
    if(!this._shouldScannerRun()){
      if(this._scannerRoute&&this._routeKey()!==this._scannerRoute)this._clearScanSession();
      this._stopCamera();
      return;
    }
    const video=this._scanner.querySelector('video');
    if(video.readyState<2||!video.videoWidth){this._scheduleScan();return;}

    this._scanBusy=true;
    this._scanCount++;
    let code=null;

    try{
      const c=this._scanCanvas,ctx=c.getContext('2d',{willReadFrequently:true});
      const {sx,sy,sw,sh}=this._scanSourceRect(video);
      const targetWidth=Math.min(800,sw);
      c.width=Math.max(320,targetWidth);
      c.height=Math.max(120,Math.floor(sh*c.width/sw));
      ctx.drawImage(video,sx,sy,sw,sh,0,0,c.width,c.height);

      if(this._decoderMode==='zxing'&&this._zxingReader?.decodeFromCanvas){
        try{
          const result=this._zxingReader.decodeFromCanvas(c);
          const raw=typeof result?.getText==='function'?result.getText():result?.text;
          if(raw)code=String(raw).replace(/\D/g,'');
        }catch(e){
          const expected=
            (window.ZXing?.NotFoundException&&e instanceof window.ZXing.NotFoundException)||
            (window.ZXing?.ChecksumException&&e instanceof window.ZXing.ChecksumException)||
            (window.ZXing?.FormatException&&e instanceof window.ZXing.FormatException);
          if(!expected)console.debug('AH Shopping ZXing crop error',e);
        }
      }else if(this._decoderMode==='native'&&this._barcodeDetector){
        try{
          const found=await this._barcodeDetector.detect(c);
          const hit=(found||[]).find(x=>x?.rawValue);
          if(hit)code=String(hit.rawValue).replace(/\D/g,'');
        }catch(e){}
      }else if(this._decoderMode==='local'){
        try{code=decodeEANFromImageData(ctx.getImageData(0,0,c.width,c.height));}catch(e){}
      }

      if(code){
        this._decoderMisses=0;
      }else{
        this._decoderMisses++;

        // A narrow central band is especially effective for barcodes shown on
        // glossy phone screens and slightly skewed desktop webcam images.
        if(this._decoderMode==='zxing'&&this._zxingReader?.decodeFromCanvas&&this._scanBandCanvas){
          try{
            const band=this._scanBandCanvas;
            const bandCtx=band.getContext('2d',{willReadFrequently:true});
            const bandHeight=Math.max(80,Math.floor(c.height*.55));
            const bandY=Math.max(0,Math.floor((c.height-bandHeight)/2));
            band.width=c.width;
            band.height=bandHeight;
            bandCtx.drawImage(c,0,bandY,c.width,bandHeight,0,0,band.width,band.height);
            const bandResult=this._zxingReader.decodeFromCanvas(band);
            const raw=typeof bandResult?.getText==='function'?bandResult.getText():bandResult?.text;
            if(raw)code=String(raw).replace(/\D/g,'');
          }catch(e){}
        }

        // ZXing remains the primary path. Expensive fallbacks are sampled,
        // not run for every camera frame.
        if(this._decoderMode==='zxing'&&this._decoderMisses%4===0){
          try{code=decodeEANFromImageData(ctx.getImageData(0,0,c.width,c.height));}catch(e){}
        }
        const nativeEvery=this._isAndroid?12:4;
        if(!code&&this._decoderMode==='zxing'&&this._barcodeDetector&&this._decoderMisses>=4&&this._decoderMisses%nativeEvery===0){
          try{
            const found=await this._barcodeDetector.detect(c);
            const hit=(found||[]).find(x=>x?.rawValue);
            if(hit)code=String(hit.rawValue).replace(/\D/g,'');
          }catch(e){}
        }
        if(!code&&this._decoderMode==='native'&&this._decoderMisses%4===0){
          try{code=decodeEANFromImageData(ctx.getImageData(0,0,c.width,c.height));}catch(e){}
        }
        if(code)this._decoderMisses=0;
      }
    }catch(e){
      console.debug('AH Shopping scan frame error',e);
    }

    if(code&&(/^\d{8}$/.test(code)||/^\d{12,14}$/.test(code))&&
      (code.length===12||code.length===14||checksumOk(code))){
      this._barcodeDetected(code);
    }else{
      this._noteBarcodeAbsent();
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
        this._promoteScannedProduct(p.id);
        this._scanProduct=p;
        this._pushRecentProduct(p);
        this._playScanBeep();
        if(navigator.vibrate)navigator.vibrate(70);
        this._pulseScanner();
        this._renderScanResult();
        this._setScanStatus('');
        if(this._config.scanner_mode!=='permanent')this._armScannerTimer(5000);
      }catch(e){
        const message=String(e?.message||e||'');
        const notFound=/not found|niet gevonden|geen product|resource not found|404/i.test(message);
        this._setScanStatus(
          notFound
            ? `Barcode ${code} gelezen, maar product niet gevonden bij AH`
            : `AH-fout bij barcode ${code}: ${message||'onbekende fout'}`,
          true,
          notFound?5000:7000
        );
      }
    }
    this._scanProcessing=false;
  }

  _pushRecentProduct(product){
    const pid=Number(product?.id||0);
    const barcode=String(product?.barcode||'');
    this._scanRecent=[
      {...product},
      ...this._scanRecent.filter(item=>{
        const sameId=pid>0&&Number(item?.id||0)===pid;
        const sameBarcode=barcode&&String(item?.barcode||'')===barcode;
        return !sameId&&!sameBarcode;
      })
    ].slice(0,5);
  }

  _pulseScanner(){
    const stage=this._scanner;
    if(!stage)return;
    stage.classList.remove('scanHit');
    void stage.offsetWidth;
    stage.classList.add('scanHit');
    setTimeout(()=>stage?.classList.remove('scanHit'),220);
  }

  _renderScanResult(){
    const result=this._scanner?.querySelector('#scanRecent');
    if(!result)return;
    result.innerHTML=this._scanRecent.map((p,index)=>this._scanOverlayRow(p,index)).join('');
    result.querySelectorAll('[data-scan-minus]').forEach(el=>
      el.addEventListener('click',()=>this._adjustScanQuantity(Number(el.dataset.pid),-1))
    );
    result.querySelectorAll('[data-scan-plus]').forEach(el=>
      el.addEventListener('click',()=>this._adjustScanQuantity(Number(el.dataset.pid),1))
    );
  }

  _scanOverlayRow(p,index){
    const qty=Math.max(0,Number(p.quantity_on_list??0));
    const opacity=Math.max(.2,1-index*.2);
    const old=p.is_bonus&&p.price_was>p.price_now?`<s>${this._money(p.price_was)}</s> `:'';
    const price=p.price_now?`<span class="price">${old}${this._money(p.price_now)}</span>`:'';
    const bonus=p.is_bonus?`<span class="bonus">BONUS · ${this._esc(p.bonus_mechanism||'Aanbieding')}</span>`:'';
    const unit=p.unit_size?`<span class="unitSize">${this._esc(p.unit_size)}</span>`:'';
    const meta=[unit,price,bonus].filter(Boolean).join('');
    const controls=Number(p.id||0)>0
      ? `<div class="qty compactQty">${qty>0?`<button data-scan-minus data-pid="${p.id}" aria-label="Verlaag aantal">−</button>`:''}<span>${qty}</span><button data-scan-plus data-pid="${p.id}" aria-label="Voeg toe">+</button></div>`
      : `<div class="qty readonlyQty"><span>${qty}×</span></div>`;
    return this._productRow(p,{controls,compact:true,rowClass:'scanOverlayItem',style:`opacity:${opacity}`,metaHtml:meta});
  }

  _adjustScanQuantity(pid,delta){
    const p=this._scanRecent.find(item=>Number(item?.id||0)===Number(pid));
    if(!p)return;
    const pending=this._scanPendingQty.has(pid)?this._scanPendingQty.get(pid):Number(p.quantity_on_list??0);
    const next=Math.max(0,pending+delta);
    p.quantity_on_list=next;
    if(Number(this._scanProduct?.id||0)===Number(pid))this._scanProduct.quantity_on_list=next;
    this._scanPendingQty.set(Number(pid),next);
    this._renderScanResult();
    this._queueScanQuantity(Number(pid));
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
          this._setScanStatus(e.message||String(e),true);
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
    this._decoderMisses=0;
    try{this._zxingReader?.reset?.();}catch(e){}
    this._zxingReader=null;
    if(this._stream){
      this._stream.getTracks().forEach(t=>t.stop());
      this._stream=null;
    }
    if(clear){
      this._scanCanvas=null;
      this._scanBandCanvas=null;
      this._barcodeDetector=null;
    }
  }

  _closeScanner(){
    if(this._config.scanner_mode==='permanent')return;
    this._clearScannerTimer();
    this._scanQueue=[];
    this._stopCamera();
    this._scanner=null;
    this._scanProduct=null;
    this._scanRecent=[];
    this._scanProcessing=false;
    this._heldBarcode='';
    this._scanInlineActive=false;
    this._scannerRoute='';
    this._render();
  }

  _routeKey(){
    return `${window.location.pathname}${window.location.search}`;
  }

  _clearScanSession(){
    this._scanRecent=[];
    this._scanProduct=null;
    this._scanQueue=[];
    this._scanProcessing=false;
    this._heldBarcode='';
    this._heldBarcodeLastSeen=0;
    this._decoderMisses=0;
    this._renderScanResult();
  }

  _handleLocationChange(){
    const current=this._routeKey();
    if(this._scannerRoute&&current!==this._scannerRoute){
      if(this._stream)this._stopCamera();
      this._clearScanSession();
      this._setScanStatus('');
    }
    this._syncScannerVisibility();
  }

  _shouldScannerRun(){
    if(!this._scanner||!this.isConnected)return false;
    if(!(this._config.scanner_mode==='permanent'||this._scanInlineActive))return false;
    if(document.visibilityState!=='visible')return false;
    if(this._visibilityObserver&&!this._intersecting)return false;
    if(this._scannerRoute&&this._routeKey()!==this._scannerRoute)return false;
    const rect=this.getBoundingClientRect();
    if(rect.width<2||rect.height<2)return false;
    const style=getComputedStyle(this);
    return style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0';
  }

  async _syncScannerVisibility(){
    if(!this._scanner){
      this._scanner=this.shadowRoot?.querySelector('#inlineScanner')||null;
    }

    // Permanent cards bind to the dashboard route only when they are genuinely visible.
    if(!this._scannerRoute&&this._scanner&&document.visibilityState==='visible'&&
      (!this._visibilityObserver||this._intersecting)){
      const rect=this.getBoundingClientRect();
      if(rect.width>=2&&rect.height>=2)this._scannerRoute=this._routeKey();
    }

    const shouldRun=this._shouldScannerRun();
    if(!shouldRun){
      if(this._stream)this._stopCamera();
      if(this._scanner)this._setScanStatus('');
      return;
    }
    if(this._stream||this._cameraStarting)return;
    this._cameraStarting=true;
    try{
      await this._startCamera();
    }finally{
      this._cameraStarting=false;
    }
  }

  connectedCallback(){
    if(!this._visibilitySetup){
      this._visibilitySetup=true;
      document.addEventListener('visibilitychange',this._visibilityHandler);
      window.addEventListener('location-changed',this._locationHandler);
      if('IntersectionObserver' in window){
        this._visibilityObserver=new IntersectionObserver(entries=>{
          const entry=entries[entries.length-1];
          this._intersecting=Boolean(entry?.isIntersecting&&entry.intersectionRatio>0);
          this._syncScannerVisibility();
        },{threshold:[0,.01,.1]});
        this._visibilityObserver.observe(this);
      }else{
        this._intersecting=true;
      }
    }
    if(this._config.scanner_mode==='permanent'&&!this._scanInlineActive){
      this._scanInlineActive=true;
      this._render();
    }
    this._scanner=this.shadowRoot?.querySelector('#inlineScanner')||null;
    requestAnimationFrame(()=>this._syncScannerVisibility());
  }

  disconnectedCallback(){
    this._clearScannerTimer();
    document.removeEventListener('visibilitychange',this._visibilityHandler);
    window.removeEventListener('location-changed',this._locationHandler);
    this._visibilityObserver?.disconnect();
    this._visibilityObserver=null;
    this._visibilitySetup=false;
    this._intersecting=false;
    this._stopCamera();
    this._scanner=null;
    this._scannerRoute='';
    this._clearScanSession();
  }

  _css(){return `:host{display:block;height:100%;min-height:0;overflow:hidden}ha-card{height:100%;min-height:0;overflow:hidden;box-sizing:border-box}.fullCard{height:100%;min-height:0;display:flex;flex-direction:column}.fullCard .head,.fullCard .scanArea{flex:0 0 auto}.fullCard .items{flex:1 1 0;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch}.scanArea{padding:12px 14px}.head+.scanArea{padding-top:0}.scanWide{display:block;width:100%;margin:0;--ha-button-height:48px;font-size:16px}.scanWide::part(base){width:100%;justify-content:center}.head{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:24px 18px;column-gap:16px;row-gap:5px;align-items:center;padding:18px 18px 12px}.title{grid-column:1;grid-row:1;align-self:center;min-width:0;font-size:20px;font-weight:700;line-height:24px;margin:0}.total{grid-column:2;grid-row:1;align-self:center;text-align:right;font-size:21px;font-weight:700;line-height:24px;margin:0}.sub,small{display:block;color:var(--secondary-text-color);font-size:12px}.headerSub{grid-column:1;grid-row:2;align-self:center;margin:0;font-size:12px;line-height:18px}.headerMeta{grid-column:2;grid-row:2;align-self:center;margin:0;text-align:right;color:var(--secondary-text-color);font-size:12px;line-height:18px;white-space:nowrap}button{border:0;border-radius:10px;padding:9px 12px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:14px}.primary{background:var(--primary-color);color:var(--text-primary-color,#fff);font-weight:600}.items{padding:0 10px 12px}.item{display:grid;grid-template-columns:54px 1fr auto;gap:10px;align-items:center;padding:10px 8px;border-top:1px solid var(--divider-color)}.item img,.ph{width:50px;height:50px;object-fit:contain;border-radius:8px}.compactItem{grid-template-columns:42px 1fr auto;gap:8px;padding:6px 8px}.compactItem img,.compactItem .ph{width:38px;height:38px}.compactItem .info b{font-size:13px}.compactMeta{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:2px}.compactMeta .price{font-size:12px;font-weight:650}.unitSize{font-size:11px;color:var(--secondary-text-color);white-space:nowrap}.combinedBreakdown{font-size:10px;color:var(--secondary-text-color);white-space:nowrap}.compactQty button{width:28px;height:28px;font-size:17px}.compactQty span,.readonlyQty span{font-size:12px;min-width:16px}.combinedQty span{font-size:13px;font-weight:700;min-width:22px}.ph{display:grid;place-items:center;background:var(--secondary-background-color)}.info{min-width:0}.info b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.price{font-weight:650;margin-top:3px}.price s{font-weight:400;color:var(--secondary-text-color);font-size:12px}.bonus{display:inline-block;margin-top:4px;padding:2px 5px;border-radius:5px;background:#00a03c;color:white;font-size:10px;font-weight:800}.qty{display:flex;align-items:center;gap:5px}.qty button{width:34px;height:34px;padding:0;font-size:20px}.qty span{min-width:20px;text-align:center;font-weight:700}.qty .trash{margin-left:3px;color:var(--error-color);font-size:17px}.empty{padding:22px;text-align:center;color:var(--secondary-text-color)}.toast{position:fixed;z-index:10001;left:50%;bottom:26px;transform:translateX(-50%);background:#2e7d32;color:white;padding:10px 16px;border-radius:20px;box-shadow:0 4px 16px #0005}.toast.error{background:var(--error-color,#c62828)}.inlineScanner{position:relative;flex:1 1 0;min-height:0;width:100%;overflow:hidden;background:#000}.inlineScanner video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;transform-origin:center center;will-change:transform}.scanGuide{position:absolute;z-index:2;left:5%;right:5%;top:40%;height:20%;border:2px solid #fff;border-radius:10px;box-shadow:0 0 0 9999px #0003;pointer-events:none}.scanGuide:after{content:'';position:absolute;left:7%;right:7%;top:50%;height:2px;background:#f33}.scanRecent{position:absolute;z-index:4;top:10px;left:10px;right:10px;display:flex;flex-direction:column;gap:5px;max-height:78%;overflow:hidden;pointer-events:none}.scanRecent.withClose{right:58px}.scanOverlayItem{pointer-events:auto;background:var(--card-background-color);border:0!important;border-radius:10px;box-shadow:0 2px 10px #0005;animation:scanRowIn .18s ease-out}.scanOverlayItem .compactMeta{min-height:14px}.scanOverlayItem .qty button{background:var(--secondary-background-color)}.scanClose{position:absolute;z-index:6;top:10px;right:10px;width:38px;height:38px;padding:0;border-radius:50%;background:#0009;color:#fff;font-size:24px;line-height:38px;backdrop-filter:blur(4px)}.scanHud{position:absolute;z-index:5;left:10px;right:10px;bottom:10px;display:flex;justify-content:flex-end;align-items:flex-end;gap:8px;pointer-events:none}.scanPill{display:inline-block;max-width:70%;padding:5px 8px;border-radius:999px;background:#0009;color:#fff;font-size:11px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;backdrop-filter:blur(4px)}.scanPill[hidden]{display:none!important}.scanStatus.error{margin-right:auto;max-width:min(72%,560px);padding:9px 12px;border-radius:10px;background:var(--error-color,#c62828);font-size:13px;font-weight:650;white-space:normal;line-height:1.3;box-shadow:0 3px 12px #0007}.scanTimer{max-width:none}.inlineScanner.scanHit:after{content:'';position:absolute;z-index:3;inset:0;border:3px solid #00a03c;box-shadow:inset 0 0 28px #00a03c88;pointer-events:none;animation:scanFlash .22s ease-out}@keyframes scanFlash{from{opacity:1}to{opacity:0}}@keyframes scanRowIn{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0)}}@media(max-width:520px){.item{grid-template-columns:46px 1fr}.scanOverlayItem{grid-template-columns:42px minmax(0,1fr) auto}.scanOverlayItem .qty{grid-column:auto;justify-content:flex-end}.scanOverlayItem img,.scanOverlayItem .ph{width:38px;height:38px}.item{grid-template-columns:46px 1fr}.item img,.ph{width:42px;height:42px}.qty{grid-column:2;justify-content:flex-end}.head{padding:14px}.scanArea{padding-left:14px;padding-right:14px}}`;}
}
if(!customElements.get('ah-shopping-card'))customElements.define('ah-shopping-card',AhShoppingCard);
window.customCards=window.customCards||[];
if(!window.customCards.some(c=>c.type==='ah-shopping-card'))window.customCards.push({type:'ah-shopping-card',name:'Albert Heijn Shopping',description:'Beheer je AH-boodschappenlijst en scan EAN-barcodes.'});
