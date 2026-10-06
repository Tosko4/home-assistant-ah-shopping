// ZXing-C++ 3.1.5, served by HA and executed outside the dashboard thread.
importScripts('vendor/zxing-reader-3.1.5.js');
const ready=ZXingWASM.prepareZXingModule({
  overrides:{locateFile:path=>new URL(`vendor/${path}`,self.location.href).href},
  fireImmediately:true
});
ready.then(()=>self.postMessage({ready:true})).catch(error=>self.postMessage({error:String(error)}));
self.onmessage=async({data})=>{
  try{
    await ready;
    const image=new ImageData(new Uint8ClampedArray(data.pixels),data.width,data.height);
    const results=await ZXingWASM.readBarcodes(image,{
      formats:['EAN13','EAN8','UPCA'],maxNumberOfSymbols:1,
      tryHarder:data.harder,tryRotate:true,tryInvert:data.harder,
      tryDownscale:true,minLineCount:2
    });
    self.postMessage({id:data.id,code:results[0]?.text||''});
  }catch(error){self.postMessage({id:data.id,error:String(error)});}
};
