import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ShieldCheck, Copy, Check, Play, RotateCcw, Info,
  CheckCircle2, XCircle, HelpCircle, Loader2,
  CreditCard, Building2, Globe, Tag, Fingerprint, Square,
  Zap, ShoppingCart, Clock, DollarSign, Trash2,
  Store, MapPin, Hash, Mail, Package, Wifi,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import ProxyManager from "./proxy-manager";

type CheckMode = "chkr" | "stripe-auth" | "stripe-checkout";

interface BinInfo {
  valid: boolean;
  bin: string;
  cardBrand: string;
  cardType: string;
  cardCategory: string;
  issuer: string;
  issuerWebsite: string;
  issuerPhone: string;
  country: string;
  countryCode: string;
  currencyCode: string;
  isPrepaid: boolean;
  isCommercial: boolean;
}

interface FingerprintMeta {
  system?: string;
  mac?: string;
  deviceName?: string;
  timezone?: string;
  language?: string;
  country?: string;
  screen?: string;
  renderer?: string;
}

interface IpInfo {
  ip?: string;
  country?: string;
  city?: string;
  isp?: string;
}

interface CheckResult {
  card: string;
  status: "Live" | "Die" | "Unknown" | "Error" | "Approved" | "Declined" | "3DS" | "Charged";
  message: string;
  bank?: string;
  type?: string;
  country?: string;
  binInfo?: BinInfo;
  fingerprint?: FingerprintMeta;
  gateway?: string;
  time?: string;
  chargeAmount?: string;
  currency?: string;
  ipInfo?: IpInfo;
}

function parseCheckCards(raw: string): string[] {
  return raw.split(/[\n\r]+/).map((l) => l.trim()).filter((l) => l.length > 0 && l.replace(/[|,\s]/g, "").length >= 6);
}

function normalizeCardLine(line: string): string {
  const parts = line.split(/[|,\s\t]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 4) return `${parts[0]}|${parts[1]}|${parts[2]}|${parts[3]}`;
  if (parts.length === 3) return `${parts[0]}|${parts[1]}|${parts[2]}`;
  return parts[0] || line;
}

function extractBin(cardLine: string): string {
  const num = cardLine.split("|")[0].replace(/\D/g, "");
  return num.substring(0, 6);
}

const binInfoCache = new Map<string, BinInfo>();

