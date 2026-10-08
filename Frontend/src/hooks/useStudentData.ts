import { fetchWithAuth } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Course, CourseResource } from './useInstructorData';

interface ExamScheduleData {
    title: string;
    description: string;
    duration_minutes: number;
    total_marks: number;
    scheduled_date?: string;
}

interface MockTestData {
    title: string;
    description: string;
    duration_minutes: number;
    total_marks: number;
    question_count: number;
    scheduled_date?: string;
}

export function useStudentEnrollments() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['student-enrollments', user?.id],
        queryFn: () => fetchWithAuth(`/data/course_enrollments?user_id=eq.${user?.id}`),
        enabled: !!user?.id,
    });
}

export interface StudentStats {
    user_id: string;
    total_score: number;
    completed_courses: number;
    total_watch_minutes: number;
    badges: string[];
    user?: {
        full_name?: string;
    }
}

export function useStudentStats() {
    const { user } = useAuth();

    return useQuery<StudentStats | null>({
        queryKey: ['student-stats', user?.id],
        queryFn: async () => {
            const data = await fetchWithAuth(`/data/leaderboard_stats?user_id=eq.${user?.id}`) as StudentStats[];
            return data[0] || null;
        },
        enabled: !!user?.id,
    });
}

export function useStudentExams() {
    const { user } = useAuth();
    return useQuery<StudentExam[]>({
        queryKey: ['student-exams', user?.id],
        queryFn: async () => {
            const accessible = await fetchWithAuth<AccessibleExam[]>('/student/accessible-exams');
            return accessible
                .filter((a) => a.exam_id && a.exam_schedules)
                .map((a) => {
                    const sched = a.exam_schedules as unknown as ExamScheduleData;
                    return {
                        id: a.exam_id!,
                        title: sched.title,
                        description: sched.description,
                        duration_minutes: sched.duration_minutes,
                        total_marks: sched.total_marks,
                        is_completed: !!a.is_completed,
                        assigned_image: a.assigned_image,
                        scheduled_date: sched.scheduled_date
                    };
                });
        },
        enabled: !!user?.id,
        refetchInterval: 30000,
    });
}

export function useStudentMockPapers() {
    const { user } = useAuth();
    return useQuery<StudentExam[]>({
        queryKey: ['student-mock-papers', user?.id],
        queryFn: async () => {
            const accessible = await fetchWithAuth<AccessibleExam[]>('/student/accessible-exams');
            return accessible
                .filter((a) => a.mock_paper_id && a.mock_papers)
                .map((a) => {
                    const mock = a.mock_papers as unknown as MockTestData;
                    return {
                        id: a.mock_paper_id!,
                        title: mock.title,
                        description: mock.description,
                        duration_minutes: mock.duration_minutes,
                        total_marks: mock.total_marks,
                        is_completed: !!a.is_completed,
                        assigned_image: a.assigned_image,
                        scheduled_date: mock.scheduled_date
                    };
                });
        },
        enabled: !!user?.id,
        refetchInterval: 30000,
    });
}

export interface Question {
    id: string;
    type?: string;
    question_type?: string;
    question_text?: string;
    text?: string;
    description?: string;
    language?: string;
    difficulty?: string;
    input_format?: string;
    output_format?: string;
    explanation?: string;
    constraints?: string;
    sample_input?: string;
    sample_output?: string;
    test_cases?: { input: string; expected_output: string; explanation?: string; is_hidden?: boolean }[];
    options?: (string | { id?: string; text: string })[];
}

export function useExamQuestions(id: string | null) {
    return useQuery<Question[]>({
        queryKey: ['exam-questions', id],
        queryFn: async () => {
            if (!id) return [];
            return await fetchWithAuth<Question[]>(`/student/exam-questions/${id}`);
        },
        enabled: !!id,
        staleTime: Infinity, // Keep questions during exam session
    });
}

export function useStudentAnnouncements() {
    const { user } = useAuth();

    return useQuery<Announcement[]>({
        queryKey: ['announcements'],
        queryFn: () => fetchWithAuth<Announcement[]>('/data/announcements?order=created_at.desc&limit=5'),
        enabled: !!user?.id,
    });
}

export function useLeaderboard() {
    const { user } = useAuth();

    return useQuery<LeaderboardEntry[]>({
        queryKey: ['leaderboard_stats'],
        queryFn: () => fetchWithAuth<LeaderboardEntry[]>('/data/leaderboard_stats?order=total_score.desc&limit=10'),
        enabled: !!user?.id,
    });
}

