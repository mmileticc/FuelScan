import asyncio
from transliterate import translit
from playwright.async_api import async_playwright
import re

import re


def clean_station_name(name):
    # RegEx koji traži brojeve na početku stringa, praćene crticom ili razmakom
    # \d+ pronalazi jedan ili više brojeva
    # [-\s]+ pronalazi crticu ili razmak
    clean_name = re.sub(r'^\d+[-\s]+', '', name)

    # Zatim primeniš tvoju već postojeću transliteraciju i title case
    return normalize_text(clean_name)


def normalize_text(text):
    if not text:
        return text
    # Proverava da li ima ćirilice i pretvara je u latinicu
    # reversed=True znači da ćirilicu pretvara u latinicu
    try:
        return translit(text, 'sr', reversed=True)
    except:
        return text  # Ako nešto krene po zlu, vrati original


def parse_number(val):
    """
    Pretvara srpski format broja u čist float, a ako je već float, samo ga vrati.
    """
    if val is None:
        return None

    if isinstance(val, (int, float)):
        return float(val)

    try:
        clean_val = str(val).strip().replace(".", "").replace(",", ".")
        return float(clean_val)
    except ValueError:
        return None


async def parse_taxcore_receipt(url: str):
    return await asyncio.wait_for(run_playwright_logic(url), timeout=45.0)


async def run_playwright_logic(url):
    # Konzistentna inicijalizacija rezultata sa podrazumevanim vrednostima
    result = {
        "invoice_number": None,
        "date": None,
        "total": None,
        "station": "Nepoznata pumpa",
        "address": None,
        "city": None,
        "municipality": None,
        "items": []
    }
    if not url or "suf.purs.gov.rs" not in url:
        print(f"⚠️ Ignorišem URL: {url}")
        return result

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-infobars",
                "--window-position=0,0",
                "--ignore-certificate-errors",
                "--disable-blink-features=AutomationControlled",  # OVO JE KLJUČNO
            ]
        )

        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            extra_http_headers={
                "Referer": "https://suf.purs.gov.rs/",
                "Accept-Language": "sr-RS,sr;q=0.9"
            }
        )
        page = await context.new_page()

        # OPTIMIZACIJA: Blokiramo teške resurse radi brzine
        await page.route("**/*", lambda route, request:
        route.abort() if request.resource_type in ["image", "media", "font"]
        else route.continue_()
                         )

        try:
            print(f"➡️ Otvaram račun: {url}")
            response = await page.goto(url, wait_until="domcontentloaded", timeout=25000)
            if response.status != 200:
                print(f"❌ Stranica nedostupna: {response.status}")
                return result  # Vraća prazan objekat, ne puca

            # --- 1. POTPUNO UNIFORMNO VADJENJE PODATAKA PREKO ID SELEKTORA ---
            # Mapiramo ključeve iz return-a direktno na precizne ID selektore sa stranice
            meta_selectors = {
                "invoice_number": "#invoiceNumberLabel",
                "date": "#sdcDateTimeLabel",
                "total": "#totalAmountLabel",
                "station": "#shopFullNameLabel",
                "address": "#addressLabel",
                "city": "#cityLabel",
                "municipality": "#administrativeUnitLabel"
            }

            for key, selector in meta_selectors.items():
                try:
                    element = page.locator(selector)
                    if await element.count() > 0:
                        text = await element.inner_text()
                        if text and text.strip():
                            if key == "station":
                                result[key] = clean_station_name(text.strip())
                            else:
                                result[key] = normalize_text(text.strip())
                except Exception as e:
                    print(f"⚠️ Greška prilikom vađenja polja {key} preko selektora {selector}: {e}")

            # --- 2. KLIK NA SPECIFIKACIJU I VADJENJE ARTIKALA ---
            collapse_link_selector = 'a[href="#collapse-specs"]'

            if await page.locator(collapse_link_selector).count() > 0:
                await page.click(collapse_link_selector)
                await page.wait_for_selector('#collapse-specs tbody tr', timeout=15000)

                rows = await page.locator('#collapse-specs tbody tr').all()

                for row in rows:
                    cols = await row.locator('td').all()
                    if len(cols) >= 7:
                        result["items"].append({
                            "name": normalize_text((await cols[0].inner_text()).strip()),
                            "quantity": parse_number(await cols[1].inner_text()),
                            "unit_price": parse_number(await cols[2].inner_text()),
                            "total": parse_number(await cols[3].inner_text()),
                            "tax_base": parse_number(await cols[4].inner_text()),
                            "vat": parse_number(await cols[5].inner_text()),
                            "label": (await cols[6].inner_text()).strip()
                        })
            else:
                print("⚠️ Nije pronađeno dugme '#collapse-specs'.")

        except Exception as e:
            print(f"❌ Greška u Playwright parseru: {e}")
        finally:
            await context.close()
            await browser.close()

    return result
