import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.js';
import { Accounts, validateProject } from '../server/accounts.js';
import { createApp } from '../server/app.js';
import { fakeSupabase, project, userIds } from './fake-supabase.js';
const data=(title='동기화 할 일')=>({title,notes:'다른 PC에서 이어서',dueAt:'2030-01-01T02:00:00Z',category:'work',priority:'normal',reminderMinutes:10,slack:false,calendar:false,timezone:'Asia/Seoul'});
const login=name=>({email:`${name}@example.test`,password:'test-password'});
function computer(service,root=new Store(':memory:')){return {root,account:new Accounts(root,project,service.fetch)};}

test('only HTTPS Supabase projects and public keys are accepted',()=>{
  assert.equal(validateProject(project.SUPABASE_URL,project.SUPABASE_PUBLISHABLE_KEY).url,project.SUPABASE_URL);
  const anon=`e30.${Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')}.signature`;
  assert.equal(validateProject(project.SUPABASE_URL,anon).key,anon);
  for(const url of ['http://test.supabase.co','https://evil.example','https://x.supabase.co/path','https://user:pass@x.supabase.co'])assert.throws(()=>validateProject(url,anon));
  for(const key of ['sb_secret_abc',`e30.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.signature`])assert.throws(()=>validateProject(project.SUPABASE_URL,key),/공개 키/);
});

test('cloud-required startup locks legacy tasks until project setup and login',()=>{
  const root=new Store(':memory:');root.create(data('설정 전 개인 내역'));
  const account=new Accounts(root,{CLOUD_REQUIRED:true});assert.equal(account.store,null);assert.equal(account.status().required,true);assert.equal(root.all().length,1);root.close();
});

test('a second computer loads the same account; edits and deletions propagate',async()=>{
  const service=fakeSupabase(),a=computer(service),b=computer(service);
  try{
    await a.account.signIn(login('alice'));const created=a.account.store.create(data());await a.account.sync(true);
    await b.account.signIn(login('alice'));assert.equal(b.account.store.all()[0].title,created.title);
    b.account.store.update(created.id,data('다른 PC에서 수정'));await b.account.sync(true);await a.account.sync(true);
    assert.equal(a.account.store.get(created.id).title,'다른 PC에서 수정');
    a.account.store.remove(created.id);await a.account.sync(true);await b.account.sync(true);
    assert.equal(b.account.store.all().length,0);
    assert.ok([...service.rows.values()][0].deleted,'A tombstone prevents offline resurrection');
  }finally{a.root.close();b.root.close();}
});

test('two simultaneous edits require an explicit conflict choice',async()=>{
  const service=fakeSupabase(),a=computer(service),b=computer(service);
  try{
    await a.account.signIn(login('alice'));const item=a.account.store.create(data());await a.account.sync(true);await b.account.signIn(login('alice'));
    a.account.store.update(item.id,data('이 PC의 수정'));b.account.store.update(item.id,data('서버의 수정'));await b.account.sync(true);await a.account.sync(true);
    assert.equal(a.account.status().conflicts.length,1);assert.equal(a.account.store.get(item.id).title,'이 PC의 수정');
    a.account.store.resolve(item.id,'local');await a.account.sync(true);await b.account.sync(true);
    assert.equal(a.account.status().conflicts.length,0);assert.equal(b.account.store.get(item.id).title,'이 PC의 수정');
  }finally{a.root.close();b.root.close();}
});

test('an offline delete cannot silently erase a newer edit; choosing the server restores it',async()=>{
  const service=fakeSupabase(),a=computer(service),b=computer(service);
  try{
    await a.account.signIn(login('alice'));const task=a.account.store.create(data());await a.account.sync(true);await b.account.signIn(login('alice'));
    a.account.store.remove(task.id);b.account.store.update(task.id,data('다른 PC의 새 수정'));await b.account.sync(true);await a.account.sync(true);
    assert.equal(a.account.status().conflicts[0].localDeleted,true);assert.equal([...service.rows.values()][0].deleted,false);
    a.account.store.resolve(task.id,'remote');await a.account.sync(true);assert.equal(a.account.store.get(task.id).title,'다른 PC의 새 수정');assert.equal(a.account.status().pending,0);
  }finally{a.root.close();b.root.close();}
});

test('expired sessions refresh in memory without writing auth credentials to disk',async()=>{
  const service=fakeSupabase(),a=computer(service);
  try{
    await a.account.signIn(login('alice'));const access=a.account.session.access;a.account.session.expires=Date.now()-1;await a.account.sync(true);
    assert.notEqual(a.account.session.access,access);assert.equal(a.account.session.user.id,userIds.alice);
    assert.ok(!JSON.stringify(a.root.db.prepare('SELECT * FROM settings').all()).includes('test-refresh'));
    await a.account.signOut();assert.equal(a.account.session,null);
  }finally{a.root.close();}
});

test('offline changes survive logout/restart; account sessions and passwords do not',async()=>{
  const service=fakeSupabase(),a=computer(service);
  try{
    await a.account.signIn(login('alice'));service.offline=true;const item=a.account.store.create(data('오프라인에서 추가'));await a.account.sync(true);
    assert.equal(a.account.status().pending,1);assert.ok(a.account.status().error);
    const restarted=new Accounts(a.root,project,service.fetch);assert.equal(restarted.session,null);assert.equal(restarted.store,null);
    service.offline=false;await restarted.signIn(login('alice'));assert.equal(restarted.store.get(item.id).title,'오프라인에서 추가');assert.equal(restarted.status().pending,0);
    const stored=JSON.stringify(a.root.db.prepare('SELECT * FROM settings').all());assert.ok(!stored.includes('test-password'));assert.ok(!stored.includes('test-access'));
  }finally{a.root.close();}
});

