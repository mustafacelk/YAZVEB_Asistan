# -*- coding: utf-8 -*-
"""
Sesli konsol — tek parça tarayıcı bileşeni.

MİMARİ KARARI: KOD ÜST SAYFAYA ENJEKTE EDİLİR
──────────────────────────────────────────────
Streamlit bileşenleri `srcdoc` ile kurulmuş bir iframe içinde çalışır. Mikrofonu,
ses zincirini ve açılış videosunu o çerçevenin içinde bırakmak üç sorun doğurur:

  1. Çerçeve Streamlit'in düzenine gömülüdür; tam ekran katman olamaz.
  2. Her yeniden çizimde (rerun) çerçeve baştan kurulur — ses kesilir, video
     baştan başlar, mikrofon izni yeniden sorulur.
  3. İzin politikası çerçeveye ayrıca devredilmelidir.

Bu yüzden çerçeve yalnızca bir taşıyıcıdır: yüksekliği sıfırdır ve tek işi
aşağıdaki betiği ÜST sayfaya kurmaktır. Streamlit'in sandbox'ı
`allow-same-origin` içerdiği için buna izin verilir.

Kurulan konsol `window.__yzKonsol` altında tekildir. Rerun olduğunda betik
yeniden çalışır, tekil nesneyi bulur ve yalnızca durumunu tazeler.

GÖRSEL SÜRÜŞ: JS ÖLÇER, CSS ÇİZER
──────────────────────────────────
Bu katman hiçbir şey çizmez. Yaptığı tek şey, her karede kök öğeye üç sayı
yazmaktır:

    --yz-guc   genel ses gücü        0..1
    --yz-bas   bas enerjisi          0..1
    --yz-tiz   tiz enerjisi          0..1
    data-yz-mod = bekleme | dinleme | dusunme | konusma

Silüetin parlaması, halenin genişlemesi ve halkaların atması tamamen CSS'te
(bkz. arayuz.stil) bu değişkenlerden türetilir. Böylece animasyon derleyici
katmanında kalır: JS kare başına yalnızca üç sayı yazar, düzen hesabı yapmaz.

Ölçüm döngüsü yalnızca konuşurken veya dinlerken döner. Boştayken tamamen
durur — sayfa sessizken CPU kullanımı sıfırdır.
"""

from __future__ import annotations

import json

