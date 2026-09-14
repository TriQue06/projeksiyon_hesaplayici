/* ════════════════════════════════════════════════════════════════════════════
   İNFOGRAFİK STÜDYOSU
   ---------------------------------------------------------------------------
   Ekran görüntüsü almak yerine, projeksiyonun o anki sonucundan SIFIRDAN bir
   infografik belgesi kurar. Sahne sabit piksel ölçüsünde (1080x1350, 1920x1080,
   1080x1080) çizilir; önizleme yalnızca ölçeklenmiş bir görüntüsüdür. Böylece
   çıktı ekran boyutundan, panellerin açık/kapalı olmasından ve tarayıcı
   yakınlaştırmasından tamamen bağımsızdır.

   Değişim (Δ) değerleri kullanıcının yüklediği KIYAS PROJEKSİYONUNDAN gelir;
   sabit bir seçim yılı değil. Kıyas yüklü/etkin değilse Δ hiç gösterilmez.

   Kişiselleştirme bilinçli olarak yok: tek tasarım, üç format, bir dışa aktarma.

   Bağımlılık: index.html'deki globaller (globalResults, compareResults,
   getPartyColor, createParliamentArch…) ve dışa aktarma için html2canvas.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

const IG = window.Infografik = {};

/* index.html'deki durum değişkenleri `let` ile tanımlandığı için window üzerinde
   DEĞİLDİR; sözlüksel global kapsamda dururlar. Bu yüzden window.X yerine
   doğrudan ada erişilir, tanımsızlık typeof ile korunur. */
const g = {
    get sonuc()      { return typeof globalResults !== 'undefined' ? globalResults : {}; },
    get partiler()   { return typeof extraParties !== 'undefined' ? extraParties : []; },
    get ittifaklar() { return typeof electoralAlliances !== 'undefined' ? electoralAlliances : []; },
    get diger()      { return typeof digerGroups !== 'undefined' ? digerGroups : []; },
    get yaySira()    { return typeof parliamentOrderOverride !== 'undefined' ? parliamentOrderOverride : []; },
    get kiyasAcik()  { return typeof compareEnabled !== 'undefined' && compareEnabled
                              && typeof compareResults !== 'undefined' && !!compareResults; },
    get kiyasAd()    { return typeof compareLabel !== 'undefined' ? compareLabel : ''; },
    get kiyasPartiler() { return typeof compareParties !== 'undefined' ? (compareParties || []) : []; },
    /* "Seçerek Toplu İncele" açık ve en az bir çevre seçiliyse infografik de o
       kapsama iner: oy oranları, vekil dağılımı ve kıyas farkları yalnız bu
       çevrelerden hesaplanır. Seçim yoksa null → ülke geneli. */
    get seciliCevreler() {
        if (typeof isSelectionModeActive === 'undefined' || !isSelectionModeActive) return null;
        if (typeof selectedDistricts === 'undefined' || !selectedDistricts.size) return null;
        return [...selectedDistricts];
    }
};

/* ── Yardımcılar ──────────────────────────────────────────────────────────── */
const kacis = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sayi = n => Math.round(n).toLocaleString('tr-TR');
const oran = (n, basamak) => Number(n).toFixed(basamak === undefined ? 2 : basamak).replace('.', ',');

/* Türkçe büyük harf: I/i ve İ/ı kuralı. CSS text-transform bunu bilmez. */
const trUst = s => String(s || '').replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();

/* ════════════════════════════════════════════════════════════════════════════
   1. SABİT TASARIM
   Tek kimlik: koyu künye bandı + beyaz gövde. Kullanıcıya açılan tek seçim
   formattır; geri kalan her şey burada sabittir.
   ════════════════════════════════════════════════════════════════════════════ */
const TEMA = {
    koyu: '#14171C',            // künye bandı
    baslikYazi: '#FFFFFF',
    zemin: '#FFFFFF',
    metin: '#14171C',
    gri: '#7A8290',
    cizgi: '#E6E8EC',
    vurgu: '#F0B429',
    yesil: '#1BAB52', yesilZemin: '#E7F6EC',
    kirmizi: '#C7352E', kirmiziZemin: '#FDECEC',
    notr: '#98A0AE', notrZemin: '#F0F1F4',
    // Kıyasta karşılığı olmayan parti: değerinin tamamı artış sayılır.
    yeni: '#00ADE1', yeniZemin: '#E4F6FC',
    haritaKontur: '#FFFFFF',
    haritaKonturKalinlik: 1.2,
    sans: "'Product Sans', 'Poppins', 'Segoe UI', system-ui, sans-serif"
};

const METIN = {
    marka: 'PGM PROJEKSİYON',
    kicker: 'Genel Seçim Simülasyonu',
    oyBaslik: 'PARTİ OY ORANLARI',
    mvBaslik: 'MİLLETVEKİLİ DAĞILIMI',
    altbilgi: 'PGM Projeksiyon'
};

/* Grup kurma eşiği: altında kalan partiler piktogram bloğu yerine kompakt
   listede toplanır. */
const GRUP_ESIGI = 20;
/* Seçerek toplu incelemede noktalarla gösterilen parti sayısı. */
const KAPSAM_NOKTALI = 5;

/* Oy oranı listesinde kaç satır. Sınırsız bırakılınca 20'yi aşan parti listesi
   tuvale sığmıyor ve otomatik ölçek her şeyi okunmaz hâle getirene kadar
   küçültüyordu. On satır, hem oranların hem çubukların rahat okunduğu ölçü. */
const OY_SATIR = 10;

/* Klasik çıktı ayrı bir düzen değil, ekrandaki panellerin fotoğrafı; bu
   yüzden FORMATLAR'da değil, format şeridinde ayrı bir seçenek olarak durur.
   1920x1080 çizilip 16:10'a kırpılır → 1x = 1728x1080. */
const KLASIK = { ad: 'Klasik', en: 1728, boy: 1080 };

IG.FORMATLAR = {
    // Dikeyde harita bandı biraz alçaltıldı; boşalan yükseklik alttaki satıra,
    // oradan da parlamento yayına gidiyor (yay flex payı yükseltildi).
    dikey: { ad: 'Dikey 4:5 · 1080×1350',  en: 1080, boy: 1350, duzen: 'dikey',
             ol: 1,    kenar: 30, aralik: 20, haritaPay: 0.40, yayPay: 2.2, yayMin: 232 },
    // Yan/orta sütun oranı, dar (1:1.15) ve geniş (1:1.95) denemelerin ortası.
    yatay: { ad: 'Yatay 16:9 · 1920×1080', en: 1920, boy: 1080, duzen: 'yatay',
             ol: 1.06, kenar: 38, aralik: 24, haritaPay: 0.49, yayPay: 1.0,
             yanPay: 1, ortaPay: 1.55, yayMin: 130 },
    // Karede harita sütunu bir tık geniş, parlamento sütunu bir tık dar.
    // Karede harita sütunu bir tık daha geniş; fazlalık parlamento sütunundan
    // kısılır, toplam genişlik değişmediği için düzen aynı kalır.
    kare:  { ad: 'Kare 1:1 · 1080×1080',   en: 1080, boy: 1080, duzen: 'kare',
             ol: 0.95, kenar: 28, aralik: 16, haritaPay: 1, yayPay: 1,
             haritaSutun: 1.18, yaySutun: 0.82, yayMin: 130 }
};

