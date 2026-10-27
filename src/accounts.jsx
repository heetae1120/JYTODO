import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Cloud, CloudOff, Download, KeyRound, LoaderCircle, LogOut, RefreshCw, Settings2, ShieldCheck, UserRound, X } from 'lucide-react';
import { api, post } from './api';
const AccountContext=createContext(null);
function ConflictDetails({task}){
  return <div className="conflict-details"><span>분류: {{work:'업무',personal:'개인',study:'공부'}[task.category]} · {task.priority==='high'?'중요':'보통'}</span><span>알림: {task.reminderAt?new Date(task.reminderAt).toLocaleString('ko-KR'):'없음'}{task.notifiedAt?' · 확인함':''}</span><span>캘린더: {task.calendar?'선택':'해제'} · Slack: {task.slack?'선택':'해제'}</span></div>;
}

function AccountDialog({title,onClose,children}){
  const ref=useRef();
  useEffect(()=>{ref.current.showModal();},[]);
  return <dialog className="account-dialog" ref={ref} onCancel={event=>{event.preventDefault();onClose();}} aria-labelledby="account-title"><header><h2 id="account-title">{title}</h2><button className="icon-button" aria-label="계정 창 닫기" onClick={onClose}><X size={19}/></button></header>{children}</dialog>;
}

function ProjectForm({onDone,onClose}){
  const [url,setUrl]=useState(''),[key,setKey]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(event){event.preventDefault();setBusy(true);setError('');try{const state=await api('/auth/configure',post({url,key}));onDone(state);}catch(error){setError(error.message);}finally{setBusy(false);}}
  return <form onSubmit={submit} className="project-form"><p>처음 한 번만 동기화 공간을 연결하세요. 연결 후에는 어느 PC에서든 같은 이메일로 내 할 일을 불러올 수 있습니다.</p>
    <ol><li><a href="https://supabase.com/dashboard/new" target={window.jytodoDesktop?'_self':'_blank'} rel="noreferrer">Supabase에서 새 무료 프로젝트 만들기 ↗</a></li><li>SQL Editor에서 <a href="https://github.com/heetae1120/JYTODO/blob/main/supabase/schema.sql" target={window.jytodoDesktop?'_self':'_blank'} rel="noreferrer">데이터베이스 설정 SQL ↗</a>을 실행하세요.</li><li>프로젝트 설정의 URL과 공개 API 키를 아래에 입력하세요.</li><li>이메일 인증을 켰다면 Auth의 Redirect URLs에 <code>{location.origin}/auth/confirmed</code>를 등록하세요.</li></ol>
    <label>프로젝트 URL<input type="url" required value={url} onChange={event=>setUrl(event.target.value)} placeholder="https://프로젝트.supabase.co" autoComplete="off"/></label>
    <label>Publishable / anon 공개 키<textarea required rows={3} value={key} onChange={event=>setKey(event.target.value)} placeholder="sb_publishable_… 또는 anon 키" autoComplete="off"/></label>
    <p className="form-note">관리자·service_role·sb_secret 키는 사용하지 않습니다. 이 공개 연결 정보는 프로그램 배포 파일에 포함할 수도 있습니다.</p>
    {error&&<p className="error" role="alert">{error}</p>}
    <div className="account-actions">{onClose&&<button type="button" className="button secondary" onClick={onClose} disabled={busy}>취소</button>}<button className="button primary" disabled={busy}>{busy?<LoaderCircle size={16} className="spin"/>:<Cloud size={16}/>}동기화 공간 연결</button></div>
  </form>;
}

