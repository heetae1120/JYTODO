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
  env:{...process.env,XDG_CACHE_HOME:join(directory,'cache'),XDG_CONFIG_HOME:join(directory,'config'),JYTODO_DESKTOP_DATA:join(directory,'data'),JYTODO_DESKTOP_PORT:port,SLACK_WEBHOOK_URL:'',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:''},
  timeout:20000,
};
let desktop;
async function launch() {
  desktop=await electron.launch(options);
  const page=await desktop.firstWindow();
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
  assert.deepEqual(errors,[]);
  console.log('PASS: native desktop launch, isolated renderer, authenticated local API, close-to-tray, main-process reminder restores window, snooze, settings and persistence across restart.');
} finally {
  await desktop?.close();
  await rm(directory,{recursive:true,force:true});
}