export function useLiveClasses() {
    const { user } = useAuth();

    return useQuery<LiveClass[]>({
        queryKey: ['student-live-classes'],
        queryFn: () => fetchWithAuth<LiveClass[]>('/data/live_classes?order=scheduled_at.asc'),
        enabled: !!user?.id,
    });
}

export interface Enrollment {
    id: string;
    user_id: string;
    course_id: string;
    enrolled_at: string;
    status: string;
    progress_percentage: number;
}

export interface Announcement {
    id: string;
    title: string;
    content: string;
    created_at: string;
}

export interface AccessibleExam {
    exam_id?: string;
    mock_paper_id?: string;
    exam_schedules?: Record<string, unknown>;
    mock_papers?: Record<string, unknown>;
    is_completed?: boolean;
    assigned_image?: string;
}

export interface StudentExam {
    id: string;
    title: string;
    description: string;
    duration_minutes: number;
    total_marks: number;
    is_completed: boolean;
    assigned_image?: string;
    scheduled_date?: string;
}

export interface LeaderboardEntry {
    id: string;
    user_id: string | {
        id: string;
        full_name?: string;
        avatar_url?: string;
        email?: string;
    };
    exams_completed: number;
    total_score: number;
}

export interface LiveClass {
    id: string;
    course_id?: string;
    title: string;
    scheduled_at: string;
    duration_minutes: number;
    status: string;
    meeting_id?: string;
    meeting_password?: string;
    description?: string;
    poster_url?: string;
    target_batch?: string;
}

export interface StudentCourse extends Course {
    progress: number;
    enrollmentStatus: string;
    enrollmentId: string;
    final_price?: number;
    payment_term?: string;
    remaining_balance?: number;
    enrolled_at?: string;
    category: string | null;
    // Flattened fields from backend /student/my-courses
    course_id?: string | { id?: string; _id?: string; title?: string; thumbnail_url?: string }; // To support both flat and legacy nested
    instructor_id?: string;
    instructor_name?: string;
    instructor_avatar?: string;
}

export function useEnrolledCourses() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['enrolled-courses-details', user?.id],
        queryFn: async () => {
            try {
                // Use the streamlined endpoint that already joins course details
                const data = await fetchWithAuth('/student/my-courses') as StudentCourse[];
                return data;
            } catch (error) {
                console.error("[StudentData Error] Failed fetching enrolled courses:", error);
                return [];
            }
        },
        enabled: !!user?.id,
        refetchInterval: 30000, // Refetch every 30s to catch admin approvals quickly
    });
}

export function useAvailableCourses() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['available-courses'],
        queryFn: async () => {
            try {
                // Unlimited view for all courses (published, pending, or active) for catalog discovery
                const data: Course[] = await fetchWithAuth('/data/courses?limit=100&sort=created_at&order=desc');
                let enrolledCourseIds = new Set<string>();

                if (user?.id) {
                    try {
                        const enrollments: Enrollment[] = await fetchWithAuth(`/data/course_enrollments?user_id=eq.${user.id}`);
                        enrolledCourseIds = new Set(enrollments.map(e => e.course_id));
                    } catch (err) {
                        console.warn('Could not fetch enrollments for filtering', err);
                    }
                }

                return data.map(course => ({
                        id: course.id,
                        title: course.title,
                        description: course.description,
                        category: course.category || 'Video Course',
                        status: course.status || 'published',
                        thumbnail_url: course.thumbnail_url,
                        instructor_id: course.instructor_id,
                        created_at: course.created_at,
                        price: course.price,
                        original_price: course.original_price,
                        enrollmentStatus: enrolledCourseIds.has(course.id) ? 'active' : undefined,
                        progress: 0
                    } as StudentCourse));
            } catch (error) {
                console.error("Failed fetching available courses:", error);
                return [];
            }
        }
    });
}

export function useEnrollCourse() {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({ courseId, payment_proof_url, utr_number, coupon_code, payment_term, requested_batch_type, requested_batch_id }: { courseId: string, payment_proof_url?: string | null, utr_number?: string | null, coupon_code?: string, payment_term?: string, requested_batch_type?: string, requested_batch_id?: string }) => {
            if (!user?.id) throw new Error("Not logged in");
            return fetchWithAuth('/courses/enroll', {
                method: 'POST',
                body: JSON.stringify({
                    courseId,
                    payment_proof_url,
                    utr_number,
                    coupon_code,
                    payment_term,
                    requested_batch_type,
                    requested_batch_id
                })
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['enrolled-courses-details'] });
            queryClient.invalidateQueries({ queryKey: ['available-courses'] });
            queryClient.invalidateQueries({ queryKey: ['student-stats'] });
        }
    });
}


