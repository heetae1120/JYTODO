import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownWideNarrow, ArrowRight, Bell, BellRing, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, Clock3, Download, ExternalLink, Layers, ListTodo, LoaderCircle, Pencil, Plug, Plus, Search, Settings2, Trash2, X } from 'lucide-react';
import './styles.css';
import './accounts.css';
import { api, post } from './api';
import { AccountGate, AccountBar, AccountBadge } from './accounts';

const colors = ['#ed829b','#efb77b','#dfcc70','#90bdb0','#91b6d8','#b8a4d8'];
const taskColor = task => task.color || (task.priority === 'high' ? colors[0] : colors[5]);
const hasTime = task => task.dueAt.includes('T');
const dateTimeInput = value => `${localDay(value)}T${clock(value)}`;
const isDesktop = Boolean(window.jytodoDesktop);
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const localDay = value => { if(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))return value; const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const clock = value => new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayLabel = value => new Date(value).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
const dateLabel = value => new Date(value).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' });

function Modal({ title, subtitle, onClose, children, className = '' }) {
  const ref = useRef();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const element = ref.current;
    const controls = () => [...element.querySelectorAll('button, input, select, textarea, a[href]')].filter(el => !el.disabled && el.getClientRects().length);
    (element.querySelector('input') || controls()[0])?.focus();
    const handle = event => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const list = controls(); const first = list[0]; const last = list.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handle);
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handle); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}><section ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header className="modal-header"><div><h2 id="modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="닫기" onClick={onClose}><X size={20}/></button></header>{children}</section></div>;
}

