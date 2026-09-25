import { useLocation, useNavigate } from "react-router-dom";
import { format } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { fetchWithAuth, API_URL } from '@/lib/api';
import { 
  Sparkles, 
  Users, 
  ArrowUpRight,
  BookOpen,
  Trophy,
  Clock,
  TrendingUp,
  Play,
  Calendar,
  FileText,
  Award,
  User,
  Video,
  ClipboardCheck,
  ClipboardList,
  History,
  Bell,
  Settings,
  Target,
  Medal,
  ChevronRight,
  Copy,
  MessageSquare,
  Folder,
  MonitorPlay,
  Cpu,
  Activity,
  CheckCircle,
  Fingerprint,
  CheckCircle2,
  Download,
  ArrowRight,
  Loader2,
  Upload,
  Star,
  Mail,
  X,
  Phone,
  QrCode,
  Hash,
  Ticket,
  Zap,
  Key
} from "lucide-react";
import { UserProfile } from "./UserProfile";
import { CourseList } from "./CourseList";
import { StudentCourseViewer } from "./StudentCourseViewer";
import { StudentHistory } from "./StudentHistory";
import StudentResources from "./StudentResources";
import StudentVideoLibrary from "./StudentVideoLibrary";
import { ExamModule } from "./ExamModule";
import { Notifications } from "./Notifications";
import { StudentSettings } from "./StudentSettings";
import { StudentResumeScan } from "./StudentResumeScan";
import { StudentBatchSelector } from "./StudentBatchSelector";
import { ChatInterface } from "../chat/ChatInterface";
import CertificationPage from "./CertificationPage";
import { StudentAttendance } from "./StudentAttendance";
import {
  StudentCourse,
  useStudentAnnouncements,
  useLeaderboard,
  useLiveClasses,
  useStudentStats,
  useEnrolledCourses,
  useEnrollCourse,
  useStudentDashboardData,
  Announcement,
  LeaderboardEntry,
  LiveClass,
  StudentStats,
  StudentDashboardData
} from "@/hooks/useStudentData";
import { useSocket } from "@/hooks/useSocket";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";

import { useToast } from "@/components/ui/use-toast";

// ─── Shared Components ────────────────────────────────────────────────────────

