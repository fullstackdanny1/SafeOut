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
        footer: "dispatch active &middot; confidential",
        confirm_escort_title: "Escort Request",
        confirm_escort_msg: "Staff will be notified immediately to assist you to the exit.",
        confirm_em_title: "Emergency Alert",
        confirm_em_msg: "This will log an emergency alert and prompt to dial 112.",
        btn_confirm: "Confirm & Send",
        btn_cancel: "Cancel"
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
        footer: "dispecerat activ &middot; confidențial",
        confirm_escort_title: "Solicitare Escortă",
        confirm_escort_msg: "Echipa de securitate/personalul va fi notificat imediat.",
        confirm_em_title: "Alertă de Urgență",
        confirm_em_msg: "Se va înregistra un incident critic și se va iniția apelul la 112.",
        btn_confirm: "Confirmă și Trimite",
        btn_cancel: "Anulează"
    }
};

let CUR_LANG = 'en';
let pendingActionType = null;

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
    // 1. Evităm cererea la server pentru ID-uri de demo/test local
    if (QR_ID === 'demo' || QR_ID === 'demo-venue') {
        currentQRInfo = {
            id: QR_ID,
            venue: "Locație Demo (Offline)",
            placement: "Main Area",
            city: "București"
        };
        return;
    }

    // 2. Pentru QR-uri reale, apelăm serverul
    try {
        currentQRInfo = await api.getQr(QR_ID);
    } catch (error) {
        // Afișăm un mesaj scurt în loc să aruncăm întreaga stivă de erori
        console.warn('Datele QR nu au fost găsite pe server, se folosește fallback local:', error.message || error);
        currentQRInfo = {
            id: QR_ID,
            venue: "Locație Necunoscută",
            placement: "Nespecificat",
            city: "Nespecificat"
        };
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

// 3. Captură de Dovezi (Audio/Video/Foto)
async function capturePhoto(facing) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
        const video = document.createElement('video');
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        await video.play();
        await new Promise(r => setTimeout(r, 600));
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
    if (!incidentId) return;
    const uploads = [];
    if (photos && photos.back) uploads.push(api.addEvidence({ incident_id: incidentId, file_type: 'photo', storage_url: photos.back }));
    if (photos && photos.front) uploads.push(api.addEvidence({ incident_id: incidentId, file_type: 'photo', storage_url: photos.front }));
    if (audio) uploads.push(api.addEvidence({ incident_id: incidentId, file_type: 'audio', storage_url: audio }));
    await Promise.allSettled(uploads);
}

// 4. Salvare Incident & Navigare
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
        return await api.createIncident(incidentData);
    } catch (error) {
        console.error("Eroare la trimiterea incidentului la API:", error);
        return null;
    }
}

function showScreen(id) {
    document.querySelectorAll('.screen, .view').forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    const target = document.getElementById(id);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
    }
}

function goBack() {
    const main = document.getElementById('screen-home') || document.getElementById('mainMenu') || document.getElementById('main-menu');
    if (main) {
        showScreen(main.id);
    } else {
        showScreen('screen-home');
    }
}

// 5. Logica de Modal, Sheet & Confirmare Incident
function showConfirm(type) {
    pendingActionType = type;
    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMsg');
    const dict = I18N[CUR_LANG];

    if (type === 'escort') {
        if (titleEl) titleEl.textContent = dict.confirm_escort_title;
        if (msgEl) msgEl.textContent = dict.confirm_escort_msg;
    } else if (type === 'emergency' || type === '112') {
        if (titleEl) titleEl.textContent = dict.confirm_em_title;
        if (msgEl) msgEl.textContent = dict.confirm_em_msg;
    }

    showScreen('screen-confirm');
}

