// Dekoration der Startseite: farblose Symbole, Mini-Verlaufslinien, Grafik zur Platzveränderung
(function(){
  var P={
    haus:'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
    prozent:'M19 5L5 19M7.5 5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM16.5 14a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
    blitz:'M13 3L5 14h6l-1 7 8-11h-6z',
    zapfsaeule:'M5 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M4 21h11M7 9h5M14 9h2.5A1.5 1.5 0 0 1 18 10.5V16a1.5 1.5 0 0 0 3 0V8l-3-3',
    koffer:'M4 8h16v11H4zM9 8V6h6v2M4 13h16',
    kurs:'M4 19V5M4 19h16M7 15l4-4 3 3 5-6',
    kolben:'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8',
    insolvenz:'M5 21V8l7-4 7 4v13M3 21h18M12 11v5M10 14l2 2 2-2',
    hut:'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
    muenzen:'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5',
    uhr:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
    pfeilhoch:'M3 17l6-6 4 4 8-8M15 7h6v6',
    spross:'M12 21v-9M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 15c0-3-2-5-6-5 0 3 2 5 6 5z',
    saeulen:'M5 20v-8M12 20V8M19 20V4',
    stern:'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.3 6.8 19l1-5.8L3.5 9.2l5.9-.9z',
    haushalt:'M3 9l9-5 9 5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18',
    torte:'M12 3v9h9M20.5 15A9 9 0 1 1 9 3.5',
    steuer:'M6 3h9l4 4v14H6zM14 3v5h5M9 17l6-6',
    schloss:'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
    schild:'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    gitter:'M4 5h16v14H4zM8 5v14M12 5v14M16 5v14',
    warnung:'M12 3l10 18H2zM12 10v5M12 18v.5',
    waage:'M12 4v16M8 20h8M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z',
    auge:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
    boerse:'M3 7h17a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 7l12-3v3M16 14h3',
    leute:'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a2.5 2.5 0 1 0 0-5M17 14c2.5 0 4.5 2 4.5 5',
    herz:'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
    lachen:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 14a5 4 0 0 0 8 0M9 9.5v.5M15 9.5v.5',
    kuppel:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c-3 2.5-4 5.5-4 9s1 6.5 4 9c3-2.5 4-5.5 4-9s-1-6.5-4-9',
    zuzug:'M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM2.5 20c0-3.8 2.9-6 6.5-6s6.5 2.2 6.5 6M19 8v6M16 11h6',
    sanduhr:'M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9',
    kalender:'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    puls:'M3 12h4l2-5 4 10 2-5h6',
    sonne:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
    wolke:'M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1A3.5 3.5 0 0 1 17 18z',
    stecker:'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4',
    kreuz:'M4 5h16v16H4zM12 9v8M8 13h8',
    buch:'M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z',
    fabrik:'M3 21V10l6 4v-4l6 4V6h3v15zM3 21h18',
    flamme:'M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4 0-6 1-10z',
    blatt:'M5 19C5 9 10 4 20 4c0 10-5 15-15 15M5 19c3-5 6-8 10-10'
  };
  var T={arbeitslosigkeit:"koffer",inflation:"prozent",wachstum:"saeulen",industrie:"fabrik",schulden:"muenzen",defizit:"haushalt",geburtenrate:"herz",staatsquote:"torte",abgabenquote:"steuer",beschaeftigung:"koffer",bevoelkerung:"leute","wachstum-pro-kopf":"pfeilhoch",lebenshaltung:"prozent",immobilien:"haus",einkommen:"muenzen",durchschnittseinkommen:"muenzen",kaufkraft:"muenzen","wachstum-privat":"pfeilhoch",benzin:"zapfsaeule",diesel:"zapfsaeule",heizoel:"flamme",gaspreis:"flamme",sicherheitsgefuehl:"auge",insolvenzenEU:"insolvenz",insolvenzen:"insolvenz",erwerbsdauer:"kalender",pensionsausgaben:"haushalt",ersatzquote:"muenzen",altersarmut:"boerse",teilzeit:"uhr",beschaeftigung5564:"koffer",durchschnittsalter:"sanduhr",lebenserwartung:"puls",gesundeJahre:"puls",abhaengigkeit:"leute",toetung:"schild",raub:"schloss",einbruch:"schloss",kapitalmarkt:"kurs",kapitalNichtBoerse:"kurs",kapitalGesamt:"kurs",armut:"boerse",ausgrenzung:"boerse",wohnkosten:"haus",mieten:"haus",jugendarbeitslosigkeit:"hut",neet:"hut",forschung:"kolben",ausgabenBildung:"buch",ausgabenGesundheit:"kreuz",ausgabenVerteidigung:"schild",ausgabenSoziales:"leute",genderPayGap:"waage",erneuerbare:"sonne",treibhausgase:"wolke",energieabhaengigkeit:"stecker",nettozuwanderung:"zuzug",asyl:"zuzug",asylOffen:"sanduhr",lebenszufriedenheit:"lachen",gefaengnis:"gitter",koerperverletzung:"schild",sexualdelikte:"schild",strompreis:"blitz","strompreis-industrie":"blitz",rating:"stern",religion:"kuppel",pensionsantrittsalter:"kalender",aktionaersquote:"kurs",marsh:"muenzen",terror:"warnung",verurteilungen:"waage"};
  var G={"Preise und Kosten":"prozent","Wirtschaft und Arbeit":"koffer","Staatsfinanzen":"haushalt","Sicherheit":"schild","Gesellschaft":"leute","Pensionen und Alter":"sanduhr","Energie und Klima":"blatt","Weitere":"kurs"};
  var svg=function(n,cls){ return '<svg class="'+(cls||'ico')+'" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(P[n]||P.kurs)+'"/></svg>'; };
  function spark(i){
    var v=(i&&i.verlauf||[]).filter(function(p){ return p && p.at!=null && p.t; });
    if(v.length){ var ly=parseInt(v[v.length-1].t,10)-5, lm=parseInt(v[v.length-1].t.slice(5,7),10)||0; v=v.filter(function(p){ var y=parseInt(p.t,10), m=parseInt(p.t.slice(5,7),10)||0; return y>ly || (y===ly && m>=lm); }); }
    if(v.length<3) return "";
    var mn=Math.min.apply(null,v.map(function(p){return p.at;})), mx=Math.max.apply(null,v.map(function(p){return p.at;})), sp=(mx-mn)||1, W=100, H=24, pad=3;
    var pts=v.map(function(p,k){ return [pad+k*(W-2*pad)/(v.length-1), H-pad-(p.at-mn)/sp*(H-2*pad)]; });
    var last=pts[pts.length-1];
    return '<svg class="spark" viewBox="0 0 '+W+' '+H+'" width="100" height="24" role="img" aria-label="Verlauf der letzten Jahre"><polyline points="'+pts.map(function(q){ return q[0].toFixed(1)+','+q[1].toFixed(1); }).join(" ")+'" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" opacity=".75"/><circle cx="'+last[0].toFixed(1)+'" cy="'+last[1].toFixed(1)+'" r="2.2" fill="currentColor"/></svg>';
  }
  window.symbolFuer=function(id,gr,groesse){ var h=svg(T[id]||G[gr]||'kurs','ico'); return groesse? h.replace(/width="22" height="22"/,'width="'+groesse+'" height="'+groesse+'"'):h; };
  window.dekoriere=function(D){
    var byId={}; (D.indikatoren||[]).forEach(function(i){ byId[i.id]=i; });
    document.querySelectorAll(".gruppe").forEach(function(s){
      var g=s.getAttribute("data-g"), h=s.querySelector(".gh");
      if(h && !h.querySelector(".gi")) h.insertAdjacentHTML("afterbegin",'<span class="gi">'+svg(G[g]||"kurs")+'</span>');
      s.querySelectorAll("a.card.tile").forEach(function(c){
        if(c.querySelector(".ti")) return;
        var m=/[?&]id=([^&]+)/.exec(c.getAttribute("href")||""), id=m&&decodeURIComponent(m[1]), ind=id&&byId[id];
        c.insertAdjacentHTML("afterbegin",'<span class="ti">'+svg(T[id]||G[g]||"kurs")+'</span>');
        var sp=ind&&spark(ind), more=c.querySelector(".more");
        if(sp && more) more.insertAdjacentHTML("beforebegin",'<div class="sprk">'+sp+'</div>');
      });
    });
  };
  // Grafik: Veränderung des Platzes seit Regierungsantritt
  window.platzGrafik=function(D){
    var rows=[];
    (D.indikatoren||[]).forEach(function(i){
      if(!i.typ || i.typ==="neutral" || !i.oesterreich || !i.anzahlLaender) return;
      var v=(i.rangVergleich||[]).filter(function(q){ return q && q.regierung; })[0]; if(!v) return;
      rows.push({i:i,d:v.rang-i.oesterreich.rang,von:v.rang,nach:i.oesterreich.rang});
    });
    var nrows=[];
    (D.indikatoren||[]).forEach(function(i){
      var st=window.startPlatz&&startPlatz(i); if(!st||!i.oesterreich||i.oesterreich.rang==null) return;
      nrows.push({i:i,d:st.rang-i.oesterreich.rang,von:st.rang,nach:i.oesterreich.rang,neu:true});
    });
    if(!rows.length && !nrows.length) return null;
    var mx=Math.max.apply(null,rows.concat(nrows).map(function(r){ return Math.abs(r.d); }).concat([1]));
    var srt=function(l){ return l.slice().sort(function(a,b){ return (b.d-a.d)||a.i.name.localeCompare(b.i.name,"de"); }); };
    var ver=srt(rows).filter(function(r){ return r.d!==0; }), gl=srt(rows).filter(function(r){ return r.d===0; });
    var nver=srt(nrows).filter(function(r){ return r.d!==0; }), ngl=srt(nrows).filter(function(r){ return r.d===0; });
    var lnk=function(l){ return l.map(function(r){ return '<a href="indikator.html?id='+encodeURIComponent(r.i.id)+'">'+r.i.name+'</a>'; }).join(', '); };
    var zeile=function(r){ var w=Math.abs(r.d)/mx*50, pos=r.d>0;
      return '<a class="pg-z" href="indikator.html?id='+encodeURIComponent(r.i.id)+'"><span class="pg-n">'+r.i.name+'</span><span class="pg-b"><span class="pg-m"></span><span class="pg-f '+(r.neu?'neu':pos?'good':'bad')+'" style="'+(pos?'left:50%':'right:50%')+';width:'+w+'%"></span></span><span class="pg-w '+(r.neu?'neu':pos?'good':'bad')+'">'+(pos?'+':'−')+Math.abs(r.d)+'</span><span class="pg-p">Platz '+r.von+' → '+r.nach+'</span></a>'; };
    var box=document.createElement("details"); box.className="pgbox";
    box.innerHTML='<summary><span class="gi">'+svg("saeulen")+'</span><span class="pg-t">Platzveränderung je Kennzahl</span><span class="auf" aria-hidden="true"></span></summary>'
      +'<div class="pg-k"><span>\u2190 schlechter</span><span>besser \u2192</span></div>'
      +ver.map(zeile).join('')
      +(gl.length?'<p class="note pg-g">Unverändert ('+gl.length+'): '+lnk(gl)+'</p>':'')
      +(nrows.length?'<h3 class="pg-h">Ohne Wertung'+(window.infoIcon?infoIcon("Bei diesen Kennzahlen wird nicht gewertet, ob ein höherer oder niedrigerer Platz besser ist. Die Balken zeigen nur, ob die Platznummer kleiner (rechts) oder größer (links) geworden ist. Gezeigt werden Kennzahlen, für die ein Platz bei Regierungsantritt vorliegt."):'')+'</h3>'+nver.map(zeile).join('')+(ngl.length?'<p class="note pg-g">Unverändert ('+ngl.length+'): '+lnk(ngl)+'</p>':''):'')
      +'<p class="note">Veränderung des Platzes im EU-Vergleich von Regierungsantritt bis heute.</p>';
    return box;
  };
})();
