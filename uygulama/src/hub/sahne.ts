// ═══════════════════════════════════════════════════════════════════
// YAZVEB HUB — 3B sahne motoru
// ═══════════════════════════════════════════════════════════════════
// Üç görünüm, tek tuval:
//   bina   YAZVEB binası: her kat üç oda, dioramalar; tepede topluluk
//          büyüdükçe açılan bölümler
//   oda    bir üyenin odası: karakter + eşyalar; düzenleme kipinde ızgara
//   carsi  sponsor çarşısı: her sponsor bir dükkân, puan eşiğine göre
//          katman katman yükselir (yüksek kilit = yüksek teras)
//
// Kamera: dik (ortografik) izometrik, 3/4 açı, hafif yukarıdan. Parmakla
// yatay sürükleme döndürür, dikey sürükleme binada katlar arasında gezer,
// iki parmak/tekerlek yakınlaştırır. Dokunma = seçim.
//
// Pil: hareket yoksa kare çizilmez (yalnızca süs animasyonları için düşük
// hızda), sekme arka plandayken döngü tamamen durur.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from "three";
import { dukkan, esyaModeli, etiket, karakter, odaKabugu } from "./modeller";
import { ODA_BOYU } from "./katalog";
import type { Avatar, Bina, OdaEsyasi, Oyuncu } from "./veri";

export type Secim =
  | { tur: "oda"; id: string }
  | { tur: "dukkan"; id: string }
  | { tur: "bolum"; id: string }
  | { tur: "hucre"; x: number; z: number }
  | { tur: "esya"; indeks: number };

export type CarsiDukkani = { id: string; ad: string; acik: boolean; gerekliXp: number };

type Kip = "bina" | "oda" | "carsi";

const AZALT = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const CARSI_ACI = 0.3;

export class HubSahnesi {
  private kap: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private sahne = new THREE.Scene();
  private kamera: THREE.OrthographicCamera;
  private icerik = new THREE.Group();
  private isikYon: THREE.DirectionalLight;
  private raycaster = new THREE.Raycaster();
  private saat = new THREE.Timer();
  private kip: Kip = "bina";
  private hedef = new THREE.Vector3();
  private aci = Math.PI / 4;
  private hedefAci = Math.PI / 4;
  private yakinlik = 1;
  private hedefYakinlik = 1;
  private kadraj = 8;
  private panY = 0;
  private hedefPanY = 0;
  private panSinir: [number, number] = [0, 0];
  private gozleyici: ResizeObserver;
  private cerceve = 0;
  private odaEsyalari: THREE.Group[] = [];
  private seciliIndeks: number | null = null;
  private izgara: THREE.Object3D | null = null;
  private hayalet: THREE.Group | null = null;
  private onSec: (s: Secim) => void;
  private dokunma = new Map<number, { x: number; y: number }>();
  private surukleme: { x: number; y: number; aci: number; pan: number; mesafe: number; yakin: number; hareket: number } | null = null;
  private calisiyor = true;

  constructor(kap: HTMLElement, onSec: (s: Secim) => void) {
    this.kap = kap;
    this.onSec = onSec;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.style.touchAction = "none";
    kap.appendChild(this.renderer.domElement);

    this.kamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.sahne.add(this.icerik);

    this.sahne.add(new THREE.HemisphereLight(0xdfefff, 0x3a3228, 1.25));
    this.isikYon = new THREE.DirectionalLight(0xfff3e0, 2.2);
    this.isikYon.castShadow = true;
    this.isikYon.shadow.mapSize.set(1024, 1024);
    this.isikYon.shadow.bias = -0.0008;
    this.isikYon.shadow.normalBias = 0.02;
    this.sahne.add(this.isikYon, this.isikYon.target);

    this.boyutla();
    this.gozleyici = new ResizeObserver(() => this.boyutla());
    this.gozleyici.observe(kap);

    const c = this.renderer.domElement;
    c.addEventListener("pointerdown", this.bas);
    c.addEventListener("pointermove", this.kay);
    c.addEventListener("pointerup", this.birak);
    c.addEventListener("pointercancel", this.birak);
    c.addEventListener("wheel", this.teker, { passive: false });
    document.addEventListener("visibilitychange", this.gorunurluk);

    this.dongu();
  }

  // ── Görünümler ────────────────────────────────────────────────────

