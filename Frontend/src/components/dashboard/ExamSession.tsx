import React, { useState, useEffect, useRef } from 'react';
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
  FileText,
  Loader2,
  GripVertical
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  const [scratchpadCodes, setScratchpadCodes] = useState<Record<string, string>>({});
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

  // Split Pane Resizing (Default 44% left, 56% right)
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = localStorage.getItem('exam_session_split_width');
    return saved ? parseFloat(saved) : 44;
  });
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Resize Drag Handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newPct = ((e.clientX - rect.left) / rect.width) * 100;
      if (newPct >= 25 && newPct <= 75) {
        setLeftWidth(newPct);
        localStorage.setItem('exam_session_split_width', newPct.toString());
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isResizing || !containerRef.current || !e.touches[0]) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newPct = ((e.touches[0].clientX - rect.left) / rect.width) * 100;
      if (newPct >= 25 && newPct <= 75) {
        setLeftWidth(newPct);
        localStorage.setItem('exam_session_split_width', newPct.toString());
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
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
    const results = {
      examId,
      totalQuestions: questions?.length || 0,
      answers: answers,
      timeSpent: Math.max(0, (durationMinutes * 60) - timeLeft),
    };
    onFinish(results);
  }, [answers, durationMinutes, examId, isSubmitting, onFinish, questions?.length, timeLeft, type, toast]);

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
    }, 250);

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

  const handleScratchpadChange = (val: string) => {
    if (!currentQuestion) return;
    setScratchpadCodes(prev => ({ ...prev, [currentQuestion.id]: val }));
  };

  const runCode = async (selectedLang?: string, customCode?: string, customStdin?: string) => {
    if (!currentQuestion) return;
    const isCoding = (currentQuestion.type || currentQuestion.question_type) === 'coding' || (currentQuestion.type || currentQuestion.question_type) === 'practical';
    const code = customCode !== undefined 
      ? customCode 
      : (isCoding ? answers[currentQuestion.id] : scratchpadCodes[currentQuestion.id]);
    const language = selectedLang || currentQuestion.language || 'python';
    if (!code || !code.trim()) {
      toast({ title: "Empty Code", description: "Please write some code to run.", variant: "destructive" });
      return;
    }

    setIsRunning(true);
    setConsoleOutput(prev => ({ ...prev, [currentQuestion.id]: 'Running...' }));

    try {
      const res = await fetchWithAuth<{
        run?: { stdout?: string; stderr?: string; output?: string; status?: string };
        message?: string;
      }>('/run-code', {
        method: 'POST',
        body: JSON.stringify({
          language: language, 
          version: '*',
          files: [{ content: code }],
          stdin: customStdin || ''
        })
      });

      const output = res.run?.stdout || res.run?.stderr || res.run?.output || (res.message ? res.message : "No output");
      setConsoleOutput(prev => ({ ...prev, [currentQuestion.id]: output }));
      
      if (res.run?.stderr && !res.run?.stdout) {
        toast({ title: "Execution Error", description: "Check console output for error details.", variant: "destructive" });
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
      <Monitor className="h-12 w-12 text-sky-400 animate-pulse" />
      <h2 className="text-xl font-bold tracking-widest uppercase">Initializing Assessment Environment</h2>
      <div className="w-48 h-1 bg-slate-800 rounded-full overflow-hidden">
        <motion.div 
          className="h-full bg-sky-500" 
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

  const qType = currentQuestion?.type || currentQuestion?.question_type || 'mcq'; 
  const isCodingQuestion = qType === 'coding' || qType === 'practical';

  // Has structured coding fields
  const hasStructuredCoding = !!(
    currentQuestion?.input_format || 
    currentQuestion?.output_format || 
    currentQuestion?.sample_input || 
    (currentQuestion?.test_cases && currentQuestion.test_cases.length > 0)
  );

  return (
    <div className={cn(
      "fixed inset-0 bg-[#f8fafc] z-[100] flex flex-col transition-all",
      isFullScreen ? "p-0" : "p-0"
    )}>
      {/* ── Top Bar (Exact Match with Reference Design) ─────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between shadow-xs relative z-20 shrink-0">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="h-10 w-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100 shadow-xs">
            <Layout className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-none uppercase">
                {examTitle || "TEST"}
              </h1>
            </div>
            <div className="hidden sm:flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-[9px] uppercase font-bold text-slate-400 border-slate-200 bg-slate-50/80 px-2 py-0">
                Authorized Session
              </Badge>
              <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1 uppercase">
                <Monitor className="h-3 w-3" /> Secure Connection
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-5">
          {/* Timer Box (Sky blue pill) */}
          <div className={cn(
            "px-4 sm:px-6 py-1.5 rounded-2xl border flex flex-col items-center justify-center transition-all duration-500",
            timeLeft < 300 
              ? "bg-rose-50 border-rose-200 text-rose-600 animate-pulse" 
              : "bg-sky-50/80 border-sky-100 text-sky-600"
          )}>
            <div className="flex items-center gap-1.5 leading-none">
              <Clock className="h-4 w-4" />
              <span className="text-base sm:text-xl font-black tabular-nums tracking-tight">
                {formatTime(timeLeft)}
              </span>
            </div>
            <span className="text-[8px] font-black uppercase tracking-widest text-sky-400/90 mt-0.5">
              Remaining Time
            </span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-slate-400 hover:text-slate-900 rounded-xl"
            onClick={() => setIsFullScreen(!isFullScreen)}
            title={isFullScreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          <Button
            variant="ghost"
            className="h-9 px-3 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-xl font-bold text-xs flex items-center gap-1.5"
            onClick={() => setShowExitConfirm(true)}
          >
            <LogOut className="h-4 w-4" /> Exit
          </Button>
        </div>
      </header>

      {/* ── Main Interface Content (Adjustable Split for Coding, Clean Centered for MCQ/Normal) ── */}
      <main 
        ref={containerRef}
        className={cn(
          "flex-1 flex overflow-hidden relative select-none",
          isCodingQuestion ? "flex-col lg:flex-row" : "flex-col bg-slate-50/50 items-center justify-start",
          isResizing && "cursor-col-resize"
        )}
      >
        {/* ── QUESTION PANEL: Progress + Question Strip + Problem Description + Navigation ── */}
        <div 
          className={cn(
            "flex flex-col bg-white overflow-hidden shrink-0",
            isCodingQuestion 
              ? "border-b lg:border-b-0 lg:border-r border-slate-200 w-full"
              : "flex-1 w-full max-w-4xl mx-auto border-x border-slate-200/80 shadow-xs"
          )}
          style={{ 
            width: isCodingQuestion 
              ? (typeof window !== 'undefined' && window.innerWidth >= 1024 ? `${leftWidth}%` : '100%') 
              : '100%' 
          }}
        >
          {/* Left Top: Progress + Question Number Circles + Flag */}
          <div className="px-4 py-3 sm:px-6 sm:py-3.5 border-b border-slate-100 bg-white space-y-2.5 shrink-0">
            {/* Progress Bar */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Progress
              </span>
              <div className="flex-1 max-w-[260px]">
                <Progress value={progress} className="h-2 bg-slate-100 [&>div]:bg-sky-500 rounded-full" />
              </div>
              <span className="text-xs font-black text-sky-600">
                {Math.round(progress)}%
              </span>
            </div>

            {/* Question Number Strip */}
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-1">
              {questions.map((q, idx) => {
                const isAnswered = !!answers[q.id];
                const isCurrent = currentIdx === idx;
                const isFlagged = flagged[q.id];

                return (
                  <button
                    key={q.id as string}
                    onClick={() => setCurrentIdx(idx)}
                    className={cn(
                      "h-8 w-8 rounded-full text-xs font-black transition-all flex items-center justify-center shrink-0 relative",
                      isCurrent 
                        ? "bg-sky-500 text-white shadow-md shadow-sky-500/30 scale-105 z-10"
                        : isAnswered 
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"
                        : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    {idx + 1}
                    {isFlagged && (
                      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-red-500 rounded-full border border-white" />
                    )}
                  </button>
                );
              })}

              {/* Flag Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFlagged(prev => ({ ...prev, [currentQuestion!.id as string]: !prev[currentQuestion!.id as string] }))}
                className={cn(
                  "h-8 px-2.5 rounded-full text-[10px] font-bold uppercase shrink-0 border-slate-200 ml-1.5 flex items-center gap-1",
                  flagged[currentQuestion?.id as string] && "bg-red-50 text-red-600 border-red-200"
                )}
              >
                <Flag className={cn("h-3 w-3", flagged[currentQuestion?.id as string] && "fill-current")} />
                <span>Flag</span>
              </Button>
            </div>
          </div>

          {/* Left Middle: Scrollable Problem Workspace */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 custom-scrollbar bg-white">
            {/* Question Title & Badges */}
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="h-6 w-6 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5 border border-sky-100">
                  {isCodingQuestion ? '</>' : (currentIdx + 1)}
                </div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
                  {currentQuestion?.question_text || currentQuestion?.text}
                </h2>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {isCodingQuestion && (
                  <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-200 border-none font-bold text-[10px] uppercase px-2.5 py-0.5 rounded-full">
                    {currentQuestion?.language || 'PYTHON'}
                  </Badge>
                )}
                <Badge variant="outline" className="text-rose-500 border-rose-200 bg-rose-50/60 font-bold text-[10px] uppercase px-2.5 py-0.5 rounded-full">
                  {currentQuestion?.difficulty || 'Medium'}
                </Badge>
                <Badge variant="outline" className="text-sky-600 border-sky-200 bg-sky-50/50 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  {(qType as string).replace('_', ' ')}
                </Badge>
              </div>
            </div>

            {/* Problem Description Card */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-slate-400" />
                Problem Description
              </label>

              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/60 border border-slate-200 text-slate-800 text-xs sm:text-sm leading-relaxed space-y-4">
                {/* Detailed coding question display if structured coding format */}
                {hasStructuredCoding ? (
                  <CodingQuestionDisplay
                    question_text={currentQuestion?.question_text || currentQuestion?.text}
                    input_format={currentQuestion?.input_format}
                    output_format={currentQuestion?.output_format}
                    explanation={currentQuestion?.explanation}
                    constraints={currentQuestion?.constraints}
                    sample_input={currentQuestion?.sample_input}
                    sample_output={currentQuestion?.sample_output}
                    test_cases={currentQuestion?.test_cases}
                    language={currentQuestion?.language}
                    difficulty={currentQuestion?.difficulty}
                  />
                ) : (
                  <>
                    {/* Description Text or Code Sample */}
                    {currentQuestion?.description ? (
                      <div className="font-mono bg-white p-3.5 rounded-xl border border-slate-200/80 whitespace-pre-wrap leading-relaxed text-xs">
                        {currentQuestion.description}
                      </div>
                    ) : (
                      <div className="font-sans text-slate-600 text-xs sm:text-sm">
                        {currentQuestion?.question_text || currentQuestion?.text}
                      </div>
                    )}
                  </>
                )}

                {/* MCQ Options with Radio-style Selection */}
                {(qType === 'mcq' || qType === 'multiple_choice') && (
                  <div className="space-y-2.5 pt-2">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                      Select Answer:
                    </p>
                    {((currentQuestion?.options as Array<{id?: string, text: string}>) || []).map((opt, oIdx) => {
                      const optId = opt.id || opt.text;
                      const optText = opt.text;
                      const isSelected = answers[currentQuestion!.id as string] === optId;

                      return (
                        <button
                          key={oIdx}
                          onClick={() => handleAnswerChange(optId as string)}
                          className={cn(
                            "w-full flex items-center p-3 sm:p-3.5 rounded-xl border text-left transition-all text-xs font-semibold gap-3",
                            isSelected 
                              ? "bg-white border-sky-500 text-slate-900 shadow-sm ring-2 ring-sky-500/20" 
                              : "bg-white border-slate-200/90 hover:border-slate-300 text-slate-700 hover:bg-slate-50"
                          )}
                        >
                          <div className={cn(
                            "h-5 w-5 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors",
                            isSelected 
                              ? "border-sky-500 bg-sky-500 text-white" 
                              : "border-slate-300 text-slate-500 bg-slate-50"
                          )}>
                            {String.fromCharCode(65 + oIdx)}
                          </div>
                          <span className="flex-1 font-mono text-xs">{optText as string}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* True / False */}
                {qType === 'true_false' && (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    {['True', 'False'].map((val) => (
                      <button
                        key={val}
                        onClick={() => handleAnswerChange(val)}
                        className={cn(
                          "h-14 rounded-xl border-2 flex items-center justify-center gap-2 transition-all font-black uppercase text-sm",
                          answers[currentQuestion!.id as string] === val 
                            ? (val === 'True' ? "bg-emerald-50 border-emerald-500 text-emerald-700" : "bg-red-50 border-red-500 text-red-700")
                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                        )}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                )}

                {/* Short / Long Answer */}
                {(qType === 'short' || qType === 'short_answer' || qType === 'long' || qType === 'long_answer') && (
                  <div className="space-y-2 pt-2">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Your Written Response:</p>
                    <Textarea
                      placeholder="Type your explanation or response here..."
                      value={answers[currentQuestion!.id as string] || ''}
                      onChange={(e) => handleAnswerChange(e.target.value)}
                      className="min-h-[140px] text-xs sm:text-sm p-3 rounded-xl border-slate-200 bg-white focus:border-sky-500"
                    />
                  </div>
                )}

                {/* Fill in Blank */}
                {qType === 'fill_blank' && (
                  <div className="space-y-2 pt-2">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Your Answer:</p>
                    <Input
                      placeholder="Type exact answer here..."
                      value={answers[currentQuestion!.id as string] || ''}
                      onChange={(e) => handleAnswerChange(e.target.value)}
                      className="h-10 text-xs sm:text-sm rounded-xl bg-white border-slate-200 focus:border-sky-500"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Left Bottom: Previous / Next Navigation */}
          <div className="p-3 sm:p-4 border-t border-slate-100 bg-white flex items-center justify-between shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
              disabled={currentIdx === 0}
              className="h-9 px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentIdx(prev => Math.min(questions.length - 1, prev + 1))}
              disabled={currentIdx === questions.length - 1}
              className="h-9 px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* ── DRAGGABLE RESIZER & RIGHT CODING PANEL (Shown ONLY for Coding Questions) ─────────── */}
        {isCodingQuestion && (
          <>
            {/* Draggable Resizer Handle */}
            <div 
              onMouseDown={() => setIsResizing(true)}
              onTouchStart={() => setIsResizing(true)}
              onDoubleClick={() => setLeftWidth(44)}
              title="Drag left/right to adjust problem & code editor views (Double click to reset)"
              className={cn(
                "hidden lg:flex w-2.5 hover:w-2.5 active:w-2.5 bg-slate-100 hover:bg-sky-400/30 active:bg-sky-500 cursor-col-resize items-center justify-center transition-colors relative z-30 shrink-0 select-none",
                isResizing && "bg-sky-500 w-2.5"
              )}
            >
              <div className="h-8 w-1 rounded-full bg-slate-300 hover:bg-sky-500 transition-colors flex items-center justify-center">
                <GripVertical className="h-3 w-3 text-slate-500 opacity-0 group-hover:opacity-100" />
              </div>
            </div>

            {/* Right Panel: VS Code Studio Code Playground & xterm Terminal */}
            <div 
              className="flex-1 flex flex-col bg-slate-950 overflow-hidden w-full h-full min-h-[420px] lg:min-h-0"
              style={{ 
                width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? `${100 - leftWidth}%` : '100%' 
              }}
            >
              <CodePlayground
                className="h-full flex-1 rounded-none border-none shadow-none"
                initialLanguage={currentQuestion?.language || 'python'}
                questionText={currentQuestion?.question_text || currentQuestion?.text || ''}
                value={answers[currentQuestion?.id as string] || ''}
                onChange={(val) => handleAnswerChange(val || '')}
                output={consoleOutput[currentQuestion?.id as string]}
                onRunCode={(lang, code, stdin) => runCode(lang, code, stdin)}
                isRunning={isRunning}
              />
            </div>
          </>
        )}
      </main>

      {/* ── Global Bottom Bar with Finish Assessment on Bottom Right ──────────────────── */}
      <footer className="bg-white border-t border-slate-200 px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between shadow-xs relative z-20 shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
          <span className="hidden sm:inline">Question {currentIdx + 1} of {questions.length}</span>
          <span className="sm:hidden">{currentIdx + 1}/{questions.length}</span>
          <span className="text-slate-300">•</span>
          <span className="text-emerald-600 font-bold">{Object.keys(answers).length} Answered</span>
        </div>

        <Button
          onClick={handleComplete}
          className="h-10 px-5 sm:px-7 rounded-2xl bg-slate-900 text-white hover:bg-black font-black uppercase tracking-wider text-[11px] flex items-center gap-2 shadow-xl shadow-slate-900/10 active:scale-95 transition-all"
        >
          <span>Finish Assessment</span>
          <HelpCircle className="h-4 w-4 text-slate-400" />
        </Button>
      </footer>

      {/* ── Abandon / Exit Confirmation Dialog ────────────────────────────────────────── */}
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

      {/* ── Time Up Auto-Close Overlay ────────────────────────────────────────────────── */}
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
