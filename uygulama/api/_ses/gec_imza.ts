// ═══════════════════════════════════════════════════════════════════
// Sec-MS-GEC v2 imzası — Microsoft Edge okuma servisi
// ═══════════════════════════════════════════════════════════════════
// 2026-10: servis eski imzayı (düz SHA-256, sürüm "1-…") 403 ile
// reddetmeye başladı; asistan sessiz kaldı. Yeni biçim "<CS64 16 hex>-
// <SHA-256 64 hex>" ve sürüm etiketi "2-<Chromium sürümü>".
//
// Kaynak: açık kaynak edge-tts (rany2/edge-tts, src/edge_tts/drm.py,
// generate_sec_ms_gec_v2). Buradaki kod onun satır satır taşınmışıdır.
// Python tamsayıları sınırsız olduğu için ara değerler 32 biti aşıp ancak
// sonda maskeleniyor; bu davranış BigInt ile birebir korunur. Doğruluk,
// aynı zaman damgalarında Python çıktısıyla karşılaştırılarak sınandı
// (testler/ses.test.mts).
// ═══════════════════════════════════════════════════════════════════

export const GUVENILIR_JETON = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WIN_EPOCH = 11644473600n;

const M = 0xffffffffn;
const R32 = 0x100000001n;

const SHA_BASLANGIC = [
  0x6a09e667n, 0xbb67ae85n, 0x3c6ef372n, 0xa54ff53an, 0x510e527fn, 0x9b05688cn, 0x1f83d9abn, 0x5be0cd19n,
];
const SHA_DURUM = [
  0xfd9fbea2n, 0x91243ce7n, 0xbe499094n, 0xcd2e1e0an, 0x6c006f49n, 0x04bd35abn, 0xfeb0a7e4n, 0x03effbd2n,
];
const SHA_PLAN = [
  0xeb24bf9en, 0x1558691fn, 0xa0c09ee2n, 0x0cfa32ban, 0xa622ee8cn, 0xd1dd9491n, 0xc0dd25a0n,
  0xf9e70ab6n, 0xf0c31573n, 0x7058ce4en, 0x7188e606n, 0x00e5ab33n, 0xd258b060n, 0x72766564n,
];
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
].map(BigInt);
const SHA_AYAR = 0xc9dc06a7n;
const K_BLOK = [...K.slice(0, 14), SHA_AYAR, ...K.slice(15)];
const SIGMA0_AYAR = 0x059c0b80n;
const SIGMA1_AYAR = 0x000b92c0n;

const CS64_KATSAYI: [bigint, bigint][] = [
  [0xe82e91b1n, 0xb32700d0n], [0x44de24c6n, 0x88dff51dn], [0x3beb65bcn, 0x29514038n],
  [0xc89c5933n, 0xb328cbdfn], [0x8d1ec211n, 0xd405b4d5n], [0x314ef5d5n, 0x26e55f3cn],
  [0xe92491b1n, 0x607801c6n], [0xf0a5b9d5n, 0x82b2c1fbn], [0x06064cf3n, 0xfa51a3dan],
  [0xda79fa60n, 0x207cc464n], [0xbed20560n, 0x3c3c74f3n], [0x89f9c9f8n, 0xd2d14b61n],
  [0x35fa38c6n, 0xbb04a2c1n], [0xcb49e3c6n, 0xc5626167n],
];
const CS64_CARPAN = 0x82893933n;
const CS64_AYAR0 = 0xf2f90b1an;
const CS64_AYAR1 = 0x0b1a0000n;

const rol16 = (v: bigint) => { v &= M; return ((v << 16n) | (v >> 16n)) & M; };
const sigma0 = (v: bigint) => ((v >> 7n) ^ (v << 25n) ^ (v >> 18n) ^ (v << 14n) ^ (v >> 3n)) & M;
const sigma1 = (v: bigint) => ((v >> 17n) ^ (v << 15n) ^ (v >> 19n) ^ (v << 13n) ^ (v >> 10n)) & M;
const Sigma = (x: bigint, a: bigint, b: bigint, c: bigint) => {
  const r = x * R32;
  return (r >> a) ^ (r >> b) ^ (r >> c);
};

