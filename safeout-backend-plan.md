# Plan de bătaie — Backend SafeOut

**Context stabilit:** Node.js, server persistent (nu serverless), Postgres, librărie de auth proprie (nu Supabase Auth), RLS pentru autorizare. Infrastructura de test imită infrastructura finală (VPS).

**Principiu de bază pentru tot planul:** nu treci la faza următoare până nu poți răspunde la întrebarea de checkpoint fără să te uiți în cod. Dacă nu poți, nu ai înțeles încă mecanismul — ai doar copiat ceva care merge.

---

## Cum abordez planul cu 2-3 săptămâni disponibile

Fazele de mai jos rămân **referință completă**, nu listă secvențială de citit/parcurs integral. Pentru scope-ul redus (dispatchers + incidents, un singur frontend conectat — vezi Săptămânile 1-2 mai jos), abordarea corectă e diferită pe două categorii de cod:

**Categoria 1 — pattern repetitiv** (rute CRUD similare, handlere, query-uri simple): ceri de la AI structura + un exemplu, scrii manual, repeți pattern-ul pentru restul. Aici viteza contează mai mult decât înțelegerea fiecărei linii — odată înțeles un handler de `GET /incidents`, restul sunt variații.

**Categoria 2 — auth, sesiuni, RLS, middleware de autorizare** (Fazele 4-5): nu se pretează la „repetă pattern-ul". Ceri AI-ului să **explice întâi**, nu să genereze cod. Închizi sursa și încerci să reproduci mecanismul din memorie — dacă nu poți, mai citești explicația înainte să scrii cod. Scrii testul de autorizare ca parte din procesul de învățare, nu ca verificare finală: dacă nu ești sigur ce ar trebui să întoarcă API-ul pentru un acces cross-city, ăsta e semnalul că nu ai înțeles încă.

**Lectura fundamentelor (Faza 0, 0.5, documentația Express etc.) se face „just-in-time"**, nu upfront: citești bucata relevantă chiar înainte de codul la care se aplică (ex. 30-40 min din MDN + Express Routing înainte de primul server), nu tot documentul dintr-o dată. Excepție: OWASP Authentication + Session Management Cheat Sheets (Faza 4) merită citite integral, înainte — altfel nu știi ce riscuri să cauți.

**Scope realist pentru 2-3 săptămâni** (detaliat, cu zile: vezi mesajul anterior din conversație, nu repetat aici ca să nu devină neactualizat): schema redusă la `dispatchers` + `incidents`, auth + RLS testate temeinic (nu se scurtează, indiferent de presiunea de timp), un singur frontend conectat (recomandat: `dispatcher.html`), deploy pe Railway/Render. Restul fazelor (7-11: storage, realtime, poweradmin complet, hardening OWASP ASVS) rămân pentru după, cu timp mai relaxat.

---

## Faza 0 — Fundamente Node.js (dacă îți lipsesc)

Sari peste dacă deja te simți confortabil cu: `async/await`, module ES/CommonJS, `npm`, evenimente/callback-uri, cum rulează Node un proces persistent (event loop, la nivel de intuiție, nu profund).

