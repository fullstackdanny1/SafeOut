import { api } from '../shared/api-client.js';

// ============================================================
// SafeOut PWA - Logica aplicației mobilă (Utilizator final)
// Flux: buton -> ecran de consimțământ -> acțiunea reală -> ecran de confirmare
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
        acquiring: 'Acquiring…',
        capturing_photos: 'Capturing photos…',
        recording_audio: 'Recording audio…',
        sending: 'Sending…',
        transmitted: 'Transmitted',
        transmitted_live: 'Transmitted · live',
        sent_no_gps: 'Sent (no GPS)',
        unavailable: 'Unavailable',
        getting_location: 'Getting your location…',
        message_prepared: 'Message prepared',
        send_failed: 'Not sent — check connection',
        dispatch_ok: 'Connected',
        dispatch_fail: 'Offline',
        call_112: 'Call 112 now',
        demo_venue: 'Demo venue',
        no_contacts_api: "Your device doesn't support picking contacts directly from the browser.<br><br><span style=\"color:var(--text3);font-size:12px\">On Android Chrome you'll see your real contacts here. On iPhone, this feature isn't available yet.</span>",
        pick_contacts_hint: 'Tap below to choose from your contacts',
        open_contacts: 'Open my contacts',
        sms_body: 'I need you to call me NOW. I am in a situation where I do not feel safe.',
        sms_location: ' My location: ',
        confirm: {
            escort: { title: 'Staff has been alerted', sub: 'A trained staff member is heading to you. Stay where you are if it is safe.' },
            emergency: { title: 'Alert sent', sub: 'Dispatch has your location. Call 112 now if you can talk safely.' },
            contact: { title: 'Contact alerted', sub: 'A message with your location is ready to send to your contact.' },
            failed: { title: 'Alert not sent', sub: 'We could not reach dispatch. Call 112 directly if you are in danger.' },
        },
        consent: {
            escort: {
                header: 'Get me out', title: 'Ask staff to help you leave?',
                sub: 'Trained staff will be alerted to escort you safely to the exit. Nothing is shared until you tap the button.',
                btn: 'Alert staff & share location',
                items: [['loc', 'Your location', 'So staff can find you inside the venue'], ['meta', 'Venue & time', 'Which QR you scanned and when']],
            },
            contact: {
                header: 'Call somebody', title: 'Alert one of your contacts?',
                sub: 'You will choose a contact. A message with your location will be prepared to send to them. Nothing is shared until you choose.',
                btn: 'Choose a contact',
                items: [['loc', 'Your location', 'Added to the message for your contact'], ['phone', 'A contact you pick', 'Only used to open a pre-filled message']],
            },
            '112': {
                header: 'Emergency — 112', title: 'Send emergency alert to 112?',
                sub: 'To help authorities reach and identify you, SafeOut will collect the following. Nothing is sent until you tap the button.',
                btn: 'Send alert & share data',
                items: [['loc', 'Your location', 'Precise GPS coordinates, updated live for 15 minutes'], ['cam', 'Photos', 'From your cameras to document the situation'],
                        ['mic', 'Audio recording', 'A few seconds of ambient audio'], ['meta', 'Device metadata', 'Timestamp and venue ID for the response team']],
            },
        },
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
        acquiring: 'Se obține…',
        capturing_photos: 'Se fac fotografii…',
        recording_audio: 'Se înregistrează audio…',
        sending: 'Se trimite…',
        transmitted: 'Transmisă',
        transmitted_live: 'Transmisă · live',
        sent_no_gps: 'Trimis (fără GPS)',
        unavailable: 'Indisponibilă',
        getting_location: 'Obținem locația ta…',
        message_prepared: 'Mesaj pregătit',
        send_failed: 'Netrimis — verifică conexiunea',
        dispatch_ok: 'Conectat',
        dispatch_fail: 'Deconectat',
        call_112: 'Sună acum la 112',
        demo_venue: 'Locație demo',
        no_contacts_api: 'Dispozitivul tău nu suportă selectarea contactelor direct din browser.<br><br><span style="color:var(--text3);font-size:12px">Pe Android Chrome vei putea vedea contactele aici. Pe iOS, această funcționalitate nu este încă disponibilă.</span>',
        pick_contacts_hint: 'Apasă mai jos pentru a alege din agendă',
        open_contacts: 'Deschide agenda de contacte',
        sms_body: 'Am nevoie să mă suni ACUM. Sunt într-o situație în care nu mă simt în siguranță.',
        sms_location: ' Locația mea: ',
        confirm: {
            escort: { title: 'Personalul a fost anunțat', sub: 'Un membru al personalului vine spre tine. Rămâi pe loc dacă este sigur.' },
            emergency: { title: 'Alertă trimisă', sub: 'Dispeceratul are locația ta. Sună acum la 112 dacă poți vorbi în siguranță.' },
            contact: { title: 'Contact anunțat', sub: 'Un mesaj cu locația ta este pregătit pentru contactul ales.' },
            failed: { title: 'Alerta nu a fost trimisă', sub: 'Nu am putut contacta dispeceratul. Sună direct la 112 dacă ești în pericol.' },
        },
        consent: {
            escort: {
                header: 'Scoate-mă de aici', title: 'Ceri ajutorul personalului ca să pleci?',
                sub: 'Personalul instruit va fi anunțat să te conducă în siguranță spre ieșire. Nimic nu este trimis până nu apeși butonul.',
                btn: 'Anunță personalul și trimite locația',
                items: [['loc', 'Locația ta', 'Ca personalul să te găsească în locație'], ['meta', 'Locația și ora', 'Ce cod QR ai scanat și când']],
            },
            contact: {
                header: 'Sună pe cineva', title: 'Anunți unul dintre contactele tale?',
                sub: 'Vei alege un contact. Se va pregăti un mesaj cu locația ta. Nimic nu este trimis până nu alegi.',
                btn: 'Alege un contact',
                items: [['loc', 'Locația ta', 'Adăugată în mesajul pentru contact'], ['phone', 'Un contact ales de tine', 'Folosit doar pentru a deschide un mesaj pregătit']],
            },
            '112': {
                header: 'Urgență — 112', title: 'Trimiți o alertă de urgență?',
                sub: 'Pentru ca autoritățile să te găsească și să te identifice, SafeOut va colecta următoarele. Nimic nu este trimis până nu apeși butonul.',
                btn: 'Trimite alerta și datele',
                items: [['loc', 'Locația ta', 'Coordonate GPS precise, actualizate live timp de 15 minute'], ['cam', 'Fotografii', 'De la camerele telefonului, pentru a documenta situația'],
                        ['mic', 'Înregistrare audio', 'Câteva secunde de sunet ambiental'], ['meta', 'Metadate', 'Ora și ID-ul locației pentru echipa de intervenție']],
            },
        },
    }
};

