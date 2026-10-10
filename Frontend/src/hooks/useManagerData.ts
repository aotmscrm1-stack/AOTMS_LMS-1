import { fetchWithAuth } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface Exam {
  id: string;
  course_id: string | null;
  target_batches?: string[]; // New field for batch tracking
  title: string;
  description: string | null;
  exam_type: string;
  scheduled_date: string;
  duration_minutes: number;
  total_marks: number;
  passing_marks: number | null;
  negative_marking: number | null;
  max_attempts: number | null;
  shuffle_questions: boolean | null;
  show_results: boolean | null;
  proctoring_enabled: boolean | null;
  browser_security: boolean | null;
  status: string | null;
  assigned_image: string | null;
  approval_status: string;
  total_questions?: number;
  topics?: string[];
  ai_generated?: boolean;
  source_topic?: string;
  created_by: string;
  created_at: string | null;
  custom_fields?: { label: string; value: string }[];
}

export interface Question {
  id: string;
  _id?: string;
  topic: string;
  question_text: string;
  type: string;
  language?: string;
  difficulty: string;
  options: { text: string; is_correct: boolean }[] | null;
  correct_answer: string;
  explanation: string | null;
  input_format?: string | null;
  output_format?: string | null;
  constraints?: string | null;
  sample_input?: string | null;
  sample_output?: string | null;
  test_cases?: {
    input?: string;
    expected_output?: string;
    explanation?: string;
    weight?: number;
    is_hidden?: boolean;
  }[];
  marks: number | null;
  created_by: string;
  is_active?: boolean;
  approval_status?: string;
}

export interface LeaderboardEntry {
  id: string;
  user_id: string | {
    id: string;
    full_name?: string;
    avatar_url?: string;
    email?: string;
  };
  total_score: number | null;
  exams_completed: number | null;
  average_percentage: number | null;
  rank: number | null;
  badges: string[] | null;
  is_verified: boolean | null;
  verified_by?: string | null;
  verified_at?: string | null;
}

