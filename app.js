const statusPill=document.getElementById("statusPill");
const scoreEl=document.getElementById("score");
const verdictEl=document.getElementById("verdict");
const spotNameEl=document.getElementById("spotName");
const factorListEl=document.getElementById("factorList");
const currentDetailEl=document.getElementById("currentDetail");
const bestHoursListEl=document.getElementById("bestHoursList");
const solunarInfoEl=document.getElementById("solunarInfo");
const hourlyTableEl=document.getElementById("hourlyTable");
const savedSpotsEl=document.getElementById("savedSpots");
const pressureBadgeEl=document.getElementById("pressureBadge");
const bestWindowBadgeEl=document.getElementById("bestWindowBadge");
const moonBadgeEl=document.getElementById("moonBadge");
const locationInput=document.getElementById("locationInput");
const speciesSelect=document.getElementById("speciesSelect");
const waterTypeSelect=document.getElementById("waterTypeSelect");
const saveSpotBtn=document.getElementById("saveSpotBtn");

const storageKey="fish_predictor_pro_v4_spots";
let currentLocation=null;
let currentLabel="";

const map=L.map("map").setView([-7.2575,112.7521],10);
let marker=null;

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"&copy; OpenStreetMap"}).addTo(map);

map.on("click",(e)=>{currentLabel="Spot pin peta";setLocation(e.latlng.lat,e.latlng.lng,currentLabel);});

document.getElementById("searchBtn").addEventListener("click",searchLocation);
document.getElementById("gpsBtn").addEventListener("click",getGPS);
speciesSelect.addEventListener("change",rerunIfReady);
waterTypeSelect.addEventListener("change",rerunIfReady);
saveSpotBtn.addEventListener("click",saveSpot);

document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".tabcontent").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-"+btn.dataset.tab).classList.add("active");
  });
});

renderSavedSpots();

