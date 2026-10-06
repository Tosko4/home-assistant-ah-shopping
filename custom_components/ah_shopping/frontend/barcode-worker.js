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
    const pixels=new Uint8ClampedArray(data.pixels);
    const image=new ImageData(pixels,data.width,data.height);
    const options={
      formats:['EAN13','EAN8','UPCA'],maxNumberOfSymbols:1,
      tryHarder:false,tryRotate:true,tryInvert:false,
      tryDownscale:true,minLineCount:2
    };
    // Search densely through a small central strip first. This keeps fresh
    // frames flowing on slower tablets without discarding horizontal detail.
    const bandHeight=Math.min(96,data.height);
    const offset=Math.floor((data.height-bandHeight)/2)*data.width*4;
    const band=new ImageData(pixels.subarray(offset,offset+bandHeight*data.width*4),data.width,bandHeight);
    let results=await ZXingWASM.readBarcodes(band,{...options,tryHarder:true,tryRotate:false,tryDownscale:false});
    if(!results.length){
      results=await ZXingWASM.readBarcodes(image,{...options,tryHarder:data.harder,tryInvert:data.harder});
    }
    // A different threshold can recover low-contrast tablet camera images.
    // Keep this extra pass sampled rather than paying its cost on every miss.
    if(!results.length&&data.harder){
      results=await ZXingWASM.readBarcodes(band,{...options,tryHarder:true,tryRotate:false,binarizer:'GlobalHistogram'});
    }
    self.postMessage({id:data.id,code:results[0]?.text||''});
  }catch(error){self.postMessage({id:data.id,error:String(error)});}
};
