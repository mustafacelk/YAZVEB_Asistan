// ═══════════════════════════════════════════════════════════════════
// HUB — düşük poligonlu modeller (karakter, eşya, oda, dükkân)
// ═══════════════════════════════════════════════════════════════════
// Her şey kodla üretilir: indirilecek model/doku dosyası yok, paket küçük,
// stil tutarlı. Düz gölgeleme (flatShading) yüzleri belirgin kılar:
// "voxel" değil, temiz ve sevimli low-poly.
//
// Ölçek: 1 birim = oda ızgarasında bir hücre. Karakter ~1.05 birim.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from "three";
import { RENK, SAC_RENK, TEN } from "./katalog";
import type { Avatar } from "./veri";

// ── Malzeme ve basit parçalar ───────────────────────────────────────

const malzemeler = new Map<string, THREE.MeshStandardMaterial>();

type MalzemeSecenegi = { isik?: string; yogunluk?: number; saydam?: number; metal?: number; puruz?: number };

export function malzeme(renk: string, s: MalzemeSecenegi = {}) {
  const anahtar = `${renk}|${s.isik ?? ""}|${s.yogunluk ?? 0}|${s.saydam ?? 1}|${s.metal ?? 0}|${s.puruz ?? 0.85}`;
  let m = malzemeler.get(anahtar);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: renk,
      flatShading: true,
      roughness: s.puruz ?? 0.85,
      metalness: s.metal ?? 0,
      emissive: s.isik ? new THREE.Color(s.isik) : new THREE.Color(0x000000),
      emissiveIntensity: s.yogunluk ?? 0,
      transparent: (s.saydam ?? 1) < 1,
      opacity: s.saydam ?? 1,
    });
    malzemeler.set(anahtar, m);
  }
  return m;
}

function parca(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, golge = true) {
  const p = new THREE.Mesh(g, m);
  p.position.set(x, y, z);
  p.castShadow = golge;
  p.receiveShadow = true;
  return p;
}
const kutu = (w: number, h: number, d: number, renk: string, x = 0, y = 0, z = 0, s?: MalzemeSecenegi) =>
  parca(new THREE.BoxGeometry(w, h, d), malzeme(renk, s), x, y, z);
const silindir = (ru: number, ra: number, h: number, renk: string, x = 0, y = 0, z = 0, seg = 10, s?: MalzemeSecenegi) =>
  parca(new THREE.CylinderGeometry(ru, ra, h, seg), malzeme(renk, s), x, y, z);
const kure = (r: number, renk: string, x = 0, y = 0, z = 0, ayrinti = 1, s?: MalzemeSecenegi) =>
  parca(new THREE.IcosahedronGeometry(r, ayrinti), malzeme(renk, s), x, y, z);

// ── Yazı etiketi (her zaman kameraya bakar) ─────────────────────────