export function useStudentVideoProgress(courseId: string | null) {
    const { user } = useAuth();
    return useQuery({
        queryKey: ['student-video-progress', courseId, user?.id],
        queryFn: async () => {
            if (!courseId || !user?.id) return [];
            return await fetchWithAuth(`/student/video-progress/${courseId}`);
        },
        enabled: !!courseId && !!user?.id,
        staleTime: 1000 * 60 * 5,
    });
}

export function useUpdateVideoProgress() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ courseId, videoId, watchedSeconds, totalSeconds }: { courseId: string, videoId: string, watchedSeconds: number, totalSeconds: number }) => {
            return fetchWithAuth('/student/video-progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId, videoId, watchedSeconds, totalSeconds })
            });
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['student-video-progress', variables.courseId] });
            queryClient.invalidateQueries({ queryKey: ['enrolled-courses-details'] });
        }
    });
}


export function useStudentVideos(courseId: string | null) {
    return useQuery({
        queryKey: ['student-course-videos', courseId],
        queryFn: async () => {
            if (!courseId) return [];
            // Use generic data route which has automated ACL for student batch/enrollment scoping
            return await fetchWithAuth(`/data/course_videos?course_id=eq.${courseId}&sort=order_index&order=asc&limit=200`);
        },
        enabled: !!courseId,
    });
}

export function useStudentResources(courseId: string | null) {
    return useQuery({
        queryKey: ['student-course-resources', courseId],
        queryFn: async () => {
            if (!courseId) {
                return await fetchWithAuth('/data/course_resources?limit=100');
            }
            // Use generic data route with auto-ACL
            return await fetchWithAuth(`/data/course_resources?course_id=eq.${courseId}&limit=100`);
        },
        enabled: true,
    });
}

export function useStudentDashboardData() {
    const { user } = useAuth();

    return useQuery<StudentDashboardData>({
        queryKey: ['student-dashboard-stats', user?.id],
        queryFn: () => fetchWithAuth<StudentDashboardData>('/student/dashboard-data'),
        enabled: !!user?.id,
        refetchInterval: 60000,
    });
}

export interface StudentDashboardData {
    activity: { name: string; intensity: number }[]; // Unified with intensity
    resources: { 
        id: string; 
        asset_title: string; 
        resource_type: string; 
        file_url: string; 
        upload_format?: string;
        view_url?: string;
    }[];
    skills: { name: string; progress: number }[]; // Unified keys: name, progress
    results: {
        id: string;
        title: string;
        date: string;
        percentage: number;
        score: number;
        total: number;
    }[];
}



export function useStudentBatch(courseId: string | null) {
    const { user } = useAuth();
    return useQuery({
        queryKey: ['student-course-batch', courseId, user?.id],
        queryFn: async () => {
            if (!courseId || !user?.id) return null;
            return await fetchWithAuth(`/batches/my-batch/${courseId}`) as { 
                id: string; 
                batch_name: string; 
                batch_type: 'morning' | 'afternoon' | 'evening' | 'all'; 
                start_time: string; 
                end_time: string;
                requested_batch_type?: string;
            } | null;
        },
        enabled: !!courseId && !!user?.id,
    });
}

export function useAvailableBatches(courseId: string | null) {
    return useQuery({
        queryKey: ['available-batches', courseId],
        queryFn: async () => {
            if (!courseId) return [];
            return await fetchWithAuth(`/batches/course/${courseId}`) as {
                id: string;
                batch_name: string;
                batch_type: 'morning' | 'afternoon' | 'evening' | 'all';
                start_time: string; 
                end_time: string;
            }[];
        },
        enabled: !!courseId,
    });
}

export function useRequestBatchAssignment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ courseId, batchId, session_type }: { courseId: string, batchId: string, session_type?: string }) => {
            return fetchWithAuth(`/batches/request/${courseId}`, {
                method: 'POST',
                body: JSON.stringify({ batch_id: batchId, session_type })
            });
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['student-course-batch', variables.courseId] });
            queryClient.invalidateQueries({ queryKey: ['enrolled-courses-details'] });
        }
    });
}
