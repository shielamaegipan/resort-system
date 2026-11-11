const express = require('express');
const bcrypt = require('bcryptjs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { requirePermission: permit, permissions, profile, audit, profiles } = require('../lib/permissions');
const { transaction, lockRoom, noOverlap } = require('../lib/booking-service');
const v = require('../lib/validation');
const uploads = require('../lib/uploads');
const realtime = require('../lib/realtime');
const router = express.Router();
router.use(auth);
const selectBooking = `SELECT b.*,r.name AS room_name,r.price_per_night,u.email AS guest_email FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN users u ON u.id=b.user_id`;
const reference = (id) => `RS-${String(id).padStart(6,'0')}`;
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function cents(value) {
  if (!['number','string'].includes(typeof value) || !/^\d+(\.\d{1,2})?$/.test(String(value))) v.fail(400, 'Amount must have at most two decimal places');
  const n = Math.round(Number(value)*100);
  if (!Number.isSafeInteger(n) || n <= 0 || n > 9999999999) v.fail(400, 'Enter a valid positive amount');
  return n;
}
function idempotency(req) { return v.text(req.headers['idempotency-key'], 'Idempotency-Key', 100); }
async function paid(c, id) {
  const [[r]] = await c.query("SELECT COALESCE(SUM(amount-refunded_amount),0) AS paid FROM payments WHERE booking_id=? AND status IN ('verified','refunded','partially_refunded')", [id]);
  return Math.round(Number(r.paid)*100);
}
router.get('/dashboard', permit('dashboard.view'), async (req,res) => {
  const year = Number(req.query.year || v.today().slice(0,4));
  if (!Number.isInteger(year) || year < 2000 || year > 2200) v.fail(400,'Invalid year');
  const result = await transaction(async c => {
    const [[finance]] = await c.query(`SELECT COALESCE(SUM(amount-refunded_amount),0) revenue, COALESCE(SUM(CASE WHEN DATE(CONVERT_TZ(verified_at,'+00:00','+08:00'))=? THEN amount-refunded_amount ELSE 0 END),0) today_revenue FROM payments WHERE status IN ('verified','refunded','partially_refunded')`, [v.today()]);
    const [[counts]] = await c.query(`SELECT COUNT(*) bookings,COALESCE(SUM(status='pending'),0) pending,COALESCE(SUM(status='confirmed'),0) confirmed,COALESCE(SUM(check_in=? AND status IN ('pending','confirmed')),0) arrivals,COALESCE(SUM(check_out=? AND status='checked_in'),0) departures FROM bookings WHERE deleted_at IS NULL`, [v.today(),v.today()]);
    const [byStatus] = await c.query('SELECT status,COUNT(*) n FROM bookings WHERE deleted_at IS NULL GROUP BY status');
    const [[rooms]] = await c.query(`SELECT COUNT(*) total,COALESCE(SUM(status='maintenance'),0) maintenance,COALESCE(SUM(status='cleaning'),0) cleaning,COALESCE(SUM(status='out_of_service'),0) out_of_service FROM rooms WHERE deleted_at IS NULL`);
    const [[occupied]] = await c.query("SELECT COUNT(DISTINCT room_id) n FROM bookings WHERE deleted_at IS NULL AND status='checked_in'");
    const [[available]] = await c.query(`SELECT COUNT(*) n FROM rooms r WHERE r.deleted_at IS NULL AND r.status='available' AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.room_id=r.id AND b.deleted_at IS NULL AND (b.status='checked_in' OR (b.status IN ('pending','confirmed') AND b.check_in<=? AND b.check_out>?)))`,[v.today(),v.today()]);
    const [[guests]] = await c.query("SELECT COUNT(*) n FROM users WHERE role='guest' AND deleted_at IS NULL");
    const [months] = await c.query(`SELECT MONTH(CONVERT_TZ(verified_at,'+00:00','+08:00')) month,SUM(amount-refunded_amount) revenue FROM payments WHERE status IN ('verified','refunded','partially_refunded') AND YEAR(CONVERT_TZ(verified_at,'+00:00','+08:00'))=? GROUP BY month`,[year]);
    const [recent] = await c.query(`${selectBooking} WHERE b.deleted_at IS NULL ORDER BY b.id DESC LIMIT 8`);
    return { ...counts,...finance, rooms:{...rooms,occupied:occupied.n,available:available.n},guests:guests.n,byStatus,recent:recent.map(b=>({...b,reference:reference(b.id)})),monthly:Array.from({length:12},(_,i)=>({month:`${year}-${String(i+1).padStart(2,'0')}`,revenue:Number(months.find(m=>m.month===i+1)?.revenue||0)})),year };
  });
  const annual=await require('./advanced').analytics({start:`${year}-01-01`,end:`${year}-12-31`});
  const daily=await require('./advanced').analytics({preset:'today'});
  result.today_revenue=daily.revenue;
  result.monthly=result.monthly.map(m=>({...m,revenue:annual.days.filter(d=>d.day.slice(0,7)===m.month).reduce((sum,d)=>sum+Math.round(Number(d.revenue)*100),0)/100}));
  const allowed = await permissions(req.user);
  if (!allowed.includes('payments.view')) { result.revenue = null; result.today_revenue = null; result.monthly = []; }
  if (allowed.includes('activity.view')) { const [activity] = await db.query('SELECT a.*,u.name actor_name FROM activity_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 12'); result.activity = activity; } else result.activity=[];
  res.json(result);
});
router.get('/calendar', permit('bookings.view'), async(req,res)=>{
  v.dates(req.query.start,req.query.end);
  if ((Date.parse(req.query.end)-Date.parse(req.query.start))/86400000>93) v.fail(400,'Calendar range cannot exceed 93 days');
  const [items]=await db.query(`${selectBooking} WHERE b.deleted_at IS NULL AND b.check_in<? AND b.check_out>? ORDER BY b.room_id,b.check_in`,[req.query.end,req.query.start]);
  const [rooms]=await db.query('SELECT id,name,status FROM rooms WHERE deleted_at IS NULL ORDER BY id');
  res.json({items:items.map(b=>({...b,reference:reference(b.id)})),rooms});
});
router.get('/bookings/:id', permit('bookings.view'), async(req,res)=>{
  const [[b]]=await db.query(`${selectBooking} WHERE b.id=?`,[req.params.id]);
  if(!b)v.fail(404,'Booking not found');
  const [history]=await db.query('SELECT a.*,u.name actor_name FROM activity_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE entity_type=? AND entity_id=? ORDER BY a.id DESC',['bookings',b.id]);
  const amountPaid=await paid(db,b.id);
  res.json({...b,reference:reference(b.id),nights:v.dates(b.check_in,b.check_out),nightly_rate:Number(b.total_price)/v.dates(b.check_in,b.check_out),paid:amountPaid/100,balance:(Math.round(Number(b.total_price)*100)-amountPaid)/100,history});
});
router.patch('/bookings/:id', permit('bookings.manage'), async(req,res)=>{
  const b=await transaction(async c=>{
    const [[found]]=await c.query('SELECT * FROM bookings WHERE id=? AND deleted_at IS NULL',[req.params.id]);
    if(!found)v.fail(404,'Booking not found');
    const roomId=req.body.room_id?v.integer(req.body.room_id,'Room ID',2147483647):found.room_id;
    // Stable order also serializes two bookings swapping rooms.
    for(const id of [...new Set([found.room_id,roomId])].sort((a,b)=>a-b))await lockRoom(c,id);
    const [[current]]=await c.query('SELECT * FROM bookings WHERE id=? FOR UPDATE',[found.id]);
    if(current.room_id!==found.room_id)v.fail(409,'Booking changed. Reload and retry');
    if(!['pending','confirmed'].includes(current.status))v.fail(409,'Only pending or confirmed reservations can be modified');
    const start=req.body.check_in||current.check_in,end=req.body.check_out||current.check_out;
    const nights=v.dates(start,end); if(start<v.today())v.fail(400,'Check-in cannot be in the past');
    const room=await lockRoom(c,roomId);
    if(room.deleted_at||room.status!=='available'||current.guests>room.capacity)v.fail(409,'Room is not ready or lacks capacity');
    await noOverlap(c,{id:current.id,room_id:roomId,check_in:start,check_out:end});
    const rate=roomId===current.room_id?Number(current.total_price)/v.dates(current.check_in,current.check_out):Number(room.price_per_night);
    const total=Math.round(rate*nights*100);
    if(await paid(c,current.id)>total)v.fail(409,'Refund excess payment before reducing booking value');
    const requests=v.text(req.body.special_requests??current.special_requests,'Special requests',5000,false);
    await c.query('UPDATE bookings SET room_id=?,check_in=?,check_out=?,total_price=?,special_requests=? WHERE id=?',[roomId,start,end,total/100,requests,current.id]);
    await audit(c,req.user,'bookings',current.id,'reservation_modified',`${current.check_in}–${current.check_out} → ${start}–${end}; room ${roomId}`);
    const [[saved]]=await c.query(`${selectBooking} WHERE b.id=?`,[current.id]);return saved;
  });
  await realtime.publish('bookings','Reservation modified',b.guest_name,b.id);res.json(b);
});
router.get('/payments', permit('payments.view'), async(req,res)=>{
  const page=req.query.page?v.integer(req.query.page,'Page',1000000):1;
  const search=v.text(req.query.search,'Search',150,false),status=req.query.status||'';
  const bookingId=req.query.booking_id?v.integer(req.query.booking_id,'Booking ID',2147483647):null;
  const where=`WHERE (?='' OR p.status=?) AND (?='' OR CONCAT_WS(' ',b.id,b.guest_name,p.transaction_reference,p.id) LIKE ?) AND (? IS NULL OR p.booking_id=?) `;
  const params=[status,status,search,`%${search}%`,bookingId,bookingId];
  const [[count]]=await db.query(`SELECT COUNT(*) total FROM payments p JOIN bookings b ON b.id=p.booking_id ${where}`,params);
  const [items]=await db.query(`SELECT p.id,p.booking_id,p.amount,p.method,p.status,p.transaction_reference,p.notes,p.recorded_by,p.verified_by,p.verified_at,p.refunded_amount,p.created_at,(p.evidence_file IS NOT NULL) has_evidence,b.guest_name,r.name room_name FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN rooms r ON r.id=b.room_id ${where} ORDER BY p.id DESC LIMIT 20 OFFSET ?`,[...params,(page-1)*20]);
  res.json({items,total:count.total,page,pages:Math.max(1,Math.ceil(count.total/20))});
});
router.post('/payments', permit('payments.record'), async(req,res)=>{
  const amount=cents(req.body.amount),bookingId=v.integer(req.body.booking_id,'Booking ID',2147483647);
  const method=req.body.method;if(!['cash','gcash','maya','bank_transfer'].includes(method))v.fail(400,'Invalid payment method');
  const transactionRef=v.text(req.body.transaction_reference,'Transaction reference',150,method!=='cash');
  const notes=v.text(req.body.notes,'Notes',2000,false),key=idempotency(req),digest=hash(req.body);
  let file;
  try{
    const row=await transaction(async c=>{
      const [[b]]=await c.query('SELECT * FROM bookings WHERE id=? FOR UPDATE',[bookingId]);
      if(!b)v.fail(404,'Booking not found');
      const [[old]]=await c.query('SELECT id,request_hash,recorded_by FROM payments WHERE idempotency_key=?',[key]);
      if(old){if(old.request_hash!==digest||old.recorded_by!==req.user.id)v.fail(409,'Idempotency key already used');return {id:old.id,replayed:true};}
      if(b.deleted_at||['cancelled','checked_out','no_show'].includes(b.status))v.fail(409,'This reservation cannot accept a payment');
      const [[reserved]]=await c.query("SELECT COALESCE(SUM(amount-refunded_amount),0) amount FROM payments WHERE booking_id=? AND status IN ('pending','submitted','verified','partially_refunded')",[b.id]);
      if(amount+Math.round(Number(reserved.amount)*100)>Math.round(Number(b.total_price)*100))v.fail(409,'Payment exceeds the remaining unallocated balance');
      if(transactionRef){const [[duplicate]]=await c.query('SELECT id FROM payments WHERE method=? AND transaction_reference=?',[method,transactionRef]);if(duplicate)v.fail(409,'Transaction reference already recorded');}
      if(req.body.evidence)file=await uploads.saveImage(req.body.evidence,true);
      if(method!=='cash'&&!file)v.fail(400,'Electronic payments require image evidence for manual verification');
      const [r]=await c.query(`INSERT INTO payments(booking_id,amount,method,status,transaction_reference,notes,evidence_file,recorded_by,idempotency_key,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?)`,[b.id,amount/100,method,method==='cash'?'pending':'submitted',transactionRef||null,notes,file||null,req.user.id,key,digest]);
      await audit(c,req.user,'payments',r.insertId,'payment_recorded',`${method}; PHP ${(amount/100).toFixed(2)}; booking ${b.id}`);
      await audit(c,req.user,'bookings',b.id,'payment_recorded',`Payment ${r.insertId}`);
      return {id:r.insertId};
    });
    if(!row.replayed)await realtime.publish('payments','Payment verification requested',`Payment #${row.id}`,row.id);
    res.status(row.replayed?200:201).json(row);
  }catch(e){await uploads.removeImage(file,true);throw e;}
});
router.get('/payments/:id',permit('payments.view'),async(req,res)=>{
  const [[p]]=await db.query(`SELECT p.id,p.booking_id,p.amount,p.method,p.status,p.transaction_reference,p.notes,p.verified_by,p.verified_at,p.refunded_amount,p.created_at,b.guest_name,r.name room_name FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN rooms r ON r.id=b.room_id WHERE p.id=?`,[req.params.id]);
  if(!p)v.fail(404,'Payment not found');
  const [history]=await db.query('SELECT operation,amount,reason,actor_id,created_at FROM payment_operations WHERE payment_id=? ORDER BY id',[p.id]);res.json({...p,history});
});
for(const operation of ['verify','reject','refund'])router.post(`/payments/:id/${operation}`,permit(operation==='refund'?'payments.refund':'payments.verify'),async(req,res)=>{
  const key=idempotency(req),digest=hash({operation,id:req.params.id,body:req.body,actor:req.user.id});
  const result=await transaction(async c=>{
    const [[found]]=await c.query('SELECT booking_id FROM payments WHERE id=?',[req.params.id]);if(!found)v.fail(404,'Payment not found');
    const [[booking]]=await c.query('SELECT * FROM bookings WHERE id=? FOR UPDATE',[found.booking_id]);
    const [[p]]=await c.query('SELECT * FROM payments WHERE id=? FOR UPDATE',[req.params.id]);
    const [[old]]=await c.query('SELECT * FROM payment_operations WHERE idempotency_key=?',[key]);
    if(old){if(old.request_hash!==digest)v.fail(409,'Idempotency key already used');return {ok:true,replayed:true};}
    let reason='',amount=null;
    if(operation==='verify'){
      if(!['pending','submitted'].includes(p.status))v.fail(409,'Payment has already been processed');
      if(['cancelled','no_show'].includes(booking.status))v.fail(409,'Cannot verify payment for a cancelled booking');
      if(await paid(c,booking.id)+Math.round(Number(p.amount)*100)>Math.round(Number(booking.total_price)*100))v.fail(409,'Payment exceeds booking balance');
      await c.query("UPDATE payments SET status='verified',verified_at=UTC_TIMESTAMP(),verified_by=? WHERE id=?",[req.user.id,p.id]);
    }else if(operation==='reject'){
      if(!['pending','submitted'].includes(p.status))v.fail(409,'Only unverified payments can be rejected');
      reason=v.text(req.body.reason,'Rejection reason',1000);
      await c.query("UPDATE payments SET status='rejected' WHERE id=?",[p.id]);
    }else{
      if(!['verified','partially_refunded'].includes(p.status))v.fail(409,'Only verified payments can be refunded');
      reason=v.text(req.body.reason,'Refund reason',1000);amount=cents(req.body.amount);
      const next=Math.round(Number(p.refunded_amount)*100)+amount;
      if(next>Math.round(Number(p.amount)*100))v.fail(409,'Refund exceeds refundable amount');
      await c.query('UPDATE payments SET refunded_amount=?,status=? WHERE id=?',[next/100,next===Math.round(Number(p.amount)*100)?'refunded':'partially_refunded',p.id]);
    }
    await c.query('INSERT INTO payment_operations(payment_id,operation,amount,reason,actor_id,idempotency_key,request_hash) VALUES (?,?,?,?,?,?,?)',[p.id,operation,amount?amount/100:null,reason,req.user.id,key,digest]);
    await audit(c,req.user,'payments',p.id,`payment_${operation}`,reason);
    await audit(c,req.user,'bookings',booking.id,`payment_${operation}`,`Payment ${p.id}`);
    return {ok:true};
  });
  if(!result.replayed)await realtime.publish('payments',`Payment ${operation}`,`Payment #${req.params.id}`,req.params.id);
  res.json(result);
});
router.get('/payments/:id/evidence',permit('payments.verify'),async(req,res)=>{
  const [[p]]=await db.query('SELECT evidence_file FROM payments WHERE id=?',[req.params.id]);
  if(!p?.evidence_file)v.fail(404,'Evidence not found');
  res.set('Cache-Control','no-store').set('X-Content-Type-Options','nosniff');res.sendFile(path.join(uploads.privateDir,path.basename(p.evidence_file)));
});
router.get('/payments/:id/receipt',permit('payments.view'),async(req,res)=>{
  const [[p]]=await db.query('SELECT id,booking_id,amount,method,status,transaction_reference,verified_at,refunded_amount FROM payments WHERE id=?',[req.params.id]);
  if(!p)v.fail(404,'Payment not found');
  if(!['verified','partially_refunded','refunded'].includes(p.status))v.fail(409,'Receipt is only available after verification');
  const [[b]]=await db.query(`${selectBooking} WHERE b.id=?`,[p.booking_id]);
  const [[settings]]=await db.query('SELECT name,contact,address,currency_display FROM resort_settings WHERE id=1');
  const [history]=await db.query('SELECT operation,amount,reason,created_at FROM payment_operations WHERE payment_id=? ORDER BY id',[p.id]);
  const amountPaid=await paid(db,b.id),nights=v.dates(b.check_in,b.check_out);
  res.json({resort:settings,receipt_reference:`PAY-${String(p.id).padStart(8,'0')}`,booking_reference:reference(b.id),guest:b.guest_name,room:b.room_name,check_in:b.check_in,check_out:b.check_out,items:[{description:`${nights} night(s) · ${b.room_name}`,quantity:nights,unit_price:Number(b.total_price)/nights,total:Number(b.total_price)}],total:Number(b.total_price),paid:amountPaid/100,balance:(Math.round(Number(b.total_price)*100)-amountPaid)/100,payment:p,history,notice:'Payment acknowledgment. Not a BIR official receipt.'});
});
router.get('/roles',permit('staff.manage'),async(req,res)=>{res.json({roles:Object.keys(profiles).filter(r=>r!=='guest'),permissions:await permissions(req.user)});});
router.get('/staff',permit('staff.manage'),async(req,res)=>{
  const [rows]=await db.query("SELECT id,name,email,role,permission_role,created_at,deleted_at,last_login_at FROM users WHERE role IN ('admin','staff') ORDER BY id DESC");
  res.json(rows.map(u=>({...u,permission_role:profile(u)})));
});
async function saveStaff(req,res){
  const data=v.staff(req.body,!req.params.id),chosen=req.body.permission_role||'receptionist';
  if(data.password&&data.password.length<12)v.fail(400,'New staff passwords must have at least 12 characters');
  if(!profiles[chosen]||chosen==='guest')v.fail(400,'Invalid staff profile');
  const canRoles=(await permissions(req.user)).includes('roles.manage');
  const saved=await transaction(async c=>{
    // Serializes last-super-admin checks and concurrent demotions.
    await c.query("SELECT id FROM users WHERE role IN ('admin','staff') ORDER BY id FOR UPDATE");
    let old;
    if(req.params.id){[[old]]=await c.query('SELECT * FROM users WHERE id=? FOR UPDATE',[req.params.id]);if(!old||old.role==='guest')v.fail(404,'Staff account not found');}
    if(!canRoles&&(chosen!=='receptionist'||(old&&profile(old)!=='receptionist')))v.fail(403,'Only Super Admin can assign privileged roles or manage privileged accounts');
    const inactive=req.body.active===false;
    if(old&&profile(old)==='super_admin'&&(chosen!=='super_admin'||inactive)){
      const [[count]]=await c.query("SELECT COUNT(*) n FROM users WHERE permission_role='super_admin' AND deleted_at IS NULL AND id<>?",[old.id]);
      if(!count.n)v.fail(409,'Cannot remove or demote the last active Super Admin');
    }
    const legacy=['admin','super_admin'].includes(chosen)?'admin':'staff';
    const passwordHash=data.password?await bcrypt.hash(data.password,12):null;
    let id=old?.id;
    if(old){await c.query('UPDATE users SET name=?,email=?,role=?,permission_role=?,deleted_at=?,password_hash=COALESCE(?,password_hash),token_version=token_version+1 WHERE id=?',[data.name,data.email,legacy,chosen,inactive?new Date():null,passwordHash,id]);}
    else{const [r]=await c.query('INSERT INTO users(name,email,password_hash,role,permission_role) VALUES (?,?,?,?,?)',[data.name,data.email,passwordHash,legacy,chosen]);id=r.insertId;}
    await audit(c,req.user,'users',id,old?'staff_updated':'staff_created',`${chosen}; ${inactive?'inactive':'active'}`);return {id};
  });
  realtime.revokeUser(saved.id);await realtime.publish('users','Staff access updated',data.name,saved.id);res.status(req.params.id?200:201).json(saved);
}
router.post('/staff',permit('staff.manage'),saveStaff);router.put('/staff/:id',permit('staff.manage'),saveStaff);
router.post('/staff/:id/reset-password',permit('staff.manage'),async(req,res)=>{
  const password=req.body.password;if(typeof password!=='string'||password.length<12||Buffer.byteLength(password,'utf8')>72)v.fail(400,'New password must be 12–72 characters');
  await transaction(async c=>{
    const [[u]]=await c.query('SELECT * FROM users WHERE id=? FOR UPDATE',[req.params.id]);if(!u||u.role==='guest')v.fail(404,'Staff account not found');
    if(profile(u)!=='receptionist'&&!(await permissions(req.user,c)).includes('roles.manage'))v.fail(403,'Super Admin permission required');
    await c.query('UPDATE users SET password_hash=?,token_version=token_version+1 WHERE id=?',[await bcrypt.hash(password,12),u.id]);await audit(c,req.user,'users',u.id,'password_reset');
  });realtime.revokeUser(req.params.id);res.json({ok:true});
});
router.get('/activity',permit('activity.view'),async(req,res)=>{
  const [rows]=await db.query('SELECT a.*,u.name actor_name FROM activity_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE (? IS NULL OR a.entity_type=?) AND (? IS NULL OR a.entity_id=?) ORDER BY a.id DESC LIMIT 100',[req.query.type||null,req.query.type||null,req.query.id||null,req.query.id||null]);res.json(rows);
});
router.get('/rooms/:id/images',permit('rooms.view'),async(req,res)=>{const [rows]=await db.query('SELECT * FROM room_images WHERE room_id=? ORDER BY id',[req.params.id]);res.json(rows);});
router.post('/rooms/:id/images',permit('rooms.manage'),async(req,res)=>{
  let url;try{const result=await transaction(async c=>{
    const room=await lockRoom(c,req.params.id);if(room.deleted_at)v.fail(404,'Room not found');
    const [[count]]=await c.query('SELECT COUNT(*) n FROM room_images WHERE room_id=?',[room.id]);if(count.n>=12)v.fail(400,'Maximum 12 photos per room');
    url=await uploads.saveImage(req.body.image);const [r]=await c.query('INSERT INTO room_images(room_id,url) VALUES (?,?)',[room.id,url]);
    if(!room.image_url||req.body.primary)await c.query('UPDATE rooms SET image_url=? WHERE id=?',[url,room.id]);
    await audit(c,req.user,'rooms',room.id,'photo_added');return {id:r.insertId,url};
  });await realtime.publish('rooms','Room photos updated','Photo added',req.params.id);res.status(201).json(result);}catch(e){await uploads.removeImage(url);throw e;}
});
for(const method of ['patch','delete'])router[method]('/rooms/:id/images/:imageId',permit('rooms.manage'),async(req,res)=>{
  let removed;
  await transaction(async c=>{const room=await lockRoom(c,req.params.id);const [[image]]=await c.query('SELECT * FROM room_images WHERE id=? AND room_id=?',[req.params.imageId,room.id]);if(!image)v.fail(404,'Photo not found');
    if(method==='patch')await c.query('UPDATE rooms SET image_url=? WHERE id=?',[image.url,room.id]);
    else{await c.query('DELETE FROM room_images WHERE id=?',[image.id]);removed=image.url;if(room.image_url===image.url){const [[next]]=await c.query('SELECT url FROM room_images WHERE room_id=? ORDER BY id LIMIT 1',[room.id]);await c.query('UPDATE rooms SET image_url=? WHERE id=?',[next?.url||null,room.id]);}}
    await audit(c,req.user,'rooms',room.id,method==='patch'?'primary_photo_changed':'photo_removed');
  });await uploads.removeImage(removed);await realtime.publish('rooms','Room photos updated','Room photo updated',req.params.id);res.json({ok:true});
});
router.patch('/rooms/:id/operation',permit('rooms.operation'),async(req,res)=>{
  const status=req.body.status;if(!['available','cleaning','maintenance','out_of_service'].includes(status))v.fail(400,'Invalid operational status. Occupied is controlled by check-in');
  if(['housekeeping','operational_staff'].includes(profile(req.user))&&status==='out_of_service')v.fail(403,'Manager permission required');
  await transaction(async c=>{
    const room=await lockRoom(c,req.params.id);if(room.deleted_at)v.fail(404,'Room not found');
    const [[occupied]]=await c.query("SELECT id FROM bookings WHERE room_id=? AND status='checked_in' AND deleted_at IS NULL LIMIT 1",[room.id]);if(occupied)v.fail(409,'An occupied room cannot change readiness');
    if(['maintenance','out_of_service'].includes(status)){
      const [[reserved]]=await c.query("SELECT id FROM bookings WHERE room_id=? AND deleted_at IS NULL AND status IN ('pending','confirmed') AND check_out>? LIMIT 1",[room.id,v.today()]);if(reserved)v.fail(409,'Reassign active reservations before taking this room out of service');
    }
    if(status==='available'){const [[open]]=await c.query("SELECT id FROM maintenance_records WHERE room_id=? AND status='open' LIMIT 1",[room.id]);if(open)v.fail(409,'Resolve maintenance issues before releasing this room');}
    await c.query('UPDATE rooms SET status=? WHERE id=?',[status,room.id]);await audit(c,req.user,'rooms',room.id,'operational_status',status);
  });await realtime.publish('rooms','Room readiness updated',status,req.params.id);res.json({ok:true});
});
router.get('/maintenance',permit('maintenance.manage'),async(req,res)=>{
  const [items]=await db.query('SELECT m.*,r.name room_name,u.name assigned_name FROM maintenance_records m JOIN rooms r ON r.id=m.room_id LEFT JOIN users u ON u.id=m.assigned_to WHERE (?=0 OR m.assigned_to=? OR m.assigned_to IS NULL) ORDER BY m.id DESC LIMIT 100',[['housekeeping','operational_staff'].includes(profile(req.user))?1:0,req.user.id]);res.json(items);
});
router.post('/maintenance',permit('maintenance.manage'),async(req,res)=>{
  const roomId=v.integer(req.body.room_id,'Room ID',2147483647),description=v.text(req.body.description,'Description',1000);
  const assigned=req.body.assigned_to?v.integer(req.body.assigned_to,'Staff ID',2147483647):null;
  if(assigned&&['housekeeping','operational_staff'].includes(profile(req.user))&&assigned!==req.user.id)v.fail(403,'Cannot assign another staff member');
  const id=await transaction(async c=>{await lockRoom(c,roomId);if(assigned){const [[staff]]=await c.query("SELECT id FROM users WHERE id=? AND deleted_at IS NULL AND role<>'guest'",[assigned]);if(!staff)v.fail(400,'Invalid assignee');}
    const [r]=await c.query('INSERT INTO maintenance_records(room_id,assigned_to,description,created_by) VALUES (?,?,?,?)',[roomId,assigned,description,req.user.id]);await audit(c,req.user,'rooms',roomId,'maintenance_reported',description);return r.insertId;
  });await realtime.publish('rooms','Maintenance requested',description,roomId);res.status(201).json({id});
});
router.patch('/maintenance/:id',permit('maintenance.manage'),async(req,res)=>{
  await transaction(async c=>{const [[m]]=await c.query('SELECT * FROM maintenance_records WHERE id=? FOR UPDATE',[req.params.id]);if(!m)v.fail(404,'Task not found');
    if(['housekeeping','operational_staff'].includes(profile(req.user))&&m.assigned_to&&m.assigned_to!==req.user.id)v.fail(403,'Task assigned to another staff member');
    if(m.status!=='open')v.fail(409,'Task already resolved');await c.query("UPDATE maintenance_records SET status='resolved',workflow_status='completed',resolved_at=NOW(),resolved_by=? WHERE id=?",[req.user.id,m.id]);await audit(c,req.user,'rooms',m.room_id,'maintenance_resolved',m.description);
  });await realtime.publish('rooms','Maintenance resolved','Room issue resolved',null);res.json({ok:true});
});
router.get('/settings',permit('settings.view'),async(req,res)=>{const [[row]]=await db.query('SELECT name,contact,address,currency_display FROM resort_settings WHERE id=1');res.json(row);});
router.put('/settings',permit('settings.manage'),async(req,res)=>{const name=v.text(req.body.name,'Resort name',150),contact=v.text(req.body.contact,'Contact',500,false);await transaction(async c=>{await c.query('UPDATE resort_settings SET name=?,contact=? WHERE id=1',[name,contact]);await audit(c,req.user,'settings',1,'settings_updated');});res.json({ok:true});});
module.exports=router;
