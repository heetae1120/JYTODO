import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { Integrations, ics } from '../server/integrations.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const task = (overrides = {}) => ({ title: '회의 준비', notes: '자료 정리', dueAt: '2030-01-05T02:00:00.000Z', category: 'work', priority: 'normal', reminderMinutes: 10, slack: false, calendar: false, timezone: 'Asia/Seoul', ...overrides });
test('SQLite preserves tasks and outstanding alarms across process restarts', () => {
  const directory=mkdtempSync(join(tmpdir(),'jytodo-persistence-'));
  try {
    const path=join(directory,'test.sqlite');const first=new Store(path);
    const created=first.create(task({dueAt:'2020-01-01T00:00:00Z'}));first.close();
    const second=new Store(path);assert.equal(second.get(created.id).title,'회의 준비');assert.equal(second.due().length,1);second.close();
  } finally {rmSync(directory,{recursive:true,force:true});}
});
async function fixture(fn, config = {}, fetcher) {
  const store = new Store(':memory:');
  const { app, integrations } = createApp(store, config, fetcher);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, method = 'GET', body) => {
    const res = await fetch(url + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  try { await fn({ store, call, url, integrations }); } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
}

test('CRUD persists task details, sorts by time, and toggles completion', () => fixture(async ({ call }) => {
  const first = await call('/tasks', 'POST', task());
  assert.equal(first.status, 201);
  assert.equal(first.body.reminderAt, '2030-01-05T01:50:00.000Z');
  const early = await call('/tasks', 'POST', task({ title: '먼저 할 일', dueAt: '2030-01-04T01:00:00Z' }));
  assert.equal((await call('/tasks')).body[0].id, early.body.id);
  const update = await call(`/tasks/${first.body.id}`, 'PUT', task({ title: '수정됨', reminderMinutes: 0 }));
  assert.equal(update.body.title, '수정됨'); assert.equal(update.body.reminderAt, update.body.dueAt);
  assert.equal((await call(`/tasks/${first.body.id}/complete`, 'POST', {})).body.completed, true);
  assert.equal((await call(`/tasks/${first.body.id}/complete`, 'POST', {})).body.completed, false);
  assert.equal((await call(`/tasks/${first.body.id}`, 'DELETE')).status, 200);
  assert.equal((await call('/tasks')).body.length, 1);
  assert.equal((await call(`/tasks/${first.body.id}`, 'DELETE')).status, 404);
}));

test('invalid dates, categories, reminder options, flags and titles are rejected', () => fixture(async ({ call }) => {
  for (const patch of [{ title: ' ' }, { title: 'a'.repeat(201) }, { dueAt: 'bad' }, { category: 'bad' }, { reminderMinutes: -1 }, { slack: 'yes' }, { timezone: 'bad/zone' }]) {
    assert.equal((await call('/tasks','POST',task(patch))).status, 400);
  }
  assert.equal((await call('/tasks')).body.length, 0);
}));

test('alarms catch overdue tasks, acknowledge one schedule, snooze and ignore completed tasks', () => fixture(async ({ call }) => {
  const created = (await call('/tasks', 'POST', task({ dueAt: new Date(Date.now()-1000).toISOString(), reminderMinutes: 0 }))).body;
  assert.equal((await call('/alarms')).body.length, 1);
  await call(`/tasks/${created.id}/ack`, 'POST', { reminderAt: 'stale' });
  assert.equal((await call('/alarms')).body.length, 1);
  await call(`/tasks/${created.id}/ack`, 'POST', { reminderAt: created.reminderAt });
  assert.equal((await call('/alarms')).body.length, 0);
  const snoozed = (await call(`/tasks/${created.id}/snooze`, 'POST', {})).body;
  assert.ok(Date.parse(snoozed.reminderAt)>Date.now()+590000); assert.equal(snoozed.notifiedAt,null);
  await call(`/tasks/${created.id}`, 'PUT', task({ dueAt: new Date(Date.now()-5000).toISOString(), reminderMinutes: 0 }));
  assert.equal((await call('/alarms')).body.length, 1);
  await call(`/tasks/${created.id}/complete`, 'POST', {});
  assert.equal((await call('/alarms')).body.length, 0);
}));

test('no-reminder tasks never trigger and missing integration config is truthful', () => fixture(async ({ call }) => {
  await call('/tasks', 'POST', task({ dueAt: '2020-01-01T00:00:00Z', reminderMinutes: null }));
  assert.equal((await call('/alarms')).body.length, 0);
  assert.deepEqual((await call('/integrations')).body, { slack: { configured: false }, google: { configured: false, connected: false } });
  const result = await call('/tasks', 'POST', task({ calendar: true }));
  assert.equal(result.status, 201); assert.match(result.body.calendarError,/연결/);
}));

test('cross-origin mutations and non-JSON posts are rejected', () => fixture(async ({ url }) => {
  const rejected = await fetch(`${url}/tasks`, { method: 'POST', headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' }, body: JSON.stringify(task()) });
  assert.equal(rejected.status,403);
  assert.equal((await fetch(`${url}/tasks`, { method:'POST', body:'x' })).status,415);
}));

test('ICS uses UTC dates, escapes content and folds Korean by octet length', () => {
  const store = new Store(':memory:');
  const text = ics([store.create(task({ title: '한글 일정, 테스트;'.repeat(12), notes: '메모\n둘째 줄' }))]);
  assert.match(text,/BEGIN:VCALENDAR/); assert.match(text,/DTSTART:20300105T020000Z/);
  assert.match(text,/\\,/); assert.match(text,/\\;/); assert.match(text,/메모\\n둘째 줄/);
  assert.ok(text.split('\r\n').every(line=>Buffer.byteLength(line)<=75));
  store.close();
});

test('Slack scheduler sends only opted-in due tasks once and records retryable failures', async () => {
  const store = new Store(':memory:'); let sent = 0;
  const integration = new Integrations(store, { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/test/local/mock' }, async(url, options)=>{
    sent++; assert.match(JSON.parse(options.body).text,/회의 준비/); return new Response('ok');
  });
  store.create(task({ dueAt:'2020-01-01T00:00:00Z',slack:false }));
  const item=store.create(task({ dueAt:'2020-01-01T00:00:00Z',slack:true }));
  await integration.deliverSlack(); await integration.deliverSlack();
  assert.equal(sent,1); assert.ok(store.get(item.id).slackSentAt);
  const failed=store.create(task({ dueAt:'2020-01-02T00:00:00Z',slack:true }));
  integration.request=async()=>new Response('invalid', {status:500});
  await integration.deliverSlack();
  assert.match(store.get(failed.id).slackError,/실패/); assert.equal(store.get(failed.id).slackSentAt,null);
  assert.ok(integration.slackRetry.get(failed.id)>Date.now());store.close();
});

test('Google OAuth rejects invalid state and uses PKCE with the configured redirect', async () => {
  const store = new Store(':memory:'); const integration = new Integrations(store,{ GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test', APP_URL:'http://localhost:3000' });
  const start=integration.beginGoogle(); const url=new URL(start.url);
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('redirect_uri'),'http://localhost:3000/api/google/callback');
  await assert.rejects(integration.finishGoogle('code',start.state,'wrong'),/만료/);store.close();
});

test('Google sync creates idempotent events, updates them, and deletes only linked events', () => fixture(async ({ store,call }) => {
  store.setting('googleTokens',{access_token:'mock',expiresAt:Date.now()+3600000});
  const taskResult=await call('/tasks','POST',task({calendar:true}));
  assert.equal(taskResult.body.calendarError,null);assert.ok(taskResult.body.googleEventId);
  const edited=await call(`/tasks/${taskResult.body.id}`,'PUT',task({title:'수정 일정',calendar:true}));assert.equal(edited.body.calendarError,null);
  const completed=await call(`/tasks/${taskResult.body.id}/complete`,'POST',{});
  assert.equal(completed.body.googleEventId,null);
}, {GOOGLE_CLIENT_ID:'mock',GOOGLE_CLIENT_SECRET:'mock'}, (()=>{
  const events=new Map();
  return async(url,options)=>{
    const id=String(url).split('/').at(-1);
    if(options.method==='DELETE'){assert.ok(events.has(id));events.delete(id);return new Response(null,{status:204});}
    if(options.method==='PUT'){if(!events.has(id))return new Response('{}',{status:404});events.set(id,JSON.parse(options.body));return Response.json({id});}
    const event=JSON.parse(options.body);assert.equal(event.start.dateTime,'2030-01-05T02:00:00.000Z');events.set(event.id,event);return Response.json({id:event.id});
  };
})()));

test('failed Google deletion preserves local task and reports failure', () => fixture(async ({store,call})=>{
  store.setting('googleTokens',{access_token:'mock',expiresAt:Date.now()+3600000});
  const item=store.create(task({calendar:true}));store.save({...item,googleEventId:'saved-event'});
  const result=await call(`/tasks/${item.id}`,'DELETE');assert.equal(result.status,502);assert.ok(store.get(item.id));
}, {}, async()=>new Response('{}',{status:500})));