**Resurse:**
- [Node.js — official guides](https://nodejs.org/en/learn/getting-started/introduction-to-nodejs) — punctul de plecare oficial.
- [javascript.info — Async/await](https://javascript.info/async-await) — cea mai clară explicație pe care am văzut-o pentru async/await, nu doar sintaxă ci de ce există.

**Checkpoint:** poți explica cuiva, fără cod, diferența dintre un callback, o promisiune și `await` — și de ce Node poate gestiona mii de conexiuni fără mii de thread-uri.

---

## Faza 0.5 — HTTP și REST, temeinic

Înainte de a scrie orice rută, ai nevoie de fundația reală: ce e HTTP la nivel de protocol, ce înseamnă „REST" mai exact (nu doar „API cu URL-uri și JSON"), și cum se folosesc corect metodele/statusurile. Beginnerii sar frecvent peste asta și ajung să folosească greșit PUT vs PATCH, sau să întoarcă 200 pentru orice, inclusiv erori — lucruri care par mici dar complică integrarea și debugging-ul mai târziu.

**HTTP — protocolul de bază:**
- [MDN — HTTP overview](https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview) — cea mai bună introducere, gratuită, corectă tehnic.
- [MDN — HTTP request methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods) — diferența reală dintre GET/POST/PUT/PATCH/DELETE, inclusiv idempotență (concept important: de ce PUT trebuie să fie idempotent și POST nu).
- [MDN — HTTP response status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status) — referință completă; învață mai ales familiile 2xx/4xx/5xx și diferența 401 vs 403 (autentificare vs autorizare — direct relevant pentru Fazele 4-5).
- [MDN — HTTP headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers) — `Authorization`, `Content-Type`, `Cache-Control` sunt cele pe care le vei folosi constant.

**REST — stilul arhitectural:**
- [restfulapi.net — REST API Tutorial](https://restfulapi.net/) — cea mai accesibilă resursă pentru a înțelege principiile REST (resurse, reprezentări, statelessness) fără jargon academic excesiv.
- [Microsoft REST API Guidelines](https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md) — un ghid de practici folosit real în industrie; util pentru convenții de naming (`/incidents/{id}/actions`, plural pentru colecții, etc.) — exact ce vei aplica la contractul deja schițat în comentariile `// BACKEND:` din frontend.
- [JSON:API specification](https://jsonapi.org/) — opțional, dar util de răsfoit ca exemplu de convenție consistentă pentru formatul răspunsurilor (erori, paginare, relații) — nu trebuie s-o urmezi strict, dar te ajută să nu inventezi formate ad-hoc.

**Design de erori (relevant direct pentru aplicația ta):**
- [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html) — un standard simplu pentru cum arată un răspuns de eroare consistent (`{type, title, status, detail}`) — merită adoptat de la început ca să nu improvizezi format de eroare diferit în fiecare rută.

**Checkpoint:** poți explica de ce un login eșuat ar trebui să întoarcă 401 și nu 200 cu `{success: false}` în body — și ce se strică în practică (retry logic, caching, monitoring) dacă întorci mereu 200.

---

## Faza 1 — Server Node persistent (Express sau Fastify)

Scopul: un API HTTP simplu care rulează continuu ca proces (nu funcție serverless), cu rute, middleware, gestionare de erori.

**Decizie:** Fastify e mai modern, mai rapid, are validare de schema încorporată (util pentru un API cu date sensibile). Express e mai răspândit, mai multă documentație/exemple. Pentru un beginner, Express are mai multe resurse — dar dacă vrei să înveți o dată bine, Fastify te forțează spre practici mai curate din start.

**Resurse:**
- [Express — Guide](https://expressjs.com/en/guide/routing.html) *sau* [Fastify — Getting Started](https://fastify.dev/docs/latest/Guides/Getting-Started/)
- [Express — Best Practices for Production](https://expressjs.com/en/advanced/best-practices-production.html) — citește-l chiar dacă alegi Fastify, principiile (graceful shutdown, error handling, environment config) sunt universale.

**Ce construiești:** un server minimal cu 2-3 rute fake (fără bază de date încă), pornit cu `node server.js`, care rămâne activ și răspunde la request-uri repetate.

**Checkpoint:** poți explica ce înseamnă „graceful shutdown" și de ce contează pe un server persistent (spre deosebire de serverless, unde nu ai control asupra ciclului de viață al procesului).

---

## Faza 2 — PostgreSQL: schema și SQL

Scopul: proiectezi schema reală (incidents, dispatchers, venues, evidence, qrcodes, contact_pings, audit_log) și înveți SQL suficient cât să nu depinzi orbește de un ORM.

**Resurse:**
- [PostgreSQL Tutorial (postgresqltutorial.com)](https://www.postgresqltutorial.com/) — parcurgere structurată, de la CREATE TABLE la JOIN-uri și constrângeri.
- [PostgreSQL — official docs, Data Definition](https://www.postgresql.org/docs/current/ddl.html) — referință oficială pentru tipuri de date, constrângeri, chei străine.
- [node-postgres (pg) — docs](https://node-postgres.com/) — clientul Node pentru Postgres, dacă alegi să nu folosești un ORM greu.

**Decizie unealtă de acces la date:** pentru început, aș recomanda `pg` direct + SQL scris de mână pentru query-urile critice de autorizare (ca să vezi exact ce se execută), și eventual [Kysely](https://kysely.dev/) mai târziu dacă vrei type-safety fără magia unui ORM complet. Evită Prisma/TypeORM la început — ascund prea mult din ce se întâmplă, exact quando vrei să înțelegi fiecare query.

**Ce construiești:** schema completă în fișiere de migrare SQL (nu doar tabele create manual din psql) + populare cu date de test.

**Checkpoint:** poți desena pe hârtie relațiile dintre tabele (chei străine) fără să te uiți în schema, și poți explica de ce ai ales anumite constrângeri (ex. de ce `city` e obligatoriu pe `dispatchers`).

---

## Faza 3 — Migrări de bază de date

Nu aplica schema manual în producție niciodată — folosește un tool de migrări de la început, ca obicei corect.

**Resurse:**
- [node-pg-migrate — docs](https://salsita.github.io/node-pg-migrate/) — simplu, se potrivește cu abordarea SQL-direct din Faza 2.
- *(Alternativ, dacă mergi pe Kysely)* [Kysely — Migrations](https://kysely.dev/docs/migrations)

**Checkpoint:** poți rula o migrare, apoi un rollback, și baza de date revine exact la starea anterioară fără pierdere de date pe tabelele neafectate.

---

## Faza 4 — Autentificare cu librărie proprie

Scopul: login/logout, hashing parole, sesiuni, fără Supabase Auth.

**Decizie librărie:** [Lucia](https://lucia-auth.com/) e conceput special ca „nu e un framework, e un ghid + cod minimal pe care îl copiezi și controlezi tu" — potrivit exact pentru „vreau să știu ce fac", nu o cutie neagră. Alternativ, [better-auth](https://www.better-auth.com/) e mai complet și modern dacă vrei mai puțin cod propriu de întreținut.

**Resurse:**
- [Lucia — documentație](https://lucia-auth.com/) (citește secțiunea „Sessions" cu atenție — e miezul modelului lor de securitate)
- [OWASP — Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) — citește-l indiferent de librărie, e referința standard pentru ce poate merge prost.
- [OWASP — Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

**Ce construiești:** înregistrare, login, logout, sesiuni persistate în Postgres (nu în memorie — pierzi sesiunile la fiecare restart altfel), rate limiting pe login.

**Checkpoint:** poți explica ce se întâmplă, pas cu pas, din momentul în care cineva trimite parola greșită de 5 ori la rând — și unde exact în cod se oprește atacul.

---

## Faza 5 — Autorizare cu RLS + JWT propriu

Aici e partea cea mai delicată din tot planul — separarea pe orașe (dispatcher vede doar incidentele lui) trebuie impusă la nivel de bază de date, nu doar în cod.

**Resurse:**
- [PostgreSQL — Row Security Policies (official docs)](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — sursa de adevăr, citește-o integral, nu sări la exemple.
- [PostgreSQL — set_config / current_setting](https://www.postgresql.org/docs/current/functions-admin.html) — mecanismul prin care treci identitatea userului către RLS fără Supabase.
- Articol de referință pentru pattern-ul „RLS cu JWT propriu, fără Supabase": caută „postgres row level security custom jwt set_config" — pattern-ul e: la fiecare conexiune/tranzacție, faci `SET LOCAL app.user_id = '...'` și `SET LOCAL app.user_city = '...'` după ce ai validat sesiunea, apoi policy-urile RLS citesc din `current_setting('app.user_city')`.

**Ce construiești:** policy-uri RLS pe `incidents` (dispatcher vede doar orașul lui), pe `evidence` (acces restricționat), teste automate care încearcă activ să acceseze date din alt oraș și verifică că sunt respinse.

**Checkpoint — cel mai important din tot planul:** scrii un test care se loghează ca dispatcher din orașul A, încearcă să citească un incident din orașul B direct prin API, și confirmi că request-ul eșuează. Dacă nu ai acest test, nu ai terminat faza, indiferent cât de „bine arată" în interfață.

---

## Faza 6 — API-ul propriu-zis

Acum construiești rutele reale, urmând contractul deja schițat în comentariile `// BACKEND:` din `dispatcher.html`, `poweradmin.html`, `pwa.html` — practic ai deja specificația, trebuie doar implementată corect cu auth + RLS din fazele anterioare.

**Resurse:**
- [OWASP — API Security Top 10](https://owasp.org/www-project-api-security/) — citește-l acum, cât proiectezi rutele, nu după.
- [OWASP — Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- Pentru validare de schema pe request-uri: [Zod](https://zod.dev/) (funcționează excelent și cu Express, nu doar Fastify).
- [restfulapi.net — Richardson Maturity Model](https://restfulapi.net/richardson-maturity-model/) — util ca reper: aplicația ta nu are nevoie de nivelul „HATEOAS" complet (nivel 3), nivelul 2 (resurse + verbe HTTP corecte) e suficient și realist pentru un beginner — nu te complica inutil aici.
- [Postman Learning Center](https://learning.postman.com/docs/getting-started/overview/) — pentru testarea manuală a rutelor pe măsură ce le construiești, înainte de a scrie teste automate.

**Checkpoint:** fiecare rută are validare explicită de input (nu presupui că frontend-ul trimite mereu date corecte), fiecare rută care întoarce date sensibile trece prin verificarea de autorizare din Faza 5, și fiecare eroare urmează formatul consistent stabilit în Faza 0.5.

---

## Faza 7 — Storage pentru dovezi (foto/audio)

**Resurse:**
- [MinIO — docs](https://min.io/docs/minio/linux/index.html) (S3-compatible, poți rula local în Docker acum, identic pe VPS mai târziu) *sau* [Cloudflare R2 — docs](https://developers.cloudflare.com/r2/) dacă preferi ceva găzduit acum.
- [AWS S3 — Presigned URLs (concept, aplicabil la orice S3-compatible)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html) — pattern-ul pentru upload securizat fără să treacă fișierul prin serverul tău inutil.

**Checkpoint:** poți explica de ce un URL presemnat expiră și de ce asta contează pentru dovezi care ar putea fi folosite legal/în instanță.

---

## Faza 8 — Realtime (dispatcher/poweradmin)

Poți amâna asta — pornești cu polling (cum e deja în frontend), treci la WebSocket doar când restul e stabil.

**Resurse:**
- [ws — Node.js WebSocket library](https://github.com/websockets/ws) — minimal, potrivit pentru un server persistent (nu ai nevoie de Socket.IO decât dacă vrei fallback-uri automate).

**Checkpoint:** poți explica de ce WebSocket-ul necesită un server persistent și nu funcționează natural pe serverless — leagă asta de decizia deja luată de a evita Vercel pentru API.

---

## Faza 9 — Testare (nu opțională pentru acest tip de aplicație)

**Resurse:**
- [Vitest](https://vitest.dev/) sau [Node.js built-in test runner](https://nodejs.org/api/test.html) — oricare, important e să existe teste.
- [Testing Library — principii generale de testare de integrare](https://testing-library.com/docs/guiding-principles/)

**Ce construiești:** teste de integrare pentru fiecare rută sensibilă, cu accent pe autorizare (vezi Faza 5) — acestea contează mai mult decât teste unitare pe funcții izolate.

---

## Faza 10 — Deploy pe infrastructură „ca la final"

**Resurse:**
- [Railway — docs](https://docs.railway.app/) sau [Render — docs](https://render.com/docs) — alege unul, ambele suportă Postgres + server Node persistent.
- [12 Factor App](https://12factor.net/) — principii de configurare (env vars, logging, procese stateless unde se poate) care se aplică identic acum și pe VPS.

**Checkpoint:** poți muta variabilele de mediu și codul pe un alt provider (test rapid: clonează pe Render dacă ai pornit pe Railway) în mai puțin de 30 de minute, fără să schimbi cod.

---

## Faza 11 — Hardening final + pregătire audit

Înainte de a considera orice „gata pentru date reale":

**Resurse:**
- [OWASP Top 10](https://owasp.org/www-project-top-ten/) — trece prin fiecare punct și verifică explicit față de aplicația ta.
- [OWASP Application Security Verification Standard (ASVS)](https://owasp.org/www-project-application-security-verification-standard/) — nivel L1/L2 e un checklist bun pentru o aplicație cu date sensibile ca a ta.

**Checkpoint final:** poți parcurge checklist-ul OWASP ASVS L1 și pentru fiecare punct poți spune „da, avem asta" sau „nu, e cunoscut și acceptat temporar" — nu „nu m-am gândit la asta".

---

## Ordinea recomandată de atac

Fazele 0→6 sunt secvențiale, fiecare depinde de precedenta. Fazele 7 și 8 pot fi paralele sau amânate. Faza 9 (testare) ar trebui de fapt să înceapă odată cu Faza 4, nu la final — scrii teste pe măsură ce construiești auth/RLS, nu după.

## O regulă de urmat tot parcursul

De fiecare dată când copiezi cod dintr-un tutorial sau din documentație, oprește-te și rescrie-l cu mâna ta, cu numele tale de variabile, pentru schema ta specifică. Dacă nu poți face asta fără să te uiți la original, nu ai înțeles încă — și tocmai asta ai cerut: să știi ce faci, nu doar să funcționeze.

---

## Anexă — Structura proiectului

Monorepo, două zone separate:

```
safeout/
├── backend/
├── frontend/
└── docs/
```

**Backend:**

```
backend/
├── src/
│   ├── db/
│   │   ├── migrations/          # Faza 3
│   │   └── client.js            # conexiune Postgres, pooling
│   ├── auth/
│   │   ├── session.js           # Faza 4
│   │   └── hashing.js
│   ├── middleware/
│   │   ├── requireAuth.js
│   │   └── setRlsContext.js     # SET LOCAL app.user_city — Faza 5
│   ├── routes/                  # doar rutare + validare input
│   ├── services/                # logica de business
│   ├── repositories/            # SQL izolat aici
│   └── server.js
├── tests/
│   └── authorization.test.js    # testele-cheie din checkpoint-ul Fazei 5
└── package.json
```

**Frontend** (rămâne vanilla JS, dar modularizat, nu monolitic în HTML):

```
frontend/
├── shared/
│   ├── tokens.css            # variabile CSS comune (--burg, --teal etc.)
│   └── api-client.js         # SINGURUL loc care face fetch() către backend
├── pwa/          → index.html + app.js + style.css
├── dispatcher/   → index.html + app.js + style.css
└── poweradmin/   → index.html + app.js + style.css
```

**Ordinea recomandată de migrare din HTML-urile actuale:**
1. Construiește backend-ul (Fazele 0-6) independent, testat cu Postman/curl.
2. Creează `api-client.js` — înlocuiește comentariile `// BACKEND:` cu funcții reale.
3. Extrage `<script>` din fiecare HTML în `app.js` separat, unul câte unul (PWA → dispatcher → poweradmin), înlocuind `localStorage` cu apeluri către `api-client.js`.
4. CSS-ul inline îl lași la urmă — nu e critic funcțional.

**Unealtă opțională pentru dev experience:** [Vite](https://vite.dev/guide/) — nu schimbă arhitectura de mai sus, doar oferă hot reload și import-uri curate în timpul dezvoltării.
