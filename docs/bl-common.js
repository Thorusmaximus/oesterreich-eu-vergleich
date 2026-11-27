// gemeinsame Funktionen der Bundesländer-Seiten (benötigt common.js und eine globale Variable hl)
function fw(i, v){ return v==null ? "–" : v.toLocaleString("de-AT",{minimumFractionDigits:i.dez,maximumFractionDigits:i.dez}) + (i.suffix||"").replace(/ /g," "); }
var PAARE_BL = [
  { titel: "Arbeitsmarkt", ids: ["arbeitslosigkeitAms","arbeitslosigkeit","beschaeftigung"], labels: ["Arbeitslos (AMS)","Arbeitslos (Eurostat)","Jobquote"] },
  { titel: "Einkommen", ids: ["bip","einkommen"], labels: ["Wirtschaftsleistung","Haushalte"] },
  { titel: "Bevölkerung", ids: ["bevoelkerung1","bevoelkerung","bevoelkerungsdichte","geburtenrate"], labels: ["1 Jahr","5 Jahre","Dichte","Geburten"] },
  { titel: "Zuwanderung", ids: ["nettozuwanderung","zuzug","wegzug"], labels: ["Netto","Zuzug","Wegzug"] },
  { titel: "Unternehmen", ids: ["unternehmenswachstum","unternehmensdichte"], labels: ["Wachstum","Dichte"] },
  { titel: "Schulden", ids: ["schulden","schuldenGebarung"], labels: ["Weit gefasst","Landeshaushalt"] },
  { titel: "Insolvenzen", ids: ["insolvenzen","insolvenzenEinwohner"], labels: ["Je Unternehmen","Je Einwohner"] },
  { titel: "Immobilienpreise", ids: ["kaufpreise","kaufpreisWohnungen","kaufpreisHaeuser"], labels: ["Durchschnitt","Wohnungen","Häuser"] },
  { titel: "Lebenserwartung", ids: ["lebenserwartung","lebenserwartung65"], labels: ["Bei Geburt","Mit 65"] },
  { titel: "Gesundheit", ids: ["saeuglingssterblichkeit","krankenhausbetten","spitalsaufenthalte"], labels: ["Säuglinge","Betten","Aufenthalte"] },
  { titel: "Sicherheit", ids: ["straftaten","aufklaerung","verkehrstote"], labels: ["Straftaten","Aufklärung","Verkehr"] },
  { titel: "Bildung", ids: ["tertiaer","schulabbruch"], labels: ["Hochschule","Frühe Abgänger"] }
], AUSWAHL = {};
function paarBL(id){ for(var k=0;k<PAARE_BL.length;k++) if(PAARE_BL[k].ids.indexOf(id)>=0) return PAARE_BL[k]; return null; }
function karte(i, kopf, tabs){
  var vals = i.laender.map(function(x){return x.wert}), mn = Math.min.apply(null, vals.concat([0])), mx = Math.max.apply(null, vals.concat([0])), span = (mx-mn)||1;
  var bar = function(v){ var left=(Math.min(v,0)-mn)/span*100, w=Math.max(.8,Math.abs(v)/span*100); return '<span class="trk"><span class="bb" style="left:'+left+'%;width:'+w+'%"></span></span>'; };
  var nw = Math.max.apply(null, i.laender.map(function(x){ return fw(i,x.wert).length; })), st = ' style="--nw:'+Math.max(3.4, Math.round(nw*0.58*10)/10)+'em"';
  var lang = i.einheit.length>80; var t = '<div class="card bk"><h2>'+(kopf||i.name)+infoIcon((lang?i.einheit+'. ':'')+i.erklaerung+(i.typ==="niedrig"?" Gewertet wird: ein niedrigerer Wert gilt als besser.":i.typ==="hoch"?" Gewertet wird: ein höherer Wert gilt als besser.":"")+" "+(i.ohneTrend ? "Nur ein Jahr, deshalb ohne Trend." : i.trendInfo ? i.trendInfo : "Pfeil = Veränderung von "+(i.vorPeriode||"?")+" bis "+i.periode+", grün = besser, rot = schlechter (nur wo gewertet). Eine Veränderung unter "+(i.relativ?"3 %":fw(i,i.schwelle)+" "+i.diffEinheit)+" gilt als unverändert."))+'</h2>'+(tabs ? tabs+'<p class="note spk"><b>'+i.name+'</b>. '+(lang?'':i.einheit+'. ') : '<p class="note spk">'+(lang?'':i.einheit+'. '))+'Stand: '+periode(i.periode)+(i.typ==="neutral"?'. Ohne Wertung.':'.')+'</p>';
  t += i.laender.map(function(x){
    var pf = x.richtung ? '<span class="ta '+urteilCls(x.urteil)+'" title="'+(x.urteil?trendWort(x.urteil):"")+'">'+pfeil(x.richtung)+'</span>' : '<span class="ta"></span>';
    return '<div class="row'+(hl===x.code?" at":"")+'"'+st+'><span>'+x.rang+'. '+x.name+(x.zus?'<small class="note zs">'+x.zus+'</small>':'')+'</span>'+bar(x.wert)+'<span class="n">'+fw(i,x.wert)+'</span>'+pf+'</div>'+(x.wertVor!=null?'<div class="vorz" style="--nw:'+Math.max(3.4, Math.round(nw*0.58*10)/10)+'em">'+(i.vorPeriode||'früher')+': '+fw(i,x.wertVor)+(x.rangVor!=null?' (Platz '+x.rangVor+(x.rangVor!==x.rang?', '+(x.rangVor>x.rang?'▲ ':'▼ ')+Math.abs(x.rangVor-x.rang):'')+')':'')+'</div>':'');
  }).join("");
  if(i.staedte && i.staedte.length){
    t += '<p class="note stadthead">Zum Vergleich, nicht im Ranking (Städte bzw. Stadtregionen):</p>' + i.staedte.map(function(x){
      var pf = x.richtung ? '<span class="ta '+urteilCls(x.urteil)+'" title="'+(x.urteil?trendWort(x.urteil):"")+'">'+pfeil(x.richtung)+'</span>' : '<span class="ta"></span>';
      return '<div class="row stadt"'+st+'><span>'+x.name+'<small class="note zs">'+(x.zus?x.zus+', ':'')+'würde Rang '+x.rangEinordnung+' einnehmen'+(x.periode&&x.periode!==i.periode?' (Stand '+x.periode+')':'')+'</small></span><span></span><span class="n">'+fw(i,x.wert)+'</span>'+pf+'</div>';
    }).join("");
  }
  if(i.oesterreich) t += '<p class="note">Österreich insgesamt: '+fw(i,i.oesterreich.wert)+'</p>';
  return t + '</div>';
}
var FARBEN = ["#2b6cb0","#c05621","#2f855a","#b83280","#6b46c1","#975a16","#0987a0","#c53030","#4a5568"];
function vw(i,v){ if(v==null) return "–"; return i.reihe.einheitText ? Math.round(v).toLocaleString("de-AT") : fw(i,v); }
function verlaufTeile(i){
  var R = i.reihe; if(!R) return null;
  var W=340,H=200,L=44,Rr=8,T=10,Bt=22, all=[]; B.laender.forEach(function(l){ (R.laender[l.code]||[]).forEach(function(v){ if(v!=null) all.push(v); }); });
  var mn=Math.min.apply(null,all), mx=Math.max.apply(null,all), pad=(mx-mn)*0.08||1; mn-=pad; mx+=pad;
  var X=function(k){ return L+(W-L-Rr)*k/(R.jahre.length-1); }, Y=function(v){ return T+(H-T-Bt)*(1-(v-mn)/(mx-mn)); };
  var svg='<svg viewBox="0 0 '+W+' '+H+'" class="vsvg" role="img" aria-label="Verlauf '+i.name+'">';
  [0,.5,1].forEach(function(f){ var v=mn+(mx-mn)*f; svg+='<line x1="'+L+'" x2="'+(W-Rr)+'" y1="'+Y(v)+'" y2="'+Y(v)+'" class="vg"/><text x="'+(L-4)+'" y="'+(Y(v)+3)+'" text-anchor="end" class="vt">'+vw(i,v)+'</text>'; });
  [0,R.jahre.length-1].forEach(function(k){ svg+='<text x="'+X(k)+'" y="'+(H-6)+'" text-anchor="'+(k?'end':'start')+'" class="vt">'+R.jahre[k]+'</text>'; });
  B.laender.forEach(function(l,n){ var pts=[]; (R.laender[l.code]||[]).forEach(function(v,k){ if(v!=null) pts.push(X(k).toFixed(1)+","+Y(v).toFixed(1)); });
    var an = hl===l.code, dim = hl && !an; svg+='<polyline points="'+pts.join(" ")+'" fill="none" stroke="'+FARBEN[n]+'" stroke-width="'+(an?3.2:1.8)+'" opacity="'+(dim?.25:1)+'"/>'; });
  svg+='</svg>';
  var leg='<div class="vleg">'+B.laender.map(function(l,n){ var arr=R.laender[l.code]||[], last=arr[arr.length-1];
    return '<span class="'+(hl===l.code?"at":"")+'"><i style="background:'+FARBEN[n]+'"></i>'+l.kurz+' <b>'+vw(i,last)+'</b></span>'; }).join("")+'</div>';
  var tab='<div class="vtab"><table><thead><tr><th></th>'+R.jahre.map(function(y){return '<th>'+y+'</th>';}).join("")+'</tr></thead><tbody>'+B.laender.map(function(l){ return '<tr'+(hl===l.code?' class="at"':'')+'><th>'+l.kurz+'</th>'+(R.laender[l.code]||[]).map(function(v){return '<td>'+vw(i,v)+'</td>';}).join("")+'</tr>'; }).join("")+'</tbody></table></div>';
  return { svg: svg, leg: leg, tab: tab };
}
var PARTEI = {
  "SPÖ": "SPÖ (Sozialdemokratische Partei Österreichs): Sozialdemokratische Partei, seit 1889 (ab 1945 unter diesem Namen). Auf Bundesebene seit März 2025 in der Regierung (mit ÖVP und NEOS).",
  "ÖVP": "ÖVP (Österreichische Volkspartei): christdemokratisch-konservative Partei, gegründet 1945. Auf Bundesebene seit März 2025 in der Regierung (mit SPÖ und NEOS).",
  "FPÖ": "FPÖ (Freiheitliche Partei Österreichs): rechte Partei, gegründet 1956. Auf Bundesebene in der Opposition, bei der Nationalratswahl 2024 stimmenstärkste Partei.",
  "Grüne": "Die Grünen (Die Grüne Alternative): ökologisch und sozial ausgerichtete Partei, seit 1986 im Nationalrat. Auf Bundesebene in der Opposition (zuvor 2020 bis 2025 in der Regierung mit der ÖVP).",
  "NEOS": "NEOS (Das Neue Österreich und Liberales Forum): liberale Partei, gegründet 2012. Auf Bundesebene seit März 2025 in der Regierung (mit ÖVP und SPÖ)."
};
function pille(p){ var t = PARTEI[p]; return '<span class="pt ppi p-'+p.replace(/[^A-Za-z]/g,"")+'"'+(t?' role="button" tabindex="0" aria-label="Kurzbeschreibung '+p+'" data-info="'+t.replace(/"/g,"&quot;")+'"':'')+'>'+p+'</span>'; }
