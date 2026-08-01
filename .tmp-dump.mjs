import puppeteer from 'puppeteer-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const base = join(process.cwd(), '.browser', 'chrome-headless-shell');
const exe = readdirSync(base).map(v => join(base, v, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')).find(existsSync);
const browser = await puppeteer.launch({ executablePath: exe, headless: true, acceptInsecureCerts: true, userDataDir: join(tmpdir(),'ca-dump-'+Date.now()), args:['--no-sandbox','--disable-gpu','--ignore-certificate-errors'] });
const page = await browser.newPage();
await page.goto('https://localhost:4173/', { waitUntil:'networkidle0' });
await page.evaluate(() => [...document.querySelectorAll('.tab')].find(b=>b.textContent.trim().startsWith('Scan')).click());
await new Promise(r=>setTimeout(r,400));

// Instrument the OCR engine directly, so both the text stream and the word
// boxes are visible.
const result = await page.evaluate(async () => {
  const mod = await import('./assets/' + [...document.querySelectorAll('script[type=module]')].map(s=>s.src.split('/assets/')[1])[0]);
  return null;
}).catch(() => null);

const before = await page.evaluate(() => document.querySelectorAll('.doc-row').length);
await page.evaluate(() => {
  const c=document.createElement('canvas'); c.width=1240;c.height=700;
  const g=c.getContext('2d'); g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.fillStyle='#111';
  const rows=[['WBC','4.42','10/9','(4.5- 17.0)'],['NEUTROPHILS','68.6','%','(40 - 75)'],['HAEMOGLOBIN','13.0','g/dl','(11.5 - 15.5)'],['PLATELET','187','10^9/L','(100- 400)'],['MPV','11.0','Fl','(9 - 13)']];
  const x0=55,y0=60,w=1130,cols=[0,175,460,700,860,1130],rowH=58,total=rows.length+1;
  g.strokeStyle='#222';g.lineWidth=2;
  for(let r=0;r<=total;r++){g.beginPath();g.moveTo(x0,y0+r*rowH);g.lineTo(x0+w,y0+r*rowH);g.stroke();}
  for(const cx of cols){g.beginPath();g.moveTo(x0+cx,y0);g.lineTo(x0+cx,y0+total*rowH);g.stroke();}
  g.font='20px Arial';
  const cell=(t,c2,r)=>g.fillText(t,x0+cols[c2]+14,y0+r*rowH+38);
  cell('Investigation',0,0);cell('Parameters',1,0);cell('Result',2,0);cell('Unit',3,0);cell('Normal Range',4,0);
  rows.forEach((r,i)=>{if(i===0)cell('FBC',0,i+1);cell(r[0],1,i+1);cell(r[1],2,i+1);cell(r[2],3,i+1);cell(r[3],4,i+1);});
  c.toBlob(b=>{const dt=new DataTransfer();dt.items.add(new File([b],'dump.png',{type:'image/png'}));const i=[...document.querySelectorAll('input[type=file]')].find(x=>x.accept.includes('image'));i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));},'image/png');
});
await page.waitForFunction(n=>document.querySelectorAll('.doc-row').length>n,{timeout:180000},before);
await new Promise(r=>setTimeout(r,900));
await page.evaluate(()=>{const row=[...document.querySelectorAll('.doc-row')].find(r=>r.textContent.includes('dump.png'));[...row.querySelectorAll('button')].find(b=>b.textContent.includes('View text')).click();});
await new Promise(r=>setTimeout(r,400));
const raw = await page.evaluate(()=>document.querySelector('.raw-text')?.innerText ?? 'NONE');
console.log('=== RAW OCR TEXT ===');
console.log(raw);
await browser.close();
