import{test}from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{createLibraryApi}from'../src/lib/api-core.ts';
import{resourceAction,mediaHref}from'../src/lib/media-links.ts';
const adminId='11111111-1111-4111-8111-111111111111';
const config={url:'https://project.supabase.co',table:'media',bucket:'media-covers'};
const input={title:'เกมภาษาไทย',type:'เกมการเรียนรู้',subject:'ภาษาไทย',grade:'ป.1',description:'เรียนรู้คำศัพท์',image:config.url+'/storage/v1/object/public/media-covers/'+adminId+'/22222222-2222-4222-8222-222222222222.jpg',url:'https://wordwall.net/resource/12345'};
function setup(){
 const state={user:null,rows:[],isAdmin:true,uploads:[],storageError:null,writeError:null,usageRows:[],usageReadError:null,rpcError:null,rpcCalls:[],rpcData:undefined};
 class Query{
  constructor(table){this.table=table;this.mode='select';this.filter=null;this.start=0;this.end=Infinity;}
  select(){return this}order(){return this}limit(n){this.end=n-1;return this}range(start,end){this.start=start;this.end=end;return this}eq(key,value){this.filter={key,value};return this}
  insert(row){this.mode='insert';this.row=row;return this}update(row){this.mode='update';this.row=row;return this}delete(){this.mode='delete';return this}
  result(){
   if(this.table==='admin_users')return{data:state.user&&state.isAdmin?[{user_id:state.user.id}]:[],error:null};
   if(this.table==='media_usage')return{data:state.usageReadError?null:state.usageRows.filter(r=>!this.filter||r[this.filter.key]===this.filter.value).slice(this.start,this.end+1),error:state.usageReadError};
   if(this.mode!=='select'&&state.writeError)return{data:null,error:state.writeError};
   let selected=state.rows.filter(r=>!this.filter||r[this.filter.key]===this.filter.value);
   if(this.mode==='insert'){const row={...this.row,id:'33333333-3333-4333-8333-333333333333',created_at:'2026-11-08T00:00:00Z'};state.rows.push(row);selected=[row]}
   if(this.mode==='update'){Object.assign(selected[0],this.row)}
   if(this.mode==='delete'){state.rows=state.rows.filter(r=>!selected.includes(r))}
   return{data:selected.slice(this.start,this.end+1),error:null};
  }
  async maybeSingle(){const r=this.result();return{...r,data:r.data?.[0]||null}}async single(){return this.maybeSingle()}then(resolve,reject){return Promise.resolve(this.result()).then(resolve,reject)}
 }
 const client={auth:{async getUser(){return{data:{user:state.user},error:state.user?null:{name:'AuthSessionMissingError'}}},async signInWithPassword({email,password}){if(password!=='test-password')return{error:{status:400}};state.user={id:adminId,email};return{data:{user:state.user},error:null}},async signOut(){state.user=null;return{error:null}}},from:table=>new Query(table),async rpc(name,args){state.rpcCalls.push({name,args});if(state.rpcError)return{data:null,error:state.rpcError};if(state.rpcData!==undefined)return{data:state.rpcData,error:null};if(!state.rows.some(row=>row.id===args.p_media_id))return{data:null,error:{code:'P0002'}};let row=state.usageRows.find(row=>row.media_id===args.p_media_id);if(!row){row={media_id:args.p_media_id,click_count:0};state.usageRows.push(row)}row.click_count=Number(row.click_count)+1;return{data:row.click_count,error:null}},storage:{from:bucket=>({async upload(path,file,options){if(state.storageError)return{error:state.storageError};state.uploads.push({bucket,path,file,options});return{error:null}},getPublicUrl:path=>({data:{publicUrl:config.url+'/storage/v1/object/public/'+bucket+'/'+path}})})}};
 return{state,client,api:createLibraryApi(client,config)};
}
async function signIn(api){await api.login('admin@example.com','test-password')}
test('public reads work while new visitors cannot upload or save',async()=>{const{api}=setup();assert.deepEqual(await api.list(),{items:[],usageAvailable:true});assert.equal((await api.session()).authenticated,false);await assert.rejects(()=>api.save(input),e=>e.code==='ADMIN_AUTH_REQUIRED');await assert.rejects(()=>api.upload(new FormData()),e=>e.code==='ADMIN_AUTH_REQUIRED')});
test('login verifies membership and logout clears access',async()=>{const{api,state}=setup();await assert.rejects(()=>api.login('admin@example.com','wrong'));state.isAdmin=false;await assert.rejects(()=>signIn(api));assert.equal(state.user,null);state.isAdmin=true;await signIn(api);assert.equal((await api.session()).authenticated,true);await api.logout();assert.equal((await api.session()).authenticated,false)});
test('media CRUD preserves external links and uses the verified author ID',async()=>{const{api,state}=setup();await signIn(api);let{item}=await api.save({...input,created_by:'forged-user'});assert.equal(item.url,input.url);assert.equal(state.rows[0].created_by,adminId);assert.equal(item.created,'2026-11-08T00:00:00Z');({item}=await api.save({...item,title:'แก้ไขเกม'},true));assert.equal(item.title,'แก้ไขเกม');assert.equal((await api.list()).items.length,1);await api.remove(item.id);assert.equal((await api.list()).items.length,0)});
test('only real JPG covers are uploaded and image errors keep the session',async()=>{const{api,state}=setup();await signIn(api);const fd=new FormData();fd.set('kind','image');fd.set('file',new File([readFileSync(new URL('../public/hero/teacher-1.jpg',import.meta.url))],'cover.jpg',{type:'image/jpeg'}));const result=await api.upload(fd);assert.match(result.url,/\/media-covers\/.+\.jpg$/);assert.equal(state.uploads[0].options.contentType,'image/jpeg');state.storageError={status:401,message:'row-level security'};await assert.rejects(()=>api.upload(fd),e=>e.code==='STORAGE_ACCESS_DENIED');assert.equal((await api.session()).authenticated,true);for(const[name,type,bytes]of[['cover.png','image/png','png'],['fake.jpg','image/jpeg','not jpeg']]){const bad=new FormData();bad.set('kind','image');bad.set('file',new File([bytes],name,{type}));await assert.rejects(()=>api.upload(bad))}});
test('unsafe links are rejected and RLS failures do not become session expiry',async()=>{const{api,state}=setup();await signIn(api);for(const url of ['','javascript:alert(1)','data:text/html,test'])await assert.rejects(()=>api.save({...input,url}));state.writeError={code:'42501'};await assert.rejects(()=>api.save(input),e=>e.code==='ADMIN_ACCESS_DENIED');assert.equal((await api.session()).authenticated,true)});
test('reading more than 1000 records paginates correctly',async()=>{const{api,state}=setup();state.rows=Array.from({length:1001},(_,i)=>({...input,id:String(i),created_at:'2026-11-08'}));assert.equal((await api.list()).items.length,1001)});
test('resource actions open the correct educational resource type',()=>{for(const[type,label]of[['เกมการเรียนรู้','เล่นเกม'],['วิดีโอ','ดูวิดีโอ'],['ใบงาน','ดาวน์โหลดสื่อ'],['สไลด์การสอน','ดาวน์โหลดสื่อ'],['สื่อสร้างสรรค์','เปิดดู']])assert.equal(resourceAction(type).label,label);assert.equal(mediaHref({url:input.url}),input.url);assert.equal(mediaHref({url:'javascript:alert(1)'}),null)});