test('different accounts cannot read tasks, outboxes, Google tokens or reminders from each other',async()=>{
  const service=fakeSupabase(),a=computer(service);
  try{
    await a.account.signIn(login('alice'));const item=a.account.store.create(data('Alice 전용'));a.account.store.setting('googleTokens',{access_token:'mock-google-alice'});await a.account.sync(true);
    const aliceScope=a.account.scope;await a.account.signOut();assert.equal(a.account.store,null);await a.account.signIn(login('bob'));
    assert.equal(a.account.store.all().length,0);assert.equal(a.account.store.pending().length,0);assert.equal(a.account.store.setting('googleTokens'),null);
    a.account.store.save({...a.root.forAccount(aliceScope).get(item.id),title:'Bob의 같은 ID'});await a.account.sync(true);
    await a.account.signOut();await a.account.signIn(login('alice'));assert.equal(a.account.store.get(item.id).title,'Alice 전용');assert.equal(a.account.store.setting('googleTokens').access_token,'mock-google-alice');
  }finally{a.root.close();}
});

test('local legacy tasks are imported only explicitly and do not duplicate or upload integration secrets',async()=>{
  const service=fakeSupabase(),a=computer(service);
  try{
    const legacy=a.root.create(data('기존 PC 내역'));a.root.save({...legacy,googleEventId:'private-id',slack:true,calendar:true});a.root.setting('googleTokens',{access_token:'private-local-token'});
    await a.account.signIn(login('alice'));assert.equal(a.account.store.all().length,0);assert.equal(service.rows.size,0);
    assert.equal(a.account.store.importLocal(a.root),1);assert.equal(a.account.store.importLocal(a.root),0);await a.account.sync(true);
    const remote=[...service.rows.values()][0];assert.equal(remote.body.calendar,false);assert.equal(remote.body.slack,false);assert.ok(!JSON.stringify(remote).includes('private'));
    assert.equal(a.root.all().length,1);assert.equal(a.account.store.setting('googleTokens'),null);
    const cached=a.account.store.get(legacy.id);a.account.store.save({...cached,slackError:'local metadata'});assert.equal(a.account.store.pending().length,0);
  }finally{a.root.close();}
});

test('an in-flight sync after logout cannot populate the new account',async()=>{
  const service=fakeSupabase(),a=computer(service);
  try{
    await a.account.signIn(login('alice'));a.account.store.create(data('Alice 전용'));await a.account.sync(true);
    let entered,release;const waiting=new Promise(resolve=>entered=resolve),barrier=new Promise(resolve=>release=resolve);
    service.holdPull=()=>{entered();return barrier;};const syncing=a.account.sync(true);await waiting;
    await a.account.signOut();service.holdPull=null;await a.account.signIn(login('bob'));release();await syncing;
    assert.equal(a.account.session.user.id,userIds.bob);assert.equal(a.account.store.all().length,0);
  }finally{a.root.close();}
});

test('a local edit during a cloud upload remains queued instead of being discarded',async()=>{
  const service=fakeSupabase(),a=computer(service);
  try{
    await a.account.signIn(login('alice'));const item=a.account.store.create(data('원본'));
    service.afterPush=()=>{a.account.store.update(item.id,data('전송 중 수정'));service.afterPush=null;};await a.account.sync(true);
    assert.equal(a.account.store.get(item.id).title,'전송 중 수정');assert.equal(a.account.status().pending,1);
    await a.account.sync(true);assert.equal(a.account.status().pending,0);assert.equal([...service.rows.values()][0].body.title,'전송 중 수정');
  }finally{a.root.close();}
});

test('API requires cloud login, never exposes auth tokens and locks data after logout',async()=>{
  const root=new Store(':memory:'),service=fakeSupabase(),runtime=createApp(root,project,service.fetch),server=runtime.app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));const url=`http://127.0.0.1:${server.address().port}/api`;
  const call=async(path,body)=>{const response=await fetch(url+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});return {status:response.status,body:await response.json()};};
  try{
    assert.equal((await call('/tasks')).status,401);assert.equal((await call('/alarms')).status,401);
    const result=await call('/auth/login',login('alice'));assert.equal(result.status,200);assert.equal(result.body.user.email,'alice@example.test');assert.ok(!JSON.stringify(result).includes('test-access'));assert.ok(!JSON.stringify(result).includes('test-refresh'));
    assert.equal((await call('/tasks',data())).status,201);assert.equal((await call('/tasks')).body.length,1);
    runtime.accounts.lastAttempt=0;await runtime.background();assert.equal(service.rows.size,1);assert.equal(runtime.accounts.status().pending,0);
    await call('/auth/logout',{});assert.equal((await call('/tasks')).status,401);
    await call('/auth/login',login('bob'));assert.equal((await call('/tasks')).body.length,0);
  }finally{await new Promise(resolve=>server.close(resolve));root.close();}
});
