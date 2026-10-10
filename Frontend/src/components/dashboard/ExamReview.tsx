import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
    CheckCircle2, 
    XCircle, 
    ChevronLeft, 
    Clock, 
    Award,
    AlertCircle,
    BookOpen,
    HelpCircle,
    Star,
    MessageSquare,
    Mic,
    Play,
    Send,
    Loader2,
    Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

interface ReviewResult {
    meta: {
        score: number;
        total: number;
        percentage: number;
        submitted_at: string;
        grading_status: 'graded' | 'pending' | 'reevaluation';
        global_feedback?: string;
        feedback_audio_url?: string;
        is_reevaluation_requested?: boolean;
        reevaluation_reason?: string;
    };
    questions: Array<{
        id: string;
        text: string;
        type: string;
        options: Array<{
            id: string;
            text: string;
            is_correct: boolean;
        }>;
        studentAnswerId: string | null;
        is_correct: boolean | null;
        marks: number;
        earned_marks?: number;
        coding_evaluation?: {
            isCorrect: boolean;
            earned_marks: number;
            max_marks: number;
            total_test_cases: number;
            passed_test_cases: number;
            test_case_results?: Array<{
                test_case_index: number;
                is_hidden: boolean;
                passed: boolean;
                status: string;
                actual_output?: string;
                error?: string;
                explanation?: string;
            }>;
        };
        correct_answer?: string;
        manual_grade?: {
          marks: number;
          feedback: string;
        };
    }>;
}

interface ExamReviewProps {
    resultId: string;
    onClose: () => void;
}

