
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{createRequire}=require('node:module'),{randomBytes}=require('node:crypto'),assert=require('node:assert/strict');
const root=process.cwd(),front=createRequire(path.join(root,'frontend/package.json')),{chromium}=front('@playwright/test');
const dir=path.join(root,'test-results/ui-preservation'),database='resort_platform_verify_1794398776515',children=[];let browser;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function start(file,args,cwd,env){const child=spawn(process.execPath,[file,...args],{cwd,env:{...process.env,...env},windowsHide:true,stdio:'ignore'});children.push(child);}
(async()=>{
start(path.join(root,'backend/server.js'),[],path.join(root,'backend'),{DB_NAME:database,PORT:'4111',JWT_SECRET:randomBytes(32).toString('hex'),CLIENT_ORIGIN:'http://127.0.0.1:5189'});
start(path.join(root,'frontend/node_modules/vite/bin/vite.js'),['--host','127.0.0.1','--port','5189','--strictPort'],path.join(root,'frontend'),{API_PROXY_TARGET:'http://127.0.0.1:4111'});
for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5189')).ok&&(await fetch('http://127.0.0.1:4111/api/ops/dashboard')).status===401)break;}catch{}await delay(150);}
browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const page=await browser.newPage({viewport:{width:1536,height:864}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5189');await page.getByLabel('Email',{exact:true}).fill('admin@resort.com');await page.getByLabel('Password',{exact:true}).fill('admin123');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('heading',{name:'Rooms',exact:true}).waitFor();
const result={};for(const [nav,title] of [['Rooms','Rooms'],['Bookings','Bookings'],['Users','Staff Accounts'],['Reports','Reports']]){
 await page.getByRole('navigation').getByRole('button',{name:nav,exact:true}).click();await page.getByRole('heading',{name:title,exact:true}).waitFor();await page.waitForFunction(()=>document.querySelectorAll('.admin-skeleton').length===0&&!document.querySelector('.admin-updating'));await page.evaluate(()=>document.fonts.ready);await delay(250);
 result[nav]=await page.evaluate(()=>{const data={};for(const selector of ['.classic-sidebar','.brand','.classic-content','.classic-content>header','.classic-content h1','.admin-room-grid','.admin-room','.card','.stats','.searchbar','.sidebar nav button','.header-actions .primary']){const element=document.querySelector(selector);if(!element)continue;const s=getComputedStyle(element),r=element.getBoundingClientRect();data[selector]={x:r.x,y:r.y,width:r.width,height:r.height,color:s.color,background:s.backgroundColor,fontFamily:s.fontFamily,fontSize:s.fontSize,padding:s.padding,border:s.border,borderRadius:s.borderRadius,gap:s.gap};}data.nav=[...document.querySelectorAll('.sidebar nav button')].map(b=>b.textContent);return data;});
 await page.screenshot({path:path.join(dir,(process.argv.includes('--baseline')?'before-':'after-')+nav.toLowerCase()+'.png'),fullPage:true});
}
if(process.argv.includes('--baseline')){fs.writeFileSync(path.join(dir,'baseline.json'),JSON.stringify(result,null,2));console.log('Captured baseline layout and screenshots for Rooms, Bookings, Users and Reports.');}
else{assert.deepEqual(result,JSON.parse(fs.readFileSync(path.join(dir,'baseline.json'),'utf8')));console.log('PASS original sidebar, page/card positions, spacing, fonts, colors, borders and buttons are unchanged on all four pages.');}
assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();for(const child of children)child.kill();});
