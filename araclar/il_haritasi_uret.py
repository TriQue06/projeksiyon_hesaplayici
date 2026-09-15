"""İl haritası üreticisi: TR-adm2-with-city-borders.svg -> turkiye_harita_il.svg

Kaynak tek dosya: ilçe haritası iki katman taşıyor, g#features (973 ilçe) ve
g#iller (81 ilin dış sınırı; TR-adm1.svg'deki il şekilleriyle karakteri
karakterine aynı). Buradan:
  * Tek çevreli 77 il: il sınırı olduğu gibi alınır.
  * Bölünmüş iller (İstanbul 1-3, Ankara 1-3, İzmir 1-2, Bursa 1-2): bölgenin
    ilçeleri birleştirilir. İlçeler köşe noktalarını komşularıyla birebir
    paylaştığı için birleşim sınır kenarlarıyla yapılır: iki ilçenin ortak
    kenarı iç kenardır ve silinir, bir kez görülen kenarlar zincirlenir.
    Çizim ya da yaklaşıklık yok; alanlar ilçe alanlarının toplamıyla denetlenir.
  * Büyük gösterimler (İstanbul 1-3 ve Kocaeli): aynı şekillerin tek tip
    ölçekle büyütülmüş kopyası; ana haritanın sol altına, en üst noktası ana
    haritanın en alt noktasıyla aynı hizada yerleştirilir.
İlçe-çevre ataması plaka_eslestirme.json (ilceCevre), kimlikler
eslestirme.json anahtarları: uygulamanın kimlik çözümlemesi değişmeden çalışır.

Çalıştırma (repo kökünden):  python araclar/il_haritasi_uret.py
"""
import io, json, re
from collections import Counter, defaultdict

KAYNAK = 'TR-adm2-with-city-borders.svg'
CIKTI = 'turkiye_harita_il.svg'
BUYUK_CEVRELER = ['İstanbul 1. Bölge', 'İstanbul 2. Bölge', 'İstanbul 3. Bölge', 'Kocaeli']
BUYUK_EN_ORANI = 0.33   # büyük gösterim genişliği / ana harita genişliği
BUYUK_YUKARI = 100     # büyük gösterimi ana haritanın alt kenarından bu kadar birim yukarı al.
                       # Sınırı vekil noktaları koyuyor: 2026-09-14(2) konumlarıyla 105'te
                       # İstanbul 1 ve 3'ün daireleri kıyıdaki illere biniyor (şekiller 135'e kadar temiz).
# Büyük gösterim kırpması: eski haritadaki gibi sağdan ve alttan düz kesik.
# Kenarlar, hiç kırpılmayan büyük İstanbul 2'nin kutusuna göre verilir (ölçek
# ve konumdan bağımsız): sağ = İst2 solu + oran × İst2 genişliği, alt = İst2
# üstü + oran × İst2 yüksekliği. Oranlar eski turkiye_harita.svg'den ölçüldü
# (sağ kesik x=425,29, alt kesik y≈849,6). None → o yönde kırpma yok.
KIRPMA_SAG_ORAN = 3.245
KIRPMA_ALT_ORAN = 1.447

oku = lambda p: io.open(p, encoding='utf-8').read()
svg = oku(KAYNAK)
esl = json.loads(oku('eslestirme.json'))['cityMapping']
ilceCevre = json.loads(oku('plaka_eslestirme.json'))['ilceCevre']

# çevre adı -> svg kimliği (büyük gösterim anahtarları ayrı)
kimlik, buyukKimlik = {}, {}
for k, c in esl.items():
    (buyukKimlik if k.endswith('Buyuk') else kimlik)[c] = k

def halkalar(d):
    """'M x,y x,y … M …' -> [[('x','y'), …], …]; noktalar METİN olarak tutulur
    ki ortak köşeler kayan nokta farkı olmadan eşleşsin."""
    out = []
    for parca in re.split(r'(?=M)', d):
        pts = [tuple(p.split(',')) for p in re.findall(r'-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?', parca)]
        if len(pts) < 3: continue
        if pts[0] != pts[-1]: pts.append(pts[0])
        out.append(pts)
    return out