const MIN_OL = 0.5;

/* ════════════════════════════════════════════════════════════════════════════
   2. VERİ TOPLAMA
   ════════════════════════════════════════════════════════════════════════════ */
function partiRenk(ad) {
    try { return getPartyColor(ad); } catch (e) { return '#888888'; }
}

/* Partinin bağlı olduğu ittifak (adı ve rengi) — oy listesinde parantez içinde
   gösterilir. "Diğer" grubuna düşen satırlar ittifak etiketi almaz. */
function ittifakBilgisi(ad) {
    const digerAdlari = new Set(g.diger.map(d => d.name));
    if (digerAdlari.has(ad)) return null;
    const a = g.ittifaklar.find(x => x.isEnabled !== false && (x.members || []).includes(ad));
    if (!a) return null;
    return { ad: a.name, renk: (a.color && a.color !== '#888888') ? a.color : partiRenk(ad) };
}

/* Kıyas projeksiyonundaki karşılığı: { mv, pct } ya da null.
   kapsam verilirse (seçili çevreler) kıyas da yalnız o çevrelerden toplanır —
   compareStatsFor ikinci argüman olarak çevre listesi alıyor. */
function kiyasKaydi(ad, kapsam) {
    if (!g.kiyasAcik || typeof compareStatsFor !== 'function') return null;
    try { return compareStatsFor(ad, kapsam || null); } catch (e) { return null; }
}

/* Dar bölge modu index.html'de yaşıyor; infografik onu okur ama zorunlu
   kılmaz (eski sürümlerde tanımsız olabilir). */
function darBolgeMu() {
    return typeof darBolgeAcik !== 'undefined' && darBolgeAcik
        && typeof darBolgeSandalyeleri === 'function';
}

IG.veriTopla = function () {
    const res = g.sonuc;
    const kapsam = g.seciliCevreler;              // null = ülke geneli
    let toplamOy = 0, toplamKoltuk = 0;
    const partiOy = {}, partiKoltuk = {};

    (kapsam || Object.keys(res)).forEach(d => {
        const r = res[d];
        if (!r) return;
        const dd = getDisplayData(r);
        toplamKoltuk += r.seats || 0;
        if (!r.isMilliBakiye) {
            toplamOy += r.totalVotes || 0;
            Object.entries(dd.rawVotes || {}).forEach(([p, v]) => { partiOy[p] = (partiOy[p] || 0) + v; });
        }
        Object.entries(dd.mvs || {}).forEach(([p, s]) => { partiKoltuk[p] = (partiKoltuk[p] || 0) + s; });
    });

    // Dar bölge: sandalye = ilçe sayısı, her ilçe kendi birincisine.
    // Nispi temsil sonucunun üstüne yazılır; oy toplamları değişmez.
    // Seçim kipi açıkken dar bölge sayımı ülke geneli kaldığı için iki ölçü
    // birbirini tutmaz; o durumda nispi temsil sonucu korunur.
    if (darBolgeMu() && !kapsam) {
        const db = darBolgeSandalyeleri();
        if (db && db.toplam) {
            Object.keys(partiKoltuk).forEach(k => { delete partiKoltuk[k]; });
            Object.assign(partiKoltuk, db.say);
            toplamKoltuk = db.toplam;
        }
    }

    const yap = ad => {
        const oy = partiOy[ad] || 0;
        const pct = toplamOy > 0 ? oy / toplamOy * 100 : 0;
        const koltuk = partiKoltuk[ad] || 0;
        const k = kiyasKaydi(ad, kapsam);
        return {
            ad, renk: partiRenk(ad), oy, pct, koltuk,
            ittifak: ittifakBilgisi(ad),
            // Sıfırdan geliyor mu? Karşılığı hiç yoksa da, karşılığı var ama
            // değeri sıfırsa da aynı şey: yoktan var olmuş. İki ölçüt ayrı
            // değerlendirilir; bir parti oy almış ama vekil çıkaramamış olabilir.
            yeniOy: !k || (k.pct || 0) < 0.005,
            yeniKoltuk: !k || (k.mv || 0) === 0,
            dOy: k ? pct - k.pct : pct,
            dKoltuk: k ? koltuk - k.mv : koltuk,
            kiyasKoltuk: k ? k.mv : null
        };
    };

    const liste = Object.keys(partiOy).filter(p => (partiOy[p] || 0) > 0).map(yap);
    liste.sort((a, b) => b.pct - a.pct);

    // Kıyasta vekili olup bugün hiç oy almayan partiler de anılmalı.
    // Ama kıyastaki bir ad, bugünkü bir partinin karşılığı olarak EŞLEŞTİRİLMİŞSE
    // (örn. "XP" artık "X Partisi") ayrı bir kayıp parti gibi listelenmemeli.
    if (g.kiyasAcik) {
        const varOlan = new Set(liste.map(p => p.ad));
        const eslenmis = new Set();
        g.partiler.forEach(ep => { if (ep.compareParty) eslenmis.add(ep.compareParty); });
        liste.forEach(p => {
            if (typeof compareKeyOf === 'function') {
                const k = compareKeyOf(p.ad);
                if (k) eslenmis.add(k);
            }
        });
        g.kiyasPartiler.forEach(ad => {
            if (varOlan.has(ad) || eslenmis.has(ad)) return;
            const k = kiyasKaydi(ad, kapsam);
            if (!k || !k.mv) return;
            liste.push({ ad, renk: partiRenk(ad), oy: 0, pct: 0, koltuk: 0,
                         yeniOy: false, yeniKoltuk: false,
                         ittifak: null, dOy: -k.pct, dKoltuk: -k.mv, kiyasKoltuk: k.mv });
        });
    }

    const koltuklu   = liste.filter(p => p.koltuk > 0).sort((a, b) => b.koltuk - a.koltuk);
    /* Ülke genelinde noktalı gösterim Meclis'te grup kurma eşiğine (20 MV)
       bağlı. Seçerek toplu incelemede bu eşiğin anlamı yok — birkaç ilde kimse
       20'ye ulaşmayabilir — o yüzden en çok vekili olan ilk 5 parti noktalarla,
       kalanlar yalnız sayıyla gösterilir. */
    const gruplu     = kapsam ? koltuklu.slice(0, KAPSAM_NOKTALI)
                              : koltuklu.filter(p => p.koltuk >= GRUP_ESIGI);
    const grupsuz    = kapsam ? koltuklu.slice(KAPSAM_NOKTALI)
                              : koltuklu.filter(p => p.koltuk < GRUP_ESIGI);
    const yitirenler = liste.filter(p => p.koltuk === 0 && p.kiyasKoltuk > 0)
                            .sort((a, b) => b.kiyasKoltuk - a.kiyasKoltuk);

    // Parlamento sırası: kullanıcının belirlediği sıra varsa ona uyulur
    const sira = {};
    const varsayilan = koltuklu.map(p => p.ad);
    const ov = g.yaySira;
    const nihai = ov.length
        ? [...ov.filter(p => partiKoltuk[p] > 0), ...varsayilan.filter(p => !ov.includes(p))]
        : varsayilan;
    nihai.forEach(k => { if (partiKoltuk[k]) sira[k] = partiKoltuk[k]; });

    return {
        toplamOy, toplamKoltuk,
        liste: liste.filter(p => p.pct > 0).slice(0, OY_SATIR),
        gruplu, grupsuz, yitirenler,
        yaySira: sira,
        kiyasVar: g.kiyasAcik,
        kiyasAd: g.kiyasAd,
        // Çıktının hangi kapsamı anlattığı: seçim kipi açıkken okuyucu ülke
        // geneli sanmasın diye bölüm başlığına yazılır.
        kapsamAdet: kapsam ? kapsam.length : 0
    };
};

