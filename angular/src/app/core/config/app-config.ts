import { environment } from '../../../environments/environment';

/**
 * Konfiguracione konstante. Vrednosti koje se razlikuju po okruženju dolaze iz
 * `src/environments/environment*.ts`.
 */

export const SUPABASE_URL = environment.supabaseUrl;
export const SUPABASE_ANON_KEY = environment.supabaseAnonKey;

/**
 * Poreska uprava (suf.purs.gov.rs) ne šalje CORS zaglavlja ni na GET (stranica
 * računa) ni na POST (/specifications), pa oba zahteva idu preko Cloudflare
 * Worker proxy-ja iz `cors-proxy/`.
 *
 * Očekivani format: `${CORS_PROXY_URL}${encodeURIComponent(targetUrl)}`
 */
export const CORS_PROXY_URL = environment.corsProxyUrl;

/** POST endpoint koji stranica računa sama poziva kad se klikne "Specifikacija". */
export const TAX_AUTHORITY_SPECIFICATIONS_URL = 'https://suf.purs.gov.rs/specifications';

export const SUF_ALLOWED_HOST = 'suf.purs.gov.rs';
