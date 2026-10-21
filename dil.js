/* Derin Record — TR/EN dil desteği.
   Sayfa metinleri HTML'de data-i18n ile işaretlenir; bu dosya yalnızca
   İngilizce karşılıkları tutar. Türkçe her zaman sayfanın kendi metnidir,
   bu yüzden eksik bir anahtar siteyi bozmaz: metin Türkçe kalır. */
(() => {
  const DEPO = 'derin-dil';
  const EN = {
    /* ---- ortak ---- */
    'ortak.demolaraDon': '<span>←</span> BACK TO DEMOS',
    'ortak.anaSayfa': '<span>←</span> HOME',
    'nav.kurumsal': 'Corporate',
    'nav.hakkinda': 'About',
    'nav.hizmetler': 'Services',
    'nav.demolar': 'Demos',
    'nav.ses': 'Sound Design',
    'nav.haberler': 'News',
    'nav.iletisim': 'Contact',
    'nav.menu': 'MENU <i></i>',
    'site.logoEtiket': 'Derin Record home',

    /* ---- ana sayfa ---- */
    'ana.baslik': 'LEAVE<br /><em>YOUR MARK.</em>',
    'ana.metin': 'Every move has its own rhythm. Derin Record designs the music that matches the energy of your routine.',
    'ana.cta1': 'CREATE YOUR MUSIC',
    'ana.cta2': 'HOW DOES IT WORK? <span>↘</span>',
    'ana.kasetEtiket': 'SOUNDS THAT OWN THE PODIUM',
    'ana.kurumsal.etiket': 'CORPORATE MUSIC LICENSING',
    'ana.kurumsal.baslik': "YOUR VENUE'S<br><span>OWN SOUND.</span>",
    'ana.kurumsal.metin': 'Original production music licensing for cafes, stores and hotels. Playing personal music subscriptions in commercial spaces is a licensing violation — Derin Record offers its entirely in-house archive under an annual licence.',
    'ana.kurumsal.m1': '<strong>No copyright risk</strong><span>Every track is ours; one signature closes the deal.</span>',
    'ana.kurumsal.m2': '<strong>Central control</strong><span>Change the music across every branch instantly from one panel.</span>',
    'ana.kurumsal.m3': '<strong>Keep your hardware</strong><span>Your existing sound system stays; setup takes under an hour.</span>',
    'ana.kurumsal.m4': '<strong>Built for the space</strong><span>A playlist shaped around your brand identity.</span>',
    'ana.kurumsal.cta': 'REQUEST A CORPORATE QUOTE →',
    'ana.hst.etiket': 'SOUND DESIGN &amp; FILM SCORING',
    'ana.hst.baslik': 'GIVE THE<br><span>SCREEN A VOICE.</span>',
    'ana.hst.metin': 'We create sound design and film scoring for cinema and advertising. From the atmosphere behind the image to the orchestration that carries the scene, we build the whole sonic world in our own studio.',
    'ana.hst.m1': '<strong>Sound design</strong><span>Scene-specific foley, atmosphere and effects.</span>',
    'ana.hst.m2': '<strong>Film scoring</strong><span>Original music that follows the emotion of the picture.</span>',
    'ana.hst.m3': '<strong>Studio production</strong><span>Recording to mixing, all under one roof.</span>',
    'ana.hst.m4': '<strong>Sample work</strong><span>Sound design studies applied to different film scenes.</span>',
    'ana.hst.cta': 'VIEW THE WORK →',
    'ana.demolar.kicker': '03 — DEMO TAPES',
    'ana.demolar.baslik': 'PICK YOUR<br /><span>BRANCH. LISTEN.</span>',
    'ana.demolar.metin': 'Step up to the tape and explore the sound world of your discipline. Every page has demos you can play without downloading.',
    'ana.demolar.c2': '2 DEMOS →',
    'ana.yakinda': 'COMING SOON →',
    'ana.hizmet.kicker': '02 — FIND YOUR SOUND',
    'ana.hizmet.baslik': 'BUILD THE<br />RHYTHM<br /><span>AROUND YOU.</span>',
    'ana.hizmet.metin': 'From the first idea to the final note, a sound world made for your routine.',
    'ana.hizmet.p1': 'Performance mixes with strong transitions and a clear flow.',
    'ana.hizmet.p2': 'Balanced and punchy on arena sound systems.',
    'ana.hizmet.p3': 'An arrangement built around your moves, your timing and your story.',
    'ana.manifesto.kicker': '01 — DERIN RECORD',
    'ana.manifesto.baslik': "MUSIC SHOULDN'T JUST<br />PLAY IN THE <span>BACKGROUND.</span>",
    'ana.manifesto.lead': 'Every repetition, every transition and every hour you put in has a rhythm.',
    'ana.manifesto.metin': 'Derin Record produces original, professional music synchronised with the energy of rhythmic gymnastics routines. Let the music be your strongest partner.',
    'ana.sezon.kicker': '04 — NEW SEASON',
    'ana.sezon.baslik': 'NEW<br /><span>SEASON.</span><br />NEW SOUND.',
    'ana.sezon.metin': 'New season preparations are in full swing. Do not leave your music to chance; step onto the podium with a sound that moves with you.',
    'ana.sezon.cta': 'GET THE DETAILS',
    'ana.footer.kicker': '05 — CONNECT',
    'ana.footer.baslik': "READY?<br /><span>LET'S FIND THE RHYTHM.</span>",
    'ana.teklif': 'GET A QUOTE',
    'ana.teklifKurumsal': 'CORPORATE MUSIC LICENSING',
    'ana.teklifFilm': 'FILM SCORING &amp; SOUND DESIGN',

    /* ---- branş sayfaları ---- */
    'brans.eyebrow01': '01 — BRANCH DEMO',
    'brans.eyebrow02': '02 — BRANCH DEMO',
    'brans.eyebrow03': '03 — BRANCH DEMO',
    'brans.eyebrow04': '04 — BRANCH DEMO',
    'brans.eyebrow05': '05 — BRANCH DEMO',
    'brans.kasetBaslik': 'DEMO TAPES — PLAY AND START ANYWHERE IN THE TRACK',
    'brans.dinle': 'Play demo',
    'aerobik.baslik': 'AEROBIC<br><span>GYMNASTICS.</span>',
    'aerobik.metin': 'A dedicated demo selection built for speed, clarity and performance energy.',
    'aerobik.tur': 'AEROBIC GYMNASTICS',
    'aerobik.not': 'Demo track · Play the tape and feel the rhythm.',
    'aerobik.ilerle': 'Seek within The Witcher',
    'akrobatik.baslik': 'ACROBATIC<br><span>GYMNASTICS.</span>',
    'akrobatik.metin': 'An acrobatic gymnastics demo built for strength, flow and synchronisation.',
    'akrobatik.tur': 'ACROBATIC GYMNASTICS',
    'akrobatik.not': 'Video demo · Stage-ready at its own tempo.',
    'akrobatik.ilerle': 'Seek within WP Acro',
    'artistik.baslik': 'ARTISTIC<br><span>GYMNASTICS.</span>',
    'artistik.metin': 'Dedicated sounds for a controlled rise, a clean hit and a mark that stays on stage.',
    'artistik.tur': 'ARTISTIC GYMNASTICS',
    'artistik.not': 'Demo track · Cinematic and dynamic transitions.',
    'artistik.ilerle': 'Seek within 007',
    'ritmik.baslik': 'RHYTHMIC<br><span>GYMNASTICS.</span>',
    'ritmik.metin': 'A rhythmic gymnastics demo built for elegance, strong transitions and dynamic accents.',
    'ritmik.tur': 'RHYTHMIC GYMNASTICS',
    'ritmik.not': 'Demo track · Strong transitions, sharp accents.',
    'ritmik.ilerle': 'Seek within Horon Kafkas',
    'cocuk.baslik': 'CHILDREN<br><span>FITNESS.</span>',
    'cocuk.metin': 'Music demos suited to children’s energy, age groups and movement world will appear here.',
    'cocuk.bosBaslik': 'NEW DEMOS COMING SOON.',
    'cocuk.bosMetin': 'When the Children Fitness music demos are ready, you will be able to play them here as tapes.',

    /* ---- haberler ---- */
    'haber.etiket': 'COMPETITION TRACKER',
    'haber.baslik': 'LATEST<br><span>NEWS.</span>',
    'haber.giris': 'Follow the gymnastics calendar and official announcements from Turkey to the world in one place.',
    'haber.geri': 'Los Angeles 2028 Olympics countdown',
    'haber.olimp.etiket': 'OLYMPICS',
    'haber.olimp.baslik': 'COUNTDOWN<br><span>TO LA28.</span>',
    'haber.olimp.tarih': 'JULY 14, 2028 ↗',
    'haber.gun': 'DAYS',
    'haber.saat': 'HOURS',
    'haber.dakika': 'MINUTES',
    'haber.saniye': 'SECONDS',
    'haber.k1.etiket': 'TURKEY',
    'haber.k1.baslik': 'Turkish Championships',
    'haber.k1.metin': 'Follow the official announcements and competition calendar of the Turkish Gymnastics Federation.',
    'haber.k1.link': 'OPEN OFFICIAL ANNOUNCEMENTS ↗',
    'haber.k2.etiket': 'NATIONAL',
    'haber.k2.baslik': 'National Competitions',
    'haber.k2.metin': 'For national competition details published by city, club and age group, check the federation announcements.',
    'haber.k2.link': 'COMPETITION CALENDAR ↗',
    'haber.k3.etiket': 'EUROPE',
    'haber.k3.baslik': 'European Championships',
    'haber.k3.metin': 'The 2026 artistic European Championships in Zagreb: women 13–16 August, men 19–23 August.',
    'haber.detay': 'EVENT DETAILS ↗',
    'haber.k4.etiket': 'WORLD',
    'haber.k4.baslik': 'World Championships',
    'haber.k4.metin': 'The 54th Artistic Gymnastics World Championships takes place in Rotterdam on 17–25 October 2026.',
    'haber.k5.etiket': 'CHILDREN FITNESS · TURKEY',
    'haber.k5.baslik': 'News from Turkey',
    'haber.k5.metin': 'Follow the Children Fitness Turkish Championship, qualifiers and result announcements through federation channels.',
    'haber.k5.link': 'TURKEY ANNOUNCEMENTS ↗',
    'haber.k6.etiket': 'CHILDREN FITNESS · EUROPE',
    'haber.k6.baslik': 'News from Europe',
    'haber.k6.metin': 'Announcements from Children Fitness and Fit Kid organisations in Europe will be collected here.',
    'haber.k6.link': 'EUROPE ANNOUNCEMENTS ↗',
    'haber.k7.etiket': 'CHILDREN FITNESS · WORLD',
    'haber.k7.baslik': 'News from the World',
    'haber.k7.metin': 'Follow official world championship announcements and results from the IFBB World Children Fitness Championship.',
    'haber.k7.link': 'WORLD CHAMPIONSHIP ↗',
    'haber.not': 'Calendars can change. Always rely on official sources for final decisions and entry details.',

    /* ---- ses tasarımı ---- */
    'sd.etiket': 'DERIN RECORD × SOUND DESIGN',
    'sd.metin': 'We create sound design and film scoring for cinema and advertising. From the atmosphere behind the image to the orchestration that carries the scene, we build the whole sonic world in our own studio.',
    'sd.cta1': 'VIEW THE WORK →',
    'sd.cta2': 'GET A QUOTE →',
    'sd.proje.etiket': 'SELECTED WORK',
    'sd.proje.baslik': 'HEARD ON<br /><span>THE BIG SCREEN.</span>',
    'sd.kapat': 'CLOSE',
    'sd.form.etiket': 'QUICK QUOTE',
    'sd.form.ad': 'Full name',
    'sd.form.eposta': 'Email',
    'sd.form.tel': 'Phone (optional)',
    'sd.form.tur': 'Project type',
    'sd.form.tur1': 'Sound Design',
    'sd.form.tur2': 'Film Scoring',
    'sd.form.tur3': 'Both',
    'sd.form.mesaj': 'Tell us briefly about your project...',
    'sd.form.gonder': 'SEND REQUEST →',
    'sd.footer.kicker': 'CONNECT',
    'sd.footer.baslik': "LET'S TALK<br /><span>ABOUT YOUR PROJECT.</span>",
    'sd.footer.son': 'DERIN RECORD <span>•</span> SOUND DESIGN &amp; FILM SCORING',

    /* ---- enerji haritası ---- */
    'em.analiz': '[ analysis ]',
    'em.baslik': "The track's energy curve",
    'em.bilgiEtiket': 'Show how it works',
    'em.bilgi': 'Load an audio file. The chart shows where the track rises and where it falls; the readings appear above the panel.',
    'em.dosyaSec': 'Choose an audio file',
    'em.harita': 'energy map',
    'em.olcumler': 'Measurements',
    'em.ortalama': 'average',
    'em.tempo': 'tempo',
    'em.tepe': 'peak',
    'em.enerji': 'energy',
    'em.enYogun': 'peak density',
    'em.dusuk': 'low —',
    'em.orta': 'mid —',
    'em.yuksek': 'high —',
    'em.birak': 'Drop your audio file here',
    'em.birakAlt': 'or choose one above — mp3, m4a, wav',
    'em.konum': 'Position in track',
    'em.ipucu': 'click the chart · arrow keys to move',

    /* ---- JS'ten gelen dinamik metinler ---- */
    'sd.hata': 'Please fill in the required fields.',
    'sd.gonderiliyor': 'SENDING...',
    'sd.tesekkur': 'Thank you! We will get back to you shortly.',
    'sd.basarisiz': 'Something went wrong. Please try again or reach us on WhatsApp or by phone.',

    /* ---- hesap kabuğu (auth.js) ---- */
    'hesap.hesabim': 'MY ACCOUNT',
    'shell.giris': 'LOG IN',
    'shell.kayit': 'SIGN UP',
    'shell.arastir': 'RESEARCH A SONG',
    'shell.cikis': 'LOG OUT',
    'shell.kapat': 'Close',
    'shell.hesapSistemi': 'ACCOUNT SYSTEM',
    'shell.kullanicilar': 'USERS',
    'shell.bildirimler': 'NOTIFICATIONS',
    'shell.taleplerim': 'MY REQUESTS',
    'shell.radyo': 'RADIO ADMIN',
    'shell.ajanlar': 'AGENTS',
    'shell.harmonik': 'HARMONIC SET',
    'shell.mp3': 'MP3 CONVERTER',
    'shell.projelerim': 'MY PROJECTS',
    'shell.enerji': 'ENERGY & TEMPO',
    'shell.licence': 'MUSIC DECLARATION',
    'shell.hazirlaniyor': 'THE ACCOUNT SYSTEM IS BEING SET UP',
    'shell.hazirlaniyorMetin': 'Sign-up and sign-in with email and password will open once an administrator adds the Supabase connection details.',
    'shell.kayitBaslik': 'COACH SIGN-UP',
    'shell.girisBaslik': 'SIGN IN TO YOUR ACCOUNT',
    'shell.kayitAciklama': 'Your demo access opens after an administrator approves your registration.',
    'shell.girisAciklama': 'Sign in to reach the demo notes.',
    'shell.beniHatirla': 'Remember me',
    'shell.adSoyad': 'FULL NAME',
    'shell.eposta': 'EMAIL',
    'shell.sifre': 'PASSWORD',
    'shell.zatenVar': 'Already have an account? Sign in',
    'shell.yokMu': 'No account yet? Register as a coach',
    'shell.unuttun': 'Forgot your password?',
    'shell.onceEposta': 'Type your email address first, then use this link.',
    'shell.gonderiliyor': 'Sending the reset link…',
    'shell.sifirlamaGonderildi': 'If this address is registered, a reset link has been sent. Check your inbox and spam folder.',
    'shell.kontrol': 'Checking…',
    'shell.onayGerekli': 'You need to accept the User Agreement to register.',
    'shell.basarili': 'Signed in.',
    'auth.sozlesme': 'User Agreement',
    'auth.aydinlatma': 'Privacy Notice',
    'auth.onay': 'I have read and accept the {sozlesme}; I have read the {aydinlatma}.',
    'auth.yenidenGonder': 'RESEND THE CONFIRMATION EMAIL',
    'auth.onayBekliyor': 'Registration created. Open the confirmation link in your email, then sign in.',
    'auth.sayacEtiket': '{dugme} — {sayi} new notifications',
    'bild.baslik': 'NOTIFICA<span>TIONS.</span>',

    /* ---- MP3 dönüştürücü ---- */
    'mp3.baslik': 'Convert a link to <span>MP3 + WAV</span>',
    'mp3.arac': 'Conversion runs on this Mac; audio is written as <strong>WAV 24-bit / 48 kHz</strong> and <strong>MP3 320 kbps</strong> into the <code>~/Music/Derin Record</code> folder. Double-click the <strong>Derin Ses Al</strong> shortcut on the desktop and the converter opens in your browser. To start it from Terminal:',
    'mp3.terminal': 'Does the same job in a single line and leaves the files in the same folder:',
    'mp3.guncelle': 'If the link cannot be read, update the downloader:',

    /* ---- kurumsal form / planlar (coffee.js) ---- */
    'cf.alanlar': 'Company, contact person and email are required.',
    'cf.gonderiliyor': 'Sending…',
    'cf.hata': 'Could not send: ',
    'cf.tesekkur': 'We have received your request and will get back to you shortly.'
  };

  /* ---- Otomatik mod sözlüğü ----
     Portal, hukuki metinler ve araç sayfaları data-i18n ile tek tek işaretlenmez;
     kaynak Türkçe dize burada aranır. Anahtar = sayfada/JS'te görünen Türkçe
     metnin tamamı; değer = İngilizcesi. Sözlükte olmayan dize Türkçe kalır. */
  const METIN = {
    /* ---- ortak gezinme ---- */
    'SİTEYE DÖN': 'BACK TO SITE',
    '← SİTEYE DÖN': '← BACK TO SITE',
    'ANA SAYFA': 'HOME',
    '← ANA SAYFA': '← HOME',
    'DEMOLARA DÖN': 'BACK TO DEMOS',
    '← DEMOLARA DÖN': '← BACK TO DEMOS',
    'KURUMSAL': 'CORPORATE',
    '← KURUMSAL': '← CORPORATE',
    'YÖNETİCİ ALANI': 'ADMIN AREA',
    'DERİN RECORD ARAÇLARI': 'DERIN RECORD TOOLS',
    'STÜDYO ARACI': 'STUDIO TOOL',
    'HESAP': 'ACCOUNT',
    'Hesap kontrol ediliyor…': 'Checking your account…',
    'Giriş kontrol ediliyor…': 'Checking sign-in…',
    'Bu alan için yönetici yetkiniz yok.': 'You do not have admin access to this area.',
    'Bu alan yalnızca yöneticilere açıktır.': 'This area is open to administrators only.',
    'Önce Supabase bağlantısını config.js dosyasına ekleyin.': 'First add the Supabase connection details to config.js.',
    'GİRİŞ YAP': 'LOG IN',
    'KAYIT OL': 'SIGN UP',
    'ÇIKIŞ YAP': 'LOG OUT',
    'Kapat': 'Close',
    'KAPAT': 'CLOSE',
    'MÜZİĞİNİ ARAŞTIR': 'RESEARCH A SONG',
    'MÜZİK ARAŞTIR': 'RESEARCH A SONG',
    'PROJELERİM': 'MY PROJECTS',
    'ENERJİ & TEMPO': 'ENERGY & TEMPO',
    'MÜZİK BEYANI': 'MUSIC DECLARATION',
    'KULLANICILAR': 'USERS',
    'BİLDİRİMLER': 'NOTIFICATIONS',
    'TALEPLERİM': 'MY REQUESTS',
    'RADYO YÖNETİMİ': 'RADIO ADMIN',
    'AJANLAR': 'AGENTS',
    'HARMONİK SET': 'HARMONIC SET',
    'MP3 DÖNÜŞTÜRÜCÜ': 'MP3 CONVERTER',
    'HESABIM': 'MY ACCOUNT',
    'HESAP SİSTEMİ': 'ACCOUNT SYSTEM',

    /* ---- giriş / kayıt ---- */
    'HESAP SİSTEMİ HAZIRLANIYOR': 'THE ACCOUNT SYSTEM IS BEING SET UP',
    'Yönetici, Supabase bağlantı bilgilerini ekledikten sonra e-posta ve şifreyle kayıt/giriş açılacak.': 'Sign-up and sign-in with email and password will open once an administrator adds the Supabase connection details.',
    'ANTRENÖR KAYDI': 'COACH SIGN-UP',
    'HESABINA GİR': 'SIGN IN TO YOUR ACCOUNT',
    'Kaydın yönetici onayından sonra demo erişimin açılır.': 'Your demo access opens after an administrator approves your registration.',
    'Demo notlarına ulaşmak için giriş yap.': 'Sign in to reach the demo notes.',
    'AD SOYAD': 'FULL NAME',
    'E-POSTA': 'EMAIL',
    'ŞİFRE': 'PASSWORD',
    'YENİ ŞİFRE': 'NEW PASSWORD',
    'YENİ ŞİFRE (TEKRAR)': 'NEW PASSWORD (AGAIN)',
    'Kullanıcı Sözleşmesi': 'User Agreement',
    'Aydınlatma Metni': 'Privacy Notice',
    'Zaten hesabın var mı? Giriş yap': 'Already have an account? Sign in',
    'Hesabın yok mu? Antrenör olarak kayıt ol': 'No account yet? Register as a coach',
    'Şifreni mi unuttun?': 'Forgot your password?',
    'Önce e-posta adresini yaz, sonra bu bağlantıya bas.': 'Type your email address first, then use this link.',
    'Sıfırlama bağlantısı gönderiliyor…': 'Sending the reset link…',
    'Bu adres kayıtlıysa sıfırlama bağlantısı gönderildi. Gelen kutunu ve spam klasörünü kontrol et.': 'If this address is registered, a reset link has been sent. Check your inbox and spam folder.',
    'Kontrol ediliyor…': 'Checking…',
    'Kayıt için Kullanıcı Sözleşmesi’ni kabul etmen gerekiyor.': 'You need to accept the User Agreement to register.',
    'ONAY E-POSTASINI YENİDEN GÖNDER': 'RESEND THE CONFIRMATION EMAIL',
    'Yeni onay e-postası gönderildi.': 'A new confirmation email has been sent.',
    'Giriş başarılı.': 'Signed in.',
    'Bağlantı kontrol ediliyor…': 'Checking the link…',
    'Hesap sistemi yüklenemedi.': 'The account system could not be loaded.',
    'Hesap sistemi yapılandırılmamış.': 'The account system is not configured.',
    'Bu bağlantı geçersiz ya da süresi dolmuş. Giriş ekranından "Şifreni mi unuttun?" ile yeni bağlantı iste.': 'This link is invalid or has expired. Request a new one from the sign-in screen via “Forgot your password?”.',
    'Bağlantı doğrulandı. Yeni şifreni belirle.': 'Link verified. Set your new password.',
    'İki şifre birbirini tutmuyor.': 'The two passwords do not match.',
    'Şifre en az 8 karakter olmalı.': 'The password must be at least 8 characters.',
    'Güncelleniyor…': 'Updating…',
    'Şifren güncellendi. Birkaç saniye içinde ana sayfaya yönlendirileceksin, yeni şifrenle giriş yapabilirsin.': 'Your password has been updated. You will be redirected to the home page in a few seconds; sign in with your new password.',
    'En az 8 karakter olmalı.': 'Must be at least 8 characters.',
    'ŞİFREYİ GÜNCELLE': 'UPDATE PASSWORD',
    'ŞİFRENİ': 'RESET',
    'YENİLE.': 'YOUR PASSWORD.',

    /* ---- portal sayfa başlıkları ---- */
    'TALEPLERİM.': 'MY REQUESTS.',
    'KULLANICILAR.': 'USERS.',
    'SES TASARIMI & FİLM SCORING': 'SOUND DESIGN & FILM SCORING',
    'SES TASARIMI & FİLM SCORING TALEPLERİM': 'MY SOUND DESIGN & FILM SCORING REQUESTS',
    'YARIŞMA EVRAKLARI': 'COMPETITION PAPERWORK',
    'MÜZİK KULLANIM BEYANI.': 'MUSIC USE DECLARATION.',
    'MÜZİK KULLANIM': 'MUSIC USE',
    'BEYANI.': 'DECLARATION.',
    'ERİŞİM KONTROLÜ.': 'ACCESS CONTROL.',
    'ERİŞİM': 'ACCESS',
    'KONTROLÜ.': 'CONTROL.',
    'TÜM ANTRENÖR PROJELERİ': 'ALL COACH PROJECTS',
    'ANTRENÖR İSTEKLERİ': 'COACH REQUESTS',
    'PROJE AŞAMALARI.': 'PROJECT STAGES.',
    'PROJE': 'PROJECT',
    'AŞAMALARI.': 'STAGES.',
    'GÜVENLİ PROJE SÜRECİ': 'SECURE PROJECT FLOW',
    'Ödeme sağlayıcısı bağlanana kadar bu ekran, onay ve teslim sürecini takip eder.': 'Until a payment provider is connected, this screen tracks the approval and delivery flow.',
    'YENİ DEMO PROJESİ': 'NEW DEMO PROJECT',
    'DURUM: TASLAK İNCELEMEDE': 'STATUS: DRAFT UNDER REVIEW',
    'Taslak gönderildi': 'Draft submitted',
    'Rough cut antrenör incelemesine hazır.': 'The rough cut is ready for the coach to review.',
    'Antrenör onayı': 'Coach approval',
    'TASLAĞI ONAYLA': 'APPROVE THE DRAFT',
    'Ödeme doğrulaması': 'Payment verification',
    'Yönetici ödeme sağlayıcısından doğrular.': 'An administrator verifies it with the payment provider.',
    'Final WAV teslimi': 'Final WAV delivery',
    '🔒 Final dosyası ödeme doğrulanınca açılır.': '🔒 The final file unlocks once the payment is verified.',
    'PROJELERİM.': 'MY PROJECTS.',

    /* ---- kurumsal / kafe sayfası ---- */
    'KURUMSAL MÜZİK LİSANSI': 'CORPORATE MUSIC LICENSING',
    'MEKANINIZIN': 'YOUR VENUE’S',
    'KENDİ SESİ.': 'OWN SOUND.',
    'Ticari mekanlarda kişisel müzik hesaplarını çalmak lisans ihlalidir. Derin Record, tamamı kendi stüdyomuzda üretilmiş özgün elektronik müzik arşivini yıllık lisansla sunar — telif sorunu olmadan, markanızın karakterine göre kurgulanmış olarak.': 'Playing personal music accounts in commercial venues is a licensing violation. Derin Record licenses an original electronic music archive produced entirely in our own studio — free of copyright risk and shaped around your brand.',
    'ÖZGÜN ÜRETİM': 'ORIGINAL PRODUCTION',
    'Tüm eserler bize ait. Üçüncü taraf telif riski yok, sözleşmeniz tek imzayla tamamlanır.': 'Every track is ours. No third-party copyright risk, and your agreement is completed with a single signature.',
    'UZAKTAN YÖNETİM': 'REMOTE CONTROL',
    'Şubelerinizin müziği merkezden anlık değişir. Tek tuşla tüm mağazalar güncellenir.': 'The music across your branches changes instantly from one place. One button updates every store.',
    'DONANIM DEĞİŞİKLİĞİ': 'HARDWARE CHANGES',
    'Mevcut ses sisteminiz kalır. Küçük bir cihaz yeterlidir, kurulum bir saat sürmez.': 'Your existing sound system stays. One small device is enough, and setup takes under an hour.',
    'MEKÂNA ÖZEL KURGU': 'BUILT FOR THE SPACE',
    'Markanızın kimliğine göre hazırlanmış çalma listesi. Mekânın ritmi değiştiğinde kurgu da panelden güncellenir.': 'A playlist shaped around your brand identity. When the rhythm of the venue changes, the sound is updated from the panel.',
    'PAKETLER': 'PACKAGES',
    'Şube sayınıza göre.': 'Based on your number of branches.',
    'Tüm paketlerde 7 gün ücretsiz deneme. Kurulum ücreti yok.': 'A 7-day free trial on every package. No setup fee.',
    'AYLIK': 'MONTHLY',
    'YILLIK': 'YEARLY',
    'TEKLİF İSTEYİN': 'REQUEST A QUOTE',
    'Mekanınıza özel kurgu hazırlayalım.': 'Let us build a sound made for your venue.',
    'Kısa bir demo seti hazırlayıp size özel sunarız.': 'We prepare a short demo set and present it to you.',
    'ŞİRKET / MARKA': 'COMPANY / BRAND',
    'YETKİLİ KİŞİ': 'CONTACT PERSON',
    'TELEFON': 'PHONE',
    'ŞUBE SAYISI': 'NUMBER OF BRANCHES',
    'NOTUNUZ': 'YOUR NOTE',
    'Mekanınızın tarzı, çalışma saatleri, beklentileriniz…': 'Your venue’s style, opening hours, expectations…',
    'TEKLİF İSTE →': 'REQUEST A QUOTE →',
    'Teklif alın': 'Get a quote',
    'EN ÇOK TERCİH EDİLEN': 'MOST PREFERRED',
    '7 GÜN ÜCRETSİZ DENE': 'TRY FREE FOR 7 DAYS',
    'Mekâna özel kurgu': 'Sound built for the venue',
    'Merkezden anlık yönetim': 'Instant control from one place',
    'Ayda 1 kurgu güncellemesi dahil': 'One playlist refresh a month included',
    'Şube başına indirimli': 'Discounted per branch',
    'Şubeye özel kurgu': 'Sound specific to each branch',
    'Öncelikli destek': 'Priority support',
    'Şube başına en uygun fiyat': 'Best price per branch',
    'Tamamen özel üretim': 'Fully bespoke production',
    'Marka kimliğine göre kurgu': 'Sound shaped around the brand identity',
    'Paket bilgisi yüklenemedi.': 'Package information could not be loaded.',
    'ŞUBE YAYINI': 'BRANCH BROADCAST',
    'Bu yayın şubenize özeldir.': 'This broadcast is specific to your branch.',
    'Size iletilen şube kodunu girin. Kod bu cihazda bir kez sorulur.': 'Enter the branch code sent to you. The code is asked once on this device.',
    'ŞUBE KODU': 'BRANCH CODE',
    'YAYINI AÇ': 'START BROADCAST',
    'Kodunuz yoksa Derin Record ile iletişime geçin.': 'If you do not have a code, contact Derin Record.',
    'Bu link artık kullanılmıyor. Şubenize iletilen linki kullanın.': 'This link is no longer in use. Use the link sent to your branch.',

    /* ---- hukuki metinler (başlık ve alt gezinme) ---- */
    'GİZLİLİK': 'PRIVACY',
    'POLİTİKASI.': 'POLICY.',
    'ÇEREZLER': 'COOKIES',
    'ÇEREZ': 'COOKIE',
    'ÜYELİK': 'MEMBERSHIP',
    'KULLANICI': 'USER',
    'SÖZLEŞMESİ.': 'AGREEMENT.',
    'AYDINLATMA': 'PRIVACY',
    'METNİ.': 'NOTICE.',
    'Yürürlük tarihi: 4 Ekim 2026 · Sürüm: 2026-10-04': 'Effective: 4 October 2026 · Version: 2026-10-04',
    'Yürürlük tarihi: 17 Ekim 2026 · Sürüm: 2026-10-17': 'Effective: 17 October 2026 · Version: 2026-10-17',
    'Çerez Politikası': 'Cookie Policy',
    'Ana sayfa': 'Home',

    /* ---- enerji haritası (energy-map.js dinamik metinleri) ---- */
    'Parçanın enerji eğrisi': 'The track’s energy curve',
    'Analiz bekleniyor': 'Waiting for analysis',
    'Analiz ediliyor…': 'Analysing…',
    'Bir noktaya tıkla; parça oradan çalsın.': 'Click a point; the track plays from there.',
    'Bu dosya analiz edilemedi. Başka bir ses dosyası dene.': 'This file could not be analysed. Try another audio file.',
    'Parça başlatılamadı. Dosyayı yeniden seç.': 'The track could not start. Please choose the file again.',
    'Açıklamayı kapat': 'Hide the explanation',
    'Nasıl çalıştığını göster': 'Show how it works',
    'Enerji dağılım grafiği': 'Energy distribution chart',
    'enerji': 'energy',
    'ortalama': 'average',
    'ort.': 'avg.',
    'en yoğun': 'busiest',
    'bölüm': 'section',
    'yaklaşık': 'about',
    'ölçülemedi': 'could not be measured',
    'Ok tuşlarıyla bölümleri gez.': 'Use the arrow keys to move through the sections.',
    'düşük': 'low',
    'orta': 'mid',
    'yüksek': 'high',

    /* ---- yönetici araçları ---- */
    'Derin Record\'un dijital ofisi. Ortadaki beyin işi doğru departmana verir; departmanlardaki ajanlar senin yerine düzenli işleri yapar, üstteki bağlantıları araç olarak kullanır.': 'Derin Record’s digital office. The brain in the middle routes work to the right department; the agents in each department handle the routine work for you and use the links above as tools.',
    'AJANLAR.': 'AGENTS.',
    'Görmek için yönetici hesabınla giriş yap.': 'Sign in with your admin account to view this.',
    'SES AL': 'GET SOUND',
    'Ajanların durumu yükleniyor…': 'Loading agent status…',
    'BAĞLI': 'CONNECTED',
    'BEYNİ': 'BRAIN',
    'Claude · hafıza · koordinatör': 'Claude · memory · coordinator',
    'Bir departmana dokun: içindeki ajanlar, ekranlar ve beceriler açılır.': 'Tap a department to open its agents, screens and skills.',
    'HARMONİK': 'HARMONIC',
    'SET SIRALAYICI.': 'SET SORTER.',
    'DÖNÜŞTÜR': 'CONVERT',
    'ARAÇ AÇIK MI': 'IS THE TOOL RUNNING',
    'TERMİNALDEN': 'FROM THE TERMINAL',
    'GÜNCELLE': 'UPDATE',
    'KOPYALA': 'COPY',
    '← yönetim': '← admin',
    'Aynı işi tek satırda yapar, dosyaları aynı klasöre bırakır:': 'Does the same job in a single line and leaves the files in the same folder:',
    'Link okunamazsa indiriciyi güncelle:': 'If the link cannot be read, update the downloader:',
    'Buraya bağlantıyı yapıştırın': 'Paste the link here',
    'Bağlantı': 'Link',
    'Yetki kontrol ediliyor…': 'Checking permission…',
    'Radyo kontrolü': 'Radio control',
    'bağlanıyor': 'connecting',
    'Ara… (şube, marka, parça)': 'Search… (branch, brand, track)',
    'Detay': 'Details',

    /* ---- portal / proje odası ---- */
    'DERİN RECORD · PROJE ODASI': 'DERİN RECORD · PROJECT ROOM',
    'Projelerim': 'My projects',
    've aşamalar.': 'and stages.',
    'Müziğinin her adımı tek yerde: onay, yapım, teslim. Yeni sürümler ve notlar anında burada.': 'Every step of your music in one place: approval, production, delivery. New versions and notes appear here instantly.',
    '↻ YENİLE': '↻ REFRESH',
    'Parçayı oynat': 'Play track',
    'Parçayı duraklat': 'Pause track',
    'Bu noktadan çal': 'Play from here',
    'SES DOSYASI YÜKLE': 'UPLOAD AUDIO FILE',
    'YENİ PROJE': 'NEW PROJECT',
    'YENİ VARYASYON EKLE': 'ADD NEW VARIATION',
    'TÜMÜ': 'ALL',
    'TÜMÜNÜ AÇ': 'EXPAND ALL',
    'TÜMÜNÜ KATLA': 'COLLAPSE ALL',
    'Henüz proje yok.': 'No projects yet.',
    'Henüz not yok. İlk notu sen bırak.': 'No notes yet. Leave the first one.',
    'Bu klasörde henüz not yok.': 'No notes in this folder yet.',
    'BEKLİYOR': 'PENDING',
    'ONAY BEKLİYOR': 'AWAITING APPROVAL',
    'YAPIM SÜRECİNDE': 'IN PRODUCTION',
    'TESLİM EDİLDİ': 'DELIVERED',
    'BAŞLANDI': 'STARTED',
    'BİTİM AŞAMASI': 'FINAL STAGE',
    'PARÇA': 'TRACK',
    'KAYDET VE GÖNDER': 'SAVE AND SEND',
    'GÖNDERİLİYOR…': 'SENDING…',
    'Geri bildirim gönderildi.': 'Feedback sent.',
    'Aşama güncellendi.': 'Stage updated.',
    'Parça silindi.': 'Track deleted.',
    'Yeni parça projeye eklendi.': 'New track added to the project.',
    'Yeni varyasyon eklendi, antrenöre bildirildi.': 'New variation added and the coach was notified.',
    'Varyasyon gönderildi, antrenöre bildirildi.': 'Variation sent and the coach was notified.',
    'İNDİRMEYE İZİN VER': 'ALLOW DOWNLOAD',
    '✓ İNDİRME AÇIK': '✓ DOWNLOAD ON',
    'İndirildi.': 'Downloaded.',
    'İndirme izni verildi.': 'Download permission granted.',
    'İndirme izni kaldırıldı.': 'Download permission removed.',
    'KOPYALANDI ✓': 'COPIED ✓',
    'AÇ': 'OPEN',
    'GERİ AL': 'UNDO',

    /* ---- bildirimler ---- */
    'Talepler yükleniyor…': 'Loading requests…',
    'Henüz hiç proje talebi yok.': 'No project requests yet.',
    'Henüz erişim verilmedi.': 'No access granted yet.',
    'Erişim verildi.': 'Access granted.',
    'Antrenör': 'Coach',
    'Yönetici': 'Administrator',
    'İsimsiz': 'Unnamed',
    'Demo seçin': 'Select a demo',
    'Antrenör seçin': 'Select a coach',
    'KAYITLI HESAP': 'REGISTERED ACCOUNTS',
    'AÇIK DEMO ERİŞİMİ': 'ACTIVE DEMO ACCESS',
    'GERİ BİLDİRİM': 'FEEDBACK',
    'ANTRENÖRE DEMO ERİŞİMİ VER': 'GRANT DEMO ACCESS TO A COACH',
    'AKTİF ERİŞİMLER': 'ACTIVE ACCESS',
    'ERİŞİM VER': 'GRANT ACCESS',
    'KALDIR': 'REMOVE',

    /* ---- müzik beyanı ---- */
    'Bu belge, antrenörün verdiği bilgilere dayanan beyan formudur; hak sahibi veya FIG tarafından düzenlenmiş lisans sertifikası değildir. Yarışmanın güncel talimatındaki ek lisans, yükleme ve onay adımları ayrıca tamamlanmalıdır.': 'This document is a declaration based on the information the coach provides; it is not a licence certificate issued by a rights holder or by FIG. Any additional licensing, upload and approval steps in the current competition regulations must still be completed separately.',
    'Önemli:': 'Important:',
    'YARIŞMA ADI': 'COMPETITION NAME',
    'Örn. Türkiye Şampiyonası 2026': 'e.g. Turkish Championships 2026',
    'BRANŞ': 'DISCIPLINE',
    'Aerobik Cimnastik': 'Aerobic Gymnastics',
    'Akrobatik Cimnastik': 'Acrobatic Gymnastics',
    'Artistik Cimnastik': 'Artistic Gymnastics',
    'Ritmik Cimnastik': 'Rhythmic Gymnastics',
    'Çocuk Fitness': 'Children Fitness',
    'SPORCU / TAKIM': 'ATHLETE / TEAM',
    'ANTRENÖR': 'COACH',
    'MÜZİK ADI': 'TRACK NAME',
    'SANATÇI / BESTECİ': 'ARTIST / COMPOSER',
    'MÜZİK SÜRESİ': 'TRACK DURATION',
    'Örn. 01:30': 'e.g. 01:30',
    'HAK KULLANIM DAYANAĞI': 'BASIS OF USE',
    'Hak sahibinden yazılı izin / lisans': 'Written permission / licence from the rights holder',
    'Royalty-free lisans': 'Royalty-free licence',
    'Kamu malı / public domain': 'Public domain',
    'Organizatör / federasyon platformunda bildirilecek': 'To be declared on the organiser / federation platform',
    'LİSANS / KAYNAK BAĞLANTISI VEYA BELGE NO': 'LICENCE / SOURCE LINK OR DOCUMENT NO',
    'Varsa lisans numarası veya bağlantı': 'Licence number or link, if any',
    'EK AÇIKLAMA': 'ADDITIONAL NOTES',
    'Yarışma talimatındaki özel notlar': 'Special notes from the competition regulations',
    'Verdiğim bilgilerin doğru olduğunu, kullanım hakkı ve yarışma koşullarından sorumlu olduğumu beyan ederim.': 'I declare that the information I have given is accurate and that I am responsible for the usage rights and the competition conditions.',
    'PDF BEYANI OLUŞTUR': 'CREATE PDF DECLARATION',

    /* ---- müzik araştır ---- */
    'MÜZİĞİNİ': 'RESEARCH',
    'ARAŞTIR.': 'YOUR SONG.',
    'Beğendiğin şarkıyı yaz. Araştırma bağlantısını seçtiğin kişiyle özel olarak paylaş; düzenleme sürecine birlikte başlayın.': 'Write down the song you like. Share the research link privately with the person you choose and start the arrangement process together.',

    /* ---- tam site kapsam denetimi ---- */
    'Ajan ofisi haritası': 'Agent office map',
    'EKİP ALANI': 'TEAM AREA',
    'Sohbet hazırlanıyor…': 'Preparing chat…',
    'Parçanın enerji dağılım grafiği': 'Track energy distribution chart',
    'Parçadaki konum': 'Position in track',
    'Davet QR provası': 'Invitation QR test',
    'Panelin davet penceresindeki QR, gerçek bir okuyucuyla çözülebiliyor mu? Aynı fonksiyon çağrılır, görsel tuvale çizilir ve jsQR ile okunur.': 'Can the QR in the panel invitation window be decoded by a real reader? The same function runs, the image is drawn to a canvas and read with jsQR.',
    'QR hazırlanıyor…': 'Preparing QR…',
    'QR\'ın taşıdığı metin:': 'Text stored in the QR:',
    'QR\'a gömülen şube kodu:': 'Branch code embedded in the QR:',
    'Okuma sürüyor…': 'Reading…',
    'Canlı prova — örnek veri': 'Live test — sample data',
    'canlı': 'live',
    'Beni hatırla': 'Remember me',
    'ONAYLA — PROJELERİM\'E EKLE': 'APPROVE — ADD TO MY PROJECTS',
    'Bu isteğin parça bilgisi okunamadı.': 'The track details for this request could not be read.',
    'Sohbet bağlantısı hazırlanıyor.': 'Preparing the chat connection.',
    'Mesaj şifrelenemedi.': 'The message could not be encrypted.',
    'Tarayıcı otomatik çalmayı engelledi. Başlatmak için oynat düğmesine dokunun.': 'Your browser blocked autoplay. Tap the play button to start.',
    'Yayın saatleri dışında.': 'Outside broadcast hours.',
    'Parça açılamadı.': 'The track could not be opened.',
    'Şirket, yetkili ve e-posta alanları gerekli.': 'Company, contact person and email are required.',
    'Gönderiliyor…': 'Sending…',
    'Talebiniz alındı. En kısa sürede size dönüş yapacağız.': 'We received your request and will get back to you shortly.',
    'Bu demo için henüz erişimin yok. Yönetici erişim verdiğinde not bırakabilirsin.': 'You do not have access to this demo yet. You can leave notes once an administrator grants access.',
    'Bu nokta için bir mesaj yaz veya ses kaydet.': 'Write a message or record audio for this point.',
    'Mikrofon açılamadı. Tarayıcı iznini kontrol et veya yazılı not ekle.': 'The microphone could not be opened. Check browser permission or add a written note.',
    'Bu araç yalnızca yöneticilere açıktır.': 'This tool is available to administrators only.',
    'Parça adı gerekli.': 'Track name is required.',
    'Bütün geçişler uyumlu.': 'All transitions are compatible.',
    'Oturum bulunamadı, lütfen tekrar giriş yapın.': 'No session was found. Please sign in again.',
    'Beklenmeyen bir hata oluştu.': 'An unexpected error occurred.',
    'Davet gönderildi.': 'Invitation sent.',
    'Bilgileri doldurup PDF beyanını indir.': 'Complete the details and download the PDF declaration.',
    'Bu form, beyan sahibinin verdiği bilgilere dayanır; telif lisansı veya FIG onayı değildir.': 'This form is based on information supplied by the declarant; it is not a copyright licence or FIG approval.',
    'Araç hazırlanıyor.': 'Preparing the tool.',
    'Önce şarkı adını yaz.': 'Enter the song title first.',
    'Gönderildi. Derin onaylayınca Projelerim sayfasından takip edebilirsin.': 'Sent. Once Derin approves it, you can follow it from My Projects.',
    'Filtreyle eşleşen bekleyen ödeme yok.': 'No pending payments match the filter.',
    'Önümüzdeki 60 günde ödemesi gelen abonelik yok.': 'No subscription payment is due in the next 60 days.',
    'Ödeme yöntemi': 'Payment method',
    'Projeler alınamadı:': 'Projects could not be loaded:',
    'Not gönderildi.': 'Note sent.',
    'Ses açılamadı.': 'Audio could not be opened.',
    'Yeni token (değiştirmek için)': 'New token (to replace)',
    'BotFather tokenı: 123456789:AA…': 'BotFather token: 123456789:AA…',
    'Bu panel yalnızca yöneticilere açıktır.': 'This panel is available to administrators only.',
    'En az bir şube işaretle.': 'Select at least one branch.',
    'Bu klasörde çalınacak parça yok.': 'There are no tracks to play in this folder.',
    'Yayın saati güncellendi.': 'Broadcast hours updated.',
    'Sayfa yüklenemedi:': 'Page could not be loaded:',
    'Görüşüldü': 'Contacted',
    'Teklif gönderildi': 'Proposal sent',
    'Anlaştı': 'Won',
    'Olmadı': 'Lost',
    'Ses Tasarımı': 'Sound Design',
    'Ses Tasarımı & Film Scoring': 'Sound Design & Film Scoring'
  };

  /* JS'ten çağrılan metinlerin Türkçe karşılıkları (sayfada karşılığı yok). */
  const TR = {
    'sd.hata': 'Lütfen zorunlu alanları doldur.',
    'sd.gonderiliyor': 'GÖNDERİLİYOR...',
    'sd.tesekkur': 'Teşekkürler! En kısa sürede dönüş yapacağız.',
    'sd.basarisiz': 'Bir şeyler ters gitti, lütfen tekrar dene ya da WhatsApp/telefon ile ulaş.',

    'hesap.hesabim': 'HESABIM',
    'shell.beniHatirla': 'Beni hatırla',
    'auth.sozlesme': 'Kullanıcı Sözleşmesi',
    'auth.aydinlatma': 'Aydınlatma Metni',
    'auth.onay': '{sozlesme}’ni okudum ve kabul ediyorum; {aydinlatma}’ni okudum.',
    'auth.yenidenGonder': 'ONAY E-POSTASINI YENİDEN GÖNDER',
    'auth.onayBekliyor': 'Kayıt oluşturuldu. E-postandaki onay bağlantısını açtıktan sonra giriş yap.',
    'auth.sayacEtiket': '{dugme} — {sayi} yeni bildirim',

    'cf.alanlar': 'Şirket, yetkili ve e-posta alanları gerekli.',
    'cf.gonderiliyor': 'Gönderiliyor…',
    'cf.hata': 'Gönderilemedi: ',
    'cf.tesekkur': 'Talebiniz alındı. En kısa sürede size dönüş yapacağız.'
  };

  const trYedek = new Map();
  const trEtiket = new Map();
  const trYerine = new Map();
  const trAlt = new Map();
  let trBaslik = '';
  let trAciklama = '';
  let dugme = null;

  const aktif = () => document.documentElement.getAttribute('data-dil') === 'en';

  function dilSec() {
    // Paylaşılan bağlantıdaki ?dil= her zaman kazanır; yoksa son seçim geçerli.
    const parametre = new URLSearchParams(location.search).get('dil');
    if (/^(tr|en)$/.test(parametre)) return parametre;
    let kayitli = '';
    try { kayitli = localStorage.getItem(DEPO) || ''; } catch (e) { /* gizli mod */ }
    if (/^(tr|en)$/.test(kayitli)) return kayitli;
    return 'tr';
  }

  function metin(anahtar, varsayilan) {
    if (aktif() && EN[anahtar]) return EN[anahtar];
    if (TR[anahtar]) return TR[anahtar];
    return varsayilan === undefined ? anahtar : varsayilan;
  }

  /* ---------- Otomatik mod ----------
     data-dil-otomatik taşıyan sayfalarda metinler data-i18n ile tek tek
     işaretlenmez: her metin düğümünün (ve placeholder/aria-label/title/alt
     değerinin) Türkçesi METIN sözlüğünde aranır. Eşleşme yoksa metin Türkçe
     kalır — eksik çeviri sayfayı bozmaz. JS'in sonradan bastığı içerik
     MutationObserver ile yakalanır. Türkçeye dönerken her düğümün aslı
     WeakMap'te tutulduğu için metin birebir eski hâline döner. */
  const OTOMATIK = document.documentElement.hasAttribute('data-dil-otomatik');
  const ATLA = 'script,style,noscript,template,code,pre,textarea,[data-i18n],[data-dil-yok]';
  const NITELIK = ['placeholder', 'aria-label', 'title', 'alt'];
  const yaziYedek = new WeakMap();
  const nitelikYedegi = new WeakMap();
  let gozlemci = null;

  const cevir = tr => (aktif() && METIN[tr] !== undefined ? METIN[tr] : tr);

  function yaziCevir(dugum) {
    const ebeveyn = dugum.parentElement;
    if (!ebeveyn || ebeveyn.closest(ATLA)) return;
    const ham = dugum.nodeValue || '';
    const kirp = ham.trim();
    if (kirp.length < 2) return;
    if (aktif()) {
      // HTML'deki satır sonu/girinti boşlukları eşleşmeyi bozmaz.
      const ing = METIN[kirp.replace(/\s+/g, ' ')];
      if (ing === undefined || ing === kirp) return;
      // <option> metni aynı zamanda form değeridir: değeri sabitle ki veri Türkçe kalsın.
      if (ebeveyn.tagName === 'OPTION' && !ebeveyn.hasAttribute('value')) ebeveyn.setAttribute('value', kirp);
      const yeni = ham.replace(kirp, ing);
      yaziYedek.set(dugum, { tr: ham, en: yeni });
      if (yeni !== ham) dugum.nodeValue = yeni;
      return;
    }
    const kayit = yaziYedek.get(dugum);
    if (kayit && ham === kayit.en && kayit.tr !== ham) dugum.nodeValue = kayit.tr;
  }

  function nitelikCevir(el) {
    if (!el || !el.getAttribute || el.closest(ATLA)) return;
    let kayit = nitelikYedegi.get(el);
    NITELIK.forEach(ad => {
      if (!el.hasAttribute(ad)) return;
      const ham = el.getAttribute(ad);
      if (aktif()) {
        const ing = METIN[ham.trim()];
        if (ing === undefined || ing === ham) return;
        if (!kayit) { kayit = {}; nitelikYedegi.set(el, kayit); }
        kayit[ad] = ham;
        el.setAttribute(ad, ing);
        return;
      }
      if (kayit && kayit[ad] !== undefined && ham === METIN[kayit[ad].trim()]) el.setAttribute(ad, kayit[ad]);
    });
  }

  function elemanCevir(el) {
    if (!el || el.nodeType !== 1 || el.closest(ATLA)) return;
    nitelikCevir(el);
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) yaziCevir(c);
      else if (c.nodeType === 1) elemanCevir(c);
    }
  }

  function otomatikUygula() {
    if (!OTOMATIK || !document.body) return;
    elemanCevir(document.body);
  }

  function gozlemle() {
    if (!OTOMATIK || gozlemci || typeof MutationObserver !== 'function' || !document.body) return;
    let bekleyen = [];
    let zaman = 0;
    const bosalt = () => {
      zaman = 0;
      const isler = bekleyen; bekleyen = [];
      isler.forEach(dugum => (dugum.nodeType === 3 ? yaziCevir(dugum) : elemanCevir(dugum)));
    };
    gozlemci = new MutationObserver(kayitlar => {
      kayitlar.forEach(k => {
        if (k.type === 'characterData') bekleyen.push(k.target);
        else if (k.type === 'childList') k.addedNodes.forEach(d => { if (d.nodeType === 3 || d.nodeType === 1) bekleyen.push(d); });
      });
      if (bekleyen.length && !zaman) zaman = setTimeout(bosalt, 30);
    });
    gozlemci.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function uygula(dil) {
    const ing = dil === 'en';
    document.documentElement.lang = ing ? 'en' : 'tr';
    document.documentElement.setAttribute('data-dil', ing ? 'en' : 'tr');

    document.querySelectorAll('[data-i18n]').forEach(el => {
      if (!trYedek.has(el)) trYedek.set(el, el.innerHTML);
      el.innerHTML = ing && EN[el.dataset.i18n] ? EN[el.dataset.i18n] : trYedek.get(el);
    });

    document.querySelectorAll('[data-i18n-etiket]').forEach(el => {
      if (!trEtiket.has(el)) trEtiket.set(el, el.getAttribute('aria-label') || '');
      const ceviri = EN[el.dataset.i18nEtiket];
      el.setAttribute('aria-label', ing && ceviri ? ceviri : trEtiket.get(el));
    });

    document.querySelectorAll('[data-i18n-yerine]').forEach(el => {
      if (!trYerine.has(el)) trYerine.set(el, el.getAttribute('placeholder') || '');
      const ceviri = EN[el.dataset.i18nYerine];
      el.setAttribute('placeholder', ing && ceviri ? ceviri : trYerine.get(el));
    });

    document.querySelectorAll('[data-i18n-alt]').forEach(el => {
      if (!trAlt.has(el)) trAlt.set(el, el.getAttribute('alt') || '');
      const ceviri = EN[el.dataset.i18nAlt];
      el.setAttribute('alt', ing && ceviri ? ceviri : trAlt.get(el));
    });

    const baslikEn = document.documentElement.getAttribute('data-baslik-en');
    if (!trBaslik) trBaslik = document.title;
    document.title = ing && baslikEn ? baslikEn : trBaslik;

    const aciklama = document.querySelector('meta[name="description"]');
    if (aciklama) {
      if (!trAciklama) trAciklama = aciklama.getAttribute('content') || '';
      const ceviri = aciklama.getAttribute('data-en');
      aciklama.setAttribute('content', ing && ceviri ? ceviri : trAciklama);
    }

    if (dugme) {
      dugme.textContent = ing ? 'TR' : 'EN';
      const etiket = ing ? 'Türkçeye geç' : 'Switch to English';
      dugme.setAttribute('aria-label', etiket);
      dugme.setAttribute('title', etiket);
    }

    if (OTOMATIK) otomatikUygula();
  }

  function dugmeKur() {
    dugme = document.createElement('button');
    dugme.type = 'button';
    dugme.className = 'dil-dugme';
    dugme.setAttribute('data-dil-yok', '');
    dugme.addEventListener('click', () => {
      const yeni = aktif() ? 'tr' : 'en';
      try { localStorage.setItem(DEPO, yeni); } catch (e) { /* gizli mod */ }
      uygula(yeni);
      document.dispatchEvent(new CustomEvent('derin:dil', { detail: yeni }));
    });

    const marka = document.querySelector('header .wordmark');
    if (marka && marka.parentNode) {
      const sarma = document.createElement('div');
      sarma.className = 'dil-sarma';
      marka.parentNode.insertBefore(sarma, marka);
      sarma.append(marka, dugme);
      return;
    }
    dugme.classList.add('dil-dugme-sabit');
    document.body.appendChild(dugme);
  }

  window.DerinDil = {
    dil: () => (aktif() ? 'en' : 'tr'),
    metin,
    cevir,
    otomatik: OTOMATIK,
    uygula
  };

  dugmeKur();
  const baslangic = dilSec();
  uygula(baslangic);
  gozlemle();
  // İlk uygulamada da haber ver: sayfa betikleri dil motorundan önce çizmiş
  // olabileceği için (ör. Supabase'ten gelen plan kartları) yeniden çizerler.
  document.dispatchEvent(new CustomEvent('derin:dil', { detail: baslangic }));
})();