/* ════════════════════════════════════════════════════════════════════════════
   3. STİL
   ════════════════════════════════════════════════════════════════════════════ */
const STIL = `
.ig-sahne { position: relative; overflow: hidden; box-sizing: border-box;
    background: var(--ig-zemin); color: var(--ig-metin); font-family: var(--ig-sans);
    display: flex; flex-direction: column; -webkit-font-smoothing: antialiased; }
.ig-sahne * { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Künye bandı ── */
.ig-baslik { background: var(--ig-koyu); color: var(--ig-baslik-yazi); text-align: center;
    padding: calc(22px * var(--ig-ol)) var(--ig-kenar) calc(19px * var(--ig-ol)); flex: 0 0 auto; }
.ig-marka { font-weight: 800; letter-spacing: -0.4px; line-height: 1.16;
    font-size: calc(34px * var(--ig-ol)); }
.ig-kicker { margin-top: calc(7px * var(--ig-ol)); font-size: calc(10.5px * var(--ig-ol));
    font-weight: 800; letter-spacing: calc(2.4px * var(--ig-ol)); color: var(--ig-yeni); }

/* ── Gövde iskeleti ── */
.ig-govde { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;
    padding: var(--ig-aralik) var(--ig-kenar); gap: var(--ig-aralik); overflow: hidden; }
.ig-satir { display: flex; gap: var(--ig-aralik); min-height: 0; }
.ig-sutun { display: flex; flex-direction: column; gap: var(--ig-aralik);
    min-width: 0; min-height: 0; overflow: hidden; }
.ig-ayrac { width: 1px; background: var(--ig-cizgi); flex: 0 0 1px; align-self: stretch; }

/* ── Bölüm başlığı ── */
.ig-bolum { display: flex; flex-direction: column; min-height: 0; }
.ig-bolum-bas { display: flex; align-items: baseline; justify-content: space-between;
    gap: calc(10px * var(--ig-ol)); padding-bottom: calc(7px * var(--ig-ol));
    border-bottom: 1px solid var(--ig-cizgi); margin-bottom: calc(11px * var(--ig-ol)); }
.ig-bolum-bas h3 { font-size: calc(10.5px * var(--ig-ol)); font-weight: 800;
    letter-spacing: calc(1.3px * var(--ig-ol)); color: var(--ig-metin); }
.ig-bolum-bas em { font-style: normal; font-size: calc(9px * var(--ig-ol)); font-weight: 700;
    letter-spacing: calc(1px * var(--ig-ol)); color: var(--ig-gri); white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; max-width: 58%; }
.ig-mini { font-size: calc(9px * var(--ig-ol)); font-weight: 800;
    letter-spacing: calc(1.2px * var(--ig-ol)); color: var(--ig-gri);
    margin-bottom: calc(7px * var(--ig-ol)); }

/* ── Harita ── */
.ig-harita { display: flex; align-items: stretch; justify-content: center;
    min-height: calc(190px * var(--ig-ol)); }
.ig-harita-tuval { flex: 1 1 auto; min-width: 0; min-height: 0; height: 100%;
    display: flex; align-items: center; justify-content: center; overflow: hidden; }
.ig-harita-tuval svg { width: 100%; height: 100%; display: block; }
/* !important şart: uygulamanın harita kuralları (#svgMapWrapper path) kontur
   rengini ve kalınlığını !important ile yazıyor; klonda ancak böyle ezilir. */
.ig-harita-tuval svg path, .ig-harita-tuval svg polygon,
.ig-harita-tuval svg polyline, .ig-harita-tuval svg rect {
    stroke: var(--ig-harita-kontur) !important;
    stroke-width: var(--ig-harita-kontur-kalinlik) !important;
    stroke-linejoin: round; shape-rendering: geometricPrecision;
}
.ig-harita-tuval svg #mp-dots-layer circle {
    stroke: #1c1e21 !important; stroke-width: 1.15 !important;
}

/* ── Oy oranı satırı ── */
.ig-oy { display: flex; flex-direction: column; }
.ig-oy-satir { display: flex; align-items: center; gap: calc(10px * var(--ig-ol));
    padding: calc(7px * var(--ig-ol)) 0; border-bottom: 1px solid var(--ig-cizgi); }
.ig-oy-satir:last-child { border-bottom: 0; }
/* Parti logoları her yerde daire. */
.ig-rozet { width: calc(33px * var(--ig-ol)); height: calc(33px * var(--ig-ol)); flex: 0 0 auto; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; overflow: hidden; }
.ig-rozet svg { width: 100%; height: 100%; display: block; }
.ig-rozet > span { width: 100% !important; height: 100% !important; padding: 12%; }
.ig-rozet var { font-style: normal; font-weight: 900; color: #fff;
    font-size: calc(12px * var(--ig-ol));
    width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.ig-oy-orta { flex: 1 1 auto; min-width: 0; }
.ig-oy-ad { font-size: calc(14.5px * var(--ig-ol)); font-weight: 800; line-height: 1.15;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ig-oy-ad i { font-style: normal; font-weight: 800; font-size: calc(11px * var(--ig-ol)); }
.ig-bar { margin-top: calc(5px * var(--ig-ol)); height: calc(7px * var(--ig-ol));
    background: #EFEFF2; overflow: hidden; border-radius: 0; }
.ig-bar i { display: block; height: 100%; }
.ig-oy-pct { flex: 0 0 auto; text-align: right; font-weight: 900; line-height: 1.12;
    font-size: calc(29px * var(--ig-ol)); letter-spacing: -0.5px; white-space: nowrap; }
.ig-oy-pct s { text-decoration: none; font-size: calc(15px * var(--ig-ol)); font-weight: 800; }
/* Kıyas çipi SABİT genişlikte: değer uzayınca çip büyüyüp soldaki oy
   çubuğunu kısaltmasın. 72 px içerik + 8'er px iç boşluk, önceki asgari
   genişlikle birebir; en uzun değer ("↑ 100,00") de sığar. */
.ig-delta { flex: 0 0 auto; width: calc(72px * var(--ig-ol)); box-sizing: content-box;
    overflow: hidden; text-align: center;
    font-size: calc(12.5px * var(--ig-ol)); font-weight: 800;
    padding: calc(5px * var(--ig-ol)) calc(8px * var(--ig-ol)); white-space: nowrap; }

/* ── Parlamento yayı ── */
.ig-yay { position: relative; display: flex; align-items: flex-end; justify-content: center;
    flex: 1 1 auto; min-height: calc(130px * var(--ig-ol)); }
/* Karede yay, haritayla aynı yatay eksende dursun diye dikeyde ortalanır. */
.ig-yay.ortala { align-items: center; }
.ig-yay.ortala .ig-yay-svg { align-items: center; }
.ig-yay-svg { width: 100%; height: 100%; display: flex; align-items: flex-end; justify-content: center; }
.ig-yay-svg svg { width: 100%; height: 100%; display: block; }
.ig-yay-svg svg circle { stroke: none; }

/* ── Vekil noktaları ── */
.ig-mv { display: flex; flex-direction: column; gap: calc(13px * var(--ig-ol)); }
.ig-mv-blok { display: flex; flex-direction: column; gap: calc(6px * var(--ig-ol)); }
.ig-mv-bas { display: flex; align-items: center; gap: calc(9px * var(--ig-ol)); }
.ig-mv-ad { font-size: calc(14.5px * var(--ig-ol)); font-weight: 800; white-space: nowrap; }
.ig-mv-sayi { margin-left: auto; display: flex; align-items: baseline; gap: calc(4px * var(--ig-ol)); }
.ig-mv-sayi b { font-size: calc(38px * var(--ig-ol)); font-weight: 900; line-height: 1.1; letter-spacing: -1px; }
.ig-mv-sayi span { font-size: calc(9.5px * var(--ig-ol)); font-weight: 800; color: var(--ig-gri); }
.ig-noktalar { display: flex; flex-wrap: wrap; gap: 2px; }
.ig-noktalar svg { display: block; flex: 0 0 auto; }
.ig-mv-not { font-size: calc(9px * var(--ig-ol)); font-weight: 700; color: var(--ig-gri);
    letter-spacing: calc(0.6px * var(--ig-ol)); }

/* ── Kompakt listeler ── */
.ig-kucukListe { display: flex; flex-wrap: wrap; gap: calc(7px * var(--ig-ol)) calc(14px * var(--ig-ol)); }
.ig-kucukListe li { list-style: none; display: flex; align-items: center; gap: calc(6px * var(--ig-ol)); }
.ig-kucukListe .ig-rozet { width: calc(22px * var(--ig-ol)); height: calc(22px * var(--ig-ol)); }
.ig-kucukListe em { font-style: normal; font-size: calc(11.5px * var(--ig-ol)); font-weight: 800; }
.ig-kucukListe i { font-style: normal; font-size: calc(11px * var(--ig-ol)); font-weight: 700; color: var(--ig-gri); }

/* ── Alt bilgi ── */
.ig-altbilgi { flex: 0 0 auto; border-top: 1px solid var(--ig-cizgi);
    padding: calc(13px * var(--ig-ol)) var(--ig-kenar); text-align: center; }
.ig-altbilgi span { font-size: calc(11px * var(--ig-ol)); color: var(--ig-gri); font-weight: 700;
    letter-spacing: calc(0.6px * var(--ig-ol)); }
`;

