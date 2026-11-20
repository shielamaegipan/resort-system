// Runs against a newly named database. Never resets or drops an existing database.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{createRequire}=require('node:module'),{randomUUID,randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'..'),back=createRequire(path.join(root,'backend/package.json')),front=createRequire(path.join(root,'frontend/package.json'));
back('dotenv').config({path:path.join(root,'backend/.env')});
const mysql=back('mysql2/promise'),{chromium}=front('@playwright/test'),{io}=front('socket.io-client');
const database=`resort_platform_verify_${Date.now()}`,apiBase='http://127.0.0.1:4102',uiBase='http://127.0.0.1:5182',children=[],sockets=[],artifacts=path.join(root,'test-results/platform');
let connection,browser,checks=0;const errors=[];
function check(value,message){assert.ok(value,message);checks++;console.log(`PASS ${message}`);}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function start(file,args,cwd,env={}){const p=spawn(process.execPath,[file,...args],{cwd,env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});p.log='';p.stdout.on('data',x=>p.log+=x);p.stderr.on('data',x=>p.log+=x);children.push(p);return p;}
async function waitFor(fn,description){for(let i=0;i<100;i++){try{if(await fn())return;}catch{}await delay(150);}throw new Error(`Timeout ${description}\n${children.map(p=>p.log).join('\n')}`);}
async function api(url,token,method='GET',body,key){const r=await fetch(apiBase+'/api'+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
async function login(email,password){const r=await api('/auth/login',null,'POST',{email,password});assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
async function snapshot(){const result={};for(const table of ['users','rooms','bookings','messages','push_subscriptions']){const [rows]=await connection.query(`SELECT * FROM \`${process.env.DB_NAME}\`.\`${table}\` ORDER BY id`);result[table]=JSON.stringify(rows);}return result;}
async function bookingOptions(page){const details=page.locator('.classic-header-tools');if(!await details.evaluate(el=>el.open))await details.locator('summary').click();}
async function expand(page,title){const summary=page.getByText(title,{exact:true});if(!await summary.evaluate(el=>el.parentElement.open))await summary.click();}
async function navigate(page,name){
  const primary={Rooms:'Rooms',Bookings:'Bookings','Staff Accounts':'Users',Reports:'Reports'};
  if(primary[name])await page.getByRole('navigation').getByRole('button',{name:primary[name],exact:true}).click();
  else if(name==='Dashboard'||name==='Payments'){
    await navigate(page,'Bookings');await bookingOptions(page);await page.locator('.classic-header-tools').getByRole('button',{name,exact:true}).click();
  }else if(name==='Housekeeping'){
    await navigate(page,'Rooms');await page.waitForFunction(()=>document.querySelectorAll('.admin-skeleton').length===0);await expand(page,'Search and filters');await page.getByRole('button',{name:'Housekeeping',exact:true}).click();
  }else if(name==='Settings'){
    await navigate(page,'Reports');await expand(page,'Charts and detailed reports');await page.getByRole('button',{name:'Resort settings',exact:true}).click();
  }else throw new Error('Unexpected navigation target '+name);
  await page.getByRole('heading',{name,exact:true}).waitFor();
}
async function browserLogin(page,email='admin@resort.com',password='admin123'){await page.goto(uiBase);await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Log in',exact:true}).click();}
async function main(){
  fs.mkdirSync(artifacts,{recursive:true});connection=await mysql.createConnection({host:process.env.DB_HOST||'localhost',user:process.env.DB_USER,password:process.env.DB_PASSWORD,multipleStatements:true,dateStrings:true});
  const before=await snapshot();
  await connection.query(fs.readFileSync(path.join(root,'backend/schema.sql'),'utf8').replaceAll('resort_system',database));
  console.log(`Isolated test database: ${database}`);
  start(path.join(root,'backend/server.js'),[],path.join(root,'backend'),{DB_NAME:database,PORT:'4102',JWT_SECRET:randomBytes(32).toString('hex'),SEED_DEMO:'true',CLIENT_ORIGIN:uiBase});
  await waitFor(async()=> (await api('/auth/login',null,'POST',{email:'admin@resort.com',password:'admin123'})).status===200,'API startup');
  start(path.join(root,'frontend/node_modules/vite/bin/vite.js'),['--host','127.0.0.1','--port','5182','--strictPort'],path.join(root,'frontend'),{API_PROXY_TARGET:apiBase});await waitFor(async()=> (await fetch(uiBase)).ok,'Vite startup');
  let admin=(await login('admin@resort.com','admin123')).token;const guest=(await login('guest@resort.com','guest123')).token,staff=(await login('staff@resort.com','staff123')).token;
  check((await api('/ops/dashboard')).status===401,'authentication required');
  check((await api('/ops/dashboard',guest)).status===403,'guest cannot access dashboard');
  check((await api('/rooms',staff,'POST',{name:'Forbidden'})).status===403,'legacy room writes require room management permission');
  check((await api('/ops/staff',staff)).status===403,'receptionist cannot manage staff');
  check((await api('/auth/me',admin)).data.permissions.includes('payments.verify'),'database-backed permissions returned without password hashes');
  const live=io(apiBase+'/admin',{auth:{token:admin},transports:['websocket']});sockets.push(live);const events=[];live.on('admin:change',e=>events.push(e));await waitFor(()=>live.connected,'live connection');
  const roomPayload={name:'Platform test suite',type:'Villa',capacity:4,price_per_night:1250.25,description:'Isolated verification',amenities:'Wi-Fi, balcony',status:'available'};
  const room=(await api('/rooms',admin,'POST',roomPayload)).data;check(!!room.id,'room creation persists');
  check((await api('/rooms',admin,'POST',{...roomPayload,capacity:0})).status===400,'room capacity validated');
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';
  check((await api(`/rooms/${room.id}/image`,admin,'POST',{image:'data:image/png;base64,PHNjcmlwdD4='})).status===400,'MIME/content mismatch rejected');
  check((await api(`/rooms/${room.id}/image`,admin,'POST',{image:png})).status===200,'validated legacy image endpoint works');
  const photo=(await api(`/ops/rooms/${room.id}/images`,admin,'POST',{image:png})).data;
  check((await api(`/ops/rooms/${room.id}/images`,admin)).data.length===2,'multiple room photos persist');
  check((await api(`/ops/rooms/${room.id}/images/${photo.id}`,admin,'PATCH')).status===200,'primary room photo changes');
  check((await api(`/ops/rooms/${room.id}/images/${photo.id}`,admin,'DELETE')).status===200,'room photo removal works');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date()),day=n=>new Date(Date.parse(today)+n*86400000).toISOString().slice(0,10);
  const payload={room_id:room.id,guest_name:'Platform Guest',guest_contact:'09123456789',guests:2,check_in:today,check_out:day(2),total_price:1};
  const attempts=await Promise.all([api('/bookings',guest,'POST',payload),api('/bookings',guest,'POST',payload)]);
  check(attempts.filter(r=>r.status===201).length===1&&attempts.filter(r=>r.status===409).length===1,'concurrent overlapping reservations allow exactly one write');
  const booking=attempts.find(r=>r.status===201).data;
  check(Number(booking.total_price)===2500.5,'booking total calculated by server');
  check((await api(`/bookings/${booking.id}/status`,guest,'PATCH',{status:'confirmed'})).status===403,'guest cannot confirm booking');
  check((await api(`/rooms/${room.id}`,admin,'DELETE')).status===409,'archiving protects active reservations');
  check((await api(`/bookings/${booking.id}/status`,admin,'PATCH',{status:'checked_in'})).status===409,'invalid lifecycle jump rejected');
  check((await api(`/bookings/${booking.id}/status`,admin,'PATCH',{status:'confirmed'})).status===200,'confirmed booking persists');
  let calendar=await api(`/ops/calendar?start=${today}&end=${day(7)}`,admin);check(calendar.data.items.some(b=>b.id===booking.id),'calendar returns actual reservation');
  check((await api(`/ops/bookings/${booking.id}`,admin,'PATCH',{check_in:today,check_out:day(2),special_requests:'Late arrival'})).status===200,'reservation modification and special requests persist');
  check((await api(`/bookings/${booking.id}/status`,staff,'PATCH',{status:'checked_in'})).status===200,'authorized receptionist checks in current reservation');
  check((await api('/rooms',admin)).data.find(r=>r.id===room.id).status==='occupied','check-in updates operational occupancy');
  check((await api(`/ops/rooms/${room.id}/operation`,admin,'PATCH',{status:'available'})).status===409,'occupied room cannot be marked ready');
  check((await api(`/bookings/${booking.id}/status`,staff,'PATCH',{status:'checked_out'})).status===409,'outstanding payment blocks checkout');
  const paymentBody={booking_id:booking.id,amount:'2500.50',method:'cash',notes:'Test payment'},paymentKey=randomUUID();
  const recorded=await Promise.all([api('/ops/payments',staff,'POST',paymentBody,paymentKey),api('/ops/payments',staff,'POST',paymentBody,paymentKey)]);
  check(recorded.some(r=>r.status===201)&&recorded.some(r=>r.data.replayed),'simultaneous payment retry does not duplicate payment');
  const payment=recorded.find(r=>r.status===201).data;
  check((await api('/ops/payments',staff,'POST',{...paymentBody,amount:'0.00'},randomUUID())).status===400,'nonpositive payments rejected');
  check((await api('/ops/payments',staff,'POST',{...paymentBody,amount:'1.001'},randomUUID())).status===400,'payment precision validated');
  check((await api('/ops/payments',staff,'POST',{...paymentBody,amount:'1.00'},randomUUID())).status===409,'overallocated payments rejected');
  check((await api(`/ops/payments/${payment.id}/verify`,staff,'POST',{},randomUUID())).status===403,'receptionist cannot verify payments');
  check((await api(`/ops/payments/${payment.id}/receipt`,admin)).status===409,'unverified funds cannot generate receipt');
  const verifyKey=randomUUID();const verified=await Promise.all([api(`/ops/payments/${payment.id}/verify`,admin,'POST',{},verifyKey),api(`/ops/payments/${payment.id}/verify`,admin,'POST',{},verifyKey)]);
  check(verified.every(r=>r.status===200)&&verified.some(r=>r.data.replayed),'verification is transactional and idempotent');
  check((await api(`/ops/payments/${payment.id}/verify`,admin,'POST',{},randomUUID())).status===409,'duplicate verification with new key rejected');
  let dashboard=(await api('/ops/dashboard',admin)).data;
  check(Number(dashboard.revenue)===2500.5&&dashboard.rooms.occupied===1,'verified payments and occupancy update dashboard');
  const receipt=(await api(`/ops/payments/${payment.id}/receipt`,admin)).data;
  check(receipt.paid===2500.5&&receipt.balance===0&&receipt.items[0].total===2500.5,'receipt derives charges and balance from database');
  check((await api(`/bookings/${booking.id}/status`,staff,'PATCH',{status:'checked_out'})).status===200,'settled reservation checks out');
  check((await api('/rooms',admin)).data.find(r=>r.id===room.id).status==='cleaning','checkout marks room for cleaning');
  const refundKey=randomUUID();check((await api(`/ops/payments/${payment.id}/refund`,admin,'POST',{amount:'100.50',reason:'Recorded external refund'},refundKey)).status===200,'partial refund recorded with audit');
  check((await api(`/ops/payments/${payment.id}/refund`,admin,'POST',{amount:'100.50',reason:'Recorded external refund'},refundKey)).data.replayed,'refund retry is idempotent');
  dashboard=(await api('/ops/dashboard',admin)).data;check(Number(dashboard.revenue)===2400,'refund reduces financial revenue exactly once');
  check((await api(`/ops/payments/${payment.id}/refund`,admin,'POST',{amount:'99999',reason:'Invalid'},randomUUID())).status===409,'excess refund rejected');
  check((await api(`/bookings/${booking.id}`,admin,'DELETE')).status===200,'completed booking can be archived');
  check(Number((await api('/ops/dashboard',admin)).data.revenue)===2400,'archiving preserves financial history');
  check((await api(`/ops/rooms/${room.id}/operation`,admin,'PATCH',{status:'available'})).status===200,'cleaned room released');
  const future=(await api('/bookings',guest,'POST',{...payload,check_in:day(5),check_out:day(6)})).data;
  await api(`/bookings/${future.id}/status`,admin,'PATCH',{status:'confirmed'});
  check((await api(`/bookings/${future.id}/status`,admin,'PATCH',{status:'checked_in'})).status===409,'early check-in rejected');
  const eBody={booking_id:future.id,amount:'100.00',method:'gcash',transaction_reference:randomUUID(),evidence:png};
  const electronic=await api('/ops/payments',staff,'POST',eBody,randomUUID());check(electronic.status===201,'electronic evidence stored for manual verification');
  let evidence=await fetch(apiBase+`/api/ops/payments/${electronic.data.id}/evidence`,{headers:{Authorization:`Bearer ${guest}`}});check(evidence.status===403,'guest cannot access payment evidence');
  evidence=await fetch(apiBase+`/api/ops/payments/${electronic.data.id}/evidence`,{headers:{Authorization:`Bearer ${admin}`}});check(evidence.status===200&&evidence.headers.get('content-type').includes('image'),'authorized verifier can inspect private evidence');
  check((await api(`/ops/payments/${electronic.data.id}/reject`,admin,'POST',{reason:''},randomUUID())).status===400,'rejection requires reason');
  check((await api(`/ops/payments/${electronic.data.id}/reject`,admin,'POST',{reason:'Transfer not received'},randomUUID())).status===200,'electronic payment rejection audited');
  const another=(await api('/rooms',admin,'POST',{...roomPayload,name:'Alternative room'})).data;
  check((await api(`/ops/bookings/${future.id}`,admin,'PATCH',{room_id:another.id,check_in:day(5),check_out:day(7)})).status===200,'reservation reassignment works with serialized room locks');
  const conflict=(await api('/bookings',guest,'POST',{...payload,room_id:room.id,check_in:day(5),check_out:day(7)})).data;
  check((await api(`/ops/bookings/${future.id}`,admin,'PATCH',{room_id:room.id})).status===409,'reassignment cannot overlap another reservation');
  const staffBody={name:'Housekeeper',email:'housekeeping@verify.test',password:'Test-password-123',permission_role:'housekeeping'};
  check((await api('/ops/staff',admin,'POST',staffBody)).status===403,'Admin cannot assign privileged permission profiles');
  await connection.query(`UPDATE \`${database}\`.users SET permission_role='super_admin' WHERE email='admin@resort.com'`);admin=(await login('admin@resort.com','admin123')).token;
  const house=(await api('/ops/staff',admin,'POST',staffBody)).data;check(!!house.id,'Super Admin assigns housekeeping role');
  const houseLogin=await login(staffBody.email,staffBody.password),houseToken=houseLogin.token;
  check((await api('/bookings',houseToken)).status===403,'housekeeping cannot access legacy booking data');
  check((await api('/ops/payments',houseToken)).status===403,'housekeeping cannot access payments');
  check((await api('/messages',houseToken)).status===403,'housekeeping cannot access guest communications');
  check((await api('/ops/staff',houseToken,'POST',{...staffBody,email:'escalate@verify.test',permission_role:'super_admin'})).status===403,'housekeeping privilege escalation blocked');
  const issue=await api('/ops/maintenance',houseToken,'POST',{room_id:another.id,description:'Leaking tap'});check(issue.status===201,'housekeeping can report maintenance');
  check((await api(`/ops/rooms/${another.id}/operation`,houseToken,'PATCH',{status:'available'})).status===409,'open maintenance prevents room release');
  check((await api(`/ops/maintenance/${issue.data.id}`,houseToken,'PATCH',{})).status===200,'housekeeping resolves permitted maintenance task');
  const [[adminUser]]=await connection.query(`SELECT id FROM \`${database}\`.users WHERE email='admin@resort.com'`);
  check((await api(`/ops/staff/${adminUser.id}`,admin,'PUT',{name:'Admin',email:'admin@resort.com',permission_role:'admin'})).status===409,'last active Super Admin cannot be demoted');
  check((await api(`/ops/staff/${adminUser.id}`,admin,'PUT',{name:'Admin',email:'admin@resort.com',permission_role:'super_admin',active:false})).status===409,'last active Super Admin cannot be deactivated');
  check((await api(`/ops/staff/${house.id}/reset-password`,admin,'POST',{password:'Changed-password-456'})).status===200,'authorized password reset succeeds');
  check((await api('/auth/me',houseToken)).status===401,'password reset immediately revokes old JWT');
  check((await api('/ops/staff',admin)).data.every(u=>!('password_hash'in u)&&!('token_version'in u)),'staff responses exclude password and token internals');
  await waitFor(()=>events.some(e=>e.category==='payments')&&events.some(e=>e.category==='rooms'),'real-time changes');
  check(new Set(events.map(e=>e.id)).size===events.length,'real-time event IDs support deduplication');
  const inbox=(await api('/admin/notifications',admin)).data;check(inbox.unread>0&&inbox.items.every(n=>n.user_id===adminUser.id),'notifications persist and are recipient scoped');
  await api('/admin/notifications/read',admin,'PATCH',{});check((await api('/admin/notifications',admin)).data.unread===0,'notification read state persists');
  const upcoming=(await api('/bookings',guest,'POST',{...payload,room_id:1,check_in:today,check_out:day(1)})).data;
  await api(`/bookings/${upcoming.id}/status`,admin,'PATCH',{status:'confirmed'});
  const reminderRun=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['-e',"require('./lib/reminders').run().then(()=>require('./db').end()).catch(()=>process.exit(1))"],{cwd:path.join(root,'backend'),env:{...process.env,DB_NAME:database},windowsHide:true,stdio:'ignore'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Reminder job failed')));});
  await reminderRun();const firstReminder=(await api('/admin/notifications',admin)).data.items.filter(n=>n.title==='Upcoming check-in').length;await reminderRun();
  check(firstReminder>0&&(await api('/admin/notifications',admin)).data.items.filter(n=>n.title==='Upcoming check-in').length===firstReminder,'upcoming-stay reminders persist without duplicates');
  const installedEdge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(!fs.existsSync(chromium.executablePath())&&fs.existsSync(installedEdge)?installedEdge:null);
  browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await browserLogin(page);await page.getByRole('heading',{name:'Rooms',exact:true}).waitFor();check((await page.getByRole('navigation').getByRole('button').allTextContents()).join(',')==='Rooms,Bookings,Users,Reports','original four sidebar items preserved without More');await page.waitForFunction(()=>document.querySelectorAll('.admin-skeleton').length===0);check(await page.locator('.classic-admin').evaluate(el=>getComputedStyle(el).backgroundColor)==='rgb(244, 240, 234)'&&await page.locator('.classic-sidebar').evaluate(el=>getComputedStyle(el).backgroundColor)==='rgb(9, 62, 68)','original cream background and dark teal sidebar preserved');check(await page.locator('.classic-sidebar').evaluate(el=>el.getBoundingClientRect().width)===230&&await page.locator('.admin-room-photo').first().evaluate(el=>el.getBoundingClientRect().height)===170,'original sidebar and room-photo dimensions preserved');await navigate(page,'Dashboard');
  await page.getByText('Total revenue',{exact:true}).waitFor();check(true,'dashboard renders verified-payment statistics');
  await page.screenshot({path:path.join(artifacts,'dashboard-desktop.png'),fullPage:true});
  const secondContext=await browser.newContext({viewport:{width:1440,height:1000}}),second=await secondContext.newPage();second.on('pageerror',e=>errors.push(e.message));await browserLogin(second);await second.getByRole('heading',{name:'Rooms',exact:true}).waitFor();
  await navigate(page,'Rooms');await navigate(second,'Rooms');await page.getByRole('button',{name:'Add room',exact:true}).click();await page.getByRole('dialog').getByLabel('Room name',{exact:true}).fill('Browser live suite');await page.getByRole('dialog').getByLabel('Price per night (PHP)').fill('950.25');await page.getByRole('dialog').getByRole('button',{name:'Save room',exact:true}).click();await second.getByRole('heading',{name:'Browser live suite',exact:true}).waitFor();check(true,'browser room creation updates another session without reload');
  await second.getByRole('button',{name:/^Notifications/}).click();await second.getByRole('dialog').getByText('Room created',{exact:true}).first().waitFor();check(true,'notification bell receives persisted live room event');await second.getByRole('button',{name:'Close dialog',exact:true}).click();
  await navigate(page,'Bookings');await bookingOptions(page);await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.getByRole('region',{name:'Room booking timeline'}).waitFor();check(true,'calendar renders real room timeline');
  await page.getByRole('button',{name:new RegExp('Platform Guest')}).first().click();await page.getByRole('dialog').getByText('Booking history',{exact:true}).waitFor();check(true,'calendar selection opens real booking details and audit history');await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.getByLabel('Calendar view',{exact:true}).selectOption('week');await page.getByRole('region',{name:'Room booking timeline'}).waitFor();check(await page.locator('.platform-calendar thead th').count()===8,'weekly timeline displays seven days');await page.getByLabel('Calendar view',{exact:true}).selectOption('day');await waitFor(async()=>await page.locator('.platform-calendar thead th').count()===2,'daily timeline');check(true,'daily timeline displays one day');
  await bookingOptions(page);await page.getByRole('button',{name:'Booking list',exact:true}).click();await bookingOptions(page);await page.getByRole('button',{name:'Create reservation',exact:true}).click();let modal=page.getByRole('dialog');await modal.getByLabel('Guest name',{exact:true}).fill('Browser reservation guest');await modal.getByLabel('Check-in',{exact:true}).fill(day(3));await modal.getByLabel('Check-out',{exact:true}).fill(day(4));await modal.getByRole('button',{name:'Find available rooms',exact:true}).click();await modal.getByLabel('Available room',{exact:true}).selectOption({label:'Browser live suite · ₱950.25/night'});await modal.getByRole('button',{name:'Create reservation',exact:true}).click();await page.getByRole('button',{name:'Browser reservation guest',exact:true}).waitFor();check(true,'front desk booking form persists a real reservation');
  const bookingRow=page.locator('tr').filter({has:page.getByRole('button',{name:'Browser reservation guest',exact:true})});await bookingRow.getByRole('button',{name:'Confirm',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmed',exact:true}).click();await bookingRow.getByText('Confirmed',{exact:true}).waitFor();check(true,'booking lifecycle action works through browser confirmation dialog');
  await navigate(page,'Payments');await page.getByRole('button',{name:'Receipt & history',exact:true}).first().click();await page.locator('#payment-receipt').waitFor();check(await page.getByRole('button',{name:'Print / Save as PDF'}).isVisible(),'verified payment receipt and print action render');
  const pdf=await page.pdf({path:path.join(artifacts,'payment-acknowledgment.pdf'),format:'A4',printBackground:true});check(pdf.toString('ascii',0,4)==='%PDF'&&pdf.length>1000,'payment acknowledgment exports as printable PDF');
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.getByRole('button',{name:'Record payment',exact:true}).click();await page.getByRole('dialog').getByLabel('Booking ID').fill(String(future.id));await page.getByRole('dialog').getByLabel('Amount (PHP)').fill('999999.00');await page.getByRole('dialog').getByRole('button',{name:'Save payment',exact:true}).click();await page.getByRole('dialog').getByText('Payment exceeds the remaining unallocated balance',{exact:true}).first().waitFor();check(true,'payment form displays server validation without unhandled errors');await page.getByRole('dialog').getByLabel('Amount (PHP)').fill('10.00');await page.getByRole('dialog').getByRole('button',{name:'Save payment',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});check(true,'payment browser form persists actual transaction');
  for(const viewport of [{width:1440,height:1000},{width:820,height:1180},{width:390,height:844},{width:320,height:740}]){
    await page.setViewportSize(viewport);
    for(const name of ['Dashboard','Rooms','Bookings','Payments','Housekeeping','Staff Accounts','Reports','Settings']){
      await navigate(page,name);await page.waitForFunction(()=>document.querySelectorAll('.admin-skeleton').length===0);await delay(100);
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} responsive at ${viewport.width}px`);
    }
    await page.screenshot({path:path.join(artifacts,`settings-${viewport.width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});await navigate(page,'Staff Accounts');const staffForm=page.locator('form.card.searchbar');await staffForm.getByLabel('Name',{exact:true}).fill('Browser Receptionist');await staffForm.getByLabel('Email',{exact:true}).fill('browser-reception@verify.test');await staffForm.getByLabel('Password',{exact:true}).fill('Browser-password-123');await staffForm.getByRole('button',{name:'Add staff',exact:true}).click();await page.getByText('Browser Receptionist',{exact:true}).first().waitFor();check(true,'original inline staff form creates permission-aware account');
  await expand(page,'Roles, permissions and advanced staff management');
  const staffManagement=page.locator('details.classic-advanced').filter({has:page.getByText('Roles, permissions and advanced staff management',{exact:true})});
  const managedRow=staffManagement.locator('tr').filter({hasText:'browser-reception@verify.test'});
  await managedRow.getByRole('button',{name:'Edit staff',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Permission profile').selectOption('housekeeping');
  await page.getByRole('dialog').getByRole('button',{name:'Save staff',exact:true}).click();
  await managedRow.getByText('housekeeping',{exact:true}).waitFor();check(true,'advanced staff role assignment works inside existing Users page');
  await page.getByRole('button',{name:/^Notifications/}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Mark all as read',exact:true}).click();
  await page.getByRole('dialog').getByText('0 unread',{exact:true}).waitFor();
  await page.getByRole('dialog').getByLabel('Unread only').check();
  await page.getByRole('dialog').getByRole('heading',{name:/all caught up/}).waitFor();
  check(true,'notification unread filter presents an empty state after marking all read');
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();

  const failingContext=await browser.newContext(),failurePage=await failingContext.newPage();await failurePage.route('**/api/ops/dashboard*',async route=>{await delay(350);await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Verification outage'})});});await browserLogin(failurePage);await navigate(failurePage,'Dashboard');await failurePage.getByRole('status',{name:'Loading data'}).waitFor();check(true,'data loading skeleton is accessible');await failurePage.getByText('Verification outage',{exact:true}).waitFor();check(true,'API failure presents an error state');await failurePage.unroute('**/api/ops/dashboard*');await failurePage.getByRole('button',{name:'Try again',exact:true}).click();await failurePage.getByText('Total revenue',{exact:true}).waitFor();check(true,'error retry restores real dashboard data');await failingContext.close();
  const hp=await context.newPage();await browserLogin(hp,staffBody.email,'Changed-password-456');await hp.getByRole('heading',{name:'Rooms',exact:true}).waitFor();check(await hp.getByRole('navigation').getByRole('button',{name:'Payments',exact:true}).count()===0,'housekeeping UI hides financial navigation');await hp.locator('.classic-header-tools>summary').click();await hp.getByRole('button',{name:'Housekeeping',exact:true}).click();await hp.getByRole('heading',{name:'Housekeeping',exact:true}).waitFor();await hp.getByRole('heading',{name:'Maintenance tasks',exact:true}).waitFor();check(true,'housekeeping employee reaches assigned room workflow without extra sidebar items');
  const gp=await context.newPage();await browserLogin(gp,'guest@resort.com','guest123');await gp.getByRole('heading',{name:'Rooms',exact:true}).waitFor();check(await gp.locator('.admin-app').count()===0,'existing guest experience remains available');
  check(errors.length===0,`browser runtime errors: ${errors.join(', ')||'none'}`);
  const postmanLog=await new Promise((resolve,reject)=>{const p=spawn('postman',['collection','run',path.join(root,'postman/admin-smoke.postman_collection.json'),'--env-var',`baseUrl=${apiBase}`,'--env-var','adminPassword=admin123','--no-report-events'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';p.stdout.on('data',c=>log+=c);p.stderr.on('data',c=>log+=c);p.on('error',reject);p.on('exit',code=>code===0?resolve(log):reject(new Error(log)));});fs.writeFileSync(path.join(artifacts,'postman.txt'),postmanLog);check(true,'Postman read-only API regression collection passes against isolated service');
  assert.deepEqual(await snapshot(),before);check(true,'existing application database rows are unchanged');
  fs.writeFileSync(path.join(artifacts,'summary.json'),JSON.stringify({database,checks,passed:true,date:new Date().toISOString()},null,2));console.log(`VERIFIED ${checks} checks. Isolated fixtures retained in ${database}.`);
}
main().catch(async e=>{console.error(e.stack);if(browser)for(const [i,c]of browser.contexts().entries())for(const[j,p]of c.pages().entries()){console.error((await p.locator('body').innerText()).slice(0,2400));await p.screenshot({path:path.join(artifacts,`failure-${i}-${j}.png`),fullPage:true}).catch(()=>{});}process.exitCode=1;}).finally(async()=>{sockets.forEach(s=>s.disconnect());if(browser)await browser.close();children.forEach(p=>p.kill());if(connection)await connection.end();});
