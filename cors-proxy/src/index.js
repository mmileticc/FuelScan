/**
 * FuelScan CORS proxy - Cloudflare Worker.
 *
 * suf.purs.gov.rs ne šalje CORS zaglavlja, pa Angular aplikacija (drugi origin)
 * ne može direktno da GET-uje HTML stranicu računa niti da POST-uje na
 * /specifications iz browsera. Ovaj Worker samo prosledi zahtev ka
 * suf.purs.gov.rs sa servera (gde CORS ne važi) i vrati odgovor sa
 * `Access-Control-Allow-Origin: *`, tako da ga Angular aplikacija sme pročitati.
 *
 * Ograničeno je isključivo na suf.purs.gov.rs (domain allowlist) da ovo ne bi
 * moglo da se zloupotrebi kao open proxy za bilo koji sajt.
 *
 * DEPLOY (besplatno, preko Wrangler CLI - dashboard flow sad traži GitHub
 * konekciju, pa je CLI mnogo brži i pouzdaniji put):
 *
 *   1. Otvori terminal u folderu `cors-proxy/` (ovaj folder, gde je i ovaj fajl
 *      unutar `src/`).
 *   2. npm install
 *   3. npx wrangler deploy
 *      - Prvi put će ti otvoriti browser da se uloguješ/registruješ na
 *        Cloudflare (besplatno, bez kartice).
 *      - Nakon logina, deploy se automatski nastavlja i u terminalu ćeš
 *        dobiti URL tipa: https://fuelscan-proxy.<tvoj-subdomain>.workers.dev
 *   4. Test u browseru:
 *      https://fuelscan-proxy.<tvoj-subdomain>.workers.dev/?url=https://suf.purs.gov.rs
 *      (treba da vrati HTML sa suf.purs.gov.rs).
 *   5. U Angular projektu (angular/src/app/core/config/app-config.ts) postavi:
 *      export const CORS_PROXY_URL = 'https://fuelscan-proxy.<tvoj-subdomain>.workers.dev/?url=';
 *
 * Kasnije izmene: samo izmeni ovaj fajl i ponovo pokreni `npx wrangler deploy`
 * iz `cors-proxy/` foldera - URL ostaje isti.
 */

const ALLOWED_HOSTS = ['suf.purs.gov.rs'];

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'sr-RS,sr;q=0.9',
  Referer: 'https://suf.purs.gov.rs/',
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const requestUrl = new URL(request.url);
    const target = requestUrl.searchParams.get('url');

    if (!target) {
      return new Response('Missing "url" query parameter', { status: 400, headers: corsHeaders() });
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response('Invalid "url" parameter', { status: 400, headers: corsHeaders() });
    }

    if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
      return new Response(`Domain not allowed: ${targetUrl.hostname}`, { status: 403, headers: corsHeaders() });
    }

    const init = {
      method: request.method,
      headers: { ...BROWSER_HEADERS },
    };

    if (request.method === 'POST') {
      init.body = await request.text();
      init.headers['Content-Type'] =
        request.headers.get('Content-Type') || 'application/x-www-form-urlencoded; charset=UTF-8';
      init.headers['X-Requested-With'] = 'XMLHttpRequest';
    }

    const upstreamResponse = await fetch(targetUrl.toString(), init);
    const body = await upstreamResponse.text();

    return new Response(body, {
      status: upstreamResponse.status,
      headers: {
        ...corsHeaders(),
        'Content-Type': upstreamResponse.headers.get('Content-Type') || 'text/plain; charset=utf-8',
      },
    });
  },
};
