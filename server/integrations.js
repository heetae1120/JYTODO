import { randomBytes, createHash } from 'node:crypto';

export function ics(tasks) {
  const escape = value => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const stamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//JYTODO//KO', 'CALSCALE:GREGORIAN'];
  for (const task of tasks) {
    lines.push('BEGIN:VEVENT', `UID:${task.id}@jytodo.local`, `DTSTAMP:${stamp(task.createdAt)}`, `DTSTART:${stamp(task.dueAt)}`, `DTEND:${stamp(Date.parse(task.dueAt)+1800000)}`, `SUMMARY:${escape(task.title)}`, `DESCRIPTION:${escape(task.notes)}`, `STATUS:${task.completed ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  // RFC 5545: fold by UTF-8 octets without splitting Korean characters.
  return lines.map(line => { let out = '', length = 0; for (const char of line) { const size = Buffer.byteLength(char); if (length + size > 75) { out += '\r\n '; length = 1; } out += char; length += size; } return out; }).join('\r\n') + '\r\n';
}

export class Integrations {
  constructor(store, config = process.env, request = fetch) { this.store = store; this.config = config; this.request = request; this.oauthStates = new Map(); this.slackRetry = new Map(); }
  status() {
    return { slack: { configured: Boolean(this.config.SLACK_WEBHOOK_URL) }, google: { configured: Boolean(this.config.GOOGLE_CLIENT_ID && this.config.GOOGLE_CLIENT_SECRET), connected: Boolean(this.store.setting('googleTokens')) } };
  }
  async json(url, options) {
    const response = await this.request(url, { ...options, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`연동 서비스가 요청을 처리하지 못했습니다 (HTTP ${response.status}). 설정과 접근 권한을 확인해 주세요.`);
    return response.status === 204 ? null : response.json();
  }
  beginGoogle() {
    if (!this.status().google.configured) throw new Error('서버의 Google OAuth 설정이 필요합니다. README를 확인해 주세요.');
    const state = randomBytes(32).toString('hex');
    const verifier = randomBytes(32).toString('base64url');
    for (const [key, value] of this.oauthStates) if (value.expires < Date.now()) this.oauthStates.delete(key);
    this.oauthStates.set(state, { verifier, expires: Date.now() + 600000 });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: this.config.GOOGLE_CLIENT_ID, redirect_uri: `${this.config.APP_URL || 'http://localhost:3000'}/api/google/callback`, response_type: 'code', scope: 'https://www.googleapis.com/auth/calendar.events', access_type: 'offline', prompt: 'consent', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    return { state, url: url.toString() };
  }
  async finishGoogle(code, state, cookieState) {
    const session = this.oauthStates.get(state);
    this.oauthStates.delete(state);
    if (!session || session.expires < Date.now() || state !== cookieState || !code) throw new Error('인증 요청이 만료되었습니다. 다시 연결해 주세요.');
    const tokens = await this.json('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: this.config.GOOGLE_CLIENT_ID, client_secret: this.config.GOOGLE_CLIENT_SECRET, redirect_uri: `${this.config.APP_URL || 'http://localhost:3000'}/api/google/callback`, grant_type: 'authorization_code', code_verifier: session.verifier }) });
    this.store.setting('googleTokens', { ...tokens, expiresAt: Date.now() + tokens.expires_in * 1000 });
  }
  async accessToken() {
    let tokens = this.store.setting('googleTokens');
    if (!tokens) throw new Error('먼저 Google 캘린더를 연결해 주세요.');
    if (tokens.expiresAt < Date.now() + 60000) {
      if (!tokens.refresh_token) throw new Error('Google 캘린더를 다시 연결해 주세요.');
      const next = await this.json('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: this.config.GOOGLE_CLIENT_ID, client_secret: this.config.GOOGLE_CLIENT_SECRET, refresh_token: tokens.refresh_token, grant_type: 'refresh_token' }) });
      tokens = { ...tokens, ...next, expiresAt: Date.now() + next.expires_in * 1000 };
      this.store.setting('googleTokens', tokens);
    }
    return tokens.access_token;
  }
  async syncCalendar(task) {
    if (!task.calendar && !task.googleEventId) return task;
    try {
      const token = await this.accessToken();
      const base = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
      // A deterministic event ID makes retries idempotent if a response is lost.
      const eventId = task.googleEventId || task.id.replaceAll('-', '');
      const eventUrl = `${base}/${encodeURIComponent(eventId)}`;
      if (!task.calendar || task.completed) {
        if (task.googleEventId) {
          const response = await this.request(eventUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
          if (!response.ok && ![404, 410].includes(response.status)) throw new Error('캘린더 일정 삭제에 실패했습니다. 다시 시도해 주세요.');
        }
        task.googleEventId = null;
      } else {
        const event = { summary: task.title, description: task.notes, start: { dateTime: task.dueAt, timeZone: task.timezone }, end: { dateTime: new Date(Date.parse(task.dueAt) + 1800000).toISOString(), timeZone: task.timezone }, reminders: { useDefault: false, overrides: task.reminderMinutes === null ? [] : [{ method: 'popup', minutes: task.reminderMinutes }] } };
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        let response = await this.request(eventUrl, { method: 'PUT', headers, body: JSON.stringify(event), signal: AbortSignal.timeout(15000) });
        if (response.status === 404) response = await this.request(base, { method: 'POST', headers, body: JSON.stringify({ ...event, id: eventId }), signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`캘린더 전송 실패 (HTTP ${response.status}). 연결 상태를 확인한 뒤 다시 시도해 주세요.`);
        task.googleEventId = eventId;
      }
      task.calendarError = null;
    } catch (error) { task.calendarError = error.message; }
    // Fetch the latest task: an alarm may have been acknowledged during the request.
    const current = this.store.get(task.id);
    if (!current) return task;
    return this.store.save({ ...current, googleEventId: task.googleEventId, calendarError: task.calendarError });
  }
  async sendSlack(text) {
    if (!this.status().slack.configured) throw new Error('서버에 SLACK_WEBHOOK_URL을 설정해 주세요.');
    const url = new URL(this.config.SLACK_WEBHOOK_URL);
    if (url.protocol !== 'https:' || url.hostname !== 'hooks.slack.com' || !url.pathname.startsWith('/services/')) throw new Error('올바른 Slack Incoming Webhook URL이 필요합니다.');
    const response = await this.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, unfurl_links: false }), signal: AbortSignal.timeout(15000) });
    if (!response.ok || (await response.text()).trim() !== 'ok') throw new Error('Slack 전송에 실패했습니다. Webhook 설정을 확인해 주세요.');
  }
  async deliverSlack() {
    if (this.delivering) return;
    this.delivering = true;
    try {
      for (const task of this.store.due().filter(t => t.slack && !t.slackSentAt)) {
        if ((this.slackRetry.get(task.id) || 0) > Date.now()) continue;
        try {
          const date = new Intl.DateTimeFormat('ko-KR', { timeZone: task.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(task.dueAt));
          await this.sendSlack(`⏰ JYTODO 할 일 알림\n${task.title}\n${date}`);
          const current = this.store.get(task.id);
          if (current && current.reminderAt === task.reminderAt) this.store.save({ ...current, slackSentAt: new Date().toISOString(), slackError: null });
          this.slackRetry.delete(task.id);
        } catch (error) {
          const current = this.store.get(task.id);
          if (current) this.store.save({ ...current, slackError: error.message });
          this.slackRetry.set(task.id, Date.now() + 60000);
        }
      }
    } finally { this.delivering = false; }
  }
}
