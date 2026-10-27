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
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  }
  all() { return this.db.prepare('SELECT body FROM tasks').all().map(r => JSON.parse(r.body)).sort((a,b) => a.dueAt.localeCompare(b.dueAt)); }
  get(id) { const row = this.db.prepare('SELECT body FROM tasks WHERE id=?').get(id); return row ? JSON.parse(row.body) : null; }
  save(task) { this.db.prepare('INSERT INTO tasks VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(task.id, JSON.stringify(task)); return task; }
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
  remove(id) { this.db.prepare('DELETE FROM tasks WHERE id=?').run(id); }
  setting(key, value) {
    if (value === undefined) { const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key); return row ? JSON.parse(row.value) : null; }
    this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
  }
  close() { this.db.close(); }
}