const STUDYO_STIL = `
#igStudyo { position: fixed; inset: 0; z-index: 99999; display: none; background: var(--bg, #fff); }
#igStudyo.acik { display: flex; }
#igPanel { width: 250px; flex: 0 0 250px; overflow-y: auto; background: var(--surface, #fff);
    border-right: 1px solid var(--border, #e3e3e3); padding: 16px;
    display: flex; flex-direction: column; gap: 13px; }
#igOnizlemeAlan { flex: 1 1 auto; overflow: auto; display: flex; align-items: flex-start;
    justify-content: center; padding: 24px; }
#igOnizleme { transform-origin: top left; box-shadow: 0 8px 40px rgba(0,0,0,.18); }
#igUst { display: flex; align-items: center; gap: 8px; }
#igUst b { font-size: 13px; font-weight: 900; margin-right: auto; }
.ig-etiket { font-size: 10px; font-weight: 800; letter-spacing: .8px;
    color: var(--text-secondary, #5f6368); }
.ig-format { display: flex; flex-direction: column; gap: 5px; }
.ig-format button { text-align: left; padding: 8px 10px; font-size: 11px; font-weight: 700;
    cursor: pointer; border: 1px solid var(--border, #e3e3e3);
    background: var(--surface, #fff); color: inherit; font-family: inherit; }
.ig-format button.aktif { background: var(--primary, #1a73e8); color: #fff;
    border-color: var(--primary, #1a73e8); }
.ig-dugme { font-size: 11px; font-weight: 800; padding: 8px 10px; cursor: pointer;
    border: 1px solid var(--border, #e3e3e3); background: var(--surface, #fff);
    color: inherit; font-family: inherit; }
.ig-dugme.bas { background: var(--primary, #1a73e8); color: #fff; border-color: var(--primary, #1a73e8); }
.ig-not { font-size: 10px; line-height: 1.45; color: var(--text-secondary, #5f6368); }
`;

function stiliKur() {
    if (document.getElementById('ig-stil')) return;
    const st = document.createElement('style');
    st.id = 'ig-stil';
    st.textContent = STIL + STUDYO_STIL;
    document.head.appendChild(st);
}

/* ════════════════════════════════════════════════════════════════════════════
   4. BLOKLAR
   ════════════════════════════════════════════════════════════════════════════ */

/* Parti amblemi: zemin arka plan rengi, amblem logo rengi — projeksiyondaki
   gibi. Rozet zemini partinin ANA renginden bağımsızdır; ana renk logo rengi
   seçilmişse zemin yine arka plan rengi kalır, yoksa amblem görünmez olurdu.
   index.html ikonları açılışta çekip ham SVG olarak tutuyor, ağ isteği yok. */
function rozetZemin(p) {
    try {
        if (typeof partiLogoZemini === 'function') return partiLogoZemini(p.ad) || p.renk;
    } catch (e) { /* yok */ }
    return p.renk;
}

function rozet(p, boyPx) {
    const boy = Math.round(boyPx || 22);
    const zemin = rozetZemin(p);
    let ic = '';
    try {
        if (typeof partyIconInlineSvg === 'function') ic = partyIconInlineSvg(p.ad, '#ffffff', boy) || '';
    } catch (e) { ic = ''; }
    if (ic) return `<div class="ig-rozet" style="background:${zemin};">${ic}</div>`;
    // Logosuz rozette yalnız baş harf (uygulamadaki rozetle aynı kural).
    const bas = trUst(p.ad).match(/[A-ZÇĞİÖŞÜ0-9]/);
    const mono = bas ? bas[0] : '?';
    return `<div class="ig-rozet" style="background:${zemin};"><var>${kacis(mono)}</var></div>`;
}

