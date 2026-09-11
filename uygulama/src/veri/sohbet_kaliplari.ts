// ═══════════════════════════════════════════════════════════════════
// ÜRETİLMİŞ DOSYA — ELLE DÜZENLEME
// ═══════════════════════════════════════════════════════════════════
// Kaynak: bilgi_bankasi.py  ·  Üretici: bilgi_disa_aktar.py
// Banka sürümü: 2026.08  ·  33 kayıt
//
// Güncellemek için:  python bilgi_disa_aktar.py
// ═══════════════════════════════════════════════════════════════════

export const HIZLI_EN_FAZLA_KELIME = 6;

export const DOLGU: ReadonlySet<string> = new Set(["abi", "abla", "asistan", "bak", "be", "bee", "canim", "canım", "e", "ee", "hadi", "hocam", "kanka", "merhaba", "peki", "selam", "selamlar", "ya", "yaa", "yazveb"]);

export const HIZLI_KALIPLAR: { anahtarlar: string[]; cevaplar: string[] }[] =
[
  {
    "anahtarlar": [
      "seni kim yaptı",
      "seni kim yapti",
      "seni kim kodladı",
      "seni kim kodladi",
      "kim yaptı seni",
      "kim kodladı seni",
      "seni kim geliştirdi",
      "seni kim gelistirdi",
      "seni kim tasarladı",
      "seni kim yazdı",
      "yapımcın kim",
      "yapimcin kim",
      "geliştiricin kim",
      "gelistiricin kim",
      "seni kim programladı",
      "kim yaptı",
      "kim kodladı",
      "kim geliştirdi"
    ],
    "cevaplar": [
      "Başkanımız önderliğinde, topluluk olarak ortak çalışmamız sonucu kodlandım."
    ]
  },
  {
    "anahtarlar": [
      "sen kimsin",
      "kimsin sen",
      "kimsin",
      "adın ne",
      "adin ne",
      "sen nesin"
    ],
    "cevaplar": [
      "Ben YAZVEB Asistanıyım, Selçuk Üniversitesi Yapay Zeka ve Veri Bilimi Topluluğu'nun dijital karşılayıcısı. Topluluk hakkında merak ettiğin her şeyi sorabilirsin."
    ]
  },
  {
    "anahtarlar": [
      "nasılsın",
      "nasilsin",
      "naber",
      "ne haber",
      "nasıl gidiyor",
      "iyi misin",
      "keyfin nasıl",
      "napıyorsun",
      "ne yapıyorsun"
    ],
    "cevaplar": [
      "İyiyim, sorduğun için teşekkürler. Sen nasılsın?",
      "Gayet iyiyim. Senden ne haber?",
      "İyiyim ben, hazırım. Sen nasılsın?"
    ]
  },
  {
    "anahtarlar": [
      "günaydın",
      "gunaydin"
    ],
    "cevaplar": [
      "Günaydın! Bugün sana nasıl yardımcı olabilirim?"
    ]
  },
  {
    "anahtarlar": [
      "iyi akşamlar",
      "iyi geceler"
    ],
    "cevaplar": [
      "İyi akşamlar! Buyur, dinliyorum."
    ]
  },
  {
    "anahtarlar": [
      "merhaba",
      "selam",
      "selamlar",
      "selamünaleyküm",
      "selamun aleykum",
      "iyi günler",
      "hey",
      "alo"
    ],
    "cevaplar": [
      "Merhaba! Buyur, dinliyorum.",
      "Merhaba, hoş geldin. Ne sormak istersin?",
      "Selam! Seni dinliyorum."
    ]
  },
  {
    "anahtarlar": [
      "iyiyim",
      "ben de iyiyim",
      "iyidir",
      "fena değil",
      "idare eder",
      "şükür"
    ],
    "cevaplar": [
      "Buna sevindim. Aklında bir soru varsa buyur.",
      "Ne güzel. Merak ettiğin bir şey varsa sorabilirsin."
    ]
  },
  {
    "anahtarlar": [
      "teşekkürler",
      "teşekkür ederim",
      "tesekkurler",
      "sağol",
      "sağ ol",
      "sagol",
      "eyvallah",
      "çok teşekkür"
    ],
    "cevaplar": [
      "Rica ederim.",
      "Ne demek, her zaman."
    ]
  },
  {
    "anahtarlar": [
      "görüşürüz",
      "hoşça kal",
      "hoscakal",
      "bay bay",
      "kendine iyi bak",
      "güle güle"
    ],
    "cevaplar": [
      "Görüşürüz, kendine iyi bak!",
      "Hoşça kal! Yine beklerim."
    ]
  }
];

export const HATA_CEVABI = "Kusura bakma, cevabı getiremedim. Bir daha sorar mısın?";
