import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { API_URL, parseJsonResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Check,
  X,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  GraduationCap,
} from "lucide-react";

import logo from "@/assets/logo.png";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedCharactersLogin } from "@/components/ui/animated-characters-login-page";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ChevronsUpDown } from "lucide-react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";


export const COLLEGES = [
  "3rd Year Loyola Institute of Technology and Management (LITAM)",
  "4th Year Loyola Institute of Technology and Management (LITAM)",
  "Velagapudi Ramakrishna Siddhartha Engineering College",
  "Prasad V Potluri Siddhartha Institute of Technology",
  "Andhra Loyola Institute of Engineering and Technology",
  "Dhanekula Institute of Engineering and Technology",
  "SRK Institute of Technology",
  "NRI Institute of Technology",
  "RK College of Engineering",
  "Lingayas Institute of Management and Technology",
  "PSCMR College of Engineering",
  "Nimra College of Engineering & Technology",
  "Nova College of Engineering & Technology",
  "VIT-AP University",
  "KL University",
  "RVR & JC College of Engineering",
  "Vignan’s Foundation for Science, Technology & Research",
  "Vignan Institute of Technology and Science",
  "St. Mary’s Engineering College",
  "Malineni Lakshmaiah Engineering College",
  "Potti Sriramulu Chalavadi Mallikarjuna Rao College",
  "Gudlavalleru Engineering College",
  "Usha Rama College of Engineering & Technology",
  "Amrita Sai Institute of Science and Technology",
  "Chalapathi Institute of Engineering and Technology",
  "Kallam Haranadhareddy Institute of Technology",
  "Narasaraopeta Engineering College",
  "VKR VNB & AGK College of Engineering",
  "Sri Sunflower College of Engineering and Technology",
  "DJR College of Engineering and Technology",
  "Vikas College of Engineering & Technology",
  "Sai Tirumala NVR Engineering College",
  "Sri Mittapalli College of Engineering",
  "Guntur Engineering College",
  "Chebrolu Engineering College",
  "Eswar College of Engineering",
  "Bapatla Engineering College",
  "Vignan’s Lara Institute of Technology and Science",
  "Sri Venkateswara College of Engineering & Technology",
  "Paladugu Parvathi Devi College of Engineering",
  "St. Ann’s College of Engineering & Technology",
  "Vasireddy Venkatadri Institute of Technology",
  "Chaitanya Engineering College",
  "Sri Chaitanya College of Engineering",
  "KKR & KSR Institute of Technology and Sciences",
  "Sri Subbaraya and Narayana College",
  "Sri Prakash College of Engineering",
  "Sri Vasavi Institute of Engineering & Technology",
  "Vikas Group of Institutions",
  "Sri Sarathi Institute of Engineering & Technology",
  "Sri Siddhartha Institute of Technology & Sciences",
  "Aditya Engineering College (nearby region)"
];

const loginSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  phone: z.string().default(""),
  countryCode: z.string().default("+91"),
  password: z.string().min(1, { message: "Password is required" }),
});

const emailVerifySchema = z.object({
  fullName: z
    .string()
    .min(2, { message: "Name must be at least 2 characters" })
    .max(50, { message: "Name must be less than 50 characters" }),
  email: z.string().email({ message: "Please enter a valid email address" }),
});

const otpSchema = z.object({
  otp: z.string().length(6, { message: "Please enter 6-digit OTP" }),
});

