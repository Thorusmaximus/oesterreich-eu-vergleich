// Gemeinsame Hilfsfunktionen für Überblick und Detailseiten
var D = window.DATEN;
var FDEZ = 1, SUF = " %", DIFF = "Prozentpunkte"; // Dezimalstellen, Einheitszeichen und Differenz-Einheit des aktuellen Indikators
function setzeEinheit(i){ FDEZ = i.dez || 1; SUF = i.suffix != null ? i.suffix : " %"; DIFF = i.diffEinheit || "Prozentpunkte"; }
function f(x){ return x==null ? "–" : x.toLocaleString("de-AT",{minimumFractionDigits:FDEZ,maximumFractionDigits:FDEZ}); }
function sgn(x){ return (x>0?"+":"") + f(x); }
// Periode als Text: "2026-08" -> "August 2026", "2026-Q3" -> "3. Quartal 2026", "2025" -> "2025"
function periode(t){
  if(/^\d{4}$/.test(t)) return t;
  var hh = /^(\d{4})-S([12])$/.exec(t);
  if(hh) return hh[2]+". Halbjahr "+hh[1];
  var q = /^(\d{4})-Q([1-4])$/.exec(t);
  if(q) return q[2]+". Quartal "+q[1];
  return new Date(t+"-01T12:00:00").toLocaleDateString("de-AT",{month:"long",year:"numeric"});
}
// Liegt der Datenstand vor, im oder nach dem Amtsantritt? "vor" | "teil" | "nach" | null
function amtsLage(i){
  if(i.art==="rating" || !i.periode || !D.regierung) return null;
  var rs=D.regierung.start.split("-"), s0=+rs[0]*12 + +rs[1], p=String(i.periode), m, y, a, b;
  if((m=/^(\d{4})-(\d{2})$/.exec(p))){ a=b=+m[1]*12 + +m[2]; }
  else if((m=/^(\d{4})-Q(\d)$/.exec(p))){ y=+m[1]*12; a=y+(+m[2]-1)*3+1; b=y+ +m[2]*3; }
  else if((m=/^(\d{4})-S(\d)$/.exec(p))){ y=+m[1]*12; a=y+(+m[2]-1)*6+1; b=y+ +m[2]*6; }
  else if((m=/^(\d{4})$/.exec(p))){ a=+m[1]*12+1; b=+m[1]*12+12; }
  else return null;
  return b<s0 ? "vor" : a>s0 ? "nach" : "teil";
}
function amtsPille(i){
  var l=amtsLage(i);
  return l==="vor" ? '<span class="lage vor">vor Amtsantritt</span>' : '';
}
function amtsHinweis(i){
  var l=amtsLage(i), d=datum(D.regierung.start);
  return l==="vor" ? 'Der jüngste Datenstand ('+periode(i.periode)+') liegt vor dem Amtsantritt am '+d+'. Die Zahlen zeigen die Lage davor, nicht die Entwicklung seit dem Amtsantritt.'
       : l==="teil" ? 'Der Datenstand ('+periode(i.periode)+') umfasst den Amtsantritt am '+d+'. Der Wert enthält also auch Zeit davor.' : '';
}
function datum(t){ return new Date(t+"T12:00:00").toLocaleDateString("de-AT"); }
function pfeil(r){ return r==="steigend" ? "↑" : r==="sinkend" ? "↓" : "→"; }
// Trendpfeil nach Urteil: besser = nach oben (grün), unverändert = seitwärts, schlechter = nach unten (rot)
function trendPfeil(u){ return u==="besser" ? "↑" : u==="schlechter" ? "↓" : u==="unverändert" ? "→" : ""; }
// Pfeilsymbol: "urteil" = nach oben heißt besser; "wert" = Pfeil folgt dem Zahlenwert (z. B. Arbeitslosenquote sinkt = Pfeil nach unten, grün)
function pfeilFuer(i, u, r){ return i.pfeilModus==="wert" ? (r ? pfeil(r) : "") : trendPfeil(u); }
function pfeilHinweis(i){ return i.trendNeutral ? "Pfeil = Richtung des Wertes (↓ sinkt, ↑ steigt)." : i.pfeilModus==="wert" ? "Pfeil = Richtung des Wertes (↓ sinkt, ↑ steigt). Grün = besser, rot = schlechter." : "↑ besser, → unverändert, ↓ schlechter."; }
function trendWort(u){ return u==="besser" ? "besser" : u==="schlechter" ? "schlechter" : u==="höher" ? "höher" : u==="niedriger" ? "niedriger" : "unverändert"; }
function trendVergleich(i){ return i.art==="rating" ? "seit Regierungsantritt" : i.takt==="quartal" ? (i.rueckblick===4 ? "zum gleichen Quartal des Vorjahres" : "zum Vorquartal") : i.takt==="jahr" ? "zum Vorjahr" : i.takt==="halbjahr" ? "zum gleichen Halbjahr des Vorjahres" : "zu vor 3 Monaten"; }
function urteilCls(u){ return u==="besser" ? "good" : u==="schlechter" ? "bad" : ""; }
function banner(){
  return D.beispiel ? '<div class="banner">Beispieldaten. Das sind keine echten Zahlen. Mit „node update.js" lädst du die aktuellen Eurostat-Daten.</div>' : "";
}
function fussnote(){
  return '<p class="note">Quelle: '+D.quelle+'. Daten zuletzt abgerufen am '+datum(D.aktualisiert)+' <a href="methodik.html">Methodik</a> · <a href="impressum.html">Impressum</a></p>';
}