async function confirmAction() {
    const type = pendingActionType || 'escort';
    showScreen('screen-success');

    const res = await recordIncident(type);
    const incidentId = res ? res.id : null;

    if (type === 'emergency' || type === '112') {
        setTimeout(() => { window.location.href = 'tel:112'; }, 800);
    }

    if (incidentId) {
        Promise.all([
            captureBothPhotos(),
            captureAudio(5)
        ]).then(([photos, audio]) => {
            uploadEvidence(incidentId, photos, audio);
        }).catch(err => console.warn('Nu s-au putut colecta dovezile media:', err));
    }
}

function openSheet() {
    const sheet = document.getElementById('sheetOverlay');
    if (sheet) {
        sheet.classList.add('open');
        loadContactsIntoSheet();
    }
}

function closeSheet() {
    const sheet = document.getElementById('sheetOverlay');
    if (sheet) sheet.classList.remove('open');
}

function recordContactPing() {
    api.recordContactPing().catch(() => {});
}

async function loadContactsIntoSheet() {
    const listEl = document.getElementById('contactList');
    if (!listEl) return;
    
    const supported = ('contacts' in navigator && 'ContactsManager' in window);
    if (!supported) {
        listEl.innerHTML = `<div style="padding:22px 20px;text-align:center;color:var(--text2);font-size:13px;font-weight:300;line-height:1.6">
      Dispozitivul tău nu suportă selectarea contactelor direct din browser.<br><br>
      <span style="color:var(--text3);font-size:12px">Pe Android Chrome vei putea vedea contactele aici. Pe iOS, această funcționalitate nu este încă disponibilă.</span>
    </div>`;
        return;
    }
    listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text2);font-size:13px">Apasă mai jos pentru a alege din agendă</div>
    <button class="contact-item" onclick="pickContact()" style="justify-content:center;color:var(--teal)">
      <div class="contact-info" style="flex:none"><span class="contact-name" style="color:var(--teal)">Deschide agenda de contacte</span></div>
    </button>`;
}

async function pickContact() {
    try {
        const props = ['name', 'tel'];
        const opts = { multiple: false };
        const contacts = await navigator.contacts.select(props, opts);
        if (contacts && contacts.length) {
            const chosen = contacts[0];
            const tel = (chosen.tel && chosen.tel[0]) ? chosen.tel[0].replace(/\s+/g, '') : '';
            closeSheet();

            showScreen('screen-confirm');
            const metaLoc = document.getElementById('metaLoc');
            if (metaLoc) metaLoc.textContent = 'Obținem locația ta...';

            const loc = await getLocation();

            recordContactPing();
            if (metaLoc) metaLoc.textContent = 'Mesaj pregătit';

            let mapsLink = '';
            if (loc.lat && loc.lng) mapsLink = ' Locația mea: https://maps.google.com/?q=' + loc.lat + ',' + loc.lng;
            const body = 'Am nevoie să mă suni ACUM. Sunt într-o situație în care nu mă simt în siguranță.' + mapsLink + ' (Trimis prin SafeOut)';

            if (tel) {
                const smsHref = 'sms:' + tel + (/(iPhone|iPad|Macintosh)/.test(navigator.userAgent) ? '&' : '?') + 'body=' + encodeURIComponent(body);
                setTimeout(() => { window.location.href = smsHref; }, 600);
            }
        }
    } catch (e) {
        closeSheet();
    }
}

// 6. Expunere pe window pentru Handlerele Inline (onclick în HTML)
window.setLang = setLang;
window.goBack = goBack;
window.showInfo = () => showScreen('screen-info');
window.showConfirm = showConfirm;
window.confirmAction = confirmAction;
window.openSheet = openSheet;
window.closeSheet = closeSheet;
window.pickContact = pickContact;

// 7. Event listeners & Inițializare
document.addEventListener('DOMContentLoaded', () => {
    initLang();
    fetchQRInfo();

    const langROBtn = document.getElementById('langRO');
    const langENBtn = document.getElementById('langEN');
    if (langROBtn) langROBtn.addEventListener('click', () => setLang('ro'));
    if (langENBtn) langENBtn.addEventListener('click', () => setLang('en'));

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