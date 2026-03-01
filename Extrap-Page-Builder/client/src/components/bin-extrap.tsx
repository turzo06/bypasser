import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import {
  Zap, Copy, Check, RotateCcw, CreditCard, Info, AlertTriangle,
  Shuffle, CheckCircle2, XCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface ExtrapPattern {
  pattern: string;
  label: string;
  description: string;
  priority: number;
}

interface ExtrapResults {
  inputCards: string[];
  bin: string;
  patterns: ExtrapPattern[];
}

interface GeneratedCard {
  number: string;
  luhnValid: boolean;
  fullLine: string;
}

function luhnCheck(num: string): boolean {
  const digits = num.replace(/\D/g, "");
  if (digits.length === 0) return false;
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function calcLuhnCheckDigit(partial: string): number {
  const digits = partial.replace(/\D/g, "");
  let sum = 0;
  let alternate = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alternate = !alternate;
  }
  return (10 - (sum % 10)) % 10;
}

function generateFromPattern(pattern: string, count: number): Omit<GeneratedCard, "fullLine">[] {
  const results: Omit<GeneratedCard, "fullLine">[] = [];
  const seen = new Set<string>();
  for (let attempt = 0; attempt < count * 20 && results.length < count; attempt++) {
    let card = "";
    for (let i = 0; i < pattern.length; i++) {
      card += pattern[i].toLowerCase() === "x" ? Math.floor(Math.random() * 10).toString() : pattern[i];
    }
    while (card.length < 16) card += Math.floor(Math.random() * 10).toString();
    card = card.substring(0, 16);
    const partial = card.substring(0, 15);
    card = partial + calcLuhnCheckDigit(partial).toString();
    if (!seen.has(card)) { seen.add(card); results.push({ number: card, luhnValid: luhnCheck(card) }); }
  }
  return results;
}

function generateRandomDate(): string {
  const now = new Date();
  const futureMonths = Math.floor(Math.random() * 48) + 1;
  const date = new Date(now.getFullYear(), now.getMonth() + futureMonths, 1);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${mm}|${yy}`;
}

function generateRandomCVV(isAmex: boolean): string {
  if (isAmex) return String(Math.floor(Math.random() * 9000) + 1000);
  return String(Math.floor(Math.random() * 900) + 100);
}

function parseCards(raw: string): string[] {
  const lines = raw.split(/[\n\r]+/).map((l) => l.trim()).filter((l) => l.length > 0);
  const cards: string[] = [];
  for (const line of lines) {
    const parts = line.split(/[|,\s\t]+/);
    const numPart = parts[0]?.replace(/[^0-9]/g, "");
    if (numPart && numPart.length >= 6) cards.push(numPart.substring(0, 16));
  }
  return cards;
}

function validateSameBin(cards: string[]): { valid: boolean; bin: string; message: string } {
  if (cards.length === 0) return { valid: false, bin: "", message: "No valid card numbers found." };
  const bin = cards[0].substring(0, 6);
  for (let i = 1; i < cards.length; i++) {
    if (cards[i].substring(0, 6) !== bin)
      return { valid: false, bin, message: `BIN mismatch: Card 1 has BIN ${bin} but Card ${i + 1} has BIN ${cards[i].substring(0, 6)}.` };
  }
  return { valid: true, bin, message: "" };
}

function countFixedDigits(p: string): number {
  return p.split("").filter((c) => c !== "x").length;
}

function generateExtraps(cards: string[]): ExtrapResults {
  const validation = validateSameBin(cards);
  if (!validation.valid) return { inputCards: cards, bin: "", patterns: [] };
  const bin = validation.bin;
  const padded = cards.map((c) => c.padEnd(16, "0").substring(0, 16));
  const patterns: ExtrapPattern[] = [];
  const seen = new Set<string>();

  function addPattern(pattern: string, label: string, description: string, priority: number) {
    if (!seen.has(pattern) && pattern !== bin + "xxxxxxxxxx") { seen.add(pattern); patterns.push({ pattern, label, description, priority }); }
  }

  if (cards.length === 1 && padded[0].length >= 16) {
    const card = padded[0];
    addPattern(card.substring(0, 12) + "xxxx", "Last 4 Masked", "Full number with last 4 replaced", 1);
    let sofiaEven = "", sofiaOdd = "";
    for (let i = 0; i < 16; i++) {
      if (i < 6) { sofiaEven += card[i]; sofiaOdd += card[i]; }
      else if (i < 12 && i % 2 === 0) { sofiaEven += card[i]; sofiaOdd += "x"; }
      else if (i < 12 && i % 2 === 1) { sofiaEven += "x"; sofiaOdd += card[i]; }
      else { sofiaEven += "x"; sofiaOdd += "x"; }
    }
    addPattern(sofiaEven, "SoFIA Pattern A", "Alternating even-position digits kept", 3);
    addPattern(sofiaOdd, "SoFIA Pattern B", "Alternating odd-position digits kept", 4);
    addPattern(bin + "xxxxxxxxxx", "Base BIN", "Standard 6-digit BIN — widest range", 10);
  }

  if (cards.length >= 2) {
    let fullMatch = "";
    for (let i = 0; i < 16; i++) { fullMatch += padded.every((c) => c[i] === padded[0][i]) ? padded[0][i] : "x"; }
    const bestExtrap = fullMatch.substring(0, 12) + "xxxx";
    const fc = countFixedDigits(bestExtrap);
    if (fc > 6) addPattern(bestExtrap, "Best Extrap", `${fc} matching digits kept — top priority`, 1);

    const pairList: { pattern: string; fixed: number; label: string }[] = [];
    for (let a = 0; a < padded.length; a++) {
      for (let b = a + 1; b < padded.length; b++) {
        let pm = "";
        for (let i = 0; i < 12; i++) pm += padded[a][i] === padded[b][i] ? padded[a][i] : "x";
        pm += "xxxx";
        const pf = countFixedDigits(pm);
        if (pf > 6 && !seen.has(pm)) pairList.push({ pattern: pm, fixed: pf, label: `Pair Extrap (${a + 1} vs ${b + 1})` });
      }
    }
    pairList.sort((a, b) => b.fixed - a.fixed);
    for (const pair of pairList.slice(0, 3)) addPattern(pair.pattern, pair.label, `${pair.fixed} matching digits`, 2);

    for (let a = 0; a < padded.length && a < 2; a++) {
      for (let b = a + 1; b < padded.length && b < 3; b++) {
        let sf = bin;
        for (let i = 6; i < 12; i++) {
          if (padded[a][i] === padded[b][i]) sf += padded[a][i];
          else if (i % 2 === 0) sf += padded[a][i]; else sf += "x";
        }
        sf += "xxxx";
        addPattern(sf, `SoFIA Extrap (${a + 1} + ${b + 1})`, "SoFIA substitution on compared digits", 3);
      }
    }

    const cA = padded[0], cB = padded[1];
    const kA = bin + cA[6], kB = bin + cB[6];
    const pA: number[] = [], pB: number[] = [];
    for (let i = 7; i < 11; i += 2) {
      pA.push((parseInt(cA[i]) || 0) + (parseInt(cA[i + 1]) || 0));
      pB.push((parseInt(cB[i]) || 0) + (parseInt(cB[i + 1]) || 0));
    }
    if (pA.length >= 2 && pB.length >= 2) {
      const sA = pA.reduce((s, v) => s + v, 0), sB = pB.reduce((s, v) => s + v, 0);
      const fv = String(Math.floor((sA / 2) * 5) + Math.floor((sB / 2) * 5)).substring(0, 2).padStart(2, "0");
      const mA = (kA + fv + "xxxxxxx").substring(0, 16);
      const mB = (kB + fv + "xxxxxxx").substring(0, 16);
      addPattern(mA, "Math Extrap A", `Computed value (${fv}) from digit-pair math`, 4);
      if (mA !== mB) addPattern(mB, "Math Extrap B", `Computed value (${fv}) from digit-pair math`, 5);
    }
    addPattern(bin + "xxxxxxxxxx", "Base BIN", "Standard 6-digit BIN — fallback", 10);
  }

  patterns.sort((a, b) => a.priority - b.priority);
  return { inputCards: cards, bin, patterns };
}

function PatternCard({ item, pIndex, isTop, copiedIndex, copyToClipboard }: {
  item: ExtrapPattern; pIndex: number; isTop: boolean; copiedIndex: string | null;
  copyToClipboard: (text: string, key: string) => void;
}) {
  const [generated, setGenerated] = useState<GeneratedCard[]>([]);
  const [genCount, setGenCount] = useState(10);
  const [expanded, setExpanded] = useState(false);
  const key = `p-${pIndex}`;
  const isAmex = item.pattern.startsWith("3");

  const handleGenerate = useCallback(() => {
    const raw = generateFromPattern(item.pattern, genCount);
    setGenerated(raw.map((c) => ({ ...c, fullLine: `${c.number}|${generateRandomDate()}|${generateRandomCVV(isAmex)}` })));
    setExpanded(true);
  }, [item.pattern, genCount, isAmex]);

  const copyGenerated = useCallback(() => {
    copyToClipboard(generated.map((g) => g.fullLine).join("\n"), `gen-all-${pIndex}`);
  }, [generated, copyToClipboard, pIndex]);

  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: pIndex * 0.04, duration: 0.2 }}>
      <Card className={isTop ? "border-primary/40" : ""}>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                {isTop && <Badge variant="default" className="text-[10px] px-1.5 py-0">TOP</Badge>}
              </div>
              <code className="font-mono text-base sm:text-lg tracking-widest block mt-0.5" data-testid={`text-pattern-${pIndex}`}>
                {item.pattern.split("").map((char, i) => (
                  <span key={i} className={char === "x" ? "text-primary font-bold" : "text-foreground"}>{char}</span>
                ))}
              </code>
              <p className="text-xs text-muted-foreground/70 mt-1">{item.description}</p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => copyToClipboard(item.pattern, key)} data-testid={`button-copy-pattern-${pIndex}`}>
              {copiedIndex === key ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Count:</Label>
              <Input type="number" min={1} max={100} value={genCount} onChange={(e) => setGenCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 10)))} className="w-16 h-8 font-mono text-xs" data-testid={`input-gen-count-${pIndex}`} />
            </div>
            <Button size="sm" variant="secondary" onClick={handleGenerate} data-testid={`button-generate-${pIndex}`}>
              <Shuffle className="w-3.5 h-3.5 mr-1" />Generate
            </Button>
            {generated.length > 0 && (
              <>
                <Button size="sm" variant="outline" onClick={copyGenerated} data-testid={`button-copy-generated-${pIndex}`}>
                  <Copy className="w-3.5 h-3.5 mr-1" />Copy All
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
                  {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
                <Badge variant="secondary" className="text-xs">{generated.filter((g) => g.luhnValid).length}/{generated.length} Luhn valid</Badge>
              </>
            )}
          </div>
          <AnimatePresence>
            {expanded && generated.length > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                <div className="mt-3 space-y-1 max-h-[300px] overflow-y-auto">
                  {generated.map((g, gIdx) => (
                    <div key={gIdx} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 group" data-testid={`row-generated-${pIndex}-${gIdx}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        {g.luhnValid ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                        <code className="font-mono text-xs sm:text-sm truncate">{g.fullLine}</code>
                      </div>
                      <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7" onClick={() => copyToClipboard(g.fullLine, `gen-${pIndex}-${gIdx}`)}>
                        {copiedIndex === `gen-${pIndex}-${gIdx}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function BinExtrap() {
  const [rawInput, setRawInput] = useState("");
  const [results, setResults] = useState<ExtrapResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const { toast } = useToast();

  const handleExtrap = useCallback(() => {
    setError(null);
    const cards = parseCards(rawInput);
    if (cards.length === 0) { setError("No valid card numbers found."); setResults(null); return; }
    const v = validateSameBin(cards);
    if (!v.valid) { setError(v.message); setResults(null); return; }
    const r = generateExtraps(cards);
    setResults(r); setError(null);
    toast({ title: "Extrapolation Complete", description: `${r.patterns.length} patterns from ${cards.length} card(s).` });
  }, [rawInput, toast]);

  const handleReset = useCallback(() => { setRawInput(""); setResults(null); setError(null); }, []);

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedIndex(key); setTimeout(() => setCopiedIndex(null), 1500); }
    catch { toast({ title: "Copy Failed", variant: "destructive" }); }
  }, [toast]);

  const copyAllPatterns = useCallback(async () => {
    if (!results) return;
    await copyToClipboard(results.patterns.map((p) => p.pattern).join("\n"), "all");
  }, [results, copyToClipboard]);

  const parsedCards = parseCards(rawInput);
  const inputLuhnResults = parsedCards.map((c) => ({ number: c, valid: luhnCheck(c) }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-lg">Input Cards</CardTitle>
          </div>
          {parsedCards.length > 0 && <Badge variant="secondary" data-testid="badge-card-count">{parsedCards.length} {parsedCards.length === 1 ? "card" : "cards"} detected</Badge>}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 rounded-md bg-accent/50 px-3 py-2.5 text-sm text-muted-foreground">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Paste one card per line. Formats like <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">number|date|cvv</code> are supported — date and CVV are auto-removed.</span>
          </div>
          <Textarea data-testid="input-cards" value={rawInput} onChange={(e) => setRawInput(e.target.value)} className="font-mono text-sm min-h-[160px] resize-y" rows={7} />
          {inputLuhnResults.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {inputLuhnResults.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs font-mono">
                  {r.valid ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-destructive" />}
                  <span className="text-muted-foreground" data-testid={`text-luhn-${i}`}>Card {i + 1}: {r.valid ? "Luhn valid" : "Luhn invalid"}</span>
                </div>
              ))}
            </div>
          )}
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 text-destructive px-3 py-2.5 text-sm" data-testid="text-error">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <Separator className="my-4" />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={handleReset} data-testid="button-reset"><RotateCcw className="w-4 h-4 mr-1.5" />Reset</Button>
            <Button size="default" onClick={handleExtrap} data-testid="button-extrap"><Zap className="w-4 h-4 mr-1.5" />Extrap</Button>
          </div>
        </CardContent>
      </Card>

      <AnimatePresence>
        {results && results.patterns.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-semibold" data-testid="text-results-heading">Results</h2>
                <Badge variant="secondary" data-testid="badge-pattern-count">{results.patterns.length} patterns</Badge>
                <Badge variant="outline" className="text-xs" data-testid="badge-bin">BIN: {results.bin}</Badge>
              </div>
              <Button variant="outline" size="sm" onClick={copyAllPatterns} data-testid="button-copy-all">
                {copiedIndex === "all" ? <Check className="w-4 h-4 mr-1.5 text-green-500" /> : <Copy className="w-4 h-4 mr-1.5" />}Copy All
              </Button>
            </div>
            <div className="grid gap-3">
              {results.patterns.map((item, i) => (
                <PatternCard key={`p-${i}`} item={item} pIndex={i} isTop={i === 0} copiedIndex={copiedIndex} copyToClipboard={copyToClipboard} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {(!results || results.patterns.length === 0) && !error && (
        <div className="text-center py-16" data-testid="text-empty-state">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-muted mb-4"><Zap className="w-6 h-6 text-muted-foreground" /></div>
          <h3 className="text-base font-medium text-muted-foreground mb-1">No results yet</h3>
          <p className="text-sm text-muted-foreground/70 max-w-sm mx-auto">Paste your card numbers above and click Extrap to generate patterns.</p>
        </div>
      )}
    </div>
  );
}
