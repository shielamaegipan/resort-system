// Explicit local provisioning; never promotes a user automatically.
require('dotenv').config();
const db=require('./db');
async function main(){
  const email=process.argv[2];if(!email)throw new Error('Usage: node bootstrap-super-admin.js existing-admin-email');
  await require('./migrate-admin')();await require('./migrate-platform')();
  await require('./migrate-advanced')();
  await require('./lib/booking-service').transaction(async c=>{
    const [[user]]=await c.query("SELECT * FROM users WHERE email=? AND role='admin' AND deleted_at IS NULL FOR UPDATE",[email]);
    if(!user)throw new Error('An existing active administrator is required');
    await c.query("UPDATE users SET permission_role='super_admin',token_version=token_version+1 WHERE id=?",[user.id]);
    await require('./lib/permissions').audit(c,user,'users',user.id,'local_super_admin_bootstrap');
  });console.log('Super Admin profile assigned. Sign in again.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.end());