let CUR_LANG = 'en';
const t = (key) => I18N[CUR_LANG][key];

function setLang(lang) {
    CUR_LANG = (lang === 'ro') ? 'ro' : 'en';
    const dict = I18N[CUR_LANG];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (typeof dict[key] === 'string') el.innerHTML = dict[key];
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

const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

// 2. Gestionare QR Code & Geolocation
const QR_CODE = new URLSearchParams(window.location.search).get('q') || 'demo';
const IS_DEMO = QR_CODE === 'demo' || QR_CODE === 'demo-venue';
let qrInfo = null;   // { id, code, venue, placement, city, lat, lng } — null dacă codul nu e cunoscut

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// Pornit o singură dată la încărcare; acțiunile îl așteaptă (nu mai trimitem incidente cu date lipsă)
const qrReady = (async function loadQRInfo() {
    if (IS_DEMO) return;   // codurile demo nu există în baza de date
    try {
        const q = await api.getQr(QR_CODE);
        qrInfo = {
            id: q.id, code: q.code, venue: q.venue_name, placement: q.placement,
            city: q.city, lat: num(q.latitude), lng: num(q.longitude),
        };
    } catch (error) {
        console.warn('Codul QR nu a fost găsit pe server:', error.message || error);
    }
})();

function getLocation() {
    return new Promise(resolve => {
        const none = { lat: null, lng: null, accuracy: null, method: null };
        if (!navigator.geolocation) return resolve(none);
        navigator.geolocation.getCurrentPosition(
            p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, method: p.coords.accuracy < 50 ? 'gps' : 'wifi' }),
            () => resolve(none),
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    });
}

