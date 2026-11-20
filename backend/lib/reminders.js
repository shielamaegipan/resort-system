const {createHash}=require('node:crypto');
const db=require('../db'),v=require('./validation'),{publish}=require('./realtime');
async function run(){
  const today=v.today(),tomorrow=new Date(Date.parse(today)+86400000).toISOString().slice(0,10);
  const [rows]=await db.query("SELECT id,guest_name,check_in,check_out,status FROM bookings WHERE deleted_at IS NULL AND ((check_in IN (?,?) AND status='confirmed') OR (check_out IN (?,?) AND status='checked_in'))",[today,tomorrow,today,tomorrow]);
  for(const b of rows){const arrival=b.status==='confirmed',date=arrival?b.check_in:b.check_out,kind=arrival?'check-in':'check-out';
    const key=createHash('sha256').update(`${b.id}:${kind}:${date}:${today}`).digest('hex').slice(0,32);
    await publish('bookings',`Upcoming ${kind}`,`${b.guest_name} · ${date}`,b.id,`${key.slice(0,8)}-${key.slice(8,12)}-${key.slice(12,16)}-${key.slice(16,20)}-${key.slice(20)}`);
  }
}
function start(){let running=false;const tick=async()=>{if(running)return;running=true;try{await run();}catch(e){console.error('Reminder delivery failed:',e.message);}finally{running=false;}};tick();const timer=setInterval(tick,60000);timer.unref();return ()=>clearInterval(timer);}
module.exports={run,start};
