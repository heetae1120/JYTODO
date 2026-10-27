import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DesktopAlarms } from '../desktop/alarms.js';
import { Store } from '../server/store.js';

test('desktop scheduler restores the hidden window once per occurrence, and recovers overdue alarms after restart', () => {
  const store = new Store(':memory:');
  const task=store.create({title:'데스크톱 예약',notes:'',dueAt:'2020-01-01T00:00:00Z',reminderMinutes:0,category:'personal',priority:'normal',slack:false,calendar:false});
  let restored=0;
  const scheduler=new DesktopAlarms(store,()=>restored++);
  scheduler.tick();scheduler.tick();assert.equal(restored,1);
  store.save({...task,notifiedAt:new Date().toISOString()});scheduler.tick();assert.equal(restored,1);
  store.save({...task,reminderAt:'2020-01-01T00:10:00Z',notifiedAt:null});scheduler.tick();assert.equal(restored,2);
  // Restarting the native process must recover unacknowledged reminders.
  new DesktopAlarms(store,()=>restored++).tick();assert.equal(restored,3);
  store.save({...store.get(task.id),completed:true});scheduler.tick();assert.equal(restored,3);store.close();
});

test('failed desktop delivery can retry without losing the reminder', () => {
  const store=new Store(':memory:');
  store.create({title:'실패 후 재시도',notes:'',dueAt:'2020-01-01T00:00:00Z',reminderMinutes:0,category:'work',priority:'normal',slack:false,calendar:false});
  let calls=0;const scheduler=new DesktopAlarms(store,()=>{if(++calls===1)throw new Error('window not ready');});
  assert.throws(()=>scheduler.tick(),/not ready/);scheduler.tick();assert.equal(calls,2);store.close();
});