def alan(h):
    s = 0.0
    for (x1, y1), (x2, y2) in zip(h, h[1:]):
        s += float(x1) * float(y2) - float(x2) * float(y1)
    return s / 2

def birlestir(tum_halkalar):
    say = Counter()
    for h in tum_halkalar:
        for a, b in zip(h, h[1:]):
            if a != b: say[frozenset((a, b))] += 1
    assert max(say.values()) <= 2, 'bir kenar ikiden fazla ilçede: topoloji bozuk'
    komsu = defaultdict(list)
    for e, n in say.items():
        if n == 1:
            a, b = tuple(e)
            komsu[a].append(b); komsu[b].append(a)
    kullanildi, out = set(), []
    for bas in list(komsu):
        for ilk in komsu[bas]:
            if frozenset((bas, ilk)) in kullanildi: continue
            halka, onceki, simdi = [bas], bas, ilk
            kullanildi.add(frozenset((bas, ilk)))
            while simdi != bas:
                halka.append(simdi)
                sec = [n for n in komsu[simdi] if frozenset((simdi, n)) not in kullanildi]
                assert sec, 'açık zincir'
                sonraki = sec[0]
                kullanildi.add(frozenset((simdi, sonraki)))
                onceki, simdi = simdi, sonraki
            halka.append(bas)
            out.append(halka)
    return out

# ── kaynak katmanlar ────────────────────────────────────────────────────────
ib = svg.index('<g id="iller"')
features, iller = svg[svg.index('<g id="features"'):ib], svg[ib:]
ilSekli = {t: d for d, t in re.findall(r'<path d="([^"]+)"\s*/?>\s*<title[^>]*>([^<]+)</title>', iller)}
assert len(ilSekli) == 81, len(ilSekli)
ilceHalka = defaultdict(list)       # çevre -> halkalar
for gid, g in re.findall(r'<g id="(\d\d-[^"]+)"[^>]*>(.*?)</g>', features, re.S):
    for d in re.findall(r' d="([^"]+)"', g):
        ilceHalka[ilceCevre[gid]] += halkalar(d)

# ── çevre şekilleri ─────────────────────────────────────────────────────────
sekil = {}   # çevre -> halkalar
rapor = []
for cevre in kimlik:
    if cevre in ilSekli:
        sekil[cevre] = halkalar(ilSekli[cevre])
    else:
        h = birlestir(ilceHalka[cevre])
        a_birlesim = sum(abs(alan(x)) for x in h)
        a_ilce = sum(abs(alan(x)) for x in ilceHalka[cevre])
        # delik varsa evenodd alan = dış - iç; toplam |alan| karşılaştırması
        # delik yoksa birebir tutmalı
        rapor.append((cevre, len(ilceHalka[cevre]), len(h), round(a_ilce, 2), round(a_birlesim, 2)))
        sekil[cevre] = h
assert len(sekil) == 87, len(sekil)

def kutu(hs):
    xs = [float(x) for h in hs for x, _ in h]; ys = [float(y) for h in hs for _, y in h]
    return min(xs), min(ys), max(xs), max(ys)

x0, y0, x1, y1 = kutu([h for hs in sekil.values() for h in hs])
bx0, by0, bx1, by1 = kutu([h for c in BUYUK_CEVRELER for h in sekil[c]])
olcek = (x1 - x0) * BUYUK_EN_ORANI / (bx1 - bx0)
dx, dy = x0 - bx0 * olcek, y1 - BUYUK_YUKARI - by0 * olcek   # sol = ana haritanın solu; üst = ana haritanın altının BUYUK_YUKARI birim üstü

def d_yaz(hs, donustur=None):
    parcalar = []
    for h in hs:
        pts = h if donustur is None else [donustur(p) for p in h]
        parcalar.append('M' + ' '.join(f'{x},{y}' for x, y in pts))
    return ''.join(parcalar)

def buyut(p):
    x, y = float(p[0]) * olcek + dx, float(p[1]) * olcek + dy
    return (f'{x:.2f}'.rstrip('0').rstrip('.'), f'{y:.2f}'.rstrip('0').rstrip('.'))

