import { createHash } from 'node:crypto';
import { cloudBody, validateTask, ValidationError } from './store.js';
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

export class AccountError extends Error { constructor(message,status=400,code){super(message);this.status=status;this.code=code;} }
const authMessages={
  email_not_confirmed:'이메일 인증이 아직 완료되지 않았습니다. 가입할 때 받은 확인 메일의 링크를 누른 뒤 다시 로그인해 주세요.',
  invalid_credentials:'이메일 또는 비밀번호가 올바르지 않습니다.',
  over_email_send_rate_limit:'인증 메일 발송 한도에 도달했습니다. 잠시 후 다시 시도하거나 이미 받은 메일을 확인해 주세요.',
  over_request_rate_limit:'요청이 많습니다. 잠시 후 다시 시도해 주세요.',
  email_address_not_authorized:'이 주소로 인증 메일을 보낼 수 없습니다. 기본 메일 서비스는 프로젝트 팀의 이메일만 허용할 수 있습니다. 운영자의 메일 발송 설정을 확인해 주세요.',
  email_address_invalid:'올바른 이메일 주소를 입력해 주세요.',
};
export function validateProject(url,key) {
  let parsed;try{parsed=new URL(url);}catch{throw new AccountError('Supabase 프로젝트 URL을 확인해 주세요.');}
  if(parsed.protocol!=='https:'||!/^[-a-z0-9]+\.supabase\.co$/.test(parsed.hostname)||parsed.port||parsed.username||parsed.password||!['','/'].includes(parsed.pathname)||parsed.search||parsed.hash)throw new AccountError('https://프로젝트.supabase.co 형식의 프로젝트 URL이 필요합니다.');
  let accepted=/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key||'');
  if(!accepted){try{accepted=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon';}catch{}}
  if(!accepted)throw new AccountError('Publishable 또는 anon 공개 키만 사용해 주세요. 관리자·service_role 키는 사용할 수 없습니다.');
  return {url:parsed.origin,key};
}
function credentials(body){
  if(typeof body?.email!=='string'||body.email.length>254||!/^\S+@\S+\.\S+$/.test(body.email.trim()))throw new AccountError('로그인할 이메일을 확인해 주세요.');
  if(typeof body.password!=='string'||body.password.length<8||body.password.length>128)throw new AccountError('비밀번호는 8~128자로 입력해 주세요.');
  return {email:body.email.trim(),password:body.password};
}
function remoteTask(row,userId){
  if(!row||row.user_id!==userId||!Number.isSafeInteger(row.version)||row.version<1||typeof row.deleted!=='boolean'||!uuid.test(row.id||'')||row.body?.id!==row.id)throw new AccountError('서버 내역 형식을 확인할 수 없습니다.',502);
  try{
    const task=validateTask(row.body);
    for(const key of ['createdAt','reminderAt','notifiedAt'])if(row.body[key]!==null&&!Number.isFinite(Date.parse(row.body[key])))throw new Error();
    if(typeof row.body.completed!=='boolean'||!row.body.createdAt)throw new Error();
    return {...row,body:cloudBody({...task,id:row.id,completed:row.body.completed,createdAt:row.body.createdAt,reminderAt:row.body.reminderAt,notifiedAt:row.body.notifiedAt})};
  }catch{throw new AccountError('서버 할 일의 날짜 또는 필드가 올바르지 않습니다.',502);}
}

export class Accounts {
  constructor(store,config={},request=fetch){
    this.root=store;this.request=request;this.session=null;this.active=null;this.generation=0;this.lastSync=null;this.lastAttempt=0;this.syncError=null;this.syncing=null;this.scope=null;
    const saved=store.setting('cloudProject');
    const url=saved?.url||config.SUPABASE_URL;const key=saved?.key||config.SUPABASE_PUBLISHABLE_KEY;
    this.project=config.CLOUD_REQUIRED==='0'?null:url&&key?validateProject(url,key):null;
    this.required=config.CLOUD_REQUIRED===true||config.CLOUD_REQUIRED==='1';
    this.origin=new URL(config.APP_URL||'http://localhost:3000').origin;
  }
  get store(){return this.project||this.required?this.active:this.root;}
  status(){
    return {configured:Boolean(this.project),required:this.required,projectUrl:this.project?.url||null,user:this.session?{id:this.session.user.id,email:this.session.user.email}:null,authenticated:Boolean(this.session),syncing:Boolean(this.syncing),lastSync:this.lastSync,error:this.syncError,...(this.active?this.active.syncState():{pending:0,conflicts:[]}),localCount:this.root.all().length};
  }
  configure(url,key){
    if(this.session)throw new AccountError('프로젝트를 바꾸려면 먼저 로그아웃해 주세요.',409);
    const project=validateProject(url,key);this.root.setting('cloudProject',project);this.project=project;this.generation++;this.syncError=null;this.lastSync=null;this.onSessionChange?.();return this.status();
  }
  async json(path,options={},token,project=this.project){
    if(!project)throw new AccountError('먼저 Supabase 프로젝트를 연결해 주세요.',503);
    let response;try{response=await this.request(`${project.url}${path}`,{...options,headers:{apikey:project.key,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},signal:AbortSignal.timeout(15000)});}catch{throw new AccountError('동기화 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.',503);}
    if(!response.ok){
      // Never forward upstream bodies: they can contain tokens, URLs or internal details.
      if(path.startsWith('/auth/')){
        let detail;try{detail=await response.json();}catch{}
        const code=detail?.error_code||detail?.code;
        if(Object.hasOwn(authMessages,code))throw new AccountError(authMessages[code],response.status===429?429:400,code);
      }
      if(response.status===401||response.status===403)throw new AccountError('로그인 정보 또는 접근 권한을 확인해 주세요. 이메일 인증이 필요할 수도 있습니다.',401);
      if(response.status===400||response.status===422)throw new AccountError('요청을 처리하지 못했습니다. 이메일·비밀번호와 프로젝트의 인증 설정을 확인해 주세요.');
      if(response.status===429)throw new AccountError('요청이 많습니다. 잠시 후 다시 시도해 주세요.',429);
      throw new AccountError('서버 동기화에 실패했습니다. Supabase 테이블과 권한 설정을 확인해 주세요.',502);
    }
    if(response.status===204)return null;
    return response.json();
  }
  async signUp(body){
    const input=credentials(body);await this.json(`/auth/v1/signup?redirect_to=${encodeURIComponent(`${this.origin}/auth/confirmed`)}`,{method:'POST',body:JSON.stringify(input)});
    // Do not infer whether an address is already registered or persist a session.
    return {message:'이메일 인증을 켠 프로젝트에서는 받은 메일을 확인한 뒤 로그인해 주세요. 이미 가입한 계정은 로그인을 이용해 주세요.'};
  }
  async resendConfirmation(body){
    const email=typeof body?.email==='string'?body.email.trim():'';
    if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw new AccountError('인증 메일을 받을 이메일을 입력해 주세요.');
    await this.json(`/auth/v1/resend?redirect_to=${encodeURIComponent(`${this.origin}/auth/confirmed`)}`,{method:'POST',body:JSON.stringify({type:'signup',email})});
    return {message:'인증이 필요한 가입 요청이 있는 주소라면 확인 메일이 발송됩니다. 받은편지함과 스팸함을 확인해 주세요.'};
  }
  async signIn(body){
    if(this.session)throw new AccountError('먼저 현재 계정에서 로그아웃해 주세요.',409);
    const input=credentials(body),generation=++this.generation,project=this.project;
    const data=await this.json('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify(input)});
    if(generation!==this.generation)throw new AccountError('로그인 요청이 취소되었습니다.',409);
    if(typeof data.access_token!=='string'||!data.access_token||typeof data.refresh_token!=='string'||!data.refresh_token||!uuid.test(data.user?.id||'')||typeof data.user.email!=='string'||!Number.isFinite(data.expires_in))throw new AccountError('로그인 응답을 확인하지 못했습니다.',502);
    const projectId=createHash('sha256').update(project.url).digest('hex');
    this.scope=`${projectId}:${data.user.id}`;
    this.session={access:data.access_token,refresh:data.refresh_token,expires:Date.now()+data.expires_in*1000,user:data.user};
    this.active=this.root.forAccount(this.scope);this.lastSync=null;this.syncError=null;this.lastAttempt=0;
    this.onSessionChange?.();await this.sync(true);return this.status();
  }
  async signOut(){
    const old=this.session,project=this.project;this.generation++;this.session=null;this.active=null;this.scope=null;this.lastSync=null;this.syncError=null;this.syncing=null;
    this.onSessionChange?.();
    if(old)this.json('/auth/v1/logout?scope=local',{method:'POST'},old.access,project).catch(()=>{});
    return this.status();
  }
  async token(generation){
    if(!this.session||generation!==this.generation)throw new AccountError('다시 로그인해 주세요.',401);
    if(this.session.expires<Date.now()+60000){
      const old=this.session;
      const data=await this.json('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:old.refresh})});
      if(generation!==this.generation)throw new AccountError('로그인이 변경되었습니다.',401);
      if(!data.access_token||!data.refresh_token||!Number.isFinite(data.expires_in))throw new AccountError('세션을 갱신하지 못했습니다. 다시 로그인해 주세요.',401);
      this.session={...old,access:data.access_token,refresh:data.refresh_token,expires:Date.now()+data.expires_in*1000};
    }
    return this.session.access;
  }
  async sync(force=false){
    if(!this.active||!this.session)return;
    if(this.syncing)return this.syncing;
    if(!force&&Date.now()-this.lastAttempt<10000)return;
    const generation=this.generation,store=this.active,userId=this.session.user.id;
    this.lastAttempt=Date.now();
    const active=()=>generation===this.generation&&store===this.active;
    const operation=(async()=>{
      try{
        const token=await this.token(generation);if(!active())return;
        for(const item of store.pending()){
          const result=await this.json('/rest/v1/rpc/apply_todo_change',{method:'POST',body:JSON.stringify({p_id:item.id,p_body:cloudBody(JSON.parse(item.body)),p_expected_version:item.remote_version,p_deleted:Boolean(item.deleted)})},token);
          if(!active())return;
          const remote=remoteTask(result.item,userId);
          if(result.applied)store.receive(remote,item.revision);else store.conflict(remote);
        }
        for(let offset=0;offset<=50000;offset+=500){
          const rows=await this.json(`/rest/v1/todo_items?select=*&user_id=eq.${encodeURIComponent(userId)}&order=id.asc&limit=500&offset=${offset}`,{},token);
          if(!active())return;
          if(!Array.isArray(rows))throw new AccountError('동기화 목록을 확인하지 못했습니다.',502);
          for(const row of rows)store.receive(remoteTask(row,userId));
          if(rows.length<500)break;
          if(offset===50000)throw new AccountError('동기화할 내역이 너무 많습니다. 관리자에게 문의해 주세요.',502);
        }
        if(active()){this.lastSync=new Date().toISOString();this.syncError=null;}
      }catch(error){if(active())this.syncError=error instanceof AccountError?error.message:'동기화 중 오류가 발생했습니다. 다시 시도해 주세요.';}
    })();
    this.syncing=operation;
    try{await operation;}finally{if(this.syncing===operation)this.syncing=null;}
  }
}