export function ExamReview({ resultId, onClose }: ExamReviewProps) {
    const [review, setReview] = useState<ReviewResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [showReevaluationForm, setShowReevaluationForm] = useState(false);
    const [reevaluationReason, setReevaluationReason] = useState("");
    const [isSubmittingReevaluation, setIsSubmittingReevaluation] = useState(false);

    const fetchReview = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchWithAuth<ReviewResult>(`/student/exam-review/${resultId}`);
            setReview(data);
        } catch (err) {
            console.error('Failed to fetch exam review', err);
        } finally {
            setLoading(false);
        }
    }, [resultId]);

    useEffect(() => {
        fetchReview();
    }, [resultId, fetchReview]);

    const handleRequestReevaluation = async () => {
      if (!reevaluationReason.trim()) {
        toast.error("Please provide a reason for re-evaluation");
        return;
      }
      setIsSubmittingReevaluation(true);
      try {
        await fetchWithAuth(`/student/request-reevaluation/${resultId}`, {
          method: 'POST',
          body: JSON.stringify({ reason: reevaluationReason })
        });
        toast.success("Re-evaluation request submitted");
        setShowReevaluationForm(false);
        fetchReview();
      } catch {
        toast.error("Failed to submit request");
      } finally {
        setIsSubmittingReevaluation(false);
      }
    };

    if (loading) {
        return (
            <div className="space-y-6 max-w-4xl mx-auto py-8">
                <Skeleton className="h-40 w-full rounded-2xl" />
                <div className="space-y-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
                </div>
            </div>
        );
    }

    if (!review) {
        return (
            <div className="text-center py-20 flex flex-col items-center gap-4">
                <AlertCircle className="h-12 w-12 text-rose-500" />
                <h3 className="text-xl font-bold">Failed to load review</h3>
                <Button onClick={onClose}>Return to History</Button>
            </div>
        );
    }

    const { meta } = review;
    const isPending = meta.grading_status === 'pending';
    const isUnderReview = meta.grading_status === 'reevaluation';

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 mt-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <Button variant="ghost" className="rounded-xl gap-2 font-bold text-slate-500 hover:text-primary transition-colors" onClick={onClose}>
                    <ChevronLeft className="h-5 w-5" />
                    Back to History
                </Button>
                <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Submission Date</p>
                    <p className="text-sm font-bold text-slate-900">{new Date(review.meta.submitted_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
            </div>

            {/* Status Alert if Pending */}
            {isPending && (
                <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-amber-200 flex items-center justify-center text-amber-700 animate-pulse">
                        <Clock className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-amber-900 uppercase tracking-widest">Manual Grading in Progress</h4>
                        <p className="text-xs font-medium text-amber-700">The instructor is reviewing your subjective answers. Your final score will be updated soon.</p>
                      </div>
                    </div>
                </div>
            )}

            {isUnderReview && (
                <div className="p-6 bg-blue-50 rounded-3xl border border-blue-100 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-blue-200 flex items-center justify-center text-blue-700 animate-pulse">
                        <HelpCircle className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-blue-900 uppercase tracking-widest">Under Re-evaluation</h4>
                        <p className="text-xs font-medium text-blue-700">Your request for re-grading is being reviewed by the instructor.</p>
                      </div>
                    </div>
                </div>
            )}

            {/* Performance Banner */}
            <Card className={`pro-card border-none text-white overflow-hidden relative shadow-2xl shadow-primary/20 ${isPending ? 'bg-slate-800' : 'bg-primary'}`}>
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
                <CardContent className="p-8 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="space-y-2 text-center md:text-left">
                        <Badge className="bg-white/20 text-white border-none font-black px-3 py-1 mb-2">Detailed Analysis</Badge>
                        <h2 className="text-4xl font-black tracking-tight">{isPending ? 'Preliminary Results' : 'Final Assessment Result'}</h2>
                        <p className="text-white/70 font-medium">
                          {isPending 
                            ? 'Auto-graded points shown. Waiting for subjective evaluation.' 
                            : 'Verify your performance and instructor feedback below.'}
                        </p>
                    </div>
                    
                    <div className="flex gap-4">
                        <div className="h-32 w-32 rounded-3xl bg-white/10 backdrop-blur-md flex flex-col items-center justify-center border border-white/20">
                            <span className="text-3xl font-black">{Math.round(review.meta.percentage)}%</span>
                            <span className="text-[10px] uppercase font-bold text-white/60">Success Rate</span>
                        </div>
                        <div className={`h-32 w-32 rounded-3xl bg-white flex flex-col items-center justify-center shadow-lg ${isPending ? 'text-slate-800' : 'text-primary'}`}>
                            <span className="text-3xl font-black">{review.meta.score}<span className="text-lg opacity-50">/{review.meta.total}</span></span>
                            <span className="text-[10px] uppercase font-bold opacity-60">Total Points</span>
                        </div>
                    </div>
                </CardContent>
                <Award className="absolute -bottom-8 -right-8 h-48 w-48 text-white/5 -rotate-12" />
            </Card>

            {/* Instructor Feedback Card */}
            {(meta.global_feedback || meta.feedback_audio_url) && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl overflow-hidden relative group"
              >
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                   <MessageSquare className="h-24 w-24" />
                </div>
                <div className="relative z-10 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                      <Star className="h-5 w-5 fill-indigo-600" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight italic uppercase">Instructor Feedback</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-2">
                       <p className="text-slate-600 font-medium leading-relaxed italic text-lg">
                         "{meta.global_feedback || "No additional comments provided."}"
                       </p>
                    </div>
                    {meta.feedback_audio_url && (
                      <div className="bg-indigo-600 rounded-3xl p-6 text-white flex flex-col items-center justify-center text-center gap-3 hover:translate-y-[-4px] transition-all">
                        <div className="h-14 w-14 rounded-full bg-white/20 flex items-center justify-center cursor-pointer hover:bg-white/30 transition-colors">
                          <Play className="h-6 w-6 fill-white" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-100">Audio Feedback</p>
                          <p className="text-[8px] font-bold text-indigo-200 mt-1">Play instructor recording</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Questions List */}
            <div className="space-y-6">
                <div className="flex items-center justify-between px-2 mb-4">
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-5 w-5 text-primary" />
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-[.25em]">Question Inventory</h3>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-bold bg-white text-slate-400 border-slate-100">
                      {review.questions.length} Items
                    </Badge>
                </div>

                {review.questions.map((q, idx) => {
                    const isPendingReview = q.is_correct === null && !q.manual_grade;
                    const isSubjective = ['short', 'long', 'subjective', 'short_answer', 'long_answer', 'coding'].includes(q.type);
                    const isCorrect = q.is_correct === true || (isSubjective && (q.manual_grade?.marks || 0) > 0);
                    
                    return (
                        <motion.div
                            key={q.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                        >
                            <Card className={`overflow-hidden rounded-[1.5rem] border-2 transition-all ${
                                isCorrect 
                                ? 'border-emerald-100 bg-emerald-50/10' 
                                : isPendingReview
                                    ? 'border-amber-100 bg-amber-50/10'
                                    : 'border-rose-100 bg-rose-50/10'
                            }`}>
                                <CardHeader className="pb-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-3">
                                                <Badge variant="outline" className="h-6 rounded-lg font-black border-slate-200 text-[10px]">#{(idx + 1).toString().padStart(2, '0')}</Badge>
                                                <Badge className={
                                                    isCorrect ? 'bg-emerald-500 text-white' : 
                                                    isPendingReview ? 'bg-amber-500 text-white' : 
                                                    'bg-rose-500 text-white'
                                                }>
                                                    {isCorrect ? 'Correct' : isPendingReview ? 'Pending Grading' : 'Incorrect'}
                                                </Badge>
                                                <Badge variant="outline" className="text-[9px] font-black uppercase tracking-wider text-slate-400">{q.type.replace('_', ' ')}</Badge>
                                            </div>
                                            <h4 className="text-lg font-black text-slate-900 leading-tight whitespace-pre-wrap">{q.text}</h4>
                                        </div>
                                        <div className="text-right">
                                           <div className={`font-black text-lg ${isCorrect ? 'text-emerald-500' : isPendingReview ? 'text-amber-500' : 'text-rose-500'}`}>
                                              {isSubjective ? (q.manual_grade?.marks || 0) : (isCorrect ? q.marks : 0)}
                                              <span className="text-sm opacity-30 ml-0.5">/{q.marks}</span>
                                           </div>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* MCQ Options Display */}
                                    {(q.type === 'mcq' || q.type === 'multiple_choice') && q.options.map((opt) => {
                                        const isSelected = opt.id === q.studentAnswerId || opt.text === q.studentAnswerId;
                                        const isTruth = opt.is_correct;
                                        
                                        let stateClass = "bg-white border-slate-100 text-slate-600";
                                        if (isSelected && isTruth) stateClass = "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-200";
                                        else if (isSelected && !isTruth) stateClass = "bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-200";
                                        else if (isTruth) stateClass = "bg-emerald-100 border-emerald-300 text-emerald-800 ring-2 ring-emerald-300/20";

                                        return (
                                            <div 
                                                key={opt.id}
                                                className={`flex items-center justify-between p-4 rounded-xl border text-sm font-bold transition-all ${stateClass}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`h-6 w-6 rounded-lg flex items-center justify-center border ${
                                                        isSelected ? 'bg-white/20 border-white/40' : 'bg-slate-50 border-slate-200'
                                                    }`}>
                                                        {isSelected ? <CheckCircle2 className="h-4 w-4" /> : <div className="h-2 w-2 rounded-full bg-slate-300" />}
                                                    </div>
                                                    <span>{opt.text}</span>
                                                </div>
                                                
                                                <div className="flex items-center gap-2">
                                                    {isSelected && (
                                                        <span className="text-[8px] uppercase tracking-widest font-black bg-black/10 px-1.5 py-0.5 rounded">Selected</span>
                                                    )}
                                                    {isTruth && (
                                                        <CheckCircle2 className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-emerald-500'}`} />
                                                    )}
                                                    {!isTruth && isSelected && (
                                                        <XCircle className="h-4 w-4 text-white" />
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Coding / Subjective Answer Display */}
                                    {(q.type === 'coding' || isSubjective || q.type === 'fill_blank' || q.type === 'true_false') && (
                                        <div className="space-y-4">
                                            <div className="space-y-1">
                                                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Your Entry</p>
                                                {q.type === 'coding' ? (
                                                    <pre className="p-4 bg-slate-900 text-slate-50 rounded-2xl text-[13px] font-mono overflow-auto max-h-64 whitespace-pre-wrap border border-slate-800 shadow-inner">
                                                        {q.studentAnswerId || '// No code submitted'}
                                                    </pre>
                                                ) : (
                                                    <div className={`p-5 rounded-2xl border font-bold text-sm leading-relaxed ${
                                                        isCorrect ? 'bg-emerald-50 border-emerald-100 text-emerald-900' : 
                                                        isPendingReview ? 'bg-amber-50 border-amber-100 text-amber-900' :
                                                        'bg-rose-50 border-rose-100 text-rose-900'
                                                    }`}>
                                                        {q.studentAnswerId || '(Blank Answer)'}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Automatic Coding Evaluation Test Cases Telemetry */}
                                            {q.type === 'coding' && q.coding_evaluation && (
                                                <div className="space-y-2.5 p-4 rounded-2xl bg-slate-900 border border-slate-800">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <Award className="h-4 w-4 text-emerald-400" />
                                                            <span className="text-xs font-bold text-slate-200">
                                                                Test Cases: {q.coding_evaluation.passed_test_cases} / {q.coding_evaluation.total_test_cases} Passed
                                                            </span>
                                                        </div>
                                                        <Badge variant="outline" className={`text-[10px] font-bold font-mono ${q.coding_evaluation.isCorrect ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-amber-500/10 text-amber-400 border-amber-500/30"}`}>
                                                            {q.earned_marks !== undefined ? q.earned_marks : q.coding_evaluation.earned_marks} / {q.marks} Marks
                                                        </Badge>
                                                    </div>
                                                    {q.coding_evaluation.test_case_results && (
                                                        <div className="space-y-1.5 pt-1">
                                                            {q.coding_evaluation.test_case_results.map((tcr, tIdx) => (
                                                                <div key={tIdx} className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] font-mono">
                                                                    <div className="flex items-center gap-2">
                                                                        {tcr.passed ? (
                                                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                                                        ) : (
                                                                            <XCircle className="h-3.5 w-3.5 text-rose-400" />
                                                                        )}
                                                                        <span className="text-slate-300">
                                                                            Test Case #{tcr.test_case_index} {tcr.is_hidden ? '(Hidden Evaluation)' : '(Sample)'}
                                                                        </span>
                                                                    </div>
                                                                    <span className={`font-bold text-[10px] ${tcr.passed ? "text-emerald-400" : "text-rose-400"}`}>
                                                                        {tcr.status}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Manual Feedback from Instructor for this specific question */}
                                            {q.manual_grade?.feedback && (
                                              <div className="p-4 bg-white/50 border-2 border-dashed border-indigo-100 rounded-2xl shadow-sm flex gap-3">
                                                 <Mic className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                                                 <div>
                                                    <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-1">Instructor Note</p>
                                                    <p className="text-xs font-bold text-slate-700 italic leading-relaxed">"{q.manual_grade.feedback}"</p>
                                                 </div>
                                              </div>
                                            )}

                                            {/* References Display */}
                                            {(!isCorrect || isPendingReview) && (
                                                <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                                                    <p className="text-[9px] font-black uppercase text-emerald-600 flex items-center gap-1 tracking-widest">
                                                        <CheckCircle2 className="h-3 w-3" /> Reference Standard
                                                    </p>
                                                    {q.type === 'coding' ? (
                                                        <pre className="p-4 bg-emerald-50 text-emerald-900 rounded-2xl text-[13px] font-mono overflow-auto max-h-64 whitespace-pre-wrap border border-emerald-100 shadow-sm italic">
                                                            {q.correct_answer || '// Logic reference not available'}
                                                        </pre>
                                                    ) : (
                                                        <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-900 font-bold text-sm opacity-70 italic leading-relaxed">
                                                            {q.correct_answer || q.options.find(o => o.is_correct)?.text || '(Review your course material for full explanation)'}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>
                    );
                })}
            </div>

            {/* Re-evaluation Section */}
            {!review.meta.is_reevaluation_requested && !isPending && (
              <div className="bg-slate-900 p-8 sm:p-12 rounded-[3.5rem] text-center space-y-6 shadow-2xl overflow-hidden relative group">
                  <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-full w-full bg-primary rounded-full blur-[100px]" />
                  </div>
                  <div className="relative z-10">
                      <div className="h-20 w-20 bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/20 group-hover:scale-110 transition-transform duration-500">
                          <HelpCircle className="h-10 w-10 text-white" />
                      </div>
                      <h3 className="text-3xl font-black text-white italic tracking-tight">Need a closer look?</h3>
                      <p className="text-slate-400 font-medium max-w-sm mx-auto text-lg leading-relaxed mb-8">If you believe there is a grading discrepancy, you can request a manual re-evaluation from your instructor.</p>
                      
                      {!showReevaluationForm ? (
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                          <Button 
                            className="bg-white hover:bg-slate-100 text-slate-900 rounded-2xl h-14 px-10 font-black text-xs uppercase tracking-widest py-4 shadow-xl"
                            onClick={() => setShowReevaluationForm(true)}
                          >
                            Request Re-evaluation
                          </Button>
                          <Button 
                            variant="outline" 
                            className="rounded-2xl h-14 px-10 border-white/20 font-black text-xs uppercase tracking-widest text-white hover:bg-white/10" 
                            onClick={onClose}
                          >
                            Dismiss Results
                          </Button>
                        </div>
                      ) : (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="max-w-md mx-auto space-y-4"
                        >
                           <Input 
                            placeholder="Reason for re-evaluation request..."
                            value={reevaluationReason}
                            onChange={(e) => setReevaluationReason(e.target.value)}
                            className="h-14 bg-white/10 border-white/20 text-white rounded-2xl px-6 focus:ring-primary"
                           />
                           <div className="flex gap-2">
                             <Button 
                                variant="ghost" 
                                className="h-12 flex-1 rounded-xl text-slate-400 hover:text-white"
                                onClick={() => setShowReevaluationForm(false)}
                             >
                               Cancel
                             </Button>
                             <Button 
                                disabled={isSubmittingReevaluation}
                                className="h-12 flex-1 bg-primary text-white rounded-xl font-bold shadow-lg"
                                onClick={handleRequestReevaluation}
                             >
                               {isSubmittingReevaluation ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                               Submit Request
                             </Button>
                           </div>
                        </motion.div>
                      )}
                  </div>
              </div>
            )}

            {review.meta.is_reevaluation_requested && (
              <div className="bg-emerald-500 p-10 rounded-[3rem] text-center text-white shadow-2xl relative overflow-hidden">
                 <div className="relative z-10 flex flex-col items-center">
                   <div className="h-16 w-16 bg-white/20 rounded-full flex items-center justify-center mb-4">
                     <Check className="h-8 w-8 text-white" />
                   </div>
                   <h3 className="text-2xl font-black italic tracking-tight mb-2">Re-evaluation Request Active</h3>
                   <p className="opacity-80 font-bold text-sm max-w-sm">We've notified your instructor. They will review your submission and provide an updated score within 24-48 hours.</p>
                 </div>
                 <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Clock className="h-32 w-32" />
                 </div>
              </div>
            )}
        </div>
    );
}
