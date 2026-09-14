# Derin Record hesap sistemi kurulumu

1. Supabase'te yeni bir proje açın. Authentication bölümünde e-posta/şifre girişinin açık olduğundan emin olun.
2. SQL Editor'ü açın; `derin-record.sql` dosyasının tamamını bir kez çalıştırın.
3. Siteden kendi yönetici hesabınızı e-posta ve şifreyle kaydedin. E-posta onayı açıksa gelen bağlantıyı açın.
4. SQL Editor'de dosyanın sonundaki örnek satırdaki e-posta adresini kendi adresinizle değiştirip çalıştırın. Bu hesabı yönetici yapar.
5. Project Settings > API alanından **Project URL** ve **Publishable / anon key** değerlerini `config.js` içine girin. Secret veya service_role key kullanılmaz.
6. Yönetim panelinden antrenörlere demo erişimi verin. Erişim verilmemiş antrenörler not ekranını açamaz.

E-posta onayı ve mikrofon izinlerinin sorunsuz çalışması için siteyi HTTPS ile yayınlayın; Supabase Authentication ayarlarında yayın adresini Site URL ve Redirect URLs alanlarına ekleyin.