def kirp_halka(pts, sag, alt):
    """Sutherland–Hodgman: halkayı x <= sag ve y <= alt yarı-düzlemleriyle kırpar."""
    def kes(p, icinde, kesis):
        out = []
        for i, a in enumerate(p):
            b = p[(i + 1) % len(p)]
            if icinde(a):
                out.append(a)
            if icinde(a) != icinde(b):
                out.append(kesis(a, b))
        return out
    if sag is not None:
        pts = kes(pts, lambda q: q[0] <= sag,
                  lambda a, b: (sag, a[1] + (b[1] - a[1]) * (sag - a[0]) / (b[0] - a[0])))
    if alt is not None and pts:
        pts = kes(pts, lambda q: q[1] <= alt,
                  lambda a, b: (a[0] + (b[0] - a[0]) * (alt - a[1]) / (b[1] - a[1]), alt))
    return pts if len(pts) >= 3 else None

sayi = lambda v: f'{v:.2f}'.rstrip('0').rstrip('.')
buyukHalka = {c: [[(float(x) * olcek + dx, float(y) * olcek + dy) for x, y in h] for h in sekil[c]]
              for c in BUYUK_CEVRELER}
i2 = kutu(buyukHalka['İstanbul 2. Bölge'])
kirpSag = None if KIRPMA_SAG_ORAN is None else i2[0] + KIRPMA_SAG_ORAN * (i2[2] - i2[0])
kirpAlt = None if KIRPMA_ALT_ORAN is None else i2[1] + KIRPMA_ALT_ORAN * (i2[3] - i2[1])
kirpik = {c: [k for k in (kirp_halka(h, kirpSag, kirpAlt) for h in hs) if k] for c, hs in buyukHalka.items()}

govde = []
for cevre, hs in sekil.items():
    govde.append(f'  <path id="{kimlik[cevre]}" fill-rule="evenodd" d="{d_yaz(hs)}"/>')
for cevre in BUYUK_CEVRELER:
    d = ''.join('M' + ' '.join(f'{sayi(x)},{sayi(y)}' for x, y in h) for h in kirpik[cevre])
    govde.append(f'  <path id="{buyukKimlik[cevre]}" fill-rule="evenodd" d="{d}"/>')

# viewBox: kaynaktaki yatay çerçeve korunur; alt kenar büyük gösterimin altına
# kaynağın üst boşluğu kadar pay bırakılarak uzatılır.
vb = re.search(r'viewBox="([^"]+)"', svg).group(1).split()
vx, vy, vw = float(vb[0]), float(vb[1]), float(vb[2])
buyukAlt = kutu([h for hs in kirpik.values() for h in hs])[3]   # kırpılmış gösterimin alt kenarı
ustPay = y0 - vy
vh = (buyukAlt + ustPay) - vy
# data-ana-cerceve: büyük gösterimler gizlendiğinde kullanılacak çerçeve. İlçe
# haritasının viewBox'ıyla birebir aynıdır; il ↔ ilçe geçişinde harita
# yerinden oynamasın diye uygulama bu değeri kullanır.
basl = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx:g} {vy:g} {vw:g} {vh:.2f}" '
        f'data-ana-cerceve="{" ".join(vb)}" '
        f'stroke-linejoin="round" stroke-linecap="round">\n'
        f'  <!-- araclar/il_haritasi_uret.py ile {KAYNAK} dosyasından üretildi; elle düzenlemeyin. -->\n')
io.open(CIKTI, 'w', encoding='utf-8', newline='\n').write(basl + '\n'.join(govde) + '\n</svg>\n')

print('çevre', len(sekil), '| büyük', len(BUYUK_CEVRELER), '| ölçek', round(olcek, 4))
print('ana harita kutusu', [round(v, 2) for v in (x0, y0, x1, y1)])
print('büyük gösterim üstü', round(by0 * olcek + dy, 4), '| ana alt', round(y1, 4), '| fark', BUYUK_YUKARI, '| sol', round(bx0 * olcek + dx, 4), '= ana sol', round(x0, 4))
print('viewBox', vx, vy, vw, round(vh, 2))
print('kırpma sağ', None if kirpSag is None else round(kirpSag, 2), '| alt', None if kirpAlt is None else round(kirpAlt, 2))
print('bölge birleşimleri (çevre, ilçe halkası, birleşim halkası, ilçe alanı, birleşim alanı):')
for r in rapor: print('  ', r)
