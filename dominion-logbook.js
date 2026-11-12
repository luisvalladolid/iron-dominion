
(()=>{'use strict';
const KEY='iron_dominion_training_v1', byId=id=>document.getElementById(id);
const PRESETS={A:'Explosive Power',B:'Functional Strength',C:'Conditioning',D:'Recovery & Mobility'};
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}};
const persist=s=>{try{localStorage.setItem(KEY,JSON.stringify(s));window.dispatchEvent(new Event('iron-dominion-history-synced'))}catch{}};
const duration=ms=>{const m=Math.round((ms||0)/60000);return m<60?m+' min':Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'m'};
const localDate=value=>{if(!value)return new Date();if(/^\d{4}-\d{2}-\d{2}$/.test(value))return new Date(value+'T12:00:00');const d=new Date(value);return Number.isNaN(+d)?new Date():d};
const keyDate=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const safe=text=>String(text??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
function entries(){return (read().history||[]).filter(Boolean).slice().sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')))}
function updateEntry(id,patch){const state=read();const hit=(state.history||[]).find(e=>(e.cloudId||e.createdAt||e.date)===id);if(!hit)return;Object.assign(hit,patch);persist(state);renderLogbook()}
function renderLogbook(){
const hist=entries(),totalSets=hist.reduce((s,x)=>s+(x.completed||0),0),minutes=Math.round(hist.reduce((s,x)=>s+(x.ms||0),0)/60000),days=new Set(hist.map(h=>h.date||keyDate(localDate(h.createdAt))));
let streak=0;const today=new Date();today.setHours(12,0,0,0);const cursor=new Date(today);if(!days.has(keyDate(cursor)))cursor.setDate(cursor.getDate()-1);for(let i=0;i<366&&days.has(keyDate(cursor));i++,cursor.setDate(cursor.getDate()-1))streak++;
const stats=[['Workouts',hist.length],['Total sets',totalSets],['Training time',duration(minutes*60000)],['Day streak',streak]];
byId('log-metrics').innerHTML=stats.map(([name,value])=>'<div class="log-metric"><strong>'+safe(value)+'</strong><span>'+safe(name)+'</span></div>').join('');
const weekdays=['S','M','T','W','T','F','S'];const weekStart=new Date(today);weekStart.setDate(today.getDate()-6);
byId('log-days').innerHTML=Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(d.getDate()+i);const trained=days.has(keyDate(d));return '<div class="log-day '+(trained?'trained':'')+'" title="'+safe(keyDate(d))+'"><strong>'+(trained?'✓':weekdays[d.getDay()])+'</strong><span>'+d.getDate()+'</span></div>'}).join('');
const wrap=byId('log-entries');if(!hist.length){wrap.innerHTML='<div class="log-empty">◉<h3>No sessions recorded yet</h3><p>Complete your first workout to begin your training story.</p></div>';return}
wrap.innerHTML=hist.map((h,i)=>{const d=localDate(h.date||h.createdAt),id=h.cloudId||h.createdAt||h.date,detail=Array.isArray(h.exerciseLog)?h.exerciseLog:[],progress=(h.completed||0)+' / '+(h.total||0)+' sets';
const rows=detail.length?'<table><thead><tr><th>Exercise</th><th>Sets</th><th>Target</th></tr></thead><tbody>'+detail.map(e=>'<tr><td>'+safe(e.name)+'</td><td>'+safe(e.completed)+' / '+safe(e.sets)+'</td><td>'+safe(e.target)+'</td></tr>').join('')+'</tbody></table>':'<p class="sm muted">Detailed exercise breakdown was not recorded for this earlier session.</p>';
return '<details class="log-entry" data-log-index="'+i+'"><summary><div class="log-date"><b>'+d.getDate()+'</b><small>'+d.toLocaleString('en-US',{month:'short'})+'</small></div><div class="log-entry-title"><strong>'+safe(PRESETS[h.day]||h.day||'Workout')+'</strong><small>'+safe(duration(h.ms))+' · '+safe(progress)+'</small></div><span class="log-expand">＋</span></summary><div class="log-details">'+rows+'<label for="note-'+i+'">Training notes</label><textarea maxlength="2000" id="note-'+i+'" placeholder="How did the session feel? Technique, load, recovery…">'+safe(h.note||'')+'</textarea><label for="effort-'+i+'">Session difficulty (RPE)</label><select id="effort-'+i+'"><option value="">Not rated</option>'+Array.from({length:10},(_,j)=>'<option value="'+(j+1)+'" '+(String(h.effort||'')===String(j+1)?'selected':'')+'>'+ (j+1)+' / 10'+(j===5?' · Moderate':j===7?' · Hard':j===9?' · Maximal':'')+'</option>').join('')+'</select><div class="log-actions"><button data-save-log="'+i+'" class="primary">Save entry</button></div></div></details>'
}).join('');
wrap.querySelectorAll('[data-save-log]').forEach(button=>button.onclick=()=>{const i=Number(button.dataset.saveLog),h=hist[i];updateEntry(h.cloudId||h.createdAt||h.date,{note:byId('note-'+i).value,effort:byId('effort-'+i).value});const toast=byId('toast');if(toast){toast.textContent='Logbook updated ✓';toast.style.display='block';setTimeout(()=>toast.style.display='none',2300)}});
}
byId('logbook-export').addEventListener('click',()=>{const rows=[['Date','Workout','Duration (minutes)','Sets completed','Sets planned','Difficulty','Notes','Exercise breakdown'],...entries().map(h=>[h.date||'',PRESETS[h.day]||h.day||'',Math.round((h.ms||0)/60000),h.completed||0,h.total||0,h.effort||'',h.note||'',(h.exerciseLog||[]).map(e=>e.name+': '+e.completed+'/'+e.sets+' ('+e.target+')').join('; ')])];const csv=rows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='iron-dominion-logbook.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
window.addEventListener('iron-dominion-workout-completed',renderLogbook);window.addEventListener('iron-dominion-history-synced',renderLogbook);renderLogbook();
})();