// Pentru QR-uri necunoscute/demo nu știm orașul: îl deducem din GPS (best-effort)
async function cityFromLocation(loc) {
    if (loc.lat === null || loc.lng === null) return null;
    try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${loc.lat}&lon=${loc.lng}`);
        if (!r.ok) return null;
        const d = await r.json();
        const a = (d && d.address) || {};
        return a.city || a.town || a.village || a.municipality || a.county || null;
    } catch (e) { return null; }
}

// 3. Captură de Dovezi (Audio/Foto)
async function capturePhoto(facing) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
        const video = document.createElement('video');
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        video.muted = true;
        await video.play();
        await new Promise(r => setTimeout(r, 600));
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        stream.getTracks().forEach(tr => tr.stop());
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
        stream.getTracks().forEach(tr => tr.stop());
        if (!chunks.length) return null;
        const blob = new Blob(chunks, { type: chunks[0].type || 'audio/webm' });
        return await new Promise(resolve => { const fr = new FileReader(); fr.onloadend = () => resolve(fr.result); fr.readAsDataURL(blob); });
    } catch (e) { return null; }
}

async function uploadEvidence(incidentId, photos, audio) {
    const uploads = [];
    if (photos.back) uploads.push(api.addEvidence({ incident_id: incidentId, file_type: 'photo', storage_url: photos.back }));
    if (photos.front) uploads.push(api.addEvidence({ incident_id: incidentId, file_type: 'photo', storage_url: photos.front }));
    if (audio) uploads.push(api.addEvidence({ incident_id: incidentId, file_type: 'audio', storage_url: audio }));
    const results = await Promise.allSettled(uploads);
    results.filter(r => r.status === 'rejected').forEach(r => console.warn('Upload dovadă eșuat:', r.reason));
}

// 4. Live tracking (doar 112, discret, 15 minute) — funcționează cât timp pagina rămâne deschisă
const LIVE_MINUTES = 15;
const LIVE_MIN_INTERVAL_MS = 15000;   // cel mult o actualizare la 15s (rate limit pe server)
let liveWatchId = null, liveTimer = null;

function startLiveTracking(incident) {
    if (!navigator.geolocation || !incident.tracking_token) return;
    stopLiveTracking();
    let lastSent = 0;
    liveWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            const now = Date.now();
            if (now - lastSent < LIVE_MIN_INTERVAL_MS) return;
            lastSent = now;
            api.updateIncidentLocation(incident.id, {
                tracking_token: incident.tracking_token,
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                location_accuracy_m: pos.coords.accuracy,
            }).catch((e) => {
                // token expirat / incident rezolvat -> nu mai are rost să trimitem
                if (e.status === 401 || e.status === 403 || e.status === 404) stopLiveTracking();
            });
        },
        () => { /* silent — discreet */ },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    liveTimer = setTimeout(stopLiveTracking, LIVE_MINUTES * 60 * 1000);
}

function stopLiveTracking() {
    if (liveWatchId !== null && navigator.geolocation) { navigator.geolocation.clearWatch(liveWatchId); liveWatchId = null; }
    if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; }
}

// 5. Salvare Incident
async function recordIncident(type, extra = {}) {
    await qrReady;
    let loc;
    if (qrInfo && qrInfo.lat !== null && qrInfo.lng !== null) {
        loc = { lat: qrInfo.lat, lng: qrInfo.lng, accuracy: 5, method: 'qr_fixed' };
    } else {
        loc = await getLocation();
    }

    const city = (qrInfo && qrInfo.city) || await cityFromLocation(loc) || 'Necunoscut';

    const incidentData = {
        situation_type: type,
        qr_code_id: qrInfo ? qrInfo.id : null,   // FK numeric către qrcodes.id, nu codul text
        venue_name: qrInfo ? qrInfo.venue : (IS_DEMO ? t('demo_venue') : null),
        placement: qrInfo ? qrInfo.placement : null,
        city,
        latitude: loc.lat,
        longitude: loc.lng,
        location_accuracy_m: loc.accuracy,
        location_method: loc.method,
        ...extra
    };

    try {
        return await api.createIncident(incidentData);
    } catch (error) {
        console.error('Eroare la trimiterea incidentului la API:', error);
        return null;
    }
}

// 6. Navigare între ecrane
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
}

function goBack() { showScreen('screen-main'); }

// 7. Ecranul de consimțământ — cerut de fiecare dată, înainte de orice trimitere
const CONSENT_ICONS = {
    loc: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    cam: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>',
    meta: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9z"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.8a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>'
};

let pendingAction = null;
let busy = false;   // previne trimiterea dublă a aceleiași alerte

function showConfirm(type) {
    pendingAction = type;
    const cfg = I18N[CUR_LANG].consent[type] || I18N[CUR_LANG].consent.escort;
    setText('consentHeader', cfg.header);
    setText('consentTitle', cfg.title);
    setText('consentSub', cfg.sub);
    setText('consentAcceptBtn', cfg.btn);
    const items = document.getElementById('consentItems');
    if (items) {
        items.innerHTML = cfg.items.map(([ico, title, desc], i) =>
            `<div class="consent-item"${i === cfg.items.length - 1 ? ' style="border-bottom:none"' : ''}>` +
            `<div class="consent-item-ico"><svg viewBox="0 0 24 24">${CONSENT_ICONS[ico]}</svg></div>` +
            `<div class="consent-item-txt"><div class="consent-item-t">${title}</div><div class="consent-item-d">${desc}</div></div></div>`
        ).join('');
    }
    showScreen('screen-consent');
}

// 8. Ecranul de confirmare
const CONFIRM_STYLE = {
    escort: { cls: 'blue', stroke: '#a0aaff', svg: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>' },
    emergency: { cls: 'red', stroke: '#ff8080', svg: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' },
    contact: { cls: 'teal', stroke: '#4ecfaa', svg: '<polyline points="20 6 9 17 4 12"/>' },
    failed: { cls: 'red', stroke: '#ff8080', svg: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' },
};

function paintConfirm(type) {
    const style = CONFIRM_STYLE[type] || CONFIRM_STYLE.escort;
    const text = I18N[CUR_LANG].confirm[type] || I18N[CUR_LANG].confirm.escort;
    const icon = document.getElementById('confirmIcon');
    if (icon) icon.className = 'confirm-icon-wrap ' + style.cls;
    const svg = document.getElementById('confirmSvg');
    if (svg) { svg.setAttribute('stroke', style.stroke); svg.innerHTML = style.svg; }
    setText('confirmTitle', text.title);
    setText('confirmSub', text.sub);
    const now = new Date();
    setText('metaTime', String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'));
    setText('metaVenue', IS_DEMO ? t('demo_venue') : QR_CODE.slice(0, 14));
    setText('metaDispatch', t('dispatch_ok'));
    const call = document.getElementById('call112Btn');
    if (call) {
        call.textContent = t('call_112');
        call.style.display = (type === 'emergency' || type === 'failed') ? 'block' : 'none';
    }
    showScreen('screen-confirm');
}

function showSendFailed() {
    paintConfirm('failed');
    setText('metaLoc', t('send_failed'));
    setText('metaDispatch', t('dispatch_fail'));
}

// Utilizatorul a apăsat butonul de consimțământ — acum executăm acțiunea
async function acceptConsent() {
    const type = pendingAction;
    if (type === 'contact') { openSheet(); return; }
    if (busy) return;
    busy = true;
    try {
        if (type === '112') await sendEmergency();
        else await sendEscort();
    } finally {
        busy = false;
    }
}

async function sendEscort() {
    paintConfirm('escort');
    setText('metaLoc', t('acquiring'));
    const inc = await recordIncident('escort');
    if (!inc) return showSendFailed();
    setText('metaLoc', inc.latitude !== null ? t('transmitted') : t('unavailable'));
}

async function sendEmergency() {
    // Întâi alerta (secunde contează), apoi dovezile
    paintConfirm('emergency');
    setText('metaLoc', t('sending'));
    const inc = await recordIncident('emergency');
    if (!inc) return showSendFailed();

    startLiveTracking(inc);
    setText('metaLoc', inc.latitude !== null ? t('transmitted_live') : t('sent_no_gps'));

    const locText = document.getElementById('metaLoc').textContent;
    setText('metaLoc', t('capturing_photos'));
    const photos = await captureBothPhotos();
    setText('metaLoc', t('recording_audio'));
    const audio = await captureAudio(5);
    setText('metaLoc', t('sending'));
    await uploadEvidence(inc.id, photos, audio);
    setText('metaLoc', locText);
}

// 9. „Sună pe cineva" — Contact Picker API (Android Chrome)
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

function closeSheetOutside(e) {
    if (e.target === document.getElementById('sheetOverlay')) closeSheet();
}

function loadContactsIntoSheet() {
    const listEl = document.getElementById('contactList');
    if (!listEl) return;

    const supported = ('contacts' in navigator && 'ContactsManager' in window);
    if (!supported) {
        listEl.innerHTML = `<div style="padding:22px 20px;text-align:center;color:var(--text2);font-size:13px;font-weight:300;line-height:1.6">${t('no_contacts_api')}</div>`;
        return;
    }
    listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text2);font-size:13px">${t('pick_contacts_hint')}</div>
    <button class="contact-item" onclick="pickContact()" style="justify-content:center;color:var(--teal)">
      <div class="contact-info" style="flex:none"><span class="contact-name" style="color:var(--teal)">${t('open_contacts')}</span></div>
    </button>`;
}

