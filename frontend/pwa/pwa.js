import { api } from '../shared/api-client.js';

// ============================================================
// SafeOut PWA - Logica aplicației mobilă (Utilizator final)
// ============================================================

// 1. Inițializare și Configurare limbă (I18N)
const I18N = {
    en: {
        main_title: "Do you need<br>help right now?",
        main_sub: "Tap a button. We're here.",
        escort_label: "Get me out",
        escort_desc: "Staff will escort you safely to the exit",
        contact_label: "Call somebody",
        contact_desc: "Alert a trusted contact with your location",
        emergency: "emergency",
        em_label: "112 &mdash; I'm in danger",
        em_desc: "Location + metadata sent to authorities",
        about_label: "About SafeOut",
        about_desc: "Who we are &middot; how each button works",
        footer: "dispatch active &middot; confidential"
    },
    ro: {
        main_title: "Ai nevoie de<br>ajutor acum?",
        main_sub: "Apasă un buton. Suntem aici.",
        escort_label: "Scoate-mă de aici",
        escort_desc: "Personalul te va conduce în siguranță spre ieșire",
        contact_label: "Sună pe cineva",
        contact_desc: "Anunță o persoană de încredere cu locația ta",
        emergency: "urgență",
        em_label: "112 &mdash; sunt în pericol",
        em_desc: "Locația + datele trimise autorităților",
        about_label: "Despre SafeOut",
        about_desc: "Cine suntem &middot; cum funcționează fiecare buton",
        footer: "dispecerat activ &middot; confidențial"
    }
};

let CUR_LANG = 'en';

function setLang(lang) {
    CUR_LANG = (lang === 'ro') ? 'ro' : 'en';
    const dict = I18N[CUR_LANG];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key] !== undefined) el.innerHTML = dict[key];
    });
    const ro = document.getElementById('langRO');
    const en = document.getElementById('langEN');
    if (ro && en) {
        ro.classList.toggle('active', CUR_LANG === 'ro');
        en.classList.toggle('active', CUR_LANG === 'en');
    }
    try { localStorage.setItem('safeout_lang', CUR_LANG); } catch (e) { }
    document.documentElement.lang = CUR_LANG;
}

function initLang() {
    let lang = null;
    try { lang = localStorage.getItem('safeout_lang'); } catch (e) { }
    if (!lang) {
        const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
        lang = nav.startsWith('ro') ? 'ro' : 'en';
    }
    setLang(lang);
}

// 2. Gestionare QR Code & Geolocation
const QR_ID = new URLSearchParams(window.location.search).get('q') || 'demo';
let currentQRInfo = null;

async function fetchQRInfo() {
    if (QR_ID === 'demo') return null;
    try {
        currentQRInfo = await api.get(`/qr-codes/${QR_ID}`);
        // Logica optională: marchează ca scanat direct via API dacă vrei statistici per-scan
        await api.post(`/qr-codes/${QR_ID}/scan`);
    } catch (error) {
        console.warn('Eroare la încărcarea datelor QR:', error);
    }
}

function getLocation() {
    return new Promise(resolve => {
        if (!navigator.geolocation) return resolve({ lat: null, lng: null, accuracy: null, method: 'unavailable' });
        navigator.geolocation.getCurrentPosition(
            p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, method: p.coords.accuracy < 50 ? 'gps' : 'wifi' }),
            () => resolve({ lat: null, lng: null, accuracy: null, method: 'unavailable' }),
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    });
}

// 3. Captură de Dovezi (Evidență Audio/Video/Foto)
async function capturePhoto(facing) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
        const video = document.createElement('video');
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        await video.play();
        await new Promise(r => setTimeout(r, 600)); // focus time
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        stream.getTracks().forEach(t => t.stop());
        return canvas.toDataURL('image/jpeg', 0.7);
    } catch (e) { return null; }
}

async function captureBothPhotos() {
    const back = await capturePhoto('environment');
    const front = await capturePhoto('user');
    return { back, front };
}

async function captureAudio(seconds) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        const chunks = [];
        rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        const done = new Promise(resolve => { rec.onstop = () => resolve(); });
        rec.start();
        await new Promise(r => setTimeout(r, (seconds || 5) * 1000));
        rec.stop();
        await done;
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: chunks[0] ? chunks[0].type : 'audio/webm' });
        return await new Promise(resolve => { const fr = new FileReader(); fr.onloadend = () => resolve(fr.result); fr.readAsDataURL(blob); });
    } catch (e) { return null; }
}