function deltaCip(d, basamak, okla, yeni) {
    // Kıyasta karşılığı olmayan parti (örn. yeni kurulmuş) için de kutu çizilir;
    // aksi halde sütun hizası bozulup satırlar tırtıklı görünüyordu.
    const esik = basamak === 0 ? 0.5 : 0.005;
    if (d === null || d === undefined) {
        return `<div class="ig-delta" style="background:${TEMA.notrZemin};color:${TEMA.notr};">—</div>`;
    }
    // Sıfırdan gelen parti: tamamı artış, kendi rengiyle işaretlenir.
    // Değeri sıfırsa ya da azalışsa buraya girmez.
    if (yeni && d > 0 && Math.abs(d) >= esik) {
        const m = basamak === 0 ? sayi(Math.abs(d)) : oran(Math.abs(d), basamak);
        return `<div class="ig-delta" style="background:${TEMA.yeniZemin};color:${TEMA.yeni};">${okla ? '▲' : '↑'} ${m}</div>`;
    }
    if (Math.abs(d) < esik) {
        return `<div class="ig-delta" style="background:${TEMA.notrZemin};color:${TEMA.notr};">— ${oran(0, basamak)}</div>`;
    }
    const arti = d > 0;
    const ok = okla ? (arti ? '▲' : '▼') : (arti ? '↑' : '↓');
    const metin = basamak === 0 ? sayi(Math.abs(d)) : oran(Math.abs(d), basamak);
    return `<div class="ig-delta" style="background:${arti ? TEMA.yesilZemin : TEMA.kirmiziZemin};color:${arti ? TEMA.yesil : TEMA.kirmizi};">${ok} ${metin}</div>`;
}

function bolumBas(baslik, baglam) {
    return `<div class="ig-bolum-bas"><h3>${kacis(baslik)}</h3>${baglam ? `<em>${kacis(baglam)}</em>` : ''}</div>`;
}

function blokBaslik() {
    return `<header class="ig-baslik">
        <div class="ig-marka">${kacis(METIN.marka)}</div>
        <div class="ig-kicker">${kacis(METIN.kicker)}</div>
    </header>`;
}

/* Harita: uygulamadaki canlı SVG klonlanır, il renkleri tam doygun yapılır. */
function haritaSvg() {
    // Dar bölgede sonuç ilçe ilçe belirlendiği için infografikte de ilçe
    // haritası yer alır. İlçe SVG'si zaten uygulamada boyanmış durumda
    // (paintIlceMap), o yüzden burada yeniden renklendirmeye gerek yok.
    if (darBolgeMu()) {
        const ilce = document.querySelector('#svgIlceWrapper svg');
        if (ilce) {
            const k = ilce.cloneNode(true);
            k.removeAttribute('width'); k.removeAttribute('height');
            k.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            k.style.cssText = 'width:100%;height:100%;display:block;';
            // Kontur stil sayfasından geliyordu; kopyada satır içi yazılır.
            // İl sınırları (ilçe haritasının üst katmanı) üç kat kalın kalır.
            k.querySelectorAll('path,polygon,polyline,rect').forEach(x => {
                const il = !!x.closest('.il-sinirlari');
                x.style.stroke = '#ffffff';
                x.style.strokeWidth = il ? '1.2px' : '0.4px';
                if (il) x.style.fill = 'none';
                x.style.transition = 'none';
            });
            return k.outerHTML;
        }
    }
    const kaynak = document.querySelector('#svgMapWrapper svg');
    if (!kaynak) return '<div style="color:#c00;font-size:12px;">Harita yüklenmedi</div>';
    const kopya = kaynak.cloneNode(true);
    kopya.removeAttribute('width'); kopya.removeAttribute('height');
    kopya.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    kopya.style.cssText = 'width:100%;height:100%;display:block;';
    // Seçerek toplu incele: yalnız seçili çevreler kalır ve alanı doldurur.
    const kapsam = g.seciliCevreler;
    if (kapsam && typeof haritaKapsamaKirp === 'function')
        haritaKapsamaKirp(kaynak, kopya, new Set(kapsam));

    const res = g.sonuc;
    kopya.querySelectorAll('[data-district-name]').forEach(el => {
        const r = res[el.getAttribute('data-district-name')];
        if (!r) return;
        const dd = getDisplayData(r);
        // Kazanan kuralı uygulamayla ortak: ayarlardaki "İl Rengini Belirleyen".
        const kaz = (typeof cevreKazanani === 'function') ? cevreKazanani(dd) : null;
        if (!kaz) return;
        const renk = partiRenk(kaz);
        el.style.fill = renk;
        el.querySelectorAll('path,polygon,rect,circle').forEach(x => {
            if (x.closest('#mp-dots-layer')) return;
            x.style.fill = renk;
        });
    });
    return kopya.outerHTML;
}

function blokHarita(f, sadeceOlcu, bant) {
    const esnek = bant ? `flex:0 0 ${(f.haritaPay * 100).toFixed(2)}%;`
                       : `flex:${(f.haritaPay * 3).toFixed(2)} 1 0;`;
    // Ölçüm turunda ağır SVG çizilmez; yer tutucu aynı esneme kurallarını taşır.
    if (sadeceOlcu) return `<div class="ig-harita" style="${esnek}"></div>`;
    return `<div class="ig-harita" style="${esnek}">
        <div class="ig-harita-tuval">${haritaSvg()}</div></div>`;
}

function blokOy(veri, ol) {
    const lider = veri.liste.length ? veri.liste[0].pct : 1;
    const satirlar = veri.liste.map(p => {
        const w = lider > 0 ? p.pct / lider * 80 : 0;
        const itt = p.ittifak
            ? ` <i style="color:${p.ittifak.renk};">(${kacis(trUst(p.ittifak.ad))})</i>` : '';
        return `<div class="ig-oy-satir">
            ${rozet(p, 30 * ol)}
            <div class="ig-oy-orta">
                <div class="ig-oy-ad">${kacis(trUst(p.ad))}${itt}</div>
                <div class="ig-bar"><i style="width:${w.toFixed(2)}%;background:${p.renk}"></i></div>
            </div>
            <div class="ig-oy-pct"><s>%</s>${oran(p.pct)}</div>
            ${veri.kiyasVar ? deltaCip(p.dOy, 2, false, p.yeniOy) : ''}
        </div>`;
    }).join('');
    const kapsamNotu = veri.kapsamAdet ? 'SEÇİLİ ' + veri.kapsamAdet + ' ÇEVRE' : '';
    return `<section class="ig-bolum ig-oy">${bolumBas(METIN.oyBaslik, kapsamNotu)}${satirlar}</section>`;
}

/* Gömülü yazı tipi kuralı — bir kez okunur. SVG dışa aktarılırken içine
   konur, aksi halde rasterizasyonda yedek fonta düşüyor. */
let _yaziTipiCss = null;
function yaziTipiCss() {
    if (_yaziTipiCss !== null) return _yaziTipiCss;
    try {
        _yaziTipiCss = (typeof getEmbeddedFontFaceCss === 'function') ? getEmbeddedFontFaceCss() : '';
    } catch (e) { _yaziTipiCss = ''; }
    return _yaziTipiCss;
}

/* Parlamento diyagramı: ana projeksiyondaki panelin TA KENDİSİ kullanılır.
   Toplam vekil sayısı zaten diyagramın içine yazılıyor, ayrı bir katman
   koymuyoruz — eskiden ikisi üst üste binip 600 iki kez görünüyordu. */