function TaskForm({ task, selectedDay, status, onClose, onSave }) {
  const initial = task ? new Date(task.dueAt) : new Date(Date.now()+1800000);
  const [form,setForm]=useState({title:task?.title||'',notes:task?.notes||'',date:task?localDay(task.dueAt):selectedDay,time:clock(initial),timed:task?hasTime(task):false,color:taskColor(task||{}),reminderEnabled:Boolean(task?.reminderAt),reminder:task?.reminderAt?dateTimeInput(task.reminderAt):`${task?localDay(task.dueAt):selectedDay}T${clock(initial)}`,slack:task?.slack||false,calendar:task?.calendar||false});
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const field=(key,value)=>setForm(old=>({...old,[key]:value}));
  function toggleTime(enabled){setForm(old=>({...old,timed:enabled,reminderEnabled:enabled&&old.reminderEnabled,slack:enabled&&old.slack}));}
  async function submit(event){
    event.preventDefault();setSaving(true);setError('');
    try{
      const due=form.timed?new Date(`${form.date}T${form.time}`):null;
      if(due&&!Number.isFinite(due.getTime()))throw new Error('올바른 날짜와 시간을 입력해 주세요.');
      const reminder=form.timed&&form.reminderEnabled?new Date(form.reminder):null;
      if(reminder&&!Number.isFinite(reminder.getTime()))throw new Error('알림 날짜와 시간을 입력해 주세요.');
      await onSave(task?.id,{title:form.title,notes:form.notes,dueAt:due?due.toISOString():form.date,color:form.color,reminderAt:reminder?reminder.toISOString():null,reminderMinutes:null,slack:Boolean(reminder&&form.slack),calendar:form.calendar,timezone});onClose();
    }catch(error){setError(error.message);}finally{setSaving(false);}
  }
  return <Modal title={task?'할 일 수정':'새로운 할 일'} subtitle="하고 싶은 일들을 하나씩 담아 보세요." onClose={()=>!saving&&onClose()}>
    <form onSubmit={submit} className="task-form">
      <label>무엇을 할까요?<input required maxLength={200} placeholder="할 일을 입력해 주세요" value={form.title} onChange={e=>field('title',e.target.value)}/></label>
      <div className="form-row"><label>날짜<input type="date" required value={form.date} onChange={e=>field('date',e.target.value)}/></label><label>시간 설정<select aria-label="시간 설정" value={form.timed?'timed':'none'} onChange={e=>toggleTime(e.target.value==='timed')}><option value="none">지정 안 함</option><option value="timed">시간 지정</option></select></label></div>
      {form.timed&&<label>할 일 시간<input type="time" required value={form.time} onChange={e=>field('time',e.target.value)}/></label>}
      <fieldset className="color-field"><legend>중요도 컬러</legend><div className="color-options">{colors.map(color=><button type="button" key={color} className={`color-chip ${form.color===color?'selected':''}`} style={{'--chip':color}} aria-label={`색상 ${color}`} aria-pressed={form.color===color} onClick={()=>field('color',color)}>{form.color===color&&<Check size={16}/>}</button>)}<label className="custom-color" title="원하는 RGB 색상을 선택하세요"><input type="color" aria-label="사용자 지정 RGB 색상" value={form.color} onChange={e=>field('color',e.target.value)}/><span>직접 선택</span></label><code>{form.color.toUpperCase()}</code></div></fieldset>
      <label>메모 <span className="muted">선택</span><textarea rows={3} maxLength={5000} placeholder="기억해 둘 내용을 적어보세요" value={form.notes} onChange={e=>field('notes',e.target.value)}/></label>
      <div className={`reminder-settings ${!form.timed?'unavailable':''}`}><div className="reminder-toggle"><div><strong><Bell size={17}/>팝업 · 알람</strong><p>{form.timed?'원하는 날짜와 시간에 알려드려요.':'시간을 지정하지 않은 할 일은 알림이 꺼집니다.'}</p></div><label className="toggle"><input type="checkbox" role="switch" aria-label="할 일 알림" disabled={!form.timed} checked={form.timed&&form.reminderEnabled} onChange={e=>setForm(old=>({...old,reminderEnabled:e.target.checked,reminder:e.target.checked?`${old.date}T${old.time}`:old.reminder}))}/><span className="toggle-track"/><span>{form.timed&&form.reminderEnabled?'ON':'OFF'}</span></label></div>{form.timed&&form.reminderEnabled&&<label className="reminder-time">알림 날짜와 시간<input type="datetime-local" required value={form.reminder} onChange={e=>field('reminder',e.target.value)}/></label>}</div>
      <div className="form-integrations"><label className="check-label"><input type="checkbox" disabled={!status.google.connected&&!form.calendar} checked={form.calendar} onChange={e=>field('calendar',e.target.checked)}/><GoogleIcon/>Google 캘린더로 보내기{!status.google.connected&&<small>연결 필요</small>}</label><label className="check-label"><input type="checkbox" disabled={(!status.slack.configured&&!form.slack)||!form.timed||!form.reminderEnabled} checked={form.slack&&form.timed&&form.reminderEnabled} onChange={e=>field('slack',e.target.checked)}/><SlackIcon/>Slack으로 알림 받기{!status.slack.configured&&<small>설정 필요</small>}</label></div>
      <p className="form-note">{timezone} · 알림은 프로그램이 실행 중일 때 동작합니다.</p>
      {error&&<p role="alert" className="error">{error}</p>}
      <footer className="modal-footer"><button type="button" className="button secondary" disabled={saving} onClick={onClose}>취소</button><button className="button primary" disabled={saving}>{saving?<LoaderCircle size={16} className="spin"/>:<Check size={16}/>} {saving?'저장 중…':'할 일 저장'}</button></footer>
    </form>
  </Modal>;
}

function GoogleIcon() { return <span aria-hidden="true" className="google-icon">G</span>; }
function SlackIcon() { return <span aria-hidden="true" className="slack-icon">✣</span>; }