function CoursesTab() {
  const [viewingCourse, setViewingCourse] = useState<StudentCourse | null>(null);
  const [courseTab, setCourseTab] = useState<'enrolled' | 'available'>('enrolled');
  const { toast } = useToast();
  const enrollMutation = useEnrollCourse();

  // Payment Modal States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentCourse, setPaymentCourse] = useState<StudentCourse | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [appliedPrice, setAppliedPrice] = useState<number | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [utrNumber, setUtrNumber] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [paymentTerm, setPaymentTerm] = useState<'full' | 'term1' | 'term2'>('full');

  const getEffectivePrice = () => {
    return (appliedPrice !== null ? appliedPrice : (paymentCourse?.price || 0)) as number;
  };

  const term1Amount = Math.round(getEffectivePrice() * 0.6);
  const term2Amount = getEffectivePrice() - term1Amount;

  if (viewingCourse) {
    return (
      <StudentCourseViewer
        course={viewingCourse}
        isEnrolled={viewingCourse.enrollmentStatus === 'active'}
        onBack={() => setViewingCourse(null)}
      />
    );
  }

  const handleApplyCoupon = async () => {
    if (!couponCode) return;
    setIsValidating(true);
    try {
      const res = await fetchWithAuth('/coupons/validate', {
        method: 'POST',
        body: JSON.stringify({ code: couponCode })
      }) as { success: boolean; discounted_price: number };
      
      if (res.success) {
        setAppliedPrice(res.discounted_price);
        toast({
          title: "Coupon Applied! 🎁",
          description: `Price updated to ₹${res.discounted_price.toLocaleString('en-IN')}`,
          className: "bg-emerald-50 border-emerald-200"
        });
      }
    } catch (err) {
      toast({
        title: "Invalid Coupon",
        description: "This code is invalid or assigned to another user.",
        variant: "destructive"
      });
      setAppliedPrice(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handleEnroll = async (course: StudentCourse) => {
    // Instead of direct enrollment, open the payment modal
    setPaymentCourse(course);
    setCouponCode("");
    setAppliedPrice(null);
    setPaymentTerm('full');
    setShowPaymentModal(true);
  };

  const handleEnrollmentSubmit = async () => {
    if (!paymentCourse) return;
    
    setIsUploading(true);
    try {
      let paymentProofUrl = null;
      
      // 1. Upload payment proof if provided
      if (paymentProof) {
        const formData = new FormData();
        formData.append('file', paymentProof);
        
        const uploadRes = await fetchWithAuth('/upload', {
          method: 'POST',
          body: formData,
          headers: {} // File transfers shouldn't have content-type set manually
        }) as { url: string };
        
        paymentProofUrl = uploadRes?.url;
      }

      // 2. Submit Enrollment Request with the proof, UTR, and Coupon
      await enrollMutation.mutateAsync({ 
          courseId: paymentCourse.id, 
          payment_proof_url: paymentProofUrl,
          utr_number: utrNumber,
          coupon_code: appliedPrice ? couponCode : undefined,
          payment_term: paymentTerm
      });

      toast({
        title: "Enrollment Requested",
        description: `Enrollment for ${paymentCourse.title} submitted! Waiting for admin approval.`,
        className: "bg-amber-50 border-amber-200"
      });
      
      setShowPaymentModal(false);
      setPaymentProof(null);
      setUtrNumber('');
      setCourseTab('enrolled');
    } catch (err) {
      const error = err as Error;
      toast({
        title: "Enrollment Failed",
        description: error.message || "An error occurred during enrollment.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full space-y-8 h-full">
      {/* Payment Modal JSX */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="w-[95vw] sm:max-w-2xl p-0 overflow-hidden border-none shadow-2xl rounded-[2.5rem] bg-white h-auto max-h-[95vh] flex flex-col">
          <DialogHeader className="sr-only">
            <DialogTitle>Enrollment & Payment Protocol</DialogTitle>
            <DialogDescription>Verify credentials and submit payment proof for course activation.</DialogDescription>
          </DialogHeader>
          {/* Top Course Strip (Compact) */}
          {paymentCourse && (
            <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shrink-0">
               <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                    <img 
                      src={paymentCourse.thumbnail_url?.startsWith('http') ? paymentCourse.thumbnail_url : `${API_URL}/s3/public/${paymentCourse.thumbnail_url}`} 
                      alt="" 
                      className="h-full w-full object-cover" 
                    />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 leading-none">{paymentCourse.title}</h3>
                    <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-black">
                      {paymentTerm === 'term2' ? (
                        <span className="text-amber-600">Balance: ₹{term2Amount.toLocaleString('en-IN')}</span>
                      ) : (
                        <span className="text-slate-700">Total: ₹{getEffectivePrice().toLocaleString('en-IN')}</span>
                      )}
                    </p>
                  </div>
               </div>
               <Button 
                variant="ghost" 
                size="icon" 
                className="text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full h-8 w-8"
                onClick={() => setShowPaymentModal(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="p-8 sm:p-10 space-y-8 overflow-y-auto overflow-x-hidden custom-scrollbar">
            {/* Term Selection (Drastically Reduced Height) */}
            <div className="space-y-4">
               <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Select Payment Plan</div>
               <div className="grid grid-cols-2 gap-4">
                 {[ 
                   { id: 'full', label: 'Full', pct: 100, amount: getEffectivePrice() },
                   { id: 'term1', label: 'Term 1', pct: 60, amount: term1Amount },
                   { id: 'term2', label: 'Term 2', pct: 40, amount: term2Amount }
                 ].filter(plan => {
                   if (paymentCourse?.payment_term === 'term1') return plan.id === 'term2';
                   return plan.id === 'full' || plan.id === 'term1';
                 }).map((plan) => (
                    <button 
                      key={plan.id}
                      onClick={() => setPaymentTerm(plan.id as 'full' | 'term1' | 'term2')}
                      className={`p-4 rounded-2xl border-2 transition-all text-center flex flex-col items-center justify-center gap-1 ${paymentTerm === plan.id ? 'border-slate-900 bg-slate-900 text-white shadow-xl shadow-slate-200' : 'border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-900 font-bold'}`}
                    >
                      <div className={`text-[10px] font-black uppercase tracking-wider ${paymentTerm === plan.id ? 'text-slate-300' : 'text-slate-500'}`}>{plan.label} ({plan.pct}%)</div>
                      <div className="font-black text-lg">₹{plan.amount.toLocaleString('en-IN')}</div>
                    </button>
                 ))}
               </div>
            </div>

            {/* Payment Section (Horizontal Mix) */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 sm:gap-6 items-start">
               {/* QR Section */}
               <div className="col-span-1 sm:col-span-2 flex flex-col items-center gap-4">
                  <div className="relative w-full aspect-square max-w-[240px] mx-auto bg-white rounded-3xl p-4 border-2 border-slate-100 shadow-xl overflow-hidden group/qr">
                    <img src="/scanner.jpeg" alt="QR Code" className="w-full h-full object-contain rounded-xl group-hover:scale-110 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-slate-900/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Secure Scan Portal</span>
                  </div>
               </div>

               {/* Inputs Column (Compressed) */}
               <div className="col-span-1 sm:col-span-3 space-y-4">
                  {/* Coupon (Enhanced UX) */}
                  <div className="space-y-4">
                    <div className="flex gap-3 group">
                      <Input 
                        placeholder="COUPON CODE"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        disabled={appliedPrice !== null}
                        className="flex-1 h-12 rounded-xl border-none bg-slate-100 px-5 text-sm font-black tracking-widest placeholder:text-slate-300 focus-visible:ring-black transition-all"
                      />
                      <Button 
                        size="sm"
                        onClick={handleApplyCoupon}
                        disabled={!couponCode || isValidating || appliedPrice !== null}
                        className="h-12 px-8 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-slate-100 transition-all hover:scale-[1.02] active:scale-95 bg-slate-900 hover:bg-black text-white shrink-0"
                      >
                        {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                      </Button>
                    </div>
                  </div>

                  {/* UTR (Enhanced UX) */}
                  <div className="space-y-1.5">
                    <div className="relative group/utr">
                      <Input 
                        placeholder="12-DIGIT UTR NUMBER"
                        value={utrNumber}
                        onChange={(e) => setUtrNumber(e.target.value.replace(/\D/g, '').slice(0, 12))}
                        className="w-full h-12 rounded-xl border-none bg-slate-100 px-5 pr-10 text-sm font-black tracking-widest placeholder:text-slate-300 focus-visible:ring-black transition-all"
                      />
                      <Hash className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within/utr:text-black transition-colors" />
                    </div>
                  </div>

                  {/* Upload (Enhanced UX) */}
                  <div 
                    className={`h-12 flex items-center justify-center gap-3 border-2 border-dashed rounded-xl cursor-pointer transition-all ${paymentProof ? 'border-slate-900 bg-slate-900 text-white shadow-xl' : 'border-slate-200 hover:bg-slate-100'}`}
                    onClick={() => document.getElementById('payment-proof')?.click()}
                  >
                    <Upload className={`h-4 w-4 ${paymentProof ? 'text-white' : 'text-slate-400'}`} />
                    <span className={`text-[10px] font-black uppercase tracking-widest truncate max-w-[150px] ${paymentProof ? 'text-white' : 'text-slate-500'}`}>
                      {paymentProof ? paymentProof.name : 'Upload Payment Image'}
                    </span>
                    <input id="payment-proof" type="file" className="hidden" accept="image/*" onChange={(e) => setPaymentProof(e.target.files?.[0] || null)} />
                  </div>
               </div>
            </div>

            {/* Action Bar (Low Height) */}
            <div className="pt-6 sm:pt-8 border-t border-slate-100 flex items-center justify-between gap-6 pb-2">
              <div className="flex-1">
                 <p className="text-[10px] text-slate-400 font-bold leading-relaxed max-w-[280px]">By clicking enroll, you agree to our terms. Manual approval usually takes <span className="text-slate-900">2-4 hours</span>.</p>
              </div>
              <Button
                  size="lg"
                  className="h-14 px-12 rounded-[1.25rem] font-black uppercase tracking-[0.1em] text-[12px] shadow-2xl shadow-slate-200 bg-slate-900 hover:bg-black text-white transition-all hover:scale-[1.02] active:scale-95 shrink-0"
                  disabled={isUploading || !paymentProof || utrNumber.length !== 12}
                  onClick={handleEnrollmentSubmit}
              >
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Enrollment'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Tabs value={courseTab} onValueChange={(v) => setCourseTab(v as 'enrolled' | 'available')} className="w-full sm:w-auto">
          <TabsList className="bg-slate-100/50 p-1 rounded-xl">
            <TabsTrigger value="enrolled" className="rounded-lg px-6 py-2">My Courses</TabsTrigger>
            <TabsTrigger value="available" className="rounded-lg px-6 py-2">Course Catalog</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="h-full">
        {courseTab === 'enrolled' ? (
          <CourseList
            type="enrolled"
            onSelectCourse={(c) => {
              if (c.enrollmentStatus === 'pending') {
                toast({
                  title: "Enrollment Pending",
                  description: "Admin approval required for full access.",
                  variant: "default"
                });
                return;
              }
              if (c.enrollmentStatus === 'rejected') {
                toast({
                  title: "Enrollment Rejected",
                  description: "Your enrollment for this course was rejected.",
                  variant: "destructive"
                });
                return;
              }

              // Check for Term 2 Payment if active but has balance
              if (c.enrollmentStatus === 'active' && c.remaining_balance > 0) {
                 toast({
                   title: "Balance Dues Found",
                   description: "Opening payment gateway for your remaining balance.",
                   className: "bg-amber-50 border-amber-200"
                 });
                 setPaymentCourse(c);
                 setPaymentTerm('term2');
                 setCouponCode("");
                 setAppliedPrice(null);
                 setShowPaymentModal(true);
                 return;
              }
              
              setViewingCourse(c);
            }}
          />
        ) : (
          <CourseList
            type="available"
            onSelectCourse={handleEnroll}
          />
        )}
      </div>
    </div>
  );
}

function AnnouncementsSection() {
  const { data: announcements, isLoading } = useStudentAnnouncements();

  return (
    <Card className="pro-card border-none shadow-md overflow-hidden bg-white">
      <CardHeader className="pb-4 border-b border-slate-100 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <Bell className="h-5 w-5 text-accent animate-pulse" />
          Campus Announcements
        </CardTitle>
        {announcements && announcements.length > 0 && (
          <Badge className="bg-accent/10 text-accent hover:bg-accent/20 border-none font-bold px-2 py-0.5 shadow-none">
            {announcements.length} New
          </Badge>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[320px]">
          {isLoading ? (
            <div className="p-5 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="h-4 w-2/3 rounded-full" />
                  <Skeleton className="h-3 w-full rounded-full" />
                </div>
              ))}
            </div>
          ) : !announcements || announcements.length === 0 ? (
            <div className="p-10 text-center flex flex-col items-center justify-center h-full">
              <div className="h-12 w-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                 <Bell className="h-5 w-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">You're all caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {announcements.map((item: Announcement) => (
                <div
                  key={item.id}
                  className="p-5 hover:bg-slate-50 transition-colors cursor-default border-l-2 border-transparent hover:border-accent"
                >
                  <div className="flex justify-between items-start mb-2 gap-4">
                    <h4 className="font-bold text-sm text-slate-900 leading-tight">
                      {item.title}
                    </h4>
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md shrink-0">
                      {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed font-medium">
                    {item.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function LeaderboardTab() {
  const { data: board, isLoading } = useLeaderboard();

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2 mb-8">
         <Badge className="bg-accent/10 text-accent hover:bg-accent/20 border-none mb-4 tracking-widest uppercase font-bold text-[10px] px-3 py-1">Global Rankings</Badge>
         <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">Top Scholars</h2>
         <p className="text-slate-600 font-medium">Inspiring excellence across the academy network.</p>
      </div>

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-4 md:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative z-10 space-y-4">
          {isLoading ? (
            [1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))
          ) : !board || board.length === 0 ? (
            <div className="text-center py-16">
              <Trophy className="h-12 w-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-600 font-medium text-lg">Rankings are hidden until exams begin.</p>
            </div>
          ) : (
            board.map((user_entry: LeaderboardEntry, idx: number) => {
              const userData = typeof user_entry.user_id === 'object' ? user_entry.user_id : { id: user_entry.user_id, full_name: `Scholar ${user_entry.user_id.slice(0,6).toUpperCase()}`, avatar_url: '' };
              const displayName = userData.full_name || `Scholar ${userData.id.slice(0,6).toUpperCase()}`;
              const avatarUrl = userData.avatar_url ? (userData.avatar_url.startsWith('http') ? userData.avatar_url : `${API_URL}/s3/public/${userData.avatar_url}`) : `https://api.dicebear.com/9.x/avataaars/svg?seed=${userData.id}`;

              return (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.1 }}
                key={user_entry.id}
                className={`flex items-center gap-4 md:gap-6 p-4 md:p-6 rounded-2xl transition-all duration-300 hover:shadow-md border ${
                  idx === 0 
                    ? "bg-gradient-to-r from-accent/10 to-transparent border-accent/20 shadow-sm" 
                    : idx === 1 
                      ? "bg-gradient-to-r from-slate-100 to-transparent border-slate-200"
                      : idx === 2
                        ? "bg-gradient-to-r from-orange-50 to-transparent border-orange-100"
                        : "bg-white border-slate-100 hover:border-primary/20"
                }`}
              >
                <div className="flex shrink-0 w-8 justify-center">
                  {idx === 0 ? <Trophy className="h-6 w-6 text-accent" /> : 
                   idx < 3 ? <Medal className={`h-6 w-6 ${idx === 1 ? 'text-slate-500' : 'text-orange-400'}`} /> :
                   <span className="font-bold text-slate-500 text-lg">#{idx + 1}</span>}
                </div>
                
                <Avatar className={`h-12 w-12 md:h-14 md:w-14 border-[3px] shadow-sm ${idx === 0 ? 'border-accent' : 'border-white'}`}>
                  <AvatarImage src={avatarUrl} />
                  <AvatarFallback className="bg-primary/10 text-primary font-bold">
                    {displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 text-base md:text-lg truncate">
                    {displayName}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                     <Badge variant="secondary" className="bg-slate-100 hover:bg-slate-200 text-slate-600 border-none font-semibold text-[10px]">
                        {user_entry.exams_completed || 0} Exams
                     </Badge>
                  </div>
                </div>
                
                <div className="text-right shrink-0">
                  <p className={`font-black tracking-tight text-xl md:text-3xl ${idx === 0 ? 'text-accent' : 'text-primary'}`}>
                    {user_entry.total_score}
                  </p>
                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mt-0.5">
                    Credits
                  </p>
                </div>
              </motion.div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function LiveClassesTab() {
  const { data: classes, isLoading } = useLiveClasses();
  const { data: enrolledCourses } = useEnrolledCourses();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleCopyPassword = (e: React.MouseEvent, password?: string) => {
    e.stopPropagation();
    if (!password) return;
    navigator.clipboard.writeText(password);
    toast({
      title: "Password Copied",
      description: "Meeting passcode copied to clipboard.",
      className: "bg-blue-50 border-blue-200"
    });
  };

  const enrolledIds = new Set(enrolledCourses?.map(c => c.id?.toString()) || []);
  const filteredClasses = classes?.filter(c => {
    // If no course is associated, it's a general/public meeting
    if (!c.course_id) return true;
    
    // If course is associated, verify the student is enrolled in it
    const courseObj = c.course_id as unknown as { _id?: string, id?: string } | string;
    const courseId = typeof courseObj === 'object' && courseObj !== null ? (courseObj._id || courseObj.id) : courseObj;
    return enrolledIds.has(courseId?.toString() || '');
  }) || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
       <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Virtual Classrooms</h2>
            <p className="text-slate-600 font-medium">Join scheduled interactive sessions with your instructors.</p>
          </div>
       </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-[280px] rounded-2xl" />)
        ) : filteredClasses.length === 0 ? (
          <div className="col-span-full py-24 text-center bg-white rounded-3xl border border-dashed border-slate-200 flex flex-col items-center">
            <div className="h-16 w-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
               <Video className="h-8 w-8 text-primary/40" />
            </div>
            <h3 className="text-xl font-bold text-slate-800">No Upcoming Sessions</h3>
            <p className="text-base font-medium text-slate-600 mt-2 max-w-sm">
              Either there are no scheduled sessions or you aren't enrolled in their courses yet.
            </p>
          </div>
        ) : (
          filteredClasses.map((session: LiveClass) => (
             <Card
              key={session.id}
              className="group overflow-hidden border-none bg-white rounded-3xl shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.12)] transition-all duration-500 flex flex-col h-full border border-slate-100"
            >
              <div className="w-full aspect-video relative overflow-hidden">
                {session.poster_url ? (
                  <img 
                    src={session.poster_url} 
                    alt={session.title} 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                  />
                ) : (
                  <div className="w-full h-full bg-[#0F172A] flex items-center justify-center relative overflow-hidden">
                     {/* Decorative Mesh */}
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 0.5px, transparent 0)', backgroundSize: '12px 12px' }} />
                    <Video className="w-12 h-12 text-white/10" />
                  </div>
                )}
                
                {/* Status Badges Overlay */}
                <div className="absolute top-3 left-3 z-20">
                  {new Date(session.scheduled_at) <= new Date() && 
                   new Date() <= new Date(new Date(session.scheduled_at).getTime() + (session.duration_minutes || 60) * 60000) && (
                    <Badge className="bg-red-500 text-white border-none animate-pulse font-bold text-[10px] px-2 py-0.5 rounded-lg shadow-xl">
                      LIVE
                    </Badge>
                  )}
                </div>

                <div className="absolute bottom-3 left-3 right-3 z-30 flex items-center gap-2">
                    <div className="bg-black/50 backdrop-blur-md text-white text-[9px] font-bold px-3 py-1.5 rounded-xl border border-white/10 uppercase tracking-wider">
                        {session.duration_minutes || 60} Min
                    </div>
                    <div className="bg-primary text-white text-[9px] font-bold px-3 py-1.5 rounded-xl uppercase tracking-wider shadow-lg">
                        {session.status.toUpperCase()}
                    </div>
                </div>
                
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60" />
              </div>

              <CardContent className="pt-4 pb-2 px-5 flex-grow space-y-3">
                <h3 className="text-lg font-bold text-[#0075CF] leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                  {session.title}
                </h3>
                <p className="text-slate-500 text-[13px] line-clamp-2 leading-relaxed font-medium min-h-[38px]">
                  {session.description || "Join this interactive live session to master core concepts."}
                </p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 pb-1">
                    <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-bold">
                        <Calendar className="w-3.5 h-3.5 text-primary/60" />
                        {format(new Date(session.scheduled_at), 'MMM dd, yyyy')}
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-bold">
                        <Clock className="w-3.5 h-3.5 text-primary/60" />
                        {format(new Date(session.scheduled_at), 'hh:mm a')}
                    </div>
                    {session.meeting_password && (
                        <div className="flex items-center gap-2 text-[#0075CF] text-sm font-black bg-[#0075CF]/5 px-3 py-1.5 rounded-xl border border-[#0075CF]/10 shadow-sm">
                            <Key className="w-4 h-4" />
                            <span className="font-mono tracking-widest">{session.meeting_password}</span>
                        </div>
                    )}
                </div>
                
                <div className="pt-2 border-t border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-emerald-600">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Enrolled</span>
                    </div>
                    
                    <button 
                        onClick={() => session.meeting_id && navigate(`/live/${session.meeting_id}?role=0&pwd=${session.meeting_password || ''}`)}
                        className="flex items-center gap-1 text-[#0075CF] font-bold text-xs hover:gap-2 transition-all group/btn"
                    >
                        Join Now <ChevronRight className="w-3 h-3 transition-transform group-hover/btn:translate-x-0.5" />
                    </button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard Home ──────────────────────────────────────────────────────

import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

const dummyActivityData = [
  { name: 'Mon', minutes: 120 },
  { name: 'Tue', minutes: 80 },
  { name: 'Wed', minutes: 210 },
  { name: 'Thu', minutes: 160 },
  { name: 'Fri', minutes: 190 },
  { name: 'Sat', minutes: 240 },
  { name: 'Sun', minutes: 150 },
];

function AttendancePulse() {
  const [loading, setLoading] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Check if already checked in today
    const checkStatus = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const res = await fetchWithAuth(`/data/attendance?date=${today}`) as unknown[];
        if (res && res.length > 0) {
          setCheckedIn(true);
        }
      } catch (e) {
        console.error("Attendance check failed", e);
      } finally {
        setChecking(false);
      }
    };
    checkStatus();
  }, []);

  const handleMark = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/student/mark-attendance', {
        method: 'POST'
      }) as { success: boolean, message: string, suspended?: boolean };

      if (res.success) {
        setCheckedIn(true);
        toast({
          title: "Attendance Marked! 👋",
          description: res.message,
          className: "bg-slate-900 text-white border-slate-800"
        });
        if (res.suspended) {
          setTimeout(() => window.location.reload(), 3000);
        }
      }
    } catch (err: unknown) {
      toast({
        title: "Already Recorded",
        description: "Your attendance for today is already secured.",
        variant: "default"
      });
      setCheckedIn(true);
    } finally {
      setLoading(false);
    }
  };

  if (checking) return <Skeleton className="h-12 w-40 rounded-full" />;

  return (
    <div className="relative group">
       <AnimatePresence mode="wait">
         {checkedIn ? (
           <motion.div 
             key="checked"
             initial={{ scale: 0.8, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             className="h-12 px-6 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center gap-2 font-black text-[10px] uppercase tracking-tighter shadow-sm"
           >
             <CheckCircle2 className="h-4 w-4" />
             Attendance Secured
           </motion.div>
         ) : (
           <motion.button
             key="mark"
             whileHover={{ scale: 1.02 }}
             whileTap={{ scale: 0.98 }}
             onClick={handleMark}
             disabled={loading}
             className="relative h-12 px-8 rounded-full bg-slate-900 text-white font-black uppercase tracking-widest text-[11px] shadow-xl hover:shadow-primary/20 transition-all flex items-center gap-3 overflow-hidden"
           >
             {loading ? (
               <Loader2 className="h-4 w-4 animate-spin" />
             ) : (
               <>
                 <div className="relative h-5 w-5">
                    <Fingerprint className="h-5 w-5 text-emerald-400 absolute inset-0" />
                    <motion.div 
                      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="absolute inset-0 bg-emerald-400 rounded-full blur-md"
                    />
                 </div>
                 Mark Attendance
               </>
             )}
             
             {/* Scanner Wave Animation */}
             {!loading && (
               <motion.div 
                 className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent w-full"
                 animate={{ x: ['-200%', '200%'] }}
                 transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
               />
             )}
           </motion.button>
         )}
       </AnimatePresence>
    </div>
  );
}

function LiveSessionBanner() {
  const { data: classes, isLoading } = useLiveClasses();
  const navigate = useNavigate();

  // Find if anything is truly live right now
  const liveSession = classes?.find(c => {
    const start = new Date(c.scheduled_at).getTime();
    const now = new Date().getTime();
    const end = start + (c.duration_minutes || 60) * 60000;
    return now >= start && now <= end;
  });

  if (isLoading || !liveSession) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8 p-6 bg-gradient-to-r from-red-600 to-rose-700 rounded-[2rem] text-white shadow-2xl shadow-red-500/20 flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden group"
    >
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-110 transition-transform duration-1000" />
      
      <div className="flex items-center gap-5 relative z-10">
        <div className="h-16 w-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20">
          <div className="relative">
             <Video className="h-8 w-8 text-white" />
             <div className="absolute -top-1 -right-1 h-3 w-3 bg-white rounded-full animate-ping" />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-white text-red-600 border-none font-black text-[10px] px-2 py-0.5 rounded-md animate-pulse">LIVE NOW</Badge>
            <span className="text-white/80 text-[10px] font-bold uppercase tracking-[0.2em]">Interactive Class</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black tracking-tight">{liveSession.title}</h3>
          <p className="text-white/70 text-sm font-medium">Your instructor is broadcasting live. Join the conversation!</p>
        </div>
      </div>

      <Button
        onClick={() => navigate(`/live/${liveSession.meeting_id}?role=0&pwd=${liveSession.meeting_password || ''}`)}
        className="bg-white text-red-600 hover:bg-slate-100 font-black px-8 h-14 rounded-2xl shadow-xl hover:shadow-white/20 transition-all gap-3 relative z-10 group/btn"
      >
        <span>ENTER BROADCAST</span>
        <ArrowRight className="h-5 w-5 transition-transform group-hover/btn:translate-x-1" />
      </Button>
    </motion.div>
  );
}

function DashboardHome({ basePath = "/student-dashboard" }: { basePath?: string } = {}) {
  const { data: stats } = useStudentStats();
  const { data: enrolledCourses } = useEnrolledCourses();
  const { data: dashboardData } = useStudentDashboardData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const latestCourse = enrolledCourses?.[0];

  const activityData = dashboardData?.activity?.map(d => ({ name: d.name, minutes: d.intensity })) || dummyActivityData; // Use intensity as minutes
  const recentResources = dashboardData?.resources || [];
  const realSkills = dashboardData?.skills?.map(s => ({ name: s.name, level: s.progress, category: 'General' })) || [];

  // Derive real-time stats
  const completedCoursesCount = enrolledCourses?.filter(c => c.progress >= 100).length || 0;
  const totalMinutesSpent = dashboardData?.activity?.reduce((sum, day) => sum + (day.intensity || 0), 0) || 0;
  const watchHours = Math.floor(totalMinutesSpent / 60) || 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <LiveSessionBanner />
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 py-4">
        <div>
          <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-none mb-3 tracking-widest uppercase font-bold text-[10px] px-3 py-1">Student Portal</Badge>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
            Welcome back, <span className="text-primary italic">{user?.full_name?.split(" ")[0] || user?.user_metadata?.full_name?.split(" ")[0] || "Student"}</span>.
          </h1>
          <p className="text-slate-600 font-medium mt-2 text-base md:text-lg">
            Elevate your skills and track your learning journey.
          </p>
        </div>
        <div className="hidden md:flex gap-3">
           <AttendancePulse />
        </div>
      </div>

      {/* KPI Cards - Modified per user request */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { title: "Active Enrollments", value: enrolledCourses?.length || 0, icon: BookOpen, color: "blue", desc: "Ongoing courses" },
          { title: "Academic Credits", value: stats?.total_score || 0, icon: Trophy, color: "orange", desc: "Global ranking points" },
          { title: "Exams Attempted", value: dashboardData?.results?.length || 0, icon: ClipboardCheck, color: "blue", desc: "Recent mock tests" },
        ].map((kpi, i) => (
          <motion.div
            key={kpi.title}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className="pro-card group cursor-default p-6"
          >
            <div className="flex items-center gap-4">
              <div className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all group-hover:rotate-12 ${kpi.color === 'blue' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'}`}>
                <kpi.icon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{kpi.title}</p>
                <div className="flex items-baseline gap-2">
                   <span className="text-2xl font-black text-slate-900">{kpi.value}</span>
                   <span className="text-[10px] font-bold text-slate-400">{kpi.desc}</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Continue Learning & Stats - Spans 2 cols */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main Content: Continue Learning */}
          <Card className="pro-card border-none shadow-xl shadow-slate-200/50 overflow-hidden">
            <div className="p-6 md:p-8 bg-white text-slate-900 relative">
               <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
                 <Cpu className="h-32 w-32 text-primary" />
               </div>
               
               {!latestCourse ? (
                <div className="relative z-10 py-4 flex flex-col items-center justify-center text-center">
                  <Badge className="bg-primary/10 text-primary border-primary/20 mb-4 px-4 py-1 font-black">New Opportunity</Badge>
                  <h3 className="text-2xl font-black mb-4 text-slate-900 tracking-tight">Start Your Learning Journey</h3>
                  <p className="text-slate-500 max-w-md mb-8 font-medium italic">
                    Discover professional courses curated by industry experts.
                  </p>
                  <Button className="bg-slate-900 text-white hover:bg-primary h-12 px-8 font-black rounded-full shadow-xl shadow-slate-900/10" asChild>
                    <a href={`${basePath}/courses`}>View Catalog</a>
                  </Button>
                </div>
              ) : (
                <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center">
                  <div className="w-full md:w-56 aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl shadow-slate-200/50 border-2 border-slate-50">
                    <img
                      src={latestCourse.thumbnail_url?.startsWith("http") ? latestCourse.thumbnail_url : `${API_URL}/s3/public/${latestCourse.thumbnail_url}`}
                      alt={latestCourse.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=2070&auto=format&fit=crop"; }}
                    />
                  </div>
                  
                  <div className="flex-1 space-y-5">
                    <div className="flex items-center gap-2 mb-2">
                       <span className="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
                       <span className="text-[11px] font-black text-primary uppercase tracking-[0.4em]">Currently Playing</span>
                    </div>
                    <h2 className="text-2xl md:text-4xl font-black leading-tight tracking-tighter text-slate-900">
                      {latestCourse.title}
                    </h2>
                    
                    <div className="space-y-3">
                       <div className="flex justify-between items-end">
                         <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest leading-none">Overall Program Progress</span>
                         <span className="text-2xl font-black text-slate-900 tracking-tighter italic">{latestCourse.progress}%</span>
                       </div>
                       <Progress value={latestCourse.progress} className="h-3 bg-slate-100 rounded-full [&>div]:bg-primary shadow-inner" />
                    </div>

                    <Button className="bg-slate-900 text-white hover:bg-black hover:scale-105 transition-all h-14 px-10 font-black italic tracking-tighter rounded-2xl mt-4 shadow-[0_20px_40px_rgba(0,0,0,0.1)] flex items-center gap-3" asChild>
                      <a href={`${basePath}/courses?courseId=${latestCourse.id}`}>
                        RESUME LESSON <ArrowRight className="h-5 w-5" />
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Learning Activity Chart - New Feature */}
          <Card className="pro-card border-none shadow-xl shadow-slate-200/20 overflow-hidden">
            <CardHeader className="pb-2">
               <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-black text-slate-900">Learning Intensity</CardTitle>
                    <CardDescription className="font-medium">Your weekly effort across all modules</CardDescription>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Activity className="h-5 w-5" />
                  </div>
               </div>
            </CardHeader>
            <CardContent>
               <div className="h-[200px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activityData}>
                      <defs>
                        <linearGradient id="colorMin" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1e293b" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#1e293b" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                      <YAxis hide />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        itemStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                      />
                      <Area type="monotone" dataKey="minutes" stroke="#1e293b" strokeWidth={3} fillOpacity={1} fill="url(#colorMin)" />
                    </AreaChart>
                  </ResponsiveContainer>
               </div>
            </CardContent>
          </Card>

          {/* Row of stats and activity removed as requested */}
        </div>

        {/* Right Sidebar - Spans 1 col */}
        <div className="lg:col-span-1 space-y-6">
          {/* Quick Access Documents - Real Data */}
          <Card className="pro-card border-none shadow-xl shadow-slate-200/20">
            <CardHeader className="pb-4">
               <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Resource Library
               </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
               {recentResources.length === 0 ? (
                 <div className="py-8 text-center text-xs text-slate-400 font-medium italic">No recent materials</div>
               ) : (
                 recentResources.map((res, i: number) => (
                   <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-slate-50 hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => res.view_url && window.open(res.view_url, '_blank')}>
                      <div className="flex items-center gap-3">
                         <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black group-hover:bg-slate-900 group-hover:text-white transition-all uppercase">
                           {res.upload_format || res.file_url?.split('.').pop() || 'PDF'}
                         </div>
                         <span className="text-sm font-bold text-slate-700 line-clamp-1">{res.asset_title || 'Material'}</span>
                      </div>
                      <Download className="h-4 w-4 text-slate-400 group-hover:text-slate-900" />
                   </div>
                 ))
               )}
               <Button variant="ghost" className="w-full text-primary font-bold text-xs" onClick={() => window.location.href=basePath+'/resources'}>
                 View All Materials
               </Button>
            </CardContent>
          </Card>

          {/* Recent Performance - New Feature */}
          <Card className="pro-card border-none shadow-xl shadow-slate-200/20">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                Recent Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {dashboardData?.results?.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 font-medium italic">No recent test attempts</div>
              ) : (
                dashboardData?.results?.map((res, i: number) => (
                  <div key={i} className="flex flex-col gap-2 p-3 rounded-2xl bg-slate-50/50 border border-slate-100 group hover:border-primary/20 transition-all">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-900 line-clamp-1 uppercase tracking-tighter">{res.title}</p>
                        <p className="text-[10px] font-bold text-slate-400 italic">Performed on {new Date(res.date).toLocaleDateString()}</p>
                      </div>
                      <Badge className={`h-6 text-[10px] font-black italic rounded-lg shadow-inner ${res.percentage >= 70 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                        {res.percentage}%
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                       <div className="flex-1 h-1.5 bg-white rounded-full overflow-hidden border border-slate-100 shadow-inner">
                         <div className={`h-full ${res.percentage >= 70 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${res.percentage}%` }}></div>
                       </div>
                       <span className="text-[10px] font-black text-slate-600 whitespace-nowrap">{res.score}/{res.total} PTS</span>
                    </div>
                  </div>
                ))
              )}
              <Button variant="ghost" className="w-full text-slate-500 font-bold text-xs hover:text-primary" onClick={() => navigate(basePath+'/history')}>
                Review Exam History
              </Button>
            </CardContent>
          </Card>

          {/* Announcements removed per user request */}

          {/* Student Support Section - New Feature */}
          <Card className="bg-primary text-white p-6 rounded-3xl relative overflow-hidden group">
             <div className="absolute -bottom-4 -right-4 h-24 w-24 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-1000"></div>
             <h4 className="text-lg font-black mb-1">Need Help?</h4>
             <p className="text-white/80 text-xs font-medium mb-4">Chat with our senior instructors anytime</p>
             <Button className="w-full bg-white text-primary hover:bg-slate-100 font-bold rounded-xl h-10 shadow-lg" onClick={() => window.location.href=basePath+'/chat'}>
               Open Career Support
             </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Routing Map ──────────────────────────────────────────────────────────────

const routeConfig: Record<string, { title: string; description: string; icon: React.ComponentType<{ className?: string }>; component?: React.ReactNode; }> = {
  "/student-dashboard/profile": {
    title: "Student Profile",
    description: "Manage your credentials and portfolio",
    icon: User,
    component: <UserProfile />,
  },
  "/student-dashboard/resume-ats": {
    title: "Resume ATS Scan",
    description: "Analyze your resume with AI to improve your job prospects",
    icon: Zap,
    component: <StudentResumeScan />,
  },
  "/student-dashboard/courses": {
    title: "Learning Library",
    description: "Access your enrolled courses and training materials",
    icon: BookOpen,
    component: <CoursesTab />,
  },
  "/student-dashboard/live-classes": {
    title: "Virtual Campus",
    description: "Join scheduled interactive sessions with instructors",
    icon: Video,
    component: <LiveClassesTab />,
  },
  "/student-dashboard/videos": {
    title: "Video Library",
    description: "Browse and watch video lessons from your enrolled courses",
    icon: MonitorPlay,
    component: <StudentVideoLibrary />,
  },
  "/student-dashboard/resources": {
    title: "Course Resources",
    description: "Download study materials and reference documents",
    icon: Folder,
    component: <StudentResources />,
  },
  "/student-dashboard/mock-papers": {
    title: "Simulation Lab",
    description: "Practice with timed mock examinations",
    icon: FileText,
    component: <ExamModule type="mock" />,
  },
  "/student-dashboard/history": {
    title: "Academic Record",
    description: "Review your past performance and transcripts",
    icon: History,
    component: <StudentHistory />,
  },
  "/student-dashboard/attendance": {
    title: "My Attendance",
    description: "Track and review your daily attendance records",
    icon: ClipboardList,
    component: <StudentAttendance />,
  },
  "/student-dashboard/notifications": {
    title: "Communications",
    description: "Important updates from the academy",
    icon: Bell,
    component: <Notifications />,
  },
  "/student-dashboard/chat": {
    title: "Messages",
    description: "Chat with your instructors and peers",
    icon: MessageSquare,
    component: <ChatInterface />,
  },
  "/student-dashboard/settings": {
    title: "Preferences",
    description: "Configure your digital learning environment",
    icon: Settings,
    component: <StudentSettings />,
  },
  "/student-dashboard/certification": {
    title: "Certification",
    description: "Download your official course completion certificates",
    icon: Award,
    component: <CertificationPage />,
  },
};

import { RatingModal } from "./RatingModal";

export function DashboardContent({ basePath = "/student-dashboard" }: { basePath?: string } = {}) {
  const location = useLocation();
  const rawPath = location.pathname;
  // Normalize intern-dashboard paths to student-dashboard for route matching
  const currentPath = rawPath.startsWith(basePath) && basePath !== "/student-dashboard"
    ? rawPath.replace(basePath, "/student-dashboard")
    : rawPath;
  const navigate = useNavigate();
  const _navigateTo = (path: string) => navigate(path.replace("/student-dashboard", basePath));
  const queryClient = useQueryClient();
  const { socket } = useSocket();
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [selectedCourseForRating, setSelectedCourseForRating] = useState({ id: '', title: '' });

  useEffect(() => {
    if (!socket) return;

    const handleProgressUpdate = () => {
      console.log('[Socket-Student] Progress changed, invalidating student queries...');
      queryClient.invalidateQueries({ queryKey: ['enrolled-courses-details'] });
      queryClient.invalidateQueries({ queryKey: ['student-stats'] });
    };

    socket.on('progress_updated', handleProgressUpdate);
    
    return () => {
      socket.off('progress_updated', handleProgressUpdate);
    };
  }, [socket, queryClient]);

  const INTERN_HIDDEN_ROUTES = ["/student-dashboard/resume-ats"];
  const isIntern = basePath !== "/student-dashboard";

  if (currentPath === "/student-dashboard" || currentPath === "/student-dashboard/") {
    return <DashboardHome basePath={basePath} />;
  }

  const config = (isIntern && INTERN_HIDDEN_ROUTES.includes(currentPath)) ? undefined : routeConfig[currentPath];

  if (config) {
    if (config.component) {
      return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
          <RatingModal 
            isOpen={ratingModalOpen} 
            onClose={() => setRatingModalOpen(false)}
            courseId={selectedCourseForRating.id}
            courseTitle={selectedCourseForRating.title}
          />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-200 pb-6 sm:pb-8">
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="h-14 w-14 sm:h-20 sm:w-20 rounded-2xl sm:rounded-3xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/10">
                <config.icon className="h-7 w-7 sm:h-10 sm:w-10 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
                  {config.title}
                </h1>
                <p className="text-xs sm:text-base font-bold text-slate-500 mt-1 line-clamp-1 italic max-w-md">{config.description}</p>
              </div>
            </div>
            
            <div className="lg:ml-auto flex flex-col lg:flex-row items-stretch lg:items-center gap-3 w-full lg:w-auto min-w-0">
              {currentPath === "/student-dashboard/courses" && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto min-w-0">
                    <StudentBatchSelector />
                </div>
              )}

              {currentPath === "/student-dashboard/notifications" && (
                <Button 
                  onClick={() => _navigateTo("/student-dashboard/courses")}
                  className="bg-primary text-white font-bold rounded-xl px-6 h-12 shadow-lg shadow-primary/20 hover:shadow-xl transition-all gap-2"
                >
                  <BookOpen className="h-4 w-4" />
                  View Course Catalog
                </Button>
              )}
            </div>
          </div>
          <div className="w-full">
            {config.component}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 border-b border-slate-200 pb-6">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/10">
            <config.icon className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
              {config.title}
            </h1>
            <p className="text-base font-medium text-slate-600 mt-1">{config.description}</p>
          </div>
        </div>
        
        <Card className="pro-card border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
              <config.icon className="h-10 w-10 text-slate-400" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">
              Feature in Development
            </h3>
            <p className="text-base font-medium text-slate-600 max-w-md">
              The engineering team is currently upgrading this section. It will be available shortly.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <DashboardHome />;
}