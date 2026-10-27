import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

export class ValidationError extends Error {}
export function validateTask(input) {
  if (!input || typeof input !== 'object') throw new ValidationError('할 일 정보가 필요합니다.');
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 200) throw new ValidationError('제목은 1~200자로 입력해 주세요.');
  if (typeof input.dueAt !== 'string' || !Number.isFinite(Date.parse(input.dueAt))) throw new ValidationError('날짜와 시간을 확인해 주세요.');
  if (!['work', 'personal', 'study'].includes(input.category)) throw new ValidationError('분류를 확인해 주세요.');
  if (!['normal', 'high'].includes(input.priority)) throw new ValidationError('중요도를 확인해 주세요.');
  if (![null, 0, 5, 10, 30, 60].includes(input.reminderMinutes)) throw new ValidationError('알림 시간을 확인해 주세요.');
  if (typeof input.notes !== 'string' || input.notes.length > 5000) throw new ValidationError('메모는 5,000자 이내로 입력해 주세요.');
  if (typeof input.slack !== 'boolean' || typeof input.calendar !== 'boolean') throw new ValidationError('연동 설정을 확인해 주세요.');
  const timezone = input.timezone || 'Asia/Seoul';
  try { new Intl.DateTimeFormat('ko', { timeZone: timezone }).format(); } catch { throw new ValidationError('시간대를 확인해 주세요.'); }
  return { title, dueAt: new Date(input.dueAt).toISOString(), category: input.category, priority: input.priority, notes: input.notes.trim(), reminderMinutes: input.reminderMinutes, slack: input.slack, calendar: input.calendar, timezone };
}

