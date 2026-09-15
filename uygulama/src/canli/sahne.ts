// ═══════════════════════════════════════════════════════════════════
// Canlı küre — YAZVEB'in görsel imzası
// ═══════════════════════════════════════════════════════════════════
// Bir küre yüzeyine dağılmış ince parçacıklar. Bir animasyon değil, bir
// DURUM: ne yaptığını hareketiyle söyler.
//
//   bosta      çok yavaş nefes alır, neredeyse duruyor
//   dinliyor   yüzey kullanıcının sesiyle kıpırdar, sinyal rengi belirir
//   dusunuyor  parçacıklar merkeze doğru toplanır, iç titreşim hızlanır
//   konusuyor  yanıt sesinin genliği yüzeyde dalga olarak yürür
//   hata       kısa bir içe çekilme, renk söner — sonra toparlanır
//
// NEDEN THREE.JS DEĞİL
// ────────────────────
// Tek bir nokta bulutu için 600 KB kütüphane gerekmiyor. Ham WebGL ile
// bütün sahne tek çizim çağrısı; telefonda bile kare başına < 1 ms.
//
// AKICILIK
// ────────
// Hiçbir değer hedefine ZIPLAMAZ. Her parametre üstel sönümle hedefe
// yaklaşır; durum değişince hareket kesilmez, akarak dönüşür.
// React bu döngüye hiç girmez.
// ═══════════════════════════════════════════════════════════════════

export type Durum = "bosta" | "dinliyor" | "dusunuyor" | "konusuyor" | "hata";

type Parametre = {
  gurultu: number;   // yüzey kıpırtısı
  hiz: number;       // kıpırtı hızı
  yogun: number;     // merkeze toplanma (0..1)
  vurgu: number;     // sinyal rengi karışımı (0..1)
  parlak: number;    // genel parlaklık
  donus: number;     // dönüş hızı (rad/sn)
  tepki: number;     // sese tepki katsayısı
  yaricap: number;
};

const HEDEF: Record<Durum, Parametre> = {
  bosta:     { gurultu: 0.030, hiz: 0.45, yogun: 0.00, vurgu: 0.00, parlak: 0.74, donus: 0.045, tepki: 0.00, yaricap: 1.00 },
  dinliyor:  { gurultu: 0.045, hiz: 0.80, yogun: 0.00, vurgu: 0.60, parlak: 0.80, donus: 0.070, tepki: 0.30, yaricap: 1.02 },
  dusunuyor: { gurultu: 0.022, hiz: 2.10, yogun: 0.55, vurgu: 0.40, parlak: 0.78, donus: 0.160, tepki: 0.00, yaricap: 0.90 },
  konusuyor: { gurultu: 0.040, hiz: 1.00, yogun: 0.05, vurgu: 0.75, parlak: 0.88, donus: 0.080, tepki: 0.24, yaricap: 1.00 },
  hata:      { gurultu: 0.012, hiz: 0.30, yogun: 0.20, vurgu: 0.00, parlak: 0.40, donus: 0.020, tepki: 0.00, yaricap: 0.88 },
};

// Gölgelendirici kaynakları YALNIZCA ASCII içerir: GLSL ES 1.0 yorum
// satırlarında bile Türkçe karakter görünce derlemeyi reddediyor (hata
// günlüğü de boş dönüyor). Açıklamalar bu yüzden burada:
//
//   KOSE   Yüzey, farklı eksenlerde kayan üç sinüsün çarpımı — gerçek
//          gürültü kadar pahalı değil, göze aynı derecede canlı. Konuşma
//          dalgası enlem boyunca yukarı yürür. Düşünürken parçacıkların
//          yalnızca bir kısmı içeri çekilir; hepsi çekilse küre sadece
//          küçülmüş görünürdü. Sabit hafif eğim küreyi "yüzüstü" göstermez.
//          vDerinlik: 0 arka, 1 ön.
//   PARCA  Yumuşak disk. Gümüşten sinyale geçişi yalnızca parçacıkların bir
//          bölümü alır — vurgu boya kovası değil, yüzeyde dolaşan bir ışık.
const KOSE = `
attribute vec3 aKonum;
attribute float aRast;
uniform float uZaman;
uniform float uGurultu;
uniform float uYogun;
uniform float uEnerji;
uniform float uDalga;
uniform float uYaricap;
uniform float uDonus;
uniform float uOlcek;
uniform float uNokta;
uniform float uEn;
varying float vDerinlik;
varying float vRast;

void main() {
  vec3 p = aKonum;

  float t = uZaman;
  float n = sin(p.x * 3.1 + t * 0.9 + aRast * 6.283)
          * sin(p.y * 2.7 - t * 0.7)
          * sin(p.z * 3.3 + t * 0.5);
  float ince = sin(p.x * 7.0 - t * 1.3) * sin(p.y * 6.0 + t * 1.1) * 0.5;

  float dalga = sin(p.y * 5.0 - t * 3.2) * uDalga;

  float r = uYaricap * (1.0 + (n + ince) * uGurultu + dalga + uEnerji * n * 0.9);

  r *= mix(1.0, 0.45 + 0.55 * aRast, uYogun);

  p *= r;

  float c = cos(uDonus);
  float s = sin(uDonus);
  p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  p = vec3(p.x, 0.955 * p.y - 0.296 * p.z, 0.296 * p.y + 0.955 * p.z);

  vDerinlik = p.z * 0.5 + 0.5;
  vRast = aRast;

  float perspektif = 1.0 / (2.6 - p.z * 0.55);
  gl_Position = vec4(p.x * perspektif * uOlcek / uEn, p.y * perspektif * uOlcek, 0.0, 1.0);
  gl_PointSize = uNokta * (0.55 + vDerinlik * 0.75);
}
`;