export function etiket(metin: string, s: { boyut?: number; renk?: string; arka?: string } = {}) {
  const tuval = document.createElement("canvas");
  const olcek = 2;
  const yazi = `600 ${28 * olcek}px Inter, system-ui, sans-serif`;
  const c = tuval.getContext("2d")!;
  c.font = yazi;
  const gen = Math.ceil(c.measureText(metin).width) + 36 * olcek;
  tuval.width = gen;
  tuval.height = 52 * olcek;
  c.font = yazi;
  c.fillStyle = s.arka ?? "rgba(8, 10, 14, 0.78)";
  const r = 24 * olcek;
  c.beginPath();
  c.roundRect(0, 0, tuval.width, tuval.height, r);
  c.fill();
  c.fillStyle = s.renk ?? "#ecedee";
  c.textBaseline = "middle";
  c.textAlign = "center";
  c.fillText(metin, tuval.width / 2, tuval.height / 2 + 1);
  const doku = new THREE.CanvasTexture(tuval);
  doku.colorSpace = THREE.SRGBColorSpace;
  doku.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: doku, depthTest: false, transparent: true }));
  const boy = s.boyut ?? 0.32;
  sprite.scale.set((boy * tuval.width) / tuval.height, boy, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// ── Karakter ────────────────────────────────────────────────────────

const renk = (id: string | undefined, yedek: string, i = 0) => (id && RENK[id]?.[i]) || yedek;

/**
 * Sevimli, büyük kafalı karakter. Parçalar isimli: sahne nefes almayı
 * ve göz kırpmayı bu isimlerle sürer.
 */
export function karakter(a: Avatar) {
  const g = new THREE.Group();
  g.name = "karakter";
  const ten = TEN[a.ten] ?? TEN[2];
  const sac = SAC_RENK[a.sac_renk] ?? SAC_RENK[0];
  const { ust, alt, ayakkabi, sapka, gozluk, canta } = a.giyili ?? {};
  const ustR = renk(ust, "#eef0f2");
  const ustR2 = renk(ust, ustR, 1);
  const altR = renk(alt, "#3b5d8f");

  // Ayaklar ve bacaklar
  for (const yon of [-1, 1]) {
    g.add(kutu(0.13, 0.08, 0.2, renk(ayakkabi, "#f3f3f3"), yon * 0.08, 0.04, 0.02));
    if (ayakkabi === "spor_neon" || ayakkabi === "spor_beyaz") {
      g.add(kutu(0.135, 0.025, 0.2, renk(ayakkabi, "#ccc", 1), yon * 0.08, 0.012, 0.02));
    }
    g.add(kutu(0.12, alt === "sort_bej" ? 0.14 : 0.28, 0.13, alt === "sort_bej" ? ten : altR, yon * 0.08, alt === "sort_bej" ? 0.15 : 0.22, 0));
    if (alt === "sort_bej") g.add(kutu(0.125, 0.14, 0.135, altR, yon * 0.08, 0.3, 0));
  }

  // Gövde
  const govde = new THREE.Group();
  govde.name = "govde";
  const kalin = ust === "ceket_deri" || ust === "ceket_yazveb" || ust === "hoodie_gece" || ust?.startsWith("sweat");
  govde.add(kutu(kalin ? 0.38 : 0.35, 0.34, kalin ? 0.24 : 0.22, ustR, 0, 0.53, 0));
  if (ust === "ceket_deri" || ust === "ceket_yazveb") {
    govde.add(kutu(0.1, 0.3, 0.02, ust === "ceket_yazveb" ? "#1d2128" : "#e9e3da", 0, 0.54, 0.125));
    govde.add(kutu(0.39, 0.03, 0.245, ustR2, 0, 0.37, 0));
  }
  if (ust === "sweat_yazveb" || ust === "hoodie_gece") govde.add(kutu(0.16, 0.05, 0.01, ustR2, 0, 0.58, 0.123, { isik: ustR2, yogunluk: 0.35 }));
  if (ust === "hoodie_gece") govde.add(kutu(0.3, 0.12, 0.08, ustR, 0, 0.74, -0.12));
  for (const yon of [-1, 1]) {
    const kol = new THREE.Group();
    kol.name = yon < 0 ? "kolSol" : "kolSag";
    kol.position.set(yon * (kalin ? 0.24 : 0.225), 0.68, 0);
    kol.add(kutu(0.09, 0.28, 0.1, ust === "tisort_beyaz" || ust === "tisort_mavi" ? ustR : ustR, 0, -0.13, 0));
    kol.add(kutu(0.08, 0.07, 0.08, ten, 0, -0.3, 0));
    govde.add(kol);
  }
  g.add(govde);

  // Kafa
  const kafa = new THREE.Group();
  kafa.name = "kafa";
  kafa.position.y = 0.9;
  kafa.add(kure(0.21, ten, 0, 0, 0, 1));
  // Gözler (yüz ifadesi)
  const gozler = new THREE.Group();
  gozler.name = "gozler";
  for (const yon of [-1, 1]) {
    const yuz = a.yuz ?? 0;
    const goz = yuz === 1
      ? kutu(0.06, 0.015, 0.02, "#1a1a1a", yon * 0.075, 0.02, 0.19)
      : yuz === 2
        ? kutu(0.05, 0.035, 0.02, "#1a1a1a", yon * 0.075, 0.03, 0.19)
        : kure(0.028, "#1a1a1a", yon * 0.075, 0.02, 0.185, 0);
    goz.castShadow = false;
    gozler.add(goz);
  }
  kafa.add(gozler);
  if ((a.yuz ?? 0) !== 3) {
    const agiz = kutu(a.yuz === 2 ? 0.08 : 0.05, 0.015, 0.02, "#7a3b33", 0, -0.07, 0.19);
    agiz.castShadow = false;
    kafa.add(agiz);
  }
  for (const yon of [-1, 1]) {
    const yanak = kure(0.03, "#f0a9a0", yon * 0.13, -0.04, 0.155, 0, { saydam: 0.55 });
    yanak.castShadow = false;
    kafa.add(yanak);
  }

  // Saç
  const s = a.sac ?? 0;
  // Saç kafanın üst-arkasına oturur; öndeki kenarı gözlerin gerisinde kalır
  // (kafadan büyük bir küre yüzü de içine alıp gözleri örtüyordu).
  if (s !== 4) {
    const tepe = kure(0.218, sac, 0, 0.075, -0.05, 1);
    tepe.scale.set(1.03, 0.7, 0.95);
    kafa.add(tepe);
  }
  if (s === 1) for (const [x, z] of [[-0.12, 0.04], [0.05, 0.08], [0.14, 0.0], [-0.02, -0.16]]) kafa.add(kure(0.07, sac, x, 0.19, z, 0));
  if (s === 2) kafa.add(kutu(0.4, 0.34, 0.12, sac, 0, -0.07, -0.13));
  if (s === 3) kafa.add(kure(0.09, sac, 0, 0.24, -0.08, 0));
  if (s === 4) {
    const golge = kure(0.215, sac, 0, 0.02, -0.01, 1, { saydam: 0.35 });
    golge.scale.set(1, 0.7, 1);
    kafa.add(golge);
  }

  // Şapka
  if (sapka === "bere_siyah") {
    const b = kure(0.235, renk(sapka, "#1b1d22"), 0, 0.08, -0.01, 1);
    b.scale.set(1, 0.62, 1);
    kafa.add(b);
    kafa.add(silindir(0.235, 0.235, 0.05, "#2a2d34", 0, 0.035, -0.01, 12));
  }
  if (sapka === "kep_yazveb") {
    const k = kure(0.23, renk(sapka, "#0e2433"), 0, 0.08, -0.01, 1);
    k.scale.set(1, 0.55, 1);
    kafa.add(k);
    kafa.add(kutu(0.26, 0.025, 0.16, renk(sapka, "#0e2433"), 0, 0.075, 0.2));
    kafa.add(kutu(0.07, 0.04, 0.01, renk(sapka, "#8ccfe2", 1), 0, 0.14, 0.2, { isik: "#8ccfe2", yogunluk: 0.4 }));
  }

  // Gözlük
  if (gozluk === "gozluk_yuvarlak") {
    for (const yon of [-1, 1]) {
      const cerceve = parca(new THREE.TorusGeometry(0.045, 0.01, 6, 14), malzeme("#2b2b2b"), yon * 0.075, 0.02, 0.2);
      kafa.add(cerceve);
    }
    kafa.add(kutu(0.05, 0.01, 0.01, "#2b2b2b", 0, 0.03, 0.2));
  }
  if (gozluk === "gozluk_gunes") kafa.add(kutu(0.3, 0.06, 0.03, "#111111", 0, 0.025, 0.195, { metal: 0.4, puruz: 0.3 }));
  if (gozluk === "gozluk_vr") {
    kafa.add(kutu(0.32, 0.12, 0.1, renk(gozluk, "#e9ecef"), 0, 0.03, 0.2));
    kafa.add(kutu(0.26, 0.07, 0.01, "#1a1d22", 0, 0.03, 0.252, { isik: "#8ccfe2", yogunluk: 0.25 }));
  }
  g.add(kafa);

  // Çanta
  if (canta === "canta_sirt") g.add(kutu(0.28, 0.3, 0.12, renk(canta, "#c2542d"), 0, 0.55, -0.17));
  if (canta === "canta_laptop") {
    g.add(kutu(0.05, 0.22, 0.3, renk(canta, "#2d3440"), 0.25, 0.36, 0));
    g.add(kutu(0.02, 0.4, 0.02, "#1a1a1a", 0.12, 0.62, 0.05));
  }

  g.userData.nefes = true;
  return g;
}

// ── Oda eşyaları ────────────────────────────────────────────────────

/** Duvara asılan eşyalar için çizimli yüzey (poster, tablo, saat). */
function duvarDokusu(ciz: (c: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 320) {
  const tuval = document.createElement("canvas");
  tuval.width = w; tuval.height = h;
  ciz(tuval.getContext("2d")!, w, h);
  const doku = new THREE.CanvasTexture(tuval);
  doku.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: doku, roughness: 0.9 });
}

