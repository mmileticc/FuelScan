# FuelScan - PWA za skeniranje QR kodova sa računa

Aplikacija za skeniranje QR kodova sa računa za gorivo i praćenje potrošnje.

## 🚀 Brzi Start

### Lokalni razvoj (localhost)

```bash
# Koristi Live Server ili unit http-server
npx http-server
# ili koristi VS Code Live Server ekstenziju
```

### 🔧 Podešavanje Firebase-a

#### 1. Додај domena u Firebase Console

1. Otvori [Firebase Console](https://console.firebase.google.com)
2. Odaberi projekt `fuelscan-9ea34`
3. Idi na **Authentication → Settings → Authorized domains**
4. Dodaj sledeće domene:
   - `localhost` ✅
   - `127.0.0.1` ✅
   - `YOUR_USERNAME.github.io` ✅ (za GitHub Pages)

#### 2. GitHub Pages Deployment

```bash
# 1. Kreiraj GitHub repo sa nazivom: YOUR_USERNAME.github.io

# 2. Kloniraj lokalni projekat
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_USERNAME.github.io.git
git push -u origin main

# 3. Projekat će biti dostupan na:
# https://YOUR_USERNAME.github.io/ReciptScanner
```

#### 3. Dodaj GitHub Pages domen u Firebase

Nakon što deploajuješ na GitHub Pages:

1. Ponovi korake iz sekcije 1
2. Dodaj `YOUR_USERNAME.github.io` u Authorized domains

---

## 📋 Konfiguracija

### Firebase Config (`index.html`)

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};
```

### Supabase Config (`script.js`)

```javascript
const SUPABASE_URL    = "https://YOUR_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

### Backend API (`script.js`)

```javascript
const BACKEND_API_URL = "https://api.yourapp.com/parse-receipt";
```

---

## 🛠️ Struktura Projekta

```
├── index.html       # PWA manifest, HTML struktura
├── script.js        # Sva logika (Firebase, QR, navigacija)
├── style.css        # Tailwind CSS
├── manifest.json    # PWA metadata
├── sw.js           # Service Worker (offline)
└── README.md       # Ovaj fajl
```

---

## 🔐 Firebase Authorized Domains

**VAŽNO:** Firebase zahteva da dodate sve domene gde će aplikacija biti dostupna:

- **Lokalno:** `localhost`, `127.0.0.1`
- **GitHub Pages:** `username.github.io`
- **Custom domena:** `yourdomain.com`

❌ **NE možete dodati portove:** Firebase ne dozvoljava `localhost:5500`

---

## 📱 PWA Funkcionalnosti

- ✅ Instalacija na početnom ekranu
- ✅ Offline podrška (Service Worker)
- ✅ Responsive design (Mobile-first)
- ✅ Google Auth (Firebase)
- ✅ QR kod skeniranje (html5-qrcode)

---

## 🎯 Sledeći Koraci

1. **Testiraj lokalno** sa `localhost` + Firefox/Chrome
2. **Dodaj domen u Firebase** Authorized domains
3. **Deploaj na GitHub Pages**
4. **Testiraj na produkciji**

---

## 🔒 Bezbednost - PRE GitHub Deployment

### ✅ Što je BEZBEDNO da bude na GitHubu:

- ✅ Firebase `apiKey` - to je **JAVNI ključ** za web aplikacije
- ✅ `authDomain`, `projectId`, `appId` - to su javne konfiguracije
- ✅ QR skeniranje logika - to je front-end kod
- ✅ CSS i HTML struktura - javno dostupno

### ❌ Što NIKADA ne treba na GitHubu:

- ❌ Backend API ključevi / tokeni
- ❌ Supabase `ANON_KEY` sa pisanjem pristupa (ako imaš)
- ❌ Environment varijable sa tajnama
- ❌ Database credentials
- ❌ OAuth 2.0 tajni ključ (client_secret)

### 🛡️ Trenutni Status:

✅ **BEZBEDNO ZA GITHUB:**
- Svi ključevi koji su na GitHubu su javni (Firebase web config)
- `.gitignore` je konfiguriran da blokiruje `.env` i lokalnu konfiguraciju
- Nema izložene backend tajnosti

⚠️ **Preporuke:**

1. **Koristi Firebase Security Rules** umesto backend API-ja:
```javascript
// Dozvoli samo autentifikovane korisnike
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /receipts/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

2. **Ako koristiš Backend:**
   - Backend mora da se hostuje na privatnom serveru
   - Koristi `.env` lokalno, nikada ne pushuj na GitHub
   - Backend bi trebao da validira Firebase `idToken`

3. **CORS Zaštita:**
   - Backend mora da bude na `https://` (ne `http://`)
   - Postavi CORS policy da dozvoli samo `yourdomain.github.io`

---

## ⚠️ Česta Greška

**Greška:** `auth/unauthorized-domain`

**Rješenje:**
- Provjeri da li je domena u Firebase Authorized domains
- Osvježi stranicu (Ctrl+F5)
- Očisti browser cache

---

## 🚀 GitHub Deployment Checklist

- [ ] Provjeri da li je `.gitignore` kreiran
- [ ] Nema `.env` fajla u Git repoзиторијуmu
- [ ] Dodaj `YOUR_USERNAME.github.io` u Firebase Authorized domains
- [ ] `git add .` i `git commit -m "Deploy to GitHub Pages"`
- [ ] `git push origin main`
- [ ] Testiraj na `https://YOUR_USERNAME.github.io`

---

## 📞 Support

Za pitanja ili greške, kontaktiraj administratora.

