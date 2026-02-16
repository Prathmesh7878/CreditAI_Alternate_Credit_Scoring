import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle, XCircle, ArrowRight, RotateCcw, Download, AlertTriangle, ShieldCheck, Info } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { type ScoringInput, type ScoringResult, type RiskBand, computeScore } from "@/lib/scoringEngine";
import { generateSuggestions, type Suggestion } from "@/lib/suggestions";
import { generatePdfReport } from "@/lib/pdfReport";
import { useTranslation } from "react-i18next";

const questions = [
  { key: "monthlyIncomeRange", labelKey: "questions.monthlyIncomeRange", descKey: "questions.monthlyIncomeDesc", options: ["< ₹15,000", "₹15,000–30,000", "₹30,000–60,000", "₹60,000–1L", "₹1L+"] },
  { key: "employmentType", labelKey: "questions.employmentType", descKey: "questions.employmentDesc", options: ["Salaried", "Self-employed", "Freelancer", "Business owner"] },
  { key: "incomeDuration", labelKey: "questions.incomeDuration", descKey: "questions.incomeDurationDesc", options: ["< 6 months", "6–12 months", "1–3 years", "3+ years"] },
  { key: "totalMonthlyEMI", labelKey: "questions.totalMonthlyEMI", descKey: "questions.emiDesc", options: ["None", "< ₹5,000", "₹5,000–15,000", "₹15,000+"] },
  { key: "missedPayments", labelKey: "questions.missedPayments", descKey: "questions.missedDesc", options: ["Never", "1–2 times", "3+ times"] },
  { key: "billPaymentBehavior", labelKey: "questions.billPaymentBehavior", descKey: "questions.billDesc", options: ["Before due date", "On due date", "After due date"] },
  { key: "avgBankBalance", labelKey: "questions.avgBankBalance", descKey: "questions.balanceDesc", options: ["< ₹5,000", "₹5,000–20,000", "₹20,000–50,000", "₹50,000+"] },
  { key: "savingsHabit", labelKey: "questions.savingsHabit", descKey: "questions.savingsDesc", options: ["No", "Occasionally", "Yes (less than 20%)", "Yes (20%+)"] },
  { key: "incomeSources", labelKey: "questions.incomeSources", descKey: "questions.incomeSourcesDesc", options: ["1", "2", "3+"] },
  { key: "loanRejectionHistory", labelKey: "questions.loanRejectionHistory", descKey: "questions.rejectionDesc", options: ["No", "Yes (once)", "Yes (multiple times)"] },
] as const;

const riskBandConfig: Record<RiskBand, { color: string; bgColor: string; icon: typeof ShieldCheck; label: string; desc: string }> = {
  "Prime": { color: "hsl(152, 69%, 45%)", bgColor: "bg-risk-low", icon: ShieldCheck, label: "riskBands.prime", desc: "riskBands.primeDesc" },
  "Near Prime": { color: "hsl(217, 91%, 60%)", bgColor: "bg-primary", icon: CheckCircle, label: "riskBands.nearPrime", desc: "riskBands.nearPrimeDesc" },
  "Subprime": { color: "hsl(38, 92%, 50%)", bgColor: "bg-risk-medium", icon: AlertTriangle, label: "riskBands.subprime", desc: "riskBands.subprimeDesc" },
  "High Risk": { color: "hsl(0, 84%, 60%)", bgColor: "bg-risk-high", icon: XCircle, label: "riskBands.highRisk", desc: "riskBands.highRiskDesc" },
};

