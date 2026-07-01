import os
from fastapi import FastAPI, Header, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from parser import parse_taxcore_receipt, parse_number
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import asyncio

semaphore = asyncio.Semaphore(8)

app = FastAPI()

# Ograničenje: 10 zahteva po minutu po jednoj IP adresi
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://jybatqpvokssutompyto.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")

if not SUPABASE_ANON_KEY:
    print("❌ UPOZORENJE: SUPABASE_ANON_KEY nije podešen u environment promenljivim!")


class ScanRequest(BaseModel):
    url: str


async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Nedostaje Authorization header")

    token = authorization.split(" ", 1)[1].strip()

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {token}",
            },
        )

    if res.status_code != 200:
        raise HTTPException(status_code=401, detail="Nevažeći token")

    user = res.json()
    return {"uid": user["id"], "email": user.get("email")}


@app.get("/")
async def getHello():
    return "Hello FuelScan User"


@app.post("/parse-receipt")
@limiter.limit("10/minute")
async def parse_receipt(request: Request, data: ScanRequest, user=Depends(get_current_user)):
    async with semaphore:
        try:
            # 1. Pokrećemo parser koji izvlači sve sirove podatke
            receipt = await parse_taxcore_receipt(data.url)
            print("Recipt:", receipt)

            station = receipt.get("station", "Nepoznata pumpa")

            address = receipt.get("address")
            city = receipt.get("city")
            municipality = receipt.get("municipality")

            fuel_type = None
            liters = None
            price_per_l = None
            total_raw = None

            # Tražimo ključne reči kao što su DIZEL, BMB, EVRO PREMIJUM, GAS, G-DRIVE...
            fuel_keywords = ["DIZEL", "BMB", "GAS", "TNG", "BENZIN", "PREMIUM", "DRIVE", "OPTIPUR"]

            print("Printing intems:")
            for item in receipt["items"]:
                item_name_upper = item["name"].upper()
                print("Item name: ", item_name_upper)
                if any(keyword in item_name_upper for keyword in fuel_keywords):
                    fuel_type = item["name"].strip()
                    liters = item["quantity"]
                    price_per_l = item["unit_price"]
                    total_raw = item["total"]
                    break

            total_parsed = parse_number(total_raw) if total_raw else None

            # 6. Pakovanje čistog objekta za frontend
            ret = {
                "status": "success",
                "user_id": user["uid"],
                "station": station,
                "address": address,
                "city": city,
                "municipality": municipality,
                "fuel_type": fuel_type,
                "liters": liters,
                "price_per_l": price_per_l,
                "total": total_parsed,
                "date": receipt["date"],
                "invoice_number": receipt["invoice_number"],
                "raw_url": data.url
            }

            print(ret)
            return ret

        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=7860)