async function uploadEvidence(incidentId, photos, audio) {
    const uploads = [];
    if (photos.back) uploads.push(api.addEvidence({ incident_id: incidentId, file_type: 'photo', storage_url: photos.back }));
    if (photos.front) uploads.push(api.addEvidence({ incident_id: incidentId, file_type: 'photo', storage_url: photos.front }));
    if (audio) uploads.push(api.addEvidence({ incident_id: incidentId, file_type: 'audio', storage_url: audio }));
    await Promise.allSettled(uploads);
}

// 4. Salvare Incident & Navigare (Screens)
async function recordIncident(type, extra = {}) {
    let loc;
    if (currentQRInfo && currentQRInfo.lat && currentQRInfo.lng) {
        loc = { lat: currentQRInfo.lat, lng: currentQRInfo.lng, accuracy: 5, method: 'qr_fixed' };
    } else {
        loc = await getLocation();
    }

    const incidentData = {
        situation_type: type,
        qr_code_id: QR_ID,
        venue_name: currentQRInfo ? currentQRInfo.venue : null,
        placement: currentQRInfo ? currentQRInfo.placement : null,
        city: currentQRInfo ? (currentQRInfo.city || null) : null,
        latitude: loc.lat,
        longitude: loc.lng,
        location_accuracy_m: loc.accuracy,
        location_method: loc.method,
        ...extra
    };

    try {
        const result = await api.post('/incidents', incidentData);
        return result;
    } catch (error) {
        console.error("Eroare la trimiterea incidentului la API:", error);
        return null;
    }
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
}

// 5. Acțiuni și Evenimente Utilitare
let _pendingAction = null;

window.showConfirm = function(type) {
    _pendingAction = type;
    // Logica de actualizare a textelor din ecranul de consens rămâne aceeași
    const configs = {
        escort: { header: 'Get me out', btn: 'Alert staff & share location' },
        contact: { header: 'Call somebody', btn: 'Choose a contact' },
        '112': { header: 'Emergency — 112', btn: 'Send alert & share data' }
    };
    const cfg = configs[type] || configs.escort;
    
    const h = document.getElementById('consentHeader');
    const b = document.getElementById('consentAcceptBtn');
    if (h) h.textContent = cfg.header;
    if (b) b.textContent = cfg.btn;
    
    showScreen('screen-consent');
};

window.acceptConsent = async function() {
    const type = _pendingAction;
    if (type === 'contact') {
        openSheet();
        return;
    }
    
    if (type === '112') {
    showScreen('screen-confirm');
    const metaLoc = document.getElementById('metaLoc');
    if (metaLoc) metaLoc.textContent = 'Capturing photos…';

    const photos = await captureBothPhotos();
    if (metaLoc) metaLoc.textContent = 'Recording audio…';
    const audio = await captureAudio(5);
    if (metaLoc) metaLoc.textContent = 'Sending to API…';

    const result = await recordIncident('emergency', {
        consent_given: true,
        camera_granted: !!(photos.front || photos.back),
        mic_granted: !!audio,
        has_front_photo: !!photos.front,
        has_back_photo: !!photos.back,
        has_audio_recording: !!audio
    });

    if (result && result.id) {
        if (metaLoc) metaLoc.textContent = 'Uploading evidence…';
        await uploadEvidence(result.id, photos, audio);
    }

    if (metaLoc) metaLoc.textContent = 'Transmitted';
    return;
    }

    // Default: escort
    showScreen('screen-confirm');
    const metaLoc = document.getElementById('metaLoc');
    if (metaLoc) metaLoc.textContent = 'Acquiring…';
    await recordIncident('escort', { consent_given: true });
    if (metaLoc) metaLoc.textContent = 'Alert Sent';
};

function openSheet() {
    const overlay = document.getElementById('sheetOverlay');
    if (overlay) {
        overlay.classList.add('open');
        // Aici implementezi logica loadContactsIntoSheet
    }
}

// 6. Hook-uri Evenimente globale & Inițializare
document.addEventListener('DOMContentLoaded', () => {
    initLang();
    fetchQRInfo();

    // Event listeneri pentru butoanele de limbă (dacă există)
    const langROBtn = document.getElementById('langRO');
    const langENBtn = document.getElementById('langEN');
    if (langROBtn) langROBtn.addEventListener('click', () => setLang('ro'));
    if (langENBtn) langENBtn.addEventListener('click', () => setLang('en'));
    
    // Disguise logic pe logo
    const logoEl = document.querySelector('.logo-img');
    if (logoEl) {
        let tapCount = 0;
        let tapTimer;
        logoEl.addEventListener('click', () => {
            tapCount++;
            clearTimeout(tapTimer);
            if (tapCount >= 2) {
                showScreen('screen-disguise');
                tapCount = 0;
            } else {
                tapTimer = setTimeout(() => tapCount = 0, 500);
            }
        });
    }
});