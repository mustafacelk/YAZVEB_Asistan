# -*- coding: utf-8 -*-
"""
YAZVEB bilgi bankası.

Her kayıt anahtar kelimelerle kodlanmıştır. Anahtar kelimeler embedding'e de
girer; bu sayede kullanıcı "aidat", "kaç kişiyiz", "nasıl üye olurum" gibi
günlük dille sorduğunda doğru parça geri gelir.

Kategoriler
-----------
kurumsal     : YAZVEB'in doğrulanmış kurumsal bilgisi
universite   : Selçuk Üniversitesi ve Fen Fakültesi
uygulama     : YAZVEB mobil uygulaması — bölümler, puan, ödül, sorun giderme
taslak       : onay bekleyen, kesinleşmemiş kurallar
bosluk       : bilinçli olarak "bilgim yok" dedirtmek için konulan kayıtlar
veri_bilimi  : topluluğun alanına ait kalıcı teknik bilgi
turkiye      : Türkiye teknoloji/yapay zeka ekosisteminde bilinmesi gerekenler
global       : dünyada bilinmesi gereken kalıcı kavram ve çerçeveler

Kalıcılık kuralı: buraya sadece hızlı eskimeyen bilgi yazılır. Model sürümü,
fiyat, tarih, kontenjan gibi oynak veriler kayıt içine yazılmaz; bunlar için
asistan güncel arama katmanına yönlendirilir.
"""

from __future__ import annotations

BANKA_SURUMU = "2026.09"

