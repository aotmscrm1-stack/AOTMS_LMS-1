import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Upload, Github, Briefcase, Copy, CheckCircle, ExternalLink, Linkedin } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useRef } from 'react';
import { fetchWithAuth, API_URL } from '@/lib/api';
import { COLLEGES } from '@/pages/Auth';

interface ProfileData {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
    bio: string | null;
    phone: string | null;
    location: string | null;
    skills: string[];
    role?: string;
    github_url?: string | null;
    linkedin_url?: string | null;
    title?: string | null;
    description?: string | null;
    social_handles?: string | null;
    global_experience?: string | null;
    impact?: string | null;
    core_expertise?: string | null;
    resume_url?: string | null;
    college_name?: string | null;
    institute_name?: string | null;
    city?: string | null;
    district?: string | null;
    country?: string | null;
    full_address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
}


export function UserProfile() {
    const { user, userRole, checkSession } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadingResume, setUploadingResume] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const fileResumeRef = useRef<HTMLInputElement>(null);
    const [profile, setProfile] = useState<ProfileData>({
        id: '',
        full_name: '',
        email: '',
        avatar_url: '',
        bio: '',
        phone: '',
        location: '',
        skills: [],
        github_url: '',
        linkedin_url: '',
        title: '',
        description: '',
        social_handles: '',
        global_experience: '',
        impact: '',
        core_expertise: '',
        resume_url: '',
        college_name: '',
        institute_name: '',
        city: '',
        district: '',
        country: '',
        full_address: '',
        latitude: null,
        longitude: null
    });

    const fetchProfile = useCallback(async () => {
        try {
            if (!user) return;
            const result = await fetchWithAuth<{ profile: any; user: any }>(`/user/profile?t=${Date.now()}`);
            const data = result.profile;
            const userData = result.user;

            // Merge with user metadata for fallback
            setProfile({
                id: user.id,
                full_name: data?.full_name || userData?.user_metadata?.full_name || '',
                email: userData?.email || '',
                avatar_url: data?.avatar_url || userData?.user_metadata?.avatar_url || '',
                bio: data?.bio || '',
                phone: data?.phone || '',
                location: data?.location || '',
                skills: data?.skills || [],
                github_url: data?.github_url || '',
                linkedin_url: data?.linkedin_url || '',
                title: data?.title || '',
                description: data?.description || '',
                social_handles: data?.social_handles || '',
                global_experience: data?.global_experience || '',
                impact: data?.impact || '',
                core_expertise: data?.core_expertise || '',
                resume_url: data?.resume_url || '',
                college_name: data?.college_name || '',
                institute_name: data?.institute_name || '',
                city: data?.city || '',
                district: data?.district || '',
                country: data?.country || '',
                full_address: data?.full_address || '',
                latitude: data?.latitude || null,
                longitude: data?.longitude || null
            });
        } catch (error: unknown) {
            console.error('Error fetching profile:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            toast({
                title: 'Error loading profile',
                description: errorMessage,
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    }, [user, toast]);

    useEffect(() => {
        if (user) {
            fetchProfile();
        }
    }, [user, fetchProfile]);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        if (!profile.full_name?.trim()) {
            toast({
                title: 'Validation Error',
                description: 'Please fill in the required details (e.g., Full Name) before saving.',
                variant: 'destructive',
            });
            return;
        }

        setSaving(true);
        try {
            const token = localStorage.getItem('access_token');
            const updates = {
                full_name: profile.full_name,
                avatar_url: profile.avatar_url,
                github_url: profile.github_url,
                linkedin_url: profile.linkedin_url,
                title: profile.title,
                description: profile.description,
                social_handles: profile.social_handles,
                global_experience: profile.global_experience,
                impact: profile.impact,
                core_expertise: profile.core_expertise,
                resume_url: profile.resume_url,
                bio: profile.bio,
                college_name: profile.college_name,
                institute_name: profile.institute_name,
                // Add extra fields if schema supports them
                // mobile_number: profile.phone,
            };

            await fetchWithAuth('/user/profile', {
                method: 'PUT',
                body: JSON.stringify(updates)
            });

            toast({
                title: 'Success',
                description: 'Profile updated successfully',
            });
            await fetchProfile();
        } catch (error: unknown) {
            console.error('Error updating profile:', error);
            const errorMessage = error instanceof Error ? error.message : 'Update failed';
            toast({
                title: 'Error',
                description: errorMessage,
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingImage(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const data = await fetchWithAuth<{ url?: string; path?: string; fileUrl?: string }>('/user/profile/image', {
                method: 'POST',
                body: formData
            });
            
            const imageUrl = data.url || data.path || data.fileUrl;
            if (imageUrl) {
                setProfile({ ...profile, avatar_url: imageUrl });
                
                // Refresh authentication context to update avatar everywhere
                if (checkSession) await checkSession();
                
                toast({
                    title: 'Profile Picture Updated',
                    description: 'Your profile picture has been successfully updated and saved.',
                });
            } else {
                 throw new Error("Invalid response format from server");
            }
        } catch (error: unknown) {
             const message = error instanceof Error ? error.message : 'Could not upload image';
             console.error('Error uploading image:', error);
             toast({
                 title: 'Upload Failed',
                 description: message,
                 variant: 'destructive'
             });
        } finally {
            setUploadingImage(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingResume(true);
        try {
            const { uploadUrl, fileName: s3Key } = await fetchWithAuth<{ uploadUrl: string; fileName: string }>('/s3/upload-url', {
                method: 'POST',
                body: JSON.stringify({
                    fileName: file.name,
                    fileType: file.type,
                    folder: `resumes/${profile.id || user?.id}`
                })
            });

            const uploadRes = await fetch(uploadUrl, {
                method: 'PUT',
                body: file,
                headers: {
                    'Content-Type': file.type
                }
            });

            if (!uploadRes.ok) throw new Error('Upload to S3 failed');
            
            const finalUrl = `/api/s3/public/${s3Key}`;
            setProfile({ ...profile, resume_url: finalUrl });
            toast({
                title: 'Resume Uploaded',
                description: 'Your resume has been successfully uploaded and secured in S3.',
            });
        } catch (error: unknown) {
            console.error('Error uploading resume:', error);
            const message = error instanceof Error ? error.message : 'Failed to upload resume';
            toast({
                title: 'Upload Error',
                description: message,
                variant: 'destructive',
            });
        } finally {
            setUploadingResume(false);
            if (fileResumeRef.current) fileResumeRef.current.value = '';
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/40 backdrop-blur-md p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight italic uppercase">Profile Command Center</h1>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Manage your professional identity and portfolio</p>
                </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-12">
                {/* Profile Card - Premium Identity Card */}
                <Card className="lg:col-span-4 h-fit overflow-hidden rounded-[2.5rem] border-slate-200/60 shadow-2xl bg-white group hover:shadow-primary/5 transition-all duration-700">
                    <div className="h-24 bg-gradient-to-br from-slate-50 to-slate-100/50 relative">
                        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]" />
                    </div>
                    <CardHeader className="text-center -mt-16 relative z-10">
                        <div className="mx-auto mb-6 relative group w-32 h-32">
                            <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse group-hover:bg-primary/20 transition-colors" />
                            <Avatar className="h-32 w-32 border-[6px] border-white shadow-2xl relative z-10">
                                <AvatarImage src={profile.avatar_url?.startsWith('http') ? profile.avatar_url : (profile.avatar_url ? `${API_URL}/s3/public/${profile.avatar_url}` : '')} />
                                <AvatarFallback className="text-3xl font-black bg-slate-100 text-slate-500 uppercase">{profile.full_name?.[0]?.toUpperCase()}</AvatarFallback>
                            </Avatar>
                            
                            <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                ref={fileInputRef}
                                onChange={handleImageUpload}
                            />
                            
                            <Button
                                size="icon"
                                variant="secondary"
                                type="button"
                                disabled={uploadingImage}
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute bottom-1 right-1 h-9 w-9 rounded-full opacity-0 group-hover:opacity-100 transition-all bg-primary text-white hover:bg-primary/90 shadow-xl z-20"
                            >
                                {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            </Button>
                        </div>
                        <CardTitle className="text-2xl font-black text-slate-900 tracking-tight mb-1">{profile.full_name || 'System User'}</CardTitle>
                        <CardDescription className="text-xs font-bold text-slate-400 group-hover:text-primary transition-colors">{profile.email}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8 p-8">
                        <div className="p-6 rounded-[2rem] bg-slate-50 border border-slate-100 flex flex-col items-center justify-center text-center gap-2 group-hover:bg-slate-900 group-hover:text-white transition-all duration-500 hover:scale-[1.02]">
                            <span className="text-sm font-black uppercase tracking-[0.25em]">{userRole || 'Student'}</span>
                            <div className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Verified Member</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Edit Form */}
                <Card className="lg:col-span-8 overflow-hidden rounded-[2.5rem] border-slate-200/60 shadow-sm bg-white/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle>Personal Details</CardTitle>
                        <CardDescription>Update your personal information</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleUpdate} className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="fullName">Full Name <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="fullName"
                                        required
                                        value={profile.full_name || ''}
                                        onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        value={profile.email || ''}
                                        disabled
                                        className="bg-muted"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="collegeName">College Name</Label>
                                    <Input
                                        id="collegeName"
                                        placeholder="e.g. Loyola Institute of Technology and Management (LITAM)"
                                        value={profile.college_name || ''}
                                        autoComplete="off"
                                        list="user-profile-college-suggestions"
                                        onChange={(e) => setProfile({ ...profile, college_name: e.target.value })}
                                    />
                                    <datalist id="user-profile-college-suggestions">
                                        {COLLEGES.map((c) => (
                                            <option key={c} value={c} />
                                        ))}
                                    </datalist>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="instituteName">Company Name</Label>
                                    <Input
                                        id="instituteName"
                                        placeholder="Enter institute name if applicable"
                                        value={profile.institute_name || ''}
                                        onChange={(e) => setProfile({ ...profile, institute_name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="linkedin">LinkedIn Profile URL</Label>
                                    <div className="flex gap-2">
                                        <div className="flex bg-slate-100 border border-slate-200 rounded-lg px-3 items-center justify-center">
                                            <Linkedin className="h-4 w-4 text-blue-600" />
                                        </div>
                                        <Input
                                            id="linkedin"
                                            placeholder="https://linkedin.com/in/username"
                                            value={profile.linkedin_url || ''}
                                            onChange={(e) => setProfile({ ...profile, linkedin_url: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="title">Professional Title</Label>
                                    <Input
                                        id="title"
                                        placeholder="e.g. Senior Software Engineer"
                                        value={profile.title || ''}
                                        onChange={(e) => setProfile({ ...profile, title: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="social_handles">All Social Media Handles</Label>
                                    <Input
                                        id="social_handles"
                                        placeholder="Twitter: @user, Insta: @user"
                                        value={profile.social_handles || ''}
                                        onChange={(e) => setProfile({ ...profile, social_handles: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="global_experience">Global Experience</Label>
                                    <Input
                                        id="global_experience"
                                        placeholder="e.g. 5+ Years across NA & APAC"
                                        value={profile.global_experience || ''}
                                        onChange={(e) => setProfile({ ...profile, global_experience: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="core_expertise">Core Expertise</Label>
                                    <Input
                                        id="core_expertise"
                                        placeholder="e.g. React, Node.js, AI Integration"
                                        value={profile.core_expertise || ''}
                                        onChange={(e) => setProfile({ ...profile, core_expertise: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="description">Description (Bio)</Label>
                                    <Textarea
                                        id="description"
                                        placeholder="Tell us about yourself..."
                                        value={profile.description || ''}
                                        onChange={(e) => setProfile({ ...profile, description: e.target.value })}
                                        className="min-h-[100px]"
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="impact">Impact</Label>
                                    <Textarea
                                        id="impact"
                                        placeholder="Share your major achievements and impact..."
                                        value={profile.impact || ''}
                                        onChange={(e) => setProfile({ ...profile, impact: e.target.value })}
                                        className="min-h-[100px]"
                                    />
                                </div>
                                {userRole === 'student' && (
                                    <>
                                        <div className="space-y-2">
                                            <Label htmlFor="github">GitHub Profile URL</Label>
                                            <div className="flex gap-2">
                                                <div className="flex bg-slate-100 border border-slate-200 rounded-lg px-3 items-center justify-center">
                                                    <Github className="h-4 w-4 text-slate-500" />
                                                </div>
                                                <Input
                                                    id="github"
                                                    placeholder="https://github.com/username"
                                                    value={profile.github_url || ''}
                                                    onChange={(e) => setProfile({ ...profile, github_url: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="resume">Resume/Portfolio URL</Label>
                                            <div className="flex gap-2 items-center">
                                                <div className="flex bg-slate-100 border border-slate-200 rounded-lg px-3 items-center justify-center p-2">
                                                    <Briefcase className="h-4 w-4 text-slate-500" />
                                                </div>
                                                <Input
                                                    id="resume"
                                                    placeholder="Upload your resume to secure AWS S3..."
                                                    value={profile.resume_url || ''}
                                                    readOnly
                                                    className="bg-muted text-xs cursor-default truncate"
                                                />
                                                <input
                                                    type="file"
                                                    accept=".pdf,.doc,.docx"
                                                    className="hidden"
                                                    ref={fileResumeRef}
                                                    onChange={handleResumeUpload}
                                                />
                                                {profile.resume_url && (
                                                    <a 
                                                        href={profile.resume_url.startsWith('http') 
                                                            ? profile.resume_url 
                                                            : `${API_URL.replace(/\/api$/, '')}${profile.resume_url.startsWith('/') ? '' : '/'}${profile.resume_url}`
                                                        } 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                    >
                                                        <Button type="button" variant="outline" className="flex-shrink-0" title="View Resume">
                                                            <ExternalLink className="h-4 w-4" />
                                                        </Button>
                                                    </a>
                                                )}
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    onClick={() => fileResumeRef.current?.click()}
                                                    disabled={uploadingResume}
                                                    className="flex-shrink-0"
                                                >
                                                    {uploadingResume ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                                                    Upload
                                                </Button>
                                            </div>
                                            {profile.resume_url && (
                                                <p className="text-[10px] text-green-600 font-semibold text-right">✓ Resume stored in AWS</p>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>

                             <div className="space-y-2">
                                <Label htmlFor="bio">Bio</Label>
                                <Textarea
                                    id="bio"
                                    placeholder="Tell us about yourself..."
                                    value={profile.bio || ''}
                                    onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                                />
                             </div>

                            <div className="flex justify-end">
                                <Button type="submit" disabled={saving}>
                                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <Save className="mr-2 h-4 w-4" />
                                    Save Changes
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}