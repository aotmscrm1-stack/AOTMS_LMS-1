import { fetchWithAuth, API_URL } from "@/lib/api";
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface Course {
  rejectionReason: string;
  id: string;
  _id?: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string | null;
  thumbnail_url: string | null;
  image?: string | null;
  instructor_id?: string | null; // Legacy
  instructor_ids?: string[]; // New array
  instructors?: { id: string; full_name: string; avatar_url: string }[]; // New populated format
  created_at: string | null;
  level?: string | null;
  duration?: string | null;
  duration_hours?: number;
  price?: number;
  original_price?: number;
  occupied_sessions?: string[];
  assigned_session?: 'morning' | 'afternoon' | 'evening' | 'all';
  assigned_batch_id?: string;
}

export interface LiveClass {
  id: string;
  instructor_id: string;
  course_id: string | null;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  meeting_id: string | null;
  meeting_url: string | null;
  start_url: string | null;
  meeting_password?: string;
  poster_url?: string | null;
  status: string;
  target_batch?: string;
}

export interface CourseTopic {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_completed: boolean;
  completed_at: string | null;
  duration_minutes: number;
}

export interface CourseVideo {
  id: string;
  course_id: string;
  topic_id: string | null;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  duration_seconds: number;
  order_index: number;
  is_published: boolean;
  allowed_batches: string[];
}

export interface CourseResource {
  id: string;
  course_id: string;
  upload_format: string;
  asset_title: string;
  resource_type: string;
  short_description: string | null;
  category?: string;
  instructor_avatar_url: string | null;
  instructor_name: string | null;
  file_url: string;
  allowed_batches: string[];
  created_at?: string;
}

export interface CourseTimeline {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  milestone_type: string;
  scheduled_date: string;
  is_completed: boolean;
  completed_at: string | null;
  allowed_batches: string[];
}

export interface CourseAnnouncement {
  id: string;
  course_id: string;
  instructor_id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  allowed_batches: string[];
  created_at: string | null;
}

export interface CourseRating {
  id: string;
  course_id: string | { id?: string; _id?: string; title?: string; thumbnail_url?: string };
  user_id: string | { id?: string; _id?: string; full_name?: string; avatar_url?: string };
  rating: number;
  review: string | null;
  created_at: string;
  course_title?: string;
  user_name?: string;
  user_avatar?: string | null;
  _id?: string;
}

export interface InstructorStats {
  totalStudents: number;
  totalCourses: number;
  activeCourses: number;
  enrolledCourses: number;
  rating: number;
  revenue: number;
  completionRate: number;
  monthlyProgress: Array<{ month: string; value: number }>;
}

export interface Playlist {
  id: string;
  youtube_url: string;
  title: string;
  description: string | null;
  created_by: string;
  created_at: string;
}

export interface PlaylistVideo {
  id?: string;
  playlist_id: string;
  youtube_url: string;
  title: string;
  description: string | null;
  created_at?: string;
  is_locked?: boolean;
  is_premium?: boolean;
  is_prerequisite?: boolean;
  module_index?: number;
  total_views?: number;
  average_watch_time_seconds?: number;
  completion_rate?: number;
  drop_off_time_seconds?: number;
  drop_off_percentage?: number;
}

export interface PlaylistEnrollment {
  id: string;
  playlist_id: string;
  user_id: string;
  progress_percentage?: number;
  completed_videos?: number;
  last_watched_at?: string;
  enrolled_at?: string;
  user_name?: string;
  user_email?: string;
  current_video_title?: string;
}

export interface WatchEvent {
  id: string;
  video_id: string;
  user_id: string;
  watch_time_seconds?: number;
  completed?: boolean;
  created_at?: string;
  drop_off_seconds?: number;
}

export interface EnrollmentData {
    id?: string;
    _id?: string;
    user_id: string | { id?: string; _id?: string; full_name?: string; email?: string; avatar_url?: string; phone?: string; };
    course_id: string | { id?: string; _id?: string; title?: string; };
    progress_percentage?: number;
    last_accessed_at?: string;
    enrolled_at?: string;
    user_full_name?: string;
    user_email?: string;
    user_avatar?: string;
}

export interface BatchAssignmentData {
    id?: string;
    _id?: string;
    student_id: string;
    course_id: string;
    batch_id: {
        id?: string;
        _id?: string;
        batch_type?: string;
        batch_name?: string;
    };
    assigned_session?: string;
    assigned_time_slot?: string;
}

export interface Batch {
  id: string;
  _id?: string;
  course_id: string | any;
  instructor_id: string | any;
  batch_name: string;
  batch_type: string;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
}

export interface ResumeScan {
  id?: string;
  _id?: string;
  user_id?: string | { id?: string, _id?: string };
  score?: number;
  created_at?: string;
}

export interface Profile {
  id: string;
  user_id: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
  mobile_number?: string;
  college_name?: string;
  institute_name?: string;
  ats_credits?: number;
  approval_status?: string;
  city?: string;
  district?: string;
  country?: string;
  full_address?: string;
  latitude?: number;
  longitude?: number;
}

export interface Assignment {
  id: string;
  course_id: string;
  instructor_id: string;
  title: string;
  description: string | null;
  module_id: string | null;
  submission_types: string[];
  max_marks: number;
  deadline: string;
  allow_late_submissions: boolean;
  late_penalty_percentage: number;
  status: "draft" | "active" | "closed" | "archived";
  reference_files: { name: string; url: string }[];
  created_at: string;
  updated_at: string;
}

export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  submission_data: { type: string; content: string; file_url?: string };
  submitted_at: string;
  status: "pending" | "graded" | "late";
  score: number | null;
  feedback: string | null;
  feedback_files: { name: string; url: string }[];
  is_plagiarism_flagged: boolean;
  plagiarism_score: number;
  student_name?: string;
}

