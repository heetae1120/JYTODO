import { _electron as electron } from 'playwright';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const directory=await mkdtemp(join(tmpdir(),'jytodo-native-'));
const port='43130';
const errors=[];
const options={
  ...(process.env.JYTODO_DESKTOP_EXECUTABLE ? {executablePath:process.env.JYTODO_DESKTOP_EXECUTABLE} : {}),
  args:[...(!process.env.JYTODO_DESKTOP_EXECUTABLE ? ['.'] : []), ...(process.platform==='linux'?['--no-sandbox','--disable-gpu']:[])],
  env:{...process.env,CLOUD_REQUIRED:'0',XDG_CACHE_HOME:join(directory,'cache'),XDG_CONFIG_HOME:join(directory,'config'),JYTODO_DESKTOP_DATA:join(directory,'data'),JYTODO_DESKTOP_PORT:port,SLACK_WEBHOOK_URL:'',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:''},
  timeout:20000,
};
let desktop;
async function launch() {
  desktop=await electron.launch(options);
  let diagnostics='';desktop.process().stderr.on('data',data=>diagnostics+=data);
  let page;try{page=await desktop.firstWindow();}catch(error){console.error(diagnostics);throw error;}
  page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('heading',{name:'오늘의 할 일.',exact:true}).waitFor();
  return page;
}
try {
  let page=await launch();
  const isolation=await page.evaluate(()=>({node:typeof require,bridge:Boolean(window.jytodoDesktop)}));
  assert.deepEqual(isolation,{node:'undefined',bridge:true});
  const userData=await desktop.evaluate(({app})=>app.getPath('userData'));
  assert.ok(userData.startsWith(directory),'Smoke must not use real user data');
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/tasks`)).status,401,'Native APIs require per-launch capability');
  const settings=await page.evaluate(()=>window.jytodoDesktop.settings());
  assert.ok(settings.tray,'Tray must exist to test close-to-tray');
  assert.equal(settings.autoLaunch,false,'Auto launch is opt-in');
  const result=await page.evaluate(async()=>{
    const response=await fetch('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'창을 닫아도 알림',notes:'트레이에서 다시 열리는지 검증',dueAt:new Date(Date.now()+6000).toISOString(),reminderMinutes:0,category:'personal',priority:'high',timezone:'Asia/Seoul',slack:false,calendar:false})});
    return {status:response.status,task:await response.json()};
  });
  assert.equal(result.status,201);
  assert.ok(await desktop.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.close();return !window.isVisible();}),'Close must hide window, not quit');
  await page.getByRole('heading',{name:'지금, 할 일 시간이에요'}).waitFor({timeout:15000});
  assert.ok(await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),'Main process must reveal window for scheduled alarm');
  await page.getByRole('button',{name:'10분 뒤 다시 알림'}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  const tasks=await page.evaluate(()=>fetch('/api/tasks').then(r=>r.json()));
  assert.ok(Date.parse(tasks[0].reminderAt)>Date.now()+580000);
  await page.getByRole('button',{name:'연동 설정 열기'}).click();
  await page.getByRole('heading',{name:'Windows 프로그램 설정'}).waitFor();
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/desktop-native.png'});
  await desktop.close();desktop=null;
  page=await launch();
  const restored=await page.evaluate(()=>fetch('/api/tasks').then(r=>r.json()));
  assert.equal(restored.length,1);assert.equal(restored[0].title,'창을 닫아도 알림');
  assert.equal(restored[0].reminderAt,tasks[0].reminderAt);
  await desktop.close();desktop=null;
  options.env.CLOUD_REQUIRED='1';
  desktop=await electron.launch(options);page=await desktop.firstWindow();
  await page.locator('.login-page').waitFor();
  if(!await page.getByLabel('프로젝트 URL',{exact:true}).count())await page.getByRole('button',{name:'동기화 공간 설정',exact:true}).click();
  await page.getByLabel('프로젝트 URL',{exact:true}).fill('https://test-project.supabase.co');
  await page.getByLabel('Publishable / anon 공개 키',{exact:true}).fill('sb_publishable_example_only_not_a_real_key');
  await page.getByRole('button',{name:'동기화 공간 연결',exact:true}).click();
  await page.getByLabel('아이디 (이메일)',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>fetch('/api/tasks').then(r=>r.status)),401);
  await desktop.close();desktop=null;
  desktop=await electron.launch(options);page=await desktop.firstWindow();
  await page.getByLabel('아이디 (이메일)',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('아이디 (이메일)',{exact:true}).inputValue(),'');
  assert.equal(await page.evaluate(()=>fetch('/api/tasks').then(r=>r.status)),401);
  assert.deepEqual(errors,[]);
  console.log('PASS: native launch, renderer isolation, close-to-tray, reminder restoration, snooze, data persistence, cloud setup, login gate and locked data after restart.');
} finally {
  await desktop?.close();
  await rm(directory,{recursive:true,force:true});
}