const PARCA = `
precision mediump float;
uniform float uVurgu;
uniform float uParlak;
varying float vDerinlik;
varying float vRast;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float yumusak = smoothstep(0.5, 0.05, d);

  vec3 gumus  = vec3(0.86, 0.88, 0.90);
  vec3 sinyal = vec3(0.55, 0.81, 0.89);
  float pay = uVurgu * smoothstep(0.35, 1.0, vRast);
  vec3 renk = mix(gumus, sinyal, pay);

  float a = yumusak * uParlak * (0.18 + vDerinlik * 0.82);
  gl_FragColor = vec4(renk * a, a);
}
`;

function derle(gl: WebGLRenderingContext, tur: number, kaynak: string) {
  const g = gl.createShader(tur)!;
  gl.shaderSource(g, kaynak);
  gl.compileShader(g);
  if (!gl.getShaderParameter(g, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(g) ?? "gölgelendirici derlenemedi");
  }
  return g;
}

/** Deterministik "rastgele": her açılışta aynı desen, Math.random yok. */
const tohum = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Fibonacci küresi + sapma.
 *
 * Saf Fibonacci dizilimi eşit aralıklı ama fazla düzenli: tel kafes bir
 * dünya küresi gibi mekanik görünüyor. Her nokta komşu aralığının yarısı
 * kadar kaydırılır ve ince bir kabuk kalınlığı alır — düzen hissedilir,
 * ızgara görünmez.
 */
function kureNoktalari(adet: number) {
  const konum = new Float32Array(adet * 3);
  const rast = new Float32Array(adet);
  const altin = Math.PI * (3 - Math.sqrt(5));
  const adim = 2 / adet;
  for (let i = 0; i < adet; i++) {
    const y = Math.max(-1, Math.min(1, 1 - (i + 0.5) * adim + (tohum(i * 3 + 1) - 0.5) * adim * 1.2));
    const r = Math.sqrt(1 - y * y);
    const a = altin * i + (tohum(i * 3 + 2) - 0.5) * 0.9;
    const kabuk = 1 + (tohum(i * 3 + 3) - 0.5) * 0.06;
    konum[i * 3] = Math.cos(a) * r * kabuk;
    konum[i * 3 + 1] = y * kabuk;
    konum[i * 3 + 2] = Math.sin(a) * r * kabuk;
    rast[i] = tohum(i);
  }
  return { konum, rast };
}

export type KureDenetim = {
  durum: (d: Durum) => void;
  /**
   * Küre CSS ile küçültüldüğünde noktalar yarım piksele inip siliniyor.
   * `olcek` görünen boyut oranıdır (1 = tam); nokta boyutu ve parlaklık
   * bununla ters orantılı, yumuşakça telafi edilir.
   */
  olcek: (o: number) => void;
  birak: () => void;
};

