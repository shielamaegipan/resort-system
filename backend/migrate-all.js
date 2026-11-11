const db=require('./db');
async function run(){await require('./migrate-admin')();await require('./migrate-platform')();await require('./migrate-advanced')();}
run().then(()=>console.log('All migrations complete')).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.end());
