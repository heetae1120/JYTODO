import express from 'express';
import { ValidationError } from './store.js';
import { Integrations, ics } from './integrations.js';

export function createApp(store, config = process.env, request = fetch) {
  const app = express();
  const integrations = new Integrations(store, config, request);
  // Serialize task mutations across asynchronous calendar requests.
  let mutationQueue = Promise.resolve();
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (config.DESKTOP_API_TOKEN && !['/google/connect', '/google/callback'].includes(req.path) && req.headers.authorization !== `Bearer ${config.DESKTOP_API_TOKEN}`) return res.status(401).json({ error: '프로그램에서 접근해 주세요.' });
    if (!['GET', 'HEAD'].includes(req.method)) {
      const expected = new URL(config.APP_URL || 'http://localhost:3000').origin;
      if (req.headers.origin && req.headers.origin !== expected) return res.status(403).json({ error: '허용되지 않은 요청입니다.' });
      if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return res.status(415).json({ error: 'JSON 요청이 필요합니다.' });
    }
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get('/api/tasks', (req, res) => res.json(store.all()));
  app.get('/api/alarms', (req, res) => res.json(store.due().filter(t => !t.notifiedAt)));
  app.get('/api/integrations', (req, res) => res.json(integrations.status()));
  app.get('/api/calendar.ics', (req, res) => res.type('text/calendar').attachment('jytodo.ics').send(ics(store.all())));
  app.get('/api/google/connect', (req, res) => {
    try {
      const { state, url } = integrations.beginGoogle();
      res.cookie('google_state', state, { httpOnly: true, sameSite: 'lax', secure: (config.APP_URL || '').startsWith('https:'), maxAge: 600000, path: '/api/google' });
      res.redirect(url);
    } catch (error) { res.redirect('/?google=unconfigured'); }
  });
  app.get('/api/google/callback', async (req, res) => {
    try {
      const state = req.headers.cookie?.split('; ').find(c => c.startsWith('google_state='))?.split('=')[1];
      await integrations.finishGoogle(req.query.code, req.query.state, state);
      res.clearCookie('google_state', { path: '/api/google' });
      if (config.DESKTOP_MODE) return res.type('html').send('<!doctype html><html lang="ko"><meta charset="utf-8"><title>JYTODO 연결 완료</title><h1>Google 캘린더가 연결되었습니다.</h1><p>JYTODO 프로그램으로 돌아가 주세요. 이 창은 닫아도 됩니다.</p></html>');
      res.redirect('/?google=connected');
    } catch {
      if (config.DESKTOP_MODE) return res.status(400).type('html').send('<!doctype html><html lang="ko"><meta charset="utf-8"><title>JYTODO 연결 실패</title><h1>연결을 완료하지 못했습니다.</h1><p>JYTODO 프로그램에서 연결을 다시 시도해 주세요.</p></html>');
      res.redirect('/?google=failed');
    }
  });
  app.post('/api/google/disconnect', async (req, res) => { store.setting('googleTokens', null); res.json({ ok: true }); });
  app.post('/api/slack/test', async (req, res, next) => {
    try { await integrations.sendSlack('✅ JYTODO 연결 확인: 이 채널로 할 일 알림을 보냅니다.'); res.json({ ok: true }); } catch (error) { next(error); }
  });
  app.use('/api/tasks', async (req, res, next) => {
    if (['GET', 'HEAD'].includes(req.method)) return next();
    const previous = mutationQueue;
    let release;
    mutationQueue = new Promise(resolve => { release = resolve; });
    await previous;
    res.on('finish', release); res.on('close', release);
    next();
  });
  app.post('/api/tasks', async (req, res, next) => {
    try { const task = store.create(req.body); res.status(201).json(await integrations.syncCalendar(task)); } catch (error) { next(error); }
  });
  app.put('/api/tasks/:id', async (req, res, next) => {
    try { const task = store.update(req.params.id, req.body); if (!task) return res.status(404).json({ error: '할 일을 찾을 수 없습니다.' }); res.json(await integrations.syncCalendar(task)); } catch (error) { next(error); }
  });
  app.post('/api/tasks/:id/:action', async (req, res, next) => {
    try {
      let task = store.get(req.params.id);
      if (!task) return res.status(404).json({ error: '할 일을 찾을 수 없습니다.' });
      if (req.params.action === 'complete') {
        task.completed = !task.completed;
        task = await integrations.syncCalendar(store.save(task));
      } else if (req.params.action === 'ack') {
        if (req.body.reminderAt === task.reminderAt) task = store.save({ ...task, notifiedAt: new Date().toISOString() });
      } else if (req.params.action === 'snooze') {
        task = store.save({ ...task, reminderAt: new Date(Date.now() + 600000).toISOString(), notifiedAt: null, slackSentAt: null, slackError: null });
      } else if (req.params.action === 'sync') task = await integrations.syncCalendar(task);
      else return res.status(404).json({ error: '지원하지 않는 작업입니다.' });
      res.json(task);
    } catch (error) { next(error); }
  });
  app.delete('/api/tasks/:id', async (req, res) => {
    const task = store.get(req.params.id);
    if (!task) return res.status(404).json({ error: '할 일을 찾을 수 없습니다.' });
    if (task.googleEventId) {
      const result = await integrations.syncCalendar({ ...task, calendar: false });
      if (result.calendarError) return res.status(502).json({ error: result.calendarError });
    }
    store.remove(task.id); res.json({ ok: true });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: '요청을 찾을 수 없습니다.' }));
  app.use((error, req, res, next) => {
    if (!req.path.startsWith('/api')) return next(error);
    const status = error instanceof ValidationError || error.type === 'entity.parse.failed' ? 400 : error.status === 413 ? 413 : 502;
    res.status(status).json({ error: error instanceof ValidationError ? error.message : status === 400 ? 'JSON 형식을 확인해 주세요.' : status === 413 ? '입력 내용이 너무 큽니다.' : '연동 요청에 실패했습니다. 서버 설정과 연결 상태를 확인해 주세요.' });
  });
  return { app, integrations };
}
