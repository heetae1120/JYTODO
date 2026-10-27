import { existsSync } from 'node:fs';
import express from 'express';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { fakeSupabase,project } from './fake-supabase.js';

const service=fakeSupabase(),computers=[];let browser;
const input=title=>({title,notes:'다른 PC에서 확인',dueAt:'2030-06-10T05:00:00Z',category:'work',priority:'normal',reminderMinutes:null,slack:false,calendar:false,timezone:'Asia/Seoul'});
async function computer(port){
  const store=new Store(':memory:');
  const runtime=createApp(store,{...project,APP_URL:`http://localhost:${port}`},service.fetch);
  runtime.app.use(express.static(resolve('dist')));runtime.app.get('/{*path}',(req,res)=>res.sendFile(resolve('dist/index.html')));
  const server=runtime.app.listen(port,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const result={store,runtime,server,url:`http://localhost:${port}`};computers.push(result);return result;
}
async function login(page,computer,name){
  await page.goto(computer.url);await page.getByLabel('아이디 (이메일)',{exact:true}).fill(`${name}@example.test`);await page.getByLabel('비밀번호',{exact:true}).fill('test-password');await page.getByRole('button',{name:'로그인',exact:true}).click();await page.getByRole('heading',{name:'오늘의 할 일.',exact:true}).waitFor();await page.getByRole('button',{name:'모든 할 일'}).click();
}
async function logout(page){
  await page.getByRole('button',{name:'계정 관리',exact:true}).click();await page.getByRole('button',{name:'로그아웃',exact:true}).click();await page.getByRole('button',{name:'로그아웃하기',exact:true}).click();await page.getByLabel('아이디 (이메일)',{exact:true}).waitFor();
}
async function mutate(page,title,id){
  const result=await page.evaluate(async({body,id})=>{const response=await fetch(id?`/api/tasks/${id}`:'/api/tasks',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,task:await response.json()};},{body:input(title),id});assert.ok([200,201].includes(result.status));return result.task;
}
try{
  const a=await computer(3102),b=await computer(3103);a.store.create(input('기존 PC의 기록'));
  browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Seoul'}),page=await context.newPage(),other=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));other.on('pageerror',e=>errors.push(e.message));
  await page.goto(a.url);await page.getByRole('heading',{name:'다시 만나 반가워요'}).waitFor();
  assert.equal((await fetch(a.url+'/api/tasks')).status,401);
  await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/login.png',fullPage:true});
  await page.getByRole('button',{name:'회원가입',exact:true}).click();await page.getByLabel('아이디 (이메일)',{exact:true}).fill('alice@example.test');await page.getByLabel('비밀번호',{exact:true}).fill('test-password');await page.getByRole('button',{name:'회원가입',exact:true}).click();await page.getByRole('status').waitFor();
  await page.getByLabel('비밀번호',{exact:true}).fill('wrong-password');await page.getByRole('button',{name:'로그인',exact:true}).click();await page.getByRole('alert').waitFor();
  await login(page,a,'alice');const task=await mutate(page,'두 PC에서 불러온 할 일');await page.getByLabel('지금 동기화',{exact:true}).click();
  await login(other,b,'alice');await other.getByRole('button',{name:'두 PC에서 불러온 할 일',exact:true}).waitFor();
  await mutate(other,'다른 PC에서 수정한 내역',task.id);await other.getByLabel('지금 동기화',{exact:true}).click();await page.getByLabel('지금 동기화',{exact:true}).click();await page.getByRole('button',{name:'다른 PC에서 수정한 내역',exact:true}).waitFor({timeout:10000});
  await page.getByRole('button',{name:'계정 관리',exact:true}).click();await page.getByRole('button',{name:'가져오기 확인',exact:true}).click();await page.getByRole('button',{name:'이 계정으로 가져오기',exact:true}).click();await page.getByText('1개 항목을 가져왔습니다.',{exact:true}).waitFor();await page.getByRole('button',{name:'계정 창 닫기',exact:true}).click();
  await page.getByRole('button',{name:'기존 PC의 기록',exact:true}).waitFor({timeout:10000});
  await logout(page);assert.equal(await page.getByRole('button',{name:'다른 PC에서 수정한 내역',exact:true}).count(),0);
  await login(page,a,'bob');await page.getByRole('heading',{name:'아직 적어둔 할 일이 없어요'}).waitFor();await mutate(page,'Bob의 비공개 일정');await page.getByLabel('지금 동기화',{exact:true}).click();await logout(page);await login(page,a,'alice');await page.getByRole('button',{name:'다른 PC에서 수정한 내역',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Bob의 비공개 일정',exact:true}).count(),0);
  await mutate(page,'이 PC에서 동시에 수정',task.id);await mutate(other,'서버에서 동시에 수정',task.id);await other.getByLabel('지금 동기화',{exact:true}).click();await page.getByLabel('지금 동기화',{exact:true}).click();
  await page.getByRole('button',{name:'계정 관리',exact:true}).click();await page.getByRole('heading',{name:'두 PC에서 변경한 할 일이 있어요'}).waitFor();await page.screenshot({path:'test-results/sync-conflict.png',fullPage:true});
  await page.getByRole('button',{name:'서버 내역 사용',exact:true}).click();await page.getByRole('heading',{name:'두 PC에서 변경한 할 일이 있어요'}).waitFor({state:'hidden'});await page.getByRole('button',{name:'계정 창 닫기',exact:true}).click();await page.getByRole('button',{name:'서버에서 동시에 수정',exact:true}).waitFor({timeout:10000});
  await page.screenshot({path:'test-results/account-sync.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: signup/login failures, two-computer sync, edit propagation, explicit legacy import, logout privacy, separate accounts and conflict resolution UI.');
}finally{await browser?.close();for(const item of computers){await new Promise(resolve=>item.server.close(resolve));item.store.close();}}
