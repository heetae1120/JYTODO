import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const container=`jytodo-rls-${Date.now()}`;
function docker(args,input){
  const result=spawnSync('docker',args,{input,encoding:'utf8',timeout:180000});
  if(result.error||result.status!==0)throw new Error(result.stderr||result.error?.message||'Docker command failed');
  return result.stdout;
}
const sql=text=>docker(['exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],text);
try{
  docker(['run','--rm','--network','none','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','-d','postgres:17-alpine']);
  let ready=false;
  for(let i=0;i<60;i++){
    const logs=spawnSync('docker',['logs',container],{encoding:'utf8'});
    const result=spawnSync('docker',['exec',container,'pg_isready','-U','postgres'],{stdio:'ignore'});
    if(`${logs.stdout}${logs.stderr}`.includes('init process complete')&&result.status===0){ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!ready)throw new Error('Postgres did not become ready');
  sql(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;
  `);
  sql(readFileSync('supabase/schema.sql','utf8'));
  // Repeat application of the migration: policies and the RPC remain usable.
  sql(readFileSync('supabase/schema.sql','utf8'));
  sql(`
    set role anon;
    do $$begin
      begin perform count(*) from public.todo_items;raise exception 'anonymous read was allowed';exception when insufficient_privilege then null;end;
      begin perform public.apply_todo_change('11111111-1111-4111-8111-111111111111','{}'::jsonb,0,false);raise exception 'anonymous RPC was allowed';exception when insufficient_privilege then null;end;
    end$$;
    reset role;
    set role authenticated;
    select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',false);
    do $$declare result jsonb;begin
      result:=public.apply_todo_change('11111111-1111-4111-8111-111111111111','{"id":"11111111-1111-4111-8111-111111111111","title":"Alice"}',0,false);
      if not (result->>'applied')::boolean or (result->'item'->>'version')::int<>1 then raise exception 'creation failed';end if;
      result:=public.apply_todo_change('11111111-1111-4111-8111-111111111111','{"id":"11111111-1111-4111-8111-111111111111","title":"stale"}',0,false);
      if (result->>'applied')::boolean or result->'item'->'body'->>'title'<>'Alice' then raise exception 'stale create overwrote data';end if;
      begin insert into public.todo_items(user_id,id,body)values('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','{"id":"22222222-2222-4222-8222-222222222222","title":"cross account"}');raise exception 'cross-account write allowed';exception when insufficient_privilege then null;end;
    end$$;
    select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',false);
    do $$declare changed int;begin
      if (select count(*) from public.todo_items)<>0 then raise exception 'Bob could read Alice';end if;
      update public.todo_items set deleted=true where user_id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';get diagnostics changed=row_count;
      if changed<>0 then raise exception 'Bob could modify Alice';end if;
      perform public.apply_todo_change('11111111-1111-4111-8111-111111111111','{"id":"11111111-1111-4111-8111-111111111111","title":"Bob same id"}',0,false);
    end$$;
    select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',false);
    do $$declare result jsonb;begin
      if (select count(*) from public.todo_items)<>1 then raise exception 'account rows not isolated';end if;
      result:=public.apply_todo_change('11111111-1111-4111-8111-111111111111','{"id":"11111111-1111-4111-8111-111111111111","title":"Alice changed"}',1,false);
      if not (result->>'applied')::boolean or (result->'item'->>'version')::int<>2 then raise exception 'update version failed';end if;
      result:=public.apply_todo_change('11111111-1111-4111-8111-111111111111','{"id":"11111111-1111-4111-8111-111111111111","title":"stale update"}',1,false);
      if (result->>'applied')::boolean or result->'item'->'body'->>'title'<>'Alice changed' then raise exception 'stale update was allowed';end if;
      result:=public.apply_todo_change('11111111-1111-4111-8111-111111111111','{"id":"11111111-1111-4111-8111-111111111111","title":"Alice deleted"}',2,true);
      if not(result->'item'->>'deleted')::boolean or (result->'item'->>'version')::int<>3 then raise exception 'tombstone failed';end if;
      begin delete from public.todo_items;raise exception 'physical delete allowed';exception when insufficient_privilege then null;end;
    end$$;
  `);
  console.log('PASS: real Postgres RLS denies anonymous access, isolates accounts, enforces RPC ownership/version conflicts, keeps tombstones and supports repeatable setup.');
}finally{spawnSync('docker',['rm','-f',container],{stdio:'ignore'});}