  private temizle() {
    this.icerik.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
      const s = o as THREE.Sprite;
      if (s.isSprite) { s.material.map?.dispose(); s.material.dispose(); }
    });
    this.icerik.clear();
    this.odaEsyalari = [];
    this.izgara = null;
    this.hayalet = null;
    this.seciliIndeks = null;
  }

  private kameraKur(kip: Kip, kadraj: number, hedef: THREE.Vector3, pan: [number, number] = [0, 0]) {
    this.kip = kip;
    this.odaHedefi = null;
    this.kadraj = kadraj;
    this.hedef.copy(hedef);
    this.panSinir = pan;
    this.panY = this.hedefPanY = 0;
    this.hedefAci = this.aci = Math.PI / 4;
    this.yakinlik = this.hedefYakinlik = 1;
    this.boyutla();
    this.isikYon.position.set(hedef.x + 6, hedef.y + 12, hedef.z + 8);
    this.isikYon.target.position.copy(hedef);
    const gs = kadraj * 0.9;
    Object.assign(this.isikYon.shadow.camera, { left: -gs, right: gs, top: gs, bottom: -gs, near: 1, far: 60 });
    this.isikYon.shadow.camera.updateProjectionMatrix();
  }

  /**
   * YAZVEB binası: dikey telefona uygun bir kule, her katta 2 oda. En üstte
   * topluluk büyüdükçe açılan bölümler (alçak cam platformlar: odaları örtmez).
   */
  binaGoster(bina: Bina) {
    this.temizle();
    const KAT_Y = 2.05, SUTUN_X = 2.15, SUTUN = 2;
    const katlar = Math.max(1, Math.ceil(bina.odalar.length / SUTUN));
    const bina3 = new THREE.Group();
    const plakaM = new THREE.MeshStandardMaterial({ color: "#2f3848", flatShading: true, roughness: 0.9 });
    const kolonM = new THREE.MeshStandardMaterial({ color: "#3a4557", flatShading: true, roughness: 0.9 });
    for (let k = 0; k <= katlar; k++) {
      const plaka = new THREE.Mesh(new THREE.BoxGeometry(SUTUN_X * SUTUN + 0.3, 0.14, 2.1), plakaM);
      plaka.position.set(0, k * KAT_Y - 0.07, 0);
      plaka.receiveShadow = true;
      bina3.add(plaka);
    }
    // Arka kolonlar: binanın iskeleti (önü açık, odalar görünsün)
    for (const x of [-SUTUN_X, 0, SUTUN_X]) {
      const kolon = new THREE.Mesh(new THREE.BoxGeometry(0.12, katlar * KAT_Y, 0.12), kolonM);
      kolon.position.set(x, (katlar * KAT_Y) / 2, -1.02);
      bina3.add(kolon);
    }
    bina.odalar.forEach((o, i) => {
      const kat = Math.floor(i / SUTUN), sutun = i % SUTUN;
      const oda = this.miniOda(o);
      // Plakanın bir tık üstünde: aynı yükseklikteki iki yüzey çakışıp (z-fighting)
      // testere dişi desen çıkarıyordu.
      oda.position.set((sutun - (SUTUN - 1) / 2) * SUTUN_X, kat * KAT_Y + 0.02, 0);
      oda.userData.sec = { tur: "oda", id: o.id } satisfies Secim;
      bina3.add(oda);
    });
    // Çatı: bölümler alçak cam platformlar
    const catiY = katlar * KAT_Y;
    bina.bolumler.forEach((b, i) => {
      const blok = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.28, 1.3),
        new THREE.MeshStandardMaterial({
          color: b.acik ? "#8ccfe2" : "#b8c7d8", flatShading: true, transparent: true, opacity: b.acik ? 0.95 : 0.35,
          emissive: b.acik ? "#8ccfe2" : "#000000", emissiveIntensity: b.acik ? 0.25 : 0,
        }));
      m.position.y = 0.14;
      blok.add(m);
      const e = etiket(b.acik ? b.ad : `${b.ad} · ${b.esik} oyuncu`, { boyut: 0.2, renk: b.acik ? "#ecedee" : "#aab3bf" });
      e.position.set(0, 0.6, 0);
      blok.add(e);
      blok.position.set((i - 1) * 1.45, catiY, -0.25);
      blok.userData.sec = { tur: "bolum", id: b.ad } satisfies Secim;
      bina3.add(blok);
    });
    const tabela = etiket("YAZVEB HUB", { boyut: 0.42, arka: "rgba(14, 36, 51, 0.95)" });
    tabela.position.set(0, catiY + 1.3, 0.2);
    bina3.add(tabela);
    this.icerik.add(bina3);

    const yukseklik = catiY + 1.6;
    // İlk bakış: zemin kat (kendi odan solda); yukarı kaydırarak katlar gezilir.
    this.kameraKur("bina", 6.4, new THREE.Vector3(0, 1.6, 0), [0, Math.max(0, yukseklik - 3.6)]);
  }

  /** Binadaki küçük oda: zemin, iki duvar, karakter ve birkaç eşya. */
  private miniOda(o: Oyuncu) {
    const g = new THREE.Group();
    const olcek = 0.3;
    const kabuk = odaKabugu(ODA_BOYU, { duvar: o.ben ? "#d8ecf5" : "#e8edf2", parke: false });
    kabuk.scale.setScalar(olcek);
    g.add(kabuk);
    const ic = new THREE.Group();
    ic.scale.setScalar(olcek);
    for (const e of (o.oda ?? []).slice(0, 12)) {
      const m = esyaModeli(e.esya);
      m.position.set(e.x - ODA_BOYU / 2 + 0.5, 0, e.z - ODA_BOYU / 2 + 0.5);
      m.rotation.y = -(e.yon ?? 0) * Math.PI / 2;
      ic.add(m);
    }
    if (o.kuruldu) {
      const k = karakter(o.avatar);
      k.position.set(0.5, 0, 1.2);
      ic.add(k);
    }
    g.add(ic);
    // Minyatürde gölge haritası çözünürlüğü yetmiyor (tırtıklı şeritler):
    // binadaki odalar gölge almaz ve düşürmez; odanın içinde gölge tam.
    g.traverse((x) => { x.castShadow = false; x.receiveShadow = false; });
    const ad = etiket(o.ben ? `${o.ad} (sen)` : o.ad, { boyut: 0.24, arka: o.ben ? "rgba(140, 207, 226, 0.95)" : undefined, renk: o.ben ? "#08090b" : undefined });
    ad.position.set(0, 1.0, 0.95);
    g.add(ad);
    return g;
  }

  /** Bir odanın içi. `duzen`: ızgara görünür, hücreler ve eşyalar seçilebilir. */
  odaGoster(o: Oyuncu, duzen = false) {
    this.temizle();
    const kabuk = odaKabugu(ODA_BOYU, { duvar: o.ben ? "#dcecf4" : "#e8edf2" });
    this.icerik.add(kabuk);
    this.odaEsyalariKur(o.oda);
    const k = karakter(o.avatar);
    k.name = "sahibi";
    k.position.set(0.5, 0, 1.4);
    k.rotation.y = 0.35;
    k.scale.setScalar(1.35);   // chibi oranı: odada okunaklı dursun
    this.icerik.add(k);
    const ad = etiket(o.ad, { boyut: 0.34 });
    ad.position.set(0.5, 1.85, 1.4);
    ad.name = "sahibiEtiket";
    this.icerik.add(ad);
    this.duzenKipi(duzen);
    // İzometrik odanın köşegeni ~8.5 birim: kenar payıyla tamamı görünsün.
    this.kameraKur("oda", 8.6, new THREE.Vector3(0, 0.6, 0));
  }

  private odaEsyalariKur(oda: OdaEsyasi[]) {
    for (const g of this.odaEsyalari) this.icerik.remove(g);
    this.odaEsyalari = oda.map((e, i) => {
      const m = esyaModeli(e.esya);
      m.position.set(e.x - ODA_BOYU / 2 + 0.5, 0, e.z - ODA_BOYU / 2 + 0.5);
      m.rotation.y = -(e.yon ?? 0) * Math.PI / 2;
      m.userData.sec = { tur: "esya", indeks: i } satisfies Secim;
      this.icerik.add(m);
      return m;
    });
    this.secimiGoster(this.seciliIndeks);
  }

  /** Odayı yeniden çizmeden eşyaları güncelle (düzenleme sırasında). */
  odaGuncelle(oda: OdaEsyasi[]) { this.odaEsyalariKur(oda); }

  avatarGuncelle(a: Avatar) {
    const eski = this.icerik.getObjectByName("sahibi");
    if (!eski) return;
    const yeni = karakter(a);
    yeni.name = "sahibi";
    yeni.position.copy(eski.position);
    yeni.rotation.copy(eski.rotation);
    yeni.scale.copy(eski.scale);
    this.icerik.remove(eski);
    this.icerik.add(yeni);
  }

  /**
   * Karakter giydirirken kamera karaktere yaklaşır ve onu ekranın üst
   * yarısına alır: alttaki panel onu örtmesin. Kapanınca odaya geri döner.
   */
  karakterOdagi(acik: boolean) {
    const k = this.icerik.getObjectByName("sahibi");
    if (this.kip !== "oda" || !k) return;
    if (acik) {
      this.odaHedefi = this.odaHedefi ?? this.hedef.clone();
      this.hedef.set(k.position.x, k.position.y - 0.35, k.position.z);
      this.hedefYakinlik = 2.6;
      this.hedefAci = 0.55;
    } else if (this.odaHedefi) {
      this.hedef.copy(this.odaHedefi);
      this.odaHedefi = null;
      this.hedefYakinlik = 1;
      this.hedefAci = Math.PI / 4;
    }
  }
  private odaHedefi: THREE.Vector3 | null = null;

  duzenKipi(acik: boolean) {
    if (this.izgara) { this.icerik.remove(this.izgara); this.izgara = null; }
    const sahibi = this.icerik.getObjectByName("sahibi");
    if (sahibi) sahibi.visible = !acik;
    const e = this.icerik.getObjectByName("sahibiEtiket");
    if (e) e.visible = !acik;
    if (!acik) return;
    const iz = new THREE.GridHelper(ODA_BOYU, ODA_BOYU, 0x8ccfe2, 0x8ccfe2);
    (iz.material as THREE.Material).transparent = true;
    (iz.material as THREE.Material).opacity = 0.45;
    iz.position.y = 0.02;
    this.izgara = iz;
    this.icerik.add(iz);
  }

  /** Seçili eşyanın çevresinde yumuşak bir ışık halkası. */
  secimiGoster(indeks: number | null) {
    this.seciliIndeks = indeks;
    if (this.hayalet) { this.icerik.remove(this.hayalet); this.hayalet = null; }
    if (indeks === null || !this.odaEsyalari[indeks]) return;
    const hedef = this.odaEsyalari[indeks];
    const halka = new THREE.Group();
    const m = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 24),
      new THREE.MeshBasicMaterial({ color: "#8ccfe2", transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    halka.add(m);
    halka.position.copy(hedef.position);
    halka.name = "secim";
    this.hayalet = halka;
    this.icerik.add(halka);
  }

  /** Sponsor çarşısı: eşik arttıkça teras yükselir ve geriye çekilir. */
  carsiGoster(dukkanlar: CarsiDukkani[], ben: Avatar | null) {
    this.temizle();
    const esikler = [...new Set(dukkanlar.map((d) => d.gerekliXp))].sort((a, b) => a - b);
    const katman = (xp: number) => Math.min(esikler.indexOf(xp), 4);
    const katmanSayisi = Math.min(esikler.length, 5) || 1;

    // Teraslar
    for (let t = 0; t < katmanSayisi; t++) {
      const genislik = Math.max(4.4, dukkanlar.filter((d) => katman(d.gerekliXp) === t).length * 2.1 + 2.4);
      const teras = new THREE.Mesh(new THREE.BoxGeometry(genislik, 0.3 + t * 0.7, 2.3),
        new THREE.MeshStandardMaterial({ color: t % 2 ? "#3a4252" : "#333a48", flatShading: true, roughness: 0.95 }));
      teras.position.set(0, (0.3 + t * 0.7) / 2 - 0.15, -t * 2.3);
      teras.receiveShadow = true;
      teras.castShadow = true;
      this.icerik.add(teras);
      const esik = esikler[t] ?? 0;
      const e = etiket(esik === 0 ? "Herkese açık" : `🔒 ${esik.toLocaleString("tr-TR")} XP`, { boyut: 0.22, renk: esik === 0 ? "#8ccfe2" : "#e2b659" });
      e.position.set(genislik / 2 - 0.62, t * 0.7 + 0.32, -t * 2.3 + 0.75);
      this.icerik.add(e);
    }
    const sayac = new Map<number, number>();
    const katmandakiler = (t: number) => dukkanlar.filter((d) => katman(d.gerekliXp) === t).length;
    dukkanlar.forEach((d, i) => {
      const t = katman(d.gerekliXp);
      const sira = sayac.get(t) ?? 0;
      sayac.set(t, sira + 1);
      const adet = katmandakiler(t);
      const m = dukkan(d.ad, d.acik, i);
      m.position.set((sira - (adet - 1) / 2) * 2.1, t * 0.7 + 0.15, -t * 2.3 - 0.25);
      m.userData.sec = { tur: "dukkan", id: d.id } satisfies Secim;
      m.name = "dukkan:" + d.id;
      this.icerik.add(m);
    });
    // Sen: çarşının girişinde
    if (ben) {
      const k = karakter(ben);
      k.position.set(0, 0.15, 1.85);
      k.rotation.y = Math.PI;
      k.scale.setScalar(1.2);
      k.name = "sahibi";
      this.icerik.add(k);
    }
    const derinlik = katmanSayisi * 2.3;
    const genislik = Math.max(4.4, Math.max(...[...Array(katmanSayisi).keys()].map((t) => katmandakiler(t))) * 2.1 + 2.4);
    // Çarşı önden (hafif açılı) görünür: teraslar ekranda yukarı doğru
    // basamaklanır, dikey telefona sığar ve hiyerarşi "tırmanış" gibi okunur.
    this.kameraKur("carsi", Math.max(6.4, genislik * 1.15), new THREE.Vector3(0, katmanSayisi * 0.35 + 0.4, -derinlik / 2 + 1.2));
    this.hedefAci = this.aci = CARSI_ACI;
  }

  /** Kapıyı çal: kapı üç kez hafifçe sarsılır; bitince çözülür. */
  kapiCal(id: string): Promise<void> {
    const d = this.icerik.getObjectByName("dukkan:" + id);
    const kapi = d?.getObjectByName("kapi");
    if (!kapi || AZALT) return Promise.resolve();
    const bas = kapi.rotation.y;
    const t0 = performance.now();
    return new Promise((coz) => {
      const adim = () => {
        const t = (performance.now() - t0) / 700;
        kapi.rotation.y = bas + (t < 1 ? Math.sin(t * Math.PI * 6) * 0.06 * (1 - t) : 0);
        if (t < 1) requestAnimationFrame(adim); else coz();
      };
      adim();
    });
  }

  // ── Kamera ve etkileşim ───────────────────────────────────────────

  private boyutla = () => {
    const w = Math.max(1, this.kap.clientWidth), h = Math.max(1, this.kap.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    const oran = w / h;
    // `kadraj` görünmesi gereken GENİŞLİK. Dikey telefonda genişlik belirler;
    // yatay ekranda yükseklik (kadrajın ~%80'i) belirler.
    const yarimX = oran < 1 ? this.kadraj / 2 : (this.kadraj * 0.4) * oran;
    const yarimY = yarimX / oran;
    this.kamera.left = -yarimX;
    this.kamera.right = yarimX;
    this.kamera.top = yarimY;
    this.kamera.bottom = -yarimY;
    this.kamera.updateProjectionMatrix();
  };

  private kameraGuncelle(dt: number) {
    const k = 1 - Math.exp(-dt * 9);
    this.aci += (this.hedefAci - this.aci) * k;
    this.yakinlik += (this.hedefYakinlik - this.yakinlik) * k;
    this.panY += (this.hedefPanY - this.panY) * k;
    const merkez = this.hedef.clone();
    merkez.y += this.panY;
    const r = 20;
    this.kamera.position.set(merkez.x + Math.sin(this.aci) * r, merkez.y + r * 0.72, merkez.z + Math.cos(this.aci) * r);
    this.kamera.lookAt(merkez);
    if (Math.abs(this.kamera.zoom - this.yakinlik) > 1e-4) {
      this.kamera.zoom = this.yakinlik;
      this.kamera.updateProjectionMatrix();
    }
  }

  private bas = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.dokunma.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const noktalar = [...this.dokunma.values()];
    const mesafe = noktalar.length === 2 ? Math.hypot(noktalar[0].x - noktalar[1].x, noktalar[0].y - noktalar[1].y) : 0;
    this.surukleme = { x: e.clientX, y: e.clientY, aci: this.hedefAci, pan: this.hedefPanY, mesafe, yakin: this.hedefYakinlik, hareket: 0 };
  };

  private kay = (e: PointerEvent) => {
    if (!this.surukleme || !this.dokunma.has(e.pointerId)) return;
    this.dokunma.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const noktalar = [...this.dokunma.values()];
    if (noktalar.length === 2 && this.surukleme.mesafe > 0) {
      const m = Math.hypot(noktalar[0].x - noktalar[1].x, noktalar[0].y - noktalar[1].y);
      this.hedefYakinlik = THREE.MathUtils.clamp(this.surukleme.yakin * (m / this.surukleme.mesafe), 0.6, 2.6);
      this.surukleme.hareket = 99;
      return;
    }
    const dx = e.clientX - this.surukleme.x, dy = e.clientY - this.surukleme.y;
    this.surukleme.hareket = Math.max(this.surukleme.hareket, Math.hypot(dx, dy));
    // Döndürme sınırlı: duvarların arkası hiç görünmesin (oda) / bina hep önden.
    const [min, max] = this.kip === "oda" ? [0.05, 1.5] : this.kip === "carsi" ? [-0.7, 0.9] : [0.25, 1.3];
    this.hedefAci = THREE.MathUtils.clamp(this.surukleme.aci - dx * 0.006, min, max);
    if (this.kip === "bina") {
      const olcek = (this.kamera.top - this.kamera.bottom) / this.kap.clientHeight / this.yakinlik;
      this.hedefPanY = THREE.MathUtils.clamp(this.surukleme.pan + dy * olcek * 1.4, this.panSinir[0], this.panSinir[1]);
    }
  };

  private birak = (e: PointerEvent) => {
    const s = this.surukleme;
    this.dokunma.delete(e.pointerId);
    if (this.dokunma.size > 0) return;
    this.surukleme = null;
    if (s && s.hareket < 8) this.dokun(e.clientX, e.clientY);
  };

  private teker = (e: WheelEvent) => {
    e.preventDefault();
    this.hedefYakinlik = THREE.MathUtils.clamp(this.hedefYakinlik * (e.deltaY > 0 ? 0.9 : 1.1), 0.6, 2.6);
  };

  private dokun(x: number, y: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const nokta = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(nokta, this.kamera);
    const vuruslar = this.raycaster.intersectObjects(this.icerik.children, true);
    for (const v of vuruslar) {
      let o: THREE.Object3D | null = v.object;
      while (o) {
        const sec = o.userData.sec as Secim | undefined;
        if (sec) { this.onSec(sec); return; }
        o = o.parent;
      }
      // Oda düzenlerken zemine dokunma: hangi hücre?
      if (this.kip === "oda" && this.izgara && v.object.name === "zemin") {
        const hx = Math.floor(v.point.x + ODA_BOYU / 2), hz = Math.floor(v.point.z + ODA_BOYU / 2);
        if (hx >= 0 && hx < ODA_BOYU && hz >= 0 && hz < ODA_BOYU) this.onSec({ tur: "hucre", x: hx, z: hz });
        return;
      }
    }
  }

  // ── Döngü ─────────────────────────────────────────────────────────

  private gorunurluk = () => {
    this.calisiyor = !document.hidden;
    if (this.calisiyor) { this.saat.update(); this.dongu(); }
  };

  private dongu = () => {
    if (!this.calisiyor) return;
    this.cerceve = requestAnimationFrame(this.dongu);
    this.saat.update();
    const dt = Math.min(this.saat.getDelta(), 0.1);
    const t = this.saat.getElapsed();
    this.kameraGuncelle(dt);
    if (!AZALT) {
      this.icerik.traverse((o) => {
        if (o.userData.nefes) {
          const govde = o.getObjectByName("govde"), kafa = o.getObjectByName("kafa");
          const faz = (o.id % 7) * 0.9;
          if (govde) govde.position.y = Math.sin(t * 2 + faz) * 0.008;
          if (kafa) { kafa.position.y = 0.9 + Math.sin(t * 2 + faz) * 0.012; kafa.rotation.y = Math.sin(t * 0.6 + faz) * 0.18; }
          const g = o.getObjectByName("gozler");
          if (g) g.scale.y = (t + faz) % 4.2 < 0.12 ? 0.15 : 1;   // göz kırpma
          const kol = o.getObjectByName("kolSag");
          if (kol) kol.rotation.x = Math.sin(t * 1.4 + faz) * 0.08;
        }
        if (o.userData.balik) {
          const b = o.getObjectByName("baliklar");
          b?.children.forEach((f, i) => { f.position.x = Math.sin(t * 0.8 + i * 2) * 0.28; f.rotation.y = Math.cos(t * 0.8 + i * 2) > 0 ? 0 : Math.PI; });
        }
        if (o.name === "led") {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
          m.emissiveIntensity = 0.6 + Math.abs(Math.sin(t * 3 + o.id)) * 0.9;
        }
        if (o.name === "secim") o.scale.setScalar(1 + Math.sin(t * 4) * 0.04);
      });
    }
    this.renderer.render(this.sahne, this.kamera);
  };

  yokEt() {
    this.calisiyor = false;
    cancelAnimationFrame(this.cerceve);
    this.gozleyici.disconnect();
    document.removeEventListener("visibilitychange", this.gorunurluk);
    this.temizle();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
