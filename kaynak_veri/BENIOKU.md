# Kaynak veriler

Bu klasördeki dosyalara uygulama doğrudan erişmez; hesaplamaya giren
veri setleri bunlardan **türetilmiştir**. Silinmemeleri gerekir: bir daha
üretilemeyecek ham kayıtlar burada.

## YSK ham dökümleri
- `2023_secim_sonuclari.json` — 2023 genel seçimi tam sonuç (ilçe/sandık düzeyi).
  `ilce_2023.json` ve `veri_2023_tam.json` bundan üretildi.

  **Bir düzeltme var:** bu dosya ATA İttifakı'nı `ZAFER PARTİSİ + AP + MİLLET`
  diye kaydeder ve pusuladaki ittifak mührü oylarını üçüne birden dağıtır
  (`oylar` alanı; `oylarHam` dağıtım öncesidir). Millet Partisi bu ittifakın
  üyesi değildi. Türetilmiş dosyalarda düzeltildi: `parti_sablonu_2023.json`
  ittifakı iki üyeyle kurar, `veri_2023_tam.json` ise 4.938 mühür oyunu yalnız
  Zafer ve AP'ye paylaştırır (Millet'ten 176 oy alınıp 153'ü Zafer'e, 23'ü
  AP'ye verildi). Bu dosya kasten olduğu gibi bırakıldı — YSK kaydının kendisi.
  Yeniden türetme yapan biri aynı düzeltmeyi uygulamalıdır.
- `2024_yerel.json` — 2024 yerel seçim il/ilçe dökümü. `veri_2024_tam.json` kaynağı.
- `genel_2018_r.json`, `genel_2023_r.json` — çevre bazlı ham döküm; tam sonuç
  dosyalarının ara aşaması.
- `baz_secim.json` — 2023/2018 baz oranları.

## Tarihsel seçim sonuçları
`1995` · `1999` · `2002` · `2007` · `2011` · `kasim2015` — milletvekili
sonuçları. Şu an hiçbir veri seti bunları kullanmıyor, ama başka bir kaynaktan
yeniden elde edilemezler. İleride kıyas projeksiyonu ya da yeni veri seti
olarak eklenebilirler.

`2015hk_550.json` — 550 sandalyeli dönemin çevre başına koltuk dağılımı.

## Not
`haziran2015_milletvekili.json` bu klasörde DEĞİL: arşiv projeleri ona
başvurduğu için kök dizinde kalmalı.