function RiskGauge({ score, riskBand }: { score: number; riskBand: RiskBand }) {
  const { t } = useTranslation();
  const pct = ((score - 300) / 550) * 100;
  const config = riskBandConfig[riskBand];
  const Icon = config.icon;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-44 h-44">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
          <motion.circle
            cx="60" cy="60" r="50" fill="none" stroke={config.color} strokeWidth="10"
            strokeLinecap="round"
            initial={{ strokeDasharray: "0 314" }}
            animate={{ strokeDasharray: `${pct * 3.14} 314` }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-4xl font-bold"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {score}
          </motion.span>
          <span className="text-xs text-muted-foreground">/ 850</span>
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger>
          <Badge className={`${config.bgColor} ${riskBand === "Subprime" ? "text-black" : ""}`}>
            <Icon className="h-3 w-3 mr-1" />
            {t(config.label)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{t(config.desc)}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export default function ScoreBorrower() {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [age, setAge] = useState("");
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const totalSteps = questions.length + 1;
  const isAgeStep = step === questions.length;
  const isComplete = step >= totalSteps;

  const handleSelect = (value: string) => {
    const key = questions[step].key;
    setAnswers(prev => ({ ...prev, [key]: value }));
    setTimeout(() => setStep(s => s + 1), 300);
  };

  const handleAgeSubmit = () => {
    if (!age || isNaN(Number(age)) || Number(age) < 18 || Number(age) > 100) return;
    setStep(s => s + 1);
    const input: ScoringInput = {
      monthlyIncomeRange: answers.monthlyIncomeRange ?? "",
      employmentType: answers.employmentType ?? "",
      incomeDuration: answers.incomeDuration ?? "",
      totalMonthlyEMI: answers.totalMonthlyEMI ?? "",
      missedPayments: answers.missedPayments ?? "",
      billPaymentBehavior: answers.billPaymentBehavior ?? "",
      avgBankBalance: answers.avgBankBalance ?? "",
      savingsHabit: answers.savingsHabit ?? "",
      incomeSources: answers.incomeSources ?? "",
      loanRejectionHistory: answers.loanRejectionHistory ?? "",
      age: Number(age),
    };
    const res = computeScore(input);
    setResult(res);
    setSuggestions(generateSuggestions(input, res));
  };

  const handleReset = () => {
    setStep(0);
    setAnswers({});
    setAge("");
    setResult(null);
    setSuggestions([]);
  };

  const handleDownloadPdf = () => {
    if (result) generatePdfReport(result, answers, age, suggestions);
  };

  const shapData = result?.shapValues.map(s => ({
    feature: s.feature,
    value: s.value,
    fill: s.value > 0 ? "hsl(0, 84%, 60%)" : "hsl(152, 69%, 45%)",
  })) ?? [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("score.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("score.subtitle", { count: totalSteps })}
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-secondary rounded-full h-2">
        <motion.div
          className="h-2 rounded-full gradient-electric"
          animate={{ width: `${(Math.min(step, totalSteps) / totalSteps) * 100}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {isComplete ? t("score.complete") : t("score.question", { current: step + 1, total: totalSteps })}
      </p>

      {/* Questions */}
      {!isComplete && (
        <AnimatePresence mode="wait">
          {!isAgeStep ? (
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="glass-card border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg">{t(questions[step].labelKey)}</CardTitle>
                  <p className="text-sm text-muted-foreground">{t(questions[step].descKey)}</p>
                </CardHeader>
                <CardContent>
                  <RadioGroup
                    value={answers[questions[step].key] ?? ""}
                    onValueChange={handleSelect}
                    className="space-y-3"
                  >
                    {questions[step].options.map(opt => (
                      <label
                        key={opt}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/60 hover:bg-primary/5 transition-colors cursor-pointer"
                      >
                        <RadioGroupItem value={opt} />
                        <span className="text-sm font-medium">{opt}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="age"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="glass-card border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg">{t("questions.ageLabel")}</CardTitle>
                  <p className="text-sm text-muted-foreground">{t("questions.ageDesc")}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <Label htmlFor="age">{t("common.age")} (18–100)</Label>
                      <Input
                        id="age"
                        type="number"
                        min={18}
                        max={100}
                        value={age}
                        onChange={e => setAge(e.target.value)}
                        placeholder="e.g. 28"
                        className="bg-secondary border-border mt-1"
                      />
                    </div>
                    <Button onClick={handleAgeSubmit} className="gradient-electric text-primary-foreground">
                      {t("score.getScore")} <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Results */}
      {isComplete && result && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleDownloadPdf} size="sm">
              <Download className="mr-2 h-4 w-4" /> {t("score.downloadPdf")}
            </Button>
            <Button variant="outline" onClick={handleReset} size="sm">
              <RotateCcw className="mr-2 h-4 w-4" /> {t("common.reset")}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Score Card */}
            <Card className="glass-card border-border/50">
              <CardContent className="p-6 flex flex-col items-center gap-4">
                <RiskGauge score={result.creditScore} riskBand={result.riskBand} />
                <div className="flex items-center gap-2 mt-2">
                  {(result.recommendation === "Strong Approve" || result.recommendation === "Approve") ? (
                    <CheckCircle className="h-5 w-5 text-risk-low" />
                  ) : result.recommendation === "Review" ? (
                    <AlertTriangle className="h-5 w-5 text-risk-medium" />
                  ) : (
                    <XCircle className="h-5 w-5 text-risk-high" />
                  )}
                  <span className="font-semibold">{result.recommendation}</span>
                  <span className="text-sm text-muted-foreground">({(result.confidence * 100).toFixed(0)}%)</span>
                </div>
              </CardContent>
            </Card>

            {/* Key Metrics */}
            <Card className="glass-card border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-base">{t("common.keyMetrics")}</CardTitle></CardHeader>
              <CardContent className="space-y-2.5">
                {[
                  [t("common.creditScore"), result.creditScore],
                  [t("common.riskBand"), result.riskBand],
                  [t("common.defaultProb"), `${(result.predictionProbability * 100).toFixed(1)}%`],
                  [t("common.dti"), `${(result.debtToIncomeRatio * 100).toFixed(0)}%`],
                  [t("common.confidence"), `${(result.confidence * 100).toFixed(0)}%`],
                  ["Expected Value", result.expectedValue],
                  [t("common.monthlyIncome"), answers.monthlyIncomeRange],
                  [t("common.employment"), answers.employmentType],
                  [t("common.age"), age],
                ].map(([label, val]) => (
                  <div key={label as string} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{val}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* SHAP */}
            <Card className="glass-card border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-base">{t("common.featureImpact")}</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={shapData} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis type="category" dataKey="feature" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} width={120} />
                    <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                    <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {shapData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Risk Band Distribution */}
          <Card className="glass-card border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                Risk Band Distribution
                <Tooltip>
                  <TooltipTrigger><Info className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Prime (750+): Very Low Risk. Near Prime (650-749): Low Risk. Subprime (550-649): Moderate Risk. High Risk (&lt;550): High Default.</p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3">
                {(Object.entries(riskBandConfig) as [RiskBand, typeof riskBandConfig.Prime][]).map(([band, config]) => {
                  const isActive = result.riskBand === band;
                  const Icon = config.icon;
                  return (
                    <Tooltip key={band}>
                      <TooltipTrigger asChild>
                        <div className={`rounded-xl p-4 text-center border-2 transition-all ${
                          isActive ? "border-primary scale-105 shadow-lg" : "border-border/30 opacity-60"
                        }`} style={{ backgroundColor: isActive ? config.color + "22" : undefined }}>
                          <Icon className="h-6 w-6 mx-auto mb-2" style={{ color: config.color }} />
                          <p className="text-sm font-semibold">{t(config.label)}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {band === "Prime" ? "750+" : band === "Near Prime" ? "650-749" : band === "Subprime" ? "550-649" : "<550"}
                          </p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{t(config.desc)}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Credit Improvement Suggestions */}
          {suggestions.length > 0 && (
            <Card className="glass-card border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-base">{t("score.suggestions")}</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {suggestions.map((s, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="rounded-lg p-4 border border-border/50 bg-secondary/30"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-medium text-sm">{s.title}</p>
                        <Badge variant="outline" className={`text-xs shrink-0 ${
                          s.impact === "High" ? "border-risk-high text-risk-high" :
                          s.impact === "Medium" ? "border-risk-medium text-risk-medium" :
                          "border-risk-low text-risk-low"
                        }`}>
                          {s.impact}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{s.description}</p>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Feature breakdown */}
          <Card className="glass-card border-border/50">
            <CardHeader className="pb-2"><CardTitle className="text-base">{t("common.yourAnswers")}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {result.featureScores.map(fs => (
                  <div key={fs.feature} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border/30">
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">{fs.feature}</p>
                      <p className="text-sm font-medium">
                        {fs.feature === "Age" ? age : answers[questions.find(q => {
                          const featureMap: Record<string, string> = {
                            "monthlyIncomeRange": "Monthly Income",
                            "employmentType": "Employment Type",
                            "incomeDuration": "Income Duration",
                            "totalMonthlyEMI": "Monthly EMI",
                            "missedPayments": "Missed Payments",
                            "billPaymentBehavior": "Bill Payment Behavior",
                            "avgBankBalance": "Avg Bank Balance",
                            "savingsHabit": "Savings Habit",
                            "incomeSources": "Income Sources",
                            "loanRejectionHistory": "Loan Rejection History",
                          };
                          return featureMap[q.key] === fs.feature;
                        })?.key ?? ""] ?? ""}
                      </p>
                    </div>
                    <div className="w-16">
                      <div className="h-2 rounded-full bg-border">
                        <motion.div
                          className="h-2 rounded-full"
                          style={{ backgroundColor: fs.score >= 70 ? "hsl(152, 69%, 45%)" : fs.score >= 40 ? "hsl(38, 92%, 50%)" : "hsl(0, 84%, 60%)" }}
                          initial={{ width: 0 }}
                          animate={{ width: `${fs.score}%` }}
                          transition={{ duration: 0.8 }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground text-right mt-0.5">{fs.score}/100</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