function DesktopSettings({ notify }) {
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { window.jytodoDesktop.settings().then(setSettings).catch(() => notify('프로그램 설정을 읽지 못했습니다.', true)); }, []);
  async function autoLaunch(enabled) {
    setBusy(true);
    try { const value = await window.jytodoDesktop.setAutoLaunch(enabled); setSettings(old => ({ ...old, autoLaunch: value })); }
    catch { notify('자동 실행을 설정하지 못했습니다.', true); }
    finally { setBusy(false); }
  }
  async function openFolder() {
    try { const error = await window.jytodoDesktop.openDataFolder(); if (error) notify('폴더를 열지 못했습니다.', true); }
    catch { notify('폴더를 열지 못했습니다.', true); }
  }
  return <section className="desktop-settings"><h3>Windows 프로그램 설정</h3><p className="help-text">창의 닫기 버튼은 트레이로 숨깁니다. 예약 시간이 되면 창을 다시 띄우고 시스템 알림을 보냅니다. 완전히 종료하려면 트레이 메뉴의 ‘완전히 종료’를 선택하세요.</p>
    <label className="check-label"><input type="checkbox" disabled={busy || !settings?.autoLaunchSupported} checked={settings?.autoLaunch || false} onChange={event => autoLaunch(event.target.checked)}/>Windows 시작 시 자동 실행</label>
    {settings && !settings.autoLaunchSupported && <p className="form-note">자동 실행은 Windows 배포 실행 파일에서 설정할 수 있습니다.</p>}
    {settings && !settings.tray && <p className="error">현재 시스템에서 트레이를 사용할 수 없습니다. 알림을 받으려면 창을 최소화해서 유지하세요.</p>}
    <button className="button secondary" onClick={openFolder}>데이터·연동 설정 폴더 열기 <ExternalLink size={14}/></button>
    <p className="form-note">연동 키는 이 폴더의 integration.env에 저장한 뒤 프로그램을 완전히 종료하고 다시 실행하세요. PC 종료·절전 중에는 알림이 울리지 않으며, 다시 실행하거나 절전에서 복귀하면 미확인 알림을 표시합니다.</p>
  </section>;
}

function Connections({ status, onClose, refresh, notify }) {
  const [busy, setBusy] = useState(false);
  async function bindSlack(enabled) {setBusy(true);try{await api('/auth/slack-device',post({enabled}));await refresh();notify(enabled?'이 계정에서 이 PC의 Slack 연결을 사용합니다.':'이 계정의 Slack 연결을 해제했습니다.');}catch(error){notify(error.message,true);}finally{setBusy(false);}}
  async function testSlack() { setBusy(true); try { await api('/slack/test', post()); notify('Slack으로 테스트 메시지를 보냈습니다.'); } catch(e) { notify(e.message, true); } finally { setBusy(false); } }
  async function disconnect() { setBusy(true); try { await api('/google/disconnect', post()); await refresh(); notify('Google 연결을 해제했습니다. 기존 캘린더 일정은 유지됩니다.'); } catch(e) { notify(e.message, true); } finally { setBusy(false); } }
  return <Modal title="앱 연동" subtitle="일정과 알림을 자주 쓰는 도구에서도 만나보세요." onClose={onClose} className="connections-modal">
    {isDesktop && <><DesktopSettings notify={notify}/><div className="connection-divider"/></>}
    <div className="connection-item"><div className="service-logo"><GoogleIcon/></div><div><h3>Google 캘린더 <span className={`status ${status.google.connected ? 'connected' : ''}`}>{status.google.connected ? '연결됨' : '연결 전'}</span></h3><p>선택한 할 일을 기본 캘린더에 30분 일정으로 전송합니다.</p></div></div>
    <p className="help-text">할 일을 수정하면 전송한 일정도 갱신됩니다. 완료·삭제하면 해당 일정을 제거합니다. 캘린더에서 한 변경은 이 앱으로 가져오지 않습니다.</p>
    {status.google.configured ? status.google.connected ? <button disabled={busy} onClick={disconnect} className="button secondary">연결 해제</button> : <a className="button secondary" href="/api/google/connect">Google 계정 연결 <ExternalLink size={14}/></a> : <div className="setup-note"><strong>연동 정보를 한 번만 설정해 주세요</strong><p>Google Cloud에서 Calendar API를 켜고 OAuth 웹 클라이언트를 만든 뒤, <code>{isDesktop ? 'integration.env' : '.env'}</code>에 <code>GOOGLE_CLIENT_ID</code>와 <code>GOOGLE_CLIENT_SECRET</code>을 등록하세요. 리디렉션 주소는 README에 안내되어 있습니다.</p></div>}
    <div className="connection-divider"/>
    <div className="connection-item"><div className="service-logo"><SlackIcon/></div><div><h3>Slack <span className={`status ${status.slack.configured ? 'connected' : ''}`}>{status.slack.configured ? '설정됨' : '설정 전'}</span></h3><p>선택한 할 일의 알림 시간에 채널로 메시지를 보냅니다.</p></div></div>
    {status.slack.deviceAvailable&&<div className="setup-note"><p>이 PC에 등록된 Webhook 채널로 메시지를 전송합니다. 본인 채널인지 확인한 후 이 계정에 연결해 주세요. 다른 계정의 연결을 자동으로 재사용하지 않습니다.</p><button className="button secondary" disabled={busy} onClick={()=>bindSlack(!status.slack.configured)}>{status.slack.configured?'이 계정의 PC 연결 해제':'이 계정에서 이 PC Slack 연결 사용'}</button></div>}
    {status.slack.configured ? <button disabled={busy} onClick={testSlack} className="button secondary">{busy ? '확인 중…' : '테스트 메시지 보내기'} <ArrowRight size={14}/></button> : <div className="setup-note"><strong>Slack Incoming Webhook을 연결해 주세요</strong><p>알림을 받을 채널의 Incoming Webhook URL을 설정 파일 <code>{isDesktop ? 'integration.env' : '.env'}</code>의 <code>SLACK_WEBHOOK_URL</code>에 등록한 뒤 앱을 재시작하세요. 키를 화면이나 채팅에 입력할 필요는 없습니다.</p></div>}
    <p className="help-text">{isDesktop ? '예약 전송에는 프로그램이 트레이에서 실행 중이어야 합니다.' : '예약 전송에는 서버가 실행 중이어야 합니다.'} 전송 실패는 할 일에 표시되고 1분 간격으로 재시도합니다.</p>
    <div className="export-box"><div><strong>계정 연결 없이 캘린더에 추가</strong><p>ICS 파일을 내려받아 캘린더 앱으로 가져올 수 있어요.</p></div><a className="icon-button" href="/api/calendar.ics" aria-label="캘린더 파일 다운로드"><Download size={20}/></a></div>
  </Modal>;
}

