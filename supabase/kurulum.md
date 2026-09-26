# Derin Record hesap sistemi kurulumu

1. Supabase'te yeni bir proje açın. Authentication bölümünde e-posta/şifre girişinin açık olduğundan emin olun.
2. SQL Editor'ü açın; `derin-record.sql` dosyasının tamamını bir kez çalıştırın.
3. Siteden kendi yönetici hesabınızı e-posta ve şifreyle kaydedin. E-posta onayı açıksa gelen bağlantıyı açın.
4. SQL Editor'de dosyanın sonundaki örnek satırdaki e-posta adresini kendi adresinizle değiştirip çalıştırın. Bu hesabı yönetici yapar.
5. Project Settings > API alanından **Project URL** ve **Publishable / anon key** değerlerini `config.js` içine girin. Secret veya service_role key kullanılmaz.
6. Yönetim panelinden antrenörlere demo erişimi verin. Erişim verilmemiş antrenörler not ekranını açamaz.

E-posta onayı ve mikrofon izinlerinin sorunsuz çalışması için siteyi HTTPS ile yayınlayın; Supabase Authentication ayarlarında yayın adresini Site URL ve Redirect URLs alanlarına ekleyin.

## Proje ses dosyaları (WAV dahil)

`proje-dosya-deposu.sql` dosyası, **Projelerim** sayfasında ses dosyası yüklemek için
gereken storage ve tablo yetkilerini tanımlar:

- yönetici, antrenör adına klasör açıp o antrenörün klasörüne dosya yükleyebilir;
- antrenör yalnızca kendi klasörünü görür ve yükler;
- `project-audio` kovası WAV/FLAC/MP3 gibi ses tiplerini kabul eder.

Bu dosyayı SQL Editor'de bir kez çalıştırın (birden fazla çalıştırılabilir).
Çalıştırmazsanız klasör açılır ama ses dosyası yüklenmez.

### Dosya boyutu sınırı ve parçalı yükleme

WAV dosyaları büyüktür (yaklaşık 10 MB/dakika). Supabase'de yükleme sınırı iki
katmanlıdır:

1. **Genel sınır** (tüm kovalar): Supabase → Storage → Settings →
   *Global file size limit*. Ücretsiz planda en fazla **50 MB**.
2. **Kovaya özel sınır**: `storage.buckets.file_size_limit`; genel sınırdan
   yüksek olamaz. Bu depo dosyasında `null` bırakılmıştır (genel sınır geçerli).

Ölçülen servis tavanı: **52.428.800 bayt (50 MiB)**. Bu değer aşılırsa yükleme,
yetki kontrolünden *önce* `HTTP 413 — The object exceeded the maximum allowed
size` ile reddedilir; izin/politika düzeltmeleri bu hatayı gidermez.

**Projelerim sayfası bunu otomatik çözer:** `audio-file-types.js` içindeki
`PARCA_BOYUTU` (45 MB) üzerindeki dosyalar, yükleme sırasında kayıpsız parçalara
bölünür (`...-p01of03.wav`, `...-p02of03.wav`, …). Parçalar orijinal dosyanın
kesintisiz dilimleridir; oynatma ve indirme sırasında tarayıcıda birleştirilir,
stüdyoya giden dosya bit düzeyinde orijinaldir. Bu sayede ücretsiz planda da
uzun WAV'lar teslim edilebilir.

Not: ücretsiz planın depolama kotası küçüktür; çok sayıda 50 MB'lık master
tutacaksanız ücretli plana geçip genel sınırı da yükseltmek gerekir.
