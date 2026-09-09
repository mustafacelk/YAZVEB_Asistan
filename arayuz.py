# -*- coding: utf-8 -*-
"""
Görsel katman.

Tasarım kararı: sohbet balonu yok. Metin, silüetin üzerinde duran bir telemetri
rayı gibi davranır. Yeni mesaj alttan girer, eskiler yukarı doğru söner ve
karanlığa karışır — silüet onları yutuyormuş gibi.

İMZA ÖĞE: KONUŞAN SİLÜET
────────────────────────
Asistan konuştuğunda ekrana bir şey EKLENMEZ; silüetin kendisi canlanır.
Üç katman bunu yapar:

  .yz-hale    silüetin bulanık kopyası, screen karışımıyla üstüne biner —
              sesin gücüne göre parlar. Figür kendi ışığını yayıyormuş gibi.
  .yz-bloom   başın çevresindeki yumuşak radyal alan.
  .yz-halka   bas vuruşlarında dışa açılan ince halkalar.

Üçü de tek bir şeyden beslenir: kök öğedeki `--yz-guc`, `--yz-bas`, `--yz-tiz`
değişkenleri ve `data-yz-mod` özniteliği. Bunları konsol.py her karede yazar
(bkz. oradaki "GÖRSEL SÜRÜŞ" bölümü). Buradaki hiçbir kural JavaScript
çağırmaz; hepsi derleyici katmanında çalışan opaklık ve ölçek değişimidir.

Kritik ayrıntı: `.yz-hale` üzerindeki `filter` değeri ASLA kare kare
değişmez. Değişseydi tarayıcı her karede 16 piksellik bulanıklığı yeniden
hesaplardı. Yalnızca `opacity` ve `transform` sürülür; ikisi de bedava.
"""

from __future__ import annotations

import html as _html

import konsol

RENKLER = {
    "bosluk": "#05070C",
    "derin": "#0A101C",
    "cyan": "#00E5FF",
    "kehribar": "#FF7A2F",
    "metin": "#DDE8F0",
    "sonuk": "#6F8496",
}

# Çok ince film grenleri. Tek bir 64×64 döşeme; dosya değil, veri adresi.
_GREN = (
    "data:image/svg+xml;charset=utf-8,"
    "%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E"
    "%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9'"
    " numOctaves='2'/%3E%3C/filter%3E"
    "%3Crect width='64' height='64' filter='url(%23g)' opacity='.5'/%3E%3C/svg%3E"
)


def stil(odak_yuksekligi: str = "32%") -> str:
    return f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500&family=Space+Grotesk:wght@400;500;600&display=swap');

:root {{
  --bosluk:{RENKLER['bosluk']};
  --derin:{RENKLER['derin']};
  --cyan:{RENKLER['cyan']};
  --kehribar:{RENKLER['kehribar']};
  --metin:{RENKLER['metin']};
  --sonuk:{RENKLER['sonuk']};
  --ray: clamp(290px, 26vw, 420px);
  --kenar: clamp(20px, 3.4vw, 58px);
  --odak: {odak_yuksekligi};
  color-scheme: dark;
  --sabit: 100vh;                   /* klavye ve adres çubuğundan etkilenmez */
  --dip: env(safe-area-inset-bottom, 0px);
  --govde: 'IBM Plex Sans', system-ui, sans-serif;
  --etiket: 'IBM Plex Mono', ui-monospace, monospace;
  --baslik: 'Space Grotesk', var(--govde);

  /* Ses sürüşü — konsol.py her karede yazar. Betik hiç çalışmazsa sıfır
     kalırlar ve sahne sakin görünür; hiçbir kural kırılmaz. */
  --yz-guc: 0;
  --yz-bas: 0;
  --yz-tiz: 0;
}}

/* lvh, adres çubuğu ve klavye ne yaparsa yapsın sabit kalır. Sabit katmanlar
   buna bağlanır — dvh'ye bağlıyken klavye açılınca küçülüp yukarı sıkışıyordu. */
@supports (height: 100lvh) {{ :root {{ --sabit: 100lvh; }} }}

/* ── Streamlit kabuğunu sustur ─────────────────────────────── */
#MainMenu, footer, [data-testid="stToolbar"], [data-testid="stDecoration"],
[data-testid="stStatusWidget"], header[data-testid="stHeader"] {{ display:none !important; }}
.stApp {{ background: var(--bosluk) !important; }}
[data-testid="stAppViewContainer"], [data-testid="stMain"] {{ background: transparent !important; }}
.block-container {{ padding:0 !important; max-width:100% !important; }}
[data-testid="stVerticalBlock"] {{ gap:0 !important; }}
[data-testid="stElementContainer"] {{ margin:0 !important; }}

