import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Users, Search, Filter, Download, Mail, MoreHorizontal, 
  BookOpen, Clock, CheckCircle2, AlertTriangle, PlayCircle,
  TrendingUp, TrendingDown, UserPlus, UserMinus, Activity,
  Eye, FileText, ChevronRight, RefreshCw, Bell, Loader2,
  Phone, Play, Upload, Link as LinkIcon, Image as ImageIcon, AlertCircle, User, Zap,
  Sun, CloudSun, Moon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel, SelectSeparator
} from '@/components/ui/select';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel 
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { 
  useInstructorAllStudents, 
  useInstructorStudentStats, 
  useInstructorCourses,
  useStudentVideoProgress,
  useVideos,
  useSendReminder,
  type InstructorStudent,
  type Course,
  type CourseVideo,
  type VideoProgressDetail
} from '@/hooks/useInstructorData';

interface RecentActivity {
  id: string;
  studentId: string;
  studentName: string;
  action: 'started' | 'completed' | 'watching' | 'enrolled' | 'dropped';
  courseName: string;
  timestamp: string;
  details?: string;
}

const getStatusConfig = (status: InstructorStudent['status']) => {
  switch (status) {
    case 'active':
      return { color: 'bg-green-500', text: 'text-green-500', label: 'Active', bg: 'bg-green-500/10' };
    case 'completed':
      return { color: 'bg-blue-500', text: 'text-blue-500', label: 'Completed', bg: 'bg-blue-500/10' };
    case 'at-risk':
      return { color: 'bg-amber-500', text: 'text-amber-500', label: 'At Risk', bg: 'bg-amber-500/10' };
    case 'inactive':
      return { color: 'bg-gray-500', text: 'text-gray-500', label: 'Inactive', bg: 'bg-gray-500/10' };
  }
};

const getActivityIcon = (action: RecentActivity['action']) => {
  switch (action) {
    case 'started': return <UserPlus className="w-4 h-4 text-green-500" />;
    case 'completed': return <CheckCircle2 className="w-4 h-4 text-blue-500" />;
    case 'watching': return <PlayCircle className="w-4 h-4 text-purple-500" />;
    case 'enrolled': return <UserPlus className="w-4 h-4 text-green-500" />;
    case 'dropped': return <UserMinus className="w-4 h-4 text-red-500" />;
  }
};