export class Store {
  constructor(path = 'data/jytodo.sqlite') {
    this.owner = 'local';
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cloud_tasks (
        owner TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1, remote_version INTEGER NOT NULL DEFAULT 0,
        dirty INTEGER NOT NULL DEFAULT 1, deleted INTEGER NOT NULL DEFAULT 0, conflict TEXT,
        PRIMARY KEY(owner,id)
      );`);
  }
  forAccount(owner) { const view = Object.create(Store.prototype); view.db = this.db; view.owner = owner; return view; }
  all() { const rows = this.owner === 'local' ? this.db.prepare('SELECT body FROM tasks').all() : this.db.prepare('SELECT body FROM cloud_tasks WHERE owner=? AND deleted=0').all(this.owner); return rows.map(r => JSON.parse(r.body)).sort((a,b) => a.dueAt.localeCompare(b.dueAt)); }
  get(id) { const row = this.owner === 'local' ? this.db.prepare('SELECT body FROM tasks WHERE id=?').get(id) : this.db.prepare('SELECT body FROM cloud_tasks WHERE owner=? AND id=? AND deleted=0').get(this.owner,id); return row ? JSON.parse(row.body) : null; }
  save(task) {
    if (this.owner === 'local') this.db.prepare('INSERT INTO tasks VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(task.id, JSON.stringify(task));
    else {
      const old=this.db.prepare('SELECT * FROM cloud_tasks WHERE owner=? AND id=?').get(this.owner,task.id);
      const changed=!old || old.deleted || JSON.stringify(cloudBody(JSON.parse(old.body)))!==JSON.stringify(cloudBody(task));
      if (!old) this.db.prepare('INSERT INTO cloud_tasks(owner,id,body) VALUES (?,?,?)').run(this.owner,task.id,JSON.stringify(task));
      else this.db.prepare('UPDATE cloud_tasks SET body=?, revision=revision+?, dirty=CASE WHEN ? THEN 1 ELSE dirty END, deleted=0 WHERE owner=? AND id=?').run(JSON.stringify(task),changed?1:0,changed?1:0,this.owner,task.id);
    }
    return task;
  }
  create(input) {
    const data = validateTask(input);
    return this.save({ ...data, id: randomUUID(), completed: false, createdAt: new Date().toISOString(), reminderAt: data.reminderMinutes === null ? null : new Date(Date.parse(data.dueAt) - data.reminderMinutes * 60000).toISOString(), notifiedAt: null, slackSentAt: null, slackError: null, googleEventId: null, calendarError: null });
  }
  update(id, input) {
    const old = this.get(id);
    if (!old) return null;
    const data = validateTask(input);
    const reset = old.dueAt !== data.dueAt || old.reminderMinutes !== data.reminderMinutes;
    return this.save({ ...old, ...data,
      ...(reset ? { reminderAt: data.reminderMinutes === null ? null : new Date(Date.parse(data.dueAt) - data.reminderMinutes * 60000).toISOString(), notifiedAt: null, slackSentAt: null, slackError: null } : {}),
      ...(!old.slack && data.slack ? { slackSentAt: null, slackError: null } : {}) });
  }
  due(now = new Date().toISOString()) { return this.all().filter(t => !t.completed && t.reminderAt && t.reminderAt <= now); }
  remove(id) {
    if(this.owner==='local')this.db.prepare('DELETE FROM tasks WHERE id=?').run(id);
    else this.db.prepare('UPDATE cloud_tasks SET deleted=1,dirty=1,revision=revision+1 WHERE owner=? AND id=?').run(this.owner,id);
  }
  setting(key, value) {
    if(this.owner!=='local')key=`account:${this.owner}:${key}`;
    if (value === undefined) { const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key); return row ? JSON.parse(row.value) : null; }
    this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
  }
  pending() { return this.db.prepare('SELECT * FROM cloud_tasks WHERE owner=? AND dirty=1 AND conflict IS NULL').all(this.owner); }
  syncState() {
    const rows=this.db.prepare('SELECT * FROM cloud_tasks WHERE owner=? AND dirty=1').all(this.owner);
    return { pending:rows.length, conflicts:rows.filter(row=>row.conflict).map(row=>({id:row.id,local:JSON.parse(row.body),localDeleted:Boolean(row.deleted),remote:JSON.parse(row.conflict)})) };
  }
  receive(row, sentRevision) {
    const old=this.db.prepare('SELECT * FROM cloud_tasks WHERE owner=? AND id=?').get(this.owner,row.id);
    const current=old?JSON.parse(old.body):{};
    const body={...current,...row.body,googleEventId:current.googleEventId||null,calendarError:current.calendarError||null,slackSentAt:current.slackSentAt||null,slackError:current.slackError||null};
    if(old && old.dirty && sentRevision===undefined){
      if(old.remote_version!==row.version)this.db.prepare('UPDATE cloud_tasks SET conflict=? WHERE owner=? AND id=?').run(JSON.stringify(row),this.owner,row.id);
      return;
    }
    if(old && sentRevision!==undefined && old.revision!==sentRevision){
      this.db.prepare('UPDATE cloud_tasks SET remote_version=?,conflict=NULL WHERE owner=? AND id=?').run(row.version,this.owner,row.id);return;
    }
    this.db.prepare(`INSERT INTO cloud_tasks(owner,id,body,remote_version,dirty,deleted) VALUES (?,?,?,?,0,?) ON CONFLICT(owner,id) DO UPDATE SET body=excluded.body,remote_version=excluded.remote_version,dirty=0,deleted=excluded.deleted,conflict=NULL`).run(this.owner,row.id,JSON.stringify(body),row.version,row.deleted?1:0);
  }
  conflict(row) { this.db.prepare('UPDATE cloud_tasks SET conflict=? WHERE owner=? AND id=?').run(JSON.stringify(row),this.owner,row.id); }
  resolve(id,choice) {
    const row=this.db.prepare('SELECT * FROM cloud_tasks WHERE owner=? AND id=?').get(this.owner,id);
    if(!row?.conflict)throw new ValidationError('이미 해결되었거나 찾을 수 없는 충돌입니다.');
    const remote=JSON.parse(row.conflict);
    if(choice==='remote')this.receive(remote,row.revision);
    else if(choice==='local')this.db.prepare('UPDATE cloud_tasks SET remote_version=?,conflict=NULL,revision=revision+1 WHERE owner=? AND id=?').run(remote.version,this.owner,id);
    else throw new ValidationError('사용할 내역을 선택해 주세요.');
  }
  importLocal(source) {
    let count=0;
    this.db.exec('BEGIN');
    try{
      for(const task of source.all()){
        if(this.db.prepare('SELECT 1 FROM cloud_tasks WHERE owner=? AND id=?').get(this.owner,task.id))continue;
        this.save({...task,calendar:false,slack:false,googleEventId:null,calendarError:null,slackSentAt:null,slackError:null});count++;
      }
      this.db.exec('COMMIT');return count;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  close() { this.db.close(); }
}

export function cloudBody(task) {
  return Object.fromEntries(['id','title','notes','dueAt','category','priority','reminderMinutes','slack','calendar','timezone','completed','createdAt','reminderAt','notifiedAt'].map(key=>[key,task[key]??null]));
}