export interface ExamRule {
  id: string;
  exam_id: string | null;
  exam_schedule_id: string | null;
  duration_minutes: number;
  max_attempts: number;
  negative_marking_value: number; // For frontend compatibility
  passing_percentage: number;    // For frontend compatibility
  negative_marks_per_question?: number; // DB name
  passing_marks?: number;               // DB name
  shuffle_questions: boolean;
  shuffle_options: boolean;
  show_results_immediately: boolean;
  allow_review: boolean;
  proctoring_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Instructor {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  created_at?: string;
  mobile_number?: string;
}

export interface InstructorProgress {
  id: string;
  instructor_id: string;
  course_id: string;
  topics_completed: number;
  total_topics: number;
  videos_uploaded: number;
  resources_uploaded: number;
  live_classes_conducted: number;
  last_activity_at: string;
  notes: string | null;
  updated_at: string;
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  instructor_id: string;
  thumbnail_url: string | null;
  duration_hours: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface CourseTopic {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_completed: boolean;
  completed_at: string | null;
}

export interface LeaderboardAuditEntry {
  id: string;
  user_id: string;
  action: string;
  previous_score: number | null;
  new_score: number | null;
  reason: string | null;
  performed_by: string;
  created_at: string;
}

export interface Profile {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

export interface ExamResult {
  id: string;
  student_id: string;
  exam_id: string;
  score: number;
  total_marks: number;
  percentage: number | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  last_accessed_at: string | null;
}

export interface Batch {
  id: string;
  batch_name: string;
  batch_type: string;
  course_id: string;
  instructor_id?: string;
}

export interface StudentBatch {
  id: string;
  student_id: string;
  batch_id: string;
  course_id: string;
}

// ─── Fetch helper ───────────────────────────────────────────────────────────


// Safe version: returns empty array on error (for tables that may not exist yet)
const safeFetchWithAuth = async <T = unknown[]>(url: string, options: RequestInit = {}): Promise<T> => {
  try {
    return await fetchWithAuth<T>(url, options);
  } catch {
    console.warn(`[Manager] API call failed (table may not exist): ${url}`);
    return [] as unknown as T;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. EXAM SCHEDULING — Schedule daily exams based on completed topics
// ═══════════════════════════════════════════════════════════════════════════

export function useExams() {
  return useQuery<Exam[]>({
    queryKey: ['exams'],
    queryFn: () => fetchWithAuth('/data/exams?sort=scheduled_date&order=asc&select=title,status,approval_status,scheduled_date,assigned_image,duration_minutes,total_marks,exam_type,created_by,created_at'),
  });
}

export function useCreateExam() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (exam: Omit<Exam, 'id' | 'created_at'>) =>
      fetchWithAuth('/data/exams', { method: 'POST', body: JSON.stringify(exam) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      toast({ title: 'Exam scheduled successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error scheduling exam', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateExam() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, ...updates }: Partial<Exam> & { id: string }) =>
      fetchWithAuth(`/data/exams/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: ['exams'] });
      const previousExams = queryClient.getQueryData<Exam[]>(['exams']);
      queryClient.setQueryData<Exam[]>(['exams'], (old) => 
        old?.map(exam => exam.id === id ? { ...exam, ...updates } : exam)
      );
      return { previousExams };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      if (variables.approval_status === 'approved') {
        toast({ title: 'Exam Approved', description: 'This exam is now available in the Final Batches repository.' });
      }
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previousExams) {
        queryClient.setQueryData(['exams'], context.previousExams);
      }
      toast({ title: 'Error updating exam', description: error.message, variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    }
  });
}

export function useDeleteExam() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => fetchWithAuth(`/data/exams/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['exams'] });
      const previousExams = queryClient.getQueryData<Exam[]>(['exams']);
      queryClient.setQueryData<Exam[]>(['exams'], (old) => 
        old?.filter(exam => exam.id !== id)
      );
      return { previousExams };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previousExams) {
        queryClient.setQueryData(['exams'], context.previousExams);
      }
      toast({ title: 'Error deleting exam', description: error.message, variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. QUESTION BANK — Manage predefined topic-wise question papers
// ═══════════════════════════════════════════════════════════════════════════

export function useQuestions() {
  return useQuery<Question[]>({
    queryKey: ['questions'],
    queryFn: () => fetchWithAuth('/data/question_bank?sort=created_at&order=desc'),
  });
}

export function useQuestionsByTopic() {
  const { data: questions = [] } = useQuestions();
  const grouped = questions.reduce(
    (acc: Record<string, { easy: number; medium: number; hard: number; total: number }>, q) => {
      if (!acc[q.topic]) acc[q.topic] = { easy: 0, medium: 0, hard: 0, total: 0 };
      const d = q.difficulty as 'easy' | 'medium' | 'hard';
      if (acc[q.topic][d] !== undefined) acc[q.topic][d]++;
      acc[q.topic].total++;
      return acc;
    },
    {}
  );
  return Object.entries(grouped).map(([topic, stats]) => ({ topic, ...stats }));
}

export function useCreateQuestion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: Omit<Question, 'id'> | Omit<Question, 'id'>[]) =>
      fetchWithAuth('/data/question_bank', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (data: unknown) => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      const count = Array.isArray(data) ? data.length : 1;
      toast({
        title: count > 1 ? `${count} questions added` : 'Question added successfully'
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error adding question', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateQuestion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, ...updates }: Partial<Question> & { id: string }) =>
      fetchWithAuth(`/data/question_bank/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast({ title: 'Question updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating question', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteQuestion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => fetchWithAuth(`/data/question_bank/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast({ title: 'Question deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting question', description: error.message, variant: 'destructive' });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LEADERBOARD — Monitor and validate leaderboard scores
// ═══════════════════════════════════════════════════════════════════════════

export const useLeaderboard = () => {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard'],
    queryFn: () => fetchWithAuth<LeaderboardEntry[]>('/data/leaderboard?sort=total_score&order=desc'),
  });
};

export function useVerifyLeaderboardEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, verified_by }: { id: string; verified_by: string }) =>
      fetchWithAuth(`/data/leaderboard/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_verified: true, verified_by, verified_at: new Date().toISOString() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      toast({ title: 'Leaderboard entry verified' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error verifying entry', description: error.message, variant: 'destructive' });
    },
  });
}

export function useResetLeaderboardEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      fetchWithAuth(`/data/leaderboard/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_verified: false, verified_by: null, verified_at: null }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      toast({ title: 'Verification reset' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error resetting entry', description: error.message, variant: 'destructive' });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. EXAM RULES — Configure duration, negative marking, attempts
// ═══════════════════════════════════════════════════════════════════════════

export function useExamRules() {
  return useQuery<ExamRule[]>({
    queryKey: ['exam-rules'],
    queryFn: async () => {
      const data = await safeFetchWithAuth<Partial<ExamRule>[]>('/data/exam_rules?sort=created_at&order=desc');
      // Normalize data for the frontend if keys match DB schema
      return (data || []).map((rule: Partial<ExamRule>) => ({
        ...rule,
        negative_marking_value: rule.negative_marking_value ?? rule.negative_marks_per_question ?? 0,
        passing_percentage: rule.passing_percentage ?? rule.passing_marks ?? 40
      })) as ExamRule[];
    },
    retry: false,
  });
}

export function useCreateExamRule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (rule: Omit<ExamRule, 'id' | 'created_at' | 'updated_at'>) => {
      // Create a clean payload with only existing DB columns
      const payload = {
        exam_id: rule.exam_id,
        exam_schedule_id: rule.exam_schedule_id,
        duration_minutes: rule.duration_minutes,
        max_attempts: rule.max_attempts,
        negative_marking_value: rule.negative_marking_value,
        passing_percentage: rule.passing_percentage,
        shuffle_questions: rule.shuffle_questions,
        shuffle_options: rule.shuffle_options,
        show_results_immediately: rule.show_results_immediately,
        allow_review: rule.allow_review,
        proctoring_enabled: rule.proctoring_enabled,
        // Aliases for legacy DB support
        negative_marks_per_question: rule.negative_marking_value,
        passing_marks: rule.passing_percentage
      };
      return fetchWithAuth('/data/exam_rules', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam-rules'] });
      toast({ title: 'Exam rule created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating exam rule', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateExamRule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, ...updates }: Partial<ExamRule> & { id: string }) =>
      fetchWithAuth(`/data/exam_rules/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam-rules'] });
      toast({ title: 'Exam rule updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating exam rule', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteExamRule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => fetchWithAuth(`/data/exam_rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam-rules'] });
      toast({ title: 'Exam rule deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting exam rule', description: error.message, variant: 'destructive' });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. COURSE MONITORING — Track instructor progress & topic completion
// ═══════════════════════════════════════════════════════════════════════════

export function useCourses() {
  return useQuery<Course[]>({
    queryKey: ['manager-courses'],
    queryFn: () => fetchWithAuth('/data/courses?sort=created_at&order=desc'),
  });
}

export function useInstructorProgress() {
  return useQuery<InstructorProgress[]>({
    queryKey: ['instructor-progress'],
    queryFn: () => safeFetchWithAuth<InstructorProgress[]>('/data/instructor_progress?sort=last_activity_at&order=desc'),
    retry: false,
  });
}

export function useCourseTopics(courseId?: string) {
  return useQuery<CourseTopic[]>({
    queryKey: ['course-topics', courseId],
    queryFn: async () => {
      const data = await safeFetchWithAuth<CourseTopic[]>('/data/course_topics?sort=order_index&order=asc');
      if (courseId) return data.filter((t: CourseTopic) => t.course_id === courseId);
      return data;
    },
    enabled: true,
  });
}

export function useProfiles() {
  return useQuery<Profile[]>({
    queryKey: ['manager-profiles'],
    queryFn: () => fetchWithAuth('/data/profiles?sort=created_at&order=desc'),
  });
}

export function useInstructors() {
  return useQuery<Instructor[]>({
    queryKey: ['manager-instructors'],
    queryFn: () => fetchWithAuth('/admin/instructors'),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. LIVE WINDOW EXAMS — Configure and monitor live exams
// ═══════════════════════════════════════════════════════════════════════════

export function useExamResults(examId?: string) {
  return useQuery<ExamResult[]>({
    queryKey: ['exam-results', examId],
    queryFn: async () => {
      const data = await safeFetchWithAuth<ExamResult[]>('/data/student_exam_results?sort=completed_at&order=desc');
      if (examId) return data.filter((d: ExamResult) => d.exam_id === examId);
      return data;
    },
    retry: false,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. LEADERBOARD AUDIT — Full audit trail
// ═══════════════════════════════════════════════════════════════════════════

export function useLeaderboardAudit() {
  return useQuery<LeaderboardAuditEntry[]>({
    queryKey: ['leaderboard_audit'],
    queryFn: async () => {
      const data = await fetchWithAuth('/data/leaderboard_audit?order=created_at.desc') as LeaderboardAuditEntry[];
      return data;
    },
  });
}

export function useCreateLeaderboardAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entry: Omit<LeaderboardAuditEntry, 'id' | 'created_at'>) =>
      fetchWithAuth('/data/leaderboard_audit', { method: 'POST', body: JSON.stringify(entry) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaderboard-audit'] });
    },
  });
}

export function useBatches() {
  return useQuery<Batch[]>({
    queryKey: ['batches'],
    queryFn: () => fetchWithAuth('/data/batches?sort=batch_name&order=asc'),
  });
}

export function useStudentBatches() {
  return useQuery<StudentBatch[]>({
    queryKey: ['student-batches'],
    queryFn: () => fetchWithAuth('/data/student_batches'),
  });
}