const formatWatchTime = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  trendValue, 
  color,
  loading 
}: { 
  title: string; 
  value: string | number; 
  icon: React.ComponentType<{ className?: string }>; 
  trend?: 'up' | 'down'; 
  trendValue?: string;
  color: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-lg bg-muted animate-pulse h-9 w-9" />
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-8 w-16 bg-muted animate-pulse rounded" />
            <div className="h-3 w-24 bg-muted animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
    >
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className={`p-2 rounded-lg ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            {trend && (
              <div className={`flex items-center gap-1 text-xs ${trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>
                {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {trendValue}
              </div>
            )}
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{title}</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function StudentRow({ student, onSendMessage, onViewDetails }: { 
  student: InstructorStudent; 
  onSendMessage: (id: string) => void;
  onViewDetails: (id: string) => void;
}) {
  const status = getStatusConfig(student.status);
  
  const assignedBatches = useMemo(() => {
    return (student.courseEnrollments || [])
      .filter(e => e.batchName && e.batchName !== 'Unassigned')
      .map(e => ({ name: e.batchName, session: e.batchType }));
  }, [student.courseEnrollments]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-12 gap-x-8 gap-y-4 p-6 rounded-3xl border border-slate-100 bg-white hover:border-primary/20 hover:shadow-xl hover:shadow-slate-200/40 transition-all duration-500 group relative"
    >

      {/* 1. Student Identity (col-span-6) */}
      <div className="col-span-12 lg:col-span-6 flex items-center gap-6">
        <div className="relative flex-shrink-0 group-hover:scale-105 transition-transform duration-500">
          <Avatar className="h-16 w-16 border-4 border-white shadow-2xl ring-1 ring-slate-100 rounded-2xl overflow-hidden">
            <AvatarImage src={student.avatarUrl ? (student.avatarUrl.startsWith('http') ? student.avatarUrl : `${import.meta.env.VITE_API_URL || '/api'}/s3/public/${student.avatarUrl}`) : `https://api.dicebear.com/9.x/avataaars/svg?seed=${student.userId}`} />
            <AvatarFallback className="bg-slate-100 text-slate-900 text-xl font-black">
              {student.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg border-4 border-white bg-slate-900 shadow-lg flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          </div>
        </div>
        <div className="min-w-0">
          <p className="font-black text-xl text-slate-900 truncate tracking-tight mb-1 group-hover:text-black transition-colors">{student.name}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className={cn(
              "h-6 px-3 text-[10px] font-black border-none uppercase tracking-[0.05em] rounded-lg",
              status.bg,
              status.label === 'Active' ? 'bg-slate-900 text-white' : status.text
            )}>
              {status.label}
            </Badge>
            {assignedBatches.length > 0 ? (
              assignedBatches.map((b, idx) => (
                <Badge 
                  key={idx} 
                  variant="outline" 
                  className="h-6 px-2.5 text-[10px] font-bold bg-indigo-50/70 text-indigo-700 border-indigo-200/80 rounded-lg flex items-center gap-1"
                >
                  <span className="truncate max-w-[150px]">{b.name}</span>
                  {b.session && b.session !== 'unassigned' && (
                    <span className="text-[9px] uppercase tracking-wider font-semibold opacity-75">({b.session})</span>
                  )}
                </Badge>
              ))
            ) : (
              <Badge variant="secondary" className="h-6 px-2.5 text-[10px] font-bold bg-slate-100 text-slate-500 border-none rounded-lg">
                Unassigned
              </Badge>
            )}
            <span className="text-[11px] font-bold text-slate-400 font-mono tracking-tighter">ID: {student.userId.slice(-6).toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* 2. Contact Details (col-span-4) */}
      <div className="col-span-12 sm:col-span-8 lg:col-span-4 space-y-3 py-1 border-l border-slate-100 pl-8">
        <div className="flex items-center gap-4 text-slate-600 group/item">
          <div className="h-9 w-9 rounded-xl bg-slate-50 flex items-center justify-center group-hover/item:bg-slate-900 group-hover/item:text-white transition-all duration-300">
            <Mail className="h-4 w-4 opacity-60 group-hover/item:opacity-100" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Email Address</span>
            <span className="text-[13px] font-bold truncate tracking-tight text-slate-700">{student.email}</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-slate-600 group/item">
          <div className="h-9 w-9 rounded-xl bg-slate-50 flex items-center justify-center group-hover/item:bg-slate-900 group-hover/item:text-white transition-all duration-300">
            <Phone className="h-4 w-4 opacity-60 group-hover/item:opacity-100" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Mobile Number</span>
            <span className="text-[13px] font-bold tracking-tight text-slate-700">{student.mobileNumber || 'No Mobile Registered'}</span>
          </div>
        </div>
      </div>

      {/* 3. Actions (col-span-2) */}
      <div className="col-span-12 sm:col-span-4 lg:col-span-2 flex items-center justify-end gap-3 border-l border-slate-100 pl-4">
        <Button 
          variant="outline" 
          size="icon" 
          className="h-12 w-12 rounded-2xl text-slate-900 border-slate-100 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all shadow-sm"
          onClick={() => onViewDetails(student.userId)}
        >
          <Eye className="w-5 h-5" />
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl hover:bg-slate-100 transition-all border border-slate-100">
              <MoreHorizontal className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 rounded-[2.5rem] p-4 border-none shadow-2xl bg-white/95 backdrop-blur-xl">
            <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-4 py-3">Student Operations</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-slate-100" />
            <DropdownMenuItem className="flex items-center gap-3 rounded-2xl px-4 h-14 font-bold focus:bg-slate-900 focus:text-white transition-all cursor-pointer mb-2" onClick={() => onViewDetails(student.userId)}>
              <User className="w-5 h-5 opacity-50" /> <span className="text-sm">Detailed Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex items-center gap-3 rounded-2xl px-4 h-14 font-bold focus:bg-slate-900 focus:text-white transition-all cursor-pointer mb-2" onClick={() => onSendMessage(student.userId)}>
              <Zap className="w-5 h-5 opacity-50 text-amber-500" /> <span className="text-sm">Send Fast Pulse</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-slate-100" />
            <DropdownMenuItem className="flex items-center gap-3 rounded-2xl px-4 h-14 font-bold text-rose-600 focus:bg-rose-600 focus:text-white transition-all cursor-pointer">
              <AlertCircle className="w-5 h-5 opacity-50" /> <span className="text-sm">Restrict Session</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}

function ActivityFeed({ activities, students }: { activities: RecentActivity[]; students: InstructorStudent[] }) {
  const liveStudents = students.filter(s => {
    const lastActive = new Date(s.lastActiveAt).getTime();
    const hourAgo = Date.now() - (60 * 60 * 1000);
    return lastActive > hourAgo;
  });

  const recentCompletions = students
    .filter(s => s.status === 'completed')
    .slice(0, 3)
    .map(s => ({
      id: `completed-${s.userId}`,
      studentId: s.userId,
      studentName: s.name,
      action: 'completed' as const,
      courseName: s.courseEnrollments[0]?.courseTitle || 'Course',
      timestamp: formatTimeAgo(s.lastActiveAt)
    })) as RecentActivity[];

  const allActivities = [...activities, ...recentCompletions]
    .sort((a, b) => {
      const timeA = a.timestamp === 'Just now' ? 0 : a.timestamp.includes('m') ? parseInt(a.timestamp) * 60000 :
                    a.timestamp.includes('h') ? parseInt(a.timestamp) * 3600000 : parseInt(a.timestamp) * 86400000;
      const timeB = b.timestamp === 'Just now' ? 0 : b.timestamp.includes('m') ? parseInt(b.timestamp) * 60000 :
                    b.timestamp.includes('h') ? parseInt(b.timestamp) * 3600000 : parseInt(b.timestamp) * 86400000;
      return timeA - timeB;
    })
    .slice(0, 10);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Live Activity
          </CardTitle>
          <Badge variant="outline" className="gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            {liveStudents.length} Active
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-2">
          <div className="space-y-3">
            {allActivities.length > 0 ? (
              allActivities.map((activity, index) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="mt-0.5">
                    {getActivityIcon(activity.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{activity.studentName}</span>{' '}
                      <span className="text-muted-foreground">
                        {activity.action === 'watching' ? 'is watching' : 
                         activity.action === 'completed' ? 'completed' :
                         activity.action === 'enrolled' ? 'enrolled in' :
                         activity.action === 'started' ? 'started' : 'dropped'}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{activity.courseName}</p>
                    {activity.details && (
                      <p className="text-xs text-amber-500 mt-0.5">{activity.details}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {activity.timestamp}
                  </span>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No recent activity</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function StudentCourseDetails({ 
    studentId, 
    courseId, 
    courseName, 
    progress,
    batchType,
    batchName 
}: { 
    studentId: string; 
    courseId: string; 
    courseName: string; 
    progress: number;
    batchType?: string;
    batchName?: string;
}) {
  const { data: videoProgress } = useStudentVideoProgress(studentId, courseId);
  const { data: videos } = useVideos(courseId);
  const [expanded, setExpanded] = useState(false);

  // Merge video data with progress
  const videoList = useMemo(() => {
    if (!videos) return [];
    const vds = videos as CourseVideo[];
    return vds.map((video: CourseVideo) => {
      const vps = videoProgress as VideoProgressDetail[];
      const p = vps?.find((vp: VideoProgressDetail) => vp.video_id === video.id);
      return {
        ...video,
        watched: p?.watched_seconds || 0,
        total: p?.total_seconds || video.duration_seconds || 0,
        completed: p?.completed || false,
        lastWatched: p?.last_watched_at
      };
    }).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  }, [videos, videoProgress]);

  return (
    <div className="p-4 rounded-xl border border-slate-100 bg-white">
      <div 
        className="flex items-center justify-between mb-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 overflow-hidden">
            <Button variant="ghost" size="icon" className="h-6 w-6 p-0 hover:bg-slate-100">
                {expanded ? <ChevronRight className="h-4 w-4 rotate-90 transition-transform" /> : <ChevronRight className="h-4 w-4 transition-transform" />}
            </Button>
            <div className="flex flex-col min-w-0 pr-4">
                <span className="text-sm font-bold text-slate-800 truncate">{courseName}</span>
                {batchName && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className={cn(
                        "text-[8px] h-4 px-1.5 border-none uppercase font-black",
                        batchType === 'morning' ? 'bg-amber-50 text-amber-600' :
                        batchType === 'afternoon' ? 'bg-blue-50 text-blue-600' :
                        batchType === 'evening' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'
                    )}>
                        {batchType}
                    </Badge>
                    <span className="text-[10px] text-slate-400 font-medium truncate italic">{batchName}</span>
                  </div>
                )}
            </div>
        </div>
        <span className="text-xs font-black text-primary whitespace-nowrap">{progress}%</span>
      </div>
      <Progress value={progress} className="h-1.5 mb-2" indicatorClassName={progress === 100 ? 'bg-green-500' : 'bg-primary'} />
      
      {expanded && (
        <div className="mt-4 space-y-2 pl-2 border-l-2 border-slate-100 ml-2">
            {videoList.length > 0 ? (
                videoList.map((video) => (
                    <div key={video.id} className="flex items-center gap-3 text-xs py-1">
                        <div className={cn(
                            "h-4 w-4 rounded-full flex items-center justify-center flex-shrink-0",
                            video.completed ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"
                        )}>
                            {video.completed ? <CheckCircle2 className="h-3 w-3" /> : <PlayCircle className="h-3 w-3" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-700 truncate">{video.title}</p>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                <span>{formatWatchTime(Math.round(video.watched / 60))} / {formatWatchTime(Math.round(video.total / 60))}</span>
                                {video.lastWatched && (
                                    <span>• {formatTimeAgo(video.lastWatched)}</span>
                                )}
                            </div>
                        </div>
                        <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                            <div 
                                className="h-full bg-blue-500 rounded-full" 
                                style={{ width: `${Math.min(100, (video.watched / video.total) * 100)}%` }}
                            />
                        </div>
                    </div>
                ))
            ) : (
                <p className="text-xs text-muted-foreground italic pl-2">No videos found for this course.</p>
            )}
        </div>
      )}
    </div>
  );
}

export function InstructorStudentDashboard() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: students, isLoading: studentsLoading, refetch } = useInstructorAllStudents();
  const { data: courses, isLoading: coursesLoading } = useInstructorCourses();
  const { stats, isLoading: statsLoading } = useInstructorStudentStats();
  const sendReminder = useSendReminder();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [batchFilter, setBatchFilter] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activities] = useState<RecentActivity[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<InstructorStudent | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Auto-set batch filter if instructor is restricted to a session
  // Initial auto-selection of batch filter based on instructor's assigned session
  const [hasAutoSet, setHasAutoSet] = useState(false);

  useEffect(() => {
    if (courses && courses.length > 0 && !hasAutoSet && batchFilter === 'all') {
      const assignedSessions = Array.from(new Set(courses.map(c => c.assigned_session).filter(s => s && s !== 'all')));
      if (assignedSessions.length === 1 && (assignedSessions[0] === 'morning' || assignedSessions[0] === 'afternoon' || assignedSessions[0] === 'evening')) {
        setBatchFilter(assignedSessions[0]);
        setHasAutoSet(true);
      }
    }
  }, [courses, batchFilter, hasAutoSet]);


  const availableBatchNames = useMemo(() => {
    if (!students) return [];
    const names = new Set<string>();
    students.forEach(s => {
      s.courseEnrollments?.forEach(e => {
        if (e.batchName && e.batchName !== 'Unassigned') {
          names.add(e.batchName);
        }
      });
    });
    return Array.from(names).sort();
  }, [students]);

  const groupedStudents = useMemo(() => {
    if (!students) return {};
    
    const filtered = students.filter(student => {
      const matchesSearch = 
        student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || student.status === statusFilter;
      const matchesCourse = courseFilter === 'all' || 
        student.courseEnrollments.some(e => e.courseId === courseFilter);
      return matchesSearch && matchesStatus && matchesCourse;
    });

    const groups: Record<string, InstructorStudent[]> = {
      'morning': [],
      'afternoon': [],
      'evening': [],
      'unassigned': []
    };
    filtered.forEach(student => {
      // If a specific course filter is set, only consider batch types for THAT course.
      // Otherwise, consider all batch types for all courses the student is enrolled in.
      const relevantEnrollments = courseFilter === 'all'
        ? student.courseEnrollments
        : student.courseEnrollments.filter(e => e.courseId === courseFilter);

      // Find the most relevant batch types for this student (lowercased for comparison)
      // Use a Set to avoid duplicates if a student is in multiple courses of the same session
      const batchTypes = Array.from(new Set(
        relevantEnrollments
          .map(e => {
            if (!e.batchType) return null;
            const bt = e.batchType.toLowerCase();
            // Normalize typos in data
            if (bt.includes('eving') || bt.includes('eveg')) return 'evening';
            if (bt.includes('morning')) return 'morning';
            if (bt.includes('afternoon')) return 'afternoon';
            return bt;
          })
          .filter(Boolean) as string[]
      ));

      if (batchFilter !== 'all') {
        if (batchFilter.startsWith('batch:')) {
          const targetBatch = batchFilter.replace('batch:', '');
          const matchesBatch = relevantEnrollments.some(e => e.batchName === targetBatch);
          if (matchesBatch) {
            if (!groups[targetBatch]) groups[targetBatch] = [];
            groups[targetBatch].push(student);
          }
        } else {
          const normalizedFilter = batchFilter.toLowerCase();
          // If a specific filter is set, only include students that belong to THAT batch
          if (batchTypes.includes(normalizedFilter)) {
            if (!groups[normalizedFilter]) groups[normalizedFilter] = [];
            groups[normalizedFilter].push(student);
          }
        }
      } else {
        // "All Batches" - show student in EVERY group they belong to
        if (batchTypes.length === 0) {
          groups['unassigned'].push(student);
        } else {
          let added = false;
          batchTypes.forEach(bt => {
            if (groups[bt]) {
              groups[bt].push(student);
              added = true;
            }
          });
          // Fallback to unassigned if the batch type doesn't match our main categories
          if (!added) {
             groups['unassigned'].push(student);
          }
        }
      }
    });

    // Only return groups that have students or the specific group if a filter is set
    if (batchFilter !== 'all') {
      if (batchFilter.startsWith('batch:')) {
        const targetBatch = batchFilter.replace('batch:', '');
        return { [targetBatch]: groups[targetBatch] || [] };
      }
      const normalizedFilter = batchFilter.toLowerCase();
      return { [normalizedFilter]: groups[normalizedFilter] || [] };
    }

    // Filter out empty groups for a cleaner "All Batches" view
    return Object.fromEntries(Object.entries(groups).filter(([_, s]) => s.length > 0));

  }, [students, searchQuery, statusFilter, courseFilter, batchFilter]);

  const totalFilteredCount = useMemo(() => 
    Object.values(groupedStudents).reduce((acc, current) => acc + current.length, 0)
  , [groupedStudents]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast({ title: 'Data refreshed', description: 'Student data has been updated' });
    } catch (error) {
      toast({ title: 'Error refreshing data', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSendMessage = (studentId: string) => {
    navigate(`/instructor/chat?recipientId=${studentId}&showProfile=true`);
  };

  const handleViewDetails = (studentId: string) => {
    const student = students?.find(s => s.userId === studentId);
    if (student) {
      setSelectedStudent(student);
      setIsDetailOpen(true);
    }
  };


  const loading = studentsLoading || statsLoading || coursesLoading;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-2xl font-bold tracking-tight">Student Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor student progress and engagement across all your courses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Total Students" 
          value={loading ? '...' : stats.totalStudents} 
          icon={Users} 
          color="bg-primary/10 text-primary"
          loading={loading}
        />
        <StatCard 
          title="Active Now" 
          value={loading ? '...' : stats.activeStudents} 
          icon={Activity} 
          color="bg-green-500/10 text-green-500"
          loading={loading}
        />
        <StatCard 
          title="Total Watch Time" 
          value={loading ? '...' : stats.totalWatchTimeMinutes} 
          icon={Clock} 
          color="bg-blue-500/10 text-blue-500"
          loading={loading}
        />
        <StatCard 
          title="Course Enrollments" 
          value={loading ? '...' : stats.totalEnrollments} 
          icon={BookOpen} 
          color="bg-purple-500/10 text-purple-500"
          loading={loading}
        />
      </div>
      <div className="space-y-6">
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-[2.5rem] overflow-hidden bg-white/50 backdrop-blur-md">
            <CardHeader className="p-8 pb-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                  <CardTitle className="text-[13px] font-black uppercase tracking-[0.2em] text-slate-700">
                    Active Session Roster ({totalFilteredCount})
                  </CardTitle>
                  <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Instructor Personnel Feed</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[200px] sm:min-w-[300px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search identity or credential..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-12 h-12 w-full bg-white border-none shadow-sm rounded-2xl text-xs font-bold ring-1 ring-slate-100 focus-visible:ring-primary/20"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[140px] h-12 rounded-2xl bg-white border-none shadow-sm ring-1 ring-slate-100 text-[10px] font-black uppercase tracking-widest">
                        <Filter className="w-3.5 h-3.5 mr-2 opacity-40 text-primary" />
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-none shadow-2xl p-2">
                        <SelectItem value="all" className="rounded-xl font-bold">All Status</SelectItem>
                        <SelectItem value="active" className="rounded-xl font-bold">Active</SelectItem>
                        <SelectItem value="completed" className="rounded-xl font-bold">Completed</SelectItem>
                        <SelectItem value="inactive" className="rounded-xl font-bold">Inactive</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={batchFilter} onValueChange={setBatchFilter}>
                      <SelectTrigger className="w-[170px] h-12 rounded-2xl bg-white border-none shadow-sm ring-1 ring-slate-100 text-[10px] font-black uppercase tracking-widest">
                        <Clock className="w-3.5 h-3.5 mr-2 opacity-40 text-primary" />
                        <SelectValue placeholder="Batch" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-none shadow-2xl p-2 max-h-[320px]">
                        <SelectItem value="all" className="rounded-xl font-bold">All Batches</SelectItem>
                        <SelectItem value="morning" className="rounded-xl font-bold">Morning Session</SelectItem>
                        <SelectItem value="afternoon" className="rounded-xl font-bold">Afternoon Session</SelectItem>
                        <SelectItem value="evening" className="rounded-xl font-bold">Evening Session</SelectItem>
                        {availableBatchNames.length > 0 && (
                          <>
                            <SelectSeparator className="my-1 bg-slate-100" />
                            <SelectGroup>
                              <SelectLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2 py-1.5">
                                Batches
                              </SelectLabel>
                              {availableBatchNames.map((name) => (
                                <SelectItem key={name} value={`batch:${name}`} className="rounded-xl font-bold">
                                  {name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8 pt-4 space-y-4">
              <div className="hidden lg:grid grid-cols-12 gap-8 px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 bg-slate-50/30 rounded-2xl">
                <div className="col-span-6">Student Identity</div>
                <div className="col-span-4">Contact Details</div>
                <div className="col-span-2 text-right">Operations</div>
              </div>

              <ScrollArea className="h-[550px] pr-4 admin-scrollbar">
                <div className="space-y-3">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                      <div className="h-10 w-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Syncing Registry...</p>
                    </div>
                  ) : totalFilteredCount > 0 ? (
                    <div className="space-y-10">
                       {Object.entries(groupedStudents).map(([group, sList]) => {
                        const isStandardSession = ['morning', 'afternoon', 'evening', 'unassigned'].includes(group.toLowerCase());
                        return (
                        <div key={group} className="space-y-6">
                           <div className="flex items-center gap-4 px-2">
                              <div className={cn(
                                "h-10 w-10 rounded-xl flex items-center justify-center shadow-lg",
                                group === 'morning' ? "bg-amber-400 text-white shadow-amber-200" :
                                group === 'afternoon' ? "bg-blue-500 text-white shadow-blue-200" :
                                group === 'evening' ? "bg-indigo-600 text-white shadow-indigo-200" :
                                group === 'unassigned' ? "bg-slate-400 text-white shadow-slate-200" : "bg-purple-600 text-white shadow-purple-200"
                              )}>
                                 {group === 'morning' && <Sun className="h-5 w-5" />}
                                 {group === 'afternoon' && <CloudSun className="h-5 w-5" />}
                                 {group === 'evening' && <Moon className="h-5 w-5" />}
                                 {group === 'unassigned' && <Users className="h-5 w-5" />}
                                 {!isStandardSession && <BookOpen className="h-5 w-5" />}
                              </div>
                              <div className="flex flex-col">
                                <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight italic">
                                  {group} {isStandardSession && group !== 'unassigned' ? 'BATCH' : ''} <span className="text-slate-300 ml-2">[{sList.length}]</span>
                                </h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                  {isStandardSession ? 'Ongoing Learning Session' : 'Assigned Batch Cohort'}
                                </p>
                              </div>
                              <div className="h-px flex-1 bg-gradient-to-r from-slate-100 to-transparent ml-4" />
                           </div>
                           
                           <div className="space-y-3">
                            {sList.map((student) => (
                              <StudentRow
                                key={student.userId}
                                student={student}
                                onSendMessage={handleSendMessage}
                                onViewDetails={handleViewDetails}
                              />
                            ))}
                           </div>
                        </div>
                      );})}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-32 text-center">
                      <div className="h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                        <Users className="w-10 h-10 text-slate-200" />
                      </div>
                      <h3 className="text-lg font-black text-slate-900 tracking-tight">No match found in current registry</h3>
                      <p className="text-sm font-medium text-slate-400 mt-2 max-w-[280px]">
                        {searchQuery || statusFilter !== 'all' || courseFilter !== 'all'
                          ? 'We couldn\'t find any students matching your current search parameters.' 
                          : 'You haven\'t onboarded any students for your courses yet.'}
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[500px] p-0 overflow-hidden border-none shadow-2xl rounded-2xl sm:rounded-[2rem]">
          {selectedStudent && (
            <div className="bg-white">
              <DialogHeader className="sr-only">
                <DialogTitle>Student Profile</DialogTitle>
                <DialogDescription>Details for {selectedStudent.name}</DialogDescription>
              </DialogHeader>
              <div className="bg-slate-900 h-24 relative">
                <div className="absolute -bottom-8 left-8">
                  <Avatar className="h-20 w-20 border-4 border-white shadow-xl">
                    <AvatarImage src={selectedStudent.avatarUrl ? (selectedStudent.avatarUrl.startsWith('http') ? selectedStudent.avatarUrl : `${import.meta.env.VITE_API_URL || '/api'}/s3/public/${selectedStudent.avatarUrl}`) : `https://api.dicebear.com/9.x/avataaars/svg?seed=${selectedStudent.userId}`} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xl font-black">
                      {selectedStudent.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
              <div className="pt-12 px-8 pb-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight mb-1">{selectedStudent.name}</h3>
                    <div className="flex flex-wrap gap-2 items-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">ID: {selectedStudent.userId.slice(-6).toUpperCase()}</p>
                        {Array.from(new Set(selectedStudent.courseEnrollments.map(e => e.batchName).filter(Boolean))).map((bn, i) => {
                            if (bn === 'Unassigned') return null;
                            return (
                                <Badge key={`batch-${i}`} variant="outline" className="text-[9px] h-4.5 px-2 bg-indigo-50 text-indigo-700 border-indigo-200 uppercase font-black tracking-tighter">
                                    {bn}
                                </Badge>
                            );
                        })}
                        {Array.from(new Set(selectedStudent.courseEnrollments.map(e => e.batchType).filter(Boolean))).map((bt, i) => {
                            const batchType = bt as string;
                            if (batchType === 'unassigned') return null;
                            return (
                                <Badge key={i} variant="outline" className={cn(
                                    "text-[9px] h-4.5 px-2 border-none uppercase font-black tracking-tighter",
                                    batchType === 'morning' ? 'bg-amber-50 text-amber-600' :
                                    batchType === 'afternoon' ? 'bg-blue-50 text-blue-600' :
                                    batchType === 'evening' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'
                                )}>
                                    {batchType}
                                </Badge>
                            );
                        })}
                    </div>
                  </div>
                  <Badge className={`${getStatusConfig(selectedStudent.status).bg} ${getStatusConfig(selectedStudent.status).text} h-8 px-4 rounded-full font-bold border-none`}>
                    {getStatusConfig(selectedStudent.status).label}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-50 space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email Address</p>
                    <p className="text-sm font-bold text-slate-700 truncate">{selectedStudent.email}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mobile Number</p>
                    <p className="text-sm font-bold text-slate-700">{selectedStudent.mobileNumber || 'Not provided'}</p>
                  </div>
                </div>

                  <div className="space-y-4 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2 mb-4">
                      <BookOpen className="h-3 w-3 text-primary" /> Learning Pathways
                    </h4>
                    <ScrollArea className="h-[280px] -mx-2 px-2">
                       <div className="space-y-4 pb-4">
                        {selectedStudent.courseEnrollments.map((course) => (
                          <div key={course.courseId} className="group transition-all">
                            <StudentCourseDetails
                                studentId={selectedStudent.userId}
                                courseId={course.courseId}
                                courseName={course.courseTitle}
                                progress={course.progress}
                                batchType={course.batchType}
                                batchName={course.batchName}
                            />
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                <div className="pt-2 flex gap-3">
                   <Button variant="outline" className="flex-1 h-12 rounded-xl font-bold border-slate-200" onClick={() => setIsDetailOpen(false)}>Close</Button>
                   <Button className="flex-1 h-12 rounded-xl pro-button-primary font-black gap-2" onClick={() => handleSendMessage(selectedStudent.userId)}>
                     <Mail className="h-4 w-4" /> Message Student
                   </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>

  );
}
