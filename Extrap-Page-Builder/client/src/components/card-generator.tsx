import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  CreditCard, Copy, Check, Shuffle, CheckCircle2, RotateCcw, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface GeneratedCard {
  number: string;
  fullLine: string;
  luhnValid: boolean;
}

function luhnCheck(num: string): boolean {
  const d = num.replace(/\D/g, "");
  if (!d.length) return false;
  let s = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = parseInt(d[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    s += n; alt = !alt;
  }
  return s % 10 === 0;
}

function calcLuhnCheckDigit(partial: string): number {
  const d = partial.replace(/\D/g, "");
  let s = 0, alt = true;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = parseInt(d[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    s += n; alt = !alt;
  }
  return (10 - (s % 10)) % 10;
}

function detectCardLength(bin: string): number {
  if (bin.startsWith("34") || bin.startsWith("37")) return 15;
  if (bin.startsWith("300") || bin.startsWith("301") || bin.startsWith("302") ||
      bin.startsWith("303") || bin.startsWith("304") || bin.startsWith("305") ||
      bin.startsWith("36") || bin.startsWith("38")) return 14;
  return 16;
}

function isAmex(bin: string): boolean {
  return bin.startsWith("34") || bin.startsWith("37");
}

function generateCards(binPattern: string, month: string, year: string, cvv: string, count: number): GeneratedCard[] {
  const results: GeneratedCard[] = [];
  const seen = new Set<string>();
  const cleanBin = binPattern.replace(/[^0-9xX]/g, "");

  const concretePrefix = cleanBin.replace(/[xX].*$/, "");
  const cardLen = concretePrefix.length >= 2 ? detectCardLength(concretePrefix) : 16;

  for (let attempt = 0; attempt < count * 30 && results.length < count; attempt++) {
    let card = "";
    for (let i = 0; i < Math.min(cleanBin.length, cardLen); i++) {
      card += cleanBin[i].toLowerCase() === "x" ? Math.floor(Math.random() * 10).toString() : cleanBin[i];
    }
    while (card.length < cardLen) card += Math.floor(Math.random() * 10).toString();
    card = card.substring(0, cardLen);

    const partial = card.substring(0, cardLen - 1);
    card = partial + calcLuhnCheckDigit(partial).toString();

    if (!seen.has(card)) {
      seen.add(card);

      const cardIsAmex = isAmex(card);

      let mm = month;
      if (!mm || mm === "rr") {
        mm = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
      }

      let yy = year;
      if (!yy || yy === "rr") {
        const now = new Date();
        const fy = now.getFullYear() + Math.floor(Math.random() * 5) + 1;
        yy = String(fy).slice(-2);
      }

      let cv = cvv;
      if (!cv || cv === "rnd") {
        if (cardIsAmex) {
          cv = String(Math.floor(Math.random() * 9000) + 1000);
        } else {
          cv = String(Math.floor(Math.random() * 900) + 100);
        }
      }

      const fullLine = `${card}|${mm}|${yy}|${cv}`;
      results.push({ number: card, fullLine, luhnValid: luhnCheck(card) });
    }
  }
  return results;
}

export default function CardGenerator() {
  const [binInput, setBinInput] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [count, setCount] = useState(10);
  const [generated, setGenerated] = useState<GeneratedCard[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
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

  const handleGenerate = useCallback(() => {
    const clean = binInput.replace(/[^0-9xX]/g, "");
    if (clean.length < 6) {
      toast({ title: "Invalid Input", description: "Enter at least 6 digits for a valid BIN.", variant: "destructive" });
      return;
    }
    const cards = generateCards(clean, month, year, cvv, count);
    setGenerated(cards);
    toast({ title: "Generated", description: `${cards.length} Luhn-valid cards created.` });
  }, [binInput, month, year, cvv, count, toast]);

  const handleReset = useCallback(() => {
    setBinInput(""); setMonth(""); setYear(""); setCvv("");
    setGenerated([]);
  }, []);

  const copyAll = useCallback(() => {
    if (generated.length === 0) return;
    copyToClipboard(generated.map((g) => g.fullLine).join("\n"), "copy-all-gen");
  }, [generated, copyToClipboard]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-lg">Card Generator</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 rounded-md bg-accent/50 px-3 py-2.5 text-sm text-muted-foreground">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Enter a BIN or extrap pattern (use <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">x</code> for wildcard digits). Leave month/year/CVV empty for random values.</span>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">BIN / Extrap Pattern</Label>
              <Input
                value={binInput}
                onChange={(e) => setBinInput(e.target.value)}
                placeholder="e.g. 453201xxxxxxxxxx or 453201"
                className="font-mono"
                data-testid="input-bin-pattern"
              />
              <p className="text-xs text-muted-foreground mt-1">Min 6 digits. Use x for random positions. Last digit auto-computed as Luhn check digit. AMEX (34/37) → 15 digits + 4-digit CVV. Visa/MC → 16 digits + 3-digit CVV.</p>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Month</Label>
                <Input
                  value={month}
                  onChange={(e) => setMonth(e.target.value.replace(/\D/g, "").substring(0, 2))}
                  placeholder="MM"
                  className="font-mono"
                  data-testid="input-month"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Year</Label>
                <Input
                  value={year}
                  onChange={(e) => setYear(e.target.value.replace(/\D/g, "").substring(0, 2))}
                  placeholder="YY"
                  className="font-mono"
                  data-testid="input-year"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">CVV</Label>
                <Input
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").substring(0, 4))}
                  placeholder="rnd"
                  className="font-mono"
                  data-testid="input-cvv"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Count</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 10)))}
                  className="font-mono"
                  data-testid="input-count"
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={handleReset} data-testid="button-reset-gen">
              <RotateCcw className="w-4 h-4 mr-1.5" />Reset
            </Button>
            <Button onClick={handleGenerate} data-testid="button-generate">
              <Shuffle className="w-4 h-4 mr-1.5" />Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      <AnimatePresence>
        {generated.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold" data-testid="text-gen-heading">Generated Cards</h2>
                <Badge variant="secondary">{generated.length} cards</Badge>
                <Badge variant="outline" className="text-xs">
                  {generated.filter((g) => g.luhnValid).length}/{generated.length} Luhn valid
                </Badge>
              </div>
              <Button variant="outline" size="sm" onClick={copyAll} data-testid="button-copy-all-gen">
                {copiedIndex === "copy-all-gen" ? <Check className="w-4 h-4 mr-1.5 text-green-500" /> : <Copy className="w-4 h-4 mr-1.5" />}
                Copy All
              </Button>
            </div>

            <Card>
              <CardContent className="py-3 px-4">
                <div className="space-y-1 max-h-[400px] overflow-y-auto">
                  {generated.map((g, idx) => {
                    const gKey = `gen-${idx}`;
                    return (
                      <div key={idx} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 group" data-testid={`row-gen-${idx}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          <code className="font-mono text-xs sm:text-sm truncate">{g.fullLine}</code>
                        </div>
                        <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7" onClick={() => copyToClipboard(g.fullLine, gKey)}>
                          {copiedIndex === gKey ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {generated.length === 0 && (
        <div className="text-center py-16" data-testid="text-gen-empty">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-muted mb-4"><CreditCard className="w-6 h-6 text-muted-foreground" /></div>
          <h3 className="text-base font-medium text-muted-foreground mb-1">No cards generated</h3>
          <p className="text-sm text-muted-foreground/70 max-w-sm mx-auto">Enter a BIN or extrap pattern above and click Generate.</p>
        </div>
      )}
    </div>
  );
}
