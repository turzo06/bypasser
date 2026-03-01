import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Shield, Plus, Trash2, Loader2, CheckCircle2, XCircle,
  Globe, Wifi, Copy, Check, Fingerprint, RefreshCw,
  Star, Power, Signal, ShieldOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProxyInfo {
  url: string;
  label: string;
  working: boolean;
  lastCheckedIp?: string;
  lastChecked?: string;
  country?: string;
  isDefault?: boolean;
}

interface CheckResult {
  working: boolean;
  ip?: string;
  country?: string;
  city?: string;
  isp?: string;
  message: string;
}

interface FingerprintMeta {
  system: string;
  mac: string;
  deviceName: string;
  concurrency: string;
  memory: string;
  screen: string;
  renderer: string;
  vendor: string;
  canvasHash: string;
  audioHash: string;
  clientRectsHash: string;
  fontHash: string;
  mediaDevices: string;
  speechVoices: string;
  timezone: string;
  language: string;
  dnt: string;
  country: string;
}

export default function ProxyManager() {
  const [proxyInput, setProxyInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [proxies, setProxies] = useState<ProxyInfo[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [proxyEnabled, setProxyEnabled] = useState(true);
  const [fingerprintEnabled, setFingerprintEnabled] = useState(false);
  const [fpMeta, setFpMeta] = useState<FingerprintMeta | null>(null);
  const [fpLoading, setFpLoading] = useState(false);
  const { toast } = useToast();

  const fetchProxies = useCallback(async () => {
    try {
      const [proxyResp, fpResp] = await Promise.all([
        fetch("/api/proxy/list"),
        fetch("/api/fingerprint/status"),
      ]);
      const proxyData = await proxyResp.json();
      const fpData = await fpResp.json();
      setProxies(proxyData.proxies || []);
      setActiveIndex(proxyData.activeIndex ?? -1);
      setProxyEnabled(proxyData.proxyEnabled !== false);
      setFingerprintEnabled(fpData.enabled || false);
    } catch {}
  }, []);

  useEffect(() => {
    fetchProxies();
  }, [fetchProxies]);

  const refreshFingerprint = useCallback(async () => {
    setFpLoading(true);
    try {
      const resp = await fetch("/api/fingerprint/preview");
      const data = await resp.json();
      setFpMeta(data.meta);
    } catch {}
    setFpLoading(false);
  }, []);

  useEffect(() => {
    if (fingerprintEnabled && !fpMeta) {
      refreshFingerprint();
    }
  }, [fingerprintEnabled, fpMeta, refreshFingerprint]);

  const toggleProxy = useCallback(async (enabled: boolean) => {
    setProxyEnabled(enabled);
    try {
      const resp = await fetch("/api/proxy/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!resp.ok) throw new Error("Server error");
      const data = await resp.json();
      if (!data.success) throw new Error("Toggle failed");
      toast({
        title: enabled ? "Proxy Enabled" : "Proxy Disabled",
        description: enabled ? "Requests will route through proxy" : "Requests will use direct connection",
      });
    } catch {
      setProxyEnabled(!enabled);
      toast({ title: "Error", description: "Failed to toggle proxy", variant: "destructive" });
    }
  }, [toast]);

  const toggleFingerprint = useCallback(async (enabled: boolean) => {
    setFingerprintEnabled(enabled);
    try {
      const resp = await fetch("/api/fingerprint/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!resp.ok) throw new Error("Server error");
      if (enabled) {
        refreshFingerprint();
      } else {
        setFpMeta(null);
      }
      toast({
        title: enabled ? "Fingerprint ON" : "Fingerprint OFF",
        description: enabled
          ? "Auto-randomized per card check, geo-matched to proxy"
          : "Default headers restored",
      });
    } catch {
      setFingerprintEnabled(!enabled);
      toast({ title: "Error", description: "Failed to toggle fingerprint", variant: "destructive" });
    }
  }, [toast, refreshFingerprint]);

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(key);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch {
      toast({ title: "Copy Failed", variant: "destructive" });
    }
  }, [toast]);

  const handleCheck = useCallback(async () => {
    const proxy = proxyInput.trim();
    if (!proxy) {
      toast({ title: "Enter a proxy", description: "Paste your proxy URL or IP:port", variant: "destructive" });
      return;
    }

    setChecking(true);
    setCheckResult(null);

    try {
      const resp = await fetch("/api/proxy/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxy }),
      });
      const data = await resp.json();
      setCheckResult(data);

      if (data.working) {
        toast({ title: "Proxy Working", description: `Connected via ${data.ip} (${data.country || "Unknown"})` });
      } else {
        toast({ title: "Proxy Failed", description: data.message, variant: "destructive" });
      }
    } catch (err: any) {
      setCheckResult({ working: false, message: err.message || "Check failed" });
      toast({ title: "Error", description: "Proxy check failed", variant: "destructive" });
    }

    setChecking(false);
  }, [proxyInput, toast]);

  const handleAdd = useCallback(async () => {
    if (!checkResult?.working) {
      toast({ title: "Check First", description: "Proxy must pass check before adding", variant: "destructive" });
      return;
    }

    try {
      const resp = await fetch("/api/proxy/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proxy: proxyInput.trim(),
          label: `${checkResult.country || "Proxy"} - ${checkResult.ip}`,
          ip: checkResult.ip,
          country: checkResult.country,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setProxies(data.proxies);
        if (data.proxies.length === 1) {
          await fetch("/api/proxy/set-active", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ index: 0 }),
          });
          setActiveIndex(0);
        }
        setProxyInput("");
        setCheckResult(null);
        toast({ title: "Proxy Added", description: "Card checker will route through this proxy" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to add proxy", variant: "destructive" });
    }
  }, [proxyInput, checkResult, toast]);

  const handleRemove = useCallback(async (index: number) => {
    try {
      const resp = await fetch(`/api/proxy/${index}`, { method: "DELETE" });
      const data = await resp.json();
      if (data.success) {
        setProxies(data.proxies);
        setActiveIndex(data.activeIndex ?? -1);
        toast({ title: "Proxy Removed" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to remove proxy", variant: "destructive" });
    }
  }, [toast]);

  const handleSetActive = useCallback(async (index: number) => {
    const newIdx = index === activeIndex ? -1 : index;
    try {
      await fetch("/api/proxy/set-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: newIdx }),
      });
      setActiveIndex(newIdx);
      toast({
        title: newIdx === -1 ? "Round-Robin Mode" : "Active Proxy Set",
        description: newIdx === -1 ? "Will rotate through all working proxies" : `Using: ${proxies[newIdx]?.label}`,
      });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  }, [activeIndex, proxies, toast]);

  const workingCount = proxies.filter(p => p.working).length;

  return (
    <div className="space-y-3" data-testid="section-proxy-manager">
      {/* ===== PROXY SECTION ===== */}
      <Card className={`transition-all ${!proxyEnabled ? "opacity-75" : ""}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-1.5 rounded-lg ${proxyEnabled ? "bg-emerald-500/10" : "bg-muted"}`}>
                {proxyEnabled ? (
                  <Shield className="w-4 h-4 text-emerald-500" />
                ) : (
                  <ShieldOff className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Proxy</CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {proxyEnabled ? (
                    workingCount > 0 ? `${workingCount} proxy active` : "No working proxy"
                  ) : "Direct connection"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {proxyEnabled && proxies.length > 0 && (
                <Badge className={`text-[10px] ${workingCount > 0 ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
                  {workingCount}/{proxies.length}
                </Badge>
              )}
              <div className="flex items-center gap-1.5" data-testid="toggle-proxy-wrapper">
                <Power className={`w-3.5 h-3.5 transition-colors ${proxyEnabled ? "text-emerald-500" : "text-muted-foreground"}`} />
                <Switch
                  checked={proxyEnabled}
                  onCheckedChange={toggleProxy}
                  data-testid="toggle-proxy"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        {proxyEnabled && (
          <CardContent className="space-y-3 pt-0">
            <div className="flex gap-2">
              <input
                type="text"
                data-testid="input-proxy"
                value={proxyInput}
                onChange={(e) => { setProxyInput(e.target.value); setCheckResult(null); }}
                placeholder="socks5://user:pass@host:port  or  http://...  or  IP:port"
                className="flex-1 h-8 rounded-md border border-input bg-background px-3 py-1 text-xs font-mono shadow-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                disabled={checking}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleCheck}
                disabled={checking || !proxyInput.trim()}
                data-testid="button-check-proxy"
                className="h-8 text-xs"
              >
                {checking ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Wifi className="w-3 h-3 mr-1" />}
                Check
              </Button>
            </div>

            {checkResult && (
              <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                checkResult.working ? "bg-emerald-500/5 border border-emerald-500/15" : "bg-destructive/5 border border-destructive/15"
              }`}>
                {checkResult.working ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${checkResult.working ? "text-emerald-500" : "text-destructive"}`}>
                    {checkResult.working ? "Proxy Working" : "Proxy Failed"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{checkResult.message}</p>
                  {checkResult.working && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {checkResult.ip && (
                        <Badge variant="outline" className="text-[9px] gap-0.5 font-mono h-5 px-1.5">
                          <Globe className="w-2 h-2" />{checkResult.ip}
                        </Badge>
                      )}
                      {checkResult.country && (
                        <Badge variant="outline" className="text-[9px] h-5 px-1.5">{checkResult.country}</Badge>
                      )}
                      {checkResult.city && (
                        <Badge variant="outline" className="text-[9px] h-5 px-1.5">{checkResult.city}</Badge>
                      )}
                      {checkResult.isp && (
                        <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{checkResult.isp}</Badge>
                      )}
                    </div>
                  )}
                </div>
                {checkResult.working && (
                  <Button
                    size="sm"
                    onClick={handleAdd}
                    className="h-6 text-[10px] px-2"
                    data-testid="button-add-proxy"
                  >
                    <Plus className="w-2.5 h-2.5 mr-0.5" />Add
                  </Button>
                )}
              </div>
            )}

            {proxies.length > 0 && (
              <div className="space-y-1.5">
                {proxies.map((p, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 group transition-all ${
                      activeIndex === idx
                        ? "bg-emerald-500/5 border border-emerald-500/15 shadow-sm"
                        : p.isDefault
                          ? "bg-gradient-to-r from-indigo-500/5 to-purple-500/5 border border-indigo-500/10"
                          : "bg-accent/30 border border-transparent hover:border-border/40"
                    }`}
                    data-testid={`row-proxy-${idx}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                      <div className="flex items-center gap-1.5 shrink-0">
                        {p.working ? (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </span>
                        ) : (
                          <span className="relative flex h-2 w-2">
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-medium truncate">{p.label}</span>
                      {p.isDefault && (
                        <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-[8px] h-4 px-1.5 shrink-0">Default</Badge>
                      )}
                      {p.country && (
                        <Badge variant="outline" className="text-[8px] h-4 px-1.5 shrink-0">{p.country}</Badge>
                      )}
                      {activeIndex === idx && (
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[8px] h-4 px-1.5 shrink-0">
                          <Signal className="w-2 h-2 mr-0.5" />Active
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className={`h-6 w-6 transition-opacity ${activeIndex === idx ? "opacity-100 text-emerald-500" : "opacity-0 group-hover:opacity-100"}`}
                        onClick={() => handleSetActive(idx)}
                        title={activeIndex === idx ? "Unset active" : "Set as active proxy"}
                        data-testid={`button-set-active-${idx}`}
                      >
                        <Star className={`w-3 h-3 ${activeIndex === idx ? "fill-emerald-500" : ""}`} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(p.url, `proxy-${idx}`)}
                      >
                        {copiedIndex === `proxy-${idx}` ? (
                          <Check className="w-2.5 h-2.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-2.5 h-2.5" />
                        )}
                      </Button>
                      {!p.isDefault && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive/60 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleRemove(idx)}
                          data-testid={`button-remove-proxy-${idx}`}
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ===== FINGERPRINT SECTION ===== */}
      <Card className={`transition-all ${!fingerprintEnabled ? "opacity-75" : ""}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-1.5 rounded-lg ${fingerprintEnabled ? "bg-violet-500/10" : "bg-muted"}`}>
                <Fingerprint className={`w-4 h-4 transition-colors ${fingerprintEnabled ? "text-violet-500" : "text-muted-foreground"}`} />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Fingerprint Spoof</CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {fingerprintEnabled ? "Identity randomized per request" : "Default browser identity"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5" data-testid="toggle-fingerprint-wrapper">
              <Switch
                checked={fingerprintEnabled}
                onCheckedChange={toggleFingerprint}
                data-testid="toggle-fingerprint"
              />
            </div>
          </div>
        </CardHeader>

        {fingerprintEnabled && (
          <CardContent className="pt-0">
            <div className="rounded-lg bg-violet-500/5 border border-violet-500/10 px-3 py-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-medium text-violet-400 flex items-center gap-1">
                  <Fingerprint className="w-3 h-3" /> Current Identity
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={refreshFingerprint}
                  disabled={fpLoading}
                  className="h-5 text-[10px] px-1.5 text-violet-400 hover:text-violet-300"
                >
                  <RefreshCw className={`w-2.5 h-2.5 mr-0.5 ${fpLoading ? "animate-spin" : ""}`} />
                  Preview
                </Button>
              </div>
              {fpMeta && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  <FpRow label="OS" value={fpMeta.system} />
                  <FpRow label="Screen" value={fpMeta.screen} />
                  <FpRow label="Device" value={fpMeta.deviceName} mono />
                  <FpRow label="MAC" value={fpMeta.mac} mono />
                  <FpRow label="Timezone" value={fpMeta.timezone} />
                  <FpRow label="Language" value={fpMeta.language} />
                  <FpRow label="GPU" value={fpMeta.renderer} />
                  <FpRow label="Cores" value={fpMeta.concurrency} />
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function FpRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-[9px] text-muted-foreground shrink-0">{label}</span>
      <span className={`text-[9px] truncate text-right max-w-[140px] ${mono ? "font-mono" : "font-medium"}`}>{value}</span>
    </div>
  );
}
