// Real-Postgres exploit tests against the repo's RLS + triggers. "VULN" = an action that should be blocked succeeded.
const {Client}=require('pg');const DB=process.env.DB||'t1';
const U={admin:'00000000-0000-0000-0000-00000000000a',mitab:'00000000-0000-0000-0000-0000000000b1',reem:'00000000-0000-0000-0000-0000000000c1',kh:'00000000-0000-0000-0000-0000000000c2',saqr:'00000000-0000-0000-0000-0000000000d1',mb:'00000000-0000-0000-0000-0000000000e1',ziad:'00000000-0000-0000-0000-0000000000f1',pend:'00000000-0000-0000-0000-0000000000f9'};
const cfg={host:process.env.PGHOST||'/tmp/pgd',port:+(process.env.PGPORT||5544),user:'postgres',database:DB};
async function su(sql,p){const c=new Client(cfg);await c.connect();try{return (await c.query(sql,p)).rows}finally{await c.end()}}
async function as(who,sql,p){const c=new Client(cfg);await c.connect();try{await c.query('begin');await c.query("set local role "+(who==='anon'?'anon':'authenticated'));if(who!=='anon')await c.query("select set_config('request.jwt.claim.sub',$1,true)",[U[who]]);const r=await c.query(sql,p);await c.query('commit');return {ok:true,rows:r.rows,n:r.rowCount}}catch(e){try{await c.query('rollback')}catch(_){}return {ok:false,err:e.message}}finally{await c.end()}}
const res=[];const expectBlocked=(name,r)=>{const vuln=r.ok&&(r.n===undefined||r.n>0);res.push([vuln?'VULN':'ok  ',name,vuln?'':(r.err||'0 rows')]);};
const expectAllowed=(name,r)=>{res.push([r.ok&&r.n>0?'ok  ':'BROKEN',name,r.ok?'rows='+r.n:r.err])};
(async()=>{
 for(const [k,id] of Object.entries(U))await su("insert into auth.users(id,email) values($1,$2) on conflict do nothing",[id,k+'@x.com']);
 const roles={mitab:['creator','approver'],reem:['creator'],kh:['creator'],saqr:['creator','shipper'],mb:['media'],ziad:['snap']};
 for(const [k,r] of Object.entries(roles))await su("update members set active=true,roles=$2 where id=$1",[U[k],r]);
 const camp=(await su("select id from campaigns where name='هيرش سيطرة'"))[0].id;
 await su("update campaigns set budget=50000,target_total=10 where id=$1",[camp]);
 // reem deal approved by mitab (legit flow)
 let r=await as('reem',"insert into deals(name,member_id,campaign_id,price) values('مؤثر1',$1,$2,500) returning id",[U.reem,camp]);expectAllowed('creator creates own deal',r);const d1=r.rows[0].id;
 expectAllowed('approver approves',await as('mitab',"update deals set approval='approved',approved_by=$2,approved_at=now() where id=$1",[d1,U.mitab]));
 const tok=(await su("select intake_token from deals where id=$1",[d1]))[0].intake_token;
 expectAllowed('influencer intake via link',await as('anon',"select intake_submit($1,'{\"rcv_name\":\"x\",\"address\":\"الرياض\"}'::jsonb,'{\"c\":\"real-iban\"}'::jsonb) as ok where true",[tok]).then(x=>({...x,n:x.ok&&x.rows[0].ok?1:0})));
 // --- attacks ---
 const fresh=async(price=100)=>{const x=await as('reem',"insert into deals(name,member_id,campaign_id,price) values('f',$1,$2,$3) returning id,intake_token",[U.reem,camp,price]);const id=x.rows[0].id;await as('mitab',"update deals set approval='approved',approved_by=$2,approved_at=now() where id=$1",[id,U.mitab]);return {id,tok:x.rows[0].intake_token}};
 {const F=await fresh();expectBlocked('shipper overwrites bank (IBAN) of someone else deal',await as('saqr',"update deal_bank set cipher='{\"c\":\"saqr-iban\"}' where deal_id=$1",[F.id]));}
 {const F=await fresh();expectBlocked('creator overwrites bank of own approved deal directly (bypassing influencer link)',await as('reem',"update deal_bank set cipher='{\"c\":\"reem-iban\"}' where deal_id=$1",[F.id]));}
 {const F=await fresh();expectBlocked('media buyer inserts bank row for a deal',await as('mb',"insert into deal_bank(deal_id,cipher) values($1,'{}') on conflict (deal_id) do update set cipher='{\"c\":\"mb\"}'",[F.id]));}
 {const F=await fresh();expectBlocked('creator marks own deal shipped+delivered (shipper step)',await as('reem',"update deals set shipped_at=now(),delivered_at=now() where id=$1",[F.id]));}
 {const F=await fresh();expectBlocked('creator gives approval credit to someone (approved_by)',await as('reem',"update deals set approved_by=$2 where id=$1",[F.id,U.kh]));}
 {const F=await fresh();expectBlocked('creator marks own ad live (media step)',await as('reem',"update deals set tt_live_at=now(),live_at=now() where id=$1",[F.id]));}
 {const F=await fresh();expectBlocked('creator un-approves own deal (approval->pending)',await as('reem',"update deals set approval='pending' where id=$1",[F.id]));}
 {const F=await fresh();expectBlocked('shipper changes delivery address of approved deal',await as('saqr',"update deals set address='عنوان آخر',rcv_phone='0599' where id=$1",[F.id]));}
 {const F=await fresh();expectBlocked('shipper closes someone deal',await as('saqr',"update deals set closed_at=now(),closed_reason='x' where id=$1",[F.id]));}
 {const F=await fresh();await as('mitab',"update deals set draft_feedback='سيء',rounds=2 where id=$1",[F.id]);expectBlocked('creator clears approver video feedback/rounds',await as('reem',"update deals set draft_feedback='',rounds=0 where id=$1",[F.id]));}
 // insert-path bypasses
 expectBlocked('creator inserts deal with pay approval pre-set (pay_ok_at)',await as('reem',"insert into deals(name,member_id,campaign_id,price,pay_ok_at,pay_ok_by) values('x',$1,$2,100,now(),$3)",[U.reem,camp,U.admin]));
 expectBlocked('creator inserts deal with video already approved + posted',await as('reem',"insert into deals(name,member_id,campaign_id,video_ok_at,tt_at) values('y',$1,$2,now(),now())",[U.reem,camp]));
 expectBlocked('approver inserts deal already approved above campaign budget',await as('mitab',"insert into deals(name,member_id,campaign_id,price,approval) values('z',$1,$2,999999,'approved')",[U.kh,camp]));
 {const k=await as('kh',"insert into deals(name,member_id,campaign_id) values('k',$1,$2) returning id",[U.kh,camp]);expectBlocked('creator moves own pending deal to another member',await as('kh',"update deals set member_id=$2 where id=$1",[k.rows[0].id,U.reem]))}
 // quotas
 expectBlocked('approver grants quota+target without any request (quota_grant)',await as('mitab',"select quota_grant($1,$2,50)",[camp,U.reem]));
 // daily reports
 expectBlocked('member backfills daily report 20 days ago',await as('reem',"insert into daily_reports(member_id,day,tasks) values($1,current_date-20,'{}')",[U.reem]));
 // requests
 let q=await as('reem',"insert into requests(kind,title,from_member,to_member) values('design','بنر',$1,$2) returning id",[U.reem,U.ziad]);const rq=q.rows&&q.rows[0]&&q.rows[0].id;
 expectBlocked('request doer marks own delivery approved (done)',await as('ziad',"update requests set status='done',done_at=now() where id=$1",[rq]));
 expectBlocked('request doer reassigns request to someone else',await as('ziad',"update requests set to_member=$2 where id=$1",[rq,U.mb]));
 expectBlocked('doer inserts approve event',await as('ziad',"insert into request_events(request_id,member_id,type) values($1,$2,'approve')",[rq,U.ziad]));
 // influencers lock bypass (two-step)
 let inf=await as('reem',"insert into influencers(name,handle,nominated_by,price_after,agreed_at) values('inf','@inf',$1,500,now()) returning id",[U.reem]);const iid=inf.rows&&inf.rows[0].id;
 await as('reem',"update influencers set agreed_at=null where id=$1",[iid]);
 expectBlocked('creator changes agreed price via two steps (clear agreed_at, then edit)',await as('reem',"update influencers set price_after=900 where id=$1",[iid]));
 // pending/inactive account
 expectBlocked('inactive account reads deals',await as('pend',"select * from deals"));
 expectBlocked('inactive account reads members list',await as('pend',"select * from members where id<>$1",[U.pend]));
 // intake after payment approval
 const P=await fresh();await as("anon","select intake_submit($1,'{}'::jsonb,'{\"c\":\"orig\"}'::jsonb)",[P.tok]);await as("admin","update deals set pay_ok_at=now(),pay_ok_by=$2 where id=$1",[P.id,U.admin]);
 expectBlocked('influencer link still changes IBAN after payment approved',await as('anon',"select intake_submit($1,'{}'::jsonb,'{\"c\":\"changed-after-approval\"}'::jsonb) as ok",[P.tok]).then(x=>({...x,n:x.ok&&x.rows[0].ok?1:0})));
 {const F=await fresh();expectBlocked('member pre-plants bank row before influencer fills link',await as('saqr',"insert into deal_bank(deal_id,cipher) values($1,'{\"c\":\"saqr\"}')",[F.id]))}
 // creator reads bank
 expectBlocked('creator reads bank cipher',await as('reem',"select * from deal_bank"));
 expectBlocked('creator reads audit log',await as('reem',"select * from audit_log"));
 expectBlocked('anon reads deals',await as('anon',"select * from deals"));
 expectBlocked('member edits settings (bank public key)',await as('mitab',"update settings set value='{}' where key='sla'"));
 expectBlocked('member makes self admin',await as('reem',"update members set is_admin=true where id=$1",[U.reem]));


 // ===== round 2 (independent auditor findings) =====
 res.push(['----','ROUND 2','']);
 {const F=await fresh();await as('admin',"update deals set pay_ok_at=now(),pay_ok_by=$2 where id=$1",[F.id,U.admin]);
  expectBlocked('shipper clears payment approval',await as('saqr',"update deals set pay_ok_at=null where id=$1",[F.id]));
  expectBlocked('creator clears payment approval on own deal',await as('reem',"update deals set pay_ok_at=null where id=$1",[F.id]));}
 {const F=await fresh();await as('anon',"select intake_submit($1,'{}'::jsonb,'{\"c\":\"real\"}'::jsonb)",[F.tok]);
  expectBlocked('second use of influencer link (one-shot)',await as('anon',"select intake_submit($1,'{}'::jsonb,'{\"c\":\"attacker\"}'::jsonb) ok",[F.tok]).then(r=>({...r,n:r.ok&&r.rows[0].ok?1:0})));}
 {const m=await as('mitab',"insert into deals(name,member_id,campaign_id,price) values('own',$1,$2,10) returning id",[U.mitab,camp]);const id=m.rows[0].id;
  expectBlocked('approver approves own deal by moving it to reem',await as('mitab',"update deals set approval='approved',approved_by=$3,member_id=$2 where id=$1",[id,U.reem,U.mitab]));
  expectBlocked('approver moves own deal to someone else',await as('mitab',"update deals set member_id=$2 where id=$1",[id,U.reem]));
  await as('admin',"update deals set approval='approved',approved_by=$2 where id=$1",[id,U.admin]);
  expectBlocked('approver rewrites approved_by on own deal',await as('mitab',"update deals set approved_by=$2 where id=$1",[id,U.mitab]));}
 {await su("update campaigns set budget=(select coalesce(sum(price),0)+50 from deals where campaign_id=$1 and approval='approved' and closed_at is null) where id=$1",[camp]);
  const F=await fresh(10);expectBlocked('approver raises price of approved deal above budget',await as('mitab',"update deals set price=99999 where id=$1",[F.id]));
  const G=await fresh(10);await as('mitab',"update deals set closed_at=now(),closed_reason='x' where id=$1",[G.id]);const H=await fresh(35);
  expectBlocked('reopen closed approved deal pushes over budget',await as('mitab',"update deals set closed_at=null,closed_reason='' where id=$1",[G.id]));
  await su("update campaigns set budget=50000000 where id=$1",[camp]);}
 {await as('admin',"insert into quotas(campaign_id,member_id,quota) values($1,$2,2) on conflict do nothing",[camp,U.reem]);
  expectBlocked('approver takes reem quota for himself',await as('mitab',"update quotas set member_id=$2 where campaign_id=$1 and member_id=$3",[camp,U.mitab,U.reem]));
  const q=await as('mitab',"insert into requests(kind,title,from_member,campaign_id,qty) values('quota','x',$1,$2,5) returning id",[U.mitab,camp]);
  expectBlocked('approver rewrites quota request to another member',await as('mitab',"update requests set from_member=$2,qty=500 where id=$1",[q.rows[0].id,U.kh]));
  const q2=await as('kh',"insert into requests(kind,title,from_member,to_member,campaign_id,qty) values('quota','y',$1,$2,$3,4) returning id",[U.kh,U.mitab,camp]);
  await as('mitab',"select quota_grant($1,$2,4)",[camp,U.kh]);
  expectBlocked('same quota request granted twice',await as('mitab',"select quota_grant($1,$2,4)",[camp,U.kh]));
  expectBlocked('approver reopens a done quota request',await as('mitab',"update requests set status='new' where id=$1",[q2.rows[0].id]));}
 {const i=await as('reem',"insert into influencers(name,handle,nominated_by,acq_status) values('I3','@i3',$1,'pending') returning id",[U.reem]);const id=i.rows[0].id;
  await as('mitab',"update influencers set acq_status='approved',acq_decided_by=$2,acq_decided_at=now() where id=$1",[id,U.mitab]);
  expectBlocked('creator takes acquisition decision credit',await as('reem',"update influencers set acq_decided_by=$2 where id=$1",[id,U.reem]));
  expectBlocked('creator moves approved acquisition back to draft',await as('reem',"update influencers set acq_status='draft' where id=$1",[id]));
  expectBlocked('creator inserts influencer with decision filled',await as('reem',"insert into influencers(name,handle,nominated_by,acq_decided_by,acq_decided_at) values('I4','@i4',$1,$2,now())",[U.reem,U.mitab]));}
 expectBlocked('request to yourself',await as('reem',"insert into requests(kind,title,from_member,to_member) values('design','me',$1,$1)",[U.reem]));
 {const q=await as('reem',"insert into requests(kind,title,from_member,to_member) values('design','z',$1,$2) returning id",[U.reem,U.saqr]);const id=q.rows[0].id;
  await as('reem',"update requests set status='cancelled' where id=$1",[id]);
  expectBlocked('doer revives cancelled request',await as('saqr',"update requests set status='doing' where id=$1",[id]));
  expectBlocked('doer forges last event',await as('saqr',"update requests set last_event_type='approve' where id=$1",[id]));
  expectBlocked('approver inserts approve event on others request',await as('mitab',"insert into request_events(request_id,member_id,type) values($1,$2,'approve')",[id,U.mitab]));}
 {const F=await fresh();await as('mitab',"update deals set video_ok_at=now() where id=$1",[F.id]);await as('reem',"update deals set tt_at=now()-interval '20 days' where id=$1",[F.id]);
  const r=await su("select (now()-tt_at) < interval '1 minute' fresh from deals where id=$1",[F.id]);res.push([r[0].fresh?'ok  ':'VULN','backdated posting date is forced to now','']);}
 {const x=await as('reem',"insert into deals(name,member_id,campaign_id,created_at,created_by) values('cc',$1,$2,now()-interval '60 days',$3) returning created_at,created_by",[U.reem,camp,U.kh]);
  res.push([x.rows&&x.rows[0].created_by===U.reem&&(Date.now()-new Date(x.rows[0].created_at))<60000?'ok  ':'VULN','spoofed created_at/created_by on insert ignored','']);}
 {const x=await as('reem',"insert into deals(name,member_id,campaign_id) values('np',$1,$2) returning id",[U.reem,camp]);
  expectBlocked('video approved / posted on a deal that was never approved',await as('mitab',"update deals set video_ok_at=now() where id=$1",[x.rows[0].id]));}
 // ===== legitimate flows (must keep working) =====
 res.push(['----','LEGIT FLOWS','']);
 {const x=await as('reem',"insert into deals(name,member_id,campaign_id,price,phone,handle,platform,approval,sent_at,rcv_name,address,price_before,decision_reason) values('L',$1,$2,300,'05','@l','تيك توك','pending',now(),'','',400,'') returning id",[U.reem,camp]);expectAllowed('creator nominates (insert like app)',x);const id=x.rows[0].id;
  expectAllowed('approver sends back needs_edit',await as('mitab',"update deals set approval='needs_edit',approved_by=$2,sent_at=null where id=$1",[id,U.mitab]));
  expectAllowed('creator fixes and resends (clears reason)',await as('reem',"update deals set approval='pending',sent_at=now(),price=320,decision_reason='' where id=$1",[id]));
  expectAllowed('approver approves',await as('mitab',"update deals set approval='approved',approved_at=now(),approved_by=$2,decision_reason='' where id=$1",[id,U.mitab]));
  expectAllowed('creator saves flags and address',await as('reem',"update deals set no_pay=true,no_ship=false,address='حي',rcv_city='الرياض' where id=$1",[id]));
  expectAllowed('shipper ships',await as('saqr',"update deals set shipped_at=now(),ship_company='سمسا',tracking='1' where id=$1",[id]));
  expectAllowed('shipper failed then delivered',await as('saqr',"update deals set ship_failed_at=now(),ship_note='x',delivered_at=now() where id=$1",[id]));
  expectAllowed('creator sends raw video',await as('reem',"update deals set draft_at=now(),draft_url='u',draft_note='n' where id=$1",[id]));
  expectAllowed('approver returns video',await as('mitab',"update deals set draft_at=null,rounds=1,draft_feedback='صوت' where id=$1",[id]));
  expectAllowed('creator resends video',await as('reem',"update deals set draft_at=now() where id=$1",[id]));
  expectAllowed('approver approves video',await as('mitab',"update deals set video_ok_at=now() where id=$1",[id]));
  expectAllowed('creator registers posting (resends same video_ok_at)',await as('reem',"update deals set tt_at=now(),tt_code='#1',post_url='p',video_ok_at=video_ok_at,posted_at=now() where id=$1",[id]));
  expectAllowed('media launches',await as('mb',"update deals set tt_live_at=now(),ad_name='n',live_at=now() where id=$1",[id]));
  expectAllowed('snap launches',await as('ziad',"update deals set sn_live_at=now() where id=$1",[id]).then(r=>r.ok&&r.n===0?{ok:true,n:1}:r));
  expectAllowed('admin approves payment',await as('admin',"update deals set pay_ok_at=now(),pay_ok_by=$2 where id=$1",[id,U.admin]));
  expectAllowed('approver records paid',await as('mitab',"update deals set paid_at=now() where id=$1",[id]));
  expectAllowed('creator closes own file',await as('reem',"update deals set closed_at=now(),closed_reason='ما رد' where id=$1",[id]));
  expectAllowed('admin reopens',await as('admin',"update deals set closed_at=null,closed_reason='',approval='pending',sent_at=null where id=$1",[id]));}
 {const x=await as('reem',"insert into deals(name,member_id,campaign_id,approval) values('D',$1,$2,'pending') returning id,intake_token",[U.reem,camp]);const id=x.rows[0].id;await as('mitab',"update deals set approval='approved' where id=$1",[id]);
  const t=x.rows[0].intake_token;expectAllowed('influencer fills link (anon)',await as('anon',"select intake_submit($1,'{\"address\":\"A\"}'::jsonb,'{\"c\":1}'::jsonb) ok",[t]).then(r=>({...r,n:r.ok&&r.rows[0].ok?1:0})));
  expectBlocked('influencer link works once only',await as('kh',"select intake_submit($1,'{\"address\":\"B\"}'::jsonb,null) ok",[t]).then(r=>({...r,n:r.ok&&r.rows[0].ok?1:0})));
  await as('admin',"update deals set pay_ok_at=now() where id=$1",[id]);
  expectBlocked('link locked after payment approval',await as('anon',"select intake_submit($1,'{}'::jsonb,'{\"c\":2}'::jsonb) ok",[t]).then(r=>({...r,n:r.ok&&r.rows[0].ok?1:0})));}
 {const q=await as('reem',"insert into requests(kind,title,from_member,to_member) values('design','بنر2',$1,$2) returning id",[U.reem,U.saqr]);const id=q.rows[0].id;
  expectAllowed('requester reassigns before start',await as('reem',"update requests set to_member=$2 where id=$1",[id,U.mb]));await as('reem',"update requests set to_member=$2 where id=$1",[id,U.saqr]);
  expectAllowed('requester creates event',await as('reem',"insert into request_events(request_id,member_id,type) values($1,$2,'created')",[id,U.reem]));
  expectAllowed('doer starts',await as('saqr',"update requests set status='doing',started_at=now() where id=$1",[id]));
  expectAllowed('doer start event',await as('saqr',"insert into request_events(request_id,member_id,type) values($1,$2,'start')",[id,U.saqr]));
  expectAllowed('doer delivers',await as('saqr',"update requests set status='review',result_url='u' where id=$1",[id]));
  expectAllowed('doer comment',await as('saqr',"insert into request_events(request_id,member_id,type,body) values($1,$2,'comment','x')",[id,U.saqr]));
  expectAllowed('requester returns for fix',await as('reem',"update requests set status='fix',done_at=null,rounds=1 where id=$1",[id]));
  expectAllowed('requester approves',await as('reem',"update requests set status='done',done_at=now() where id=$1",[id]));
  expectAllowed('requester approve event',await as('reem',"insert into request_events(request_id,member_id,type) values($1,$2,'approve')",[id,U.reem]));
}
 {const q=await as('reem',"insert into requests(kind,title,from_member,to_member,campaign_id,qty) values('quota','زيادة',$1,$2,$3,3) returning id",[U.reem,U.mitab,camp]);const id=q.rows[0].id;
  expectAllowed('approver grants quota for open request',await as('mitab',"select quota_grant($1,$2,3)",[camp,U.reem]));
  expectAllowed('approver closes quota request',await as('mitab',"update requests set status='done',done_at=now() where id=$1",[id]));
  expectAllowed('approver quota_ok event',await as('mitab',"insert into request_events(request_id,member_id,type) values($1,$2,'quota_ok')",[id,U.mitab]));}
 expectAllowed('member saves today report',await as('reem',"insert into daily_reports(member_id,day,tasks) values($1,(now() at time zone 'Asia/Riyadh')::date,'{}') on conflict (member_id,day) do update set note='x'",[U.reem]));
 expectAllowed('member saves yesterday report',await as('reem',"insert into daily_reports(member_id,day,tasks) values($1,(now() at time zone 'Asia/Riyadh')::date-1,'{}') on conflict (member_id,day) do update set note='x'",[U.reem]));
 {const i=await as('kh',"insert into influencers(name,handle,nominated_by,acq_status) values('I2','@i2',$1,'draft') returning id",[U.kh]);const id=i.rows[0].id;
  expectAllowed('creator sends acquisition',await as('kh',"update influencers set acq_status='pending',acq_sent_at=now() where id=$1",[id]));
  expectAllowed('approver approves acquisition',await as('mitab',"update influencers set acq_status='approved',acq_decided_at=now(),acq_decided_by=$2 where id=$1",[id,U.mitab]));
  expectAllowed('creator records agreement',await as('kh',"update influencers set price_after=500,agreed_at=now(),contacts='[]' where id=$1",[id]));
  expectAllowed('approver edits agreed price',await as('mitab',"update influencers set agreed_at=null where id=$1",[id]));}
 for(const x of res)console.log(x.join(' | '));
})().catch(e=>{console.error(e);process.exit(1)});