// Rangvergleich: kleinerer Platz = besser (Pfeil nach oben)
function rangTrend(jetzt, frueher){
  if(frueher==null) return null;
  var d = frueher - jetzt;
  return d>0 ? {u:"besser", pfeil:"↑", text:d+(d===1?" Platz":" Plätze")+" besser"}
       : d<0 ? {u:"schlechter", pfeil:"↓", text:(-d)+(-d===1?" Platz":" Plätze")+" schlechter"}
       : {u:"unverändert", pfeil:"→", text:"unverändert"};
}
function rangChart(rv){
  var pts = rv.filter(function(x){return x.rang!=null;});
  if(pts.length<2) return "";
  var W=640,H=150,pl=34,pr=10,pt=10,pb=22, mx=Math.max.apply(null,pts.map(function(x){return x.rang;}));
  var lo=1, hi=Math.max(mx,3);
  var X=function(k){return pl+(W-pl-pr)*k/(rv.length-1);}, Y=function(r){return pt+(H-pt-pb)*(r-lo)/(hi-lo);};
  var path="", dots="", info=[];
  rv.forEach(function(x,k){ if(x.rang==null) return; path+=(path?"L":"M")+X(k).toFixed(1)+" "+Y(x.rang).toFixed(1);
    dots+='<circle cx="'+X(k).toFixed(1)+'" cy="'+Y(x.rang).toFixed(1)+'" r="'+(k===rv.length-1?4.5:2.5)+'" fill="var(--at)"/>';
    info.push([+X(k).toFixed(1), +Y(x.rang).toFixed(1), periode(x.t)+": Platz "+x.rang+" von "+x.n]); });
  var ticks="";
  for(var r=lo;r<=hi;r+= (hi>8?Math.ceil((hi-lo)/4):1)){ ticks+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+Y(r)+'" y2="'+Y(r)+'" stroke="var(--line)"/><text x="'+(pl-6)+'" y="'+(Y(r)+4)+'" text-anchor="end" font-size="11" fill="var(--mut)">'+r+'</text>'; }
  return '<div class="hvwrap" style="position:relative"><svg class="hv" data-w="'+W+'" data-info="'+JSON.stringify(info).replace(/"/g,"&quot;")+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Rang von Österreich im Zeitverlauf" style="touch-action:pan-y">'+ticks
    +'<path d="'+path+'" fill="none" stroke="var(--at)" stroke-width="2"/>'+dots
    +'<line class="hl" x1="0" x2="0" y1="'+pt+'" y2="'+(H-pb)+'" stroke="var(--mut)" stroke-dasharray="3 3" style="display:none"/><circle class="hc" r="6" fill="none" stroke="var(--at)" stroke-width="2" style="display:none"/>'
    +'<text x="'+pl+'" y="'+(H-4)+'" font-size="11" fill="var(--mut)">'+periode(rv[0].t)+'</text><text x="'+(W-pr)+'" y="'+(H-4)+'" text-anchor="end" font-size="11" fill="var(--mut)">'+periode(rv[rv.length-1].t)+'</text></svg>'
    +'<div class="hvtip" style="display:none;position:absolute;top:0;pointer-events:none;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:3px 8px;font-size:13px;white-space:nowrap"></div></div>';
}
// Hover/Touch über dem Rang-Diagramm: zeigt Zeitpunkt und Platz des nächsten Punkts
(function(){
  function move(e){
    var svg = e.target.closest ? e.target.closest("svg.hv") : null;
    if(!svg) return;
    var info = JSON.parse(svg.getAttribute("data-info")), W = +svg.getAttribute("data-w"), r = svg.getBoundingClientRect();
    var cx = (e.clientX - r.left) / r.width * W, best = 0;
    info.forEach(function(p,k){ if(Math.abs(p[0]-cx) < Math.abs(info[best][0]-cx)) best = k; });
    var p = info[best], hl = svg.querySelector(".hl"), hc = svg.querySelector(".hc"), tip = svg.parentNode.querySelector(".hvtip");
    hl.setAttribute("x1",p[0]); hl.setAttribute("x2",p[0]); hl.style.display="";
    hc.setAttribute("cx",p[0]); hc.setAttribute("cy",p[1]); hc.style.display="";
    tip.textContent = p[2]; tip.style.display="";
    var px = p[0]/W*r.width, tw = tip.offsetWidth;
    tip.style.left = Math.max(0, Math.min(r.width - tw, px - tw/2)) + "px";
  }
  function weg(e){ var svg = e.target.closest ? e.target.closest("svg.hv") : null; if(!svg) return;
    svg.querySelector(".hl").style.display="none"; svg.querySelector(".hc").style.display="none"; svg.parentNode.querySelector(".hvtip").style.display="none"; }
  document.addEventListener("pointermove", move); document.addEventListener("pointerdown", move);
  document.addEventListener("pointerleave", weg, true); document.addEventListener("pointerup", function(e){ if(e.pointerType==="touch") setTimeout(function(){weg(e);},1500); });
})();

// Liniendiagramm mit mehreren Reihen (Jahreswerte), Hover über die Punkte zeigt Jahr und Wert
function linienChart(reihen, jahre, farben){
  var W=640,H=190,pl=40,pr=12,pt=12,pb=24, all=[];
  reihen.forEach(function(r){ jahre.forEach(function(j){ if(r.werte[j]!=null) all.push(r.werte[j]); }); });
  if(all.length<2) return "";
  var lo=Math.floor(Math.min.apply(null,all)*10)/10, hi=Math.ceil(Math.max.apply(null,all)*10)/10; if(hi===lo) hi=lo+0.1;
  var X=function(k){return pl+(W-pl-pr)*k/(jahre.length-1);}, Y=function(v){return pt+(H-pt-pb)*(1-(v-lo)/(hi-lo));};
  var out='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Verlauf nach Gruppe">', st=(hi-lo)>1?0.5:0.1;
  for(var v=lo; v<=hi+1e-9; v+=st){ out+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+Y(v).toFixed(1)+'" y2="'+Y(v).toFixed(1)+'" stroke="var(--line)"/><text x="'+(pl-6)+'" y="'+(Y(v)+4).toFixed(1)+'" text-anchor="end" font-size="11" fill="var(--mut)">'+v.toLocaleString("de-AT",{minimumFractionDigits:1,maximumFractionDigits:1})+'</text>'; }
  jahre.forEach(function(j,k){ if(k%2===0||jahre.length<8) out+='<text x="'+X(k).toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle" font-size="11" fill="var(--mut)">'+j+'</text>'; });
  reihen.forEach(function(r,ri){
    var path="", dots="", col=farben[ri];
    jahre.forEach(function(j,k){ var w=r.werte[j]; if(w==null) return; path+=(path?"L":"M")+X(k).toFixed(1)+" "+Y(w).toFixed(1);
      dots+='<circle cx="'+X(k).toFixed(1)+'" cy="'+Y(w).toFixed(1)+'" r="3.5" fill="'+col+'"><title>'+r.name+', '+j+': '+w.toLocaleString("de-AT",{minimumFractionDigits:2,maximumFractionDigits:2})+'</title></circle>'; });
    out+='<path d="'+path+'" fill="none" stroke="'+col+'" stroke-width="2"/>'+dots;
  });
  return out+'</svg>';
}

function zahl(x){ return x==null ? "–" : x.toLocaleString("de-AT"); }
function prozent(x){ return x==null ? "–" : (x>0?"+":"") + x.toLocaleString("de-AT",{minimumFractionDigits:1,maximumFractionDigits:1}) + " %"; }

// ===== Info-Symbol mit Erklärung (Hover am PC, Tippen am Handy) =====
function infoIcon(text){
  if(!text) return "";
  return '<span class="info" role="button" tabindex="0" aria-label="Erklärung anzeigen" data-info="'+String(text).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;")+'">i</span>';
}
function rangInfo(i){ var t=i.rangText||""; return /\(|Gleichstand/.test(t) ? infoIcon(t) : ""; }
function teilPille(i){
  var t="Nur "+i.anzahlLaender+" von 27 EU-Ländern liefern Daten für diesen Indikator.";
  return '<span class="info pille" role="button" tabindex="0" aria-label="Erklärung anzeigen" data-info="'+t+'">von '+i.anzahlLaender+'</span>';
}
(function(){
  var pop=null, cur=null, pinned=false, HOVER=window.matchMedia && window.matchMedia("(hover:hover)").matches;
  function zeige(el){
    if(!pop){ pop=document.createElement("div"); pop.className="infopop"; pop.setAttribute("role","tooltip"); document.body.appendChild(pop); }
    cur=el; pop.textContent=el.getAttribute("data-info"); pop.style.display="block";
    var r=el.getBoundingClientRect(), w=Math.min(300,window.innerWidth-24); pop.style.width=w+"px";
    var left=Math.max(12,Math.min(window.innerWidth-w-12,r.left+r.width/2-w/2)), top=r.bottom+window.scrollY+8;
    pop.style.left=(left+window.scrollX)+"px"; pop.style.top=top+"px";
    if(r.bottom+pop.offsetHeight+16>window.innerHeight && r.top>pop.offsetHeight+16) pop.style.top=(r.top+window.scrollY-pop.offsetHeight-8)+"px";
  }
  function verberge(){ if(pop) pop.style.display="none"; cur=null; pinned=false; }
  document.addEventListener("mouseover",function(e){ if(!HOVER) return; var t=e.target.closest&&e.target.closest(".info"); if(t&&!pinned) zeige(t); });
  document.addEventListener("mouseout",function(e){ if(!HOVER||pinned) return; var t=e.target.closest&&e.target.closest(".info"); if(t) verberge(); });
  document.addEventListener("click",function(e){
    var t=e.target.closest&&e.target.closest(".info");
    if(t){ e.preventDefault(); e.stopPropagation(); if(cur===t&&pinned){ verberge(); } else { zeige(t); pinned=true; } return; }
    if(pop&&!(e.target.closest&&e.target.closest(".infopop"))) verberge();
  },true);
  document.addEventListener("keydown",function(e){ if(e.key==="Escape") verberge(); if((e.key==="Enter"||e.key===" ")&&e.target.classList&&e.target.classList.contains("info")){ e.preventDefault(); e.target.click(); } });
  window.addEventListener("scroll",function(){ if(!pinned) verberge(); },{passive:true});
})();

(function(){
  function init(){
    var b=document.createElement("button");
    b.id="nachoben"; b.type="button"; b.setAttribute("aria-label","Zurück nach oben"); b.title="Nach oben"; b.textContent="↑";
    b.onclick=function(){ window.scrollTo({top:0,behavior:"smooth"}); };
    document.body.appendChild(b);
    function pruefe(){ b.classList.toggle("an", (window.pageYOffset||document.documentElement.scrollTop)>600); }
    window.addEventListener("scroll",pruefe,{passive:true}); pruefe();
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();

// Zusammengeführte Kacheln: mehrere Indikatoren in einer Kachel, mit Umschalter (erster = Standardansicht)
var PAARE = [
  { ids: ["einkommen","durchschnittseinkommen"], titel: "Einkommen", labels: ["Median","Durchschnitt"], suche: "median durchschnitt einkommen" },
  { ids: ["wachstum","industrie"], titel: "Wirtschaftswachstum", labels: ["Gesamt","Industrie"], suche: "wirtschaftswachstum industriewachstum bip industrie" },
  { ids: ["wachstum-pro-kopf","wachstum-privat"], titel: "Wachstum", labels: ["Pro Kopf","Ohne Staat"], suche: "wachstum pro kopf ohne staat privat bip" },
  { ids: ["insolvenzen","insolvenzenEU"], titel: "Insolvenzen", labels: ["Anzahl","EU-Index"], suche: "insolvenzen pleiten firmen" },
  { ids: ["arbeitslosigkeit","beschaeftigung"], titel: "Arbeitsmarkt", labels: ["Arbeitslos","Jobs"], suche: "arbeitsmarkt arbeitslosenquote arbeitslosigkeit beschäftigungsquote beschäftigung" },
  { ids: ["benzin","diesel"], titel: "Spritpreis", labels: ["Benzin","Diesel"], suche: "spritpreis benzinpreis dieselpreis treibstoff tanken" },
  { ids: ["strompreis","strompreis-industrie"], titel: "Strompreis", labels: ["Haushalte","Industrie"], suche: "strompreis strom energie haushalte industrie" },
  { ids: ["raub","einbruch"], titel: "Eigentumsdelikte", labels: ["Raub","Einbruch"], suche: "raub raubdelikte wohnungseinbrüche einbruch eigentum kriminalität" },
  { ids: ["koerperverletzung","sexualdelikte","toetung"], titel: "Gewaltdelikte", labels: ["Schwere Körperverletzung","Sexual","Tötung"], suche: "tötungsdelikte mord schwere körperverletzung sexualdelikte gewalt kriminalität" },
  { ids: ["durchschnittsalter","abhaengigkeit"], titel: "Alter der Bevölkerung", labels: ["Alter","Abhängigkeit"], suche: "alter bevölkerung altersabhängigkeitsquote abhängigkeit durchschnittsalter" },
  { ids: ["lebenserwartung","gesundeJahre"], titel: "Lebenserwartung", labels: ["Gesamt","Gesund"], suche: "lebenserwartung gesunde lebensjahre gesundheit" },
  { ids: ["kapitalmarkt","aktionaersquote"], titel: "Kapitalmarkt", labels: ["Börsenwert","Aktionäre"], suche: "kapitalmarkt börse börsenwert aktien aktionärsquote aktionäre kapital pro kopf einwohner" },
  { ids: ["pensionsausgaben","ersatzquote"], titel: "Pensionen", labels: ["Ausgaben","Höhe"], suche: "pensionen pensionsausgaben pensionshöhe ersatzquote rente" }
];
function paarFuer(id){ for(var k=0;k<PAARE.length;k++) if(PAARE[k].ids.indexOf(id)>=0) return PAARE[k]; return null; }