const detailsSchema = z
  .object({
    phone: z
      .string()
      .min(10, { message: "Mobile number must be 10 digits" })
      .max(10, { message: "Mobile number must be 10 digits" }),
    countryCode: z.string().default("+91"),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters" })
      .regex(/[A-Z]/, {
        message: "Password must contain at least one uppercase letter",
      })
      .regex(/[a-z]/, {
        message: "Password must contain at least one lowercase letter",
      })
      .regex(/[0-9]/, { message: "Password must contain at least one number" }),
    collegeName: z
      .string()
      .min(2, { message: "Please enter your college name" })
      .max(120, { message: "College name too long" }),
    courseType: z.string().min(1, { message: "Please select a course type" }),
    confirmPassword: z
      .string()
      .min(1, { message: "Please confirm your password" }),
    agreeToTerms: z.boolean().refine((val) => val === true, {
      message: "You must agree to the Terms & Privacy Policy",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

type LoginFormData = z.infer<typeof loginSchema>;
type EmailVerifyFormData = z.infer<typeof emailVerifySchema>;
type OtpFormData = z.infer<typeof otpSchema>;
type DetailsFormData = z.infer<typeof detailsSchema>;

type RegistrationStep = "email" | "otp" | "details";

// Password strength checker
const getPasswordStrength = (password: string) => {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;

  return { checks, score };
};

export default function Auth() {
  const location = useLocation();
  const [isLogin, setIsLogin] = useState(
    location.pathname === "/login" || location.pathname === "/auth",
  );
  const [loading, setLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registrationStep, setRegistrationStep] =
    useState<RegistrationStep>("email");
  const [tempUserData, setTempUserData] = useState<{
    fullName: string;
    email: string;
  } | null>(null);
  const [otpResendTimer, setOtpResendTimer] = useState(0);
  const [loginStep, setLoginStep] = useState<"credentials" | "admin-otp">(
    "credentials",
  );
  const [adminLoginEmail, setAdminLoginEmail] = useState("");
  const [adminOtpResendTimer, setAdminOtpResendTimer] = useState(0);
  const [openInstitute, setOpenInstitute] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  // ── Forgot Password State ──────────────────────────────────────────────────
  const [forgotStep, setForgotStep] = useState<'idle' | 'email' | 'otp' | 'reset'>('idle');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotResendTimer, setForgotResendTimer] = useState(0);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const {
    signIn,
    signUp,
    user,
    loading: authLoading,
    verifyAdminOtp,
  } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Reset gaze when clicking anywhere outside input fields
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // If the clicked element is not an input and not inside the form controls, reset characters' gaze
      if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA" && !target.closest("button")) {
        setIsTyping(false);
        // Explicitly blur any focused input to sync UI state
        if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) {
          document.activeElement.blur();
        }
      }
    };

    window.addEventListener("mousedown", handleGlobalClick);
    return () => window.removeEventListener("mousedown", handleGlobalClick);
  }, []);



  // Redirect if already logged in
  useEffect(() => {
    if (user && !authLoading) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", phone: "", countryCode: "+91", password: "" },
  });

  const emailVerifyForm = useForm<EmailVerifyFormData>({
    resolver: zodResolver(emailVerifySchema),
    defaultValues: { fullName: "", email: "" },
  });

  const otpForm = useForm<OtpFormData>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: "" },
  });

  const detailsForm = useForm<DetailsFormData>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      phone: "",
      countryCode: "+91",
      password: "",
      confirmPassword: "",
      collegeName: "",
      courseType: "",
      agreeToTerms: false,
    },
  });

  const watchPassword = detailsForm.watch("password");
  const passwordStrength = useMemo(
    () => getPasswordStrength(watchPassword || ""),
    [watchPassword],
  );

  useEffect(() => {
    if (otpResendTimer > 0) {
      const timer = setTimeout(
        () => setOtpResendTimer(otpResendTimer - 1),
        1000,
      );
      return () => clearTimeout(timer);
    }
  }, [otpResendTimer]);

  useEffect(() => {
    if (adminOtpResendTimer > 0) {
      const timer = setTimeout(
        () => setAdminOtpResendTimer(adminOtpResendTimer - 1),
        1000,
      );
      return () => clearTimeout(timer);
    }
  }, [adminOtpResendTimer]);

  useEffect(() => {
    if (forgotResendTimer > 0) {
      const timer = setTimeout(() => setForgotResendTimer(forgotResendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [forgotResendTimer]);

  // ── Forgot Password Handlers ───────────────────────────────────────────────
  const handleForgotSendOtp = async () => {
    if (!forgotEmail.trim() || !/\S+@\S+\.\S+/.test(forgotEmail)) {
      toast({ title: "Invalid Email", description: "Enter a valid email address.", variant: "destructive" });
      return;
    }
    setForgotLoading(true);
    try {
      // Backend generates OTP + calls n8n + stores it — one call only
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      });
      const data = await parseJsonResponse<any>(res);
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP');

      setForgotStep('otp');
      setForgotResendTimer(120);
      toast({ title: "OTP Sent! 📧", description: `Check ${forgotEmail} for your 6-digit code.` });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotVerifyOtp = async (otpToVerify?: string) => {
    const targetOtp = otpToVerify || forgotOtp;
    if (targetOtp.length !== 6) {
      toast({ title: "Invalid OTP", description: "Enter the 6-digit code.", variant: "destructive" });
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/verify-reset-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, otp: targetOtp })
      });
      if (!res.ok) {
        const err = await parseJsonResponse<any>(res);
        throw new Error(err.error || 'Invalid OTP');
      }
      setForgotStep('reset');
      toast({ title: "OTP Verified!", description: "Now set your new password." });
    } catch (e: any) {
      toast({ title: "Wrong OTP", description: e.message, variant: "destructive" });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotResetPassword = async () => {
    if (forgotNewPassword.length < 8) {
      toast({ title: "Too Short", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      toast({ title: "Mismatch", description: "Passwords don't match.", variant: "destructive" });
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, otp: forgotOtp, new_password: forgotNewPassword })
      });
      if (!res.ok) {
        const err = await parseJsonResponse<any>(res);
        throw new Error(err.error || 'Reset failed');
      }
      toast({ title: "Password Reset!", description: "Login with your new password." });
      setForgotStep('idle');
      setForgotEmail(''); setForgotOtp(''); setForgotNewPassword(''); setForgotConfirmPassword('');
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleSendOtp = async (data: EmailVerifyFormData) => {
    setLoading(true);
    setTempUserData({ fullName: data.fullName, email: data.email });

    try {
      const response = await fetch(`${API_URL}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          full_name: data.fullName,
        }),
      });

      const result = await parseJsonResponse<any>(response);

      if (response.ok) {
        setRegistrationStep("otp");
        setOtpResendTimer(120);
        toast({
          title: "OTP Sent",
          description: "Please check your email for the 6-digit OTP.",
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to send OTP. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send OTP. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (data: OtpFormData) => {
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: tempUserData?.email,
          otp: data.otp,
        }),
      });

      const result = await parseJsonResponse<any>(response);

      if (response.ok) {
        setRegistrationStep("details");
        toast({
          title: "Verified",
          description:
            "Email verified successfully. Please complete your registration.",
        });
      } else {
        otpForm.setError("otp", {
          message: result.error || "Invalid OTP. Please try again.",
        });
        toast({
          title: "Verification Failed",
          description: result.error || "Invalid OTP. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to verify OTP. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!tempUserData || otpResendTimer > 0) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: tempUserData.email,
          full_name: tempUserData.fullName,
        }),
      });

      const result = await parseJsonResponse<any>(response);

      if (response.ok) {
        setOtpResendTimer(120);
        toast({
          title: "OTP Resent",
          description: "A new OTP has been sent to your email.",
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to resend OTP.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to resend OTP.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFinalRegister = async (data: DetailsFormData) => {
    if (!tempUserData) return;
    setLoading(true);

    let locationData = {};
    
    // Function to get location with high precision priority
    const fetchLocation = async () => {
      return new Promise<unknown>((resolve) => {
        if (!("geolocation" in navigator)) {
          resolve(null);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          async (position) => {
            try {
              const { latitude, longitude } = position.coords;
              // Precise lookup via Nominatim (OpenStreetMap)
              const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`, {
                headers: { 'Accept-Language': 'en' }
              });
              if (res.ok) {
                const geo = await res.json();
                const addr = geo.address;
                resolve({
                  city: addr.city || addr.town || addr.village || addr.suburb || addr.suburb || addr.city_district,
                  district: addr.state_district || addr.county || addr.district || addr.state,
                  country: addr.country,
                  fullAddress: geo.display_name,
                  latitude,
                  longitude
                });
              } else {
                resolve(null);
              }
            } catch (err) {
              resolve(null);
            }
          },
          async () => {
            resolve(null); // Fallback to IP on denial or error
          },
          { enableHighAccuracy: true, timeout: 15000 }
        );
      });
    };

    try {
      // Show user we are working on precision
      toast({
        title: "Calibrating High-Precision GPS",
        description: "Securing your entry point. Please wait a moment...",
      });

      // 1. Try High Precision Browser Geolocation with increased timeout
      const preciseLoc = await fetchLocation();
      if (preciseLoc) {
        locationData = preciseLoc;
      } else {
        console.warn("High-precision GPS timed out or denied, using auxiliary network nodes.");
        // 2. Fallback to IP matching if GPS is unavailable
        const locRes = await fetch("https://ipapi.co/json/");
        if (locRes.ok) {
          const loc = await locRes.json();
          locationData = {
            city: loc.city,
            district: loc.region,
            country: loc.country_name,
            fullAddress: `${loc.city}, ${loc.region}, ${loc.country_name} (Network Based Fallback)`,
            latitude: loc.latitude,
            longitude: loc.longitude
          };
        }
      }
    } catch (e) {
      console.warn("Location capture cycle failed", e);
    }

    const fullPhone = `${data.countryCode}${data.phone}`;
    const { error } = await signUp(
      tempUserData.email,
      data.password,
      tempUserData.fullName,
      fullPhone,
      data.courseType,
      data.collegeName,
      locationData
    );

    if (error) {
      setLoading(false);
      toast({
        title: "Registration Failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      navigate("/");
    }
  };



  const handleLogin = async (data: LoginFormData) => {
    setLoading(true);
    const result = await signIn(data.email, data.password);

    if (result.error) {
      setLoading(false);
      toast({
        title: "Login Failed",
        description: result.error.message,
        variant: "destructive",
      });
    } else if (result.requiresAdminOtp) {
      setLoading(false);
      setAdminLoginEmail(data.email);
      setLoginStep("admin-otp");
      setAdminOtpResendTimer(120);
      otpForm.reset();
      toast({
        title: "OTP Required",
        description: "A verification code has been sent to your admin email.",
      });
    } else {
      setLoading(false);
      toast({ title: "Welcome back!" });

      const role = localStorage.getItem("user_role");
      const userStr = localStorage.getItem("user");
      const userData = userStr ? JSON.parse(userStr) : null;

      if (
        userData?.approval_status === "pending" &&
        role !== "admin" &&
        role !== "manager"
      ) {
        navigate("/pending-approval");
      } else {
        navigate("/");
      }
    }
  };

  const handleAdminOtpVerify = async (data: OtpFormData) => {
    setLoading(true);
    const { error } = await verifyAdminOtp(adminLoginEmail, data.otp);

    if (error) {
      setLoading(false);
      toast({
        title: "Verification Failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setLoading(false);
      toast({
        title: "Admin Login Verified",
        description: "Welcome to the admin panel.",
      });
      navigate("/");
    }
  };

  const handleAdminOtpResend = async () => {
    if (adminOtpResendTimer > 0) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/admin-resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminLoginEmail }),
      });
      if (response.ok) {
        setAdminOtpResendTimer(120);
        toast({
          title: "OTP Resent",
          description: "A new OTP has been sent to your email.",
        });
      } else {
        const result = await parseJsonResponse<any>(response);
        toast({
          title: "Error",
          description: result.error || "Failed to resend OTP.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to resend OTP.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    const newMode = !isLogin;
    setIsLogin(newMode);
    navigate(newMode ? "/login" : "/signup", { replace: true });
    loginForm.reset();
    emailVerifyForm.reset();
    otpForm.reset();
    detailsForm.reset();
    setRegistrationStep("email");
    setTempUserData(null);
    setLoginStep("credentials");
    setAdminLoginEmail("");
  };

  const PasswordRequirement = ({
    met,
    text,
  }: {
    met: boolean;
    text: string;
  }) => (
    <div
      className={`flex items-center gap-1.5 text-xs ${met ? "text-green-600" : "text-muted-foreground"}`}
    >
      {met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      <span>{text}</span>
    </div>
  );

  const loginPassword = loginForm.watch("password");
  const signupPassword = detailsForm.watch("password");

  return (
    <AnimatedCharactersLogin
      email={
        isLogin ? loginForm.watch("email") : emailVerifyForm.watch("email")
      }
      password={isLogin ? loginPassword : signupPassword}
      showPassword={
        isLogin
          ? showLoginPassword
          : registrationStep === "details"
            ? showRegisterPassword
            : false
      }
      isTyping={isTyping}
      logo={logo}
      overlay={
        <AnimatePresence>
          {forgotStep !== 'idle' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
              onClick={() => { setForgotStep('idle'); }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                transition={{ type: 'spring', damping: 25 }}
                className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md border border-slate-100 relative overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                {/* Subtle top decoration */}
                <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-[#0075CF] to-indigo-500" />

                {/* Header */}
                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-[#0075CF]/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[#0075CF]/20">
                    {forgotStep === 'email' && <Mail className="h-8 w-8 text-[#0075CF]" />}
                    {forgotStep === 'otp' && <ShieldCheck className="h-8 w-8 text-[#0075CF]" />}
                    {forgotStep === 'reset' && <Lock className="h-8 w-8 text-[#0075CF]" />}
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900">
                    {forgotStep === 'email' && 'Forgot Password'}
                    {forgotStep === 'otp' && 'Enter OTP'}
                    {forgotStep === 'reset' && 'New Password'}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1.5 px-4 leading-relaxed">
                    {forgotStep === 'email' && "We'll send a 6-digit reset code to your email"}
                    {forgotStep === 'otp' && `Enter the 6-digit code sent to ${forgotEmail}`}
                    {forgotStep === 'reset' && 'Choose a strong new password to secure your account'}
                  </p>
                </div>

                {/* Step: Email */}
                {forgotStep === 'email' && (
                  <div className="space-y-4">
                    <div className="relative">
                      <Input
                        type="email"
                        placeholder="Enter your email address"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        className="h-14 pl-12 bg-slate-50 border-slate-200 rounded-2xl font-medium focus-visible:ring-[#0075CF] focus-visible:border-[#0075CF]"
                        onKeyDown={e => e.key === 'Enter' && handleForgotSendOtp()}
                      />
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    </div>
                    <Button
                      onClick={handleForgotSendOtp}
                      disabled={forgotLoading}
                      className="w-full h-13 bg-[#0075CF] hover:bg-[#0075CF]/90 text-white font-bold rounded-2xl shadow-lg shadow-[#0075CF]/15 transition-all"
                    >
                      {forgotLoading ? 'Sending OTP...' : 'Send OTP →'}
                    </Button>
                    <button type="button" onClick={() => setForgotStep('idle')}
                      className="w-full text-sm text-slate-400 hover:text-slate-600 font-semibold py-2 transition-colors">
                      ← Back to Login
                    </button>
                  </div>
                )}

                {/* Step: OTP */}
                {forgotStep === 'otp' && (
                  <div className="space-y-6">
                    {/* Custom 6-box responsive OTP component */}
                    <div className="relative w-full py-2">
                      {/* Invisible actual input */}
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={forgotOtp}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                          setForgotOtp(val);
                          if (val.length === 6) {
                            handleForgotVerifyOtp(val);
                          }
                        }}
                        autoFocus
                        className="absolute inset-0 w-full h-full opacity-0 z-20 cursor-text"
                      />
                      {/* Visual box slots */}
                      <div className="flex gap-2 sm:gap-3 justify-center w-full">
                        {[0, 1, 2, 3, 4, 5].map(i => {
                          const char = forgotOtp[i] || '';
                          const isActive = i === forgotOtp.length;
                          return (
                            <div
                              key={i}
                              className={`flex-1 max-w-[48px] h-14 sm:h-16 rounded-xl sm:rounded-2xl border-2 flex items-center justify-center text-xl sm:text-2xl font-black transition-all duration-200
                                ${char ? 'border-[#0075CF] text-[#0075CF] bg-white ring-4 ring-[#0075CF]/5 shadow-md shadow-[#0075CF]/5 scale-105' : 'border-slate-200 text-slate-300 bg-slate-50'}
                                ${isActive ? 'border-[#0075CF] bg-white ring-4 ring-[#0075CF]/10 scale-105 animate-pulse' : ''}
                              `}
                            >
                              {char || '•'}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <Button
                      onClick={() => handleForgotVerifyOtp()}
                      disabled={forgotLoading || forgotOtp.length !== 6}
                      className="w-full h-13 bg-[#0075CF] hover:bg-[#0075CF]/90 text-white font-bold rounded-2xl shadow-lg shadow-[#0075CF]/15 transition-all"
                    >
                      {forgotLoading ? 'Verifying...' : 'Verify OTP →'}
                    </Button>
                    
                    <div className="text-center pt-2">
                      <button type="button"
                        onClick={handleForgotSendOtp}
                        disabled={forgotResendTimer > 0 || forgotLoading}
                        className="text-xs text-[#0075CF] font-bold disabled:opacity-50 hover:underline transition-all"
                      >
                        {forgotResendTimer > 0 ? `Resend in ${forgotResendTimer}s` : 'Resend OTP'}
                      </button>
                    </div>
                    
                    <button type="button" onClick={() => setForgotStep('email')}
                      className="w-full text-sm text-slate-400 hover:text-slate-600 font-semibold py-1 transition-colors">
                      ← Change Email
                    </button>
                  </div>
                )}

                {/* Step: New Password */}
                {forgotStep === 'reset' && (
                  <div className="space-y-4">
                    <div className="relative">
                      <Input
                        type={showForgotPassword ? 'text' : 'password'}
                        placeholder="New password (min 8 chars)"
                        value={forgotNewPassword}
                        onChange={e => setForgotNewPassword(e.target.value)}
                        className="h-14 pl-12 pr-12 bg-slate-50 border-slate-200 rounded-2xl font-medium"
                      />
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <button type="button"
                        onClick={() => setShowForgotPassword(!showForgotPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showForgotPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        type={showForgotPassword ? 'text' : 'password'}
                        placeholder="Confirm new password"
                        value={forgotConfirmPassword}
                        onChange={e => setForgotConfirmPassword(e.target.value)}
                        className="h-14 pl-12 bg-slate-50 border-slate-200 rounded-2xl font-medium"
                      />
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    </div>
                    {forgotNewPassword && forgotConfirmPassword && forgotNewPassword !== forgotConfirmPassword && (
                      <p className="text-xs text-red-500 font-medium ml-1">Passwords don't match</p>
                    )}
                    <Button
                      onClick={handleForgotResetPassword}
                      disabled={forgotLoading || forgotNewPassword.length < 8 || forgotNewPassword !== forgotConfirmPassword}
                      className="w-full h-13 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl"
                    >
                      {forgotLoading ? 'Resetting...' : '✓ Reset Password'}
                    </Button>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      }
    >
      <div className="space-y-6 relative">
        {/* Header */}
        <div className="text-center mb-8">
          {logo && (
            <div className="flex justify-center mb-6">
              <img
                src={logo}
                alt="Logo"
                className="h-12 md:h-14 lg:h-16 w-auto object-contain"
              />
            </div>
          )}
          <h2 className="text-3xl font-semibold text-slate-950 mb-2 tracking-tight">
            {isLogin
              ? loginStep === "admin-otp"
                ? "Admin Verification"
                : "Welcome back"
              : registrationStep === "email"
                ? "Create account"
                : registrationStep === "otp"
                  ? "Verify"
                  : "Complete"}
          </h2>
          <p className="text-muted-foreground text-sm font-normal">
            {isLogin
              ? loginStep === "admin-otp"
                ? `Enter the OTP sent to ${adminLoginEmail}`
                : "Sign in to continue your learning journey."
              : registrationStep === "email"
                ? "Enter your details to get started"
                : registrationStep === "otp"
                  ? "Enter the OTP sent to your email"
                  : "Fill in your account details"}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {/* Login Form */}
          {isLogin ? (
            <motion.div
              key={loginStep === "admin-otp" ? "admin-otp" : "login"}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              {loginStep === "admin-otp" ? (
                /* Admin OTP Verification Step */
                <Form {...otpForm}>
                  <form
                    onSubmit={otpForm.handleSubmit(handleAdminOtpVerify)}
                    className="space-y-6"
                  >
                    <div className="text-center mb-6">
                      <div className="w-16 h-16 bg-[#0075CF]/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[#0075CF]/20">
                        <ShieldCheck className="h-8 w-8 text-[#0075CF]" />
                      </div>
                      <h3 className="text-xl font-semibold text-slate-900 tracking-tight">
                        Admin Verification
                      </h3>
                      <p className="text-sm text-slate-500 font-normal mt-1">
                        Secure access verification required
                      </p>
                    </div>

                    <FormField
                      control={otpForm.control}
                      name="otp"
                      render={({ field }) => (
                        <FormItem className="flex justify-center flex-col items-center">
                          <FormControl>
                            <InputOTP
                              maxLength={6}
                              {...field}
                              onFocus={() => setIsTyping(true)}
                              onBlur={() => setIsTyping(false)}
                            >
                              <div className="flex gap-3">
                                {[0, 1, 2, 3, 4, 5].map((index) => (
                                  <InputOTPGroup key={index}>
                                    <InputOTPSlot
                                      index={index}
                                      className="w-12 h-14 text-xl font-bold bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-[#0075CF] focus:ring-4 focus:ring-[#0075CF]/10 transition-all"
                                    />
                                  </InputOTPGroup>
                                ))}
                              </div>
                            </InputOTP>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full h-14 bg-[#0075CF] hover:bg-[#0075CF]/90 text-white font-semibold uppercase tracking-widest rounded-2xl shadow-xl shadow-[#0075CF]/20 transition-all active:scale-[0.98]"
                    >
                      {loading ? "Verifying..." : "Unlock Admin Portal"}
                    </Button>

                    <div className="text-center">
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                        No code?{" "}
                        <button
                          type="button"
                          onClick={handleAdminOtpResend}
                          disabled={adminOtpResendTimer > 0 || loading}
                          className="text-[#0075CF] hover:underline disabled:opacity-50"
                        >
                          {adminOtpResendTimer > 0
                            ? `Retry in ${adminOtpResendTimer}s`
                            : "Resend Code"}
                        </button>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setLoginStep("credentials");
                        otpForm.reset();
                        setAdminLoginEmail("");
                      }}
                      className="w-full text-xs text-slate-400 hover:text-slate-600 flex items-center justify-center gap-2 font-black uppercase tracking-widest transition-colors"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" /> Use Different
                      Account
                    </button>
                  </form>
                </Form>
              ) : (
                <Form {...loginForm}>
                  <form
                    onSubmit={loginForm.handleSubmit(handleLogin)}
                    className="space-y-6"
                  >
                    <FormField
                      control={loginForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-bold text-slate-700 uppercase tracking-wider ml-1">
                            Email Address
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter your email address"
                              className="h-14 bg-slate-50 border-slate-100 rounded-2xl focus:ring-4 focus:ring-[#0075CF]/10 transition-all font-medium text-slate-900"
                              autoComplete="email"
                              onFocus={() => setIsTyping(true)}
                              onBlur={() => setIsTyping(false)}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-bold text-slate-700 uppercase tracking-wider ml-1">
                            Enter Your Password
                          </FormLabel>
                          <div className="relative">
                            <FormControl>
                              <Input
                                type={showLoginPassword ? "text" : "password"}
                                placeholder="••••••••"
                                className="h-14 pr-14 bg-slate-50 border-slate-100 rounded-2xl focus:ring-4 focus:ring-[#0075CF]/10 transition-all font-medium text-slate-900"
                                autoComplete="current-password"
                                onFocus={() => setIsTyping(true)}
                                onBlur={() => setIsTyping(false)}
                                {...field}
                              />
                            </FormControl>
                            <button
                              type="button"
                              onClick={() =>
                                setShowLoginPassword(!showLoginPassword)
                              }
                              className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                              tabIndex={-1}
                            >
                              {showLoginPassword ? (
                                <EyeOff className="h-5 w-5" />
                              ) : (
                                <Eye className="h-5 w-5" />
                              )}
                            </button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full h-14 bg-[#0075CF] hover:bg-[#0075CF]/90 text-white font-semibold uppercase tracking-widest rounded-2xl shadow-xl shadow-[#0075CF]/20 transition-all active:scale-[0.98]"
                    >
                      {loading ? "Authenticating..." : "Sign In to Portal"}
                    </Button>

                    {/* Forgot Password Link */}
                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={() => setForgotStep('email')}
                        className="text-sm text-[#0075CF] hover:underline font-semibold tracking-wide"
                      >
                        Forgot Password?
                      </button>
                    </div>
                  </form>
                </Form>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="register"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Multi-Step Registration Form */}
              <div className="space-y-4">
                {/* Step Indicator */}
                <div className="flex items-center justify-center gap-2 mb-6">
                  <div
                    className={`flex items-center gap-1.5 ${registrationStep === "email" ? "text-[#0075CF]" : "text-slate-400"}`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${registrationStep === "email" ? "bg-[#0075CF] text-white" : "bg-slate-100"}`}
                    >
                      1
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                      Start
                    </span>
                  </div>
                  <div className="w-8 h-px bg-slate-100" />
                  <div
                    className={`flex items-center gap-1.5 ${registrationStep === "otp" ? "text-[#0075CF]" : "text-slate-400"}`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${registrationStep === "otp" ? "bg-[#0075CF] text-white" : "bg-slate-100"}`}
                    >
                      2
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                      Verify
                    </span>
                  </div>
                  <div className="w-8 h-px bg-slate-100" />
                  <div
                    className={`flex items-center gap-1.5 ${registrationStep === "details" ? "text-[#0075CF]" : "text-slate-400"}`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${registrationStep === "details" ? "bg-[#0075CF] text-white" : "bg-slate-100"}`}
                    >
                      3
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                      Finish
                    </span>
                  </div>
                </div>

                {/* Step 1: Email Verification */}
                {registrationStep === "email" && (
                  <Form {...emailVerifyForm}>
                    <form
                      onSubmit={emailVerifyForm.handleSubmit(handleSendOtp)}
                      className="space-y-4"
                    >
                      <FormField
                        control={emailVerifyForm.control}
                        name="fullName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">
                              Full Name
                            </FormLabel>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                              <FormControl>
                                <Input
                                  placeholder="Enter Your Full Name"
                                  className="pl-10 h-11 bg-slate-50 border-slate-200 rounded-xl focus:ring-4 focus:ring-[#0075CF]/10 transition-all"
                                  onFocus={() => setIsTyping(true)}
                                  onBlur={() => setIsTyping(false)}
                                  {...field}
                                />
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={emailVerifyForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">
                              Email Address
                            </FormLabel>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                              <FormControl>
                                <Input
                                  type="email"
                                  placeholder="student@example.com"
                                  className="pl-10 h-11 bg-slate-50 border-slate-200 rounded-xl focus:ring-4 focus:ring-[#0075CF]/10 transition-all"
                                  onFocus={() => setIsTyping(true)}
                                  onBlur={() => setIsTyping(false)}
                                  {...field}
                                />
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 bg-[#0075CF] hover:bg-[#0075CF]/90 text-white font-semibold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2"
                      >
                        {loading ? "Sending..." : "Verify Email"}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </form>
                  </Form>
                )}

                {/* Step 2: OTP Verification */}
                {registrationStep === "otp" && (
                  <Form {...otpForm}>
                    <form
                      onSubmit={otpForm.handleSubmit(handleVerifyOtp)}
                      className="space-y-4 text-center"
                    >
                      <p className="text-sm text-slate-500 mb-6 font-medium">
                        We sent a code to{" "}
                        <span className="font-bold text-slate-900">
                          {tempUserData?.email}
                        </span>
                      </p>

                      <FormField
                        control={otpForm.control}
                        name="otp"
                        render={({ field }) => (
                          <FormItem className="flex justify-center flex-col items-center mb-6">
                            <FormControl>
                              <InputOTP
                                maxLength={6}
                                {...field}
                                onFocus={() => setIsTyping(true)}
                                onBlur={() => setIsTyping(false)}
                              >
                                <div className="flex gap-2">
                                  {[0, 1, 2, 3, 4, 5].map((index) => (
                                    <InputOTPGroup key={index}>
                                      <InputOTPSlot
                                        index={index}
                                        className="w-12 h-12 text-lg font-black bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-[#0075CF] focus:ring-4 focus:ring-[#0075CF]/10 outline-none transition-all"
                                      />
                                    </InputOTPGroup>
                                  ))}
                                </div>
                              </InputOTP>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 bg-[#0075CF] hover:bg-[#0075CF]/90 text-white font-semibold uppercase tracking-widest rounded-xl transition-all"
                      >
                        {loading ? "Verifying..." : "Verify OTP"}
                      </Button>

                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleResendOtp}
                          disabled={otpResendTimer > 0 || loading}
                          className="text-xs text-[#0075CF] hover:underline font-bold disabled:opacity-50"
                        >
                          {otpResendTimer > 0
                            ? `Resend in ${otpResendTimer}s`
                            : "Resend Code"}
                        </button>
                      </div>
                    </form>
                  </Form>
                )}

                {/* Step 3: Final Details */}
                {registrationStep === "details" && (
                  <Form {...detailsForm}>
                    <form
                      onSubmit={detailsForm.handleSubmit(handleFinalRegister)}
                      className="space-y-4"
                    >
                      <FormField
                        control={detailsForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">
                              Mobile Number
                            </FormLabel>
                            <FormControl>
                              <PhoneInput
                                value={field.value}
                                onValueChange={field.onChange}
                                countryCode={detailsForm.watch("countryCode")}
                                onCountryChange={(code) =>
                                  detailsForm.setValue("countryCode", code)
                                }
                                placeholder="8019952233"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* College & Institute + Course Type */}
                      <FormField
                        control={detailsForm.control}
                        name="collegeName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest ml-1 mb-1">
                              College / Institute Name
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                                <Input
                                  placeholder="e.g. KL University"
                                  className="pl-10 h-11 bg-slate-50 border-slate-200 rounded-xl focus:ring-4 focus:ring-[#0075CF]/10 transition-all"
                                  list="college-suggestions"
                                  onFocus={() => setIsTyping(true)}
                                  onBlur={() => setIsTyping(false)}
                                  {...field}
                                />
                                <datalist id="college-suggestions">
                                  {COLLEGES.map((c) => (
                                    <option key={c} value={c} />
                                  ))}
                                </datalist>
                              </div>
                            </FormControl>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />

                      {/* Course Type */}
                      <FormField
                        control={detailsForm.control}
                        name="courseType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest ml-1 mb-1">
                              Course Type
                            </FormLabel>
                            <FormControl>
                              <select
                                value={field.value}
                                onChange={field.onChange}
                                onFocus={() => setIsTyping(true)}
                                onBlur={() => setIsTyping(false)}
                                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm font-medium text-slate-900 focus:outline-none focus:ring-4 focus:ring-[#0075CF]/10 focus:border-[#0075CF] transition-all appearance-none cursor-pointer"
                              >
                                <option value="" disabled>Select your course type...</option>
                                <option value="full_time">Full Time Course</option>
                                <option value="internship">Internship</option>
                                <option value="bridge">Bridge Course</option>
                              </select>
                            </FormControl>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={detailsForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">
                              Create Password
                            </FormLabel>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                              <FormControl>
                                <Input
                                  type={
                                    showRegisterPassword ? "text" : "password"
                                  }
                                  placeholder="••••••••"
                                  className="pl-10 pr-10 h-11 bg-slate-50 border-slate-200 rounded-xl focus:ring-4 focus:ring-[#0075CF]/10 transition-all font-medium"
                                  autoComplete="new-password"
                                  onFocus={() => setIsTyping(true)}
                                  onBlur={() => setIsTyping(false)}
                                  {...field}
                                />
                              </FormControl>
                              <button
                                type="button"
                                onClick={() =>
                                  setShowRegisterPassword(!showRegisterPassword)
                                }
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 z-10"
                                tabIndex={-1}
                              >
                                {showRegisterPassword ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={detailsForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">
                              Confirm Password
                            </FormLabel>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                              <FormControl>
                                <Input
                                  type={
                                    showConfirmPassword ? "text" : "password"
                                  }
                                  placeholder="••••••••"
                                  className="pl-10 pr-10 h-11 bg-slate-50 border-slate-200 rounded-xl focus:ring-4 focus:ring-[#0075CF]/10 transition-all font-medium"
                                  autoComplete="new-password"
                                  onFocus={() => setIsTyping(true)}
                                  onBlur={() => setIsTyping(false)}
                                  {...field}
                                />
                              </FormControl>
                              <button
                                type="button"
                                onClick={() =>
                                  setShowConfirmPassword(!showConfirmPassword)
                                }
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 z-10"
                                tabIndex={-1}
                              >
                                {showConfirmPassword ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {watchPassword && watchPassword.length > 0 && (
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 grid grid-cols-2 gap-1.5">
                          <PasswordRequirement
                            met={passwordStrength.checks.length}
                            text="8+ chars"
                          />
                          <PasswordRequirement
                            met={passwordStrength.checks.uppercase}
                            text="Uppercase"
                          />
                          <PasswordRequirement
                            met={passwordStrength.checks.lowercase}
                            text="Lowercase"
                          />
                          <PasswordRequirement
                            met={passwordStrength.checks.number}
                            text="Number"
                          />
                        </div>
                      )}

                      <FormField
                        control={detailsForm.control}
                        name="agreeToTerms"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 py-2">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                className="rounded-md"
                              />
                            </FormControl>
                            <div className="leading-none">
                              <FormLabel className="text-[10px] text-slate-500 font-medium">
                                I agree to the{" "}
                                <a
                                  href="/terms"
                                  className="text-[#0075CF] underline"
                                >
                                  Terms
                                </a>{" "}
                                &{" "}
                                <a
                                  href="/privacy"
                                  className="text-[#0075CF] underline"
                                >
                                  Privacy Policy
                                </a>
                              </FormLabel>
                              <FormMessage />
                            </div>
                          </FormItem>
                        )}
                      />

                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 bg-[#0075CF] hover:bg-[#0075CF]/90 text-white font-semibold uppercase tracking-widest rounded-xl transition-all"
                      >
                        {loading ? "Registering..." : "Complete Account"}
                      </Button>
                    </form>
                  </Form>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Toggle */}
        <div className="pt-8 border-t border-slate-100 text-center">
          <p className="text-sm text-slate-500 font-medium">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              onClick={toggleMode}
              className="text-[#0075CF] hover:underline font-semibold"
            >
              {isLogin ? "Create Account" : "Sign In"}
            </button>
          </p>
        </div>
      </div>
    </AnimatedCharactersLogin>
  );
}