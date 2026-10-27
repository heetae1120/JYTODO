import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export function publicConfig(){
  try{
    const file=JSON.parse(readFileSync(fileURLToPath(new URL('../cloud-config.json',import.meta.url)),'utf8'));
    return {SUPABASE_URL:file.SUPABASE_URL||'',SUPABASE_PUBLISHABLE_KEY:file.SUPABASE_PUBLISHABLE_KEY||'',CLOUD_REQUIRED:file.CLOUD_REQUIRED===true};
  }catch{return {SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:'',CLOUD_REQUIRED:true};}
}