function blokYay(veri, f, ortala, sadeceOlcu) {
    if (!veri.toplamKoltuk) return '';
    const kutu = `flex:${f.yayPay} 1 0; min-height:calc(${f.yayMin || 130}px * var(--ig-ol));`;
    // Ölçüm turunda 600 daireli yay klonlanmaz; yer tutucu aynı tabanı taşır.
    if (sadeceOlcu) return `<div class="ig-yay${ortala ? ' ortala' : ''}" style="${kutu}"></div>`;
    let svg = '';
    const canli = document.querySelector('#parliamentChartArea svg');
    if (canli) {
        const k = canli.cloneNode(true);
        k.removeAttribute('style');
        // Karede yay kutunun dikey ORTASINA hizalanır; diğer düzenlerde
        // ayracın hemen üstüne otursun diye alta yaslı kalır.
        k.setAttribute('preserveAspectRatio', ortala ? 'xMidYMid meet' : 'xMidYMax meet');
        svg = k.outerHTML;
    } else {
        try { svg = createParliamentArch(veri.yaySira, veri.toplamKoltuk); } catch (e) { svg = ''; }
    }
    // Etkileşim ve parti filtresinin soldurması çıktıya taşınmamalı.
    svg = svg.replace(/onclick="[^"]*"/g, '')
             .replace(/cursor:pointer;?/g, '')
             .replace(/opacity:\s*0\.15;?/g, '')
             .replace(/fill="var\(--text\)"/g, `fill="${TEMA.metin}"`);
    // SVG rasterize edilirken sayfanın yazı tipine ulaşamıyor ve yedek fonta
    // düşüyordu. Gömülü @font-face SVG'nin İÇİNE kopyalanır.
    svg = svg.replace(/<svg([^>]*)>/, (m, oz) =>
        `<svg${oz}><style>${yaziTipiCss()}text{font-family:'Product Sans',Arial,sans-serif;}</style>`);
    return `<div class="ig-yay${ortala ? ' ortala' : ''}" style="${kutu}">
        <div class="ig-yay-svg">${svg}</div>
    </div>`;
}

/* Vekil noktaları: 1 nokta = 1 milletvekili. Oran (1 figür = 3 vekil) kullanınca
   yuvarlama yüzünden nokta sayısı sandalye sayısını tutmuyordu; birebir eşleme
   bu hata sınıfını tümüyle ortadan kaldırır. Kaybedilenler içi boş noktalarla.

   Nokta CSS kutusu değil, SVG dairesidir. Kısa süre CSS <i> + border-radius
   denendi ve PNG'de silik çıktı: html2canvas yuvarlatılmış kutuyu tuval
   yoluyla çiziyor, 7 px'lik bir daire neredeyse tamamen yumuşatılmış kenardan
   ibaret kalıyordu. SVG daire çıktıda net duruyor — bu blok zaten eskiden de
   SVG'ydi. Ek fayda: tema kuralları svg'yi dışarıda bıraktığı için noktalar
   artık ne köşelenebilir ne gölgesi silinebilir.

   İçi boş nokta kontur çizgisiyle. Eskiden inset gölge kullanılıyordu; sade
   temanın "gölge yok" kuralı ile html2canvas'ın inset gölgeyi desteklememesi
   o noktaları görünmez bırakıyordu. */
function nokta(renk, boy, bos) {
    // Daire kutunun TAMAMINI doldurur (r=5). Eski r=4.6 çapın %8'ini boşa
    // harcıyordu; bu boyutta kaybedilen her piksel doğrudan yumuşatmaya
    // gidiyor. Ölçüm: 7 px'lik noktada tam renkli piksel oranı 1x çıktıda
    // %46,7'den %64,4'e çıkıyor — hem de hiç yer harcamadan.
    return `<svg width="${boy}" height="${boy}" viewBox="0 0 10 10">`
         + (bos ? `<circle cx="5" cy="5" r="4.25" fill="none" stroke="#B9C0CC" stroke-width="1.5"/>`
                : `<circle cx="5" cy="5" r="5" fill="${renk}"/>`)
         + `</svg>`;
}

function noktalar(adet, renk, boy, bos) {
    const bir = nokta(renk, boy, bos);
    let h = '';
    for (let i = 0; i < adet; i++) h += bir;
    return h;
}

function blokVekil(veri, ol) {
    if (!veri.gruplu.length && !veri.grupsuz.length) return '';
    /* Nokta boyu, PNG netliğini belirleyen ASIL etken. "1 figür = 3 vekil"den
       "1 nokta = 1 vekil"e geçince işaretler ~20 px'ten ~7 px'e indi ve çıktıda
       silikleşti: 7 px'lik bir dairenin pikselinin yarısından çoğu yumuşatılmış
       kenar oluyor. Ölçülen tam renkli piksel oranı (1x): 7 px %64 · 9 px %71 ·
       11 px %74. Boyut büyüdükçe otomatik sığdırma tüm ölçeği kıstığı için
       katsayı taranarak seçildi: 8,5'te dikey 8 px ve yatay 9 px'e çıkıyor,
       üstelik iki düzende de genel ölçek hiç düşmüyor; daha büyük katsayılar
       yalnız kareyi küçültüyordu.
       Tam sayı: kesirli genişlik yumuşatmayı ayrıca artırıyor. */
    const boy = Math.max(6, Math.round(8.5 * ol));
    const bosluk = Math.max(2, Math.round(2.4 * ol));

    const bloklar = veri.gruplu.map(p => {
        const kayip = (p.dKoltuk !== null && p.dKoltuk < 0) ? -p.dKoltuk : 0;
        return `<div class="ig-mv-blok">
            <div class="ig-mv-bas">
                ${rozet(p, 30 * ol)}
                <div class="ig-mv-ad">${kacis(trUst(p.ad))}</div>
                ${veri.kiyasVar ? deltaCip(p.dKoltuk, 0, true, p.yeniKoltuk) : ''}
                <div class="ig-mv-sayi"><b style="color:${p.renk}">${sayi(p.koltuk)}</b><span>MV</span></div>
            </div>
            <div class="ig-noktalar" style="gap:${bosluk}px;">${noktalar(p.koltuk, p.renk, boy, false)}${noktalar(kayip, p.renk, boy, true)}</div>
        </div>`;
    }).join('');

    // Grup kuramayanlar (20 vekilin altı; seçim kipinde ilk 5'ten sonrakiler)
    // piktogram yerine tek satırda.
    // Ayrı başlık yok: grup kuramayanlar doğrudan piktogram bloklarının altına,
    // aynı bölümün devamı olarak yazılır.
    const grupsuz = veri.grupsuz.length ? `
        <ul class="ig-kucukListe" style="margin-top:calc(4px * var(--ig-ol));">${veri.grupsuz.map(p => `<li>${rozet(p, 20 * ol)}
            <em>${kacis(trUst(p.ad))}</em><i>${sayi(p.koltuk)} MV</i>
            ${veri.kiyasVar ? deltaCip(p.dKoltuk, 0, true, p.yeniKoltuk) : ''}</li>`).join('')}</ul>` : '';

    const baglam = veri.kiyasVar ? 'ŞUNA GÖRE: ' + trUst(veri.kiyasAd) : '';
    return `<section class="ig-bolum ig-mv">
        ${bolumBas(METIN.mvBaslik, baglam)}
        ${bloklar}${grupsuz}
    </section>`;
}