function agCiz(c: CanvasRenderingContext2D, w: number, h: number, zemin: string, cizgi: string) {
  c.fillStyle = zemin; c.fillRect(0, 0, w, h);
  const d = [[0.2, 0.3], [0.5, 0.18], [0.8, 0.32], [0.3, 0.6], [0.7, 0.62], [0.5, 0.85]];
  c.strokeStyle = cizgi; c.lineWidth = 3; c.globalAlpha = 0.8;
  for (const [a, b] of [[0, 1], [1, 2], [0, 3], [1, 3], [1, 4], [2, 4], [3, 5], [4, 5], [3, 4]]) {
    c.beginPath(); c.moveTo(d[a][0] * w, d[a][1] * h); c.lineTo(d[b][0] * w, d[b][1] * h); c.stroke();
  }
  c.globalAlpha = 1; c.fillStyle = cizgi;
  for (const [x, y] of d) { c.beginPath(); c.arc(x * w, y * h, 9, 0, Math.PI * 2); c.fill(); }
}

export function esyaModeli(id: string): THREE.Group {
  const g = new THREE.Group();
  g.name = id;
  const ahsap = "#b98a5e", koyu = "#2b2f36", beyaz = "#eceef0";
  switch (id) {
    case "masa_basit":
      g.add(kutu(0.9, 0.06, 0.6, ahsap, 0, 0.5, 0));
      for (const [x, z] of [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]]) g.add(kutu(0.05, 0.48, 0.05, "#8a6644", x, 0.24, z));
      break;
    case "sandalye_basit":
      g.add(kutu(0.42, 0.05, 0.42, "#5b7fa6", 0, 0.3, 0));
      g.add(kutu(0.42, 0.42, 0.05, "#5b7fa6", 0, 0.52, -0.19));
      for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) g.add(kutu(0.04, 0.3, 0.04, koyu, x, 0.15, z));
      break;
    case "laptop":
      g.add(kutu(0.5, 0.06, 0.4, ahsap, 0, 0.5, 0));
      for (const [x, z] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) g.add(kutu(0.04, 0.48, 0.04, "#8a6644", x, 0.24, z));
      g.add(kutu(0.34, 0.02, 0.24, "#c8ccd2", 0, 0.54, 0.02, { metal: 0.5, puruz: 0.4 }));
      g.add(kutu(0.34, 0.22, 0.015, "#c8ccd2", 0, 0.65, -0.1, { metal: 0.5, puruz: 0.4 }));
      g.add(kutu(0.3, 0.18, 0.005, "#0e2433", 0, 0.65, -0.092, { isik: "#8ccfe2", yogunluk: 0.6 }));
      break;
    case "bilgisayar":
      g.add(kutu(0.9, 0.06, 0.6, beyaz, 0, 0.5, 0));
      for (const x of [-0.42, 0.42]) g.add(kutu(0.05, 0.5, 0.55, beyaz, x, 0.25, 0));
      g.add(kutu(0.56, 0.34, 0.03, koyu, 0, 0.78, -0.15));
      g.add(kutu(0.52, 0.3, 0.005, "#10213a", 0, 0.78, -0.133, { isik: "#5aa9ff", yogunluk: 0.7 }));
      g.add(kutu(0.05, 0.1, 0.05, koyu, 0, 0.58, -0.15));
      g.add(kutu(0.18, 0.4, 0.4, koyu, 0.33, 0.2, 0.05, { isik: "#8ccfe2", yogunluk: 0.05 }));
      g.add(kutu(0.3, 0.015, 0.1, koyu, -0.05, 0.54, 0.12));
      break;
    case "lamba":
      g.add(silindir(0.14, 0.16, 0.04, koyu, 0, 0.02, 0));
      g.add(silindir(0.02, 0.02, 1.1, koyu, 0, 0.57, 0, 6));
      g.add(silindir(0.12, 0.2, 0.22, "#f3e3c3", 0, 1.18, 0, 10, { isik: "#ffd48a", yogunluk: 0.8 }));
      g.userData.isik = true;
      break;
    case "bitki_kucuk":
      g.add(silindir(0.14, 0.11, 0.2, "#c96f4a", 0, 0.1, 0));
      g.add(kure(0.17, "#4f9a5a", 0, 0.3, 0, 0));
      g.add(kure(0.12, "#5fb06a", 0.07, 0.42, 0.03, 0));
      break;
    case "bitki_buyuk":
      g.add(silindir(0.2, 0.16, 0.34, "#e9e3da", 0, 0.17, 0));
      g.add(silindir(0.03, 0.03, 0.5, "#6b4f35", 0, 0.55, 0, 5));
      for (const [x, y, z, r] of [[0, 0.95, 0, 0.26], [0.16, 0.8, 0.05, 0.18], [-0.15, 0.82, -0.06, 0.18], [0.02, 1.15, 0.04, 0.16]]) g.add(kure(r, "#3f8a4d", x, y, z, 0));
      break;
    case "puf":
      g.add(silindir(0.28, 0.3, 0.34, "#e2b659", 0, 0.17, 0, 12));
      break;
    case "kitaplik": {
      g.add(kutu(0.9, 1.4, 0.35, ahsap, 0, 0.7, 0));
      const renkler = ["#c2542d", "#3d7bd9", "#e2b659", "#4f9a5a", "#8a5ab8", "#eceef0"];
      for (const raf of [0.3, 0.72, 1.12]) {
        g.add(kutu(0.82, 0.03, 0.3, "#8a6644", 0, raf - 0.17, 0.03));
        for (let i = 0; i < 6; i++) g.add(kutu(0.08, 0.26 + (i % 3) * 0.03, 0.22, renkler[(i + raf * 10) % 6 | 0], -0.3 + i * 0.12, raf - 0.03, 0.04));
      }
      break;
    }
    case "koltuk":
      g.add(kutu(0.95, 0.24, 0.6, "#4c6a8a", 0, 0.2, 0));
      g.add(kutu(0.95, 0.42, 0.14, "#4c6a8a", 0, 0.45, -0.24));
      for (const x of [-0.44, 0.44]) g.add(kutu(0.12, 0.34, 0.6, "#415c78", x, 0.3, 0));
      for (const x of [-0.22, 0.22]) g.add(kutu(0.4, 0.08, 0.5, "#5a7a9c", x, 0.35, 0.04));
      break;
    case "konsol":
      g.add(kutu(0.9, 0.35, 0.4, koyu, 0, 0.175, 0));
      g.add(kutu(0.8, 0.46, 0.04, "#111", 0, 0.62, -0.1));
      g.add(kutu(0.74, 0.4, 0.005, "#1b1030", 0, 0.62, -0.078, { isik: "#b06bff", yogunluk: 0.7 }));
      g.add(kutu(0.24, 0.05, 0.16, beyaz, 0.2, 0.375, 0.08));
      g.add(kutu(0.12, 0.03, 0.07, "#eceef0", -0.18, 0.37, 0.14));
      break;
    case "robot_figur":
      g.add(silindir(0.16, 0.18, 0.06, koyu, 0, 0.03, 0));
      g.add(kutu(0.22, 0.24, 0.16, "#c8ccd2", 0, 0.2, 0, { metal: 0.6, puruz: 0.35 }));
      g.add(kutu(0.2, 0.16, 0.16, "#c8ccd2", 0, 0.42, 0, { metal: 0.6, puruz: 0.35 }));
      for (const x of [-0.05, 0.05]) g.add(kutu(0.04, 0.03, 0.01, "#8ccfe2", x, 0.44, 0.085, { isik: "#8ccfe2", yogunluk: 1 }));
      g.add(silindir(0.008, 0.008, 0.1, koyu, 0, 0.55, 0, 4));
      g.add(kure(0.025, "#e2b659", 0, 0.61, 0, 0, { isik: "#e2b659", yogunluk: 0.6 }));
      break;
    case "sunucu_kabini": {
      g.add(kutu(0.62, 1.5, 0.6, "#15181d", 0, 0.75, 0, { metal: 0.3, puruz: 0.5 }));
      for (let i = 0; i < 7; i++) {
        g.add(kutu(0.54, 0.12, 0.01, "#22262d", 0, 0.25 + i * 0.18, 0.301));
        const led = kutu(0.03, 0.03, 0.01, i % 3 ? "#5aff9a" : "#8ccfe2", 0.2, 0.25 + i * 0.18, 0.307, { isik: i % 3 ? "#5aff9a" : "#8ccfe2", yogunluk: 1.2 });
        led.name = "led";
        g.add(led);
      }
      g.userData.led = true;
      break;
    }
    case "akvaryum": {
      g.add(kutu(0.9, 0.4, 0.45, "#2b2f36", 0, 0.2, 0));
      g.add(kutu(0.86, 0.5, 0.42, "#6fc3e6", 0, 0.65, 0, { saydam: 0.35, puruz: 0.1 }));
      g.add(kutu(0.86, 0.05, 0.42, "#e5d3a1", 0, 0.425, 0));
      const baliklar = new THREE.Group();
      baliklar.name = "baliklar";
      for (const [x, y, r] of [[-0.2, 0.62, "#ff8a3d"], [0.15, 0.72, "#ffd23d"], [0.02, 0.55, "#ff5a7a"]] as const) {
        const b = kure(0.04, r, x, y, 0, 0, { isik: r, yogunluk: 0.2 });
        b.scale.set(1.6, 1, 0.7);
        baliklar.add(b);
      }
      g.add(baliklar);
      g.userData.balik = true;
      break;
    }
    case "kupa_yazveb":
      g.add(kutu(0.3, 0.1, 0.3, "#2b2f36", 0, 0.05, 0));
      g.add(silindir(0.04, 0.06, 0.16, "#e2b659", 0, 0.18, 0, 8, { metal: 0.8, puruz: 0.25 }));
      g.add(silindir(0.16, 0.07, 0.24, "#e2b659", 0, 0.38, 0, 10, { metal: 0.8, puruz: 0.25 }));
      for (const x of [-0.18, 0.18]) g.add(parca(new THREE.TorusGeometry(0.06, 0.015, 6, 10), malzeme("#e2b659", { metal: 0.8, puruz: 0.25 }), x, 0.4, 0));
      break;
    case "hali_gri":
    case "hali_yazveb": {
      const h = kutu(0.96, 0.02, 0.96, id === "hali_gri" ? "#8a9099" : "#0e2433", 0, 0.012, 0);
      h.castShadow = false;
      g.add(h);
      if (id === "hali_yazveb") {
        const s = kutu(0.7, 0.022, 0.08, "#8ccfe2", 0, 0.014, 0, { isik: "#8ccfe2", yogunluk: 0.25 });
        s.castShadow = false;
        g.add(s);
      }
      break;
    }
    case "poster_yazveb":
    case "poster_ag":
    case "tablo_turing":
    case "saat": {
      // Duvar eşyaları arka duvara (z = -0.5 hücre kenarı) yaslanır.
      if (id === "saat") {
        const yuz = duvarDokusu((c, w, h) => {
          c.fillStyle = "#f4f1ea"; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 8, 0, Math.PI * 2); c.fill();
          c.strokeStyle = "#2b2f36"; c.lineWidth = 10; c.stroke();
          c.lineWidth = 8; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2, h / 2 - 70); c.stroke();
          c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + 50, h / 2 + 10); c.stroke();
        }, 256, 256);
        const p = parca(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 20), [malzeme("#2b2f36"), yuz, malzeme("#2b2f36")] as unknown as THREE.Material, 0, 1.55, -0.46);
        p.rotation.x = Math.PI / 2;
        g.add(p);
      } else {
        const tur = id;
        const yuz = duvarDokusu((c, w, h) => {
          if (tur === "poster_ag") agCiz(c, w, h, "#0e2433", "#8ccfe2");
          else if (tur === "poster_yazveb") {
            c.fillStyle = "#0b0d11"; c.fillRect(0, 0, w, h);
            agCiz(c, w, h * 0.7, "#0b0d11", "#8ccfe2");
            c.fillStyle = "#ecedee"; c.font = "700 44px Inter, sans-serif"; c.textAlign = "center";
            c.fillText("YAZVEB", w / 2, h * 0.86);
          } else {
            c.fillStyle = "#e9dfc8"; c.fillRect(0, 0, w, h);
            c.fillStyle = "#3b3226"; c.beginPath(); c.ellipse(w / 2, h * 0.42, 62, 76, 0, 0, Math.PI * 2); c.fill();
            c.fillRect(w / 2 - 80, h * 0.62, 160, 110);
            c.font = "600 22px Georgia, serif"; c.textAlign = "center"; c.fillText("A. M. Turing", w / 2, h * 0.94);
          }
        });
        const yukseklik = tur === "tablo_turing" ? 0.75 : 0.8;
        const cerceve = kutu(0.62, yukseklik + 0.06, 0.03, tur === "tablo_turing" ? "#8a6644" : "#1a1d22", 0, 1.45, -0.475);
        g.add(cerceve);
        const yuzey = parca(new THREE.PlaneGeometry(0.56, yukseklik), yuz, 0, 1.45, -0.458, false);
        g.add(yuzey);
      }
      break;
    }
    default:
      g.add(kutu(0.6, 0.6, 0.6, "#6b7280", 0, 0.3, 0));
  }
  return g;
}