export function useInstructorCourses() {
  const { user, userRole } = useAuth();

  return useQuery({
    queryKey: ["instructor-courses", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return fetchWithAuth<Course[]>("/instructor/courses");
    },
    enabled:
      !!user?.id &&
      (userRole === "instructor" ||
        userRole === "admin" ||
        userRole === "manager"),
    staleTime: 1000 * 30, // 30 seconds to stay fresh
    refetchOnMount: true,
  });
}

export function useInstructorPlaylists() {
  const { user, userRole } = useAuth();

  return useQuery({
    queryKey: ["instructor-playlists", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return fetchWithAuth(`/data/playlists?created_by=${user.id}`);
    },
    enabled:
      !!user?.id &&
      (userRole === "instructor" ||
        userRole === "admin" ||
        userRole === "manager"),
  });
}

export function usePlaylistVideos(playlistId: string | null) {
  return useQuery({
    queryKey: ["playlist-videos", playlistId],
    queryFn: async () => {
      if (!playlistId) return [];
      return fetchWithAuth(`/data/playlist_videos?playlist_id=${playlistId}`);
    },
    enabled: !!playlistId,
  });
}

export function useTopics(courseId: string | null) {
  return useQuery({
    queryKey: ["course-topics", courseId],
    queryFn: async () => {
      if (!courseId) return [];
      return fetchWithAuth<CourseTopic[]>(`/data/course_topics?course_id=eq.${courseId}`);
    },
    enabled: !!courseId,
  });
}

export function useVideos(courseId: string | null) {
  return useQuery({
    queryKey: ["course-videos", courseId],
    queryFn: async () => {
      if (!courseId) return [];
      return fetchWithAuth<CourseVideo[]>(`/data/course_videos?course_id=eq.${courseId}`);
    },
    enabled: !!courseId,
  });
}

export function useResources(courseId: string | null) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["course-resources", courseId],
    queryFn: async () => {
      if (!courseId) return [];
      return fetchWithAuth<CourseResource[]>(`/data/course_resources?course_id=eq.${courseId}`);
    },
    enabled: !!courseId,
  });
}

export function useTimeline(courseId: string | null) {
  return useQuery({
    queryKey: ["course-timeline", courseId],
    queryFn: async () => {
      if (!courseId) return [];
      return fetchWithAuth<CourseTimeline[]>(`/data/course_timeline?course_id=eq.${courseId}`);
    },
    enabled: !!courseId,
  });
}

export function useAnnouncements(courseId: string | null) {
  return useQuery({
    queryKey: ["course-announcements", courseId],
    queryFn: async () => {
      if (!courseId) return [];
      return fetchWithAuth<CourseAnnouncement[]>(
        `/data/course_announcements?course_id=eq.${courseId}`,
      );
    },
    enabled: !!courseId,
  });
}

export interface RosterStudent {
  student_id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  role: string;
  batch: {
    id: string;
    name: string;
    type: string;
    session?: string;
  } | null;
}

export interface GroupedRoster {
  morning: RosterStudent[];
  afternoon: RosterStudent[];
  evening: RosterStudent[];
  all: RosterStudent[];
  unassigned: RosterStudent[];
}

export interface StudentRosterEntry {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  mobile_number: string | null;
  progress: number;
  enrolled_at: string;
}

export function useBatchStudents(courseId: string | null, batchType: string | null, batchId?: string | null) {
  return useQuery<StudentRosterEntry[]>({
    queryKey: ['batch-students', courseId, batchType, batchId],
    queryFn: async () => {
      if (!courseId || (!batchType && !batchId)) return [];
      
      let url = batchType === 'all' && !batchId
        ? `/courses/${courseId}/roster`
        : `/instructor/courses/${courseId}/batch/${batchType || 'any'}/students`;
        
      if (batchId && batchId !== 'all') {
        url += (url.includes('?') ? '&' : '?') + `batch_id=${batchId}`;
      }
      
      return fetchWithAuth(url);
    },
  });
}

export function useCourseBatches(courseId: string | null) {
  return useQuery<Batch[]>({
    queryKey: ["course-batches", courseId],
    queryFn: async () => {
      if (!courseId) return [];
      return fetchWithAuth<Batch[]>(`/batches?course_id=${courseId}`);
    },
    enabled: !!courseId,
  });
}

export function useCourseRoster(courseId: string | null) {
  return useQuery<GroupedRoster>({
    queryKey: ["course-roster", courseId],
    queryFn: async () => {
      if (!courseId) return { morning: [], afternoon: [], evening: [], all: [], unassigned: [] };
      return fetchWithAuth(`/batches/course-roster/${courseId}`);
    },
    enabled: !!courseId,
  });
}