/** SHA-256 turları (genel biçim; Python'daki sekizli açılımla aynı sonucu verir). */
function turlar(durum: bigint[], w: bigint[], ilkTur = 0): bigint[] {
  let [a, b, c, d, e, f, g, h] = durum;
  const sabit = ilkTur === 14 ? K_BLOK : K;
  for (let i = ilkTur; i < 64; i++) {
    const t1 = h + Sigma(e, 6n, 11n, 25n) + (g ^ (e & (f ^ g))) + sabit[i] + w[i];
    const t2 = Sigma(a, 2n, 13n, 22n) + ((a & b) | (c & (a | b)));
    h = g; g = f; f = e; e = (d + t1) & M;
    d = c; c = b; b = a; a = (t1 + t2) & M;
  }
  return [a, b, c, d, e, f, g, h];
}

function planGenislet(w: bigint[], ilk = 16) {
  for (let i = ilk; i < 64; i++) {
    const x = w[i - 2], y = w[i - 15];
    const s1 = (x >> 17n) ^ (x << 15n) ^ (x >> 19n) ^ (x << 13n) ^ (x >> 10n);
    const s0 = (y >> 7n) ^ (y << 25n) ^ (y >> 18n) ^ (y << 14n) ^ (y >> 3n);
    w.push((s1 + w[i - 7] + s0 + w[i - 16]) & M);
  }
}

const beBig = (b: Uint8Array) => b.reduce((t, x) => (t << 8n) | BigInt(x), 0n);

function shaBaslat(veri: Uint8Array): bigint[] {
  const w: bigint[] = [...Array(14).fill(0n), beBig(veri.slice(0, 3)), beBig(veri.slice(3, 7))];
  for (let i = 16; i < 30; i++) {
    let v = SHA_PLAN[i - 16];
    if (i - 2 >= 14) v += i === 16 ? (sigma1(w[i - 2]) ^ SIGMA1_AYAR) : sigma1(w[i - 2]);
    if (i - 7 >= 14) v += w[i - 7];
    if (i - 15 >= 14) v += i === 29 ? (sigma0(w[i - 15]) ^ SIGMA0_AYAR) : sigma0(w[i - 15]);
    w.push(v & M);
  }
  w.push((sigma1(w[28]) + w[23] + sigma0(w[15]) + w[14] + SHA_AYAR - K[14]) & M);
  planGenislet(w, 31);
  const calisan = turlar(SHA_DURUM, w, 14);
  return SHA_BASLANGIC.map((x, i) => (x + calisan[i]) & M);
}

function shaOzeti(veri: Uint8Array): Uint8Array {
  const uzunluk = 57 + veri.length;
  const dolgu = (((55 - uzunluk) % 64) + 64) % 64;
  const kalan = veri.slice(7);
  const p = new Uint8Array(kalan.length + 1 + dolgu + 8);
  p.set(kalan, 0);
  p[kalan.length] = 0x80;
  new DataView(p.buffer).setBigUint64(p.length - 8, BigInt(uzunluk * 8));
  let durum = shaBaslat(veri);
  const dv = new DataView(p.buffer);
  for (let o = 0; o < p.length; o += 64) {
    const w: bigint[] = [];
    for (let j = 0; j < 16; j++) w.push(BigInt(dv.getUint32(o + j * 4)));
    planGenislet(w);
    const c = turlar(durum, w);
    durum = durum.map((x, i) => (x + c[i]) & M);
  }
  const cikti = new Uint8Array(32);
  const co = new DataView(cikti.buffer);
  durum.forEach((x, i) => co.setUint32(i * 4, Number(x)));
  return cikti;
}