function MonthCalendar({ date, selected, tasks, onSelect, onNavigate }) {
  const year = date.getFullYear(), month = date.getMonth();
  const start = new Date(year, month, 1).getDay();
  const count = new Date(year, month+1, 0).getDate();
  return <div className="month-calendar"><div className="month-heading"><h3>{year}년 {month+1}월</h3><div><button className="icon-button" aria-label="이전 달" onClick={() => onNavigate(new Date(year,month-1,1))}><ChevronLeft size={17}/></button><button className="icon-button" aria-label="다음 달" onClick={() => onNavigate(new Date(year,month+1,1))}><ChevronRight size={17}/></button></div></div><div className="month-grid">{['일','월','화','수','목','금','토'].map((d,i)=><span className="weekday" key={d}>{d}</span>)}{Array.from({length:start},(_,i)=><span key={`blank${i}`}/>)}{Array.from({length:count},(_,i)=>{const day=localDay(new Date(year,month,i+1)); const items=tasks.filter(t=>localDay(t.dueAt)===day && !t.completed);return <button key={day} className={`${selected===day?'selected':''} ${day===localDay(new Date())?'is-today':''}`} onClick={()=>onSelect(day)}><span>{i+1}</span><span className="calendar-dot">{items.length ? '•' : ''}</span></button>;})}</div></div>;
}