function blokYitirenler(veri, ol) {
    if (!veri.yitirenler.length) return '';
    return `<section class="ig-bolum"><div class="ig-mini">VEKİLLİĞİNİ YİTİRENLER</div>
        <ul class="ig-kucukListe">${veri.yitirenler.map(p => `<li>${rozet(p, 20 * ol)}
            <em>${kacis(trUst(p.ad))}</em><i>0 MV</i>
            ${deltaCip(p.dKoltuk, 0, true)}</li>`).join('')}</ul></section>`;
}

function blokAltbilgi() {
    return `<footer class="ig-altbilgi"><span>${kacis(METIN.altbilgi)}</span></footer>`;
}

/* ════════════════════════════════════════════════════════════════════════════
   5. SAHNE
   ════════════════════════════════════════════════════════════════════════════ */
function tasmaOlc(sahne) {
    let en = 0;
    sahne.querySelectorAll('.ig-govde, .ig-sutun, .ig-bolum').forEach(e => {
        en = Math.max(en, e.scrollHeight - e.clientHeight);
    });
    return en;
}

/* İçerik tuvale sığana kadar tipografi ölçeğini kısar. Ölçüm turlarında harita
   çizilmez (81 il + 600 nokta klonlamak pahalı); yer tutucu aynı esneme
   kurallarını taşıdığı için sonuç temsilîdir. */
function olcekBul(fmtAd, veri) {
    const f = IG.FORMATLAR[fmtAd];
    for (let i = 0; i < 24; i++) {
        const ol = Math.round(f.ol * (1 - i * 0.035) * 1000) / 1000;
        if (ol < MIN_OL) break;
        const sahne = sahneKur(fmtAd, veri, ol, true);
        const kap = document.createElement('div');
        kap.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;';
        kap.appendChild(sahne);
        document.body.appendChild(kap);
        const t = tasmaOlc(sahne);
        document.body.removeChild(kap);
        if (t <= 1) return ol;
    }
    return MIN_OL;
}

function sahneKur(fmtAd, veri, ol, sadeceOlcu) {
    const f = IG.FORMATLAR[fmtAd] || IG.FORMATLAR.dikey;
    const sahne = document.createElement('div');
    sahne.className = 'ig-sahne';
    sahne.style.cssText = `width:${f.en}px;height:${f.boy}px;`
        + `--ig-koyu:${TEMA.koyu};--ig-baslik-yazi:${TEMA.baslikYazi};--ig-zemin:${TEMA.zemin};`
        + `--ig-metin:${TEMA.metin};--ig-gri:${TEMA.gri};--ig-cizgi:${TEMA.cizgi};`
        + `--ig-vurgu:${TEMA.vurgu};--ig-yeni:${TEMA.yeni};--ig-sans:${TEMA.sans};`
        + `--ig-harita-kontur:${TEMA.haritaKontur};`
        + `--ig-harita-kontur-kalinlik:${TEMA.haritaKonturKalinlik};`
        + `--ig-ol:${ol};--ig-kenar:${f.kenar}px;--ig-aralik:${f.aralik}px;`;

    const M = bant => blokHarita(f, sadeceOlcu, bant);
    const O = () => blokOy(veri, ol);
    const Y = () => blokYay(veri, f, f.duzen === 'kare', sadeceOlcu);
    const V = () => blokVekil(veri, ol);
    const K = () => blokYitirenler(veri, ol);
    const sut = (icerik, pay) => `<div class="ig-sutun" style="flex:${pay} 1 0;">${icerik}</div>`;

    let govde = '';
    if (f.duzen === 'dikey') {
        govde = `<div class="ig-govde">
            ${M(true)}
            <div class="ig-satir" style="flex:1 1 auto;">
                ${sut(O() + Y(), 1)}
                <div class="ig-ayrac"></div>
                ${sut(V() + K(), 1)}
            </div></div>`;
    } else if (f.duzen === 'yatay') {
        govde = `<div class="ig-govde"><div class="ig-satir" style="flex:1 1 auto;">
            ${sut(O(), f.yanPay)}
            <div class="ig-ayrac"></div>
            ${sut(M(true) + Y(), f.ortaPay)}
            <div class="ig-ayrac"></div>
            ${sut(V() + K(), f.yanPay)}
        </div></div>`;
    } else {
        // Kare: dört çeyrek. Sol üst harita, sağ üst parlamento,
        // sol alt oy oranları, sağ alt milletvekili dağılımı.
        govde = `<div class="ig-govde">
            <div class="ig-satir" style="flex:1 1 0;">
                ${sut(M(false), f.haritaSutun)}
                <div class="ig-ayrac"></div>
                ${sut(Y(), f.yaySutun)}
            </div>
            <div class="ig-satir" style="flex:1.15 1 0;">
                ${sut(O(), 1)}
                <div class="ig-ayrac"></div>
                ${sut(V() + K(), 1)}
            </div></div>`;
    }

    sahne.innerHTML = blokBaslik() + govde + blokAltbilgi();
    return sahne;
}

IG.ciz = function (fmtAd) {
    stiliKur();
    const f = IG.FORMATLAR[fmtAd] ? fmtAd : 'dikey';
    const veri = IG.veriTopla();
    return sahneKur(f, veri, olcekBul(f, veri), false);
};

/* ════════════════════════════════════════════════════════════════════════════
   6. DIŞA AKTARMA
   ════════════════════════════════════════════════════════════════════════════ */
IG.png = async function (fmtAd, kat) {
    if (typeof ensureHtml2Canvas === 'function') await ensureHtml2Canvas();
    if (!window.html2canvas) throw new Error('html2canvas yüklenemedi');
    const f = IG.FORMATLAR[fmtAd] || IG.FORMATLAR.dikey;
    const sahne = IG.ciz(fmtAd);
    const kap = document.createElement('div');
    kap.style.cssText = 'position:fixed;left:-99999px;top:0;z-index:-1;';
    kap.appendChild(sahne);
    document.body.appendChild(kap);
    /* Önizleme sahnesi belgede duruyor; html2canvas tüm belgeyi klonladığı için
       rasterize süresince onu geçici olarak ayırmak süreyi belirgin kısaltır. */
    const onizlemeyiGeriGetir = (typeof igOnizlemeyiAskiyaAl === 'function')
        ? igOnizlemeyiAskiyaAl() : () => {};
    try {
        if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const tuval = await html2canvas(sahne, {
            backgroundColor: TEMA.zemin, scale: kat || 2,
            width: f.en, height: f.boy, windowWidth: f.en, windowHeight: f.boy,
            useCORS: true, logging: false
        });
        const link = document.createElement('a');
        link.download = 'infografik_' + fmtAd + '_' + new Date().toISOString().slice(0, 10) + '.png';
        link.href = tuval.toDataURL('image/png');
        link.click();
    } finally {
        document.body.removeChild(kap);
        onizlemeyiGeriGetir();
    }
};