function kelimelerLe(veri: Uint8Array): bigint[] {
  const n = veri.length + ((4 - (veri.length % 4)) % 4);
  const p = new Uint8Array(n);
  p.set(veri);
  const dv = new DataView(p.buffer);
  const k: bigint[] = [];
  for (let i = 0; i < n; i += 4) k.push(BigInt(dv.getUint32(i, true)));
  if (k.length % 2) k.push(0n);
  return k;
}

function cs64(veri: Uint8Array, ozet: Uint8Array): [bigint, bigint] {
  const dv = new DataView(ozet.buffer, ozet.byteOffset);
  const keyA = BigInt(dv.getUint32(0, true)) | 1n;
  const keyB = BigInt(dv.getUint32(4, true)) | 1n;
  const carpanlar = [(keyA * CS64_CARPAN) & M, (keyB * CS64_CARPAN) & M];
  const terimler = CS64_KATSAYI.map(([k], i) => (k * carpanlar[i % 2]) & M);
  const ofsetler = CS64_KATSAYI.map(([, o]) => o);
  const onEkli = new Uint8Array(veri.length + 1);
  onEkli.set(veri, 1);
  kelimelerLe(onEkli).forEach((w, i) => {
    let terim = w * (i % 2 === 0 ? keyA : keyB);
    let ofset = rol16(w) * (i % 2 === 0 ? 0xef0569fbn : 0xc31713dbn);
    if (i === 0) { terim += CS64_AYAR0 * carpanlar[0]; ofset += CS64_AYAR1; }
    terimler.push(terim & M);
    ofsetler.push(ofset & M);
  });
  let swapAcc = 0n, swapSon = 0n, durum = 0n, acc = 0n;
  for (let i = 0; i < terimler.length; i += 2) {
    const x = terimler[i], y = terimler[i + 1];
    let t = rol16((ofsetler[i] + x) & M);
    let q = (t * 0x76f50f34n) & M;
    swapAcc += (rol16(q) * 0xc3efea97n + q) & M;
    t = rol16((ofsetler[i + 1] + y) & M);
    q = (t * 0x1881ce3cn) & M;
    swapSon = (rol16(q) * 0x35bd1ec9n + q) & M;
    swapAcc = (swapAcc + swapSon) & M;
    durum = (durum * keyA + x) & M;
    durum = (rol16(durum) * 0xcf98b111n) & M;
    durum = (rol16(durum) * 0x87085b9fn) & M;
    durum = (rol16(durum) * 0x12ceb96dn) & M;
    durum = (rol16(durum) * 0x257e1d83n) & M;
    acc += durum;
    t = (durum * keyB + y) & M;
    t = (rol16(t) * 0xa27416f5n) & M;
    t = (rol16(t) * 0xd38396ffn) & M;
    durum = (rol16((rol16(t) * 0x7c932b89n) & M) * 0xbfa49f69n) & M;
    acc = (acc + durum) & M;
  }
  return [swapSon ^ durum, swapAcc ^ acc];
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();

let onbellek: { girdi: string; imza: string } | null = null;

/**
 * v2 imzası. `unixSaniye` verilmezse şimdiki zaman; 5 dakikalık dilime
 * yuvarlandığı için aynı dilimde tekrar hesaplanmaz.
 */
export function gecImzasi(unixSaniye = Date.now() / 1000): string {
  let tik = BigInt(Math.floor(unixSaniye)) + WIN_EPOCH;
  tik -= tik % 300n;
  tik *= 10_000_000n;                                  // 100 nanosaniyelik aralıklar
  const girdi = `${tik}${GUVENILIR_JETON}`;
  if (onbellek?.girdi === girdi) return onbellek.imza;
  const veri = new TextEncoder().encode(girdi);
  const ozet = shaOzeti(veri);
  const [c0, c1] = cs64(veri, ozet);
  const c = new Uint8Array(8);
  const dv = new DataView(c.buffer);
  dv.setUint32(0, Number(c0), true);
  dv.setUint32(4, Number(c1), true);
  const imza = `${hex(c)}-${hex(ozet)}`;
  onbellek = { girdi, imza };
  return imza;
}