// ── Oda kabuğu ──────────────────────────────────────────────────────

/** 6×6 zemin, arka ve sol duvar; önü ve sağı açık (izometrik bakış). */
export function odaKabugu(boy: number, s: { zemin?: string; duvar?: string; parke?: boolean } = {}) {
  const g = new THREE.Group();
  g.name = "kabuk";
  const zemin = kutu(boy, 0.14, boy, s.zemin ?? "#d9b98f", 0, -0.07, 0);
  zemin.name = "zemin";
  zemin.castShadow = false;
  g.add(zemin);
  // Parke çizgileri (minyatürde çizilmez: tırtıklanır)
  if (s.parke !== false) for (let i = 1; i < boy; i++) {
    const c = kutu(0.012, 0.002, boy, "#c7a67c", -boy / 2 + i, 0.001, 0);
    c.castShadow = false;
    g.add(c);
  }
  const duvarR = s.duvar ?? "#e8edf2";
  const arka = kutu(boy + 0.14, 2.4, 0.14, duvarR, -0.07, 1.2, -boy / 2 - 0.07);
  const sol = kutu(0.14, 2.4, boy, duvarR, -boy / 2 - 0.07, 1.2, 0);
  arka.castShadow = false; sol.castShadow = false;
  g.add(arka, sol);
  // Süpürgelik ve pencere
  g.add(kutu(boy, 0.1, 0.02, "#c9d1d9", 0, 0.05, -boy / 2 + 0.01));
  g.add(kutu(0.02, 0.1, boy, "#c9d1d9", -boy / 2 + 0.01, 0.05, 0));
  const pencere = kutu(0.02, 0.9, 1.4, "#bfe6ff", -boy / 2 + 0.005, 1.45, 1, { isik: "#bfe6ff", yogunluk: 0.45 });
  pencere.castShadow = false;
  g.add(pencere);
  return g;
}