function setStatus(text,mode="ok"){
  statusPill.textContent=text;
  if(mode==="warn"){statusPill.style.background="rgba(245,158,11,.15)";statusPill.style.color="#ffd27d";}
  else if(mode==="bad"){statusPill.style.background="rgba(255,77,109,.15)";statusPill.style.color="#ffb4c2";}
  else {statusPill.style.background="rgba(57,213,158,.15)";statusPill.style.color="#a5f1d2";}
}
function rerunIfReady(){if(currentLocation){getForecast(currentLocation.lat,currentLocation.lon);}}
function setLocation(lat,lon,label){
  currentLocation={lat,lon};
  if(marker) map.removeLayer(marker);
  marker=L.marker([lat,lon]).addTo(map);
  map.setView([lat,lon],12);
  spotNameEl.textContent=label||"Lokasi dipilih";
  getForecast(lat,lon);
}
function getGPS(){
  if(!navigator.geolocation){alert("Browser tidak mendukung GPS.");return;}
  setStatus("Mencari GPS...","warn");
  navigator.geolocation.getCurrentPosition(
    (pos)=>{currentLabel="Lokasi GPS";setLocation(pos.coords.latitude,pos.coords.longitude,currentLabel);},
    (err)=>{setStatus("GPS gagal","bad");alert("GPS gagal: "+err.message);},
    {enableHighAccuracy:true,timeout:12000,maximumAge:0}
  );
}
async function searchLocation(){
  const q=locationInput.value.trim();
  if(!q){alert("Masukkan nama lokasi.");return;}
  setStatus("Mencari lokasi...","warn");
  try{
    const res=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=id&format=json`);
    const data=await res.json();
    if(!data.results||!data.results.length){setStatus("Lokasi tidak ditemukan","bad");alert("Lokasi tidak ditemukan.");return;}
    const first=data.results[0];
    currentLabel=[first.name,first.admin1,first.country].filter(Boolean).join(", ");
    setLocation(first.latitude,first.longitude,currentLabel);
  }catch(err){
    setStatus("Cari lokasi gagal","bad");
    alert("Pencarian lokasi gagal. Cek koneksi internet.");
  }
}
async function getForecast(lat,lon){
  setStatus("Mengambil forecast...","warn");
  try{
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=3&hourly=temperature_2m,relative_humidity_2m,precipitation,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m&daily=sunrise,sunset`;
    const res=await fetch(url);
    const data=await res.json();
    renderForecast(data);
    setStatus("Data diperbarui");
  }catch(err){
    setStatus("Forecast gagal","bad");
    alert("Gagal mengambil data forecast.");
  }
}
function renderForecast(data){
  const h=data.hourly;
  const daily=data.daily||{};
  const moon=moonPhaseInfo(new Date(h.time[0]));
  const sunrise=daily.sunrise?.[0]||null;
  const sunset=daily.sunset?.[0]||null;
  const hours=[];
  const count=Math.min(48,h.time.length);
  for(let i=0;i<count;i++){
    const item={
      time:h.time[i],
      temperature:num(h.temperature_2m[i]),
      humidity:num(h.relative_humidity_2m[i]),
      rain:num(h.precipitation[i]),
      cloud:num(h.cloud_cover[i]),
      pressure:num(h.pressure_msl[i]),
      wind:num(h.wind_speed_10m[i]),
      windDir:num(h.wind_direction_10m[i]),
    };
    item.score=computeScore(item,sunrise,sunset,moon);
    hours.push(item);
  }
  const now=hours[0];
  const pressureTrend=getPressureTrend(hours);
  const best=[...hours].sort((a,b)=>b.score-a.score).slice(0,5);

  scoreEl.textContent=now.score+"/100";
  verdictEl.textContent=verdict(now.score);
  bestWindowBadgeEl.textContent="Jam terbaik "+shortHour(best[0].time);
  pressureBadgeEl.textContent="Tekanan "+pressureTrend.label;
  moonBadgeEl.textContent="Bulan "+moon.label;

  factorListEl.innerHTML=buildFactorRows(now,pressureTrend,moon).join("");
  currentDetailEl.innerHTML=
    row("Suhu",`${now.temperature}°C`)+
    row("Kelembapan",`${now.humidity}%`)+
    row("Tekanan",`${now.pressure} hPa`)+
    row("Angin",`${now.wind} km/h`)+
    row("Arah angin",`${Math.round(now.windDir)}°`)+
    row("Awan",`${now.cloud}%`)+
    row("Hujan",`${now.rain} mm`)+
    row("Target ikan",speciesSelect.options[speciesSelect.selectedIndex].text)+
    row("Perairan",waterTypeSelect.options[waterTypeSelect.selectedIndex].text);

  bestHoursListEl.innerHTML=best.map((item,idx)=>`
    <div class="best-item">
      <span>${idx+1}. ${fmtHour(item.time)}</span>
      <span class="${scoreClass(item.score)}">${item.score}/100</span>
    </div>`).join("");

  const major1=sunrise?addMinutes(sunrise,-45)+" - "+addMinutes(sunrise,75):"-";
  const major2=sunset?addMinutes(sunset,-60)+" - "+addMinutes(sunset,75):"-";
  const minor=best.slice(0,2).map(x=>shortHour(x.time)).join(" • ");
  solunarInfoEl.innerHTML=
    row("Moon phase",moon.label)+
    row("Moon illumination",`${moon.illumination}%`)+
    row("Sunrise major",major1)+
    row("Sunset major",major2)+
    row("Minor window",minor||"-")+
    row("Saran",tip(now.score,moon));

  hourlyTableEl.innerHTML=hours.map(item=>`
    <div class="hour-row">
      <span class="hour-time">${fmtHour(item.time)}</span>
      <span>${item.temperature}°C</span>
      <span>${item.pressure} hPa</span>
      <span>${item.wind} km/h</span>
      <span class="${scoreClass(item.score)}">${item.score}</span>
    </div>`).join("");

  drawChart(hours);
}
function computeScore(item,sunrise,sunset,moon){
  let score=46;
  score+=tempPoints(item.temperature);
  score+=pressurePoints(item.pressure);
  score+=windPoints(item.wind);
  score+=cloudPoints(item.cloud);
  score+=rainPoints(item.rain);
  score+=humidityPoints(item.humidity);
  score+=daylightPoints(item.time,sunrise,sunset);
  score+=moonPoints(moon);
  score+=speciesPoints(item);
  score+=waterTypePoints(item);
  return clamp(Math.round(score),5,100);
}
function tempPoints(t){
  if(waterTypeSelect.value==="saltwater"){if(t>=24&&t<=30) return 12;if(t>=22&&t<=32) return 6;return -5;}
  if(t>=24&&t<=29) return 12;if(t>=22&&t<=31) return 6;return -5;
}
function pressurePoints(p){if(p>=1012&&p<=1019) return 12;if(p>=1008&&p<=1022) return 7;return -6;}
function windPoints(w){if(w>=4&&w<=14) return 12;if(w>14&&w<=20) return 4;if(w<4) return 3;return -8;}
function cloudPoints(c){if(c>=35&&c<=75) return 8;if(c>75) return 3;return 0;}
function rainPoints(r){if(r>0&&r<=1.2) return 6;if(r>1.2&&r<=4) return 1;if(r>4) return -9;return 1;}
function humidityPoints(h){if(h>=70&&h<=90) return 5;if(h>=55&&h<70) return 2;return -1;}
function daylightPoints(timeIso,sunrise,sunset){
  if(!sunrise||!sunset) return 0;
  const m=minutesOfDay(timeIso),rise=minutesOfDay(sunrise),set=minutesOfDay(sunset);
  if(Math.abs(m-rise)<=70) return 10;
  if(Math.abs(m-set)<=90) return 10;
  if(m>=rise+60&&m<=set-120) return 2;
  if(m>set+60||m<rise-60) return 1;
  return 0;
}
function moonPoints(moon){if(moon.phaseValue>=0.42&&moon.phaseValue<=0.62) return 5;if(moon.phaseValue>=0.9||moon.phaseValue<=0.1) return 4;return 2;}
function speciesPoints(item){
  const sp=speciesSelect.value;
  if(sp==="nila") return (item.temperature>=25&&item.temperature<=30?5:0)+(item.cloud>=35?2:0);
  if(sp==="lele") return (item.cloud>=50?4:0)+(item.rain<=1.5?2:0);
  if(sp==="patin") return (item.temperature>=24&&item.temperature<=29?5:0);
  if(sp==="gabus") return (item.cloud>=45?4:0)+(item.wind<=12?2:0);
  if(sp==="kakap") return (item.wind>=5&&item.wind<=18?4:0)+(item.temperature>=25&&item.temperature<=30?3:0);
  if(sp==="tuna") return (item.wind>=8&&item.wind<=18?5:-1)+(item.pressure>=1010?2:0);
  return 0;
}
function waterTypePoints(item){
  const wt=waterTypeSelect.value;
  if(wt==="freshwater") return item.wind<=15?2:0;
  if(wt==="brackish") return item.rain<=2?2:0;
  if(wt==="saltwater") return item.wind>=5&&item.wind<=18?3:0;
  return 0;
}
function buildFactorRows(now,pressureTrend,moon){
  const list=[
    factor("Suhu",now.temperature+"°C",tempPoints(now.temperature)),
    factor("Tekanan",now.pressure+" hPa",pressurePoints(now.pressure)),
    factor("Angin",now.wind+" km/h",windPoints(now.wind)),
    factor("Awan",now.cloud+"%",cloudPoints(now.cloud)),
    factor("Hujan",now.rain+" mm",rainPoints(now.rain)),
    factor("Fase bulan",moon.label,moonPoints(moon)),
    factor("Trend tekanan",pressureTrend.label,pressureTrend.score),
  ];
  return list.map(item=>`<div class="factor-item"><span class="name">${item.name}</span><span class="${grade(item.points)}">${item.note}</span></div>`);
}
function factor(name,note,points){return {name,note,points};}
function grade(points){return points>=6?"good":points>=2?"mid":"bad";}
function scoreClass(score){return score>=78?"good":score>=62?"mid":"bad";}
function verdict(score){if(score>=82) return "Sangat potensial";if(score>=68) return "Bagus untuk mancing";if(score>=54) return "Cukup potensial";return "Kurang ideal";}
function tip(score,moon){if(score>=82) return "Fokus 1-3 jam ke depan, prioritaskan pinggir struktur.";if(score>=68) return "Cocok untuk mencoba spot teduh atau tepi arus.";if(moon.phaseValue>=0.45&&moon.phaseValue<=0.55) return "Manfaatkan perubahan cahaya pagi dan sore.";return "Tunggu fase transisi waktu atau tekanan lebih stabil.";}
function getPressureTrend(hours){const first=hours[0]?.pressure||0,later=hours[3]?.pressure||first,diff=later-first;if(diff>1.5) return {label:"naik",score:6};if(diff<-1.5) return {label:"turun",score:-3};return {label:"stabil",score:3};}
function moonPhaseInfo(date){
  const synodicMonth=29.53058867;
  const knownNewMoon=Date.UTC(2000,0,6,18,14,0);
  const days=(date.getTime()-knownNewMoon)/86400000;
  const phase=((days%synodicMonth)+synodicMonth)%synodicMonth;
  const phaseValue=phase/synodicMonth;
  const illumination=Math.round((1-Math.cos(2*Math.PI*phaseValue))*50);
  let label="Crescent";
  if(phaseValue<0.03||phaseValue>0.97) label="New Moon";
  else if(phaseValue<0.22) label="Waxing Crescent";
  else if(phaseValue<0.28) label="First Quarter";
  else if(phaseValue<0.47) label="Waxing Gibbous";
  else if(phaseValue<0.53) label="Full Moon";
  else if(phaseValue<0.72) label="Waning Gibbous";
  else if(phaseValue<0.78) label="Last Quarter";
  else label="Waning Crescent";
  return {label,illumination,phaseValue};
}
function drawChart(hours){
  const canvas=document.getElementById("activityChart");
  const ctx=canvas.getContext("2d");
  const rect=canvas.getBoundingClientRect();
  const dpr=window.devicePixelRatio||1;
  canvas.width=Math.max(320,rect.width*dpr);
  canvas.height=170*dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const w=rect.width,h=170;
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle="rgba(255,255,255,.08)";
  for(let i=0;i<4;i++){const y=18+i*36;ctx.beginPath();ctx.moveTo(10,y);ctx.lineTo(w-10,y);ctx.stroke();}
  const padX=16,padY=18,chartW=w-padX*2,chartH=h-padY*2;
  ctx.beginPath();
  hours.forEach((item,idx)=>{const x=padX+(idx/(hours.length-1))*chartW;const y=padY+chartH-(item.score/100)*chartH;if(idx===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);});
  ctx.strokeStyle="#39d59e";ctx.lineWidth=3;ctx.stroke();
  ctx.fillStyle="#a8f3d5";
  hours.forEach((item,idx)=>{if(idx%3!==0&&idx!==hours.length-1) return;const x=padX+(idx/(hours.length-1))*chartW;const y=padY+chartH-(item.score/100)*chartH;ctx.beginPath();ctx.arc(x,y,2.8,0,Math.PI*2);ctx.fill();});
  ctx.fillStyle="#9eb5c7";ctx.font="11px Arial";
  [0,12,24,36,47].forEach(i=>{const item=hours[i];if(!item) return;const x=padX+(i/(hours.length-1))*chartW;ctx.fillText(shortHour(item.time),x-10,h-8);});
}
function saveSpot(){
  if(!currentLocation){alert("Pilih lokasi dulu.");return;}
  const name=prompt("Nama spot:",currentLabel||"Spot mancing");
  if(!name) return;
  const list=getSavedSpots();
  list.unshift({name,lat:currentLocation.lat,lon:currentLocation.lon,species:speciesSelect.value,waterType:waterTypeSelect.value});
  localStorage.setItem(storageKey,JSON.stringify(list.slice(0,15)));
  renderSavedSpots();
  alert("Spot berhasil disimpan.");
}
function getSavedSpots(){try{return JSON.parse(localStorage.getItem(storageKey)||"[]");}catch(e){return [];}}
function renderSavedSpots(){
  const list=getSavedSpots();
  if(!list.length){savedSpotsEl.innerHTML='<div class="empty">Belum ada spot favorit.</div>';return;}
  savedSpotsEl.innerHTML=list.map((spot,idx)=>`
    <div class="spot-item">
      <div><div>${spot.name}</div><div class="muted">${spot.species} • ${spot.waterType}</div></div>
      <div class="spot-actions">
        <button class="small-btn" onclick="openSpot(${idx})">Buka</button>
        <button class="small-btn" onclick="removeSpot(${idx})">Hapus</button>
      </div>
    </div>`).join("");
}
window.openSpot=function(idx){
  const spot=getSavedSpots()[idx]; if(!spot) return;
  speciesSelect.value=spot.species||"general";
  waterTypeSelect.value=spot.waterType||"freshwater";
  currentLabel=spot.name;
  setLocation(spot.lat,spot.lon,spot.name);
}
window.removeSpot=function(idx){
  const list=getSavedSpots(); list.splice(idx,1);
  localStorage.setItem(storageKey,JSON.stringify(list));
  renderSavedSpots();
}
function row(a,b){return `<div class="row"><span class="name">${a}</span><span>${b}</span></div>`;}
function fmtHour(iso){return new Date(iso).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});}
function shortHour(iso){return new Date(iso).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});}
function minutesOfDay(iso){const d=new Date(iso);return d.getHours()*60+d.getMinutes();}
function addMinutes(iso,mins){const d=new Date(iso);d.setMinutes(d.getMinutes()+mins);return d.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});}
function num(v){return Number.isFinite(v)?Math.round(v*10)/10:0;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