async function pickContact() {
    try {
        const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: false });
        if (!contacts || !contacts.length) return;
        const chosen = contacts[0];
        const tel = (chosen.tel && chosen.tel[0]) ? chosen.tel[0].replace(/\s+/g, '') : '';
        closeSheet();

        paintConfirm('contact');
        setText('metaLoc', t('getting_location'));

        // Locația e folosită DOAR în mesajul către contact; noi înregistrăm doar un contor anonim
        const loc = await getLocation();
        api.recordContactPing().catch(() => {});
        setText('metaLoc', t('message_prepared'));

        const mapsLink = (loc.lat !== null && loc.lng !== null) ? t('sms_location') + 'https://maps.google.com/?q=' + loc.lat + ',' + loc.lng : '';
        const body = t('sms_body') + mapsLink + ' (SafeOut)';

        if (tel) {
            const smsHref = 'sms:' + tel + (/(iPhone|iPad|Macintosh)/.test(navigator.userAgent) ? '&' : '?') + 'body=' + encodeURIComponent(body);
            setTimeout(() => { window.location.href = smsHref; }, 600);
        }
    } catch (e) {
        closeSheet();
    }
}

// 10. Expunere pe window pentru handlerele inline (onclick în HTML)
Object.assign(window, {
    setLang, goBack, showConfirm, acceptConsent, openSheet, closeSheet, closeSheetOutside, pickContact,
    showInfo: () => showScreen('screen-info'),
});

// 11. Inițializare (modulele rulează după parsarea HTML-ului, deci DOM-ul e gata)
initLang();

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