// ── Çarşı dükkânı ───────────────────────────────────────────────────

const TENTE = [["#8ccfe2", "#eceef0"], ["#e2b659", "#fff6e0"], ["#e07a5f", "#fbe9e3"], ["#7fe0a8", "#eafbf1"], ["#b89cff", "#f1ecff"]];

/**
 * Sponsorun dükkânı. Açıksa vitrini ışıklı ve kapısı aralık; kilitliyse
 * soluk ve kapıda kilit var (kaç XP gerektiğini terasın etiketi söyler).
 */
export function dukkan(ad: string, acik: boolean, sira: number) {
  const g = new THREE.Group();
  const [t1, t2] = TENTE[sira % TENTE.length];
  const soluk = (r: string) => (acik ? r : "#4a4f58");
  g.add(kutu(1.5, 1.2, 1.1, soluk("#f3efe7"), 0, 0.6, 0));
  g.add(kutu(1.6, 0.12, 1.2, soluk("#2b2f36"), 0, 1.26, 0));
  // Tente: çizgili
  for (let i = 0; i < 6; i++) {
    const t = kutu(0.26, 0.05, 0.42, soluk(i % 2 ? t2 : t1), -0.65 + i * 0.26, 1.08, 0.72);
    t.rotation.x = 0.38;
    g.add(t);
  }
  // Vitrin
  g.add(kutu(0.6, 0.5, 0.02, acik ? "#fff1c9" : "#2a2e35", -0.35, 0.65, 0.56,
    acik ? { isik: "#ffd48a", yogunluk: 0.7 } : {}));
  // Kapı: menteşesi solda; "kapıyı çal" animasyonu bu grubu döndürür.
  const kapi = new THREE.Group();
  kapi.name = "kapi";
  kapi.position.set(0.18, 0, 0.56);
  kapi.add(kutu(0.42, 0.82, 0.04, soluk("#7a5236"), 0.21, 0.41, 0));
  kapi.add(kure(0.025, "#e2b659", 0.36, 0.42, 0.03, 0, { metal: 0.8, puruz: 0.3 }));
  if (acik) kapi.rotation.y = -0.35;
  g.add(kapi);
  if (!acik) {
    // Kilit
    g.add(kutu(0.14, 0.12, 0.05, "#e2b659", 0.39, 0.45, 0.62, { metal: 0.7, puruz: 0.3 }));
    g.add(parca(new THREE.TorusGeometry(0.045, 0.014, 6, 12, Math.PI), malzeme("#e2b659", { metal: 0.7, puruz: 0.3 }), 0.39, 0.51, 0.62));
  }
  const tabela = etiket(ad, { boyut: 0.24, arka: acik ? "rgba(14, 36, 51, 0.92)" : "rgba(30, 32, 38, 0.9)", renk: acik ? "#ecedee" : "#9aa0a8" });
  tabela.position.set(0, 1.58, 0.3);
  g.add(tabela);
  return g;
}
