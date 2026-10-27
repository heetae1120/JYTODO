import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const temp = await mkdtemp(join(tmpdir(), 'jytodo-ui-'));
const server = spawn(process.execPath, ['server/index.js', '--production'], { env: { ...process.env, PORT: '3101', APP_URL: 'http://localhost:3101', DB_PATH: join(temp,'test.sqlite'), SLACK_WEBHOOK_URL:'', GOOGLE_CLIENT_ID:'', GOOGLE_CLIENT_SECRET:'' }, stdio: ['ignore','pipe','pipe'] });
let logs = ''; server.stdout.on('data',data=>logs+=data); server.stderr.on('data',data=>logs+=data);
let browser;
try {
  const url='http://localhost:3101';
  let ready=false;
  for(let i=0;i<100;i++){
    try {if((await fetch(`${url}/api/health`)).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready, logs);
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:1050},timezoneId:'Asia/Seoul',permissions:['notifications']});
  const page=await context.newPage(); const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);await page.getByRole('heading',{name:'오늘의 할 일.',exact:true}).waitFor();
  await page.getByRole('button',{name:'할 일 추가',exact:false}).first().click();
  await page.getByLabel('무엇을 할까요?').fill('브라우저 테스트 일정');
  await page.getByLabel('메모').fill('수정과 저장 확인');
  await page.getByLabel('날짜',{exact:true}).fill('2030-06-10');
  await page.getByLabel('시간',{exact:true}).fill('14:30');
  await page.getByLabel('알림 시간',{exact:true}).selectOption('none');
  await page.getByRole('button',{name:'할 일 저장',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'모든 할 일'}).click();
  await page.getByRole('button',{name:'브라우저 테스트 일정',exact:true}).waitFor();
  await page.getByRole('button',{name:'브라우저 테스트 일정 수정',exact:true}).click();
  await page.getByLabel('무엇을 할까요?').fill('수정한 일정');
  await page.getByRole('button',{name:'할 일 저장',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByLabel('할 일 검색').fill('없는 검색어');
  await page.getByRole('heading',{name:'조건에 맞는 할 일이 없어요'}).waitFor();
  await page.getByLabel('할 일 검색').fill('수정한');
  await page.getByRole('button',{name:'수정한 일정',exact:true}).waitFor();
  await page.getByLabel('할 일 검색').fill('');
  await page.getByRole('button',{name:'수정한 일정 완료',exact:true}).click();
  await page.getByRole('button',{name:'완료한 할 일',exact:true}).click();
  await page.getByRole('button',{name:'수정한 일정',exact:true}).waitFor();
  await page.getByRole('button',{name:'수정한 일정 완료 취소',exact:true}).click();
  await page.getByRole('button',{name:'모든 할 일'}).click();
  await page.getByRole('button',{name:'수정한 일정 삭제',exact:true}).click();
  await page.getByRole('button',{name:'삭제하기',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal((await (await fetch(`${url}/api/tasks`)).json()).length,0);

  const send=async(body)=>fetch(`${url}/api/tasks`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const base={notes:'',category:'work',priority:'normal',slack:false,calendar:false,timezone:'Asia/Seoul',reminderMinutes:0};
  const alarm=await send({...base,title:'예약 알림 검증',dueAt:new Date(Date.now()-1000).toISOString()}); assert.equal(alarm.status,201);
  await page.getByRole('heading',{name:'지금, 할 일 시간이에요'}).waitFor({timeout:10000});
  await page.waitForFunction(async()=>{const reg=await navigator.serviceWorker.ready;return(await reg.getNotifications()).length>0;});
  await page.getByRole('button',{name:'10분 뒤 다시 알림'}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  const snoozed=(await(await fetch(`${url}/api/tasks`)).json())[0];assert.ok(Date.parse(snoozed.reminderAt)>Date.now()+580000);
  // Reset the persisted reminder to a new overdue occurrence and verify completion.
  await fetch(`${url}/api/tasks/${snoozed.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...base,title:'예약 알림 검증',dueAt:new Date(Date.now()-2000).toISOString()})});
  await page.getByRole('heading',{name:'지금, 할 일 시간이에요'}).waitFor({timeout:10000});
  await page.getByRole('button',{name:'완료하기',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal((await(await fetch(`${url}/api/tasks`)).json())[0].completed,true);

  await page.getByRole('button',{name:'앱 연동 및 설정'}).click();
  await page.getByRole('heading',{name:'앱 연동',exact:true}).waitFor();
  assert.ok(await page.getByText('Google Cloud에서 Calendar API').count());
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  await page.getByRole('button',{name:'캘린더',exact:true}).first().click();
  await page.getByRole('button',{name:'다음 달'}).click();
  await page.getByRole('button',{name:'오늘의 할 일'}).click();
  // A realistic populated screen, using future reminders so no messages are sent.
  const local=await page.evaluate(()=>{const date=new Date();date.setHours(23,59,0,0);return date.toISOString();});
  const examples=[['주간 프로젝트 계획 정리','work','high'],['책 20페이지 읽기','study','normal'],['가볍게 산책하기','personal','normal']];
  for(const [title,category,priority] of examples)await send({...base,title,category,priority,dueAt:local,reminderMinutes:null});
  await page.getByRole('button',{name:'주간 프로젝트 계획 정리',exact:true}).waitFor({timeout:10000});
  if(await page.getByRole('button',{name:'메시지 닫기'}).count())await page.getByRole('button',{name:'메시지 닫기'}).click();
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile horizontal overflow');
  await page.getByRole('button',{name:'할 일 추가',exact:false}).first().click();
  await page.getByRole('dialog').waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'취소',exact:true}).click();
  await page.getByRole('button',{name:'연동 설정 열기'}).click();
  await page.getByRole('heading',{name:'앱 연동',exact:true}).waitFor();
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  assert.deepEqual(errors,[]);
  console.log('PASS: browser CRUD, search, completion, overdue popup, system notification, snooze, alarm completion, integration setup, calendar navigation, desktop/mobile layout.');
} finally {
  await browser?.close();server.kill('SIGTERM');
  await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve);});
  await rm(temp,{recursive:true,force:true});
}
