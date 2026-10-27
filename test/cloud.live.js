// Read-only verification of the bundled public backend. No accounts or emails
// are created, and no management/service-role token is needed or used.
import assert from 'node:assert/strict';
import { publicConfig } from '../server/public-config.js';
import { validateProject } from '../server/accounts.js';

const config=publicConfig();
if(!config.SUPABASE_URL||!config.SUPABASE_PUBLISHABLE_KEY){
  console.log('SKIP: no hosted project is bundled.');
}else{
  const project=validateProject(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY);
  const headers={apikey:project.key};
  const health=await fetch(`${project.url}/auth/v1/health`,{headers,signal:AbortSignal.timeout(20000)});
  if(health.status!==200)console.error(`::error::Hosted Auth health returned HTTP ${health.status}`);
  assert.equal(health.status,200,'Hosted Auth health must accept the bundled public key');
  const read=await fetch(`${project.url}/rest/v1/todo_items?select=id&limit=1`,{headers,signal:AbortSignal.timeout(20000)});
  const result=await read.json();
  if(![401,403].includes(read.status)||result.code!=='42501')console.error(`::error::Anonymous REST access returned HTTP ${read.status}, code ${String(result.code||'unknown').replace(/[^A-Z0-9_]/g,'')}`);
  assert.ok([401,403].includes(read.status),'Anonymous clients must not read task data');
  assert.equal(result.code,'42501','The denial must come from database permissions, not an invalid API key');
  console.log('PASS: hosted Auth accepts the bundled public key and actual PostgREST denies anonymous task access.');
}