/* Taşıyıcı çerçeveler görünmez ve TIKLANAMAZ olmalı. Streamlit çerçeve
   başlığını "streamlit.components.v1.html"den "st.iframe"e taşıdı; tek başlığa
   bağlı kalan seçici sessizce eşleşmeyi bırakıyor ve sıfır yükseklikli
   çerçevenin kapsayıcısı alttaki düğmelerin tıklamasını yutuyordu. */
iframe[title="streamlit.components.v1.html"], iframe[title="st.iframe"] {{
  height:0 !important; border:0 !important; display:block !important;
  position:absolute !important; pointer-events:none !important; opacity:0 !important;
}}
[data-testid="stElementContainer"]:has(> iframe[title="st.iframe"]),
[data-testid="stElementContainer"]:has(> iframe[title="streamlit.components.v1.html"]) {{
  pointer-events:none !important; height:0 !important;
}}

html, body {{
  overflow:hidden !important; overscroll-behavior:none;
  -webkit-tap-highlight-color: transparent;
  -webkit-text-size-adjust: 100%;
}}
::-webkit-scrollbar {{ width:0; height:0; }}

/* Klavye açıkken tarayıcı görünen pencereyi kaydırır, sabit katmanlar sayfanın
   tepesinde kalır. Aşağıdaki değişken bunu telafi eder; betik çalışmazsa 0
   olur ve eski davranışa döner. */
.yz-sahne, .yz-intro, .yz-perde, .yz-isik {{
  position:fixed; inset:0; height:var(--sabit); pointer-events:none;
  transform: translateY(var(--vv-kaydirma, 0px));
  transition: transform .18s ease-out;
}}