_BETIK = r"""
(function () {
  "use strict";

  var YAP = __YAPILANDIRMA__;

  var ust;
  try { ust = window.parent; } catch (e) { return; }
  if (!ust || !ust.document || ust === window) return;
  var D = ust.document;

  // Rerun sonrası ikinci kurulum yok: tekil nesne bulunursa yalnızca tazelenir.
  if (ust.__yzKonsol) { try { ust.__yzKonsol.tazele(YAP); } catch (e) {} return; }

  // ════════════════════════════════════════════════════════════
  // DURUM
  // ════════════════════════════════════════════════════════════
  var S = {
    mod: "bekleme",       // bekleme | dinleme | dusunme | konusma
    mikAcik: false,
    izinYok: false,
    kopruVar: false,
    girdi: "—",
    mesajlar: [],
    gecici: null,         // ara (interim) transkript
    bekleyen: "",         // gönderilmeyi bekleyen kesin metin
    zamanlayici: null,
    ac: null,             // AudioContext
    akis: null,           // MediaStream
    mikCoz: null, mikZaman: null,
    ttsCoz: null, ttsVeri: null,
    calan: null,
    taniyici: null, taniyiciCalisiyor: false, yenidenBaslat: 0,
    kayitci: null, sttYedek: false,
    guc: 0, bas: 0, tiz: 0,
    dongu: 0
  };

  // ════════════════════════════════════════════════════════════
  // YARDIMCILAR
  // ════════════════════════════════════════════════════════════
  function kacir(m) {
    return String(m == null ? "" : m)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function el(etiket, sinif, kimlik) {
    var e = D.createElement(etiket);
    if (sinif) e.className = sinif;
    if (kimlik) e.id = kimlik;
    return e;
  }
  function sinirla(x, alt, ustSinir) { return x < alt ? alt : (x > ustSinir ? ustSinir : x); }
  function yaklas(a, b, k) { return a + (b - a) * k; }

  // ════════════════════════════════════════════════════════════
  // KÖPRÜ (rerun'suz iletişim)
  // ════════════════════════════════════════════════════════════
  function istek(yol, govde, secenek) {
    secenek = secenek || {};
    var kes = new AbortController();
    var saat = ust.setTimeout(function () { kes.abort(); }, secenek.sure || 45000);
    var baslik = { "X-YZ-Anahtar": YAP.anahtar };
    var yuk;
    if (secenek.ham) { yuk = govde; baslik["Content-Type"] = "application/octet-stream"; }
    else { yuk = JSON.stringify(govde || {}); baslik["Content-Type"] = "application/json"; }
    if (secenek.bicim) baslik["X-YZ-Bicim"] = secenek.bicim;

    return ust.fetch(YAP.adres + yol, {
      method: secenek.yontem || "POST",
      headers: baslik,
      body: secenek.yontem === "GET" ? undefined : yuk,
      signal: kes.signal, mode: "cors", cache: "no-store"
    }).then(function (y) {
      ust.clearTimeout(saat);
      if (!y.ok) throw new Error("köprü " + y.status);
      return y.json();
    }).catch(function (h) { ust.clearTimeout(saat); throw h; });
  }

  function kopruyuYokla() {
    if (!YAP.adres) { S.kopruVar = false; return Promise.resolve(false); }
    return ust.fetch(YAP.adres + "/yz/saglik", { cache: "no-store", mode: "cors" })
      .then(function (y) { return y.json(); })
      .then(function (v) {
        S.kopruVar = true;
        S.sttYedek = !!v.stt_yedek;
        return true;
      })
      .catch(function () { S.kopruVar = false; return false; });
  }

  /**
   * Köprü kapalıysa (uzak sunucu, HTTPS karışık içerik engeli) metin
   * Streamlit'in kendi giriş kutusuna yazılıp gönderilir. Sayfa yenilenir —
   * kesintisiz değildir ama asistan susmaz.
   */
  function yedekGonder(metin) {
    var alan = D.querySelector('[data-testid="stChatInput"] textarea');
    if (!alan) return false;
    try {
      var yazici = Object.getOwnPropertyDescriptor(
        ust.HTMLTextAreaElement.prototype, "value").set;
      yazici.call(alan, metin);
      alan.dispatchEvent(new ust.Event("input", { bubbles: true }));
      var dugme = D.querySelector('[data-testid="stChatInput"] button');
      if (dugme) { dugme.click(); return true; }
      alan.dispatchEvent(new ust.KeyboardEvent("keydown", {
        bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13
      }));
      return true;
    } catch (e) { return false; }
  }

  // ════════════════════════════════════════════════════════════
  // SOHBET RAYI
  // ════════════════════════════════════════════════════════════
  function satir(mesaj, derinlik) {
    var rol = mesaj.rol === "user" ? "user" : "assistant";
    var etiket = mesaj.etiket || (rol === "user" ? "Sen" : "YAZVEB");
    return '<div class="yz-satir" data-rol="' + rol + '" data-derinlik="' + derinlik + '">' +
           '<div class="yz-etiket">' + kacir(etiket) + "</div>" +
           '<div class="yz-metin">' + kacir(mesaj.icerik).replace(/\n/g, "<br>") + "</div></div>";
  }

  function rayCiz() {
    var kap = D.querySelector(".yz-akis");
    if (!kap) return;
    /*
     * Konsolun listesi boşken raya DOKUNULMAZ.
     *
     * Rayı iki taraf yazabiliyor: Python (her çizimde) ve konsol (her turda).
     * Konsol henüz köprüden geçmişi çekmemişken bir mod değişimi olursa
     * rayCiz boş listeyi basar ve Python'un yazdığı mesajlar ekrandan silinir.
     * Boş liste hiçbir zaman "ray boş olmalı" anlamına gelmez; "benim henüz
     * bilgim yok" anlamına gelir.
     */
    if (!S.mesajlar.length && !S.gecici) return;
    var liste = S.mesajlar.slice();
    if (S.gecici) liste.push({ rol: "user", icerik: S.gecici, etiket: "Sen · dinleniyor" });
    var dusunuyor = S.mod === "dusunme";
    liste = liste.slice(-YAP.gorunen);

    var html = "";
    for (var i = 0; i < liste.length; i++) {
      html += satir(liste[i], Math.min(liste.length - 1 - i + (dusunuyor ? 1 : 0), 2));
    }
    if (dusunuyor) {
      html += '<div class="yz-satir" data-rol="assistant" data-derinlik="0">' +
              '<div class="yz-etiket">YAZVEB · çözümleniyor</div>' +
              '<div class="yz-tarayici"><i></i></div></div>';
    }
    kap.innerHTML = html;
  }

  function gecmisiCek() {
    if (!S.kopruVar) return Promise.resolve();
    return istek("/yz/gecmis?oturum=" + encodeURIComponent(YAP.oturum) +
                 "&anahtar=" + encodeURIComponent(YAP.anahtar), null,
                 { yontem: "GET", sure: 8000 })
      .then(function (v) { S.mesajlar = v.mesajlar || []; rayCiz(); })
      .catch(function () {});
  }

  // ════════════════════════════════════════════════════════════
  // GÖRSEL SÜRÜŞ  —  JS ölçer, CSS çizer
  // ════════════════════════════════════════════════════════════
  var kok = D.documentElement;
  var sonYazilan = { guc: -1, bas: -1, tiz: -1 };

  function degerYaz(ad, deger, saklanan) {
    // Aynı değeri tekrar yazmak stil geçersizleştirmesi tetikler; 1/100'lük
    // eşiğin altındaki değişim gözle görülmez, boşuna iş olur.
    if (Math.abs(deger - sonYazilan[saklanan]) < 0.01) return;
    sonYazilan[saklanan] = deger;
    kok.style.setProperty(ad, deger.toFixed(3));
  }

  function moduAyarla(mod) {
    S.mod = mod;
    kok.dataset.yzMod = mod;
    dugmeyiTazele();
    rayCiz();
    if (mod === "dinleme" || mod === "konusma") donguBaslat();
  }

  function olc() {
    var guc = 0, bas = 0, tiz = 0;

    if (S.mod === "konusma" && S.ttsCoz && S.ttsVeri) {
      // Asistan sesi: bas patlamayı, tiz ışıltıyı sürer.
      S.ttsCoz.getByteFrequencyData(S.ttsVeri);
      var n = S.ttsVeri.length;
      var a = Math.max(2, (n * 0.02) | 0), b = (n * 0.14) | 0, c = (n * 0.45) | 0;
      var t1 = 0, t2 = 0, j;
      for (j = 1; j < a; j++) t1 += S.ttsVeri[j];
      for (j = a; j < b; j++) t1 += S.ttsVeri[j] * 0.6;
      for (j = b; j < c; j++) t2 += S.ttsVeri[j];
      bas = sinirla(t1 / Math.max(1, b - 1) / 190, 0, 1);
      tiz = sinirla(t2 / Math.max(1, c - b) / 150, 0, 1);
      guc = sinirla(bas * 0.7 + tiz * 0.5, 0, 1);
    } else if (S.mod === "dinleme" && S.mikCoz && S.mikZaman) {
      // Mikrofon: zaman alanı RMS'i, konuşma yüksekliğine en yakın ölçü.
      S.mikCoz.getByteTimeDomainData(S.mikZaman);
      var toplam = 0;
      for (var i = 0; i < S.mikZaman.length; i += 2) {
        var d = (S.mikZaman[i] - 128) / 128;
        toplam += d * d;
      }
      guc = sinirla(Math.sqrt(toplam / (S.mikZaman.length / 2)) * 3.4, 0, 1);
      bas = guc * 0.8;
      tiz = guc * 0.5;
    }

    // Yükselirken hızlı, inerken yavaş: ses kesildiğinde ışık birden sönmez,
    // sönümlenir. Tek katsayı kullanılırsa ya tepki geç kalır ya da titrer.
    S.guc = yaklas(S.guc, guc, guc > S.guc ? 0.45 : 0.12);
    S.bas = yaklas(S.bas, bas, bas > S.bas ? 0.5 : 0.14);
    S.tiz = yaklas(S.tiz, tiz, tiz > S.tiz ? 0.5 : 0.16);

    degerYaz("--yz-guc", S.guc, "guc");
    degerYaz("--yz-bas", S.bas, "bas");
    degerYaz("--yz-tiz", S.tiz, "tiz");
    return guc;
  }

  var sonKare = 0;
  function kare(zaman) {
    // Boştayken döngü tamamen durur; sayfa sessizken CPU kullanılmaz.
    if (S.mod !== "dinleme" && S.mod !== "konusma") {
      S.dongu = 0;
      S.guc = S.bas = S.tiz = 0;
      degerYaz("--yz-guc", 0, "guc");
      degerYaz("--yz-bas", 0, "bas");
      degerYaz("--yz-tiz", 0, "tiz");
      return;
    }
    S.dongu = ust.requestAnimationFrame(kare);
    if (zaman - sonKare < 32) return;     // ~30 Hz yeter; ses zarfı bundan hızlı değişmez
    sonKare = zaman;
    vadIsle(olc(), zaman);
  }

  function donguBaslat() {
    if (S.dongu) return;
    S.dongu = ust.requestAnimationFrame(kare);
  }

  // ════════════════════════════════════════════════════════════
  // AÇILIŞ VİDEOSU
  // ════════════════════════════════════════════════════════════
  /*
   * Video Streamlit'in çizim ağacında DURAMAZ. Orada dururken her yeniden
   * çizim öğeyi baştan kuruyor ve video birkaç saniyede bir başa sarıyordu.
   * Burada üst sayfanın gövdesine bir kez eklenir; Streamlit ona hiç dokunamaz.
   *
   * sessionStorage işareti ikinci bir güvence: sayfa gerçekten yenilense bile
   * açılış aynı sekmede bir daha oynamaz.
   */
  function introKur() {
    if (!YAP.intro) return;
    try { if (ust.sessionStorage.getItem("yzIntro") === "1") return; } catch (e) {}
    try { ust.sessionStorage.setItem("yzIntro", "1"); } catch (e) {}

    var kat = el("div", "yz-intro");
    var video = D.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("disablepictureinpicture", "");
    video.src = YAP.intro;
    kat.appendChild(video);
    D.body.appendChild(kat);

    var bitti = false;
    function kapat() {
      if (bitti) return;
      bitti = true;
      kat.classList.add("yz-intro-cik");
      ust.setTimeout(function () {
        if (kat.parentNode) kat.parentNode.removeChild(kat);
      }, 1400);
    }

    /*
     * Chrome, ses izi olmayan videoyu sayfa arka plana düştüğünde "güç
     * tasarrufu" gerekçesiyle duraklatır (AbortError: video-only background
     * media was paused). `autoplay` özniteliği bırakılırsa tarayıcı sayfaya
     * dönüldüğünde oynatmayı BAŞTAN tetikler; açılışın iki saniyede bir başa
     * sarmasının sebebi buydu.
     *
     * Bu yüzden autoplay özniteliği YOK: oynatma elle başlatılır ve duraklama
     * olursa currentTime'a dokunulmadan kaldığı yerden sürdürülür.
     */
    function oynat() {
      if (bitti) return;
      var s = video.play();
      if (s && s.catch) s.catch(function () {});   // sessizce yut, sürdürme denenecek
    }

    video.addEventListener("ended", kapat);
    video.addEventListener("error", kapat);
    video.addEventListener("pause", function () {
      if (!bitti && !video.ended) ust.setTimeout(oynat, 120);
    });
    D.addEventListener("visibilitychange", function () {
      if (!D.hidden && !bitti && video.paused && !video.ended) oynat();
    });

    // Üst sınır: video hiç oynayamazsa katman asılı kalmasın.
    ust.setTimeout(kapat, Math.max(2, YAP.introSure || 7.2) * 1000 + 4000);
    oynat();
  }

  // ════════════════════════════════════════════════════════════
  // MİKROFON DÜĞMESİ
  // ════════════════════════════════════════════════════════════
  var dugme = null;

  function dugmeyiKur() {
    if (!YAP.sesli) return;
    dugme = el("button", "yz-mik", "yz-mik");
    dugme.type = "button";
    dugme.setAttribute("aria-label", "Sesli sohbeti aç veya kapat");
    dugme.innerHTML =
      '<span class="yz-mik-dalga"></span><span class="yz-mik-dalga"></span>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M12 14.5a3 3 0 0 0 3-3v-5a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z"/>' +
      '<path d="M18.5 11.5a6.5 6.5 0 0 1-13 0M12 18v3.2"/></svg>' +
      '<span class="yz-mik-yazi">Sesli sohbet</span>';
    dugme.addEventListener("click", function () {
      if (S.mod === "konusma") { sesiKes(); return; }   // araya girme
      if (S.mikAcik) sesliKapat(); else sesliAc();
    });
    D.body.appendChild(dugme);
  }

  function dugmeyiTazele() {
    if (!dugme) return;
    dugme.dataset.durum = S.mikAcik ? S.mod : "kapali";
    var yazi = dugme.querySelector(".yz-mik-yazi");
    if (!yazi) return;
    yazi.textContent = !S.mikAcik ? "Sesli sohbet"
      : S.mod === "dinleme" ? "Dinliyorum…"
      : S.mod === "dusunme" ? "Düşünüyor…"
      : S.mod === "konusma" ? "Kesmek için dokun" : "Hazır";
  }

  // ════════════════════════════════════════════════════════════
  // SES ZİNCİRİ
  // ════════════════════════════════════════════════════════════
  function baglam() {
    if (!S.ac) {
      var AC = ust.AudioContext || ust.webkitAudioContext;
      if (!AC) return null;
      S.ac = new AC();
    }
    if (S.ac.state === "suspended") { try { S.ac.resume(); } catch (e) {} }
    return S.ac;
  }

  function mikrofonAc() {
    var nav = ust.navigator;
    if (!nav || !nav.mediaDevices || !nav.mediaDevices.getUserMedia) {
      return Promise.reject(new Error("mikrofon yok"));
    }
    return nav.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,     // hoparlörden dönen kendi sesini bastırır
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    }).then(function (akis) {
      S.akis = akis;
      var ac = baglam();
      if (!ac) return;
      S.mikCoz = ac.createAnalyser();
      S.mikCoz.fftSize = 1024;
      S.mikCoz.smoothingTimeConstant = 0.7;
      // Bilerek hoparlöre bağlanmaz; bağlanırsa kullanıcı kendi sesini duyar.
      ac.createMediaStreamSource(akis).connect(S.mikCoz);
      S.mikZaman = new Uint8Array(S.mikCoz.fftSize);
    });
  }

  function mikSustur(sustur) {
    if (!S.akis) return;
    S.akis.getAudioTracks().forEach(function (iz) { iz.enabled = !sustur; });
  }

  function ttsCozumleyici() {
    var ac = baglam();
    if (!ac) return null;
    if (!S.ttsCoz) {
      S.ttsCoz = ac.createAnalyser();
      S.ttsCoz.fftSize = 1024;
      S.ttsCoz.smoothingTimeConstant = 0.6;
      S.ttsCoz.connect(ac.destination);
      S.ttsVeri = new Uint8Array(S.ttsCoz.frequencyBinCount);
    }
    return S.ttsCoz;
  }

  function cal(b64) {
    return new Promise(function (coz) {
      var ac = baglam(), coz_ = ttsCozumleyici();
      if (!ac || !coz_ || !b64) return coz();
      var tampon;
      try {
        var ham = ust.atob(b64);
        tampon = new ArrayBuffer(ham.length);
        var g = new Uint8Array(tampon);
        for (var i = 0; i < ham.length; i++) g[i] = ham.charCodeAt(i);
      } catch (e) { return coz(); }

      var bitti = false;
      function son() { if (!bitti) { bitti = true; S.calan = null; coz(); } }

      ac.decodeAudioData(tampon, function (ses) {
        var kaynak = ac.createBufferSource();
        kaynak.buffer = ses;
        kaynak.connect(coz_);
        kaynak.onended = son;
        S.calan = kaynak;
        try { kaynak.start(); } catch (e) { return son(); }
        // onended bazı tarayıcılarda gelmiyor; emniyet zamanlayıcısı.
        ust.setTimeout(son, (ses.duration + 0.6) * 1000);
      }, son);
    });
  }

  /*
   * Cevabı parça parça seslendirip çalar.
   *
   * Uzun bir cevabın tamamını sentezlemek beş saniye sürüyor ve o süre boyunca
   * ortalık sessiz kalıyordu. Köprü metni cümle sınırlarından bölüyor; burada
   * ilk parça gelir gelmez çalmaya başlanır ve O ÇALARKEN bir sonraki parça
   * istenir. Böylece ilk sesin gecikmesi metnin uzunluğundan bağımsız olur.
   */
  function parcalariCal(metin) {
    function getir(i) {
      return istek("/yz/ses", { metin: metin, parca: i }, { sure: 60000 });
    }
    return getir(0).then(function (ilk) {
      if (!ilk || !ilk.ses) return null;
      var toplam = ilk.toplam || 1;

      mikSustur(true);                 // yankı ve kendi kendini dinleme biter
      moduAyarla("konusma");

      function sirayla(veri, i) {
        // Sıradaki parça, bu parça çalarken hazırlanır.
        var sonraki = (i + 1 < toplam) ? getir(i + 1) : null;
        return cal(veri.ses).then(function () {
          if (!sonraki) return null;
          return sonraki
            .then(function (s) { return (s && s.ses) ? sirayla(s, i + 1) : null; })
            .catch(function () { return null; });   // parça gelmezse sessizce bitir
        });
      }
      return sirayla(ilk, 0);
    });
  }

  function sesiKes() {
    if (S.calan) { try { S.calan.stop(); } catch (e) {} S.calan = null; }
  }

  // ════════════════════════════════════════════════════════════
  // KONUŞMA TANIMA
  // ════════════════════════════════════════════════════════════
  var GONDERME_GECIKMESI = 500;   // son kelimeden sonra bu kadar sessizlik beklenir

  function taniyiciKur() {
    var Tanima = ust.SpeechRecognition || ust.webkitSpeechRecognition;
    if (!Tanima) return null;
    var t = new Tanima();
    t.lang = YAP.dil || "tr-TR";
    t.continuous = true;
    t.interimResults = true;
    t.maxAlternatives = 1;

    t.onresult = function (olay) {
      if (S.mod === "konusma" || S.mod === "dusunme") return;   // kendi sesini yazmasın
      S.yenidenBaslat = 0;
      var ara = "";
      for (var i = olay.resultIndex; i < olay.results.length; i++) {
        var p = olay.results[i];
        if (p.isFinal) S.bekleyen = (S.bekleyen + " " + p[0].transcript).trim();
        else ara += p[0].transcript;
      }
      S.gecici = (S.bekleyen + " " + ara).trim() || null;
      rayCiz();

      if (S.zamanlayici) ust.clearTimeout(S.zamanlayici);
      if (S.bekleyen) {
        S.zamanlayici = ust.setTimeout(function () {
          var m = S.bekleyen.trim();
          S.bekleyen = ""; S.gecici = null;
          if (m) gonder(m);
        }, GONDERME_GECIKMESI);
      }
    };

    t.onerror = function (olay) {
      var k = olay.error;
      if (k === "no-speech" || k === "aborted") return;
      if (k === "not-allowed" || k === "service-not-allowed") {
        S.izinYok = true; S.mikAcik = false;
        moduAyarla("bekleme");
        return;
      }
      if (k === "network" || k === "audio-capture") {
        S.taniyici = null;          // tarayıcı tanıması çalışmıyor
        yedegeGec();
      }
    };

    t.onend = function () {
      S.taniyiciCalisiyor = false;
      // Chrome tanımayı sessizlikte kendiliğinden kapatır; sürekli dinleme
      // ancak yeniden başlatılarak elde edilir.
      if (S.mikAcik && S.mod !== "konusma" && S.mod !== "dusunme") {
        S.yenidenBaslat++;
        ust.setTimeout(taniyiciBaslat, Math.min(200 + S.yenidenBaslat * 40, 1200));
      }
    };
    return t;
  }

  function taniyiciBaslat() {
    if (!S.taniyici || S.taniyiciCalisiyor || !S.mikAcik) return;
    try { S.taniyici.start(); S.taniyiciCalisiyor = true; }
    catch (e) { S.taniyiciCalisiyor = false; }
  }

  function taniyiciDurdur() {
    if (!S.taniyici || !S.taniyiciCalisiyor) return;
    try { S.taniyici.stop(); } catch (e) {}
    S.taniyiciCalisiyor = false;
  }

  // ── Yedek: MediaRecorder + RMS tabanlı konuşma algılama ─────
  var VAD = { esik: 0.045, konusuyor: false, sessizden: 0 };

  function yedegeGec() {
    if (!S.akis) return;
    if (S.sttYedek && ust.MediaRecorder) S.girdi = "Ses · sunucu çözümleme";
    else S.girdi = "Yazı · tarayıcı tanıması yok";
  }

  function vadIsle(seviye, simdi) {
    if (S.taniyici || !S.sttYedek || !S.akis || !S.mikAcik) return;
    if (S.mod !== "dinleme" || !ust.MediaRecorder) return;

    if (seviye > VAD.esik) {
      VAD.sessizden = simdi;
      if (!VAD.konusuyor) { VAD.konusuyor = true; kayitBaslat(); }
    } else if (VAD.konusuyor && simdi - VAD.sessizden > 850) {
      VAD.konusuyor = false;
      kayitBitir();
    }
  }

  function kayitBaslat() {
    if (S.kayitci) return;
    try {
      var tur = ust.MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";
      var k = new ust.MediaRecorder(S.akis, { mimeType: tur });
      var parcalar = [];
      k.ondataavailable = function (o) { if (o.data && o.data.size) parcalar.push(o.data); };
      k.onstop = function () {
        S.kayitci = null;
        if (!parcalar.length) return;
        var blob = new Blob(parcalar, { type: "audio/webm" });
        if (blob.size < 2000) return;    // öksürük, kapı sesi
        blob.arrayBuffer()
          .then(function (t) { return istek("/yz/dinle", t, { ham: true, bicim: "webm", sure: 60000 }); })
          .then(function (v) { if (v && v.metin) gonder(v.metin); })
          .catch(function () {});
      };
      k.start();
      S.kayitci = k;
    } catch (e) { S.kayitci = null; }
  }

  function kayitBitir() {
    if (S.kayitci && S.kayitci.state !== "inactive") {
      try { S.kayitci.stop(); } catch (e) { S.kayitci = null; }
    }
  }

  // ════════════════════════════════════════════════════════════
  // TUR AKIŞI
  // ════════════════════════════════════════════════════════════
  var mesgul = false;

  function bosaDon() {
    mikSustur(false);
    // Hoparlörün kuyruğu mikrofona sızmasın diye kısa bir tampon.
    ust.setTimeout(function () {
      if (S.mikAcik) { moduAyarla("dinleme"); taniyiciBaslat(); }
      else moduAyarla("bekleme");
    }, 240);
  }

  function gonder(metin) {
    if (mesgul || !metin) return;
    metin = String(metin).trim();
    if (metin.length < 2) return;
    mesgul = true;

    S.gecici = null; S.bekleyen = "";
    S.girdi = "Ses";
    taniyiciDurdur();
    kayitBitir();

    S.mesajlar.push({ rol: "user", icerik: metin, etiket: "Sen" });
    moduAyarla("dusunme");

    if (!S.kopruVar) {
      if (!yedekGonder(metin)) {
        S.mesajlar.push({
          rol: "assistant",
          icerik: "Sesli köprü kurulamadı. Aşağıdaki kutuya yazarak devam edebilirsin.",
          etiket: "YAZVEB · yedek"
        });
        moduAyarla(S.mikAcik ? "dinleme" : "bekleme");
      }
      mesgul = false;
      return;
    }

    // Metin ve ses AYRI isteklerle alınır. Köprü aynı makinede olduğu için
    // ikinci gidiş-dönüş birkaç milisaniye tutar; buna karşılık cevap, ses
    // sentezlenmeyi beklemeden ekrana düşer. Uzun cevaplarda bu, okumaya
    // saniyelerce önce başlamak demektir.
    istek("/yz/sor", { soru: metin, oturum: YAP.oturum, ses: false }, { sure: 60000 })
      .then(function (y) {
        if (y.mesajlar && y.mesajlar.length) S.mesajlar = y.mesajlar;
        else S.mesajlar.push({ rol: "assistant", icerik: y.cevap, etiket: y.etiket });
        rayCiz();
        return parcalariCal(y.cevap);
      })
      .catch(function (h) {
        S.mesajlar.push({
          rol: "assistant",
          icerik: "Kusura bakma, cevabı getiremedim. Bir daha sorar mısın?",
          etiket: "YAZVEB · hata"
        });
        try { console.warn("[yzkonsol]", h); } catch (e) {}
      })
      .then(function () { mesgul = false; bosaDon(); });
  }

  // ════════════════════════════════════════════════════════════
  // YAZILI YOLUN SESİNİ DEVRALMA
  // ════════════════════════════════════════════════════════════
  /*
   * Kullanıcı yazarak sorduğunda cevabı Python bir <audio> etiketiyle çalar.
   * O etiket kendi başına çalarsa silüet tepkisiz kalır — spektrum verisi
   * yoktur. Etiket burada devralınıp AudioContext zincirine sokulur.
   *
   * Devralma yalnızca ses bağlamı ZATEN açıksa yapılır: kullanıcı henüz sesli
   * moda hiç girmediyse tarayıcı otomatik oynatmayı engelleyebilir ve
   * devralınan ses hiç duyulmaz. O durumda etikete dokunulmaz.
   */
  function sesEtiketiniDevral(etiket) {
    if (etiket.dataset.yzAlindi === "1") return;   // aynı etiket iki kez işlenmesin
    etiket.dataset.yzAlindi = "1";

    if (!S.ac || S.ac.state !== "running") { taklitZarf(etiket); return; }
    var adres = "";
    try {
      var kaynak = etiket.querySelector("source");
      adres = (kaynak && kaynak.getAttribute("src")) || etiket.getAttribute("src") || "";
    } catch (e) { return; }
    var kesim = adres.indexOf("base64,");
    if (kesim < 0) return;

    /*
     * Etiket DOM'DAN SİLİNMEZ, yalnızca susturulur.
     *
     * Bu düğümü Streamlit'in React ağacı yarattı. Buradan kaldırılırsa React
     * bir sonraki çizimde olmayan bir düğümü silmeye çalışır ve
     * "NotFoundError: The node to be removed is not a child of this node"
     * ile bütün uygulama çöker — sahne, ray, giriş kutusu hepsi gider.
     * Sahiplik React'te kalır; biz sadece sesi kendi zincirimizde çalarız.
     */
    try { etiket.pause(); } catch (e) {}
    etiket.muted = true;
    etiket.removeAttribute("autoplay");

    S.girdi = "Yazı";
    mikSustur(true);
    taniyiciDurdur();

    var oynatma = cal(adres.slice(kesim + 7));
    // Yazılı tur Streamlit tarafında işlendi; konsolun listesi onu görmedi.
    // Önce geçmiş tazelenir, sonra mod değişir — ters sırada rayCiz rayı eski
    // listeyle ezer ve yazarak sorulan soru ekrandan silinir.
    gecmisiCek().then(function () { moduAyarla("konusma"); });
    oynatma.then(bosaDon);
  }

  /*
   * Ses bağlamı açılamadıysa (kullanıcı sesli moda hiç girmedi, tarayıcı
   * otomatik oynatmaya izin vermiyor) etikete DOKUNULMAZ: kendi başına çalar.
   * Spektrum verisi olmadığı için silüet gerçek tonlamayla süremez; bunun
   * yerine konuşma boyunca CSS'te tanımlı taklit bir zarf çalışır. Sahne
   * yine canlıdır, yalnızca ritim gerçek sesin değildir.
   */
  function taklitZarf(etiket) {
    // Bu yolda etikete dokunulmaz: sesi kendisi çalar, biz yalnızca dinleriz.
    function baslat() {
      D.body.classList.add("yz-taklit");
      // Yazılı tur Streamlit tarafında işlendi; önce geçmiş tazelenir ki
      // moduAyarla → rayCiz rayı eski listeyle ezmesin.
      gecmisiCek().then(function () { moduAyarla("konusma"); });
    }
    function bitir() {
      D.body.classList.remove("yz-taklit");
      moduAyarla(S.mikAcik ? "dinleme" : "bekleme");
    }
    etiket.addEventListener("playing", baslat);
    etiket.addEventListener("ended", bitir);
    etiket.addEventListener("error", bitir);
    if (!etiket.paused) baslat();
  }

  function sesEtiketiniIzle() {
    if (!ust.MutationObserver) return;
    new ust.MutationObserver(function (kayitlar) {
      for (var i = 0; i < kayitlar.length; i++) {
        var eklenen = kayitlar[i].addedNodes;
        for (var j = 0; j < eklenen.length; j++) {
          var d = eklenen[j];
          if (!d || d.nodeType !== 1) continue;
          if (d.matches && d.matches("audio[data-yz]")) { sesEtiketiniDevral(d); continue; }
          if (d.querySelector) {
            var ic = d.querySelector("audio[data-yz]");
            if (ic) sesEtiketiniDevral(ic);
          }
        }
      }
    }).observe(D.body, { childList: true, subtree: true });
  }

  // ════════════════════════════════════════════════════════════
  // AÇ / KAPAT
  // ════════════════════════════════════════════════════════════
  var selamlandi = false;

  function sesliAc() {
    baglam();                       // kullanıcı hareketi: ses bağlamı burada açılır
    if (dugme) dugme.dataset.durum = "hazirlaniyor";
    mikrofonAc().then(function () {
      S.mikAcik = true;
      S.izinYok = false;
      S.girdi = "Ses";
      S.taniyici = S.taniyici || taniyiciKur();
      if (S.taniyici) taniyiciBaslat();
      else yedegeGec();
      moduAyarla("dinleme");
      selamla();
    }).catch(function () {
      S.izinYok = true;
      S.mikAcik = false;
      moduAyarla("bekleme");
    });
  }

  function sesliKapat() {
    S.mikAcik = false;
    taniyiciDurdur();
    kayitBitir();
    sesiKes();
    if (S.akis) {
      S.akis.getTracks().forEach(function (i) { try { i.stop(); } catch (e) {} });
      S.akis = null;
    }
    S.mikCoz = null;
    S.girdi = "Yazı";
    moduAyarla("bekleme");
  }

  function selamla() {
    if (selamlandi || !S.kopruVar || !YAP.selam) return;
    selamlandi = true;
    istek("/yz/ses", { metin: YAP.selam }, { sure: 30000 })
      .then(function (s) {
        if (!s || !s.ses) return;
        mikSustur(true);
        moduAyarla("konusma");
        return cal(s.ses).then(bosaDon);
      })
      .catch(function () {});
  }

  // ════════════════════════════════════════════════════════════
  // KURULUM
  // ════════════════════════════════════════════════════════════
  function kur() {
    if (!D.body) { ust.setTimeout(kur, 60); return; }

    kok.dataset.yzMod = "bekleme";

    introKur();
    dugmeyiKur();
    dugmeyiTazele();
    sesEtiketiniIzle();

    kopruyuYokla().then(gecmisiCek);

    D.addEventListener("keydown", function (o) {
      if (o.key === "Escape" && S.mod === "konusma") sesiKes();
    });

    D.addEventListener("visibilitychange", function () {
      if (D.hidden) taniyiciDurdur();
      else if (S.mikAcik && S.mod === "dinleme") taniyiciBaslat();
    });

    ust.__yzKonsol = {
      surum: 2,
      durum: S,
      tazele: function (yeni) {
        // Rerun sonrası: yapılandırma tazelenir, ses ve mikrofon korunur.
        if (yeni) {
          YAP.oturum = yeni.oturum || YAP.oturum;
          YAP.anahtar = yeni.anahtar || YAP.anahtar;
          YAP.adres = yeni.adres || YAP.adres;
          YAP.selam = yeni.selam || YAP.selam;
        }
        gecmisiCek();
      },
      sor: gonder,
      kes: sesiKes,
      kapat: sesliKapat
    };
  }

  kur();
})();
"""


def betik(yapilandirma: dict) -> str:
    """
    Konsolu üst sayfaya kuran bileşen HTML'i.

    `yapilandirma` anahtarları:
      adres      — köprü kök adresi ("http://127.0.0.1:8787") veya ""
      anahtar    — köprü oturum anahtarı
      oturum     — sohbet oturumu kimliği
      gorunen    — rayda kaç mesaj görünsün
      selam      — mikrofon açılınca söylenecek karşılama ("" ise atlanır)
      dil        — konuşma tanıma dili
      sesli      — mikrofon düğmesi çizilsin mi
      intro      — açılış videosunun adresi ("" ise katman kurulmaz)
      introSure  — videonun sönmeye başladığı an (saniye)
    """
    ayar = dict(yapilandirma)
    ayar.setdefault("gorunen", 3)
    ayar.setdefault("dil", "tr-TR")
    ayar.setdefault("selam", "")
    ayar.setdefault("sesli", True)
    ayar.setdefault("intro", "")
    ayar.setdefault("introSure", 7.2)
    return "<script>" + _BETIK.replace(
        "__YAPILANDIRMA__", json.dumps(ayar, ensure_ascii=False)
    ) + "</script>"
