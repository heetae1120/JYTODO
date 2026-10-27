// Isolated Auth/PostgREST test double. No requests reach a real account.
export const project={SUPABASE_URL:'https://test-project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_example_only_not_a_real_key'};
export const userIds={alice:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',bob:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'};
export function fakeSupabase(){
  const rows=new Map(),tokens=new Map();let sequence=0;
  const service={rows,offline:false,afterPush:null,holdPull:null,unconfirmed:false,resends:0};
  const session=name=>{const access=`test-access-${name}-${++sequence}`,refresh=`test-refresh-${name}-${sequence}`;tokens.set(access,name);tokens.set(refresh,name);return {access_token:access,refresh_token:refresh,expires_in:3600,user:{id:userIds[name],email:`${name}@example.test`}};};
  service.fetch=async(address,options={})=>{
    if(service.offline)throw new Error('offline');
    const url=new URL(address),body=options.body?JSON.parse(options.body):{};
    if(url.pathname==='/auth/v1/signup')return Response.json({user:{email:body.email}});
    if(url.pathname==='/auth/v1/resend'){service.resends++;return Response.json({});}
    if(url.pathname==='/auth/v1/token'){
      if(url.searchParams.get('grant_type')==='refresh_token'){const name=tokens.get(body.refresh_token);return name?Response.json(session(name)):Response.json({error:'expired'},{status:401});}
      const name=body.email?.split('@')[0];
      if(service.unconfirmed&&userIds[name]&&body.password==='test-password')return Response.json({error_code:'email_not_confirmed',msg:'Email not confirmed'},{status:400});
      return userIds[name]&&body.password==='test-password'?Response.json(session(name)):Response.json({error:'private upstream detail'},{status:400});
    }
    const name=tokens.get(options.headers?.Authorization?.replace('Bearer ',''));
    if(!name)return Response.json({error:'unauthorized'},{status:401});
    if(url.pathname==='/auth/v1/logout')return new Response(null,{status:204});
    if(url.pathname==='/rest/v1/rpc/apply_todo_change'){
      const user_id=userIds[name],key=`${user_id}:${body.p_id}`,old=rows.get(key);
      if(old&&old.version!==body.p_expected_version)return Response.json({applied:false,item:structuredClone(old)});
      if(!old&&body.p_expected_version!==0)return Response.json({error:'missing'},{status:409});
      const item={user_id,id:body.p_id,body:body.p_body,version:(old?.version||0)+1,deleted:body.p_deleted,updated_at:new Date().toISOString()};rows.set(key,item);
      if(service.afterPush)await service.afterPush(item);
      return Response.json({applied:true,item:structuredClone(item)});
    }
    if(url.pathname==='/rest/v1/todo_items'){
      const snapshot=[...rows.values()].filter(row=>row.user_id===userIds[name]).sort((a,b)=>a.id.localeCompare(b.id));
      if(service.holdPull)await service.holdPull();
      const offset=Number(url.searchParams.get('offset')||0);return Response.json(structuredClone(snapshot.slice(offset,offset+500)));
    }
    return Response.json({error:'unknown route'},{status:404});
  };
  return service;
}