KAYITLAR: list[dict] = [
    # ══════════════════════════ KURUMSAL ══════════════════════════
    {
        "baslik": "Kuruluş ve akademik danışman",
        "kategori": "kurumsal",
        "anahtar": ["yazveb", "kuruluş", "ne zaman kuruldu", "tarihçe", "geçmiş",
                    "danışman", "akademik danışman", "aynur yonar", "istatistik bölümü"],
        "icerik": (
            "YAZVEB (Yapay Zeka ve Veri Bilimi Topluluğu), Selçuk Üniversitesi bünyesinde "
            "2022 yılında Doç. Dr. Aynur Yonar'ın atılımı ve İstatistik bölümünün katkısıyla "
            "kuruldu. Sonrasında pasif duruma düşen topluluk devralınarak Mustafa Çelik liderliğinde yeniden canlandırıldı. "
            "Akademik danışman Doç. Dr. Aynur Yonar'dır. Resmî Instagram hesabımız "
            "@yapayzekaveribilimitop.su"
        ),
    },
    {
        "baslik": "Yönetim kadrosu ve birimler",
        "kategori": "kurumsal",
        "anahtar": ["yönetim", "başkan", "mustafa çelik", "başkan yardımcısı", "gizem dede",
                    "efe güven çelik", "kadro", "birim", "organizasyon birimi", "sosyal medya",
                    "ar-ge", "kim yönetiyor", "yönetim kurulu"],
        "icerik": (
            "Başkan Mustafa Çelik (aynı zamanda Selçuklu Gençlik Meclisi Teknoloji Komisyonu "
            "Başkanı). Başkan yardımcıları Gizem Dede ve Efe Güven Çelik. Yönetim kadrosu üç "
            "birime ayrılır: Organizasyon, Sosyal Medya, Ar-Ge."
        ),
    },
    {
        "baslik": "Kapasite ve saha ekibi",
        "kategori": "kurumsal",
        "anahtar": ["kaç üye", "üye sayısı", "kaç kişi", "büyüklük", "kapasite", "400",
                    "saha ekibi", "görevli sayısı", "25 kişi"],
        "icerik": (
            "Toplam üye sayısı 400. Etkinliklerde sahada görevlendirilen kişi sayısı bilinçli "
            "olarak 25 ile sınırlanır; kalabalık saha ekibi yerine kontrollü ve eğitimli bir "
            "operasyon ekibi tercih edilir."
        ),
    },
    {
        "baslik": "Misyon ve akademik vizyon",
        "kategori": "kurumsal",
        "anahtar": ["misyon", "vizyon", "amaç", "neden varsınız", "ne yapıyorsunuz",
                    "felsefe", "hedef", "yaklaşım"],
        "icerik": (
            "YAZVEB, yapay zekayı kullanılan hazır bir araç olarak değil, arkasındaki mimarisi "
            "ve düşünce yapısıyla kavranması gereken bir teknoloji olarak ele alır. Hedef, "
            "hazır araçları tüketen değil mimariyi kavrayan, akademik altyapısı güçlü bir nesil "
            "yetiştirmektir. Üyeleri akademik olarak güçlendiren etkinlikler önceliklidir."
        ),
    },
    {
        "baslik": "Saha ve organizasyon stratejisi",
        "kategori": "kurumsal",
        "anahtar": ["saha", "organizasyon", "stant", "host", "görevli", "yaka kartı",
                    "kart zorunluluğu", "aslanlı alan", "kampüs alanı", "etkinlik kuralları",
                    "operasyon"],
        "icerik": (
            "Büyük organizasyonlarda sadece tanıtım standı açılmaz; doğrudan organizasyon "
            "görevlisi (host) kapasitesiyle sahada bulunulur ve operasyonun tamamı yönetilir. "
            "Tüm etkinliklerde topluluk yaka kartı takmak zorunludur, kartlar dönem başında "
            "dağıtılır. Kampüs içi planlamalarda Aslanlı alan tercih edilmez; sanılanın aksine "
            "yaya trafiği zayıftır."
        ),
    },
    {
        "baslik": "Toplantı mekânları",
        "kategori": "kurumsal",
        "anahtar": ["toplantı", "nerede buluşuyorsunuz", "mekân", "salon", "yeni nesil kütüphane",
                    "atmosfer", "selçuklu gençlik meclisi", "buluşma noktası"],
        "icerik": (
            "Toplantı ve buluşma noktaları: Yeni Nesil Kütüphane toplantı salonu, Atmosfer "
            "toplantı salonu, Selçuklu Gençlik Meclisi toplantı salonu."
        ),
    },
    {
        "baslik": "Etkinlik takvimi ve türleri",
        "kategori": "kurumsal",
        "anahtar": ["etkinlik", "takvim", "seminer", "akademik seminer", "istatistik günü",
                    "zaman serileri", "konferans", "teknoloji buluşması", "yılda kaç etkinlik",
                    "ne zaman etkinlik var"],
        "icerik": (
            "Akademik seminerler yılda 2 kez, biri güz biri bahar döneminde, Fen Fakültesi "
            "konferans salonunda yapılır. Örnekleri: İstatistik Günü etkinlikleri, uygulamalı "
            "Zaman Serileri eğitimleri. Teknoloji buluşmaları, konferanslar ve Genç 2030 "
            "seminerleri bu iki akademik seminere dahil değildir, ayrı yürür."
        ),
    },
    {
        "baslik": "Genç 2030 projesi ve katılım yolu",
        "kategori": "kurumsal",
        "anahtar": ["genç 2030", "gsb", "gençlik ve spor bakanlığı", "sanayi ve teknoloji bakanlığı",
                    "eğitmenlik", "sertifika", "eğitmen kartı", "okullarda seminer",
                    "nasıl katılırım", "başvuru", "form"],
        "icerik": (
            "Genç 2030, Gençlik ve Spor Bakanlığı ile Sanayi ve Teknoloji Bakanlığı tarafından "
            "yürütülen yapay zeka uygulamaları ve öğrenimi programıdır. YAZVEB üyeleri GSB "
            "sertifikalı eğitmenlik kartlarıyla başta okullar olmak üzere çeşitli kurumlarda "
            "seminer verir. Katılım yolu: üye, topluluk WhatsApp grubundan Genç 2030 grubuna "
            "katılma isteği gönderir ve zaman zaman açılan eğitmenlik formunu doldurur."
        ),
    },
    {
        "baslik": "Projeler ve başarılar",
        "kategori": "kurumsal",
        "anahtar": ["proje", "başarı", "ödül", "yarışma", "cihannüma", "film", "teknosel",
                    "yapay zeka geleceğin dili", "konferans", "derece"],
        "icerik": (
            "Düzenlenen 'Yapay Zeka: Geleceğin Dili' konferansı topluluğun öne çıkan "
            "etkinliklerindendir. Teknosel Yapay Zeka Film Yarışması'nda 'Cihannüma' filmiyle "
            "üçüncülük kazanılmıştır."
        ),
    },
    {
        "baslik": "Marka ve görsel kimlik kuralı",
        "kategori": "kurumsal",
        "anahtar": ["marka", "logo", "tasarım", "tişört", "afiş", "sunum", "görsel kimlik",
                    "kurumsal kimlik", "renk", "premium"],
        "icerik": (
            "Topluluk materyalleri (tişört, afiş, sunum, sosyal medya görselleri) 'öğrenci kulübü "
            "işi' hissi vermez; premium ve markalaşabilir bir çizgide üretilir. Topluluk logosu "
            "hiçbir tasarımda değiştirilmez, yeniden çizilmez, renkleri veya oranları bozulmaz."
        ),
    },
    {
        "baslik": "Yeni öğrenci karşılama",
        "kategori": "kurumsal",
        "anahtar": ["yeni geldim", "yeni kazandım", "hoş geldin", "birinci sınıf", "yeni üye",
                    "aranıza katıldım", "üniversiteye başladım", "tanışma"],
        "icerik": (
            "Kullanıcı üniversiteye yeni geldiğini, yeni kazandığını veya topluluğa yeni "
            "katıldığını söylerse önce 'Selçuk Üniversitesi'ne ve YAZVEB ailesine hoş geldin!' "
            "diyerek sıcak bir giriş yapılır. Ardından kısa bir özet verilir: akademik seminerler, "
            "Genç 2030 kapsamında sertifikalı eğitmenlik ve büyük teknoloji organizasyonlarının "
            "operasyon yönetimi."
        ),
    },

    {
        "baslik": "Topluluğa katılım ve üyenin yolu",
        "kategori": "kurumsal",
        "anahtar": ["nasıl üye olurum", "topluluğa nasıl katılırım", "üyelik", "katılmak istiyorum",
                    "görev almak", "birime katılmak", "gönüllü", "aranıza nasıl katılırım"],
        "icerik": (
            "Uygulamaya kaydolan herkes etkinlikleri takip edebilir, etkinliklerde puan kazanabilir "
            "ve topluluk sohbetine katılabilir. Resmî üyelik adımları ve Organizasyon, Sosyal Medya "
            "ya da Ar-Ge birimlerinde görev almak için yönetime veya resmî Instagram hesabı "
            "@yapayzekaveribilimitop.su üzerinden ulaşılır."
        ),
    },

    # ══════════════════════════ ÜNİVERSİTE ══════════════════════════
    {
        "baslik": "Selçuk Üniversitesi Fen Fakültesi",
        "kategori": "universite",
        "anahtar": ["selçuk üniversitesi", "fen fakültesi", "dekan", "mustafa şahin", "bölümler",
                    "aktüerya", "biyokimya", "biyoloji", "biyoteknoloji", "fizik", "istatistik",
                    "kimya", "matematik", "konya"],
        "icerik": (
            "Selçuk Üniversitesi Fen Fakültesi dekanı Prof. Dr. Mustafa Şahin'dir. Aktif "
            "bölümler: Aktüerya Bilimleri, Biyokimya, Biyoloji, Biyoteknoloji, Fizik, İstatistik, "
            "Kimya, Matematik. YAZVEB'in akademik seminerleri bu fakültenin konferans salonunda "
            "yapılır."
        ),
    },
    {
        "baslik": "Fen Fakültesi faaliyetleri",
        "kategori": "universite",
        "anahtar": ["fakülte etkinliği", "kongre", "uygulamalı istatistik kongresi", "sevgi evleri",
                    "sosyal sorumluluk", "iftar", "sümeder", "beyaz önlük", "tören"],
        "icerik": (
            "Fakültenin öne çıkan faaliyetleri: V. Uluslararası Uygulamalı İstatistik Kongresi'ne "
            "ev sahipliği, Sevgi Evleri çocukları için kampüs ve laboratuvar tanıtımlarını içeren "
            "sosyal sorumluluk projeleri, SÜMEDER ve Diyanet Vakfı ortaklığında iftar "
            "organizasyonları, birinci sınıflar için geleneksel Beyaz Önlük törenleri."
        ),
    },

    {
        "baslik": "Selçuk Üniversitesi — öğrenci gözüyle",
        "kategori": "universite",
        "anahtar": ["selçuk üniversitesi nerede", "kampüs", "alaeddin keykubat", "yerleşke",
                    "kampüse nasıl gidilir", "tramvay", "konya", "öğrenci hayatı", "üniversite hakkında",
                    "sks", "öğrenci toplulukları", "ders kaydı", "yurt", "yemekhane", "burs"],
        "icerik": (
            "Selçuk Üniversitesi 1975'te kurulmuş, Konya'nın köklü ve büyük devlet "
            "üniversitelerindendir. Ana yerleşkesi Selçuklu ilçesindeki Alaeddin Keykubat "
            "Yerleşkesi'dir; şehir merkezinden kampüse tramvayla ulaşılabilir. Yerleşke geniştir, "
            "fakülteler arası yol yürüyerek zaman alabilir. Öğrenci toplulukları üniversitenin "
            "Sağlık, Kültür ve Spor Daire Başkanlığına bağlı çalışır. Ders kaydı, not, burs, yurt, "
            "yemekhane menüsü ve ulaşım saatleri gibi değişen konularda tahmin yürütülmez; "
            "üniversitenin resmî sitesi selcuk.edu.tr ve ilgili birimlere yönlendirilir."
        ),
    },

    # ══════════════════════════ UYGULAMA ══════════════════════════
    {
        "baslik": "YAZVEB uygulaması nedir",
        "kategori": "uygulama",
        "anahtar": ["bu uygulama nedir", "uygulama ne işe yarar", "bu ne", "yazveb uygulaması",
                    "uygulamayı anlat", "uygulamada neler var", "burada ne yapabilirim", "uygulama"],
        "icerik": (
            "YAZVEB uygulaması, Selçuk Üniversitesi Yapay Zeka ve Veri Bilimi Topluluğu'nun resmî "
            "uygulamasıdır. Topluluğun etkinliklerini takip etmeyi, etkinliğe katılınca QR kodu "
            "okutarak puan (XP) kazanmayı, seviye atlamayı ve puanla sponsor işletmelerde ödül "
            "açmayı sağlar. İçinde topluluk sohbeti, üye listesi ve topluluk hakkında her şeyi "
            "sorabileceğin bu asistan da var. Amaç ekranda vakit geçirtmek değil: katıldıkça "
            "ilerlemek, ilerledikçe gerçek ayrıcalık kazanmak."
        ),
    },
    {
        "baslik": "Uygulamanın bölümleri",
        "kategori": "uygulama",
        "anahtar": ["menü", "sekme", "bölüm", "nerede", "nereden bakarım", "ana sayfa",
                    "etkinlikler bölümü", "ödüller bölümü", "topluluk bölümü", "qr tara nerede"],
        "icerik": (
            "Telefonda alt çubukta, bilgisayarda soldaki menüde beş öğe vardır. Ana: sıradaki "
            "etkinlik, bir sonraki adımın ve bekleyen ödüllerin; asistana da buradan yazılır. "
            "Etkinlikler: yaklaşan ve geçmiş etkinliklerin takvimi, her etkinlikte kazanılacak XP "
            "ve katıldıklarında 'Katıldın' işareti. QR tara (telefonda ortadaki düğme): etkinlikte "
            "ya da sponsor işletmede QR okutmak için. Ödüller: puanın, seviyen, sponsorlar, "
            "kazandığın ödüller (Ödüllerim), sıralama ve puan geçmişi. Topluluk: genel sohbet, "
            "üyeler ve sağ üstteki baş harflerinden açılan hesap ayarları."
        ),
    },
    {
        "baslik": "Etkinliklere katılım ve puan kazanma",
        "kategori": "uygulama",
        "anahtar": ["puan nasıl kazanılır", "xp", "qr okutma", "qr nasıl okutulur", "kısa kod",
                    "yoklama", "katılım", "etkinliğe katıldım", "puanım gelmedi", "puan"],
        "icerik": (
            "Puan etkinliklere katılarak kazanılır. Etkinlikte gösterilen YAZVEB QR kodunu QR tara "
            "düğmesiyle okutursun; kamera kullanmak istemezsen QR'nin altındaki kısa kodu "
            "yazabilirsin. Kazanılacak puan Etkinlikler bölümünde etkinliğin yanında '+XP' olarak "
            "yazar. Aynı görevin puanı bir kez alınır. Bazı görevler yalnızca etkinlik alanında "
            "tamamlanır; o zaman konum izni istenir, konum yalnızca kontrol edilir ve kaydedilmez. "
            "Puanın görünmüyorsa Ödüller bölümündeki puan geçmişine bak; orada da yoksa etkinlikteki "
            "görevliye veya yönetime söyle."
        ),
    },
    {
        "baslik": "Seviyeler ve bir sonraki adım",
        "kategori": "uygulama",
        "anahtar": ["seviye", "level", "seviye atlama", "starter", "explorer", "builder", "creator",
                    "core", "elite", "sonraki seviye", "kaç puan lazım"],
        "icerik": (
            "Puan biriktikçe seviye atlanır. Seviyeler sırasıyla STARTER, EXPLORER, BUILDER, "
            "CREATOR, CORE ve ELITE'tir; eşikleri yönetim belirler ve Ödüller bölümündeki seviye "
            "yolunda görünür. Seviyeler ve puan sponsor kilitlerini açar. Ana ekrandaki 'bir "
            "sonraki adım' cümlesi en yakın kazancın için kaç puan kaldığını söyler."
        ),
    },
    {
        "baslik": "Sponsor ödülleri nasıl alınır ve kullanılır",
        "kategori": "uygulama",
        "anahtar": ["sponsor", "ödül", "kahve", "indirim", "kilit", "kilidi açmak", "sürpriz ödül",
                    "ödül nasıl alınır", "ödülümü nasıl kullanırım", "işletme", "pin", "ödüllerim"],
        "icerik": (
            "Sponsorlar üyelere ayrıcalık sunan işletmelerdir. Her sponsorun bir kilidi vardır; "
            "belirli bir puana, seviyeye veya etkinlik sayısına ulaşınca açılır. Kilidi açılan "
            "sponsorun işletmesinde kasadaki YAZVEB QR'sini okutursun ve ödülün o an açılır. Sürpriz "
            "kampanyada olası ödüller ve gerçek kalan adetleri görünür; hangisinin çıkacağı "
            "okuttuğunda belli olur. Kazandığın ödül Ödüller bölümündeki Ödüllerim'e düşer. "
            "Kullanırken 'Ödülü göster' ekranını kasadaki çalışana gösterirsin, çalışan kendi "
            "PIN'iyle onaylar ve ödül bir kez kullanılmış olur. Her ödülün son kullanım tarihi "
            "vardır. 'Son 3 ödül' gibi uyarılar gerçek stoktan gelir."
        ),
    },
    {
        "baslik": "Seri ve sıralama",
        "kategori": "uygulama",
        "anahtar": ["seri", "üst üste", "bonus", "sıralama", "liderlik tablosu", "kaçıncıyım",
                    "sıram", "haftalık", "gizli profil"],
        "icerik": (
            "Puan görevi olan etkinliklere üst üste katıldıkça serin artar; yönetim bazı serilere "
            "bonus puan tanımlayabilir. Sıralama varsayılan olarak haftalıktır ve her pazartesi "
            "sıfırlanır, böylece yeni katılan da üst sıralara çıkabilir; tüm zamanlar sıralamasına "
            "da bakılabilir. Sıralamada yalnızca kullanıcı adı görünür; gizli profil açılınca "
            "listeden tamamen çıkılır, puan etkilenmez."
        ),
    },
    {
        "baslik": "Uygulamada sorun yaşarsan",
        "kategori": "uygulama",
        "anahtar": ["kamera açılmıyor", "qr okumuyor", "kod geçersiz", "süresi doldu", "zaten alındı",
                    "bağlantı hatası", "uygulama çalışmıyor", "sorun", "hata", "okutamadım"],
        "icerik": (
            "Kamera açılmıyorsa telefon ayarlarından YAZVEB'e kamera izni verilebilir ya da kısa "
            "kodla devam edilir. 'Zaten alındı' diyorsa o görevin puanı hesaptadır. 'Süresi doldu' "
            "diyorsa görevin zamanı geçmiştir; etkinlik sürüyorsa görevliden güncel kod istenir. "
            "Bağlantı koparsa okutulan kod kaybolmaz, 'Tekrar gönder' ile yeniden gider. "
            "Çözülmeyen sorunlar için yönetime veya Instagram hesabına yazılır."
        ),
    },
    {
        "baslik": "Hesap ve veriler",
        "kategori": "uygulama",
        "anahtar": ["hesap", "görünen ad", "isim değiştirme", "çıkış", "verilerim", "gizlilik",
                    "kamera kaydediliyor mu", "konum kaydediliyor mu", "hesabımı sil"],
        "icerik": (
            "Görünen ad, Topluluk bölümünde sağ üstteki baş harflere dokunarak değiştirilir; çıkış "
            "da oradadır. Aynı pencerede 'Verilerin nasıl kullanılıyor?' özeti bulunur: kamera "
            "görüntüsü telefonda işlenir ve kaydedilmez, konum yalnızca konum şartlı görevde "
            "kontrol edilir ve kaydedilmez, veriler satılmaz. Hesabın silinmesi için YAZVEB "
            "yönetimine yazılır."
        ),
    },
    {
        "baslik": "Uygulamanın felsefesi",
        "kategori": "uygulama",
        "anahtar": ["uygulamanın amacı", "neden bu uygulama", "oyunlaştırma", "neden puan",
                    "bildirim", "reklam"],
        "icerik": (
            "Uygulama topluluğun akademik vizyonuna hizmet eder: amaç ekranda vakit geçirtmek değil, "
            "üyeyi etkinliklere, öğrenmeye ve topluluğa bağlamaktır. Bu yüzden sahte kıtlık, "
            "suçlayıcı uyarı veya bildirim yağmuru yoktur; puan yalnızca gerçek katılımla kazanılır, "
            "ödüller gerçek stoktan verilir."
        ),
    },

    # ══════════════════════════ TASLAK ══════════════════════════
    {
        "baslik": "TASLAK — Birim görev sınırları",
        "kategori": "taslak",
        "anahtar": ["birim görevleri", "kim ne yapar", "görev dağılımı", "organizasyon görevi",
                    "sosyal medya görevi", "ar-ge görevi", "taslak"],
        "icerik": (
            "ONAY BEKLİYOR — kesinleşmiş kural değildir. Organizasyon: etkinlik planlama, saha "
            "koordinasyonu, görevli dağılımı, mekân ve lojistik, kurum iletişimi. Sosyal Medya: "
            "duyuru takvimi, içerik üretimi, etkinlik anı yayını, arşiv ve görünürlük. Ar-Ge: "
            "teknik içerik, eğitim materyali, proje ve yarışma başvuruları, akademik seminer "
            "içeriklerinin hazırlanması."
        ),
    },
    {
        "baslik": "TASLAK — Ar-Ge koruma kuralı",
        "kategori": "taslak",
        "anahtar": ["ar-ge koruma", "ar-ge sahaya çıkar mı", "görevlendirme", "yoğun dönem", "taslak"],
        "icerik": (
            "ONAY BEKLİYOR — kesinleşmiş kural değildir. Yoğun etkinlik dönemlerinde Ar-Ge "
            "biriminden saha görevlendirmesi yapılmaması önerilir. Ar-Ge'nin çıktısı geç gelir ve "
            "görünürlüğü düşüktür; korunmazsa organizasyona eleman devreden bir havuza dönüşür. "
            "Topluluğun akademik iddiasını taşıyan birim burasıdır."
        ),
    },
    {
        "baslik": "TASLAK — Dönem içi yaka kartı ve etkinlik onay akışı",
        "kategori": "taslak",
        "anahtar": ["misafir görevli kartı", "dönem ortası katılım", "kart stoğu", "onay akışı",
                    "etkinlik onayı", "kim onaylar", "taslak"],
        "icerik": (
            "ONAY BEKLİYOR — kesinleşmiş kural değildir. Dönem ortasında katılan üye veya "
            "etkinliğe özel görevlendirilen kişi için her etkinlikte 5-6 adetlik isimsiz 'misafir "
            "görevli' kartı stoğu bulundurulması önerilir. Önerilen etkinlik onay akışı: etkinlik "
            "önerisi, ilgili birim değerlendirmesi, başkan yardımcıları, başkan onayı. Akademik "
            "içerikli etkinliklerde ayrıca akademik danışman görüşü alınır."
        ),
    },

    # ══════════════════════════ BİLGİ BOŞLUKLARI ══════════════════════════
    {
        "baslik": "Kurumsal hafızada bulunmayan konular",
        "kategori": "bosluk",
        "anahtar": ["aidat", "ücret", "para", "kaç lira", "üyelik ücreti", "kontenjan",
                    "başvuru tarihi", "son tarih", "etkinlik tarihi", "ne zaman yapılacak",
                    "adres", "telefon", "iletişim numarası", "e-posta", "sınav", "not"],
        "icerik": (
            "Aşağıdaki konularda doğrulanmış bilgi YOKTUR ve tahmin yürütülmez: üyelik aidatı ve "
            "her türlü ücret, kontenjan sayıları, etkinliklerin kesin tarih ve saatleri, başvuru "
            "son tarihleri, birebir iletişim numaraları ve e-posta adresleri, ders/sınav bilgileri. "
            "Bu sorularda kullanıcıya bilginin elde olmadığı açıkça söylenir ve resmî Instagram "
            "hesabı @yapayzekaveribilimitop.su ile yönetim kadrosuna yönlendirilir."
        ),
    },

    # ══════════════════════════ VERİ BİLİMİ ══════════════════════════
    {
        "baslik": "İstatistiksel çıkarımın temeli",
        "kategori": "veri_bilimi",
        "anahtar": ["hipotez testi", "p değeri", "anlamlılık", "güven aralığı", "örneklem",
                    "h0", "boş hipotez", "istatistik", "tip 1 hata"],
        "icerik": (
            "Hipotez testi, bir boş hipotez (H0) altında gözlenen kadar veya daha uç bir sonucun "
            "olasılığını hesaplar; bu olasılık p değeridir. Küçük p değeri H0'ın verilerle uyumsuz "
            "olduğunu gösterir, hipotezin doğruluk olasılığını vermez. 0,05 gibi eşikler "
            "gelenektir, doğa yasası değildir. Güven aralığı etki büyüklüğü hakkında p değerinden "
            "daha fazla bilgi taşır. Tip 1 hata gerçekte doğru olan H0'ı reddetmektir."
        ),
    },
    {
        "baslik": "Model kurma ve doğrulama",
        "kategori": "veri_bilimi",
        "anahtar": ["overfitting", "aşırı öğrenme", "çapraz doğrulama", "cross validation",
                    "eğitim test ayrımı", "regularizasyon", "bias variance", "yanlılık varyans"],
        "icerik": (
            "Aşırı öğrenme, modelin eğitim verisindeki gürültüyü de öğrenip yeni veride "
            "başarısızlaşmasıdır. Panzehiri: eğitim/doğrulama/test ayrımı, k-katlı çapraz "
            "doğrulama, düzenlileştirme (L1/L2), erken durdurma ve model sadeliği. Yanlılık-varyans "
            "dengesi bu kararların çerçevesidir: basit model yüksek yanlılık, karmaşık model yüksek "
            "varyans üretir."
        ),
    },
    {
        "baslik": "Sınıflandırma metrikleri ve dengesiz veri",
        "kategori": "veri_bilimi",
        "anahtar": ["doğruluk", "accuracy", "precision", "recall", "f1", "roc", "auc",
                    "karmaşıklık matrisi", "dengesiz veri", "metrik seçimi"],
        "icerik": (
            "Dengesiz veri setlerinde doğruluk (accuracy) yanıltıcıdır: yüzde 99'u negatif olan bir "
            "veride her şeye negatif diyen model yüzde 99 doğruluk alır. Kesinlik (precision) "
            "pozitif dediklerimizin ne kadarının doğru olduğunu, duyarlılık (recall) gerçek "
            "pozitiflerin ne kadarını yakaladığımızı ölçer. F1 ikisinin harmonik ortalamasıdır. "
            "ROC-AUC eşikten bağımsız ayırt etme gücünü verir."
        ),
    },
    {
        "baslik": "Zaman serileri",
        "kategori": "veri_bilimi",
        "anahtar": ["zaman serisi", "arima", "mevsimsellik", "trend", "durağanlık",
                    "otokorelasyon", "tahmin", "forecast", "adf testi"],
        "icerik": (
            "Zaman serisi analizi, gözlemlerin bağımsız olmadığı verilerle ilgilenir. Seri trend, "
            "mevsimsellik ve artık bileşenlerine ayrılır. Klasik ARIMA yaklaşımı durağanlık "
            "gerektirir; durağanlık fark alma ile sağlanır ve ADF gibi testlerle sınanır. Zaman "
            "serisinde veri rastgele bölünmez, doğrulama ileriye doğru kayan pencerelerle yapılır."
        ),
    },
    {
        "baslik": "RAG mimarisi ve vektör arama",
        "kategori": "veri_bilimi",
        "anahtar": ["rag", "retrieval augmented generation", "vektör veritabanı", "embedding",
                    "gömme", "kosinüs benzerliği", "chunk", "parçalama", "chroma", "faiss",
                    "halüsinasyon"],
        "icerik": (
            "RAG (Retrieval-Augmented Generation), dil modeline cevabı yazmadan önce ilgili "
            "belgeleri getirip bağlam olarak veren mimaridir. Belgeler parçalara bölünür, her parça "
            "embedding ile vektöre dönüşür ve vektör veritabanında saklanır. Soru da vektöre "
            "çevrilir, kosinüs benzerliğiyle en yakın parçalar bulunur. Parça boyutu kritiktir: çok "
            "küçük parça bağlamı koparır, çok büyük parça gürültü taşır. RAG halüsinasyonu tamamen "
            "bitirmez, kaynağa bağlar."
        ),
    },
    {
        "baslik": "Dil modellerinin çalışma mantığı",
        "kategori": "veri_bilimi",
        "anahtar": ["transformer", "attention", "dikkat mekanizması", "llm", "token", "parametre",
                    "ince ayar", "fine tuning", "prompt", "bağlam penceresi", "sıcaklık"],
        "icerik": (
            "Modern dil modelleri 2017'de yayımlanan 'Attention Is All You Need' makalesindeki "
            "Transformer mimarisine dayanır. Metin token'lara ayrılır, dikkat mekanizması her "
            "token'ın diğerleriyle ilişkisini ağırlıklandırır. Model bir sonraki token'ı olasılıkla "
            "tahmin eder; bu yüzden akıcı ama yanlış cevap üretebilir. Davranış üç yolla "
            "şekillendirilir: istem mühendisliği, bağlam verme (RAG) ve ince ayar. Bağlam penceresi "
            "modelin aynı anda görebildiği token miktarıdır."
        ),
    },

    # ══════════════════════════ TÜRKİYE ══════════════════════════
    {
        "baslik": "Türkiye'de yapay zeka politikası",
        "kategori": "turkiye",
        "anahtar": ["ulusal yapay zeka stratejisi", "dijital dönüşüm ofisi", "cumhurbaşkanlığı",
                    "sanayi ve teknoloji bakanlığı", "politika", "strateji belgesi", "türkiye yz"],
        "icerik": (
            "Türkiye'nin Ulusal Yapay Zeka Stratejisi, Cumhurbaşkanlığı Dijital Dönüşüm Ofisi ile "
            "Sanayi ve Teknoloji Bakanlığı tarafından hazırlanır ve yürütülür. Belge; nitelikli "
            "istihdam, yerli teknoloji, veri paylaşımı ve etik başlıklarını kapsar. Strateji "
            "belgeleri dönemsel olarak yenilenir, güncel sürüm ve hedefler için resmî kaynak "
            "kontrol edilmelidir."
        ),
    },
    {
        "baslik": "TEKNOFEST ve teknoloji yarışmaları",
        "kategori": "turkiye",
        "anahtar": ["teknofest", "t3 vakfı", "yarışma", "takım", "başvuru", "havacılık uzay",
                    "yapay zeka yarışması", "milli teknoloji"],
        "icerik": (
            "TEKNOFEST, T3 Vakfı ve Sanayi ve Teknoloji Bakanlığı yürütücülüğünde düzenlenen "
            "havacılık, uzay ve teknoloji festivalidir. Onlarca yarışma kategorisi vardır ve yapay "
            "zeka ile veri odaklı kategoriler üniversite topluluklarının en yoğun katıldığı "
            "alanlardandır. Başvurular takım halinde yapılır, kategori listesi ve takvim her yıl "
            "değişir; güncel bilgi için resmî siteye bakılmalıdır."
        ),
    },
    {
        "baslik": "TÜBİTAK öğrenci destek programları",
        "kategori": "turkiye",
        "anahtar": ["tübitak", "2209", "2209-a", "2242", "bideb", "1512", "bigg", "proje desteği",
                    "burs", "araştırma projesi", "girişimcilik"],
        "icerik": (
            "TÜBİTAK'ın lisans öğrencilerine yönelik başlıca kanalları: 2209-A Üniversite "
            "Öğrencileri Araştırma Projeleri Destek Programı, 2242 Üniversite Öğrencileri Araştırma "
            "Proje Yarışmaları ve girişimcilik tarafında 1512 BiGG programı. Bunlar akademik "
            "seminer ve Ar-Ge çalışmalarını somut çıktıya çevirmek isteyen topluluk üyeleri için "
            "doğal başvuru kapılarıdır. Çağrı takvimleri yıl içinde değişir."
        ),
    },
    {
        "baslik": "KVKK ve veri koruma",
        "kategori": "turkiye",
        "anahtar": ["kvkk", "kişisel veri", "6698", "aydınlatma metni", "açık rıza", "veri sorumlusu",
                    "gizlilik", "hukuk", "veri işleme"],
        "icerik": (
            "Türkiye'de kişisel verilerin işlenmesi 6698 sayılı Kişisel Verilerin Korunması "
            "Kanunu'na tabidir. Temel yükümlülükler: hukuka uygun işleme sebebine dayanmak, "
            "aydınlatma yükümlülüğünü yerine getirmek, gerekli hallerde açık rıza almak, veriyi "
            "amaçla sınırlı ve ölçülü tutmak. Etkinlik kayıt formları, fotoğraf paylaşımı ve üye "
            "listeleri de bu kapsamdadır; topluluk çalışmalarında pratik karşılığı budur."
        ),
    },
    {
        "baslik": "Türkiye'de hesaplama ve veri altyapısı",
        "kategori": "turkiye",
        "anahtar": ["truba", "ulakbim", "yüksek başarımlı hesaplama", "gpu", "sunucu",
                    "hesaplama gücü", "açık veri", "tüik", "veri kaynağı"],
        "icerik": (
            "TÜBİTAK ULAKBİM bünyesindeki TRUBA, akademik kullanıcılara yüksek başarımlı hesaplama "
            "kaynağı sağlar ve üniversite projelerinde model eğitimi için başvurulabilecek ulusal "
            "altyapıdır. Kamu verisi tarafında TÜİK ve kurumların açık veri portalları, veri bilimi "
            "projelerinin yerli veri ihtiyacını karşılayan ana kaynaklardır."
        ),
    },

    # ══════════════════════════ GLOBAL ══════════════════════════
    {
        "baslik": "Yapay zeka regülasyonu",
        "kategori": "global",
        "anahtar": ["eu ai act", "avrupa birliği", "regülasyon", "gdpr", "risk temelli",
                    "yasak uygulamalar", "uyumluluk", "etik", "yönetişim"],
        "icerik": (
            "Avrupa Birliği Yapay Zeka Yasası (EU AI Act), sistemleri risk seviyesine göre "
            "sınıflandıran ilk kapsamlı yapay zeka düzenlemesidir: kabul edilemez riskli "
            "uygulamalar yasaklanır, yüksek riskli sistemlere şeffaflık, veri kalitesi ve insan "
            "gözetimi yükümlülükleri getirilir. Veri tarafında GDPR çerçevesi geçerlidir. Yürürlük "
            "takvimi kademelidir; güncel durum için resmî kaynak kontrol edilmelidir."
        ),
    },
    {
        "baslik": "Yapay zekada etik ve güvenlik başlıkları",
        "kategori": "global",
        "anahtar": ["etik", "önyargı", "bias", "adalet", "şeffaflık", "açıklanabilirlik",
                    "xai", "hizalama", "alignment", "deepfake", "telif"],
        "icerik": (
            "Tartışmanın kalıcı başlıkları: veri kaynaklı önyargı ve ayrımcılık, kararların "
            "açıklanabilirliği (XAI), model çıktısının doğrulanabilirliği, sentetik medya ve "
            "deepfake kaynaklı bilgi kirliliği, eğitim verisinde telif, gizlilik ve modellerin "
            "insan amaçlarıyla hizalanması. Teknik bir topluluk için bunlar felsefi süs değil, "
            "proje tasarımına giren mühendislik kısıtlarıdır."
        ),
    },
    {
        "baslik": "Ekosistem: araçlar, platformlar, konferanslar",
        "kategori": "global",
        "anahtar": ["hugging face", "kaggle", "github", "açık kaynak", "neurips", "icml", "iclr",
                    "cvpr", "arxiv", "papers with code", "topluluk kaynakları", "nereden öğrenirim"],
        "icerik": (
            "Öğrenme ve üretim ekosisteminin sabit adresleri: model ve veri seti paylaşımı için "
            "Hugging Face, yarışma ve veri seti pratiği için Kaggle, kod için GitHub, ön baskı "
            "makaleler için arXiv. Alanın belirleyici konferansları NeurIPS, ICML, ICLR ve görüntü "
            "işlemede CVPR'dir. Bir topluluk üyesi için en hızlı ilerleme yolu, okuduğu makaleyi "
            "küçük bir uygulamaya çevirip açık kaynak paylaşmaktır."
        ),
    },
    {
        "baslik": "Üretimdeki yapay zeka: MLOps",
        "kategori": "global",
        "anahtar": ["mlops", "üretim ortamı", "deployment", "model izleme", "drift", "veri kayması",
                    "sürüm", "api", "docker", "ölçekleme"],
        "icerik": (
            "Bir modelin eğitilmesi işin küçük kısmıdır. MLOps; veri hattı, sürümleme, otomatik "
            "test, dağıtım, izleme ve geri bildirim döngüsünü kapsar. Üretimdeki en yaygın sessiz "
            "arıza veri kaymasıdır (drift): gerçek dünya verisi eğitim verisinden uzaklaşır ve "
            "başarım hata vermeden düşer. Bu yüzden izleme, doğruluk kadar önemlidir."
        ),
    },
    {
        "baslik": "Model sürümleri hakkında uyarı",
        "kategori": "global",
        "anahtar": ["hangi model", "en iyi model", "gpt", "gemini", "claude", "llama", "sürüm",
                    "fiyat", "kıyaslama", "benchmark", "en yeni", "güncel model"],
        "icerik": (
            "Dil modeli sürümleri, fiyatları ve kıyaslama sonuçları haftalar içinde değişir. Bu "
            "bilgi bankası bu tür oynak verileri tutmaz. Kullanıcı hangi modelin daha iyi olduğunu, "
            "fiyatını veya en yeni sürümü sorarsa ezberden cevap verilmez; güncel arama katmanı "
            "kullanılır veya bilginin doğrulanması gerektiği söylenir."
        ),
    },
]


def belge_metni(kayit: dict) -> str:
    """Bir kaydı, anahtar kelimeleri de embedding'e girecek şekilde metne çevirir."""
    anahtarlar = ", ".join(kayit["anahtar"])
    return (
        f"[{kayit['kategori'].upper()}] {kayit['baslik']}\n"
        f"ANAHTAR KELİMELER: {anahtarlar}\n"
        f"{kayit['icerik']}"
    )


def tum_metin() -> str:
    """Bankanın tamamı — sürüm hash'i almak için kullanılır."""
    return "\n\n".join(belge_metni(k) for k in KAYITLAR)


def istatistik() -> dict:
    sayim: dict[str, int] = {}
    for k in KAYITLAR:
        sayim[k["kategori"]] = sayim.get(k["kategori"], 0) + 1
    return {"kayit": len(KAYITLAR), "kategori": sayim, "surum": BANKA_SURUMU}
