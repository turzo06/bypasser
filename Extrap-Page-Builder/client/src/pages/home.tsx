import { useState } from "react";
import { CreditCard, Zap, ShieldCheck } from "lucide-react";
import CardGenerator from "@/components/card-generator";
import BinExtrap from "@/components/bin-extrap";
import CardChecker from "@/components/card-checker";

const tabs = [
  { id: "generator", label: "Card Generator", icon: CreditCard, description: "Generate Luhn-valid cards from BIN/extrap" },
  { id: "extrap", label: "BIN Extrap", icon: Zap, description: "Find patterns by comparing cards" },
  { id: "checker", label: "Card Checker", icon: ShieldCheck, description: "Check cards via chkr.cc API" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("generator");

  return (
    <div className="min-h-screen bg-background">
      <div className="relative overflow-hidden border-b bg-card">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/10" />
        <div className="relative max-w-4xl mx-auto px-4 py-8 sm:py-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary text-primary-foreground">
              <Zap className="w-5 h-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-title">
              CC Toolkit
            </h1>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3" data-testid="tab-bar">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg px-3 py-3 sm:py-4 text-center transition-all cursor-pointer border ${
                    isActive
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-card text-muted-foreground border-border hover:bg-accent/50 hover:text-foreground"
                  }`}
                  data-testid={`tab-${tab.id}`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs sm:text-sm font-medium leading-tight">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className={activeTab === "generator" ? "" : "hidden"}>
          <CardGenerator />
        </div>
        <div className={activeTab === "extrap" ? "" : "hidden"}>
          <BinExtrap />
        </div>
        <div className={activeTab === "checker" ? "" : "hidden"}>
          <CardChecker />
        </div>
      </div>
    </div>
  );
}