async function fetchBinInfo(bin: string): Promise<BinInfo | null> {
  if (binInfoCache.has(bin)) return binInfoCache.get(bin)!;
  try {
    const resp = await fetch("/api/bin-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bin }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.error) return null;
    binInfoCache.set(bin, data);
    return data;
  } catch {
    return null;
  }
}

export default function CardChecker() {
  const [rawInput, setRawInput] = useState("");
  const [results, setResults] = useState<CheckResult[]>([]);
  const [checking, setChecking] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [totalCards, setTotalCards] = useState(0);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [checkMode, setCheckMode] = useState<CheckMode>("chkr");
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [currencyOverride, setCurrencyOverride] = useState("");
  const [grabbing, setGrabbing] = useState(false);
  const [grabbedData, setGrabbedData] = useState<{
    csLive: string; pkLive: string; amount: string; currency: string; email: string;
    merchantName: string; merchantCountry: string; merchantId: string; merchantLogo: string;
    paymentMethods: string[]; cardNetworks: string[];
    lineItems: { name: string; amount: number; quantity: number; currency?: string }[];
  } | null>(null);
  const stopRef = useRef(false);
  const { toast } = useToast();

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(key);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch {
      toast({ title: "Copy Failed", variant: "destructive" });
    }
  }, [toast]);

  const handleStop = useCallback(() => {
    stopRef.current = true;
    toast({ title: "Stopping", description: "Will stop after current card finishes..." });
  }, [toast]);

  const handleGrab = useCallback(async () => {
    const url = checkoutUrl.trim();
    if (!url) {
      toast({ title: "Missing URL", description: "Enter a checkout.stripe.com or buy.stripe.com link", variant: "destructive" });
      return;
    }
    setGrabbing(true);
    setGrabbedData(null);
    try {
      const resp = await fetch("/api/stripe-checkout/grab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutUrl: url }),
      });
      const data = await resp.json();
      if (data.success) {
        setGrabbedData(data);
        toast({ title: "Grabbed", description: `${data.merchantName ? data.merchantName + " — " : ""}CS: ${data.csLive?.substring(0, 16)}... PK: ${data.pkLive?.substring(0, 16)}...` });
      } else {
        toast({ title: "Grab Failed", description: data.message || "Could not extract details", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Grab request failed", variant: "destructive" });
    }
    setGrabbing(false);
  }, [checkoutUrl, toast]);

  const handleCheck = useCallback(async () => {
    const lines = parseCheckCards(rawInput);
    if (lines.length === 0) {
      toast({ title: "No Cards", description: "Paste cards in format: number|month|year|cvv", variant: "destructive" });
      return;
    }

    if (checkMode === "stripe-checkout" && !checkoutUrl.trim()) {
      toast({ title: "Missing Checkout URL", description: "Enter a buy.stripe.com or checkout.stripe.com link", variant: "destructive" });
      return;
    }

    stopRef.current = false;
    setChecking(true);
    setResults([]);
    setTotalCards(lines.length);
    setCurrentIdx(0);

    

    const newResults: CheckResult[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (stopRef.current) {
        toast({ title: "Stopped", description: `Stopped after ${i} of ${lines.length} cards.` });
        break;
      }

      setCurrentIdx(i + 1);
      const normalized = normalizeCardLine(lines[i]);
      const bin = extractBin(normalized);

      let apiEndpoint = "/api/check-card";
      let apiBody: any = { data: normalized };

      if (checkMode === "stripe-auth") {
        apiEndpoint = "/api/stripe-auth";
        apiBody = { data: normalized };
      } else if (checkMode === "stripe-checkout") {
        apiEndpoint = "/api/stripe-checkout";
        apiBody = { data: normalized, checkoutUrl: checkoutUrl.trim(), ...(currencyOverride ? { currencyOverride } : {}) };
      }

      const [checkResp, binInfo] = await Promise.all([
        fetch(apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiBody),
        }).then(r => r.json()).catch((err: any) => ({ code: 2, status: "Error", message: err.message || "Request failed" })),
        fetchBinInfo(bin),
      ]);

      let status: CheckResult["status"] = "Unknown";

      if (checkMode === "chkr") {
        if (checkResp.code === 1 || checkResp.status === "Live") status = "Live";
        else if (checkResp.code === 0 || checkResp.status === "Die") status = "Die";
      } else {
        const s = (checkResp.status || "").toUpperCase();
        if (s === "APPROVED" || s === "CHARGED" || checkResp.approved === true) status = checkMode === "stripe-checkout" ? "Charged" : "Approved";
        else if (s === "SESSION_EXPIRED") status = "Error";
        else if (s === "3DS") status = "3DS";
        else if (s === "DECLINED") status = "Declined";
        else if (s === "ERROR") status = "Error";
        else status = "Unknown";
      }

      newResults.push({
        card: normalized,
        status,
        message: checkResp.message || checkResp.status || "No response",
        bank: binInfo?.issuer || checkResp.card?.bank,
        type: binInfo?.cardType || checkResp.card?.type,
        country: binInfo?.country || checkResp.card?.country?.name,
        binInfo: binInfo || undefined,
        fingerprint: checkResp.fingerprint || undefined,
        gateway: checkResp.gateway,
        time: checkResp.time,
        chargeAmount: checkResp.chargeAmount,
        currency: checkResp.currency,
        ipInfo: checkResp.ipInfo || undefined,
      });

      setResults([...newResults]);

      if (checkResp.sessionExpired) {
        stopRef.current = true;
        toast({ title: "Session Expired", description: "The checkout session is no longer active. Stopping all remaining cards.", variant: "destructive" });
        break;
      }

      if (checkResp.approved === true && checkMode === "stripe-checkout") {
        stopRef.current = true;
        toast({ title: "Payment Successful!", description: "A card was charged successfully. Stopping remaining cards to avoid duplicate charges." });
        break;
      }

      if (i < lines.length - 1 && !stopRef.current) {
        const jitter = Math.floor(Math.random() * 2000);
        const baseDelay = checkMode === "chkr" ? 4000 : 3000;
        await new Promise((r) => setTimeout(r, baseDelay + jitter));
      }
    }

    setChecking(false);
    stopRef.current = false;

    const liveCount = newResults.filter((r) => r.status === "Live" || r.status === "Approved" || r.status === "Charged").length;
    const dieCount = newResults.filter((r) => r.status === "Die" || r.status === "Declined").length;
    const tdsCount = newResults.filter((r) => r.status === "3DS").length;
    toast({ title: "Check Complete", description: `${liveCount} live, ${dieCount} dead${tdsCount ? `, ${tdsCount} 3DS` : ""}, ${newResults.length - liveCount - dieCount - tdsCount} unknown out of ${newResults.length} cards.` });
  }, [rawInput, toast, checkMode, checkoutUrl, currencyOverride]);

  const handleReset = useCallback(() => {
    stopRef.current = true;
    setRawInput("");
    setResults([]);
    setChecking(false);
    setCurrentIdx(0);
    setTotalCards(0);
  }, []);

  const handleClearResults = useCallback(() => {
    setResults([]);
    setCurrentIdx(0);
    setTotalCards(0);
    toast({ title: "Results Cleared", description: "All check results have been removed." });
  }, [toast]);

  const formatAmount = (cents: string, cur: string) => {
    if (!cents) return "";
    const num = parseInt(cents);
    if (isNaN(num)) return cents;
    const formatted = (num / 100).toFixed(2);
    return `${formatted} ${cur?.toUpperCase() || "USD"}`;
  };

  

  const liveCards = results.filter((r) => r.status === "Live" || r.status === "Approved" || r.status === "Charged");
  const deadCards = results.filter((r) => r.status === "Die" || r.status === "Declined");
  const tdsCards = results.filter((r) => r.status === "3DS");
  const unknownCards = results.filter((r) => r.status === "Unknown" || r.status === "Error");

  const statusIcon = (status: CheckResult["status"]) => {
    switch (status) {
      case "Live": case "Approved": case "Charged": return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
      case "Die": case "Declined": return <XCircle className="w-4 h-4 text-destructive shrink-0" />;
      case "3DS": return <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0" />;
      default: return <HelpCircle className="w-4 h-4 text-yellow-500 shrink-0" />;
    }
  };

  const statusColor = (status: CheckResult["status"]) => {
    switch (status) {
      case "Live": case "Approved": case "Charged": return "text-green-500";
      case "Die": case "Declined": return "text-destructive";
      case "3DS": return "text-blue-500";
      default: return "text-yellow-500";
    }
  };

  const renderResultRow = (r: CheckResult, idx: number, prefix: string) => (
    <div
      key={idx}
      className={`flex items-start justify-between gap-3 rounded-md px-3 py-2.5 group ${
        r.status === "Live" || r.status === "Approved" || r.status === "Charged" ? "bg-green-500/5" :
        r.status === "Die" || r.status === "Declined" ? "bg-destructive/5" :
        r.status === "3DS" ? "bg-blue-500/5" : "bg-yellow-500/5"
      }`}
      data-testid={`row-${prefix}-${idx}`}
    >
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <div className="mt-0.5">{statusIcon(r.status)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="font-mono text-xs sm:text-sm truncate">{r.card}</code>
            <Badge variant="outline" className={`text-[10px] ${statusColor(r.status)}`}>{r.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{r.message}</p>
          {(r.bank || r.type || r.country) && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {r.bank && r.bank !== "Unknown" && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Building2 className="w-2.5 h-2.5" />{r.bank}
                </Badge>
              )}
              {r.type && r.type !== "Unknown" && (
                <Badge variant="outline" className="text-[10px] capitalize gap-1">
                  <CreditCard className="w-2.5 h-2.5" />{r.type}
                </Badge>
              )}
              {r.country && r.country !== "Unknown" && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Globe className="w-2.5 h-2.5" />{r.country}
                </Badge>
              )}
            </div>
          )}
          {r.binInfo && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {r.binInfo.cardBrand && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <Tag className="w-2.5 h-2.5" />{r.binInfo.cardBrand}
                </Badge>
              )}
              {r.binInfo.cardCategory && (
                <Badge variant="secondary" className="text-[10px]">{r.binInfo.cardCategory}</Badge>
              )}
              {r.binInfo.currencyCode && (
                <Badge variant="secondary" className="text-[10px]">{r.binInfo.currencyCode}</Badge>
              )}
              {r.binInfo.isPrepaid && (
                <Badge variant="secondary" className="text-[10px] text-yellow-600">Prepaid</Badge>
              )}
              {r.binInfo.isCommercial && (
                <Badge variant="secondary" className="text-[10px]">Commercial</Badge>
              )}
            </div>
          )}
          {(r.gateway || r.time || r.chargeAmount) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {r.gateway && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Zap className="w-2.5 h-2.5" />{r.gateway}
                </Badge>
              )}
              {r.time && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Clock className="w-2.5 h-2.5" />{r.time}s
                </Badge>
              )}
              {r.chargeAmount && (
                <Badge variant="outline" className="text-[10px] gap-1 text-green-600">
                  <DollarSign className="w-2.5 h-2.5" />{(parseInt(r.chargeAmount) / 100).toFixed(2)} {r.currency?.toUpperCase()}
                </Badge>
              )}
            </div>
          )}
          {r.ipInfo?.ip && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5" data-testid={`ip-info-${prefix}-${idx}`}>
              <div className="flex items-center gap-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5">
                <Wifi className="w-2.5 h-2.5 text-cyan-400" />
                <span className="font-mono text-[10px] font-semibold text-cyan-400">{r.ipInfo.ip}</span>
              </div>
              {r.ipInfo.country && (
                <div className="flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5">
                  <Globe className="w-2.5 h-2.5 text-amber-400" />
                  <span className="text-[10px] font-bold text-amber-400">{r.ipInfo.country}</span>
                </div>
              )}
              {r.ipInfo.city && (
                <span className="text-[10px] text-muted-foreground/60 italic">{r.ipInfo.city}</span>
              )}
              {r.ipInfo.isp && (
                <span className="text-[10px] text-muted-foreground/40 truncate max-w-[150px]">{r.ipInfo.isp}</span>
              )}
            </div>
          )}
          {r.fingerprint && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[10px] text-muted-foreground/70">
              <Fingerprint className="w-2.5 h-2.5" />
              <span>{r.fingerprint.system}</span>
              <span className="opacity-50">·</span>
              <span>{r.fingerprint.timezone}</span>
              <span className="opacity-50">·</span>
              <span>{r.fingerprint.screen}</span>
              <span className="opacity-50">·</span>
              <span className="font-mono">{r.fingerprint.mac}</span>
            </div>
          )}
        </div>
      </div>
      <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 shrink-0" onClick={() => copyToClipboard(r.card, `${prefix}-${idx}`)}>
        {copiedIndex === `${prefix}-${idx}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <ProxyManager />

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-lg">Card Checker</CardTitle>
            {checkMode !== "chkr" && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Zap className="w-2.5 h-2.5" />
                {checkMode === "stripe-auth" ? "Stripe Auth" : "Stripe Checkout"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 rounded-md bg-accent/50 px-3 py-2.5 text-sm text-muted-foreground">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Paste cards one per line in format <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">number|month|year|cvv</code>. Proxy required.</span>
          </div>

          <div data-testid="section-check-mode">
            <Label className="text-xs font-medium text-muted-foreground mb-2 block">Check Mode</Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all ${
                  checkMode === "chkr"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-accent"
                }`}
                onClick={() => setCheckMode("chkr")}
                disabled={checking}
                data-testid="button-mode-chkr"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Chkr.cc
              </button>
              <button
                className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all ${
                  checkMode === "stripe-auth"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-accent"
                }`}
                onClick={() => setCheckMode("stripe-auth")}
                disabled={checking}
                data-testid="button-mode-stripe-auth"
              >
                <CreditCard className="w-3.5 h-3.5" />
                Stripe Auth
              </button>
              <button
                className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all ${
                  checkMode === "stripe-checkout"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-accent"
                }`}
                onClick={() => setCheckMode("stripe-checkout")}
                disabled={checking}
                data-testid="button-mode-stripe-checkout"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                Stripe Checkout
              </button>
            </div>
          </div>

          {checkMode === "stripe-auth" && (
            <div className="flex items-start gap-2 rounded-md bg-blue-500/5 border border-blue-500/20 px-3 py-2.5 text-xs text-blue-400">
              <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>WooCommerce Setup Intent flow. Registers account → creates payment method → confirms setup intent. Returns: Approved / 3DS / Declined.</span>
            </div>
          )}

          {checkMode === "stripe-checkout" && (
            <div className="space-y-3 rounded-md border border-border/60 p-3 bg-accent/20">
              <p className="text-xs font-semibold">Stripe Checkout Configuration</p>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Checkout URL</Label>
                <div className="flex gap-2">
                  <Input
                    data-testid="input-checkout-url"
                    value={checkoutUrl}
                    onChange={(e) => { setCheckoutUrl(e.target.value); setGrabbedData(null); }}
                    placeholder="https://checkout.stripe.com/c/pay/cs_live_... or buy.stripe.com/..."
                    className="font-mono text-xs flex-1"
                    disabled={checking || grabbing}
                  />
                  <Button
                    size="sm"
                    onClick={handleGrab}
                    disabled={checking || grabbing || !checkoutUrl.trim()}
                    className="h-9 bg-purple-600 hover:bg-purple-700 text-white shrink-0"
                    data-testid="button-grab"
                  >
                    {grabbing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
                    Grab
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Currency Override <span className="text-muted-foreground/50">(optional)</span></Label>
                <div className="flex gap-2 items-center">
                  <select
                    data-testid="select-currency-override"
                    value={currencyOverride}
                    onChange={(e) => setCurrencyOverride(e.target.value)}
                    disabled={checking}
                    className="h-9 rounded-md border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Auto (from session)</option>
                    <option value="usd">USD - US Dollar</option>
                    <option value="eur">EUR - Euro</option>
                    <option value="gbp">GBP - British Pound</option>
                    <option value="bdt">BDT - Bangladeshi Taka</option>
                    <option value="inr">INR - Indian Rupee</option>
                    <option value="cad">CAD - Canadian Dollar</option>
                    <option value="aud">AUD - Australian Dollar</option>
                    <option value="jpy">JPY - Japanese Yen</option>
                    <option value="sgd">SGD - Singapore Dollar</option>
                    <option value="myr">MYR - Malaysian Ringgit</option>
                    <option value="pkr">PKR - Pakistani Rupee</option>
                    <option value="php">PHP - Philippine Peso</option>
                    <option value="ngn">NGN - Nigerian Naira</option>
                    <option value="brl">BRL - Brazilian Real</option>
                    <option value="try">TRY - Turkish Lira</option>
                    <option value="zar">ZAR - South African Rand</option>
                    <option value="aed">AED - UAE Dirham</option>
                    <option value="chf">CHF - Swiss Franc</option>
                    <option value="sek">SEK - Swedish Krona</option>
                    <option value="nok">NOK - Norwegian Krone</option>
                    <option value="dkk">DKK - Danish Krone</option>
                    <option value="pln">PLN - Polish Zloty</option>
                    <option value="czk">CZK - Czech Koruna</option>
                    <option value="huf">HUF - Hungarian Forint</option>
                    <option value="ron">RON - Romanian Leu</option>
                    <option value="bgn">BGN - Bulgarian Lev</option>
                    <option value="hrk">HRK - Croatian Kuna</option>
                    <option value="rub">RUB - Russian Ruble</option>
                    <option value="krw">KRW - South Korean Won</option>
                    <option value="thb">THB - Thai Baht</option>
                    <option value="idr">IDR - Indonesian Rupiah</option>
                    <option value="vnd">VND - Vietnamese Dong</option>
                    <option value="mxn">MXN - Mexican Peso</option>
                    <option value="cop">COP - Colombian Peso</option>
                    <option value="ars">ARS - Argentine Peso</option>
                    <option value="clp">CLP - Chilean Peso</option>
                    <option value="pen">PEN - Peruvian Sol</option>
                    <option value="kes">KES - Kenyan Shilling</option>
                    <option value="ghs">GHS - Ghanaian Cedi</option>
                    <option value="egp">EGP - Egyptian Pound</option>
                    <option value="lkr">LKR - Sri Lankan Rupee</option>
                    <option value="nzd">NZD - New Zealand Dollar</option>
                    <option value="hkd">HKD - Hong Kong Dollar</option>
                    <option value="twd">TWD - Taiwan Dollar</option>
                    <option value="cny">CNY - Chinese Yuan</option>
                  </select>
                  {currencyOverride && (
                    <span className="text-[10px] text-yellow-500">Overriding auto-detected currency</span>
                  )}
                </div>
              </div>
              {grabbedData && (
                <div className="space-y-3" data-testid="section-grabbed-data">
                  <div className="rounded-lg border border-purple-500/20 bg-gradient-to-br from-purple-500/5 via-background to-indigo-500/5 overflow-hidden">
                    <div className="px-4 py-3 border-b border-purple-500/10 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        {grabbedData.merchantLogo ? (
                          <img src={grabbedData.merchantLogo} alt="" className="w-8 h-8 rounded-lg object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
                            <Store className="w-4 h-4 text-purple-400" />
                          </div>
                        )}
                        <div>
                          <h4 className="text-sm font-semibold" data-testid="text-merchant-name">
                            {grabbedData.merchantName || "Unknown Merchant"}
                          </h4>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            {grabbedData.merchantCountry && (
                              <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" /> {grabbedData.merchantCountry}</span>
                            )}
                            {grabbedData.merchantId && (
                              <>
                                <span className="opacity-30">|</span>
                                <span className="font-mono">{grabbedData.merchantId}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {grabbedData.amount && (
                        <div className="text-right">
                          <p className="text-lg font-bold text-purple-400" data-testid="text-amount">
                            {formatAmount(grabbedData.amount, grabbedData.currency)}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="px-4 py-3 space-y-2.5">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                        {grabbedData.currency && (
                          <div className="flex items-center gap-2 text-xs">
                            <DollarSign className="w-3 h-3 text-purple-400 shrink-0" />
                            <span className="text-muted-foreground">Currency</span>
                            <span className="font-semibold ml-auto" data-testid="text-currency">{grabbedData.currency.toUpperCase()}</span>
                          </div>
                        )}
                        {grabbedData.amount && (
                          <div className="flex items-center gap-2 text-xs">
                            <Tag className="w-3 h-3 text-purple-400 shrink-0" />
                            <span className="text-muted-foreground">Amount</span>
                            <span className="font-mono font-semibold ml-auto">{formatAmount(grabbedData.amount, grabbedData.currency)}</span>
                          </div>
                        )}
                        {grabbedData.email && (
                          <div className="flex items-center gap-2 text-xs col-span-2">
                            <Mail className="w-3 h-3 text-purple-400 shrink-0" />
                            <span className="text-muted-foreground">Email</span>
                            <span className="font-mono text-[11px] ml-auto truncate max-w-[200px]" data-testid="text-email">{grabbedData.email}</span>
                          </div>
                        )}
                      </div>

                      {(grabbedData.lineItems?.length > 0) && (
                        <div className="space-y-1 pt-1.5 border-t border-border/40">
                          <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1"><Package className="w-3 h-3" /> Items</p>
                          {grabbedData.lineItems.map((item, i) => (
                            <div key={i} className="flex items-center justify-between text-xs bg-background/50 rounded px-2 py-1.5">
                              <span className="truncate flex-1">{item.name || "Item"} {item.quantity > 1 ? ` x${item.quantity}` : ""}</span>
                              <span className="font-mono text-[11px] text-muted-foreground ml-2">{formatAmount(String(item.amount), item.currency || grabbedData.currency)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-1 pt-1.5 border-t border-border/40">
                        <div className="flex items-center gap-2 text-xs">
                          <Hash className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground w-10 shrink-0">CS</span>
                          <code className="font-mono text-[10px] truncate flex-1 text-foreground/70" data-testid="text-cs-live">{grabbedData.csLive}</code>
                          <Button size="icon" variant="ghost" className="shrink-0" onClick={() => copyToClipboard(grabbedData.csLive, "cs")}>
                            {copiedIndex === "cs" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <Hash className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground w-10 shrink-0">PK</span>
                          <code className="font-mono text-[10px] truncate flex-1 text-foreground/70" data-testid="text-pk-live">{grabbedData.pkLive}</code>
                          <Button size="icon" variant="ghost" className="shrink-0" onClick={() => copyToClipboard(grabbedData.pkLive, "pk")}>
                            {copiedIndex === "pk" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {!grabbedData && !grabbing && (
                <div className="text-[11px] text-muted-foreground/60 text-center py-1">
                  Enter a checkout URL and click Grab to extract session details
                </div>
              )}
              {grabbing && (
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Extracting session details...
                </div>
              )}
            </div>
          )}

          <Textarea
            data-testid="input-check-cards"
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            className="font-mono text-sm min-h-[160px] resize-y"
            rows={7}
            disabled={checking}
          />

          {checking && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>
                {checkMode === "chkr" ? "Checking" : checkMode === "stripe-auth" ? "Auth checking" : "Hitting"} card {currentIdx} of {totalCards}...
              </span>
            </div>
          )}

          <Separator />

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={handleReset} disabled={checking} data-testid="button-reset-checker">
              <RotateCcw className="w-4 h-4 mr-1.5" />Reset
            </Button>
            {checking ? (
              <Button variant="destructive" onClick={handleStop} data-testid="button-stop-checker">
                <Square className="w-4 h-4 mr-1.5" />Stop
              </Button>
            ) : (
              <Button onClick={handleCheck} data-testid="button-check">
                <Play className="w-4 h-4 mr-1.5" />
                {checkMode === "chkr" ? "Check Cards" : checkMode === "stripe-auth" ? "Auth Check" : "Hit Cards"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <AnimatePresence>
        {results.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-semibold" data-testid="text-check-heading">Results</h2>
                {liveCards.length > 0 && <Badge className="bg-green-500/15 text-green-600 border-green-500/30">{liveCards.length} {checkMode === "stripe-checkout" ? "Charged" : checkMode === "stripe-auth" ? "Approved" : "Live"}</Badge>}
                {tdsCards.length > 0 && <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30">{tdsCards.length} 3DS</Badge>}
                {deadCards.length > 0 && <Badge variant="destructive">{deadCards.length} {checkMode !== "chkr" ? "Declined" : "Dead"}</Badge>}
                {unknownCards.length > 0 && <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/30">{unknownCards.length} Unknown</Badge>}
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearResults}
                disabled={checking}
                data-testid="button-clear-results"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Clear Results
              </Button>
            </div>

            {liveCards.length > 0 && (
              <Card data-testid="section-live-cards">
                <CardHeader className="pb-2 pt-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <CardTitle className="text-sm font-semibold text-green-600">
                        {checkMode === "stripe-checkout" ? "Charged Cards" : checkMode === "stripe-auth" ? "Approved Cards" : "Live Cards"}
                      </CardTitle>
                      <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-[10px]">{liveCards.length}</Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(liveCards.map(r => r.card).join("\n"), "copy-all-live")}
                      data-testid="button-copy-all-live"
                    >
                      {copiedIndex === "copy-all-live" ? <Check className="w-3.5 h-3.5 mr-1.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                      Copy All
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="py-2 px-4">
                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                    {liveCards.map((r, idx) => renderResultRow(r, idx, "live"))}
                  </div>
                </CardContent>
              </Card>
            )}

            {deadCards.length > 0 && (
              <Card data-testid="section-dead-cards">
                <CardHeader className="pb-2 pt-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-destructive" />
                      <CardTitle className="text-sm font-semibold text-destructive">
                        {checkMode !== "chkr" ? "Declined Cards" : "Dead Cards"}
                      </CardTitle>
                      <Badge variant="destructive" className="text-[10px]">{deadCards.length}</Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(deadCards.map(r => r.card).join("\n"), "copy-all-dead")}
                      data-testid="button-copy-all-dead"
                    >
                      {copiedIndex === "copy-all-dead" ? <Check className="w-3.5 h-3.5 mr-1.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                      Copy All
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="py-2 px-4">
                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                    {deadCards.map((r, idx) => renderResultRow(r, idx, "dead"))}
                  </div>
                </CardContent>
              </Card>
            )}

            {tdsCards.length > 0 && (
              <Card data-testid="section-3ds-cards">
                <CardHeader className="pb-2 pt-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-blue-500" />
                      <CardTitle className="text-sm font-semibold text-blue-500">3DS Required</CardTitle>
                      <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30 text-[10px]">{tdsCards.length}</Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(tdsCards.map(r => r.card).join("\n"), "copy-all-3ds")}
                      data-testid="button-copy-all-3ds"
                    >
                      {copiedIndex === "copy-all-3ds" ? <Check className="w-3.5 h-3.5 mr-1.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                      Copy All
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="py-2 px-4">
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {tdsCards.map((r, idx) => renderResultRow(r, idx, "3ds"))}
                  </div>
                </CardContent>
              </Card>
            )}

            {unknownCards.length > 0 && (
              <Card data-testid="section-unknown-cards">
                <CardHeader className="pb-2 pt-3 px-4">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-yellow-500" />
                    <CardTitle className="text-sm font-semibold text-yellow-600">Unknown</CardTitle>
                    <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/30 text-[10px]">{unknownCards.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="py-2 px-4">
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {unknownCards.map((r, idx) => renderResultRow(r, idx, "unknown"))}
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {results.length === 0 && !checking && (
        <div className="text-center py-16" data-testid="text-checker-empty">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-muted mb-4"><ShieldCheck className="w-6 h-6 text-muted-foreground" /></div>
          <h3 className="text-base font-medium text-muted-foreground mb-1">No results yet</h3>
          <p className="text-sm text-muted-foreground/70 max-w-sm mx-auto">Paste your cards above and click Check Cards to verify them.</p>
        </div>
      )}
    </div>
  );
}