export function kureKur(
  tuval: HTMLCanvasElement,
  seviye: () => number,
): KureDenetim | null {
  const gl = tuval.getContext("webgl", {
    alpha: true,
    antialias: false,        // noktalar zaten yumuşak; MSAA boşa maliyet
    premultipliedAlpha: true,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const dokunmatik = matchMedia("(pointer: coarse)").matches;
  const azHareket = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ADET = dokunmatik ? 1500 : 2400;

  const program = gl.createProgram()!;
  try {
    gl.attachShader(program, derle(gl, gl.VERTEX_SHADER, KOSE));
    gl.attachShader(program, derle(gl, gl.FRAGMENT_SHADER, PARCA));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "bağlanamadı");
    }
  } catch (h) {
    console.warn("[küre]", h);
    return null;
  }
  gl.useProgram(program);

  const { konum, rast } = kureNoktalari(ADET);
  const tampon = (veri: Float32Array, ad: string, boyut: number) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, veri, gl.STATIC_DRAW);
    const yer = gl.getAttribLocation(program, ad);
    gl.enableVertexAttribArray(yer);
    gl.vertexAttribPointer(yer, boyut, gl.FLOAT, false, 0, 0);
    return b;
  };
  const tamponlar = [tampon(konum, "aKonum", 3), tampon(rast, "aRast", 1)];

  const u = (ad: string) => gl.getUniformLocation(program, ad);
  const U = {
    zaman: u("uZaman"), gurultu: u("uGurultu"), yogun: u("uYogun"), enerji: u("uEnerji"),
    dalga: u("uDalga"), yaricap: u("uYaricap"), donus: u("uDonus"), olcek: u("uOlcek"),
    nokta: u("uNokta"), en: u("uEn"), vurgu: u("uVurgu"), parlak: u("uParlak"),
  };

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);   // toplamalı: üst üste binen noktalar ışır
  gl.clearColor(0, 0, 0, 0);

  // ── Boyut ──────────────────────────────────────────────────────
  const dpr = Math.min(window.devicePixelRatio || 1, dokunmatik ? 1.75 : 2);
  const boyutla = () => {
    const w = Math.max(1, Math.round(tuval.clientWidth * dpr));
    const h = Math.max(1, Math.round(tuval.clientHeight * dpr));
    if (tuval.width !== w || tuval.height !== h) {
      tuval.width = w;
      tuval.height = h;
      gl.viewport(0, 0, w, h);
    }
    gl.uniform1f(U.en, w / h);
  };
  const gozcu = new ResizeObserver(boyutla);
  gozcu.observe(tuval);
  boyutla();

  // ── Durum ──────────────────────────────────────────────────────
  let hedef = HEDEF.bosta;
  let hedefOlcek = 1;
  let olcek = 1;
  const simdi: Parametre = { ...HEDEF.bosta, parlak: 0 };   // karanlıktan doğar
  const anahtarlar = Object.keys(simdi) as (keyof Parametre)[];
  let enerji = 0;
  let aci = 0;
  let zaman = 0;
  let onceki = performance.now();
  let kare = 0;
  let calisiyor = true;

  const yaklas = (a: number, b: number, k: number, dt: number) =>
    a + (b - a) * (1 - Math.exp(-k * dt));

  const ciz = (an: number) => {
    if (!calisiyor) return;
    kare = requestAnimationFrame(ciz);

    // Sekme arkadayken rAF durur; dönüşte dev bir dt sıçraması olmasın.
    const dt = Math.min(0.05, Math.max(0, (an - onceki) / 1000));
    onceki = an;

    const yavas = azHareket ? 0.3 : 1;
    for (const k of anahtarlar) {
      // Parlaklık yavaş gelir (açılış), geri kalanı orta hızda dönüşür.
      simdi[k] = yaklas(simdi[k], hedef[k], k === "parlak" ? 2.2 : 3.2, dt);
    }

    // Küçük kipte noktalar büyür (tam telafi değil — biraz silikleşmesi
    // kürenin geri planda olduğunu da söylüyor).
    olcek = yaklas(olcek, hedefOlcek, 2.4, dt);
    const telafi = Math.pow(1 / olcek, 0.6);

    // Enerji: hızlı yükselir, yavaş söner — ses gibi.
    const olcum = seviye();
    enerji = yaklas(enerji, olcum, olcum > enerji ? 18 : 4.5, dt);

    zaman += dt * simdi.hiz * yavas;
    aci += dt * simdi.donus * yavas;

    // Boşta nefes: ~9 sn'lik döngü, yarıçapta %1.5.
    const nefes = 1 + Math.sin((an / 1000) * 0.7) * 0.015 * yavas;

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(U.zaman, zaman);
    gl.uniform1f(U.gurultu, simdi.gurultu * yavas);
    gl.uniform1f(U.yogun, simdi.yogun);
    gl.uniform1f(U.enerji, enerji * simdi.tepki * yavas);
    gl.uniform1f(U.dalga, enerji * simdi.tepki * 0.35 * yavas);
    gl.uniform1f(U.yaricap, simdi.yaricap * nefes);
    gl.uniform1f(U.donus, aci);
    gl.uniform1f(U.olcek, 1.7);   // sese tepkide en dış parçacık da tuvalde kalsın
    gl.uniform1f(U.vurgu, simdi.vurgu);
    gl.uniform1f(U.parlak, Math.min(1, simdi.parlak * (1 + (telafi - 1) * 0.25)));
    gl.uniform1f(U.nokta, 2.1 * dpr * telafi);
    gl.drawArrays(gl.POINTS, 0, ADET);
  };
  kare = requestAnimationFrame(ciz);

  const gorunurluk = () => {
    cancelAnimationFrame(kare);
    if (!document.hidden && calisiyor) {
      onceki = performance.now();
      kare = requestAnimationFrame(ciz);
    }
  };
  document.addEventListener("visibilitychange", gorunurluk);

  return {
    durum: (d) => { hedef = HEDEF[d]; },
    olcek: (o) => { hedefOlcek = Math.max(0.15, Math.min(1, o)); },
    birak: () => {
      calisiyor = false;
      cancelAnimationFrame(kare);
      gozcu.disconnect();
      document.removeEventListener("visibilitychange", gorunurluk);
      tamponlar.forEach((b) => gl.deleteBuffer(b));
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
