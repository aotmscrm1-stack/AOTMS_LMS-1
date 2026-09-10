import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Clock, 
  ChevronRight, 
  ChevronLeft, 
  AlertCircle, 
  CheckCircle2, 
  Flag,
  Monitor,
  Layout,
  Maximize2,
  Minimize2,
  LogOut,
  HelpCircle,
  Timer,
  Play,
  Terminal,
  Loader2,
  GripVertical
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useExamQuestions, Question } from '@/hooks/useStudentData';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { fetchWithAuth } from '@/lib/api';
import { CodePlayground } from '@/components/common/CodePlayground';
import { CodingQuestionDisplay } from '@/components/common/CodingQuestionDisplay';

import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ExamSessionProps {
  examId: string;
  examTitle: string;
  durationMinutes: number;
  scheduledDate?: string;
  onFinish: (results: {
    examId: string;
    totalQuestions: number;
    answers: Record<string, string>;
    timeSpent: number;
  }) => void;
  onExit: () => void;
  type: 'mock' | 'live';
}

export function ExamSession({ examId, examTitle, durationMinutes, scheduledDate, onFinish, onExit, type }: ExamSessionProps) {
  const { data: questions, isLoading } = useExamQuestions(examId);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  // Calculate absolute target end timestamp when the exam session must officially finish
  const [endTime] = useState(() => {
    if (type === 'live' && scheduledDate) {
      const startTime = new Date(scheduledDate).getTime();
      return startTime + durationMinutes * 60 * 1000;
    } else {
      return Date.now() + durationMinutes * 60 * 1000;
    }
  });

  // Calculate dynamic remaining seconds from target endTime
  const [timeLeft, setTimeLeft] = useState(() => {
    const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
    if (type === 'live' && scheduledDate) {
      return Math.min(durationMinutes * 60, remaining);
    }
    return remaining;
  });

  // Coding Execution State
  const [consoleOutput, setConsoleOutput] = useState<Record<string, string>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isTimeOver, setIsTimeOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Split Pane Resizing for Coding Mode (Default 45% left, 55% right)
  const [leftWidth, setLeftWidth] = useState(45);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newPct = (e.clientX / window.innerWidth) * 100;
      if (newPct >= 25 && newPct <= 75) {
        setLeftWidth(newPct);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const { toast } = useToast();

  // Fullscreen management
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullScreen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleComplete = React.useCallback(async () => {
    if (isSubmitting) return;

    if (type === 'mock' && Object.keys(answers).length < (questions?.length || 0)) {
      toast({
        title: "Incomplete Assessment",
        description: `You have answered ${Object.keys(answers).length} of ${questions?.length} questions.`,
        variant: "destructive",
      });
      // Allow submission anyway if time is up, but warn if manual
      if (timeLeft > 0) return; 
    }

    setIsSubmitting(true);

    try {
      const results = {
          examId,
          totalQuestions: questions?.length || 0,
          answers: answers,
          timeSpent: Math.max(0, (durationMinutes * 60) - timeLeft),
          // Score calculation should ideally happen on backend to be secure
          // But we pass answers for processing
      };
      await onFinish(results);
    } catch (err) {
      console.error("Submission failed:", err);
      setIsSubmitting(false);
    }
  }, [isSubmitting, answers, durationMinutes, examId, onFinish, questions?.length, timeLeft, type, toast]);

  // Robust real-time timer calculation based on absolute system clock
  useEffect(() => {
    if (timeLeft <= 0) {
      setIsTimeOver(true);
      const submitTimeout = setTimeout(() => {
        handleComplete();
      }, 4000);
      return () => clearTimeout(submitTimeout);
    }

    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      
      if (remaining <= 0) {
        setIsTimeOver(true);
        clearInterval(timer);
        handleComplete();
      }
    }, 250); // Tick 4 times a second to keep screen representation flawlessly accurate

    return () => clearInterval(timer);
  }, [endTime, handleComplete]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
  };

  const currentQuestion = questions?.[currentIdx] as Question | undefined;
  const progress = (questions && questions.length > 0) ? ((Object.keys(answers).length / questions.length) * 100) : 0;

  const handleAnswerChange = (val: string) => {
    if (!currentQuestion) return;
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: val }));
  };

  const runCode = async (selectedLang?: string, customCode?: string) => {
    if (!currentQuestion) return;
    const code = customCode !== undefined ? customCode : answers[currentQuestion.id];
    const language = selectedLang || currentQuestion.language || 'javascript';
    if (!code || !code.trim()) {
        toast({ title: "Empty Code", description: "Please write some code to run.", variant: "destructive" });
        return;
    }

    setIsRunning(true);
    setConsoleOutput(prev => ({ ...prev, [currentQuestion.id]: 'Running...' }));

    try {
        const res = await fetchWithAuth<{
            run?: { stdout?: string; stderr?: string };
            message?: string;
        }>('/run-code', {
            method: 'POST',
            body: JSON.stringify({
                language: language, 
                version: '*',
                files: [{ content: code }]
            })
        });

        const output = res.run?.stdout || res.run?.stderr || (res.message ? res.message : "No output");
        setConsoleOutput(prev => ({ ...prev, [currentQuestion.id]: output }));
        
        if (res.run?.stderr) {
            toast({ title: "Execution Error", description: "Check the console output for details.", variant: "destructive" });
        } else {
            toast({ title: "Execution Success", description: "Code ran successfully." });
        }

    } catch (err) {
        console.error("Run Code Error:", err);
        const errorMsg = err instanceof Error ? err.message : "Execution failed";
        setConsoleOutput(prev => ({ ...prev, [currentQuestion.id]: `Error: ${errorMsg}` }));
        toast({ title: "Execution Failed", description: errorMsg, variant: "destructive" });
    } finally {
        setIsRunning(false);
    }
  };


  if (isLoading) return (
    <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col items-center justify-center text-white space-y-4">
        <Monitor className="h-12 w-12 text-primary animate-pulse" />
        <h2 className="text-xl font-bold tracking-widest uppercase">Initializing Assessment Environment</h2>
        <div className="w-48 h-1 bg-slate-800 rounded-full overflow-hidden">
            <motion.div 
                className="h-full bg-primary" 
                initial={{ width: 0 }} 
                animate={{ width: '100%' }} 
                transition={{ duration: 2, repeat: Infinity }}
            />
        </div>
    </div>
  );

  if (!questions || questions.length === 0) return (
    <div className="flex flex-col items-center justify-center p-20 text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-slate-300" />
        <p className="text-slate-600 font-bold">No questions found for this exam.</p>
        <Button onClick={onExit}>Return to Dashboard</Button>
    </div>
  );

  // Determine Question Type (fallback to MCQ)
  // Ensure we handle 'coding', 'short', 'long', 'fill_blank', 'true_false'
  const qType = currentQuestion.type || currentQuestion.question_type || 'mcq'; 

  const isCodingMode = qType === 'coding' || qType === 'practical';

  return (
    <div className={cn(
        "fixed inset-0 bg-[#f8fafc] z-[100] flex flex-col transition-all",
        isFullScreen ? "p-0" : "p-0"
    )}>
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-sm relative z-10 gap-3 sm:gap-0 shrink-0">
            <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/10">
                    <Layout className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-sm sm:text-lg font-black text-slate-900 tracking-tight leading-none truncate max-w-[200px] sm:max-w-none">
                        {examTitle}
                    </h1>
                    <div className="hidden sm:flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px] uppercase font-bold text-slate-400 border-slate-200 bg-slate-50">Authorized Session</Badge>
                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 uppercase">
                            <Monitor className="h-3 w-3" /> Secure Connection
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-6 w-full sm:w-auto justify-between sm:justify-end">
                <div className={cn(
                    "flex flex-col items-end px-3 sm:px-6 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl border transition-all duration-500",
                    timeLeft < 300 ? "bg-red-50 border-red-200 text-red-600" : "bg-primary/5 border-primary/10 text-primary"
                )}>
                    <div className="flex items-center gap-2 mb-0.5">
                        <Timer className={cn("h-4 w-4", timeLeft < 300 && "animate-pulse")} />
                        <span className="text-lg sm:text-2xl font-black tabular-nums tracking-tighter">{formatTime(timeLeft)}</span>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-70">Remaining Time</span>
                </div>
                <Separator orientation="vertical" className="h-10 bg-slate-200 hidden sm:block" />
                <div className="flex gap-2">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-10 w-10 text-slate-400 hover:text-slate-900 rounded-xl"
                        onClick={() => setIsFullScreen(!isFullScreen)}
                    >
                        {isFullScreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                    </Button>
                    <Button 
                        variant="ghost" 
                        className="h-10 px-4 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-xl font-bold flex items-center gap-2"
                        onClick={() => setShowExitConfirm(true)}
                    >
                        <LogOut className="h-4 w-4" /> Exit
                    </Button>
                </div>
            </div>
        </header>

        {/* Main Interface Content */}
        {isCodingMode ? (
            /* ================= CODING EXAM MODE (RESIZABLE SIDE-BY-SIDE SPLIT) ================= */
            <main className={cn("flex-1 flex overflow-hidden flex-col lg:flex-row relative select-none", isResizing && "cursor-col-resize")}>
                {/* LEFT PANEL: Compact Navigation + Problem Description & Test Cases */}
                <div 
                    className="flex flex-col bg-white border-b lg:border-b-0 lg:border-r border-slate-200 overflow-hidden w-full lg:w-auto shrink-0"
                    style={{ flexBasis: `${leftWidth}%` }}
                >
                    {/* Compact Top Progress & Question Navigator Bar */}
                    <div className="p-3 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
                        <div className="flex items-center gap-2 min-w-[130px] flex-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">
                                Progress
                            </span>
                            <Progress value={progress} className="h-2 flex-1 bg-slate-200 [&>div]:bg-primary" />
                            <span className="text-xs font-black text-primary shrink-0">{Math.round(progress)}%</span>
                        </div>

                        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5 max-w-full">
                            {questions.map((q, idx) => {
                                const isAnswered = !!answers[q.id];
                                const isCurrent = currentIdx === idx;
                                const isFlagged = flagged[q.id];

                                return (
                                    <button
                                        key={q.id as string}
                                        onClick={() => setCurrentIdx(idx)}
                                        className={cn(
                                            "h-7 w-7 rounded-lg text-xs font-black transition-all flex items-center justify-center relative shrink-0",
                                            isCurrent ? "bg-primary text-white shadow-md scale-105" : 
                                            isAnswered ? "bg-emerald-100 text-emerald-700 border border-emerald-300" :
                                            "bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200"
                                        )}
                                    >
                                        {idx + 1}
                                        {isFlagged && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-red-500 rounded-full" />}
                                        {isAnswered && !isCurrent && <CheckCircle2 className="absolute -bottom-0.5 -right-0.5 h-3 w-3 text-emerald-600 fill-white" />}
                                    </button>
                                );
                            })}
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className={cn("h-7 px-2 text-[10px] font-bold uppercase rounded-lg ml-1 shrink-0", flagged[currentQuestion.id as string] && "bg-red-50 text-red-600 border-red-200")}
                                onClick={() => setFlagged(prev => ({ ...prev, [currentQuestion!.id as string]: !prev[currentQuestion!.id as string] }))}
                            >
                                <Flag className={cn("h-3 w-3 mr-1", flagged[currentQuestion.id as string] && "fill-current")} />
                                <span className="hidden sm:inline">{flagged[currentQuestion.id as string] ? "Flagged" : "Flag"}</span>
                            </Button>
                        </div>
                    </div>

                    {/* Scrollable Problem Details */}
                    <ScrollArea className="flex-1 p-4 sm:p-6 custom-scrollbar bg-slate-50/30">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentIdx}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                transition={{ duration: 0.2 }}
                            >
                                <CodingQuestionDisplay
                                    question_text={currentQuestion.question_text || currentQuestion.text}
                                    input_format={currentQuestion.input_format}
                                    output_format={currentQuestion.output_format}
                                    explanation={currentQuestion.explanation}
                                    constraints={currentQuestion.constraints}
                                    sample_input={currentQuestion.sample_input}
                                    sample_output={currentQuestion.sample_output}
                                    test_cases={currentQuestion.test_cases}
                                    language={currentQuestion.language}
                                    difficulty={currentQuestion.difficulty}
                                />
                            </motion.div>
                        </AnimatePresence>
                    </ScrollArea>
                </div>

                {/* DRAGGABLE RESIZER HANDLE */}
                <div 
                    onMouseDown={() => setIsResizing(true)}
                    className="hidden lg:flex w-2.5 bg-slate-200 hover:bg-primary/50 active:bg-primary transition-colors cursor-col-resize items-center justify-center group shrink-0 select-none z-20"
                    title="Drag left/right to adjust problem & code editor views"
                >
                    <div className="h-8 w-1.5 rounded-full bg-slate-400 group-hover:bg-white flex items-center justify-center">
                        <GripVertical className="h-3 w-3 text-slate-600 group-hover:text-white" />
                    </div>
                </div>

                {/* RIGHT PANEL: VS Code Studio Code Playground */}
                <div 
                    className="flex-1 flex flex-col bg-slate-950 overflow-hidden w-full h-full p-2"
                    style={{ flexBasis: `${100 - leftWidth}%` }}
                >
                    <CodePlayground
                        initialLanguage={currentQuestion.language || 'python'}
                        questionText={currentQuestion.question_text || ''}
                        value={answers[currentQuestion.id as string] || ''}
                        onChange={(val) => handleAnswerChange(val || '')}
                        output={consoleOutput[currentQuestion.id as string]}
                        onRunCode={(lang, code) => runCode(lang, code)}
                        isRunning={isRunning}
                        className="h-full min-h-0 border-none rounded-xl"
                    />
                </div>
            </main>
        ) : (
            /* ================= STANDARD NON-CODING MODE ================= */
            <main className="flex-1 flex overflow-hidden flex-col lg:flex-row">
                {/* Sidebar Navigation */}
                <aside className="w-full lg:w-[320px] bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col overflow-hidden max-h-[160px] lg:max-h-none">
                    <div className="p-3 sm:p-6 border-b border-slate-100 bg-slate-50/50">
                        <div className="flex justify-between items-end mb-3">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                Progress
                            </span>
                            <span className="text-sm font-black text-primary">{Math.round(progress)}%</span>
                        </div>
                        <Progress value={progress} className="h-2.5 bg-slate-200 [&>div]:bg-primary shadow-sm" />
                    </div>

                    <div className="p-3 sm:p-6 flex-1 overflow-y-auto custom-scrollbar">
                        <div className="flex flex-wrap gap-2 sm:gap-3">
                            {questions.map((q, idx) => {
                                const isAnswered = !!answers[q.id];
                                const isCurrent = currentIdx === idx;
                                const isFlagged = flagged[q.id];

                                return (
                                    <button
                                        key={q.id as string}
                                        onClick={() => setCurrentIdx(idx)}
                                        className={cn(
                                            "h-10 w-12 sm:w-full sm:h-12 rounded-xl text-xs font-black transition-all flex items-center justify-center relative group shrink-0",
                                            isCurrent ? "bg-primary text-white shadow-lg shadow-primary/30 scale-105 z-10" : 
                                            isAnswered ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                                            "bg-slate-50 text-slate-400 border border-slate-200 hover:border-slate-300"
                                        )}
                                    >
                                        {idx + 1}
                                        {isFlagged && <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full border-2 border-white" />}
                                        {isAnswered && !isCurrent && <CheckCircle2 className="absolute -bottom-1 -right-1 h-3.5 w-3.5 text-emerald-500 fill-white" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </aside>

                {/* Question Workspace */}
                <section className="flex-1 relative bg-slate-50/30 overflow-hidden flex flex-col">
                    <ScrollArea className="flex-1 p-4 sm:p-8">
                        <div className="max-w-5xl mx-auto py-4">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentIdx}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.3 }}
                                    className="space-y-6"
                                >
                                    {/* Question Header */}
                                    <div className="flex flex-col gap-4">
                                        <div className="flex items-center gap-3">
                                            <span className="h-8 px-3 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black text-xs">Q{currentIdx + 1}</span>
                                            <Badge variant="secondary" className="uppercase text-[10px] tracking-widest font-bold">
                                                {(qType as string).replace('_', ' ')}
                                            </Badge>
                                            <Button 
                                                variant="outline" size="sm" 
                                                className={cn("h-8 ml-auto rounded-lg text-[10px] font-bold uppercase", flagged[currentQuestion.id as string] && "bg-red-50 text-red-600 border-red-200")}
                                                onClick={() => setFlagged(prev => ({ ...prev, [currentQuestion!.id as string]: !prev[currentQuestion!.id as string] }))}
                                            >
                                                <Flag className={cn("h-3.5 w-3.5 sm:mr-1.5", flagged[currentQuestion.id as string] && "fill-current")} />
                                                <span className="hidden sm:inline">{flagged[currentQuestion.id as string] ? "Flagged" : "Flag"}</span>
                                            </Button>
                                        </div>
                                        <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 leading-snug">
                                            {currentQuestion.question_text || currentQuestion.text}
                                        </h2>
                                    </div>

                                    <Separator className="bg-slate-200" />

                                    {/* Render Input Based on Type */}
                                    <div className="min-h-[300px]">
                                        {/* MCQ */}
                                        {(qType === 'mcq' || qType === 'multiple_choice') && (
                                            <div className="grid grid-cols-1 gap-3">
                                                {((currentQuestion.options as Array<{id?: string, text: string}>) || []).map((opt, oIdx) => {
                                                    const optId = opt.id || opt.text;
                                                    const optText = opt.text;
                                                    const isSelected = answers[currentQuestion.id as string] === optId;
                                                    
                                                    return (
                                                        <button
                                                            key={oIdx}
                                                            onClick={() => handleAnswerChange(optId as string)}
                                                            className={cn(
                                                                "group relative flex items-center p-3 sm:p-4 rounded-xl border-2 text-left transition-all duration-200",
                                                                isSelected ? "bg-white border-primary shadow-lg shadow-primary/5" : "bg-white/50 border-white hover:border-slate-300"
                                                            )}
                                                        >
                                                            <div className={cn(
                                                                "h-8 w-8 shrink-0 rounded-lg flex items-center justify-center font-bold text-xs mr-3 sm:mr-4 transition-colors",
                                                                isSelected ? "bg-primary text-white" : "bg-slate-100 text-slate-500"
                                                            )}>
                                                                {String.fromCharCode(65 + oIdx)}
                                                            </div>
                                                            <span className={cn("font-medium text-sm sm:text-base leading-snug w-full", isSelected ? "text-slate-900" : "text-slate-600")}>{optText as string}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* True / False */}
                                        {qType === 'true_false' && (
                                            <div className="grid grid-cols-2 gap-4">
                                                {['True', 'False'].map((val) => (
                                                    <button
                                                        key={val}
                                                        onClick={() => handleAnswerChange(val)}
                                                        className={cn(
                                                            "h-32 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all hover:scale-[1.02]",
                                                            answers[currentQuestion.id as string] === val 
                                                                ? (val === 'True' ? "bg-emerald-50 border-emerald-500 text-emerald-700" : "bg-red-50 border-red-500 text-red-700")
                                                                : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                                                        )}
                                                    >
                                                        <span className="text-2xl font-black uppercase tracking-widest">{val}</span>
                                                        {answers[currentQuestion.id as string] === val && <CheckCircle2 className="h-6 w-6" />}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Short / Long Answer */}
                                        {(qType === 'short' || qType === 'short_answer' || qType === 'long' || qType === 'long_answer') && (
                                            <div className="space-y-2">
                                                <Textarea
                                                    placeholder="Type your answer here..."
                                                    value={answers[currentQuestion.id as string] || ''}
                                                    onChange={(e) => handleAnswerChange(e.target.value)}
                                                    className="min-h-[200px] text-base p-4 rounded-xl border-slate-200 focus:border-primary resize-y"
                                                />
                                                <p className="text-xs text-muted-foreground text-right">
                                                    {(answers[currentQuestion.id as string] || '').length} characters
                                                </p>
                                            </div>
                                        )}

                                        {/* Fill in Blanks */}
                                        {qType === 'fill_blank' && (
                                            <div className="space-y-4">
                                                <p className="text-sm text-muted-foreground">Type the missing word(s) exactly.</p>
                                                <Input
                                                    placeholder="Your answer..."
                                                    value={answers[currentQuestion.id as string] || ''}
                                                    onChange={(e) => handleAnswerChange(e.target.value)}
                                                    className="h-14 text-lg px-4 rounded-xl border-slate-200 focus:border-primary"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </ScrollArea>
                </section>
            </main>
        )}

        {/* Footer Controls */}
        <div className="bg-white border-t border-slate-200 p-3 sm:p-6 shrink-0">
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
                        disabled={currentIdx === 0}
                        className="h-10 sm:h-12 px-3 sm:px-6 rounded-xl font-bold flex items-center gap-1 sm:gap-2 text-xs sm:text-sm"
                    >
                        <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Previous</span>
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setCurrentIdx(prev => Math.min(questions.length - 1, prev + 1))}
                        disabled={currentIdx === questions.length - 1}
                        className="h-10 sm:h-12 px-3 sm:px-6 rounded-xl font-bold flex items-center gap-1 sm:gap-2 text-xs sm:text-sm"
                    >
                        <span className="hidden sm:inline">Next</span> <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
                <Button
                    onClick={handleComplete}
                    disabled={isSubmitting}
                    className="h-10 sm:h-12 px-4 sm:px-8 rounded-xl bg-slate-900 text-white hover:bg-black font-black uppercase tracking-wider text-[10px] sm:text-xs flex items-center gap-2 shadow-xl disabled:opacity-75 disabled:cursor-not-allowed transition-all"
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin text-white shrink-0" />
                            <span className="hidden sm:inline">Submitting Exam...</span>
                            <span className="sm:hidden">Submitting...</span>
                        </>
                    ) : (
                        <>
                            <span className="hidden sm:inline">Finish Assessment</span>
                            <span className="sm:hidden">Finish</span>
                            <HelpCircle className="h-4 w-4 shrink-0" />
                        </>
                    )}
                </Button>
            </div>
        </div>

        <Dialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
            <DialogContent className="rounded-[2.5rem] sm:max-w-[420px] p-0 overflow-hidden border-none shadow-2xl">
                <div className="bg-red-500 p-8 text-white relative">
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
                    <div className="h-16 w-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6 border border-white/30 shadow-xl relative z-10">
                        <AlertCircle className="h-8 w-8 text-white" />
                    </div>
                    <DialogTitle className="text-2xl font-black tracking-tight relative z-10">Abandon Assessment?</DialogTitle>
                    <DialogDescription className="text-white/80 mt-2 font-medium relative z-10 italic">
                        "Your progress is temporary, but your potential is permanent. Are you sure you want to stop now?"
                    </DialogDescription>
                </div>

                <div className="p-8 bg-white space-y-6">
                    <div className="space-y-3">
                        <p className="text-sm font-bold text-slate-600">
                             Once you exit, your current performance data will <span className="text-red-600 underline decoration-2">not be stored</span> in your profile. 
                        </p>
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-4">
                            <div className="h-10 w-10 rounded-xl bg-white shadow-sm flex items-center justify-center border border-slate-100">
                                <Monitor className="h-5 w-5 text-slate-400" />
                            </div>
                            <div className="flex-1">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Current Progress</p>
                                <p className="text-sm font-black text-slate-900">{Math.round(progress)}% Complete</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button
                            variant="outline"
                            onClick={() => setShowExitConfirm(false)}
                            className="flex-1 h-14 rounded-2xl border-2 border-slate-100 text-slate-600 font-bold hover:bg-slate-50 hover:border-slate-200 transition-all active:scale-95"
                        >
                            No, Stay
                        </Button>
                        <Button
                            onClick={onExit}
                            className="flex-1 h-14 rounded-2xl bg-red-500 hover:bg-red-600 text-white shadow-xl shadow-red-500/20 font-black uppercase tracking-widest text-[11px] transition-all active:scale-95"
                        >
                            Yes, Exit
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        {/* ── Time Up Auto-Close Overlay ─────────────────────────────────────── */}
        <AnimatePresence>
          {isTimeOver && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-950/85 backdrop-blur-xl z-[200] flex items-center justify-center p-6 pointer-events-auto"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 25 }}
                className="bg-white/10 border border-white/20 backdrop-blur-2xl rounded-[3rem] p-10 max-w-md w-full shadow-2xl flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden"
              >
                {/* Pulsing glow background decoration */}
                <div className="absolute -top-12 -left-12 w-40 h-40 bg-red-500/20 rounded-full blur-3xl" />
                <div className="absolute -bottom-12 -right-12 w-40 h-40 bg-red-500/20 rounded-full blur-3xl" />
                
                <div className="relative h-24 w-24 bg-red-500/20 rounded-full flex items-center justify-center border-2 border-red-500/30 animate-pulse">
                  <Timer className="h-12 w-12 text-red-500" />
                </div>

                <div className="space-y-3 relative z-10">
                  <h2 className="text-red-500 text-3xl sm:text-4xl font-black tracking-tight uppercase drop-shadow-[0_0_12px_rgba(239,68,68,0.4)]">
                    YOUR EXAM CLOSE
                  </h2>
                  <p className="text-slate-300 text-xs font-bold uppercase tracking-widest leading-relaxed">
                    The duration for this assessment has expired.
                  </p>
                </div>

                <div className="py-2 px-6 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
                  <Loader2 className="h-4 w-4 text-red-400 animate-spin" />
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                    Securing and submitting progress...
                  </span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
    </div>
  );
}