/* ════════════════════════════════════════════════════════════════════════════
   7. STÜDYO
   Üç format, üç çözünürlük. Başka ayar yok.
   ════════════════════════════════════════════════════════════════════════════ */
let FORMAT = 'dikey';
let cizZamanlayici = null;

function panelCiz() {
    document.getElementById('igPanel').innerHTML = `
        <div id="igUst"><b>İnfografik</b>
            <button class="ig-dugme" onclick="Infografik.kapat()">✕</button></div>

        <div class="ig-etiket">FORMAT</div>
        <div class="ig-format">
            ${Object.entries(IG.FORMATLAR).map(([k, f]) =>
                `<button class="${FORMAT === k ? 'aktif' : ''}" onclick="Infografik._format('${k}')">${kacis(f.ad)}</button>`).join('')}
            <button class="${FORMAT === 'klasik' ? 'aktif' : ''}" id="igKlasikBtn"
                    onclick="Infografik._format('klasik')">${kacis(KLASIK.ad + ' · ' + KLASIK.en + '×' + KLASIK.boy)}</button>
        </div>

        <div class="ig-etiket">PNG İNDİR</div>
        <div style="display:flex; gap:6px;">
            <button class="ig-dugme bas" style="flex:1" onclick="Infografik._png(1)">1×</button>
            <button class="ig-dugme bas" style="flex:1" onclick="Infografik._png(2)">2×</button>
            <button class="ig-dugme bas" style="flex:1" onclick="Infografik._png(3)">3×</button>
        </div>
        <div class="ig-not" style="margin-top:-6px;">${(() => {
            const f = (FORMAT === 'klasik') ? KLASIK : IG.FORMATLAR[FORMAT];
            return [1, 2, 3].map(k => k + '× ' + (f.en * k) + '×' + (f.boy * k)).join(' · ');
        })()}</div>

        <div class="ig-not">${g.kiyasAcik
            ? 'Değişim değerleri <b>' + kacis(g.kiyasAd) + '</b> kıyas projeksiyonuna göre.'
            : 'Değişim değerleri için sağ panelden bir <b>kıyas projeksiyonu</b> yükleyip etkinleştirin.'}</div>`;
}

/* Klasik önizleme: indirmeyle AYNI düzeni kuran klasikInfografikSahne()'yi
   çağırır, ama html2canvas'a hiç uğramaz — sahne canlı DOM olarak gösterilip
   CSS transform ile küçültülür, tıpkı diğer üç formatta olduğu gibi. Rasterize
   etmek yalnız indirme anına kaldığı için önizleme anlık açılır.
   PNG 16:10'a kırpıldığından önizleme de aynı kırpmayı yapar: sahne, ortadan
   kirpW genişliğinde bir pencereye kaydırılarak yerleştirilir. */
function klasikOnizle(kap, alan) {
    if (typeof klasikInfografikSahne !== 'function') {
        kap.innerHTML = '<div style="padding:24px;font-size:12.5px;color:#c00;">Klasik çıktı bu sürümde yok.</div>';
        return;
    }
    let s;
    try { s = klasikInfografikSahne(); }
    catch (err) {
        kap.innerHTML = `<div style="padding:24px;font-size:12.5px;color:#c00;">Klasik önizleme üretilemedi: ${kacis(err.message)}</div>`;
        return;
    }
    const kirpW = Math.min(s.kirpW, s.W);
    const olcek = Math.min((alan.clientWidth - 48) / kirpW, (alan.clientHeight - 48) / s.H, 1);
    // Sahne ekrana girecek: dışa aktarımdaki "ekranın dışına park et" konumu kalkar.
    s.el.style.position = 'absolute';
    s.el.style.left = (-(s.W - kirpW) / 2) + 'px';
    s.el.style.top = '0';
    s.el.style.transformOrigin = '0 0';
    kap.innerHTML = '';
    const pencere = document.createElement('div');
    pencere.style.cssText = `position:relative;width:${kirpW}px;height:${s.H}px;overflow:hidden;`
        + `background:#fff;transform:scale(${olcek});transform-origin:0 0;`;
    pencere.appendChild(s.el);
    kap.appendChild(pencere);
    kap.style.width = Math.round(kirpW * olcek) + 'px';
    kap.style.height = Math.round(s.H * olcek) + 'px';
}

function onizlemeCiz() {
    clearTimeout(cizZamanlayici);
    cizZamanlayici = setTimeout(() => {
        const kap = document.getElementById('igOnizlemeKap');
        const alan = document.getElementById('igOnizlemeAlan');
        kap.innerHTML = '';
        /* Klasik çıktı ayrı bir düzen; önizlemesi de diğerleri gibi canlı DOM
           sahnesi olarak çizilir (indirmeyle aynı kurulum kodu, rasterize yok). */
        if (FORMAT === 'klasik') {
            klasikOnizle(kap, alan);
            return;
        }
        let sahne;
        try { sahne = IG.ciz(FORMAT); }
        catch (err) {
            kap.innerHTML = `<div style="padding:20px;color:#c00;font-size:12px;">Çizim hatası: ${kacis(err.message)}</div>`;
            return;
        }
        sahne.id = 'igOnizleme';
        kap.appendChild(sahne);
        const f = IG.FORMATLAR[FORMAT];
        const k = Math.min((alan.clientWidth - 48) / f.en, (alan.clientHeight - 48) / f.boy, 1);
        sahne.style.transform = `scale(${k})`;
        kap.style.width = (f.en * k) + 'px';
        kap.style.height = (f.boy * k) + 'px';
    }, 60);
}

IG.ac = function () {
    stiliKur();
    let kap = document.getElementById('igStudyo');
    if (!kap) {
        kap = document.createElement('div');
        kap.id = 'igStudyo';
        kap.innerHTML = `<div id="igPanel"></div>
            <div id="igOnizlemeAlan"><div id="igOnizlemeKap"></div></div>`;
        document.body.appendChild(kap);
    }
    kap.classList.add('acik');
    panelCiz();
    onizlemeCiz();
};
IG.kapat = function () { const k = document.getElementById('igStudyo'); if (k) k.classList.remove('acik'); };

IG._format = function (k) { FORMAT = k; panelCiz(); onizlemeCiz(); };

/* Klasik çıktı (ekrandaki panellerin fotoğrafı) artık bir format seçeneği;
   çözünürlük çarpanını da diğerleriyle aynı düğmelerden alır. */
IG._klasik = async function (kat) {
    if (typeof exportInfographic !== 'function') { alert('Klasik çıktı bu sürümde yok.'); return; }
    try { await exportInfographic(kat || 1); }
    catch (err) { alert('Klasik çıktı üretilemedi: ' + err.message); }
};
IG._png = async function (kat) {
    if (FORMAT === 'klasik') return IG._klasik(kat);
    try { await IG.png(FORMAT, kat); }
    catch (err) { alert('PNG üretilemedi: ' + err.message); }
};

})();
