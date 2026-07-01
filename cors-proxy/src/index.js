/**
 * FuelScan CORS proxy - Cloudflare Worker.
 *
 * suf.purs.gov.rs ne šalje CORS zaglavlja, pa Angular aplikacija (drugi origin)
 * ne može direktno da GET-uje HTML stranicu računa niti da POST-uje na
 * /specifications iz browsera. Ovaj Worker prosledi zahtev ka suf.purs.gov.rs
 * sa servera (gde CORS ne važi) i vrati odgovor sa CORS zaglavljima nazad.
 *
 * VAŽNO - sesijski kolačić: suf.purs.gov.rs zahteva da POST /specifications
 * nosi isti session cookie koji je server postavio na inicijalnom GET-u
 * stranice računa (isto ponašanje je otkriveno i u referentnoj `receiptrs`
 * TS biblioteci koja radi isti posao preko Node/axios). Pošto browser ne
 * dozvoljava JS-u da čita "Set-Cookie" header direktno, trik je:
 *   1. Na GET odgovoru, ovaj Worker PREPIŠE Set-Cookie sa
 *      `SameSite=None; Secure` i vrati ga nazad. Browser ga onda čuva vezano
 *      za origin OVOG Worker-a (workers.dev), ne za suf.purs.gov.rs.
 *   2. Angular mora zvati Worker sa `withCredentials: true` (fetch
 *      `credentials: 'include'`), tako da browser na SLEDEĆI poziv istom
 *      Worker-u automatski pošalje taj isti kolačić nazad.
 *   3. Ovaj Worker onda taj dolazni Cookie header prosledi dalje ka
 *      suf.purs.gov.rs kao pravi Cookie header na POST /specifications.
 * Bez ovoga, POST /specifications vraća `success: false` (Poreska uprava
 * "ne prepoznaje" sesiju), što se u Angular-u vidi kao
 * "Poreska uprava nije vratila stavke računa."
 *
 * Ograničeno je isključivo na suf.purs.gov.rs (domain allowlist) da ovo ne bi
 * moglo da se zloupotrebi kao open proxy za bilo koji sajt.
 *
 * DEPLOY / REDEPLOY (besplatno, preko Wrangler CLI):
 *   1. cd cors-proxy
 *   2. npm install   (samo ako još nisi)
 *   3. npx wrangler deploy
 *      - Prvi put otvara browser za login na Cloudflare (besplatno).
 *      - Ispiše URL: https://fuelscan-proxy.<tvoj-subdomain>.workers.dev
 *   4. U angular/src/app/core/config/app-config.ts postavi taj URL u
 *      CORS_PROXY_URL (+ "/?url=" na kraju).
 *   5. Svaki put kad izmeniš ovaj fajl, samo ponovo pokreni `npx wrangler deploy`
 *      iz `cors-proxy/` foldera - URL ostaje isti.
 */

const ALLOWED_HOSTS = ['suf.purs.gov.rs'];

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'sr-RS,sr;q=0.9',
  Referer: 'https://suf.purs.gov.rs/',
};

/**
 * Reflektuje tačan Origin zahteva (obavezno za credentialed CORS - ne sme biti '*').
 *
 * VAŽNO: kad je 'Access-Control-Allow-Credentials: true', browser NE tretira
 * '*' u 'Access-Control-Allow-Headers'/'Access-Control-Allow-Methods' kao
 * wildcard - uzima ga bukvalno kao ime jednog headera/metode. Zato mora da se
 * vrati tačna, eksplicitna lista (ili da se reflektuje 'Access-Control-Request-Headers'
 * iz preflight zahteva), inače browser blokira svaki custom header
 * (npr. 'X-Requested-With') sa "not allowed by Access-Control-Allow-Headers".
 */
function corsHeaders(origin, requestedHeaders) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': requestedHeaders || 'Content-Type, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin, Access-Control-Request-Headers',
  };
}

/** Zadrži samo name=value od kolačića, forsiraj atribute koji dozvoljavaju cross-site fetch. */
function rewriteSetCookieForCrossSite(rawCookie) {
  const nameValue = rawCookie.split(';')[0];
  return `${nameValue}; Path=/; Secure; SameSite=None`;
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '*';
    // Preflight šalje TAČNO koje headere sledeći pravi zahtev planira da pošalje -
    // reflektujemo ih nazad umesto da hardkodiramo listu koja može da zastari.
    const requestedHeaders = request.headers.get('Access-Control-Request-Headers') || undefined;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin, requestedHeaders) });
    }

    const requestUrl = new URL(request.url);
    const target = requestUrl.searchParams.get('url');

    if (!target) {
      return new Response('Missing "url" query parameter', { status: 400, headers: corsHeaders(origin) });
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response('Invalid "url" parameter', { status: 400, headers: corsHeaders(origin) });
    }

    if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
      return new Response(`Domain not allowed: ${targetUrl.hostname}`, { status: 403, headers: corsHeaders(origin) });
    }

    const init = {
      method: request.method,
      headers: { ...BROWSER_HEADERS },
    };

    // Prosledi nazad kolačić koji je browser sačuvao od NAŠEG prethodnog
    // odgovora (postavljen u koraku ispod) - to je isti kolačić koji je
    // suf.purs.gov.rs originalno izdao na GET-u stranice računa.
    const incomingCookie = request.headers.get('Cookie');
    if (incomingCookie) {
      init.headers['Cookie'] = incomingCookie;
    }

    if (request.method === 'POST') {
      init.body = await request.text();
      init.headers['Content-Type'] =
        request.headers.get('Content-Type') || 'application/x-www-form-urlencoded; charset=UTF-8';
      init.headers['X-Requested-With'] = 'XMLHttpRequest';
    }

    let upstreamResponse;
    try {
      upstreamResponse = await fetch(targetUrl.toString(), init);
    } catch (err) {
      // Ako suf.purs.gov.rs ne odgovori (spor server, mreža, itd.) vratimo
      // JASNU grešku SA CORS zaglavljima, umesto da Cloudflare vrati goli 504
      // bez CORS headera (što bi browser prijavio kao još konfuzniju grešku).
      return new Response(
        JSON.stringify({ success: false, message: 'Poreska uprava trenutno ne odgovara. Pokušajte ponovo.' }),
        {
          status: 502,
          headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
        },
      );
    }

    const body = await upstreamResponse.text();

    const responseHeaders = new Headers({
      ...corsHeaders(origin),
      'Content-Type': upstreamResponse.headers.get('Content-Type') || 'text/plain; charset=utf-8',
    });

    // Relay-uj Set-Cookie sa suf.purs.gov.rs (prepisan za cross-site upotrebu)
    // tako da ga browser sačuva vezano za OVAJ Worker origin i pošalje nazad
    // na sledeći poziv (GET stranice -> POST /specifications).
    const setCookies = upstreamResponse.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
      responseHeaders.append('Set-Cookie', rewriteSetCookieForCrossSite(cookie));
    }

    return new Response(body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  },
};