// Mutations
export function useCreateTopic() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async (
        topic: Omit<CourseTopic, "id" | "is_completed" | "completed_at">,
      ) => {
        return fetchWithAuth(`/courses/${topic.course_id}/topics`, {
          method: "POST",
          body: JSON.stringify(topic),
        });
      },
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({
          queryKey: ["course-topics", variables.course_id],
        });
        toast({ title: "Topic created successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error creating topic",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useUpdateTopic() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async ({
        id,
        ...updates
      }: Partial<CourseTopic> & { id: string; course_id: string }) => {
        return fetchWithAuth(`/topics/${id}`, {
          // Assuming direct resource access or use nested route if preferred
          method: "PUT",
          body: JSON.stringify(updates),
        });
      },
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({
          queryKey: [
            "course-topics",
            (variables as { course_id: string }).course_id,
          ],
        });
        toast({ title: "Topic updated successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error updating topic",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useDeleteTopic() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async ({ id }: { id: string; course_id: string }) => {
        await fetchWithAuth(`/topics/${id}`, { method: "DELETE" });
      },
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({
          queryKey: ["course-topics", variables.course_id],
        });
        toast({ title: "Topic deleted successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error deleting topic",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useCreateVideo() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async (video: Omit<CourseVideo, "id">) => {
        return fetchWithAuth(`/courses/${video.course_id}/videos`, {
          method: "POST",
          body: JSON.stringify(video),
        });
      },
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({
          queryKey: ["course-videos", variables.course_id],
        });
        toast({ title: "Video added successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error adding video",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useDeleteVideo() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async ({ id, courseId }: { id: string; courseId: string }) => {
        await fetchWithAuth(`/videos/${id}`, { method: "DELETE" });
        return courseId;
      },
      onSuccess: (courseId) => {
        queryClient.invalidateQueries({ queryKey: ["course-videos", courseId] });
        toast({ title: "Video deleted successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error deleting video",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useCreateResource() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async (resource: Omit<CourseResource, "id">) => {
        return fetchWithAuth(`/courses/${resource.course_id}/resources`, {
          method: "POST",
          body: JSON.stringify(resource),
        });
      },
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({
          queryKey: ["course-resources", variables.course_id],
        });
        toast({ title: "Resource added successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error adding resource",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useDeleteResource() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async ({ id, courseId }: { id: string; courseId: string }) => {
        await fetchWithAuth(`/resources/${id}`, { method: "DELETE" });
        return courseId;
      },
      onSuccess: (courseId) => {
        queryClient.invalidateQueries({
          queryKey: ["course-resources", courseId],
        });
        toast({ title: "Resource deleted successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error deleting resource",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useUpdateResource() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async ({
        id,
        courseId,
        updates,
      }: {
        id: string;
        courseId: string;
        updates: Partial<CourseResource>;
      }) => {
        return fetchWithAuth(`/resources/${id}`, {
          method: "PUT",
          body: JSON.stringify(updates),
        });
      },
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({
          queryKey: ["course-resources", variables.courseId],
        });
        toast({ title: "Resource updated successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error updating resource",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useCreateTimeline() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async (
        timeline: Omit<CourseTimeline, "id" | "is_completed" | "completed_at">,
      ) => {
        return fetchWithAuth(`/courses/${timeline.course_id}/timeline`, {
          method: "POST",
          body: JSON.stringify(timeline),
        });
      },
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({
          queryKey: ["course-timeline", variables.course_id],
        });
        toast({ title: "Timeline milestone added" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error adding milestone",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useDeleteTimeline() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async ({ id, courseId }: { id: string; courseId: string }) => {
        await fetchWithAuth(`/timeline/${id}`, { method: "DELETE" });
        return courseId;
      },
      onSuccess: (courseId) => {
        queryClient.invalidateQueries({
          queryKey: ["course-timeline", courseId],
        });
        toast({ title: "Milestone deleted successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error deleting milestone",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useCreateAnnouncement() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async (
        announcement: Omit<CourseAnnouncement, "id" | "created_at">,
      ) => {
        return fetchWithAuth(`/courses/${announcement.course_id}/announcements`, {
          method: "POST",
          body: JSON.stringify(announcement),
        });
      },
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({
          queryKey: ["course-announcements", variables.course_id],
        });
        toast({ title: "Announcement posted successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error posting announcement",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useDeleteAnnouncement() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async ({ id, courseId }: { id: string; courseId: string }) => {
        await fetchWithAuth(`/announcements/${id}`, { method: "DELETE" });
        return courseId;
      },
      onSuccess: (courseId) => {
        queryClient.invalidateQueries({
          queryKey: ["course-announcements", courseId],
        });
        toast({ title: "Announcement deleted successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error deleting announcement",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useCreatePlaylist() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { user } = useAuth();

    return useMutation({
      mutationFn: async (playlist: Omit<Playlist, "id" | "created_at">) => {
        return fetchWithAuth("/data/playlists", {
          method: "POST",
          body: JSON.stringify(playlist),
        });
      },
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: ["instructor-playlists", user?.id],
        });
        toast({ title: "Playlist created successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error creating playlist",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useCreatePlaylistVideo() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { user } = useAuth();

    return useMutation({
      mutationFn: async (video: Omit<PlaylistVideo, "id" | "created_at">) => {
        return fetchWithAuth("/data/playlist_videos", {
          method: "POST",
          body: JSON.stringify(video),
        });
      },
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({
          queryKey: ["instructor-playlists", user?.id],
        }); // Could also invalidate a specific list of videos
        toast({ title: "Video uploaded successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error uploading video",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  // File upload helpers
  export async function uploadVideo(
    file: File,
    courseId: string,
  ): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);

    const token = localStorage.getItem("access_token");
    const res = await fetch(`${API_URL}/upload/course-videos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Upload failed");
    }

    const data = await res.json();
    return data.url;
  }

  export async function uploadResource(
    file: File,
    courseId: string,
  ): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);

    const token = localStorage.getItem("access_token");
    const res = await fetch(`${API_URL}/upload/course-resources`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Upload failed");
    }

    const data = await res.json();
    return data.url;
  }

  export async function uploadLivePoster(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);

    const token = localStorage.getItem("access_token");
    const res = await fetch(`${API_URL}/upload/live-posters`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Poster upload failed");
    }

    const data = await res.json();
    return data.url;
  }

  export function useInstructorStats() {
    const { data: courses } = useInstructorCourses();
    const { user } = useAuth();

    return useQuery({
      queryKey: ["instructor-stats", user?.id, courses?.length],
      queryFn: async () => {
        if (!courses || (courses as Course[]).length === 0) {
          return { totalStudents: 0, contentItems: 0, avgCompletion: 0 };
        }

        const courseIds = (courses as Course[]).map((c: Course) => c.id);
        if (courseIds.length === 0)
          return { totalStudents: 0, contentItems: 0, avgCompletion: 0 };

        const courseIdsInFormat = courseIds.join(",");

        // Fetch only enrollments/videos/resources for THIS instructor's courses
        const [enrollments, allVideos, allResources, assignments] = await Promise.all([
          fetchWithAuth<Record<string, unknown>[]>(
            `/data/course_enrollments?course_id=in.(${courseIdsInFormat})`,
          ),
          fetchWithAuth<Record<string, unknown>[]>(
            `/data/course_videos?course_id=in.(${courseIdsInFormat})`,
          ),
          fetchWithAuth<Record<string, unknown>[]>(
            `/data/course_resources?course_id=in.(${courseIdsInFormat})`,
          ),
          fetchWithAuth<any[]>(
            `/batches/student-assignments?course_id=in.(${courseIdsInFormat})`,
          ),
        ]);

        // --- SECURITY & ACCURACY: Filter students by their batch assignments ---
        // Since our backend now filters assignments by instructor, this set will only contain
        // students assigned to THIS instructor's batches.
        const assignedStudentIds = new Set(assignments.map(a => a.student_id));
        const myStudents = enrollments.filter(e => {
            const uid = typeof e.user_id === 'string' ? e.user_id : (e.user_id as any)?.id || (e.user_id as any)?._id;
            return assignedStudentIds.has(uid);
        });

        const totalStudents = myStudents.length;
        const contentItems = allVideos.length + allResources.length;

        const avgCompletion =
          myStudents.length > 0
            ? Math.round(
              myStudents.reduce(
                (acc: number, e: { progress_percentage: number }) =>
                  acc + (e.progress_percentage || 0),
                0,
              ) / myStudents.length,
            )
            : 0;

        return {
          totalStudents,
          contentItems,
          avgCompletion,
        };
      },
      enabled: !!courses && (courses as Course[]).length > 0 && !!user?.id,
      staleTime: 60000 * 5, // 5 minutes cache
    });
  }

  export function useUpdatePlaylistVideo() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async ({
        id,
        ...updates
      }: Partial<PlaylistVideo> & { id: string }) => {
        return fetchWithAuth(`/data/playlist_videos/${id}`, {
          method: "PUT",
          body: JSON.stringify(updates),
        });
      },
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({
          queryKey: ["playlist-videos", variables.playlist_id],
        });
        toast({ title: "Video updated successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error updating video",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useDeletePlaylistVideo() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async ({
        id,
        playlistId,
      }: {
        id: string;
        playlistId: string;
      }) => {
        await fetchWithAuth(`/data/playlist_videos/${id}`, { method: "DELETE" });
        return playlistId;
      },
      onSuccess: (playlistId) => {
        queryClient.invalidateQueries({
          queryKey: ["playlist-videos", playlistId],
        });
        toast({ title: "Video deleted successfully", variant: "destructive" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error deleting video",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export interface PlaylistAnalytics {
    playlistId: string;
    totalVideos: number;
    totalDurationMinutes: number;
    enrolledStudents: number;
    completionRate: number;
  }

  export function usePlaylistAnalytics(playlistId: string | null) {
    return useQuery({
      queryKey: ["playlist-analytics", playlistId],
      queryFn: async () => {
        if (!playlistId) return null;

        const videos = await fetchWithAuth<PlaylistVideo[]>(
          `/data/playlist_videos?playlist_id=${playlistId}`,
        );
        const enrollments = await fetchWithAuth<PlaylistEnrollment[]>(
          `/data/playlist_enrollments?playlist_id=${playlistId}`,
        );

        const totalVideos = videos.length;
        const enrolledStudents = enrollments.length;
        const completionRate =
          enrollments.length > 0
            ? Math.round(
              enrollments.reduce(
                (acc: number, e: PlaylistEnrollment) => acc + (e.progress_percentage || 0),
                0,
              ) / enrollments.length,
            )
            : 0;

        return {
          playlistId,
          totalVideos,
          totalDurationMinutes: 0,
          enrolledStudents,
          completionRate,
        } as PlaylistAnalytics;
      },
      enabled: !!playlistId,
    });
  }

  export interface VideoAnalytics {
    videoId: string;
    videoTitle: string;
    totalViews: number;
    averageWatchTimeSeconds: number;
    completionRate: number;
    dropOffTimeSeconds: number;
    dropOffPercentage: number;
    viewsTrend?: number;
    watchTimeTrend?: number;
    completionTrend?: number;
  }

  export interface StudentWatchData {
    id: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    watchedPercentage: number;
    lastWatchedAt: string;
    status: "completed" | "watching" | "stuck";
  }

  export function useVideoAnalytics(videoId: string | null) {
    return useQuery({
      queryKey: ["video-analytics", videoId],
      queryFn: async () => {
        if (!videoId) return null;

        const watchData = await fetchWithAuth<WatchEvent[]>(
          `/data/video_watch_events?video_id=${videoId}`,
        );

        const totalViews = watchData.length;
        const averageWatchTimeSeconds =
          watchData.length > 0
            ? watchData.reduce(
              (acc: number, w: WatchEvent) =>
                acc + (w.watch_time_seconds || 0),
              0,
            ) / watchData.length
            : 0;
        const completedViews = watchData.filter(
          (w: WatchEvent) => w.completed,
        ).length;
        const completionRate =
          totalViews > 0 ? Math.round((completedViews / totalViews) * 100) : 0;

        const dropOffTimes = watchData.map(
          (w: WatchEvent) => w.drop_off_seconds || 0,
        );
        const dropOffTimeSeconds =
          dropOffTimes.length > 0
            ? dropOffTimes.reduce((acc: number, t: number) => acc + t, 0) /
            dropOffTimes.length
            : 0;
        const dropOffPercentage =
          totalViews > 0
            ? Math.round(((totalViews - completedViews) / totalViews) * 100)
            : 0;

        return {
          videoId,
          videoTitle: "",
          totalViews,
          averageWatchTimeSeconds,
          completionRate,
          dropOffTimeSeconds,
          dropOffPercentage,
        } as VideoAnalytics;
      },
      enabled: !!videoId,
    });
  }

  export interface StudentProgress {
    id: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    avatarUrl?: string;
    enrolledAt: string;
    lastActiveAt: string;
    overallProgress: number;
    completedModules: number;
    totalModules: number;
    currentModuleIndex: number;
    currentVideoTitle?: string;
    watchedPercentage: number;
    status: "completed" | "active" | "stuck" | "inactive";
    timeSpentMinutes: number;
  }

  export function usePlaylistStudentProgress(playlistId: string | null) {
    return useQuery({
      queryKey: ["playlist-student-progress", playlistId],
      queryFn: async () => {
        if (!playlistId) return [];

        const enrollments = await fetchWithAuth<PlaylistEnrollment[]>(
          `/data/playlist_enrollments?playlist_id=${playlistId}`,
        );
        const videos = await fetchWithAuth<PlaylistVideo[]>(
          `/data/playlist_videos?playlist_id=${playlistId}`,
        );
        const totalModules = (videos || []).length;

        const students: StudentProgress[] = (enrollments || []).map(
          (enrollment: {
            id: string;
            user_id: string;
            user_name?: string;
            user_email?: string;
            progress_percentage?: number;
            completed_videos?: number;
            last_watched_at?: string;
            enrolled_at?: string;
            current_video_title?: string;
            time_spent_minutes?: number;
          }) => {
            const completedModules = enrollment.completed_videos || 0;
            const overallProgress = enrollment.progress_percentage || 0;

            let status: StudentProgress["status"] = "inactive";
            if (overallProgress === 100) {
              status = "completed";
            } else if (overallProgress > 0) {
              const daysSinceActive = enrollment.last_watched_at
                ? Math.floor(
                  (Date.now() -
                    new Date(enrollment.last_watched_at).getTime()) /
                  (1000 * 60 * 60 * 24),
                )
                : 0;
              status = daysSinceActive > 7 ? "stuck" : "active";
            }

            return {
              id: enrollment.id,
              studentId: enrollment.user_id,
              studentName: enrollment.user_name || "Unknown Student",
              studentEmail: enrollment.user_email || "",
              enrolledAt: enrollment.enrolled_at || new Date().toISOString(),
              lastActiveAt:
                enrollment.last_watched_at ||
                enrollment.enrolled_at ||
                new Date().toISOString(),
              overallProgress,
              completedModules,
              totalModules,
              currentModuleIndex: Math.floor(
                (overallProgress / 100) * totalModules,
              ),
              currentVideoTitle: enrollment.current_video_title,
              watchedPercentage: overallProgress,
              status,
              timeSpentMinutes: enrollment.time_spent_minutes || 0,
            };
          },
        );

        return students;
      },
      enabled: !!playlistId,
    });
  }

  export function useSendReminder() {
    const { toast } = useToast();

    return useMutation({
      mutationFn: async ({
        studentId,
        playlistId,
      }: {
        studentId: string;
        playlistId: string;
      }) => {
        return fetchWithAuth("/data/send-reminder", {
          method: "POST",
          body: JSON.stringify({
            student_id: studentId,
            playlist_id: playlistId,
          }),
        });
      },
      onSuccess: () => {
        toast({ title: "Reminder sent successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error sending reminder",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export interface InstructorStudent {
    id: string;
    userId: string;
    name: string;
    email: string;
    avatarUrl?: string;
    mobileNumber?: string;
    enrolledCourses: number;

    completedCourses: number;
    inProgressCourses: number;
    totalWatchTimeMinutes: number;
    lastActiveAt: string;
    overallProgress: number;
    status: "active" | "inactive" | "at-risk" | "completed";
    enrolledAt: string;
    certificates: number;
    atsScore?: number;
    courseEnrollments: {
      courseId: string;
      courseTitle: string;
      progress: number;
      lastWatchedAt: string;
      batchType?: string;
      batchName?: string;
    }[];
  }

  export interface VideoProgressDetail {
    _id: string;
    user_id: string;
    course_id: string;
    video_id: string;
    watched_seconds: number;
    total_seconds: number;
    completed: boolean;
    last_watched_at: string;
  }

  export function useStudentVideoProgress(
    studentId: string | undefined,
    courseId?: string,
  ) {
    const { user, userRole } = useAuth();

    return useQuery({
      queryKey: ["student-video-progress", studentId, courseId],
      queryFn: async () => {
        if (!studentId) return [];
        let url = `/instructor/student-progress/${studentId}`;
        if (courseId) {
          url += `?courseId=${courseId}`;
        }
        return fetchWithAuth(url);
      },
      enabled:
        !!studentId &&
        (userRole === "instructor" ||
          userRole === "admin" ||
          userRole === "manager"),
    });
  }

  export function useInstructorAllStudents() {
    const { user, userRole } = useAuth();

    return useQuery({
      queryKey: ["instructor-all-students", user?.id],
      queryFn: async () => {
        if (!user?.id) return [];

        // 1. Fetch instructor's courses using the robust dedicated endpoint
        const courses =
          (await fetchWithAuth<Course[]>("/instructor/courses")) || [];
        const courseIds = courses.map((c) => c.id || c._id).filter(Boolean);

        if (courseIds.length === 0) return [];

        // 2. Fetch enrollments and batch assignments for these courses
        const [allEnrollments, allBatchAssignments, allResumeScans] =
          await Promise.all([
            fetchWithAuth<EnrollmentData[]>(
              `/data/course_enrollments?course_id=in.(${courseIds.join(",")})`,
            ).catch((e) => {
              console.error(
                "[useInstructorAllStudents] Enrollments fetch failed:",
                e,
              );
              return [] as EnrollmentData[];
            }),
            fetchWithAuth<BatchAssignmentData[]>(
              `/batches/student-assignments?course_id=in.(${courseIds.join(",")})`,
            ).catch((e) => {
              console.error(
                "[useInstructorAllStudents] Batch assignments fetch failed:",
                e,
              );
              return [] as BatchAssignmentData[];
            }),
            fetchWithAuth<ResumeScan[]>("/admin/resume-scans").catch(
              (e: Error) => {
                console.error(
                  "[useInstructorAllStudents] Resume scans fetch failed:",
                  e,
                );
                return [] as ResumeScan[];
              },
            ),
          ]);

        const studentMap = new Map<string, InstructorStudent>();

        allEnrollments.forEach((enrollment) => {
          const u = enrollment.user_id;
          const userId = typeof u === "string" ? u : u?.id || u?._id?.toString();

          if (!userId) {
            console.warn(
              "[useInstructorAllStudents] Missing user_id for enrollment",
              enrollment._id || enrollment.id,
            );
            return;
          }

          // Skip if the student is the instructor themselves
          if (userId === user.id?.toString()) return;

          const course = enrollment.course_id;
          const courseTitle =
            typeof course === "object" && course?.title
              ? course.title
              : "Unknown Course";
          const courseId =
            typeof course === "string"
              ? course
              : course?._id?.toString() || course?.id;

          if (studentMap.has(userId)) {
            const existing = studentMap.get(userId)!;
            existing.enrolledCourses += 1;

            const progress = enrollment.progress_percentage || 0;
            if (progress === 100) {
              existing.completedCourses += 1;
            } else if (progress > 0) {
              existing.inProgressCourses += 1;
            }

            existing.overallProgress = Math.round(
              (existing.overallProgress * (existing.enrolledCourses - 1) +
                progress) /
              existing.enrolledCourses,
            );

            const lastWatched = new Date(
              enrollment.last_accessed_at || enrollment.enrolled_at,
            );
            const existingLastWatched = new Date(existing.lastActiveAt);
            if (lastWatched > existingLastWatched) {
              existing.lastActiveAt = lastWatched.toISOString();
            }

            const batchAssignment = allBatchAssignments?.find(
              (ba) => {
                const sId = typeof ba.student_id === "string" ? ba.student_id : (ba.student_id as any)?._id?.toString() || (ba.student_id as any)?.id;
                const cId = typeof ba.course_id === "string" ? ba.course_id : (ba.course_id as any)?._id?.toString() || (ba.course_id as any)?.id;
                return sId === userId && cId === courseId;
              }
            );

            existing.courseEnrollments.push({
              courseId: courseId,
              courseTitle: courseTitle,
              progress: progress,
              lastWatchedAt:
                enrollment.last_accessed_at || enrollment.enrolled_at,
              batchType: batchAssignment?.assigned_session || batchAssignment?.batch_id?.batch_type || 'unassigned',
              batchName: batchAssignment?.batch_id?.batch_name || 'Unassigned',
            });
          } else {
            const progress = enrollment.progress_percentage || 0;
            const status: InstructorStudent["status"] =
              progress === 100
                ? "completed"
                : progress > 0
                  ? "active"
                  : "inactive";

            const batchAssignment = allBatchAssignments?.find(
              (ba) => {
                const sId = typeof ba.student_id === "string" ? ba.student_id : (ba.student_id as any)?._id?.toString() || (ba.student_id as any)?.id;
                const cId = typeof ba.course_id === "string" ? ba.course_id : (ba.course_id as any)?._id?.toString() || (ba.course_id as any)?.id;
                return sId === userId && cId === courseId;
              }
            );

            studentMap.set(userId, {
              id: enrollment.id || enrollment._id || userId,
              userId: userId,
              name:
                typeof u === "object" && u?.full_name
                  ? u.full_name
                  : enrollment.user_full_name || "Student",
              email:
                typeof u === "object" && u?.email
                  ? u.email
                  : enrollment.user_email || "",
              avatarUrl:
                typeof u === "object" && u?.avatar_url
                  ? u.avatar_url
                  : enrollment.user_avatar,
              mobileNumber:
                typeof u === "object" && u?.phone ? u.phone : undefined,
              enrolledCourses: 1,
              completedCourses: progress === 100 ? 1 : 0,
              inProgressCourses: progress > 0 && progress < 100 ? 1 : 0,
              totalWatchTimeMinutes: 0,
              lastActiveAt:
                enrollment.last_accessed_at ||
                enrollment.enrolled_at ||
                new Date().toISOString(),
              overallProgress: progress,
              status,
              atsScore: allResumeScans?.find(
                (rs) => {
                  if (typeof rs.user_id === "object" && rs.user_id !== null) {
                    return rs.user_id._id === userId || rs.user_id.id === userId;
                  }
                  return rs.user_id === userId;
                }
              )?.score,
              enrolledAt: enrollment.enrolled_at || new Date().toISOString(),
              certificates: progress === 100 ? 1 : 0,
              courseEnrollments: [
                {
                  courseId: courseId,
                  courseTitle: courseTitle,
                  progress: progress,
                  lastWatchedAt:
                    enrollment.last_accessed_at || enrollment.enrolled_at,
                  batchType: batchAssignment?.assigned_session || batchAssignment?.batch_id?.batch_type || 'unassigned',
                  batchName: batchAssignment?.batch_id?.batch_name || 'Unassigned',
                },
              ],
            });
          }
        });

        // Convert map to array and deduplicate by email (handle different IDs with same email)
        const uniqueStudentsMap = new Map<string, InstructorStudent>();

        Array.from(studentMap.values()).forEach((student) => {
          const studentEmail = student.email?.toLowerCase().trim();

          // Only deduplicate by email IF we have a valid email.
          // Otherwise, use the unique userId to avoid merging different students with empty emails.
          const dedupeKey =
            studentEmail && studentEmail.length > 0
              ? studentEmail
              : student.userId;

          if (uniqueStudentsMap.has(dedupeKey)) {
            const existing = uniqueStudentsMap.get(dedupeKey)!;
            if (student.enrolledCourses > existing.enrolledCourses) {
              uniqueStudentsMap.set(dedupeKey, student);
            }
          } else {
            uniqueStudentsMap.set(dedupeKey, student);
          }
        });

        const students = Array.from(uniqueStudentsMap.values()).map((student) => {
          const daysSinceActive = Math.floor(
            (Date.now() - new Date(student.lastActiveAt).getTime()) /
            (1000 * 60 * 60 * 24),
          );

          let status: InstructorStudent["status"] = student.status;
          if (status !== "completed") {
            if (daysSinceActive > 14) {
              status = "inactive";
            } else if (daysSinceActive > 7) {
              status = "at-risk";
            } else if (daysSinceActive <= 1) {
              status = "active";
            }
          }

          return { ...student, status };
        });

        return students;
      },
      enabled:
        !!user?.id &&
        (userRole === "instructor" ||
          userRole === "admin" ||
          userRole === "manager"),
    });
  }

  export function useInstructorStudentStats() {
    const { data: students, isLoading } = useInstructorAllStudents();

    const stats = {
      totalStudents: 0,
      activeStudents: 0,
      completedStudents: 0,
      atRiskStudents: 0,
      inactiveStudents: 0,
      totalWatchTimeMinutes: 0,
      avgProgress: 0,
      totalEnrollments: 0,
    };

    if (students && students.length > 0) {
      stats.totalStudents = students.length;
      stats.activeStudents = students.filter((s) => s.status === "active").length;
      stats.completedStudents = students.filter(
        (s) => s.status === "completed",
      ).length;
      stats.atRiskStudents = students.filter(
        (s) => s.status === "at-risk",
      ).length;
      stats.inactiveStudents = students.filter(
        (s) => s.status === "inactive",
      ).length;
      stats.totalWatchTimeMinutes = students.reduce(
        (acc, s) => acc + s.totalWatchTimeMinutes,
        0,
      );
      stats.totalEnrollments = students.reduce(
        (acc, s) => acc + s.enrolledCourses,
        0,
      );
      stats.avgProgress = Math.round(
        students.reduce((acc, s) => acc + s.overallProgress, 0) / students.length,
      );
    }

    return { stats, isLoading };
  }

  export interface DoubtReply {
    id: string;
    doubt_id: string;
    user_id: string;
    user_name?: string;
    user_email?: string;
    answer: string;
    is_instructor: boolean;
    is_pinned: boolean;
    created_at: string;
  }

  export interface Doubt {
    id: string;
    playlist_id: string;
    video_id?: string;
    video_title?: string;
    user_id: string;
    student_name?: string;
    student_email?: string;
    question: string;
    status: "pending" | "answered" | "solved";
    is_pinned: boolean;
    created_at: string;
    replies?: DoubtReply[];
  }

  export function useDoubts(playlistId?: string | null) {
    const { user, userRole } = useAuth();

    return useQuery({
      queryKey: ["instructor-doubts", user?.id, playlistId],
      queryFn: async () => {
        if (!user?.id) return [];

        const playlists = await fetchWithAuth<Playlist[]>(
          `/data/playlists?created_by=${user.id}`,
        );
        const playlistIds = playlists.map((p: Playlist) => p.id);

        if (playlistIds.length === 0) return [];

        const allDoubts = await Promise.all(
          playlistIds.map(async (pid: string) => {
            const doubts = await fetchWithAuth<Doubt[]>(
              `/data/doubts?playlist_id=${pid}&order=created_at.desc`,
            );
            return doubts;
          }),
        );

        const doubts = allDoubts.flat();

        const doubtsWithReplies = await Promise.all(
          doubts.map(async (doubt: Doubt) => {
            const replies = await fetchWithAuth<DoubtReply[]>(
              `/data/doubt_replies?doubt_id=${doubt.id}&order=created_at.asc`,
            );
            return { ...doubt, replies };
          }),
        );

        return doubtsWithReplies as Doubt[];
      },
      enabled:
        !!user?.id &&
        (userRole === "instructor" ||
          userRole === "admin" ||
          userRole === "manager"),
    });
  }

  export function useReplyToDoubt() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { user } = useAuth();

    return useMutation({
      mutationFn: async ({
        doubt_id,
        answer,
        is_instructor,
      }: {
        doubt_id: string;
        answer: string;
        is_instructor: boolean;
      }) => {
        return fetchWithAuth("/data/doubt_replies", {
          method: "POST",
          body: JSON.stringify({
            doubt_id,
            user_id: user?.id,
            answer,
            is_instructor,
          }),
        });
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["instructor-doubts"] });
        toast({ title: "Reply posted successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error posting reply",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useMarkDoubtSolved() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async (doubt_id: string) => {
        return fetchWithAuth(`/data/doubts/${doubt_id}`, {
          method: "PUT",
          body: JSON.stringify({ status: "solved" }),
        });
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["instructor-doubts"] });
        toast({ title: "Doubt marked as solved" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error marking doubt as solved",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function usePinDoubtAnswer() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async ({
        doubt_id,
        reply_id,
      }: {
        doubt_id: string;
        reply_id: string;
      }) => {
        await fetchWithAuth(`/data/doubt_replies/${reply_id}`, {
          method: "PUT",
          body: JSON.stringify({ is_pinned: true }),
        });
        await fetchWithAuth(`/data/doubts/${doubt_id}`, {
          method: "PUT",
          body: JSON.stringify({ is_pinned: true }),
        });
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["instructor-doubts"] });
        toast({ title: "Answer pinned successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error pinning answer",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useDeleteDoubt() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async (doubt_id: string) => {
        await fetchWithAuth(`/data/doubts/${doubt_id}`, { method: "DELETE" });
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["instructor-doubts"] });
        toast({ title: "Doubt deleted successfully", variant: "destructive" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error deleting doubt",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useGrantAccess() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async ({
        courseId,
        studentId,
      }: {
        courseId: string;
        studentId: string;
      }) => {
        // First, check if the student profile exists (validation)
        const profiles = await fetchWithAuth<Profile[]>(
          `/data/profiles?id=eq.${studentId}`,
        );
        if (!profiles || profiles.length === 0) {
          throw new Error("Student UUID not found. Please verify the ID.");
        }

        return fetchWithAuth("/data/course_enrollments", {
          method: "POST",
          body: JSON.stringify({
            user_id: studentId,
            course_id: courseId,
            status: "active",
            progress_percentage: 0,
          }),
        });
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["instructor-courses"] });
        toast({
          title: "Access Granted",
          description:
            "The student has been successfully enrolled in this course.",
        });
      },
      onError: (error: Error) => {
        toast({
          title: "Enrollment Failed",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useStudentLookup(studentId: string) {
    return useQuery({
      queryKey: ["student-lookup", studentId],
      queryFn: async () => {
        if (!studentId || studentId.length < 32) return null;

        // Fetch profile and user details via backend
        // We'll use a specific endpoint or generic data endpoint
        const profiles = await fetchWithAuth<Profile[]>(
          `/data/profiles?id=eq.${studentId}`,
        );
        if (!profiles || profiles.length === 0) {
          throw new Error("Student not found");
        }

        const profile = profiles[0];

        // Since we need email which might be in auth.users, and our profile table
        // might have it or the backend /user/profile might help,
        // let's assume the profile at least has name and avatar.
        return {
          id: profile.id,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          // If email isn't in profiles, we might need a backend tweak or just show what we have
          email: profile.email || "Click to verify",
        };
      },
      enabled: !!studentId && studentId.length >= 32,
      retry: false,
    });
  }

  export function useInstructorLiveClasses() {
    const { user, userRole } = useAuth();
    const queryClient = useQueryClient();

    return useQuery({
      queryKey: ["instructor-live-classes", user?.id],
      queryFn: async () => {
        if (!user?.id) return [];
        const data = (await fetchWithAuth(
          `/data/live_classes?instructor_id=eq.${user.id}&order=scheduled_at.desc`,
        )) as LiveClass[];
        return data;
      },
      enabled:
        !!user?.id &&
        (userRole === "instructor" ||
          userRole === "admin" ||
          userRole === "manager"),
    });
  }

  export function useCreateLiveClass() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { user } = useAuth();

    return useMutation({
      mutationFn: async (payload: {
        topic: string;
        startTime: string;
        duration: number;
        agenda: string;
        courseId?: string;
        poster_url?: string;
        target_batch?: string;
        batchId?: string;
      }) => {
        if (!user?.id) throw new Error("You must be logged in to schedule meetings");

        // Create and Notify via specialized backend endpoint
        return fetchWithAuth("/instructor/live-classes", {
          method: "POST",
          body: JSON.stringify({
            instructor_id: user.id,
            course_id: payload.courseId || null,
            target_batch: payload.target_batch || 'all',
            batch_id: payload.batchId || null,
            title: payload.topic,
            description: payload.agenda,
            scheduled_at: payload.startTime,
            duration_minutes: payload.duration,
            poster_url: payload.poster_url || null,
            // Zoom metadata (sinceZoom creation happens on backend now for security)
            zoom: {
               topic: payload.topic,
               startTime: payload.startTime,
               duration: payload.duration,
               agenda: payload.agenda
            }
          }),
        });
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["instructor-live-classes"] });
        toast({
          title: "Meeting Scheduled!",
          description: "Your session and Zoom link have been generated.",
        });
      },
      onError: (error: Error) => {
        toast({
          title: "Zoom Error",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useDeleteLiveClass() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async (id: string) => {
        await fetchWithAuth(`/data/live_classes/${id}`, { method: "DELETE" });
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["instructor-live-classes"] });
        toast({ title: "Live class deleted successfully" });
      },
      onError: (error: Error) => {
        toast({
          title: "Error deleting live class",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  }

  export function useInstructorRatings() {
    const { user } = useAuth();
    const { data: courses } = useInstructorCourses();

    return useQuery({
      queryKey: ["instructor-ratings", user?.id],
      queryFn: async (): Promise<CourseRating[]> => {
        if (!user?.id) return [];
        
        // Use the new dedicated endpoint for instructor-specific pulse ratings
        const ratings = await fetchWithAuth<CourseRating[]>('/instructor/pulse-ratings');
        
        return ratings.map((r: CourseRating & { _id?: string }) => {
          // Convert to unknown first to allow casting to Record for raw field access
          const raw = r as unknown as Record<string, unknown>;
          const courseData = typeof r.course_id === 'object' ? r.course_id : null;
          const userData = typeof r.user_id === 'object' ? r.user_id : null;
          
          return {
            ...r,
            id: r._id || r.id,
            course_title: courseData?.title || (r.course_id && r.course_id === "GENERAL" ? "Academy Pulse" : "Course Feedback"),
            user_name: userData?.full_name || "Scholar",
            user_avatar: userData?.avatar_url,
            user_id: userData?._id || userData?.id || (typeof r.user_id === 'string' ? r.user_id : ''),
            created_at: (raw.created_at && typeof raw.created_at === 'object' && '$date' in (raw.created_at as object)) 
              ? (raw.created_at as { $date: string }).$date 
              : (raw.created_at as string || new Date().toISOString())
          };
        }) as CourseRating[];
      },
      enabled: !!user?.id,
      staleTime: 60000 * 5,
    });
  }