function App() {
  const [tasks, setTasks] = useState([]); const [status, setStatus] = useState({ slack: { configured: false }, google: { configured: false, connected: false } });
  const [loading,setLoading] = useState(true); const [loadError,setLoadError] = useState('');
  const [view,setView] = useState('today'); const [selectedDay,setSelectedDay] = useState(localDay(new Date()));
  const [month,setMonth] = useState(new Date()); const [search,setSearch] = useState(''); const [colorFilter,setColorFilter] = useState('all');
  const [form,setForm] = useState(null); const [connections,setConnections] = useState(false); const [toast,setToast] = useState(null); const [deleteTask,setDeleteTask] = useState(null); const [alarms,setAlarms] = useState([]);
  const [busy,setBusy] = useState(false); const [now,setNow] = useState(Date.now()); const [notificationPermission,setNotificationPermission] = useState(isDesktop ? 'granted' : typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const seen = useRef(new Set()); const toastTimer = useRef();
  const notify = (message,error=false) => { setToast({message,error});clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(null),6000); };
  async function refresh() {
    const [items, services] = await Promise.all([api('/tasks'),api('/integrations')]); setTasks(items);setStatus(services);setLoadError('');
    setAlarms(old => old.filter(a => items.some(t=>t.id===a.id && !t.completed && !t.notifiedAt && t.reminderAt===a.reminderAt)));
  }
  useEffect(()=>{
    let cancelled=false;
    async function poll() {
      try {
        await refresh();
        const due=await api('/alarms'); if(cancelled)return;
        const fresh=due.filter(t=>!seen.current.has(`${t.id}:${t.reminderAt}`));
        fresh.forEach(t=>seen.current.add(`${t.id}:${t.reminderAt}`));
        if(fresh.length){setAlarms(old=>[...old,...fresh]);
          if(!isDesktop && typeof Notification!=='undefined' && Notification.permission==='granted'){
            for(const task of fresh){
              const options={body:`${task.title} · ${clock(task.dueAt)}`,tag:`${task.id}:${task.reminderAt}`,icon:'/mascot.png'};
              if('serviceWorker' in navigator) navigator.serviceWorker.ready.then(reg=>reg.showNotification('JYTODO · 할 일 알림',options)).catch(()=>{});
              else try {new Notification('JYTODO · 할 일 알림',options);}catch{}
            }
          }
        }
      }catch(e){if(!cancelled)setLoadError(e.message);}finally{if(!cancelled)setLoading(false);}
    }
    poll();const interval=setInterval(()=>{setNow(Date.now());poll();},3000);
    if(!isDesktop && 'serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
    const params=new URLSearchParams(location.search);const result=params.get('google');
    if(result){notify(result==='connected'?'Google 캘린더가 연결되었습니다.':result==='unconfigured'?'서버의 Google OAuth 설정이 필요합니다.':'Google 연결에 실패했습니다. 다시 시도해 주세요.',result!=='connected');history.replaceState(null,'',location.pathname);}
    return()=>{cancelled=true;clearInterval(interval);clearTimeout(toastTimer.current);};
  },[]);
  async function save(id,data){
    const result=await api(id?`/tasks/${id}`:'/tasks',{method:id?'PUT':'POST',body:JSON.stringify(data)});
    await refresh();notify(result.calendarError?`할 일은 저장했습니다. ${result.calendarError}`:id?'할 일을 수정했습니다.':'새로운 할 일을 추가했습니다.',Boolean(result.calendarError));
  }
  async function action(task,type){
    setBusy(true);
    try{const result=await api(`/tasks/${task.id}/${type}`,post({reminderAt:task.reminderAt}));await refresh();if(result.calendarError)notify(result.calendarError,true);else if(type==='snooze')notify('10분 뒤 다시 알려드릴게요.');}
    catch(e){notify(e.message,true);}finally{setBusy(false);}
  }
  async function remove(){setBusy(true);try{await api(`/tasks/${deleteTask.id}`,{method:'DELETE'});setDeleteTask(null);await refresh();notify('할 일을 삭제했습니다.');}catch(e){notify(e.message,true);}finally{setBusy(false);}}
  async function enableNotifications(){
    if (isDesktop) { try { const supported = await window.jytodoDesktop.testNotification(); notify(supported ? '확인 알림을 보냈습니다. 표시되지 않으면 Windows 알림·방해 금지 설정을 확인해 주세요.' : '현재 OS에서 시스템 알림을 사용할 수 없습니다. 프로그램 팝업은 계속 동작합니다.'); } catch { notify('시스템 알림을 표시하지 못했습니다.', true); } return; }
    if(notificationPermission==='unsupported'){notify('이 브라우저는 시스템 알림을 지원하지 않습니다. 앱 내 팝업은 사용할 수 있어요.');return;}
    try{const permission=await Notification.requestPermission();setNotificationPermission(permission);notify(permission==='granted'?'시스템 알림을 켰습니다. 앱을 열어두면 알림을 받을 수 있어요.':'앱 내 팝업은 계속 표시됩니다. 시스템 알림은 브라우저 사이트 설정에서 허용해 주세요.');}catch{notify('시스템 알림을 켤 수 없습니다. 앱 내 팝업을 이용해 주세요.',true);}
  }
  const today=localDay(now); const pending=tasks.filter(t=>!t.completed); const todayTasks=tasks.filter(t=>localDay(t.dueAt)===today); const completedToday=todayTasks.filter(t=>t.completed).length;
  const filtered=tasks.filter(t=>{
    if(view==='completed'?!t.completed:t.completed)return false;
    if((view==='today'||view==='calendar')&&localDay(t.dueAt)!==selectedDay)return false;
    if(view==='upcoming'&&localDay(t.dueAt)<=today)return false;
    return(colorFilter==='all'||taskColor(t)===colorFilter)&&`${t.title} ${t.notes}`.toLowerCase().includes(search.toLowerCase());
  }).sort((a,b)=>localDay(a.dueAt).localeCompare(localDay(b.dueAt))||(hasTime(a)?a.dueAt:'').localeCompare(hasTime(b)?b.dueAt:''));
  const groups=Object.groupBy(filtered,t=>localDay(t.dueAt));
  const usedColors=[...new Set(tasks.map(taskColor))];
  const titles={today:selectedDay===today?'오늘의 할 일':'선택한 날의 할 일',all:'모든 할 일',upcoming:'다가오는 할 일',calendar:'나의 캘린더',completed:'완료한 할 일'};
  function navigate(key){setView(key);if(key==='today')setSelectedDay(today);}
  const weekStart=new Date(`${selectedDay}T12:00:00`);weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));
  const week=Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(d.getDate()+i);return d;});
  function shiftWeek(offset){const d=new Date(`${selectedDay}T12:00:00`);d.setDate(d.getDate()+offset);setSelectedDay(localDay(d));}

  return <div className="app-shell">
    <aside className="sidebar"><a href="/" className="brand"><img className="brand-mascot" src="/mascot.png" alt=""/>JYTODO<span className="brand-dot">.</span></a><div className="workspace-label">MY LITTLE SPACE <span>나의 작은 공간</span></div>
      <nav aria-label="주 메뉴">{[{key:'today',icon:ListTodo,label:'오늘의 할 일',count:todayTasks.filter(t=>!t.completed).length},{key:'all',icon:Layers,label:'모든 할 일',count:pending.length},{key:'upcoming',icon:Clock3,label:'다가오는 할 일'},{key:'calendar',icon:CalendarDays,label:'캘린더'},{key:'completed',icon:CheckCheck,label:'완료한 할 일'}].map(({key,icon:Icon,label,count})=><button key={key} aria-label={label} className={`nav-item ${view===key?'active':''}`} onClick={()=>navigate(key)}><Icon size={19}/><span>{label}</span>{count!==undefined&&<span className="nav-count">{count}</span>}</button>)}</nav>
      <div className="sidebar-sticker" aria-hidden="true"><span>✦</span><img src="/mascot.png" alt=""/><span>✧</span></div>
      <div className="sidebar-bottom"><button className="nav-item" onClick={()=>setConnections(true)}><Plug size={19}/><span>앱 연동 및 설정</span></button><div className="profile"><img className="avatar" src="/mascot.png" alt=""/><div><strong>나의 워크스페이스</strong><span>나만의 속도로, 하나씩</span></div><AccountBadge/></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumbs">나의 작은 공간 <ChevronRight size={14}/><strong>{titles[view]}</strong></div><div className="top-actions"><span className="today-date">{dayLabel(now)}</span><button className="icon-button" aria-label="연동 설정 열기" title="앱 연동 및 설정" onClick={()=>setConnections(true)}><Settings2 size={19}/></button><button className="icon-button" onClick={enableNotifications} aria-label="시스템 알림 확인" title="시스템 알림 확인"><Bell size={19}/></button><img className="avatar small" src="/mascot.png" alt=""/></div></header>
      <main><div className="page-heading"><div><p className="eyebrow"><span/> A LITTLE PLAN, A LOVELY DAY</p><h1>{titles[view]}<span className="heading-dot">.</span></h1><p className="page-description">나의 하루에, 작은 계획을 더해요.</p></div><button className="button primary add-button" onClick={()=>setForm({})}><Plus size={18}/>할 일 추가</button></div>
        <AccountBar/>
        {loadError&&<div className="error-banner" role="alert">서버에 연결하지 못했습니다. {loadError} <button onClick={()=>refresh().catch(e=>setLoadError(e.message))}>다시 시도</button></div>}
        <div className="summary-grid"><div className="summary-card"><div className="stat-icon pink"><ListTodo size={22}/></div><div><span>오늘의 할 일</span><strong>{todayTasks.length}<small>개</small></strong></div><span className="stat-caption">하나씩 채워 가요</span></div><div className="summary-card"><div className="stat-icon lavender"><CheckCheck size={22}/></div><div><span>완료한 할 일</span><strong>{completedToday}<small>개</small></strong></div><div className="progress-area"><span>{todayTasks.length?Math.round(completedToday/todayTasks.length*100):0}% 완료</span><div className="progress-track"><i style={{width:`${todayTasks.length?completedToday/todayTasks.length*100:0}%`}}/></div></div></div></div>
        <section className="tasks-panel"><div className="panel-header"><div className="panel-tabs"><button className={view!=='calendar'?'selected':''} onClick={()=>{if(view==='calendar')setView('today');}}><ListTodo size={17}/>리스트</button><button className={view==='calendar'?'selected':''} onClick={()=>setView('calendar')}><CalendarDays size={17}/>캘린더</button></div><span className="sort-label"><ArrowDownWideNarrow size={15}/>날짜 · 시간순</span></div>
          {view==='calendar'&&<MonthCalendar date={month} selected={selectedDay} tasks={tasks} onSelect={setSelectedDay} onNavigate={setMonth}/>}
          {view==='today'&&<div className="week-area"><div className="week-title"><div><CalendarDays size={16}/><strong>{new Date(`${selectedDay}T12:00`).getFullYear()}년 {new Date(`${selectedDay}T12:00`).getMonth()+1}월</strong><button onClick={()=>setSelectedDay(today)} className="today-pill">오늘</button></div><div><button className="icon-button" aria-label="이전 주" onClick={()=>shiftWeek(-7)}><ChevronLeft size={17}/></button><button className="icon-button" aria-label="다음 주" onClick={()=>shiftWeek(7)}><ChevronRight size={17}/></button></div></div><div className="week-strip">{week.map(d=>{const day=localDay(d);return <button key={day} aria-label={day} aria-pressed={selectedDay===day} onClick={()=>setSelectedDay(day)} className={`${day===selectedDay?'selected':''} ${day===today?'is-today':''}`}><span>{d.toLocaleDateString('ko-KR',{weekday:'short'})}</span><strong>{d.getDate()}</strong><i className={pending.some(t=>localDay(t.dueAt)===day)?'has-tasks':''}/></button>;})}</div></div>}
          <div className="filter-row"><div className="color-filters" aria-label="컬러별 보기"><button className={`all-colors ${colorFilter==='all'?'active':''}`} onClick={()=>setColorFilter('all')}>전체</button>{usedColors.map(color=><button className={`color-chip ${colorFilter===color?'selected':''}`} style={{'--chip':color}} key={color} aria-label={`${color} 컬러만 보기`} aria-pressed={colorFilter===color} onClick={()=>setColorFilter(colorFilter===color?'all':color)}>{colorFilter===color&&<Check size={13}/>}</button>)}</div><label className="search-box"><Search size={16}/><input aria-label="할 일 검색" placeholder="할 일 검색" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button className="icon-button" aria-label="검색 지우기" onClick={()=>setSearch('')}><X size={14}/></button>}</label></div>
          <div className="task-list">{loading?<div className="empty-state"><LoaderCircle className="spin"/><p>하루를 준비하고 있어요…</p></div>:filtered.length===0?<div className="empty-state"><img src="/mascot.png" alt=""/><h3>{search||colorFilter!=='all'?'조건에 맞는 할 일이 없어요':view==='completed'?'완료한 할 일이 아직 없어요':'아직 적어둔 할 일이 없어요'}</h3><p>{search||colorFilter!=='all'?'검색어나 컬러를 바꾸어 보세요.':'오늘의 작은 계획을 담아 볼까요?'}</p>{view!=='completed'&&<button className="button secondary" onClick={()=>setForm({})}><Plus size={16}/>첫 할 일 추가하기</button>}</div>:Object.entries(groups).map(([date,items])=><div className="day-group" key={date}><div className="day-group-label"><strong>{date===today?'오늘':dateLabel(`${date}T12:00`)}</strong><span>{items.length}개의 할 일</span><div/></div>{items.map(task=><article className={`task-row ${task.completed?'completed':''}`} key={task.id} style={{'--task-color':taskColor(task)}}><button className="complete-button" disabled={busy} onClick={()=>action(task,'complete')} aria-label={task.completed?`${task.title} 완료 취소`:`${task.title} 완료`} aria-pressed={task.completed}>{task.completed?<Check size={16}/>:null}</button><div className="task-main"><button className="task-title" onClick={()=>setForm(task)}>{task.title}</button><div className="task-meta"><span className="task-color-label"><i style={{background:taskColor(task)}}/> {taskColor(task).toUpperCase()}</span><span className={hasTime(task)&&!task.completed&&Date.parse(task.dueAt)<now?'overdue':''}><Clock3 size={13}/>{hasTime(task)?clock(task.dueAt):'시간 지정 안 함'}</span>{task.reminderAt&&hasTime(task)&&<span title={task.notifiedAt?'확인한 알림':`알림 ${new Date(task.reminderAt).toLocaleString('ko-KR')}`}><Bell size={13}/>{dateLabel(task.reminderAt)} {clock(task.reminderAt)}</span>}{task.calendar&&<span title="Google 캘린더"><GoogleIcon/></span>}{task.slack&&<span title="Slack 알림"><SlackIcon/></span>}</div>{task.notes&&<p className="task-note">{task.notes}</p>}{(task.calendarError||task.slackError)&&<p className="task-sync-error">{task.calendarError||task.slackError}{task.calendarError&&<button disabled={busy} onClick={()=>action(task,'sync')}>다시 전송</button>}</p>}</div><div className="task-actions"><button className="icon-button" aria-label={`${task.title} 수정`} onClick={()=>setForm(task)}><Pencil size={16}/></button><button className="icon-button danger" aria-label={`${task.title} 삭제`} onClick={()=>setDeleteTask(task)}><Trash2 size={16}/></button></div></article>)}</div>)}</div>
          <button className="add-inline" onClick={()=>setForm({})}><Plus size={17}/><span>새로운 할 일 추가하기</span></button><div className="list-footer"><span>{filtered.length}개의 할 일</span><span>오늘도 나의 속도로 ♡</span></div>
        </section><footer className="page-footer"><span>작은 계획이 모여, 사랑스러운 하루.</span><span>JYTODO ♡</span></footer>
      </main>
    </div>
    {form&&<TaskForm task={form.id?form:null} selectedDay={selectedDay} status={status} onClose={()=>setForm(null)} onSave={save}/>}
    {connections&&<Connections status={status} onClose={()=>setConnections(false)} refresh={refresh} notify={notify}/>}
    {deleteTask&&<Modal title="할 일을 삭제할까요?" subtitle={`“${deleteTask.title}” 항목은 되돌릴 수 없습니다.`} onClose={()=>!busy&&setDeleteTask(null)}><p className="help-text">연결된 Google 일정도 함께 삭제합니다. 캘린더 전송에 실패하면 할 일은 유지됩니다.</p><div className="modal-footer"><button className="button secondary" onClick={()=>setDeleteTask(null)} disabled={busy}>취소</button><button className="button destructive" onClick={remove} disabled={busy}>{busy?'삭제 중…':'삭제하기'}</button></div></Modal>}
    {!!alarms.length&&!form&&!connections&&!deleteTask&&<Modal title="지금, 할 일 시간이에요" subtitle={`${alarms.length>1?`${alarms.length}개의 알림이 있어요 · `:''}${dateLabel(alarms[0].reminderAt)} ${clock(alarms[0].reminderAt)}`} onClose={()=>!busy&&action(alarms[0],'ack')} className="alarm-modal"><div className="alarm-bell"><BellRing size={30}/></div><h3>{alarms[0].title}</h3>{alarms[0].notes&&<p className="alarm-notes">{alarms[0].notes}</p>}<div className="alarm-buttons"><button className="button secondary" disabled={busy} onClick={()=>action(alarms[0],'snooze')}><Clock3 size={15}/>10분 뒤 다시 알림</button><button className="button primary" disabled={busy} onClick={()=>action(alarms[0],'complete')}><Check size={16}/>완료하기</button></div><button className="text-button" disabled={busy} onClick={()=>action(alarms[0],'ack')}>확인했어요</button></Modal>}
    {toast&&<div className={`toast ${toast.error?'toast-error':''}`} role={toast.error?'alert':'status'}>{toast.error?<Bell size={17}/>:<Check size={17}/>}<span>{toast.message}</span><button aria-label="메시지 닫기" onClick={()=>setToast(null)}><X size={15}/></button></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<AccountGate><App/></AccountGate>);
