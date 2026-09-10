import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, ClipboardCheck, Clock, Award, ArrowRight, CheckCircle2, BarChart, Home, XCircle, BookOpen, Calendar as CalendarIcon } from "lucide-react";
import { useStudentExams, useStudentMockPapers, StudentExam } from "@/hooks/useStudentData";
import { Skeleton } from "@/components/ui/skeleton";
import { ExamSession } from "./ExamSession";
import { fetchWithAuth, API_URL } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ExamReview } from "./ExamReview";

interface ExamModuleProps {
    type: 'mock' | 'live';
}

interface SubmissionResults {
  examId: string;
  totalQuestions: number;
  answers: Record<string, string>;
  timeSpent: number;
}

export function ExamModule({ type }: ExamModuleProps) {
    const { data: liveExams, isLoading: loadingExams } = useStudentExams();
    const { data: mockPapers, isLoading: loadingMocks } = useStudentMockPapers();
    const [activeExam, setActiveExam] = useState<StudentExam | null>(null);
    const [showResults, setShowResults] = useState<{ id?: string, score: number, total: number, percentage: number, correctCount?: number, wrongCount?: number, hasSubjective?: boolean } | null>(null);
    const [viewingReviewId, setViewingReviewId] = useState<string | null>(null);
    const [now, setNow] = useState(new Date());
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<'mock' | 'live'>(type);

    useEffect(() => {
        const syncTime = async () => {
            try {
                const res = await fetch(`${API_URL.replace('/api', '')}/api/system/time`);
                const { serverTime } = await res.json();
                setNow(new Date(serverTime));
            } catch (e) {
                setNow(new Date());
            }
        };
        syncTime();
        const timer = setInterval(() => setNow(prev => new Date(prev.getTime() + 1000)), 1000);
        return () => clearInterval(timer);
    }, []);

    const data = activeTab === 'live' ? liveExams : mockPapers;
    const isLoading = activeTab === 'live' ? loadingExams : loadingMocks;
    const icon = activeTab === 'live' ? <ClipboardCheck className="h-5 w-5" /> : <FileText className="h-5 w-5" />;

    const handleFinish = async (results: SubmissionResults) => {
        try {
            const data = await fetchWithAuth('/student/submit-exam', {
                method: 'POST',
                body: JSON.stringify(results)
            }) as { resultId: string, score: number, percentage: number, correctCount: number, wrongCount: number, hasSubjective?: boolean };
            
            setShowResults({
                id: data.resultId,
                score: data.score,
                total: results.totalQuestions,
                percentage: Math.round(data.percentage),
                correctCount: data.correctCount,
                wrongCount: data.wrongCount,
                hasSubjective: data.hasSubjective
            });

            toast({
                title: "Exam Submitted",
                description: "Your results have been saved to your profile.",
                className: "bg-emerald-50 border-emerald-200"
            });
            setActiveExam(null);
        } catch (err) {
            toast({
                title: "Submission Error",
                description: "Failed to save exam results. Please contact support.",
                variant: "destructive"
            });
        }
    };

    if (viewingReviewId) {
        return <ExamReview resultId={viewingReviewId} onClose={() => setViewingReviewId(null)} />;
    }

    if (activeExam) {
        return (
            <ExamSession 
                examId={activeExam.id}
                examTitle={activeExam.title}
                durationMinutes={activeExam.duration_minutes || 60}
                scheduledDate={activeExam.scheduled_date}
                onFinish={handleFinish}
                onExit={() => setActiveExam(null)}
                type={activeTab}
            />
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Premium Tab Switcher */}
            <div className="flex p-1.5 bg-slate-100/70 backdrop-blur-md rounded-2xl max-w-md border border-slate-200/40 shadow-inner">
                <button
                    onClick={() => setActiveTab('mock')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all duration-300",
                        activeTab === 'mock' 
                            ? "bg-white text-slate-900 shadow-sm border border-slate-200/20" 
                            : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                    )}
                >
                    <FileText className="h-4 w-4 text-slate-400" />
                    Practice Mocks
                </button>
                <button
                    onClick={() => setActiveTab('live')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all duration-300 relative",
                        activeTab === 'live' 
                            ? "bg-slate-900 text-white shadow-xl" 
                            : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                    )}
                >
                    <ClipboardCheck className={cn("h-4 w-4", activeTab === 'live' ? "text-primary" : "text-slate-400")} />
                    Live Exams
                    {liveExams && liveExams.length > 0 && (
                        <span className={cn(
                            "absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black border-2 border-white",
                            activeTab === 'live' ? "bg-primary text-white" : "bg-red-500 text-white animate-pulse"
                        )}>
                            {liveExams.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Main Interactive Grid */}
            {isLoading ? (
                <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 w-full rounded-[2rem]" />)}
                </div>
            ) : !data || data.length === 0 ? (
                <Card className="border-dashed bg-white border-slate-200 rounded-3xl py-16 shadow-sm">
                    <CardContent className="flex flex-col items-center justify-center text-center p-6">
                        <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 text-slate-300">
                            {activeTab === 'live' ? <ClipboardCheck className="h-8 w-8" /> : <FileText className="h-8 w-8" />}
                        </div>
                        <h4 className="text-base font-black text-slate-800 uppercase tracking-tight">No Sessions Available</h4>
                        <p className="text-xs font-medium text-slate-500 max-w-sm mt-2">
                            {activeTab === 'live' 
                                ? "There are no scheduled live exams assigned to you at this moment." 
                                : "There are no practice mock tests available right now."}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                    {data?.map((item) => {
                        const scheduledDate = item.scheduled_date ? new Date(item.scheduled_date) : null;
                        const durationMs = (item.duration_minutes || 60) * 60 * 1000;
                        const expirationDate = scheduledDate ? new Date(scheduledDate.getTime() + durationMs) : null;
                        const isLocked = scheduledDate && scheduledDate > now;
                        const isExpired = expirationDate && now > expirationDate;

                        return (
                            <motion.div
                               key={item.id}
                               whileHover={{ y: -5 }}
                               className="group relative flex flex-col rounded-[2rem] border border-slate-100 bg-white shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden cursor-pointer h-full"
                               onClick={() => {
                                  if (isExpired) {
                                      toast({
                                         title: "Session Expired",
                                         description: "This exam session is already closed.",
                                         variant: "destructive"
                                      });
                                      return;
                                  }
                                  if (!item.is_completed && !isLocked) {
                                     setActiveExam(item);
                                  } else if (isLocked) {
                                     toast({
                                        title: "Session Locked",
                                        description: `This exam is scheduled for ${scheduledDate?.toLocaleString([], { hour12: true })}. Please wait for the timer to end.`,
                                        variant: "destructive"
                                     });
                                  }
                               }}
                            >
                               <div className="aspect-video relative overflow-hidden bg-slate-50">
                                  {item.assigned_image ? (
                                    <img 
                                      src={item.assigned_image.startsWith('http') ? item.assigned_image : `${API_URL}/s3/public/${item.assigned_image}`} 
                                      className="h-full w-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all duration-700" 
                                      alt="" 
                                    />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center bg-slate-100">
                                       <FileText className="h-10 w-10 text-slate-200" />
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center backdrop-blur-[6px] p-6 text-center">
                                     {(() => {
                                        if (item.is_completed) {
                                           return (
                                              <Button className="rounded-full font-black uppercase text-[10px] tracking-widest h-12 px-8 bg-red-500 text-white border-none transform translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                                                 🚫 Already Attempted
                                              </Button>
                                           );
                                        }

                                        if (isExpired) {
                                           return (
                                              <Button className="rounded-full font-black uppercase text-[10px] tracking-widest h-12 px-8 bg-slate-100 text-slate-400 border-none transform translate-y-4 group-hover:translate-y-0 transition-all duration-500 shadow-xl cursor-not-allowed">
                                                 ⌛ Already Closed
                                              </Button>
                                           );
                                        }

                                        if (isLocked && scheduledDate) {
                                           const diff = scheduledDate.getTime() - now.getTime();
                                           const hours = Math.floor(diff / (1000 * 60 * 60));
                                           const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                                           const secs = Math.floor((diff % (1000 * 60)) / 1000);

                                           return (
                                              <div className="transform translate-y-4 group-hover:translate-y-0 transition-all duration-500 space-y-3">
                                                 <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] animate-pulse whitespace-nowrap">Please Wait some Moment</p>
                                                 <div className="flex gap-2 justify-center">
                                                    {[
                                                       { v: hours, l: 'h' },
                                                       { v: mins, l: 'm' },
                                                       { v: secs, l: 's' }
                                                    ].map((t, i) => (
                                                       <div key={i} className="bg-white/10 backdrop-blur-md rounded-xl p-2 min-w-[50px] border border-white/20">
                                                          <div className="text-xl font-black text-white">{String(t.v).padStart(2, '0')}</div>
                                                          <div className="text-[8px] font-bold text-white/50 uppercase">{t.l}</div>
                                                       </div>
                                                    ))}
                                                 </div>
                                                 <p className="text-white/60 text-[10px] font-medium italic mt-2">
                                                    Exam countdown active
                                                 </p>
                                              </div>
                                           );
                                        }

                                        return (
                                           <Button className="rounded-full font-black uppercase text-[10px] tracking-widest h-12 px-8 bg-white text-black border-none transform translate-y-4 group-hover:translate-y-0 transition-all duration-500 shadow-xl">
                                              Begin Session
                                           </Button>
                                        );
                                     })()}
                                  </div>
                                  <div className="absolute top-4 right-4">
                                     <Badge className={cn("text-[8px] font-black uppercase tracking-widest h-6 rounded-full px-3 border-none shadow-lg", 
                                       item.is_completed ? "bg-red-500 text-white" : isLocked ? "bg-orange-500 text-white" : "bg-emerald-500 text-white animate-pulse"
                                     )}>
                                        {item.is_completed ? "🚫 Completed" : isLocked ? "🔒 Scheduled" : "Active Node"}
                                     </Badge>
                                  </div>
                               </div>

                               <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                                  <div className="space-y-2">
                                     <h4 className="font-black text-sm uppercase tracking-tight text-slate-900 line-clamp-2">{item.title}</h4>
                                     <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {item.duration_minutes}m</span>
                                        <span className="h-1 w-1 rounded-full bg-slate-200" />
                                        <span className="flex items-center gap-1"><Award className="h-3 w-3" /> {item.total_marks}pts</span>
                                     </div>
                                     {item.scheduled_date && (
                                         <div className="mt-2 py-2 px-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                               <CalendarIcon className="h-3.5 w-3.5 text-primary" />
                                               <span className="text-[10px] font-black text-slate-900 uppercase">
                                                  {new Date(item.scheduled_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                               </span>
                                            </div>
                                            <span className="text-[10px] font-black text-primary uppercase">
                                               {new Date(item.scheduled_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                                            </span>
                                         </div>
                                      )}
                                  </div>
                                  
                                  <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                                     <div className="flex -space-x-2">
                                         {[1, 2, 3].map(i => (
                                           <div key={i} className="h-6 w-6 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[8px] font-black text-slate-400">
                                              L${i}
                                           </div>
                                         ))}
                                     </div>
                                     <Button variant="ghost" className="h-8 w-8 rounded-full p-0 text-slate-300 group-hover:text-primary transition-colors">
                                        <ArrowRight className="h-4 w-4" />
                                     </Button>
                                  </div>
                               </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            <Dialog open={!!showResults} onOpenChange={() => setShowResults(null)}>
                <DialogContent className="sm:max-w-md bg-white/95 backdrop-blur-xl border-slate-200 shadow-2xl rounded-3xl overflow-hidden p-0">
                    {showResults && (
                        <>
                            <div className="h-32 bg-primary/10 relative overflow-hidden flex items-center justify-center">
                                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
                                <div className="relative z-10 p-4 rounded-2xl bg-white shadow-xl shadow-primary/10">
                                    <Award className="h-12 w-12 text-primary" />
                                </div>
                            </div>

                            <div className="px-8 pt-6 pb-8 space-y-6 text-center">
                                <div className="space-y-2">
                                    <DialogTitle className="text-2xl font-black text-slate-900">Performance Summary</DialogTitle>
                                    <DialogDescription className="text-slate-500 font-medium">
                                        Great job completing the mock paper! Here is how you did.
                                    </DialogDescription>
                                </div>

                                <div className="py-4 space-y-4">
                                    <div className="flex items-center justify-between text-sm font-bold text-slate-400 uppercase tracking-widest px-1">
                                        <span>Score Overview</span>
                                        <span className={showResults.percentage >= 70 ? 'text-emerald-600' : 'text-orange-600'}>
                                            {showResults.percentage}% Success Rate
                                        </span>
                                    </div>
                                    
                                    <div className="relative pt-2">
                                        <Progress value={showResults.percentage} className="h-3 rounded-full bg-slate-100" />
                                        <div className="flex justify-between mt-6 gap-3">
                                            <div className="flex-1 p-3 rounded-2xl bg-emerald-50 border border-emerald-100 text-center">
                                                <div className="flex items-center justify-center gap-1.5 text-emerald-600 mb-1">
                                                    <CheckCircle2 className="h-4 w-4" />
                                                    <span className="text-[10px] font-black uppercase tracking-wider">
                                                        {showResults.hasSubjective ? "Solved" : "Correct"}
                                                    </span>
                                                </div>
                                                <div className="text-xl font-black text-emerald-700">{showResults.correctCount ?? showResults.score}</div>
                                            </div>
                                            {!showResults.hasSubjective && (
                                                <div className="flex-1 p-3 rounded-2xl bg-red-50 border border-red-100 text-center">
                                                    <div className="flex items-center justify-center gap-1.5 text-red-600 mb-1">
                                                        <XCircle className="h-4 w-4" />
                                                        <span className="text-[10px] font-black uppercase tracking-wider">Wrong</span>
                                                    </div>
                                                    <div className="text-xl font-black text-red-700">{showResults.wrongCount ?? 0}</div>
                                                </div>
                                            )}
                                            <div className="flex-1 p-3 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                                                <div className="flex items-center justify-center gap-1.5 text-slate-400 mb-1">
                                                    <BarChart className="h-4 w-4" />
                                                    <span className="text-[10px] font-black uppercase tracking-wider">Total</span>
                                                </div>
                                                <div className="text-xl font-black text-slate-700">{showResults.total}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <DialogFooter className="flex-col sm:flex-col gap-3">
                                    <Button 
                                        onClick={() => {
                                            if (showResults.id) setViewingReviewId(showResults.id);
                                            setShowResults(null);
                                        }}
                                        className="w-full h-14 rounded-2xl text-lg font-bold pro-button-primary shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all"
                                    >
                                        <BookOpen className="mr-2 h-5 w-5" /> 
                                        Review My Answers
                                    </Button>
                                    <Button 
                                        variant="ghost"
                                        onClick={() => setShowResults(null)}
                                        className="w-full h-12 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50"
                                    >
                                        <Home className="mr-2 h-4 w-4" /> 
                                        Return to Dashboard
                                    </Button>
                                </DialogFooter>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
