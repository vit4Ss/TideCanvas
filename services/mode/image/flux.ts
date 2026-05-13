
import type { ModelConfig, ModelDef } from "../types";
import { fetchThirdParty, constructUrl } from "../network";

// Helper: Extract base64 data from data URL
const extractBase64 = (dataUrl: string): string => {
    if (dataUrl.startsWith('data:')) {
        const parts = dataUrl.split(',');
        return parts.length > 1 ? parts[1] : dataUrl;
    }
    return dataUrl;
};

export const generateStandardImage = async (
    config: ModelConfig,
    modelDef: ModelDef,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    calculatedSize: string,
    inputImages: string[],
    n: number,
    promptOptimize?: boolean
): Promise<string[]> => {
   const targetUrl = constructUrl(config.baseUrl, config.endpoint);
   const isFlux = modelDef.id.includes('flux'); 
   const isJimeng = modelDef.id.includes('jimeng');
   const isDoubao = modelDef.id.includes('doubao');
   const isZimage = modelDef.id.includes('z-image');
   const isQwen = modelDef.id.includes('qwen');
   const hasInputImage = inputImages.length > 0;

   // 多图友好的字段写入器：覆盖各家代理的常见字段名（单张 + 数组）。
   // 任意一个被忽略不影响其他字段被识别。
   const applyImgFields = (payload: any, urls: string[]) => {
       const primary = urls[0];
       payload.image = primary;
       payload.image_url = primary;
       payload.images = [...urls];
       payload.image_urls = [...urls];
       payload.init_image = primary;
       payload.reference_image = primary;
       payload.ref_image = primary;
       payload.input_image = primary;
   };

   if ((isFlux || isZimage) && n > 1) {
      const promises = Array(n).fill(null).map(async () => {
         const payload: any = {
            model: config.modelId, 
            prompt, 
            size: calculatedSize, 
            n: 1 
         };
         if (isFlux) {
             if (resolution !== '1k') payload.quality = 'hd';
             if (hasInputImage) applyImgFields(payload, inputImages);
         } else if (isZimage) {
             payload.response_format = "b64_json";
             payload.watermark = false;
             payload.prompt_extend = !!promptOptimize;
             if (hasInputImage) {
                 // Zimage 通常需要纯 base64 数据
                 const base64s = inputImages.map(extractBase64);
                 applyImgFields(payload, base64s);
             }
         }
         const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 200000 });
         const data = (res.data && Array.isArray(res.data)) ? res.data : (res.data ? [res.data] : [res]);
         return data.map((item: any) => {
             if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
             if (item.url) return item.url;
             if (item.image_url) return item.image_url;
             return '';
         }).filter((url: string) => !!url)[0]; 
      });
      const results = await Promise.all(promises);
      return results.filter(r => !!r);
   }

   const payload: any = {
      model: config.modelId, prompt, n: n, response_format: "b64_json" 
   };

   if (isFlux) {
       payload.size = calculatedSize;
       if (resolution !== '1k') payload.quality = 'hd';
       delete payload.response_format; 
       if (hasInputImage) applyImgFields(payload, inputImages);
   } else {
       payload.size = calculatedSize;
   }

   if (isZimage) {
       payload.watermark = false;
       payload.prompt_extend = !!promptOptimize;
       if (hasInputImage) {
           const base64s = inputImages.map(extractBase64);
           applyImgFields(payload, base64s);
       }
   }

   // Jimeng (即梦) / Doubao Seedream 图生图
   if ((isJimeng || isDoubao) && hasInputImage) {
       applyImgFields(payload, inputImages);
   }

   // Qwen 图生图
   if (isQwen && hasInputImage) {
       applyImgFields(payload, inputImages);
   }

   const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 200000 });
   const data = (res.data && Array.isArray(res.data)) ? res.data : (res.data ? [res.data] : [res]);
   
   return data.map((item: any) => {
       if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
       if (item.url) return item.url;
       if (item.image_url) return item.image_url;
       return '';
   }).filter((url: string) => !!url);
};

export const generateMjModal = async (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string
): Promise<string> => {
   const targetUrl = constructUrl(config.baseUrl, config.endpoint);
   const payload = { prompt: `${prompt} --ar ${aspectRatio}`, botType: "MID_JOURNEY" };
   const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 200000 });
   return res.imageUrl || res.url;
};