test('history and civics can be saved as distinct subjects',async()=>{for(const subject of ['ประวัติศาสตร์','หน้าที่พลเมือง']){const{api}=setup();await signIn(api);const result=await api.save({...input,subject});assert.equal(result.item.subject,subject)}});

const mediaOne='33333333-3333-4333-8333-333333333333',mediaTwo='44444444-4444-4444-8444-444444444444';
test('usage reads join shared totals without counting page loads or untouched media',async()=>{
 const{api,state}=setup();state.rows=[{...input,id:mediaOne,created_at:'2026-11-08'},{...input,id:mediaTwo,created_at:'2026-11-08'}];state.usageRows=[{media_id:mediaOne,click_count:'1245'}];
 const result=await api.list();assert.equal(result.usageAvailable,true);assert.deepEqual(result.items.map(row=>row.usageCount),[1245,0]);await api.list();assert.equal(state.rpcCalls.length,0);
});
test('visitors count each explicit use per media and another client reads the same total',async()=>{
 const{api,state,client}=setup();state.rows=[{...input,id:mediaOne},{...input,id:mediaTwo}];
 assert.deepEqual(await api.recordClick(mediaOne),{count:1});assert.deepEqual(await api.request('/api/media/usage',{method:'POST',body:JSON.stringify({id:mediaOne})}),{count:2});assert.deepEqual(await api.recordClick(mediaTwo),{count:1});
 const otherClient=createLibraryApi(client,config);assert.deepEqual((await otherClient.list()).items.map(row=>row.usageCount),[2,1]);assert.equal(state.user,null);assert.deepEqual(state.rpcCalls[0],{name:'record_media_click',args:{p_media_id:mediaOne}});
});
test('unavailable statistics preserve media access and the admin session',async()=>{
 const{api,state}=setup();state.rows=[{...input,id:mediaOne}];state.usageReadError={code:'PGRST205'};
 const result=await api.list();assert.equal(result.items.length,1);assert.equal(result.usageAvailable,false);assert.equal(result.items[0].usageCount,undefined);
 await signIn(api);state.rpcError={status:401};await assert.rejects(()=>api.recordClick(mediaOne),error=>error.code==='USAGE_UNAVAILABLE');assert.equal((await api.session()).authenticated,true);
});
test('usage counts paginate past the API row limit and preserve zero accurately',async()=>{
 const{api,state}=setup();state.rows=Array.from({length:1001},(_,i)=>({...input,id:String(i)}));state.usageRows=state.rows.map((row,i)=>({media_id:row.id,click_count:i}));
 const result=await api.list();assert.equal(result.items.length,1001);assert.equal(result.items[0].usageCount,0);assert.equal(result.items[1000].usageCount,1000);
});
test('invalid media IDs and invalid server totals never become successful counts',async()=>{
 const{api,state}=setup();await assert.rejects(()=>api.recordClick('not-an-id'));assert.equal(state.rpcCalls.length,0);
 for(const value of [-1,1.5,'',false,null,'invalid',Number.MAX_SAFE_INTEGER+1]){state.rpcData=value;await assert.rejects(()=>api.recordClick(mediaOne),error=>error.code==='USAGE_UNAVAILABLE')}
});
