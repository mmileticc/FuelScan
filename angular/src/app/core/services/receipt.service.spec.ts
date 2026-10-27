import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { CORS_PROXY_URL, TAX_AUTHORITY_SPECIFICATIONS_URL } from '../config/app-config';
import { ParsedReceipt, RawSpecificationItem, ReceiptScanError } from '../models/receipt.model';
import { ReceiptService } from './receipt.service';

const RECEIPT_URL = 'https://suf.purs.gov.rs/v/?vl=TEST123';
const PROXIED_GET = `${CORS_PROXY_URL}${encodeURIComponent(RECEIPT_URL)}`;
const PROXIED_POST = `${CORS_PROXY_URL}${encodeURIComponent(TAX_AUTHORITY_SPECIFICATIONS_URL)}`;

const RECEIPT_HTML = `
  <html><body>
    <span id="shopFullNameLabel">1249582-НИС ПЕТРОЛ БЕОГРАД</span>
    <span id="addressLabel">Булевар 1</span>
    <span id="cityLabel">Београд</span>
    <span id="administrativeUnitLabel">Нови Београд</span>
    <span id="sdcDateTimeLabel">18.6.2026. 11:14:31</span>
    <span id="totalAmountLabel">8.450,00</span>
    <script>
      viewModel.InvoiceNumber('AB12CD34-AB12CD34-1234');
      viewModel.Token('tok-123');
    </script>
  </body></html>`;

function item(name: string, quantity: number, unitPrice: number): RawSpecificationItem {
  return { name, quantity, unitPrice, total: Math.round(quantity * unitPrice * 100) / 100, label: 'Ђ' };
}

describe('ReceiptService', () => {
  let service: ReceiptService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReceiptService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Prođe kroz GET stranice + pauzu + POST specifikacije. */
  function respond(items: RawSpecificationItem[] | null): void {
    http.expectOne(PROXIED_GET).flush(RECEIPT_HTML);
    tick(1200);
    const post = http.expectOne(PROXIED_POST);
    expect(post.request.body).toContain('invoiceNumber=AB12CD34-AB12CD34-1234');
    post.flush(items ? { success: true, items } : { success: false });
  }

  it('gorivo + ostale stavke: total samo za gorivo, meta podaci transliterovani', fakeAsync(() => {
    let result: ParsedReceipt | undefined;
    service.scanReceipt$(RECEIPT_URL).subscribe((r) => (result = r));

    respond([item('ЕВРО ДИЗЕЛ', 40, 205), item('KAFA', 1, 250)]);

    expect(result).toBeDefined();
    expect(result!.fuel_type).toBe('EVRO DIZEL');
    expect(result!.liters).toBe(40);
    expect(result!.price_per_l).toBe(205);
    expect(result!.total).toBe(8200);
    expect(result!.station).toBe('NIS PETROL BEOGRAD');
    expect(result!.invoice_number).toBe('AB12CD34-AB12CD34-1234');
  }));

  it('račun bez goriva: fuel_type null, total je iznos računa', fakeAsync(() => {
    let result: ParsedReceipt | undefined;
    service.scanReceipt$(RECEIPT_URL).subscribe((r) => (result = r));

    respond([item('KAFA', 1, 250), item('AdBlue 10L', 1, 1200)]);

    expect(result!.fuel_type).toBeNull();
    expect(result!.liters).toBeNull();
    expect(result!.total).toBe(8450);
  }));

  it('odbija URL koji nije sa suf.purs.gov.rs bez ijednog zahteva', () => {
    let error: unknown;
    service.scanReceipt$('https://evil.com/?suf.purs.gov.rs').subscribe({ error: (e) => (error = e) });
    expect(error instanceof ReceiptScanError && error.kind).toBe('invalid-url');
  });

  it('403 sa proxy-ja se ne ponavlja', fakeAsync(() => {
    let error: unknown;
    service.scanReceipt$(RECEIPT_URL).subscribe({ error: (e) => (error = e) });

    http.expectOne(PROXIED_GET).flush('Origin not allowed', { status: 403, statusText: 'Forbidden' });
    tick(10000);
    http.expectNone(PROXIED_GET);
    expect(error instanceof ReceiptScanError && error.kind).toBe('invalid-url');
  }));

  it('prazna specifikacija se ponavlja pa prijavljuje tax-authority-empty', fakeAsync(() => {
    let error: unknown;
    const attempts: number[] = [];
    service.scanReceipt$(RECEIPT_URL, (a) => attempts.push(a)).subscribe({ error: (e) => (error = e) });

    respond(null);
    tick(1500);
    respond(null);
    tick(3000);
    respond(null);

    expect(attempts).toEqual([1, 2]);
    expect(error instanceof ReceiptScanError && error.kind).toBe('tax-authority-empty');
  }));
});