/* ── Sahne ─────────────────────────────────────────────────── */
.yz-sahne {{
  z-index:0; overflow:hidden;
  background: radial-gradient(115% 85% at 50% 26%, #0D1526 0%, #070B14 52%, var(--bosluk) 100%);
}}
/* Silüet HER çizimde birebir aynı HTML olarak üretilir. Tek karakteri bile
   değişirse tarayıcı öğeyi baştan kurar ve silüet bir an kaybolur. */
.yz-figur, .yz-hale {{
  position:absolute; inset:0; width:100%; height:100%;
  object-fit:cover; object-position:center 14%;
}}
.yz-figur {{ animation: yz-ac 1.6s ease-out both; }}

/* ── Açılış videosu ────────────────────────────────────────── */
/* Katmanı konsol.py üst sayfaya kurar; Streamlit'in çizim ağacında değildir.
   Orada dururken her yeniden çizim öğeyi yeniden yaratıyor ve video birkaç
   saniyede bir başa sarıyordu. */
.yz-intro {{ z-index:1; overflow:hidden; background:var(--bosluk); }}
.yz-intro video {{
  position:absolute; inset:0; width:100%; height:100%;
  object-fit:cover; object-position:center 14%;
}}
.yz-intro.yz-intro-cik {{ animation: yz-intro-cikis 1.3s ease-in-out forwards; }}
@keyframes yz-intro-cikis {{ to {{ opacity:0; visibility:hidden; }} }}

/* ── Okunabilirlik perdesi ─────────────────────────────────── */
.yz-perde {{
  z-index:2;
  background:
    linear-gradient(90deg, rgba(5,7,12,.95) 0%, rgba(5,7,12,.74) 24%, rgba(5,7,12,.10) 48%, transparent 62%),
    linear-gradient(0deg, rgba(5,7,12,.96) 0%, rgba(5,7,12,.35) 22%, transparent 42%),
    radial-gradient(95% 75% at 50% 42%, transparent 38%, rgba(5,7,12,.55) 78%, rgba(5,7,12,.92) 100%);
}}
/* Film greni — sahneyi dijital düzlükten çıkarır. Tek döşeme, tek katman. */
.yz-perde::after {{
  content:""; position:absolute; inset:-64px;
  background-image:url("{_GREN}");
  opacity:.05; mix-blend-mode:overlay;
  animation: yz-gren 1.1s steps(4) infinite;
}}
@keyframes yz-gren {{
  0%   {{ transform:translate3d(0,0,0); }}
  25%  {{ transform:translate3d(-14px,9px,0); }}
  50%  {{ transform:translate3d(11px,-12px,0); }}
  75%  {{ transform:translate3d(-8px,-6px,0); }}
  100% {{ transform:translate3d(0,0,0); }}
}}

/* ══════════════════════════════════════════════════════════
   İMZA: KONUŞAN SİLÜET
   Üç katmanın tamamı --yz-guc / --yz-bas ile sürülür.
   ══════════════════════════════════════════════════════════ */
.yz-isik {{ z-index:3; }}

/* Silüetin bulanık kopyası. FİLTRE SABİTTİR — yalnızca opaklık ve ölçek
   değişir, böylece bulanıklık bir kez hesaplanır. */
.yz-hale {{
  /* Parlaklık bilerek düşük, bulanıklık bilerek geniş. Yüksek parlaklıkta
     görselin zaten aydınlık bölgeleri doyuma girip yağ lekesi gibi yassı
     kabarcıklara dönüşüyordu; ışık değil, leke oluyordu. */
  filter: blur(26px) brightness(1.16) saturate(.7);
  mix-blend-mode: screen;
  opacity: calc(.03 + var(--yz-guc) * .55);
  transform: scale(calc(1 + var(--yz-bas) * .012));
  transition: opacity .1s linear, transform .14s ease-out;
  will-change: opacity, transform;
  /* Işık gövdeye değil, başa toplanır — konuşan yer orası. Maske sabittir,
     kare kare hesaplanmaz. */
  -webkit-mask-image: radial-gradient(56% 40% at 50% var(--odak),
      #000 0%, rgba(0,0,0,.6) 46%, transparent 80%);
          mask-image: radial-gradient(56% 40% at 50% var(--odak),
      #000 0%, rgba(0,0,0,.6) 46%, transparent 80%);
}}
/* Dinlerken ton hafifçe ısınır: kullanıcı konuşuyor, asistan değil. Renk asıl
   olarak bloom katmanından gelir; hale yalnızca sıcaklığı taşır. Filtre
   yalnızca mod değiştiğinde yeniden hesaplanır, kare kare değil. */
html[data-yz-mod="dinleme"] .yz-hale {{
  filter: blur(26px) brightness(1.14) saturate(.5) sepia(.45);
}}

.yz-bloom {{
  position:absolute; left:50%; top:var(--odak);
  width:min(86vh,76vw); aspect-ratio:1;
  background: radial-gradient(circle,
      rgba(0,229,255,.30) 0%, rgba(0,229,255,.12) 34%,
      rgba(0,150,200,.04) 58%, transparent 72%);
  filter: blur(12px); mix-blend-mode: screen;
  opacity: calc(.08 + var(--yz-guc) * .8);
  transform: translate(-50%,-50%) scale(calc(.88 + var(--yz-guc) * .26));
  transition: opacity .1s linear, transform .16s ease-out;
  will-change: opacity, transform;
}}
html[data-yz-mod="dinleme"] .yz-bloom {{
  background: radial-gradient(circle,
      rgba(255,122,47,.26) 0%, rgba(255,122,47,.10) 34%, transparent 70%);
}}

/* Boştayken çok yavaş bir nefes: sahne donmuş görünmesin. Tek katman, tek
   dönüşüm — JavaScript hiç çalışmadan. */
.yz-halkalar {{
  position:absolute; inset:0;
  opacity: calc(var(--yz-guc) * .9);
  transition: opacity .14s linear;
  animation: yz-nefes 9s ease-in-out infinite;
}}
.yz-halka {{
  position:absolute; left:50%; top:var(--odak);
  width:min(40vh,36vw); aspect-ratio:1; border-radius:50%;
  border:1px solid rgba(0,229,255,.42);
  transform:translate(-50%,-50%) scale(.3);
  opacity:0;
  animation: yz-yayil 3.1s cubic-bezier(.16,.72,.3,1) infinite;
  animation-play-state: paused;
}}
.yz-halka:nth-of-type(2) {{ animation-delay:1.03s; }}
.yz-halka:nth-of-type(3) {{ animation-delay:2.06s; }}
html[data-yz-mod="konusma"] .yz-halka,
html[data-yz-mod="dinleme"] .yz-halka,
body.yz-taklit .yz-halka {{ animation-play-state: running; }}
html[data-yz-mod="dinleme"] .yz-halka {{ border-color: rgba(255,122,47,.46); }}

@keyframes yz-nefes {{ 0%,100% {{ transform:scale(.985); }} 50% {{ transform:scale(1.015); }} }}
@keyframes yz-yayil {{
  0%   {{ transform:translate(-50%,-50%) scale(.30); opacity:0; border-width:1.4px; }}
  14%  {{ opacity:.75; }}
  100% {{ transform:translate(-50%,-50%) scale(2.4); opacity:0; border-width:.4px; }}
}}
@keyframes yz-ac {{ from {{ opacity:0; }} to {{ opacity:1; }} }}

/* Ses bağlamı açılamadığında (kullanıcı sesli moda hiç girmediyse) spektrum
   verisi yoktur. O zaman konuşma süresince taklit bir zarf çalışır: gerçek
   tonlama değil, ama silüet yine de konuşuyor gibi durur. */
body.yz-taklit .yz-hale {{ animation: yz-taklit-hale 1.7s ease-in-out infinite; }}
body.yz-taklit .yz-bloom {{ animation: yz-taklit-bloom 1.7s ease-in-out infinite; }}
@keyframes yz-taklit-hale {{ 0%,100% {{ opacity:.22; }} 45% {{ opacity:.62; }} }}
@keyframes yz-taklit-bloom {{ 0%,100% {{ opacity:.34; }} 45% {{ opacity:.78; }} }}

/* ── Sol rayın üst ucu: kimlik ─────────────────────────────── */
.yz-rozet {{
  position:fixed; top:calc(clamp(20px,3.4vh,40px) + var(--vv-kaydirma, 0px));
  left:var(--kenar); z-index:5;
  display:flex; align-items:center; gap:14px;
  animation: yz-giris .9s ease-out both; animation-delay:.35s;
}}
.yz-rozet img {{ width:52px; height:52px; object-fit:contain; filter:drop-shadow(0 4px 14px rgba(0,0,0,.6)); }}
.yz-rozet .ad {{
  font-family:var(--baslik); font-size:.94rem; font-weight:600;
  letter-spacing:.18em; color:var(--metin); text-transform:uppercase; line-height:1;
}}
.yz-rozet .durum {{
  margin-top:7px; font-family:var(--etiket); font-size:.6rem; letter-spacing:.2em;
  color:var(--sonuk); text-transform:uppercase; display:flex; align-items:center; gap:7px;
}}
.yz-nabiz {{
  width:5px; height:5px; border-radius:50%; background:var(--cyan);
  box-shadow:0 0 8px var(--cyan); animation: yz-nabiz 2.6s ease-in-out infinite;
}}
@keyframes yz-nabiz {{ 0%,100%{{opacity:.35}} 50%{{opacity:1}} }}

/* ── Sohbet rayı ───────────────────────────────────────────── */
.yz-akis {{
  position:fixed; left:var(--kenar); box-sizing:border-box;
  bottom:calc(clamp(96px,12vh,140px) + var(--vv-alt, 0px));
  width:var(--ray); z-index:4; pointer-events:none;
  display:flex; flex-direction:column; justify-content:flex-end; gap:20px;
}}
.yz-satir {{ border-left:1px solid rgba(0,229,255,.30); padding-left:15px; transform-origin:left bottom; }}
.yz-satir[data-rol="user"] {{ border-left-color: rgba(255,122,47,.42); }}
.yz-satir[data-derinlik="0"] {{ animation: yz-giris .62s cubic-bezier(.22,.9,.28,1) both; }}
.yz-satir[data-derinlik="1"] {{ opacity:.38; filter:blur(1.3px); transform:scale(.988) translateY(3px); }}
.yz-satir[data-derinlik="2"] {{
  opacity:.13; filter:blur(3.4px); transform:scale(.972) translateY(6px);
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 78%);
          mask-image: linear-gradient(180deg, transparent 0%, #000 78%);
}}
.yz-satir[data-derinlik="1"], .yz-satir[data-derinlik="2"] {{ transition: all .8s ease; }}

.yz-etiket {{
  font-family:var(--etiket); font-size:.575rem; letter-spacing:.22em;
  text-transform:uppercase; color:var(--sonuk); margin-bottom:7px;
}}
.yz-satir[data-rol="assistant"] .yz-etiket {{ color:rgba(0,229,255,.62); }}
.yz-satir[data-rol="user"] .yz-etiket {{ color:rgba(255,122,47,.62); }}
.yz-metin {{
  font-family:var(--govde); font-weight:300; font-size:1.02rem; line-height:1.62;
  color:var(--metin); text-shadow:0 2px 18px rgba(0,0,0,.85); text-wrap:pretty;
}}
.yz-satir[data-rol="user"] .yz-metin {{ color:#C6D3DD; font-size:.95rem; }}

/* Düşünme göstergesi: tarayan hairline */
.yz-tarayici {{ height:1px; width:100%; margin-top:4px; overflow:hidden; background:rgba(0,229,255,.10); }}
.yz-tarayici i {{
  display:block; height:100%; width:38%;
  background:linear-gradient(90deg, transparent, var(--cyan), transparent);
  animation: yz-tara 1.15s linear infinite;
}}
@keyframes yz-tara {{ from{{transform:translateX(-110%)}} to{{transform:translateX(320%)}} }}
@keyframes yz-giris {{ from{{opacity:0; transform:translateY(16px)}} to{{opacity:1; transform:none}} }}

/* ── Streamlit giriş kutusu ────────────────────────────────── */
[data-testid="stBottom"], [data-testid="stBottom"] > div {{ background:transparent !important; }}
[data-testid="stBottomBlockContainer"] {{
  padding:0 0 clamp(20px,3.2vh,38px) 0 !important; max-width:100% !important;
}}
[data-testid="stChatInput"] {{
  width:var(--ray) !important; margin-left:var(--kenar) !important; box-sizing:border-box;
  background: rgba(9,14,24,.68) !important;
  border:1px solid rgba(0,229,255,.16) !important; border-radius:2px !important;
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
  backdrop-filter: blur(14px) saturate(1.2);
  box-shadow: 0 16px 46px rgba(0,0,0,.62);
  transition: border-color .35s ease, box-shadow .35s ease;
}}
[data-testid="stChatInput"]:focus-within {{
  border-color: rgba(0,229,255,.50) !important;
  box-shadow: 0 0 30px rgba(0,229,255,.14), 0 16px 46px rgba(0,0,0,.62);
}}
[data-testid="stChatInput"] textarea {{
  color: var(--metin) !important; font-family: var(--govde) !important;
  font-size:.95rem !important; font-weight:300 !important;
}}
[data-testid="stChatInput"] textarea::placeholder {{
  color: rgba(111,132,150,.62) !important; letter-spacing:.03em;
}}
[data-testid="stChatInput"] button {{ background:transparent !important; }}
[data-testid="stChatInput"] button svg {{ fill: var(--cyan) !important; color: var(--cyan) !important; }}

/* ── Mikrofon düğmesi ──────────────────────────────────────── */
.yz-mik {{
  /* Streamlit'in alt çubuğu (stBottom) tam genişlikte, sticky ve z-index:99.
     Düğme onun altında kalırsa görünür ama TIKLANAMAZ olur. */
  position:fixed; z-index:120;
  left: calc(var(--kenar) + var(--ray) + 18px);
  bottom: calc(clamp(20px,3.2vh,38px) + var(--vv-alt, 0px));
  display:flex; align-items:center; gap:11px;
  height:46px; padding:0 20px 0 15px; margin:0;
  background: rgba(9,14,24,.68);
  border:1px solid rgba(0,229,255,.16); border-radius:2px;
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
  backdrop-filter: blur(14px) saturate(1.2);
  box-shadow: 0 16px 46px rgba(0,0,0,.62);
  color: var(--sonuk); cursor:pointer;
  font-family:var(--etiket); font-size:.575rem; letter-spacing:.2em;
  text-transform:uppercase; white-space:nowrap;
  transition: color .3s ease, border-color .35s ease, box-shadow .35s ease;
  -webkit-tap-highlight-color: transparent;
}}
.yz-mik:hover {{ color:var(--metin); border-color:rgba(0,229,255,.42); }}
.yz-mik:focus-visible {{ outline:1px solid var(--cyan); outline-offset:2px; }}
.yz-mik svg {{
  width:17px; height:17px; flex:none; fill:none; stroke:currentColor;
  stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round;
}}
.yz-mik .yz-mik-dalga {{
  position:absolute; left:22px; top:50%; width:34px; height:34px;
  margin:-17px 0 0 -17px; border-radius:50%; pointer-events:none;
  border:1px solid currentColor; opacity:0;
}}
.yz-mik[data-durum="kapali"] {{ color: rgba(111,132,150,.75); }}
.yz-mik[data-durum="hazirlaniyor"] {{ color: var(--cyan); border-color:rgba(0,229,255,.34); }}
.yz-mik[data-durum="dinleme"] {{
  color: var(--kehribar); border-color: rgba(255,122,47,.48);
  box-shadow: 0 0 26px rgba(255,122,47,.16), 0 16px 46px rgba(0,0,0,.62);
}}
.yz-mik[data-durum="dinleme"] .yz-mik-dalga {{ animation: yz-mik-dalga 2.1s ease-out infinite; }}
.yz-mik[data-durum="dinleme"] .yz-mik-dalga:nth-of-type(2) {{ animation-delay:1.05s; }}
.yz-mik[data-durum="dusunme"] {{
  color: var(--cyan); border-color: rgba(0,229,255,.34);
  animation: yz-mik-nabiz 1.15s ease-in-out infinite;
}}
.yz-mik[data-durum="konusma"] {{
  color: var(--cyan); border-color: rgba(0,229,255,.58);
  box-shadow: 0 0 34px rgba(0,229,255,.20), 0 16px 46px rgba(0,0,0,.62);
}}
.yz-mik[data-durum="konusma"] .yz-mik-dalga {{ animation: yz-mik-dalga 1.5s ease-out infinite; }}
.yz-mik[data-durum="konusma"] .yz-mik-dalga:nth-of-type(2) {{ animation-delay:.75s; }}
@keyframes yz-mik-dalga {{ 0% {{ transform:scale(.55); opacity:.65; }} 100% {{ transform:scale(2.2); opacity:0; }} }}
@keyframes yz-mik-nabiz {{ 0%,100% {{ opacity:.55; }} 50% {{ opacity:1; }} }}

/* ── Dar ekran ─────────────────────────────────────────────── */
@media (max-width: 900px) {{
  :root {{ --ray: calc(100vw - (2 * var(--kenar))); --odak: 27%; }}
  .yz-figur, .yz-hale, .yz-intro video {{ object-position:center 8%; }}
  .yz-perde {{
    background:
      linear-gradient(0deg, rgba(5,7,12,.98) 0%, rgba(5,7,12,.88) 24%, rgba(5,7,12,.34) 42%, transparent 60%),
      radial-gradient(110% 66% at 50% 30%, transparent 52%, rgba(5,7,12,.60) 100%);
  }}
  .yz-perde::after {{ display:none; }}          /* gren telefon GPU'sunda pahalı */
  .yz-hale {{ filter: blur(16px) brightness(1.14) saturate(.7); }}
  html[data-yz-mod="dinleme"] .yz-hale {{ filter: blur(16px) brightness(1.12) saturate(.5) sepia(.45); }}
  .yz-bloom {{ filter:blur(5px); width:min(70vh,92vw); }}
  .yz-halka:nth-of-type(3) {{ display:none; }}

  .yz-akis {{ bottom:calc(96px + max(8px, var(--dip)) + var(--vv-alt, 0px)); gap:15px; }}
  .yz-satir[data-derinlik="2"] {{ display:none; }}
  .yz-rozet img {{ width:42px; height:42px; }}
  .yz-metin {{ font-size:1.06rem; line-height:1.58; }}

  /* Dar ekranda giriş kutusu tüm genişliği kaplar; düğme üstüne çıkar. */
  .yz-mik {{
    left:auto; right:var(--kenar);
    bottom: calc(clamp(20px,3.2vh,38px) + 56px + var(--vv-alt, 0px));
    height:42px; padding:0 16px 0 13px;
  }}
  .yz-mik .yz-mik-dalga {{ left:20px; }}

  [data-testid="stBottomBlockContainer"] {{
    padding:0 0 calc(16px + max(8px, var(--dip))) 0 !important;
  }}
  /* iOS, 16px altındaki yazı alanına odaklanınca sayfayı yakınlaştırır. */
  [data-testid="stChatInput"] textarea {{ font-size:16px !important; }}
  [data-testid="stChatInput"] button {{ min-width:44px; min-height:44px; }}
}}

/* Klavye açıkken görünen alan yarıya iner; ray tek mesaja düşer. */
@media (max-height: 560px) and (orientation: portrait) {{
  .yz-satir[data-derinlik="1"], .yz-satir[data-derinlik="2"] {{ display:none; }}
  .yz-akis {{ bottom:calc(84px + max(8px, var(--dip)) + var(--vv-alt, 0px)); gap:10px; }}
  .yz-rozet {{ opacity:0; transition:opacity .3s ease; }}
  .yz-mik .yz-mik-yazi {{ display:none; }}
  .yz-mik {{ padding:0 13px; }}
}}

/* ── Yatay tutulan telefon ─────────────────────────────────── */
@media (max-height: 520px) and (orientation: landscape) {{
  :root {{ --ray: clamp(240px, 42vw, 380px); --odak: 40%; }}
  .yz-figur, .yz-hale, .yz-intro video {{ object-position:center 18%; }}
  .yz-perde {{
    background:
      linear-gradient(90deg, rgba(5,7,12,.96) 0%, rgba(5,7,12,.80) 30%, rgba(5,7,12,.15) 56%, transparent 68%),
      linear-gradient(0deg, rgba(5,7,12,.92) 0%, transparent 34%),
      radial-gradient(95% 80% at 55% 45%, transparent 40%, rgba(5,7,12,.70) 100%);
  }}
  .yz-akis {{ bottom:calc(78px + var(--dip) + var(--vv-alt, 0px)); gap:10px; }}
  .yz-satir[data-derinlik="1"], .yz-satir[data-derinlik="2"] {{ display:none; }}
  .yz-rozet .durum {{ display:none; }}
  .yz-rozet img {{ width:34px; height:34px; }}
  .yz-metin {{ font-size:.95rem; line-height:1.5; }}
}}

/* ── Çok uzun ekran (19.5:9 ve ötesi) ──────────────────────── */
/* Tam ekran cover bu oranda görseli iki katına yakın büyütür ve silüetten
   geriye yalnızca kafa kalır. Ara çözüm: kutu üst bölüme daraltılır. */
@media (max-width: 900px) and (max-aspect-ratio: 3/5) {{
  :root {{ --odak: 26%; }}
  .yz-figur, .yz-hale, .yz-intro video {{
    object-position: center 22%; inset: 0 0 auto 0; height: 64%;
    -webkit-mask-image: linear-gradient(180deg, #000 56%, rgba(0,0,0,.45) 82%, transparent 100%);
            mask-image: linear-gradient(180deg, #000 56%, rgba(0,0,0,.45) 82%, transparent 100%);
  }}
  .yz-perde {{
    background:
      linear-gradient(0deg, rgba(5,7,12,.98) 0%, rgba(5,7,12,.84) 26%, rgba(5,7,12,.18) 46%, transparent 62%),
      radial-gradient(125% 56% at 50% 24%, transparent 58%, rgba(5,7,12,.48) 100%);
  }}
}}

/* Dokunmatik cihazlarda backdrop-filter kare düşürüyor; hafifletilir */
@media (hover: none) and (pointer: coarse) {{
  [data-testid="stChatInput"], .yz-mik {{
    -webkit-backdrop-filter: blur(7px);
    backdrop-filter: blur(7px); background: rgba(9,14,24,.86) !important;
  }}
  [data-testid="stChatInput"] textarea {{ touch-action: manipulation; }}
}}

/* ── Hareket hassasiyeti ───────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {{
  .yz-halka, .yz-halkalar, .yz-tarayici i, .yz-nabiz, .yz-perde::after,
  .yz-satir, .yz-rozet, .yz-figur, .yz-mik, .yz-mik .yz-mik-dalga {{
    animation:none !important;
  }}
  .yz-hale, .yz-bloom {{ transition:none; }}
}}

.yz-uyari {{
  position:fixed; left:50%; top:46%; transform:translate(-50%,-50%); z-index:6;
  font-family:var(--etiket); font-size:.72rem; letter-spacing:.12em; line-height:2;
  color:rgba(255,122,47,.9); text-align:center;
  border:1px solid rgba(255,122,47,.28); padding:22px 30px; background:rgba(10,7,4,.7);
}}
</style>
"""


# ══════════════════════════════════════════════════════════════════
# HTML PARÇALARI
# ══════════════════════════════════════════════════════════════════

def sahne(figur: str, hale: str) -> str:
    """
    Sabit sahne. Çıktı her çizimde birebir aynı olmalı: tek karakteri
    değişirse tarayıcı öğeleri baştan kurar ve silüet bir an kaybolur.
    """
    return (
        f'<div class="yz-sahne">{figur}</div>'
        f'<div class="yz-perde"></div>'
        f'<div class="yz-isik">{hale}'
        f'<div class="yz-bloom"></div>'
        f'<div class="yz-halkalar">'
        f'<div class="yz-halka"></div><div class="yz-halka"></div><div class="yz-halka"></div>'
        f'</div></div>'
    )


def figur_gorsel(kaynak: str, kaynak_seti: str = "") -> str:
    """
    kaynak: statik adres ("app/static/siluet-2560.webp") ya da data URI.

    srcset verilirse tarayıcı ekran genişliğine uyan boyutu indirir; telefonda
    2560 piksellik görseli çözmek boşuna iş ve boşuna bellek.
    """
    ek = f' srcset="{kaynak_seti}" sizes="100vw"' if kaynak_seti else ""
    return f'<img class="yz-figur" src="{kaynak}"{ek} alt="" decoding="async">'


def hale_gorsel(kaynak: str) -> str:
    """
    Işıyan kopya. Bilerek küçük görsel kullanılır: 15 piksellik bulanıklık
    zaten ayrıntıyı siler, büyük dosya yalnızca bellek ve raster süresi yer.
    """
    return f'<img class="yz-hale" src="{kaynak}" alt="" aria-hidden="true" decoding="async">'


def rozet(logo_b64: str | None, durum: str = "Kurumsal hafıza · çevrimiçi") -> str:
    gorsel = f'<img src="data:image/png;base64,{logo_b64}" alt="">' if logo_b64 else ""
    return (
        f'<div class="yz-rozet">{gorsel}<div>'
        f'<div class="ad">YAZVEB Merkez</div>'
        f'<div class="durum"><span class="yz-nabiz"></span>{_html.escape(durum)}</div>'
        f'</div></div>'
    )


def _satir(mesaj: dict, derinlik: int) -> str:
    rol = mesaj["rol"]
    etiket = mesaj.get("etiket") or ("Sen" if rol == "user" else "YAZVEB")
    metin = _html.escape(mesaj["icerik"]).replace("\n", "<br>")
    return (
        f'<div class="yz-satir" data-rol="{rol}" data-derinlik="{derinlik}">'
        f'<div class="yz-etiket">{_html.escape(etiket)}</div>'
        f'<div class="yz-metin">{metin}</div></div>'
    )


def akis(mesajlar: list[dict], gorunen: int = 3, dusunuyor: bool = False) -> str:
    son = mesajlar[-gorunen:] if mesajlar else []
    parcalar = []
    toplam = len(son)
    for sira, mesaj in enumerate(son):
        derinlik = toplam - 1 - sira + (1 if dusunuyor else 0)  # en yeni 0
        parcalar.append(_satir(mesaj, min(derinlik, 2)))
    if dusunuyor:
        parcalar.append(
            '<div class="yz-satir" data-rol="assistant" data-derinlik="0">'
            '<div class="yz-etiket">YAZVEB · çözümleniyor</div>'
            '<div class="yz-tarayici"><i></i></div></div>'
        )
    return f'<div class="yz-akis">{"".join(parcalar)}</div>'


def gorunum_takibi() -> str:
    """
    Klavye açıldığında Android ve iOS sayfayı yeniden boyutlandırmaz; yalnızca
    görünen pencereyi kaydırır. Sabit katmanlar sayfanın tepesine bağlı olduğu
    için görünen alanın dışında kalır — silüetin yukarıda kalmasının sebebi bu.

    Bu betik görünen pencereyi dinler ve iki CSS değişkeni yazar:
      --vv-kaydirma : görünen pencerenin sayfaya göre kaydığı miktar
      --vv-alt      : görünen alanın altı ile sayfa altı arasındaki boşluk
    """
    return """
<script>
(function () {
  var ust = window.parent;
  if (!ust || !ust.visualViewport) return;          // desteklenmiyorsa sessizce çık
  var kok = ust.document.documentElement;
  var gp = ust.visualViewport;
  function yaz() {
    kok.style.setProperty('--vv-kaydirma', Math.max(0, gp.offsetTop) + 'px');
    kok.style.setProperty('--vv-alt',
      Math.max(0, ust.innerHeight - gp.height - gp.offsetTop) + 'px');
  }
  gp.addEventListener('resize', yaz);
  gp.addEventListener('scroll', yaz);
  yaz();
})();
</script>
"""


def ses(b64: str) -> str:
    """
    Yazılı giriş yolunda kullanılan ses etiketi.

    data-yz işareti bilerek konur: sesli konsol çalışıyorsa bu etiketi görür,
    sesi kendi AudioContext zincirine alır ve silüeti gerçek tonlamayla sürer.
    Konsol yoksa etiket kendi başına çalar — eski davranış korunur.
    """
    return (
        f'<audio data-yz="1" autoplay style="display:none">'
        f'<source src="data:audio/mp3;base64,{b64}" type="audio/mp3"></audio>'
    )


def sesli_konsol(**yapilandirma) -> str:
    """
    Mikrofon dinleyicisi, açılış katmanı ve ses sürüşünü üst sayfaya kuran tek
    parça bileşen. Anahtarlar için bkz. konsol.betik().
    """
    return konsol.betik(yapilandirma)


def uyari(satirlar: list[str]) -> str:
    return f'<div class="yz-uyari">{"<br>".join(_html.escape(s) for s in satirlar)}</div>'