function Login({state,onChange}){
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[mode,setMode]=useState('login'),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[configure,setConfigure]=useState(!state.configured);
  async function submit(event){
    event.preventDefault();setBusy(true);setError('');setMessage('');
    try{
      if(mode==='signup'){const result=await api('/auth/signup',post({email,password}));setMessage(result.message);setMode('login');}
      else onChange(await api('/auth/login',post({email,password})));
    }catch(error){setError(error.message);}finally{setPassword('');setBusy(false);}
  }
  return <div className="login-page"><div className="login-story"><a className="login-brand" href="/"> <span><Check size={27}/></span>JYTODO.</a><span className="login-eyebrow">YOUR DAY, WHEREVER YOU ARE</span><h1>어느 PC에서든,<br/>나의 하루를 이어서.</h1><p>같은 계정으로 로그인하면<br/>정리해 둔 할 일과 일정을 그대로 만나요.</p><div className="login-art"><div/><div/><span><Check size={68}/></span></div><div className="login-assurance"><ShieldCheck size={18}/><span>계정별로 구분되는 나만의 할 일</span></div></div><main className="login-content"><section className="login-card"><div className="login-lock"><KeyRound size={22}/></div><h2>{configure?'동기화 공간 준비':mode==='signup'?'나의 계정 만들기':'다시 만나 반가워요'}</h2><p className="login-subtitle">{configure?'프로젝트 설정 후 계정을 만들어 주세요.':'프로그램을 실행할 때마다 로그인해 주세요.'}</p>
    {configure?<ProjectForm onDone={value=>{onChange(value);setConfigure(false);}} onClose={state.configured?()=>setConfigure(false):undefined}/>:<><form onSubmit={submit} className="login-form"><label>아이디 (이메일)<input type="email" required autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} placeholder="your@email.com" maxLength={254}/></label><label>비밀번호<input type="password" required minLength={8} maxLength={128} autoComplete={mode==='signup'?'new-password':'current-password'} value={password} onChange={event=>setPassword(event.target.value)} placeholder="8자 이상의 비밀번호"/></label>{error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status" className="account-message">{message}</p>}<button className="button primary" disabled={busy}>{busy?<LoaderCircle size={17} className="spin"/>:null}{busy?'확인 중…':mode==='signup'?'회원가입':'로그인'}<ArrowRight size={17}/></button></form><div className="login-switch"><span>{mode==='signup'?'이미 계정이 있나요?':'처음 사용하시나요?'}</span><button onClick={()=>{setMode(mode==='login'?'signup':'login');setPassword('');setError('');setMessage('');}} disabled={busy}>{mode==='signup'?'로그인':'회원가입'}</button></div><p className="login-private">이 PC에는 로그인 상태를 저장하지 않습니다.<br/>완전히 종료한 뒤에는 다시 로그인해야 합니다.</p><button className="project-change" onClick={()=>setConfigure(true)} disabled={busy}><Settings2 size={12}/>동기화 공간 설정</button></>}
  </section><footer>작은 계획을 모아, 더 나다운 하루.</footer></main></div>;
}

export function AccountGate({children}){
  const [state,setState]=useState(null),[error,setError]=useState('');
  async function refresh(){try{const value=await api('/auth/status');setState(value);setError('');return value;}catch(error){setError(error.message);}}
  useEffect(()=>{
    if(/(?:access_token|refresh_token|error_description)=/.test(location.hash))history.replaceState(null,'',location.pathname+location.search);
    refresh();const timer=setInterval(refresh,2000);return()=>clearInterval(timer);
  },[]);
  if(!state)return <div className="account-loading"><Cloud size={35}/><h2>나의 하루를 준비하고 있어요</h2>{error?<><p role="alert">{error}</p><button className="button secondary" onClick={refresh}>다시 시도</button></>:<LoaderCircle className="spin" size={20}/>}</div>;
  if((state.configured||state.required)&&!state.user)return <Login state={state} onChange={setState}/>;
  return <AccountContext.Provider value={{state,setState,refresh,error}}>{React.cloneElement(children,{key:`${state.projectUrl||'local'}:${state.user?.id||'local'}`})}</AccountContext.Provider>;
}

export function AccountBadge(){const {state}=useContext(AccountContext);return <span className="local-badge">{state.configured?'CLOUD':'LOCAL'}</span>;}

export function AccountBar(){
  const {state,setState,refresh,error:connectionError}=useContext(AccountContext);
  const [dialog,setDialog]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function perform(path,body){setBusy(true);setError('');try{const result=await api(path,post(body));setState(result);return result;}catch(error){setError(error.message);}finally{setBusy(false);}}
  return <><section className={`account-bar ${state.error||connectionError?'account-offline':''}`} aria-label="계정 동기화 상태"><div className="account-bar-icon">{state.configured?<Cloud size={18}/>:<CloudOff size={18}/>}</div><div className="account-bar-copy"><strong>{state.user?.email||'이 PC에만 저장 중'}</strong><span>{connectionError||state.error||(state.syncing?'동기화 중…':!state.configured?'계정을 연결하면 다른 PC에서도 이어서 사용할 수 있어요.':state.conflicts.length?`${state.conflicts.length}개 항목의 수정 내용을 선택해 주세요.`:state.pending?`${state.pending}개 변경 내용을 보내는 중…`:state.lastSync?'모든 변경 내용이 동기화되었습니다.':'서버 내역을 확인하고 있어요.')}</span></div><div className="account-bar-actions">{state.configured&&<button className="icon-button" title="지금 동기화" aria-label="지금 동기화" disabled={busy||state.syncing} onClick={()=>perform('/auth/sync')}><RefreshCw size={16} className={state.syncing?'spin':''}/></button>}<button className="button secondary" onClick={()=>{setError('');setMessage('');setDialog(state.configured?'account':'project');}}>{state.configured?<><UserRound size={14}/>계정 관리</>:<><Cloud size={14}/>계정 연결</>}</button></div></section>
    {error&&!dialog&&<p className="error" role="alert">{error}</p>}
    {dialog==='project'&&<AccountDialog title="계정 동기화 연결" onClose={()=>!busy&&setDialog(null)}><ProjectForm onDone={value=>{setState(value);setDialog(null);}} onClose={()=>setDialog(null)}/></AccountDialog>}
    {dialog==='account'&&<AccountDialog title="내 계정과 동기화" onClose={()=>!busy&&setDialog(null)}><div className="account-identity"><UserRound size={25}/><div><strong>{state.user.email}</strong><span>같은 이메일로 다른 PC에서 로그인하세요.</span></div></div><p className="help-text">{state.lastSync?`마지막 동기화: ${new Date(state.lastSync).toLocaleString('ko-KR')}`:'첫 동기화를 기다리고 있습니다.'}</p>{state.error&&<p className="error">{state.error}</p>}
      {state.conflicts.map(conflict=><div className="conflict-card" key={conflict.id}><h3>두 PC에서 변경한 할 일이 있어요</h3><div className="conflict-options"><div><span>이 PC의 내역{conflict.localDeleted?' · 삭제됨':''}</span><strong>{conflict.local.title}</strong><p>{conflict.local.notes}</p><small>{new Date(conflict.local.dueAt).toLocaleString('ko-KR')} · {conflict.local.completed?'완료':'미완료'}</small><ConflictDetails task={conflict.local}/><button className="button secondary" disabled={busy} onClick={()=>perform('/auth/resolve',{id:conflict.id,choice:'local'})}>이 PC 내역 사용</button></div><div><span>서버의 내역{conflict.remote.deleted?' · 삭제됨':''}</span><strong>{conflict.remote.body.title}</strong><p>{conflict.remote.body.notes}</p><small>{new Date(conflict.remote.body.dueAt).toLocaleString('ko-KR')} · {conflict.remote.body.completed?'완료':'미완료'}</small><ConflictDetails task={conflict.remote.body}/><button className="button secondary" disabled={busy} onClick={()=>perform('/auth/resolve',{id:conflict.id,choice:'remote'})}>서버 내역 사용</button></div></div><p className="form-note">선택한 내역으로 동기화합니다. 선택하지 않은 수정 내용은 덮어써집니다.</p></div>)}
      {state.localCount>0&&<div className="import-local"><h3>이 PC의 기존 할 일 가져오기</h3><p>계정 없이 저장한 {state.localCount}개 항목을 지금 계정으로 복사합니다. 기존 내역은 지우지 않으며, 자동으로 업로드하지 않습니다. 외부 서비스 알림은 다시 선택해 주세요.</p><button className="button secondary" disabled={busy} onClick={()=>setDialog('import')}><Download size={14}/>가져오기 확인</button></div>}
      <div className="account-actions"><button className="button secondary" disabled={busy} onClick={()=>perform('/auth/sync')}><RefreshCw size={14}/>지금 동기화</button><button className="button secondary" disabled={busy} onClick={()=>setDialog('logout')}><LogOut size={14}/>로그아웃</button></div>
      {error&&<p className="error" role="alert">{error}</p>}{message&&<p className="account-message">{message}</p>}
    </AccountDialog>}
    {dialog==='import'&&<AccountDialog title="기존 내역을 이 계정에 복사할까요?" onClose={()=>!busy&&setDialog('account')}><p className="help-text">{state.localCount}개 항목을 {state.user.email} 계정에 업로드합니다. 공용 PC라면 다른 사람의 내역이 아닌지 확인해 주세요.</p>{error&&<p className="error" role="alert">{error}</p>}<div className="account-actions"><button className="button secondary" disabled={busy} onClick={()=>setDialog('account')}>취소</button><button className="button primary" disabled={busy} onClick={async()=>{const result=await perform('/auth/import-local');if(result){setMessage(`${result.count}개 항목을 가져왔습니다.`);setDialog('account');}}}>이 계정으로 가져오기</button></div></AccountDialog>}
    {dialog==='logout'&&<AccountDialog title="로그아웃할까요?" onClose={()=>!busy&&setDialog('account')}><p className="help-text">{state.pending?`아직 ${state.pending}개 변경 내용이 서버에 저장되지 않았습니다. 이 PC에 보관되며 같은 계정으로 다시 로그인하면 동기화합니다.`:'서버에 저장된 내역은 다음 로그인 때 불러옵니다.'} 로그아웃하면 이 PC의 예약 알림도 멈춥니다.</p><div className="account-actions"><button className="button secondary" disabled={busy} onClick={()=>setDialog('account')}>취소</button><button className="button primary" disabled={busy} onClick={()=>perform('/auth/logout')}>로그아웃하기</button></div></AccountDialog>}
  </>;
}
