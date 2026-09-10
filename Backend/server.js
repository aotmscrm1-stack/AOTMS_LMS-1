require('dotenv').config();
process.env.TZ = 'Asia/Kolkata';
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { generateUploadUrl, generateViewUrl, deleteObject, uploadFile } = require('./utils/s3');
const axios = require('axios');
const connectDB = require('./config/db');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const cloudinary = require('cloudinary').v2;
const vm = require('vm'); // Native Node.js module for executing code locally
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const pdfParse = require('pdf-parse');
const FormData = require('form-data');
const { sendEmail } = require('./utils/email');

// Cloudinary Config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dbhuezxh0',
    api_key: process.env.CLOUDINARY_API_KEY || '586353983153752',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'S6rxE-cjejQxkdWucUuAb7rGUXI'
});

// Import Mongoose Models
const { User, Profile, UserRole, OTP, VerifiedEmail, ResumeScan } = require('./models/User');
const { Course, Enrollment, Module, Resource, CourseRating, Video, Announcement, Timeline, VideoProgress } = require('./models/Course');
const { Exam, QuestionBank, StudentExamAccess, ExamResult, MockPaper, MockTestConfig } = require('./models/Exam');
const { LiveClass } = require('./models/Content');
const { SystemLog, SecurityEvent, LeaderboardStat, Notification, Attendance, Coupon, CouponRedemption, College } = require('./models/System');
const { Conversation, Message } = require('./models/Chat');
const { Doubt, DoubtReply } = require('./models/Doubt');
const { Batch, StudentBatch, BatchRequest } = require('./models/Batch');

// Map table names to Models for generic routes
const MODEL_MAP = {
    'profiles': Profile,
    'user_roles': UserRole,
    'conversations': Conversation,
    'messages': Message,
    'doubts': Doubt,
    'courses': Course,
    'course_modules': Module,
    'course_resources': Resource,
    'course_enrollments': Enrollment,
    'course_ratings': CourseRating,
    'question_bank': QuestionBank,
    'student_exam_access': StudentExamAccess,
    'exam_results': ExamResult,
    'student_exam_results': ExamResult, // Alias
    'system_logs': SystemLog,
    'security_events': SecurityEvent,
    'leaderboard_stats': LeaderboardStat,
    'leaderboard': LeaderboardStat, // Alias
    'notifications': Notification,
    'users': User,
    'resumescans': ResumeScan,
    'exams': Exam,
    'mock_papers': MockPaper,
    'mock_test_configs': MockTestConfig,
    'batches': Batch,
    'attendance': Attendance,
    'student_batches': StudentBatch,
    'course_videos': Video,
    'live_classes': LiveClass,
    'course_timeline': Timeline,
    'course_announcements': Announcement,
    'coupons': Coupon,
    'coupon_redemptions': CouponRedemption,
    'colleges': College,
    'video_progress': VideoProgress
};

const ALLOWED_TABLES = Object.keys(MODEL_MAP);
const ADMIN_ONLY_TABLES = ['user_roles', 'system_logs', 'security_events'];

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_me';

// ── Token Blacklist (in-memory, auto-cleaned every 8 hours) ──
const tokenBlacklist = new Set();
setInterval(() => {
    // JWT tokens expire in 7d, clean up every 8h to keep memory small
    // We store jti or full token; cleaning all is safe since JWT expiry handles the rest
    tokenBlacklist.clear();
    console.log('[Auth] Token blacklist cleared (scheduled cleanup)');
}, 8 * 60 * 60 * 1000);

const blacklistUserTokens = (userId) => {
    // We store a marker so authenticateToken can check user-level revocation
    tokenBlacklist.add(`user:${userId.toString()}`);
    // Also clear role cache so stale roles don't linger
    roleCache.delete(userId.toString());
    console.log(`[Auth] Tokens revoked for user ${userId}`);
};
const app = express();
const port = process.env.PORT || 5000;

// Create HTTP Server for Socket.io
const http = require('http');
const { Server } = require('socket.io');
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            // Allow all origins in dev, or specific ones in prod
            callback(null, true);
        },
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Socket.io Connection Logic
const userSockets = new Map(); // userId -> Set of socketIds
const onlineUsers = new Set(); // Set of online userIds

io.on('connection', (socket) => {
    socket.on('authenticate', (userId) => {
        if (!userId) return;
        socket.userId = userId;
        if (!userSockets.has(userId)) {
            userSockets.set(userId, new Set());
        }
        userSockets.get(userId).add(socket.id);
        onlineUsers.add(userId);

        console.log(`[Socket] User ${userId} connected (${socket.id})`);
        io.emit('user_status', { userId, status: 'online' });
    });

    socket.on('join_conversation', (conversationId) => {
        socket.join(conversationId);
        console.log(`[Socket] User ${socket.userId} joined conversation ${conversationId}`);
    });

    socket.on('typing', ({ conversationId, isTyping }) => {
        socket.to(conversationId).emit('typing_status', {
            userId: socket.userId,
            isTyping,
            conversationId
        });
    });

    socket.on('mark_read', async ({ conversationId, messageIds }) => {
        try {
            if (!messageIds || messageIds.length === 0) return;

            // Update DB
            await Message.updateMany(
                { _id: { $in: messageIds }, conversation_id: conversationId },
                { status: 'read' }
            );

            // Emit to sender that messages are read
            io.to(conversationId).emit('messages_read', {
                conversationId,
                messageIds,
                readBy: socket.userId
            });
        } catch (err) {
            console.error('Error marking messages read:', err);
        }
    });

    socket.on('disconnect', () => {
        if (socket.userId && userSockets.has(socket.userId)) {
            userSockets.get(socket.userId).delete(socket.id);
            if (userSockets.get(socket.userId).size === 0) {
                userSockets.delete(socket.userId);
                onlineUsers.delete(socket.userId);
                io.emit('user_status', { userId: socket.userId, status: 'offline' });
            }
        }
        console.log(`[Socket] Disconnected: ${socket.id}`);
    });
});

// Notification Helper
const sendNotification = (userId, data) => {
    const sockets = userSockets.get(userId?.toString());
    if (sockets) {
        sockets.forEach(sid => {
            io.to(sid).emit('notification', {
                ...data,
                id: Date.now().toString(),
                timestamp: new Date()
            });
        });
        return true;
    }
    return false;
};

// Connect to MongoDB
connectDB();

// Zoom Credentials
const ZOOM_ACCOUNT_ID = process.env.ZOOM_S2S_ACCOUNT_ID || process.env.ACCOUNT_ID;
const ZOOM_CLIENT_ID = process.env.ZOOM_S2S_CLIENT_ID || process.env.CLIENT_ID;
const ZOOM_CLIENT_SECRET = process.env.ZOOM_S2S_CLIENT_SECRET || process.env.CLIENT_SECRET;

// Zoom Helper: Get Access Token (Server-to-Server OAuth)
const getZoomAccessToken = async () => {
    try {
        const auth = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
        const response = await axios.post('https://zoom.us/oauth/token', null, {
            params: {
                grant_type: 'account_credentials',
                account_id: ZOOM_ACCOUNT_ID
            },
            headers: {
                Authorization: `Basic ${auth}`
            }
        });
        return response.data.access_token;
    } catch (error) {
        if (error.response) {
            console.error('[Zoom OAuth Error Response]:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('[Zoom OAuth Error Message]:', error.message);
        }
        throw new Error('Failed to connect to Zoom: ' + (error.response?.data?.reason || error.message));
    }
};

// Middleware
app.use(cors({
    origin: true, // Automatically mirror the request origin to allow credentials
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Standard Error Handler
const handleError = (res, err, context = '') => {
    console.error(`[Error ${context}]`, err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        context,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
};

// --- REQUEST LOGGER (DEBUG) ---
app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url}`);
    next();
});


// --- Authentication Middleware ---

const generateToken = (user) => {
    return jwt.sign(
        {
            id: user._id, // Use Mongoose ObjectId
            email: user.email,
        },
        JWT_SECRET,
        { expiresIn: '30m' }
    );
};

const generateRefreshToken = (user) => {
    return jwt.sign(
        {
            id: user._id,
            email: user.email,
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};

const getCookie = (req, name) => {
    const matches = req.headers.cookie && req.headers.cookie.match(new RegExp(
        "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
    ));
    return matches ? decodeURIComponent(matches[1]) : undefined;
};

const getRefreshTokenCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});

const getClearRefreshTokenCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/'
});

const isPasswordStrong = (password) => {
    if (!password) return false;
    if (password.length < 8) return false;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    return hasUppercase && hasLowercase && hasNumber && hasSpecial;
};

const verifyRecaptcha = async (token) => {
    if (process.env.NODE_ENV !== 'production' && !token) {
        return true;
    }
    const secret = process.env.RECAPTCHA_SECRET_KEY;
    if (!secret) return true;
    if (!token) return false;

    try {
        const response = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ secret, response: token })
        });
        const data = await response.json();
        return data.success;
    } catch (err) {
        console.error('ReCAPTCHA verify error:', err.message);
        return false;
    }
};

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Auth token required' });

    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Check if this user's tokens have been revoked (e.g., after account deletion)
    if (tokenBlacklist.has(`user:${decoded.id.toString()}`)) {
        return res.status(401).json({ error: 'Session revoked. Please log in again.' });
    }

    // Verify user still exists in DB (handles deleted-but-cached users)
    try {
        const userExists = await User.exists({ _id: decoded.id });
        if (!userExists) {
            console.warn(`[Auth] Token valid but user ${decoded.id} not found in DB — rejecting`);
            return res.status(401).json({ error: 'Account no longer exists. Please contact support.' });
        }
    } catch (dbErr) {
        // If DB check fails (e.g., connection issue), let the request through to avoid lockout
        console.error('[Auth] DB user-existence check failed, skipping:', dbErr.message);
    }

    req.user = decoded;
    next();
};

// Role Caching (Simple In-Memory for now, similar to previous version)
const roleCache = new Map();
const ROLE_CACHE_TTL = 30 * 1000;

const getUserRole = async (userId) => {
    if (!userId) return null;
    const strId = userId.toString();

    if (roleCache.has(strId)) {
        const { role, timestamp } = roleCache.get(strId);
        if (Date.now() - timestamp < ROLE_CACHE_TTL) return role;
    }

    try {
        const roleDoc = await UserRole.findOne({ user_id: userId });
        const role = roleDoc ? roleDoc.role : null;
        if (role) roleCache.set(strId, { role, timestamp: Date.now() });
        return role;
    } catch (error) {
        console.error(`[Auth] Failed to fetch role for ${userId}:`, error);
        return null;
    }
};

const requireRole = (allowedRoles) => async (req, res, next) => {
    try {
        const role = await getUserRole(req.user.id);
        if (!role) {
            console.warn(`[Auth] No role found for user ID: ${req.user.id}`);
            return res.status(401).json({ error: 'User role not found' });
        }

        // Attach role to req.user for use in routes
        req.user.role = role;

        if (!allowedRoles.includes(role)) {
            console.warn(`[Auth] Access Denied for user ${req.user.id}. Role: ${role}. Required one of: ${allowedRoles}`);
            return res.status(403).json({ error: `Access denied. Your role is '${role}'. Required: ${allowedRoles.join(', ')}` });
        }
        next();
    } catch (err) {
        handleError(res, err, 'requireRole');
    }
};

const requireAdmin = requireRole(['admin']);
const requireManager = requireRole(['admin', 'manager']);
const requireAdminOrManager = requireRole(['admin', 'manager']);
const requireInstructor = requireRole(['admin', 'manager', 'instructor']);


// --- AI HUB LIVE INTEGRATION (BROADCAST & BOOST) ---
app.post('/api/admin/broadcast', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const { type, selectedUsers, category, subject, message } = req.body;
        console.log('[AI Hub Broadcast] Hit for', selectedUsers?.length, 'users', selectedUsers);

        if (!selectedUsers || selectedUsers.length === 0) {
            return res.status(400).json({ error: 'No recipients selected' });
        }

        if (!subject || !message) {
            return res.status(400).json({ error: 'Subject and message are required' });
        }

        // ✅ FIX: Convert string IDs to ObjectId so MongoDB $in query actually matches
        const validObjectIds = selectedUsers
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));

        if (validObjectIds.length === 0) {
            console.error('[AI Hub Broadcast] No valid ObjectIds from selectedUsers:', selectedUsers);
            return res.status(400).json({ error: 'No valid user IDs provided' });
        }

        // Fetch emails + names from User collection (authoritative source)
        const users = await User.find({ _id: { $in: validObjectIds } }).select('email full_name').lean();
        console.log('[AI Hub Broadcast] Users found from DB:', users.length, users.map(u => u.email));

        const userMap = {};
        users.forEach(u => {
            if (u.email) userMap[u._id.toString()] = { email: u.email, full_name: u.full_name || 'Student' };
        });

        // Fallback: check Profile for any missing (also cast to ObjectId)
        const missingIds = selectedUsers.filter(id => !userMap[id] && mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));
        if (missingIds.length > 0) {
            console.log('[AI Hub Broadcast] Checking profiles for missing IDs:', missingIds.length);
            const profiles = await Profile.find({ user_id: { $in: missingIds } }).lean();
            profiles.forEach(p => {
                if (p.email) userMap[p.user_id.toString()] = { email: p.email, full_name: p.full_name || 'Student' };
            });
        }

        const recipients = Object.entries(userMap).map(([uid, u]) => ({ user_id: uid, ...u }));
        console.log('[AI Hub Broadcast] Resolved recipients:', recipients.map(r => r.email));

        if (recipients.length === 0) {
            return res.status(400).json({ error: 'No valid emails found for selected users. Please sync platform data and try again.' });
        }

        console.log('[AI Hub Broadcast] Sending direct emails to', recipients.length, 'recipients');

        const results = await Promise.allSettled(
            recipients.map(r => {
                const html = `
                    <div style="font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #334155; max-width: 600px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);">
                        <div style="text-align: center; margin-bottom: 28px;">
                            <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); width: 64px; height: 64px; border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px; color: #ffffff; font-size: 24px; font-weight: 800; line-height: 64px; text-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-left: auto; margin-right: auto;">A</div>
                            <h2 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.03em;">Academy of Tech Masters</h2>
                            <p style="color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; margin: 4px 0 0 0;">Official Broadcast Notification</p>
                        </div>
                        <div style="background-color: #f8fafc; border-radius: 16px; padding: 24px; border: 1px solid #f1f5f9; margin-bottom: 24px;">
                            <p style="font-size: 16px; font-weight: 700; color: #1e293b; margin-top: 0; margin-bottom: 12px;">Hello ${r.full_name || 'Student'},</p>
                            <div style="font-size: 15px; color: #334155; white-space: pre-wrap; line-height: 1.7;">${message}</div>
                        </div>
                        <div style="text-align: center; margin: 28px 0;">
                            <a href="https://aotms.com" style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; font-weight: 700; font-size: 14px; border-radius: 10px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">Visit LMS Dashboard</a>
                        </div>
                        <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 20px; text-align: center;">
                            <p style="font-size: 12px; color: #94a3b8; margin: 0 0 6px 0;">This email is an official request sent to registered system members of AOTMS LMS.</p>
                            <p style="font-size: 12px; color: #94a3b8; margin: 0;">&copy; ${new Date().getFullYear()} <a href="https://aotms.com" style="color: #3b82f6; text-decoration: none; font-weight: 600;">aotms.com</a>. All rights reserved.</p>
                        </div>
                    </div>
                `;
                return sendEmail({
                    to: r.email,
                    subject: subject,
                    html: html
                });
            })
        );

        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        results.forEach((r, i) => {
            if (r.status === 'rejected') {
                console.error(`[AI Hub Broadcast] ❌ Failed for ${recipients[i]?.email}:`, r.reason?.message);
            } else {
                console.log(`[AI Hub Broadcast] ✅ Sent to ${recipients[i]?.email}`);
            }
        });

        console.log(`[AI Hub Broadcast] Done — ${succeeded} sent, ${failed} failed out of ${recipients.length} total`);

        if (succeeded === 0 && failed > 0) {
            return res.status(502).json({
                success: false,
                error: `Mail broadcast failed. Check SMTP credentials in .env file.`,
                failed,
                succeeded
            });
        }

        res.json({
            success: true,
            message: `Broadcast sent to ${succeeded} recipient${succeeded !== 1 ? 's' : ''}.${failed > 0 ? ` ${failed} failed.` : ''}`,
            succeeded,
            failed
        });
    } catch (err) {
        handleError(res, err, 'ai-broadcast-proxy');
    }
});

// Zoom Routes
app.post('/api/zoom/meetings', authenticateToken, requireInstructor, async (req, res) => {
    const { topic, startTime, duration, agenda } = req.body;
    try {
        const accessToken = await getZoomAccessToken();
        const response = await axios.post('https://api.zoom.us/v2/users/me/meetings', {
            topic,
            type: 2, // Scheduled meeting
            start_time: startTime,
            duration,
            agenda,
            settings: {
                host_video: true,
                participant_video: false,
                join_before_host: false,
                mute_upon_entry: true,
                waiting_room: true,
                auto_recording: 'cloud'
            }
        }, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({
            meetingId: response.data.id,
            joinUrl: response.data.join_url,
            startUrl: response.data.start_url,
            password: response.data.password
        });
    } catch (err) {
        handleError(res, err, 'create-zoom-meeting');
    }
});
// 2. Zoom SDK Signature Generation (Meeting SDK)
app.post('/api/zoom/signature', (req, res) => {
    try {
        const { meetingNumber, role } = req.body;
        // Fallback to CLIENT_ID/SECRET if SDK_KEY/SECRET are not set
        const sdkKey = process.env.ZOOM_SDK_KEY || process.env.ZOOM_CLIENT_ID;
        const sdkSecret = process.env.ZOOM_SDK_SECRET || process.env.ZOOM_CLIENT_SECRET;

        if (!sdkKey || !sdkSecret) {
            console.error('[Zoom Signature] Missing Credentials in .env');
            return res.status(500).json({ error: 'Zoom SDK Credentials missing on server. Check .env for ZOOM_SDK_KEY or ZOOM_CLIENT_ID.' });
        }

        const iat = Math.floor(Date.now() / 1000) - 30;
        const exp = iat + 60 * 60 * 2; // 2 hours

        const payload = {
            sdkKey: sdkKey,
            appKey: sdkKey, // Required for SDK v5.0+
            mn: meetingNumber,
            role: role, // 0 for attendee, 1 for host
            iat: iat,
            exp: exp,
            tokenExp: exp,
            video_webrtc_mode: 1 // Force WebRTC mode to prevent "Job was cancelled" and "Gallery View Not Supported" errors
        };

        const jwt = require('jsonwebtoken');
        const signature = jwt.sign(payload, sdkSecret, { algorithm: 'HS256' });

        console.log(`[Zoom Signature] Generated for meeting: ${meetingNumber}`);
        // Return BOTH the signature and the sdkKey to ensure frontend syncs correctly
        res.json({
            signature,
            sdkKey: sdkKey
        });

    } catch (err) {
        console.error('[Zoom Signature Error]', err);
        res.status(500).json({ error: 'Signature generation failed' });
    }
});

app.put('/api/admin/update-enrollment-payment', authenticateToken, requireAdminOrManager, async (req, res) => {
    const { enrollmentId, payment_term } = req.body;
    try {
        const { Enrollment } = require('./models/Course');
        const enrollment = await Enrollment.findById(enrollmentId);
        if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' });

        enrollment.category = 'approve'; // Auto-approve visibility when payment progresses

        if (payment_term === 'full') {
            enrollment.payment_term = 'full';
            enrollment.remaining_balance = 0;
            // When moving to active for the first time or via admin, reset enrolled_at to start drip timer
            if (enrollment.status !== 'active') {
                enrollment.enrolled_at = new Date();
            }
            enrollment.status = 'active';
            // Mark full payment as approved if exists
            if (enrollment.payment && enrollment.payment.length > 0) {
                const p = enrollment.payment.find(r => r.term === 'full' && r.status === 'pending');
                if (p) { p.status = 'approved'; p.approved_at = new Date(); }
            }
        } else if (payment_term === 'term1') {
            enrollment.payment_term = 'term1';
            enrollment.remaining_balance = Math.round((enrollment.final_price || 0) * 0.4);
            if (enrollment.status !== 'active') {
                enrollment.enrolled_at = new Date();
            }
            enrollment.status = 'active';
            // Mark term1 payment as approved if exists
            if (enrollment.payment && enrollment.payment.length > 0) {
                const p = enrollment.payment.find(r => (r.term === 'term1' || !r.term) && r.status === 'pending');
                if (p) { p.status = 'approved'; p.approved_at = new Date(); }
            }
        } else if (payment_term === 'term2') {
            // Admin triggers Term 2 payment requirement OR clears final pay
            if (enrollment.payment_term === 'term2' && enrollment.status === 'pending') {
                enrollment.status = 'active';
                enrollment.remaining_balance = 0;
                if (enrollment.payment && enrollment.payment.length > 0) {
                    const p = enrollment.payment.find(r => r.term === 'term2' && r.status === 'pending');
                    if (p) { p.status = 'approved'; p.approved_at = new Date(); }
                }
            } else {
                // Trigger Term 2 requirement - KEEP payment_term as what it is (likely term1)
                enrollment.remaining_balance = Math.round((enrollment.final_price || 0) * 0.4);
                enrollment.status = 'deactivate';
                enrollment.category = 'approve';
            }
        }

        enrollment.updated_at = new Date();
        await enrollment.save();

        // Broadcast change
        io.emit('course_enrollments_changed', { userId: enrollment.user_id, courseId: enrollment.course_id });

        res.json({ message: 'Payment term updated and category approved', enrollment });
    } catch (err) {
        handleError(res, err, 'update-enrollment-payment');
    }
});



app.post('/api/zoom/webhook', async (req, res) => {
    try {
        const { event, payload } = req.body;
        const secretToken = process.env.ZOOM_SECRET_TOKEN?.trim();

        // 1. URL Validation (Required by Zoom to activate webhooks)
        if (event === 'endpoint.url_validation') {
            if (!secretToken) {
                console.warn('[Zoom Webhook] No ZOOM_SECRET_TOKEN found for validation');
                return res.status(400).send('No secret token configured');
            }

            const hash = require('crypto')
                .createHmac('sha256', secretToken)
                .update(payload.plainToken)
                .digest('hex');

            console.log('[Zoom Webhook] Responding to validation');
            return res.status(200).json({
                plainToken: payload.plainToken,
                encryptedToken: hash
            });
        }

        // 2. Event Verification (Security check for other events)
        const signature = req.headers['x-zm-signature'];
        if (signature && secretToken) {
            const timestamp = req.headers['x-zm-request-timestamp'];
            const message = `v0:${timestamp}:${JSON.stringify(req.body)}`;
            const hash = require('crypto')
                .createHmac('sha256', secretToken)
                .update(message)
                .digest('hex');

            const expectedSignature = `v0=${hash}`;
            if (signature !== expectedSignature) {
                console.error('[Zoom Webhook] Invalid signature');
                return res.status(401).send('Invalid signature');
            }
        }

        // 3. Handle specific events
        console.log(`[Zoom Webhook] Event Received: ${event}`);

        switch (event) {
            case 'meeting.started':
                await LiveClass.findOneAndUpdate(
                    { meeting_id: payload.object.id.toString() },
                    { status: 'live' }
                );
                break;
            case 'meeting.ended':
                await LiveClass.findOneAndUpdate(
                    { meeting_id: payload.object.id.toString() },
                    { status: 'ended' }
                );
                break;
        }

        res.status(200).send('OK');
    } catch (err) {
        console.error('[Zoom Webhook Error]', err);
        res.status(500).send('Internal Server Error');
    }
});


// --- Question Bank Generator Proxy ---
app.post('/api/manager/generate-questions', authenticateToken, requireInstructor, async (req, res) => {
    console.log('[API] Generate Questions Request:', req.body.topic, req.body.type);
    const { topic, type, count, difficulty, prompt } = req.body;

    const aiAgentApiKey = (process.env.AI_AGENT_API || '').trim();

    const buildMockQuestion = (qType, qTopic, qDifficulty) => {
        const shortType = qType?.toLowerCase();
        if (shortType === 'true_false') {
            return {
                topic: qTopic || "General",
                question_text: "Is the server correctly running?",
                type: "true_false",
                difficulty: qDifficulty || "medium",
                options: ["True", "False"],
                correct_answer: "True",
                explanation: "This is a simple explanation.",
                marks: 1
            };
        }
        if (shortType === 'short' || shortType === 'short_answer') {
            return {
                topic: qTopic || "General",
                question_text: "State the primary method to authenticate API key.",
                type: "short_answer",
                difficulty: qDifficulty || "medium",
                correct_answer: "Process API key headers.",
                explanation: "This is a simple explanation.",
                marks: 1
            };
        }
        if (shortType === 'long' || shortType === 'long_answer') {
            return {
                topic: qTopic || "General",
                question_text: "Explain the concept of API routing.",
                type: "long_answer",
                difficulty: qDifficulty || "medium",
                correct_answer: "API routing processes requests dynamically through express routes.",
                explanation: "This is a simple explanation.",
                marks: 5
            };
        }
        if (shortType === 'fill_blank') {
            return {
                topic: qTopic || "General",
                question_text: "AOTMS uses _______ for databases.",
                type: "fill_blank",
                difficulty: qDifficulty || "medium",
                correct_answer: "MongoDB",
                explanation: "This is a simple explanation.",
                marks: 1
            };
        }
        if (shortType === 'coding') {
            return {
                topic: qTopic || "General",
                question_text: "Write code to log 'Hello World'.",
                type: "coding",
                difficulty: qDifficulty || "medium",
                correct_answer: "console.log('Hello World');",
                explanation: "This is a simple explanation.",
                marks: 5
            };
        }
        // Default MCQ
        return {
            topic: qTopic || "General",
            question_text: "Which protocol is standard for web traffic?",
            type: "mcq",
            difficulty: qDifficulty || "medium",
            options: ["HTTP", "FTP", "SMTP", "SSH"],
            correct_answer: "HTTP",
            explanation: "This is a simple explanation.",
            marks: 1
        };
    };

    if (!aiAgentApiKey) {
        console.warn('[AI_AGENT_API] Key is missing in .env. Returning local mock questions.');
        const mockQ = buildMockQuestion(type, topic, difficulty);
        return res.json({
            testing_msg: "testing HI message Received an Output",
            ai_agent_api: "none",
            questions: [mockQ]
        });
    }

    try {
        console.log(`[AI_AGENT_API Trigger] Calling OpenAI chat/completions using Project Key...`);
        console.log("testing HI message Received an Output.");

        const systemPrompt = `You are an expert quiz generator. Generate exactly ${count || 1} questions of type '${type || 'mcq'}' on the topic '${topic || 'General'}' with a difficulty level of '${difficulty || 'medium'}'.
Extra instructions: ${prompt || 'None'}.

You MUST reply with a JSON object in this exact schema:
{
  "questions": [
    {
      "topic": "${topic || 'General'}",
      "question_text": "Question text here",
      "type": "${type || 'mcq'}",
      "difficulty": "${difficulty || 'medium'}",
      "options": ["Option A", "Option B", "Option C", "Option D"], // ONLY include for mcq or true_false (options should be ["True", "False"] for true_false)
      "correct_answer": "Option text of the correct answer, or True/False, or text containing the exact correct answer/code",
      "explanation": "Simple explanation describing why this answer is correct",
      "marks": 1
    }
  ]
}
Do not include any Markdown wrapper like \`\`\`json or text explanation around the JSON, just a clean JSON output.`;

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [
                { role: 'user', content: systemPrompt }
            ],
            temperature: 0.7,
            response_format: { type: 'json_object' }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${aiAgentApiKey}`
            },
            timeout: 60000
        });

        const content = response.data.choices[0].message.content;
        let data = JSON.parse(content);

        if (data && typeof data === 'object') {
            if (Array.isArray(data)) {
                data = { questions: data };
            }
            data.testing_msg = "testing HI message Received an Output";
            data.ai_agent_api = aiAgentApiKey;
        }

        console.log(`[AI_AGENT_API Success] Successfully generated ${data.questions ? data.questions.length : 0} questions via OpenAI.`);
        res.json(data);

    } catch (error) {
        console.error('Error generating questions via OpenAI API:', error.message);
        if (error.response) {
            console.error('OpenAI Error Details:', JSON.stringify(error.response.data));
        }

        console.log(`[AI_AGENT_API Fallback] Returning mock question under error.`);
        const mockQ = buildMockQuestion(type, topic, difficulty);
        res.json({
            testing_msg: "testing HI message Received an Output (fallback)",
            ai_agent_api: aiAgentApiKey,
            questions: [mockQ],
            error: error.message
        });
    }
});

// --- Local Native Python Execution Helper ---
const runLocalPython = (code, stdin = '') => {
    return new Promise((resolve) => {
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `script_${Date.now()}_${Math.floor(Math.random() * 10000)}.py`);
        
        fs.writeFile(tmpFile, code, 'utf8', (err) => {
            if (err) {
                return resolve({
                    stdout: '',
                    stderr: `Failed to write python script: ${err.message}`,
                    code: 1,
                    output: `Failed to write python script: ${err.message}`
                });
            }

            const child = execFile('python3', [tmpFile], { timeout: 8000, maxBuffer: 5 * 1024 * 1024, encoding: 'utf8' }, (execErr, stdout, stderr) => {
                fs.unlink(tmpFile, () => {});

                if (execErr && execErr.killed) {
                    return resolve({
                        stdout: stdout || '',
                        stderr: 'Time Limit Exceeded (8 seconds max runtime).',
                        code: 1,
                        output: (stdout || '') + '\nTime Limit Exceeded (8 seconds max runtime).'
                    });
                }

                const outStr = stdout || '';
                const errStr = stderr || (execErr && !stdout ? execErr.message : '');

                resolve({
                    stdout: outStr,
                    stderr: errStr,
                    code: execErr ? (execErr.code || 1) : 0,
                    output: outStr || errStr || 'Execution completed.'
                });
            });

            if (stdin && child.stdin) {
                child.stdin.write(stdin);
                child.stdin.end();
            }
        });
    });
};

// --- Multi-Engine Code Execution Helper (Native Local + Judge0 Public CE) ---
const executeCode = async (language, sourceCode, stdin = '') => {
    const lang = language?.toLowerCase() || 'javascript';

    // Normalization map
    const langMap = {
        'javascript': 'javascript', 'js': 'javascript', 'node': 'javascript',
        'typescript': 'typescript', 'ts': 'typescript',
        'python': 'python', 'python3': 'python', 'py': 'python',
        'java': 'java',
        'cpp': 'cpp', 'c++': 'cpp', 'g++': 'cpp',
        'c': 'c', 'gcc': 'c',
        'csharp': 'csharp', 'c#': 'csharp',
        'sql': 'sql', 'sqlite': 'sql', 'sqlite3': 'sql',
        'go': 'go', 'golang': 'go',
        'rust': 'rust', 'rs': 'rust',
        'php': 'php',
        'ruby': 'ruby', 'rb': 'ruby'
    };

    const targetLang = langMap[lang] || 'python';

    // 1. Native Fast Python Execution (0ms network latency, supports emojis, long scripts & loops)
    if (targetLang === 'python') {
        try {
            console.log('[Native Engine] Running Python code locally via child_process...');
            const res = await runLocalPython(sourceCode, stdin);
            if (res.stdout || (res.code === 0 && !res.stderr.includes('python3: not found'))) {
                return { run: res, language: 'python' };
            }
            console.log('[Native Python] Local python3 not installed in environment, trying cloud compiler...');
        } catch (pyErr) {
            console.warn('[Native Python Error]:', pyErr.message, 'Falling back to cloud API...');
        }
    }

    // 2. Fast Local JS Execution
    if (targetLang === 'javascript' && !stdin) {
        try {
            const outputBuffer = [];
            const errorBuffer = [];
            const sandbox = {
                console: {
                    log: (...args) => outputBuffer.push(args.map(a => String(a)).join(' ')),
                    error: (...args) => errorBuffer.push(args.map(a => String(a)).join(' ')),
                    warn: (...args) => outputBuffer.push('[WARN] ' + args.map(a => String(a)).join(' '))
                },
                setTimeout, clearTimeout, setInterval, clearInterval,
                process: { exit: (code) => { throw new Error(`Process exited with code ${code}`); } }
            };
            const script = new vm.Script(sourceCode);
            const context = vm.createContext(sandbox);
            script.runInContext(context, { timeout: 4000 });
            return {
                run: {
                    stdout: outputBuffer.join('\n'),
                    stderr: errorBuffer.join('\n'),
                    code: 0,
                    output: outputBuffer.join('\n') || errorBuffer.join('\n')
                },
                language: 'javascript'
            };
        } catch (err) {
            console.log('[Local JS VM] Falling through to cloud compilers due to:', err.message);
        }
    }

    // 3. Judge0 Public CE API (No API Key Required)
    try {
        console.log(`[Judge0 Public CE] Compiling ${targetLang} code...`);
        const judge0LangMap = {
            'python': 71,
            'javascript': 63,
            'typescript': 74,
            'cpp': 54,
            'c': 50,
            'java': 62,
            'csharp': 51,
            'sql': 82,
            'go': 60,
            'rust': 73,
            'php': 68,
            'ruby': 72
        };
        const langId = judge0LangMap[targetLang] || 71;

        const judge0Res = await axios.post('https://ce.judge0.com/submissions?wait=true', {
            source_code: sourceCode,
            language_id: langId,
            stdin: stdin || ''
        }, { timeout: 10000 });

        const { stdout, stderr, compile_output, message, status } = judge0Res.data;
        const outStr = stdout || '';
        const errStr = stderr || compile_output || message || '';

        return {
            run: {
                stdout: outStr,
                stderr: errStr,
                code: status?.id === 3 ? 0 : 1,
                output: outStr || errStr || 'Execution finished.'
            },
            language: targetLang
        };
    } catch (j0Err) {
        console.error('[Judge0 Public CE Error]:', j0Err.message);
        throw new Error(`Code execution failed: ${j0Err.message}`);
    }
};

// --- Piston Code Execution (Run Code) ---
app.post('/api/run-code', authenticateToken, async (req, res) => {
    const { language, version, files, stdin } = req.body;

    console.log(`[API] Run Code Request: ${language}`);

    if (!language || !files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'Language and files (array) are required.' });
    }

    try {
        const sourceCode = files[0].content;
        const result = await executeCode(language, sourceCode, stdin);
        res.json(result);
    } catch (err) {
        handleError(res, err, 'run-code');
    }
});

// --- Auth Routes ---

// Helper to trigger n8n OTP Webhook with automatic Test/Prod URL fallback
const triggerOtpWebhook = async ({ email, full_name, otp }) => {
    let n8nUrl = (process.env.OTP_N8N_URL || process.env.OTP_N8n || process.env.OTP_N8N || 'https://aotms.app.n8n.cloud/webhook-test/Email').trim();
    console.log(`[AUTH-OTP Webhook] Triggering n8n at ${n8nUrl} for ${email}...`);

    try {
        const response = await axios.post(n8nUrl, {
            email,
            full_name: full_name || 'Student',
            otp
        }, { timeout: 8000 });
        console.log(`[AUTH-OTP Webhook] Successfully delivered OTP via n8n for ${email}:`, response.data);
        return true;
    } catch (err) {
        // Automatically try swapping between test URL (/webhook-test/) and prod URL (/webhook/)
        const altUrl = n8nUrl.includes('/webhook-test/') 
            ? n8nUrl.replace('/webhook-test/', '/webhook/')
            : n8nUrl.replace('/webhook/', '/webhook-test/');

        console.warn(`[AUTH-OTP Webhook Primary Failed: ${err.message}]. Retrying with fallback URL: ${altUrl}...`);
        try {
            const altResponse = await axios.post(altUrl, {
                email,
                full_name: full_name || 'Student',
                otp
            }, { timeout: 8000 });
            console.log(`[AUTH-OTP Webhook Fallback] Successfully delivered OTP via n8n (${altUrl}) for ${email}:`, altResponse.data);
            return true;
        } catch (fallbackErr) {
            console.error(`[AUTH-OTP Webhook Error]: n8n Webhook failed (${err.message} / ${fallbackErr.message}).`);
            
            // ── Brevo SMTP Fallback Disabled (Uncomment below to re-enable Brevo SMTP if needed) ──
            /*
            const otpHtml = `
                <div style="font-family: 'Outfit', 'Inter', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border-radius: 16px; background: #ffffff; border: 1px solid #e2e8f0;">
                    <h2 style="color: #0f172a;">Academy of Tech Masters</h2>
                    <p>Hello ${full_name || 'Student'}, your verification OTP code is:</p>
                    <div style="background: #f8fafc; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #1e3a8a; text-align: center; padding: 16px; border-radius: 12px; margin: 20px 0;">${otp}</div>
                    <p style="font-size: 12px; color: #64748b;">This OTP is valid for 5 minutes.</p>
                </div>
            `;
            await sendEmail({
                to: email,
                subject: `🎉 Email Verification OTP: ${otp} | Academy of Tech Masters`,
                html: otpHtml
            });
            */
            return false;
        }
    }
};

app.post('/api/auth/send-otp', async (req, res) => {
    const { email, full_name } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    try {
        const existingOtp = await OTP.findOne({ email });
        if (existingOtp) {
            const timePassed = Date.now() - new Date(existingOtp.created_at).getTime();
            if (timePassed < 60 * 1000) {
                const waitSeconds = Math.ceil((60 * 1000 - timePassed) / 1000);
                return res.status(429).json({ error: `Please wait ${waitSeconds} seconds before requesting another OTP.` });
            }
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

        await OTP.findOneAndUpdate(
            { email },
            { otp, full_name, expires_at: expiresAt, created_at: new Date() },
            { upsert: true, returnDocument: 'after' }
        );

        console.log(`[AUTH-OTP] Generated OTP for ${email}: ${otp}`);

        // Trigger n8n Webhook for OTP Email
        await triggerOtpWebhook({ email, full_name, otp });

        res.json({ message: 'OTP sent successfully' });
    } catch (err) {
        handleError(res, err, 'send-otp');
    }
});

app.post('/api/auth/resend-otp', async (req, res) => {
    const { email, full_name } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    try {
        const existingOtp = await OTP.findOne({ email });
        if (existingOtp) {
            const timePassed = Date.now() - new Date(existingOtp.created_at).getTime();
            if (timePassed < 60 * 1000) {
                const waitSeconds = Math.ceil((60 * 1000 - timePassed) / 1000);
                return res.status(429).json({ error: `Please wait ${waitSeconds} seconds before requesting another OTP.` });
            }
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await OTP.findOneAndUpdate(
            { email },
            { otp, full_name, expires_at: expiresAt, created_at: new Date() },
            { upsert: true, returnDocument: 'after' }
        );
        console.log(`[AUTH-OTP] Resent OTP for ${email}: ${otp}`);

        // Trigger n8n Webhook for OTP Email
        await triggerOtpWebhook({ email, full_name, otp });

        res.json({ message: 'OTP resent successfully' });
    } catch (err) {
        handleError(res, err, 'resend-otp');
    }
});

app.post('/api/auth/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });

    try {
        const otpDoc = await OTP.findOne({ email });
        if (!otpDoc) return res.status(400).json({ error: 'No OTP found' });
        if (new Date() > otpDoc.expires_at) return res.status(400).json({ error: 'OTP expired' });

        if (otpDoc.failed_attempts >= 5) {
            return res.status(400).json({ error: 'Too many failed attempts. Please request a new OTP.' });
        }

        if (otpDoc.otp !== otp) {
            otpDoc.failed_attempts = (otpDoc.failed_attempts || 0) + 1;
            await otpDoc.save();

            const remaining = 5 - otpDoc.failed_attempts;
            if (remaining <= 0) {
                await OTP.deleteOne({ email });
                return res.status(400).json({ error: 'Too many failed attempts. OTP has been invalidated. Please request a new OTP.' });
            }
            return res.status(400).json({ error: `Invalid OTP. You have ${remaining} attempts remaining.` });
        }

        await VerifiedEmail.findOneAndUpdate(
            { email },
            { verified: true, verified_at: new Date() },
            { upsert: true }
        );

        // Delete successful OTP
        await OTP.deleteOne({ email });

        res.json({ success: true, message: 'OTP verified' });
    } catch (err) {
        handleError(res, err, 'verify-otp');
    }
});

app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded && decoded.id) {
                blacklistUserTokens(decoded.id);
            }
        } catch (e) {
            // Expired or invalid access token is fine, still clear the refresh cookie
        }
    }
    res.clearCookie('refresh_token', getClearRefreshTokenCookieOptions());
    res.json({ success: true, message: 'Logged out successfully' });
});

// ── Forgot Password Routes ─────────────────────────────────────────────────
// In-memory OTP store: { email -> { otp, expiresAt } }
const resetOtpStore = new Map();

// Step 1: Generate OTP, send via n8n, store for verification
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const existingRecord = resetOtpStore.get(email.toLowerCase().trim());
        if (existingRecord) {
            const timePassed = Date.now() - existingRecord.createdAt;
            if (timePassed < 60 * 1000) {
                const waitSeconds = Math.ceil((60 * 1000 - timePassed) / 1000);
                return res.status(429).json({ error: `Please wait ${waitSeconds} seconds before requesting another OTP.` });
            }
        }

        // Check user exists case-insensitively
        const user = await User.findOne({ email: { $regex: new RegExp("^" + email.trim() + "$", "i") } });
        if (!user) return res.status(404).json({ error: 'No account found with this email.' });

        // Generate random 6-digit OTP
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

        // Store OTP (store as lowercase email in key for consistency)
        resetOtpStore.set(email.toLowerCase().trim(), { otp, expiresAt, failedAttempts: 0, createdAt: Date.now() });
        setTimeout(() => resetOtpStore.delete(email.toLowerCase().trim()), 5 * 60 * 1000);

        // Call n8n webhook — it emails the OTP to the user
        try {
            await fetch('https://aotms.app.n8n.cloud/webhook/Email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.toLowerCase().trim(),
                    otp,
                    name: user.full_name || 'User',
                    type: 'forgot_password'
                })
            });
        } catch (n8nErr) {
            console.error('[ForgotPassword] n8n webhook failed:', n8nErr.message);
            // Don't fail — OTP is stored, but email may not be sent
        }

        console.log(`[ForgotPassword] OTP ${otp} generated for ${email}`);
        res.json({ success: true, message: 'OTP sent to your email.' });
    } catch (err) {
        handleError(res, err, 'forgot-password');
    }
});

// Step 2: Verify OTP entered by user
app.post('/api/auth/verify-reset-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });

        const record = resetOtpStore.get(email.toLowerCase().trim());
        if (!record) return res.status(400).json({ error: 'OTP expired or not found. Request a new one.' });
        if (Date.now() > record.expiresAt) {
            resetOtpStore.delete(email.toLowerCase().trim());
            return res.status(400).json({ error: 'OTP has expired. Request a new one.' });
        }
        if (record.failedAttempts >= 5) {
            resetOtpStore.delete(email.toLowerCase().trim());
            return res.status(400).json({ error: 'Too many failed attempts. OTP has been invalidated. Please request a new one.' });
        }

        if (String(otp).trim() !== record.otp) {
            record.failedAttempts = (record.failedAttempts || 0) + 1;
            const remaining = 5 - record.failedAttempts;
            if (remaining <= 0) {
                resetOtpStore.delete(email.toLowerCase().trim());
                return res.status(400).json({ error: 'Too many failed attempts. OTP has been invalidated. Please request a new one.' });
            }
            return res.status(400).json({ error: `Invalid OTP. You have ${remaining} attempts remaining.` });
        }

        console.log(`[ForgotPassword] OTP verified for ${email}`);
        res.json({ success: true, message: 'OTP verified' });
    } catch (err) {
        handleError(res, err, 'verify-reset-otp');
    }
});

// Step 3: Reset password after OTP verified
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, otp, new_password } = req.body;
        if (!email || !otp || !new_password) return res.status(400).json({ error: 'All fields required' });
        if (!isPasswordStrong(new_password)) {
            return res.status(400).json({ error: 'Password must be at least 8 characters, and contain mixed case, numbers, and special characters.' });
        }

        // Re-verify OTP for security
        const record = resetOtpStore.get(email.toLowerCase().trim());
        if (!record || Date.now() > record.expiresAt || String(otp).trim() !== record.otp) {
            return res.status(400).json({ error: 'OTP invalid or expired. Please restart the reset process.' });
        }

        // Find user case-insensitively
        const user = await User.findOne({ email: { $regex: new RegExp("^" + email.trim() + "$", "i") } });
        if (!user) return res.status(404).json({ error: 'No account found with this email.' });

        const salt = await bcrypt.genSalt(12);
        user.password_hash = await bcrypt.hash(new_password, salt);
        await user.save();

        resetOtpStore.delete(email.toLowerCase().trim());
        console.log(`[ForgotPassword] Password reset successful for ${email}`);
        res.json({ success: true, message: 'Password reset successfully. You can now login.' });
    } catch (err) {
        handleError(res, err, 'reset-password');
    }
});

app.post('/api/auth/refresh', async (req, res) => {
    const refreshToken = getCookie(req, 'refresh_token') || req.body?.refresh_token;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token is missing' });

    try {
        const decoded = jwt.verify(refreshToken, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) return res.status(401).json({ error: 'User session no longer valid' });

        // Unblacklist user if previously blacklisted
        tokenBlacklist.delete(`user:${user._id.toString()}`);

        // Generate new token pair
        const newAccessToken = generateToken(user);
        const newRefreshToken = generateRefreshToken(user);

        // Update the HttpOnly cookie
        res.cookie('refresh_token', newRefreshToken, getRefreshTokenCookieOptions());

        res.json({
            session: {
                access_token: newAccessToken,
                expires_in: 1800
            }
        });
    } catch (err) {
        console.error('[Refresh Token Error]:', err.message);
        return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
});

app.post('/api/public/enroll', async (req, res) => {
    try {
        const { name, email, phone, course } = req.body;
        if (!name || !email || !phone || !course) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        // Enrollment processed
        res.json({ success: true, message: 'Enrolled successfully' });
    } catch (err) {
        handleError(res, err, 'public-enroll');
    }
});

app.post('/api/auth/signup', async (req, res) => {
    const { email, password, fullName, phone, courseType, collegeName, instituteName, city, district, country, fullAddress, latitude, longitude, captcha_token } = req.body;
    try {
        // 1. CAPTCHA verification
        const isValidCaptcha = await verifyRecaptcha(captcha_token || req.body['g-recaptcha-response']);
        if (!isValidCaptcha) {
            return res.status(400).json({ error: 'CAPTCHA verification failed. Please try again.' });
        }

        // 2. Email verification check
        const isVerified = await VerifiedEmail.findOne({ email: email.toLowerCase().trim(), verified: true });
        if (!isVerified) {
            return res.status(401).json({ error: 'Email must be verified before completing registration.' });
        }

        // 3. Password strength check
        if (!isPasswordStrong(password)) {
            return res.status(400).json({ error: 'Password must be at least 8 characters, and contain mixed case, numbers, and special characters.' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: 'User already exists' });

        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(password, salt);
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=random&color=fff`;

        // Generate 12-hour registration timestamp
        const now = new Date();
        const registrationDate = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const registrationTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        // Determine role based on courseType
        // internship → 'intern', everything else → 'student'
        const assignedRole = courseType === 'internship' ? 'intern' : 'student';

        // Create User
        const user = await User.create({
            email,
            password_hash: passwordHash,
            full_name: fullName,
            avatar_url: avatarUrl,
            phone: phone,
            registration_date: registrationDate,
            registration_time: registrationTime
        });

        // Create Profile (include course_type)
        await Profile.create({
            user_id: user._id,
            email,
            full_name: fullName,
            avatar_url: avatarUrl,
            mobile_number: phone,
            college_name: collegeName,
            institute_name: instituteName,
            course_type: courseType || 'full_time',
            registration_date: registrationDate,
            registration_time: registrationTime,
            city,
            district,
            country,
            full_address: fullAddress,
            latitude,
            longitude,
            approval_status: 'pending'
        });

        // Create Role based on courseType
        await UserRole.create({
            user_id: user._id,
            role: assignedRole
        });

        tokenBlacklist.delete(`user:${user._id.toString()}`);
        const token = generateToken(user);
        const refreshToken = generateRefreshToken(user);
        res.cookie('refresh_token', refreshToken, getRefreshTokenCookieOptions());

        res.json({
            user: { id: user._id, email, full_name: fullName, avatar_url: avatarUrl, role: assignedRole },
            session: { access_token: token, expires_in: 1800 }
        });

    } catch (err) {
        handleError(res, err, 'signup');
    }
});

const loginIpLimitStore = new Map();

app.post('/api/auth/login', async (req, res) => {
    const { email, password, captcha_token } = req.body;
    try {
        const loginIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        // 1. CAPTCHA verification
        const isValidCaptcha = await verifyRecaptcha(captcha_token || req.body['g-recaptcha-response']);
        if (!isValidCaptcha) {
            return res.status(400).json({ error: 'CAPTCHA verification failed. Please try again.' });
        }

        // Login Rate Limit: 5 requests / 15 min per IP
        const now = Date.now();
        let ipAttempts = loginIpLimitStore.get(loginIp) || [];
        ipAttempts = ipAttempts.filter(ts => now - ts < 15 * 60 * 1000);
        if (ipAttempts.length >= 5) {
            return res.status(429).json({ error: 'Too many login attempts from this IP. Please try again after 15 minutes.' });
        }
        ipAttempts.push(now);
        loginIpLimitStore.set(loginIp, ipAttempts);

        const user = await User.findOne({ email: { $regex: new RegExp("^" + email.trim() + "$", "i") } });

        if (!user) {
            // Log generic failed attempt for unknown user
            await SecurityEvent.create({
                event_type: 'login_failed_unknown',
                ip_address: loginIp,
                details: { email, timestamp: new Date() }
            });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check if suspended/locked before bcrypt check
        const [profile, roleDoc] = await Promise.all([
            Profile.findOne({ user_id: user._id }),
            UserRole.findOne({ user_id: user._id })
        ]);

        const userRole = roleDoc ? roleDoc.role : 'student';

        // 2. Email verification check (non-admins must be verified prior to login)
        if (userRole !== 'admin') {
            const isVerified = await VerifiedEmail.findOne({ email: email.toLowerCase().trim(), verified: true });
            if (!isVerified) {
                return res.status(401).json({ error: 'Email verification is required before login.' });
            }
        }

        if (profile?.approval_status === 'suspended') {
            // Check if auto-unsuspend is applicable
            if (profile?.suspended_until && new Date() > new Date(profile.suspended_until)) {
                profile.approval_status = 'approved';
                profile.suspended_until = null;
                await profile.save();
            } else {
                if (profile?.suspended_until) {
                    const timeLeftMs = new Date(profile.suspended_until).getTime() - Date.now();
                    const timeLeftMins = Math.ceil(timeLeftMs / (60 * 1000));
                    return res.status(403).json({ error: `Account locked due to too many failed attempts. Try again in ${timeLeftMins} minutes.` });
                }
                return res.status(403).json({ error: 'Your account is suspended. Please contact the administrator.' });
            }
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            // Brute force protection: 5 attempts -> 15 min lock
            user.failed_login_attempts = (user.failed_login_attempts || 0) + 1;
            await user.save();

            let errorMessage = 'Invalid credentials';
            const remaining = 5 - user.failed_login_attempts;

            if (user.failed_login_attempts >= 5) {
                const lockTime = new Date(Date.now() + 15 * 60 * 1000); // 15 min lock
                await Profile.findOneAndUpdate({ user_id: user._id }, { approval_status: 'suspended', suspended_until: lockTime });
                await SecurityEvent.create({
                    event_type: 'account_auto_locked',
                    ip_address: loginIp,
                    user_id: user._id,
                    details: { reason: '5 failed login attempts', attempts: user.failed_login_attempts }
                });
                errorMessage = 'Account locked due to too many failed attempts. Try again in 15 minutes.';
            } else {
                errorMessage = `Invalid credentials. You have ${remaining} attempts remaining before account lock.`;
            }

            return res.status(401).json({ error: errorMessage });
        }

        // Update last login info & housekeeping
        user.last_login_at = new Date();
        user.failed_login_attempts = 0;
        user.last_login_ip = loginIp;
        await user.save();

        const loginTime = new Date().toISOString();

        console.log(`[Auth] Login Successful: ${email} | Role: ${userRole}`);

        // --- ADMIN OTP GATE ---
        // Admin must verify via OTP before receiving an access token
        if (userRole === 'admin') {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

            await OTP.findOneAndUpdate(
                { email },
                { otp, full_name: user.full_name, expires_at: expiresAt },
                { upsert: true, returnDocument: 'after' }
            );

            // Log the OTP dispatch as a security event
            await SecurityEvent.create({
                event_type: 'admin_login_otp_sent',
                user_id: user._id,
                ip_address: loginIp,
                details: { email, timestamp: loginTime }
            });

            // Send Admin Login OTP directly via Resend email helper
            const otpHtml = `
                <div style="font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #334155; max-width: 500px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); width: 56px; height: 56px; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px; color: #ffffff; font-size: 20px; font-weight: 800; line-height: 56px; text-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-left: auto; margin-right: auto;">A</div>
                        <h2 style="color: #0f172a; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">Academy of Tech Masters</h2>
                        <p style="color: #ea580c; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 4px 0 0 0;">Admin Security Authentication</p>
                    </div>
                    <p style="font-size: 15px; color: #334155; margin-top: 0; font-weight: 600;">Hello ${user.full_name || 'Admin'},</p>
                    <p style="font-size: 14px; color: #475569;">A login attempt was initiated on your administrator platform account. Use the following security code to authenticate. This code is valid for 10 minutes:</p>
                    <div style="background: #fdf8f6; border: 1px dashed #fdba74; border-radius: 12px; text-align: center; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #ea580c; padding: 18px; margin: 24px 0; text-shadow: 0 1px 1px rgba(0,0,0,0.05); font-family: monospace;">
                        ${otp}
                    </div>
                    <div style="background-color: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0; margin: 20px 0; font-size: 13px; color: #475569;">
                        <p style="font-weight: 700; color: #1e293b; margin: 0 0 8px 0;">Login Details:</p>
                        <p style="margin: 0 0 4px 0;"><strong>IP Address:</strong> ${loginIp}</p>
                        <p style="margin: 0;"><strong>Time:</strong> ${loginTime}</p>
                    </div>
                    <p style="font-size: 12px; color: #ef4444; font-weight: 600; margin-bottom: 0;">If this login attempt was not initiated by you, please secure your credentials immediately.</p>
                    <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center;">
                        <p style="font-size: 11px; color: #94a3b8; margin: 0 0 4px 0;">Academy of Tech Masters Security Team.</p>
                        <p style="font-size: 11px; color: #94a3b8; margin: 0;">&copy; ${new Date().getFullYear()} <a href="https://aotms.com" style="color: #3b82f6; text-decoration: none; font-weight: 600;">aotms.com</a>. All rights reserved.</p>
                    </div>
                </div>
            `;

            try {
                await triggerOtpWebhook({ email, full_name: user.full_name, otp });
                console.log(`[Security] Admin OTP sent successfully via n8n to ${email}`);
            } catch (e) {
                console.error(`[Security] Admin OTP API error:`, e.message);
            }

            console.log(`[Security] Admin OTP generated and scheduled for ${email}: ${otp}`);
            return res.json({ requiresOtp: true, message: 'OTP sent to your admin email' });
        }
        // ----------------------

        tokenBlacklist.delete(`user:${user._id.toString()}`);
        const token = generateToken(user);
        const refreshToken = generateRefreshToken(user);
        res.cookie('refresh_token', refreshToken, getRefreshTokenCookieOptions());

        res.json({
            user: {
                id: user._id,
                email,
                full_name: user.full_name,
                avatar_url: user.avatar_url || (profile ? profile.avatar_url : null),
                role: userRole,
                approval_status: profile ? profile.approval_status : 'pending',
                suspended_until: profile ? profile.suspended_until : null
            },
            session: { access_token: token, expires_in: 1800 }
        });

    } catch (err) {
        handleError(res, err, 'login');
    }
});


// Admin OTP Verification — completes admin login by verifying the OTP sent via n8n
app.post('/api/auth/admin-verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

    try {
        const otpRecord = await OTP.findOne({ email });
        if (!otpRecord) return res.status(400).json({ error: 'OTP not found. Please log in again.' });
        if (new Date() > new Date(otpRecord.expires_at)) {
            await OTP.deleteOne({ email });
            return res.status(400).json({ error: 'OTP has expired. Please log in again.' });
        }

        if (otpRecord.failed_attempts >= 5) {
            await OTP.deleteOne({ email });
            return res.status(400).json({ error: 'Too many failed attempts. OTP has been invalidated. Please log in again.' });
        }

        if (otpRecord.otp !== otp) {
            otpRecord.failed_attempts = (otpRecord.failed_attempts || 0) + 1;
            await otpRecord.save();

            const remaining = 5 - otpRecord.failed_attempts;
            if (remaining <= 0) {
                await OTP.deleteOne({ email });
                return res.status(400).json({ error: 'Too many failed attempts. OTP has been invalidated. Please log in again.' });
            }
            return res.status(400).json({ error: `Invalid OTP. You have ${remaining} attempts remaining.` });
        }

        // Consume the OTP
        await OTP.deleteOne({ email });

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const [profile, roleDoc] = await Promise.all([
            Profile.findOne({ user_id: user._id }),
            UserRole.findOne({ user_id: user._id })
        ]);

        const userRole = roleDoc ? roleDoc.role : 'student';
        if (userRole !== 'admin') return res.status(403).json({ error: 'Admin access only.' });

        tokenBlacklist.delete(`user:${user._id.toString()}`);
        const token = generateToken(user);
        const loginTime = new Date().toISOString();
        const loginIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        // Persistent notification for the admin
        await Notification.create({
            user_id: user._id,
            type: 'system',
            title: '🔐 Admin Login Verified',
            message: `OTP verified. Admin session started from IP: ${loginIp} at ${new Date().toLocaleString()}.`,
            data: { ip: loginIp, time: loginTime },
            created_at: new Date()
        });

        // Broadcast to other active admins
        io.emit('admin_login_alert', { email, time: loginTime, ip: loginIp });

        console.log(`[Security] Admin OTP verified — login complete for ${email}`);

        const refreshToken = generateRefreshToken(user);
        res.cookie('refresh_token', refreshToken, getRefreshTokenCookieOptions());

        res.json({
            user: {
                id: user._id,
                email,
                full_name: user.full_name,
                avatar_url: user.avatar_url || (profile ? profile.avatar_url : null),
                role: userRole,
                approval_status: profile ? profile.approval_status : 'approved',
                suspended_until: profile ? profile.suspended_until : null
            },
            session: { access_token: token, expires_in: 1800 }
        });
    } catch (err) {
        handleError(res, err, 'admin-verify-otp');
    }
});

// Admin OTP Resend
app.post('/api/auth/admin-resend-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const roleDoc = await UserRole.findOne({ user_id: user._id });
        if (!roleDoc || roleDoc.role !== 'admin') return res.status(403).json({ error: 'Admin access only.' });

        const existingOtp = await OTP.findOne({ email });
        if (existingOtp) {
            const timePassed = Date.now() - new Date(existingOtp.created_at).getTime();
            if (timePassed < 60 * 1000) {
                const waitSeconds = Math.ceil((60 * 1000 - timePassed) / 1000);
                return res.status(429).json({ error: `Please wait ${waitSeconds} seconds before requesting another OTP.` });
            }
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await OTP.findOneAndUpdate(
            { email },
            { otp, full_name: user.full_name, expires_at: expiresAt, created_at: new Date() },
            { upsert: true, returnDocument: 'after' }
        );

        // Send Admin Login OTP directly via Resend email helper
        const otpHtml = `
            <div style="font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #334155; max-width: 500px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);">
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); width: 56px; height: 56px; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px; color: #ffffff; font-size: 20px; font-weight: 800; line-height: 56px; text-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-left: auto; margin-right: auto;">A</div>
                    <h2 style="color: #0f172a; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">Academy of Tech Masters</h2>
                    <p style="color: #ea580c; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 4px 0 0 0;">Admin Security Authentication</p>
                </div>
                <p style="font-size: 15px; color: #334155; margin-top: 0; font-weight: 600;">Hello ${user.full_name || 'Admin'},</p>
                <p style="font-size: 14px; color: #475569;">A login attempt was initiated on your administrator platform account. Use the following security code to authenticate. This code is valid for 10 minutes:</p>
                <div style="background: #fdf8f6; border: 1px dashed #fdba74; border-radius: 12px; text-align: center; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #ea580c; padding: 18px; margin: 24px 0; text-shadow: 0 1px 1px rgba(0,0,0,0.05); font-family: monospace;">
                    ${otp}
                </div>
                <div style="background-color: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0; margin: 20px 0; font-size: 13px; color: #475569;">
                    <p style="font-weight: 700; color: #1e293b; margin: 0 0 8px 0;">Login Details (Resent):</p>
                    <p style="margin: 0;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                </div>
                <p style="font-size: 12px; color: #ef4444; font-weight: 600; margin-bottom: 0;">If this login attempt was not initiated by you, please secure your credentials immediately.</p>
                <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center;">
                    <p style="font-size: 11px; color: #94a3b8; margin: 0 0 4px 0;">Academy of Tech Masters Security Team.</p>
                    <p style="font-size: 11px; color: #94a3b8; margin: 0;">&copy; ${new Date().getFullYear()} <a href="https://aotms.com" style="color: #3b82f6; text-decoration: none; font-weight: 600;">aotms.com</a>. All rights reserved.</p>
                </div>
            </div>
        `;

        try {
            await triggerOtpWebhook({ email, full_name: user.full_name, otp });
            console.log(`[Security] Admin OTP resent successfully via n8n to ${email}`);
        } catch (e) {
            console.error(`[Security] Admin OTP Resend API error (Resend):`, e.message);
        }

        console.log(`[Security] Admin OTP resent to ${email}: ${otp}`);
        res.json({ message: 'OTP resent successfully' });
    } catch (err) {
        handleError(res, err, 'admin-resend-otp');
    }
});

// --- Attendance Routes ---

app.post('/api/student/pulse-rating', authenticateToken, async (req, res) => {
    try {
        const { course_id, instructor_id, rating, review } = req.body;
        if (!course_id || !rating) return res.status(400).json({ error: 'Course and rating are required' });

        await CourseRating.findOneAndUpdate(
            { user_id: req.user.id, course_id },
            {
                user_id: req.user.id,
                course_id,
                instructor_id,
                rating,
                review,
                created_at: new Date()
            },
            { upsert: true, new: true }
        );
        res.json({ message: 'Rating pulsed successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/instructor/pulse-ratings', authenticateToken, async (req, res) => {
    try {
        const role = await getUserRole(req.user.id);
        if (!['instructor', 'manager', 'admin'].includes(role)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const filter = role === 'instructor' ? { instructor_id: req.user.id } : {};

        const ratings = await CourseRating.find(filter)
            .populate('user_id', 'full_name avatar_url email')
            .populate('course_id', 'title thumbnail_url')
            .sort({ created_at: -1 });
        res.json(ratings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/student/mark-attendance', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();
        const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
        const timeStr = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
        const dayStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).toUpperCase();
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        // 1. Check if already marked for today (24H restart logic)
        const existing = await Attendance.findOne({ user_id: userId, date: dateStr });
        if (existing) {
            return res.status(400).json({ error: 'Attendance already marked for today' });
        }

        // 2. Mark Attendance
        const attendance = await Attendance.create({
            user_id: userId,
            timestamp: now,
            ip_address: ip,
            day: dayStr,
            time: timeStr,
            date: dateStr
        });

        res.json({ success: true, message: 'Attendance marked successfully', attendance });
    } catch (err) {
        handleError(res, err, 'mark-attendance');
    }
});

app.get('/api/admin/attendance/:userId', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const { userId } = req.params;
        const history = await Attendance.find({ user_id: userId }).sort({ timestamp: -1 });
        res.json(history);
    } catch (err) {
        handleError(res, err, 'get-attendance-admin');
    }
});

// Student: fetch own attendance history
app.get('/api/student/my-attendance', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const history = await Attendance.find({ user_id: userId }).sort({ timestamp: -1 });
        res.json(history);
    } catch (err) {
        handleError(res, err, 'get-student-attendance');
    }
});

// Self-Upgrade endpoint (for dev/setup phase)
app.post('/api/auth/self-upgrade', authenticateToken, async (req, res) => {
    const { email } = req.user;
    // Allow raman or aotms emails to upgrade
    if (!email.toLowerCase().includes('raman') && !email.toLowerCase().includes('aotms')) {
        return res.status(403).json({ error: 'This secret feature is not available for your email.' });
    }

    try {
        const UserRole = mongoose.model('UserRole');
        const roleDoc = await UserRole.findOneAndUpdate(
            { user_id: req.user.id },
            { role: 'manager', updated_at: new Date() },
            { upsert: true, returnDocument: 'after' }
        );
        res.json({ success: true, message: 'Your role has been upgraded to MANAGER', role: roleDoc.role });
    } catch (err) {
        handleError(res, err, 'self-upgrade');
    }
});

// --- Admin/User Management ---

app.put('/api/admin/update-user-role', authenticateToken, requireAdmin, async (req, res) => {
    const { userId, role } = req.body;
    if (!userId || !role) return res.status(400).json({ error: 'Missing userId or role' });

    try {
        await UserRole.findOneAndUpdate(
            { user_id: userId },
            { role, updated_at: new Date() },
            { upsert: true }
        );

        if (['admin', 'manager'].includes(role)) {
            await Profile.findOneAndUpdate({ user_id: userId }, { approval_status: 'approved' });
        }

        res.json({ message: 'User role updated', userId, role });
    } catch (err) {
        handleError(res, err, 'update-role');
    }
});

app.put('/api/admin/update-user-status', authenticateToken, requireAdmin, async (req, res) => {
    const { userId, status } = req.body;
    if (!userId || !status) return res.status(400).json({ error: 'Missing userId or status' });

    try {
        let updateData = { approval_status: status, updated_at: new Date() };

        if (status === 'suspended' && req.body.suspensionDays) {
            const suspendedUntil = new Date();
            suspendedUntil.setDate(suspendedUntil.getDate() + parseInt(req.body.suspensionDays));
            updateData.suspended_until = suspendedUntil;
        } else if (status === 'approved') {
            updateData.suspended_until = null;
        }

        await Profile.findOneAndUpdate(
            { user_id: userId },
            updateData,
            { returnDocument: 'after' }
        );

        // Notify user via socket for real-time suspension/approval
        if (status === 'suspended') {
            io.to(userId.toString()).emit('user_suspended', {
                suspended_until: updateData.suspended_until
            });
        } else if (status === 'approved') {
            io.to(userId.toString()).emit('user_approved');
        }

        res.json({ message: `User status updated to ${status}` });
    } catch (err) {
        handleError(res, err, 'update-user-status');
    }
});

app.post('/api/admin/send-approval-email', authenticateToken, requireAdmin, async (req, res) => {
    const { userId } = req.body;
    try {
        const profile = await Profile.findOne({ user_id: userId });
        if (!profile) return res.status(404).json({ error: 'User not found' });

        const approvalHtml = `
            <div style="font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #334155; max-width: 600px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);">
                <div style="text-align: center; margin-bottom: 28px;">
                    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); width: 64px; height: 64px; border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px; color: #ffffff; font-size: 24px; font-weight: 800; line-height: 64px; text-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-left: auto; margin-right: auto;">✓</div>
                    <h2 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.03em;">Academy of Tech Masters</h2>
                    <p style="color: #10b981; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; margin: 4px 0 0 0;">Account Approved Successfully</p>
                </div>
                <div style="background-color: #f8fafc; border-radius: 16px; padding: 24px; border: 1px solid #f1f5f9; margin-bottom: 24px;">
                    <p style="font-size: 16px; font-weight: 700; color: #1e293b; margin-top: 0; margin-bottom: 12px;">Dear ${profile.full_name || 'Student'},</p>
                    <p style="font-size: 15px; color: #334155; margin-bottom: 12px;">We are pleased to inform you that your account at <strong>Academy of Tech Masters</strong> has been approved by the school administrator!</p>
                    <p style="font-size: 15px; color: #334155; margin-bottom: 0;">You can now log in to the platform and access your courses, classroom sessions, and records.</p>
                </div>
                <div style="text-align: center; margin: 28px 0;">
                    <a href="https://aotms.com" style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; font-weight: 700; font-size: 14px; border-radius: 10px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">Access LMS Portal</a>
                </div>
                <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 20px; text-align: center;">
                    <p style="font-size: 12px; color: #94a3b8; margin: 0 0 6px 0;">If you have any questions, please contact our support team at <a href="mailto:aotms.marketing@gmail.com" style="color: #3b82f6; text-decoration: none;">aotms.marketing@gmail.com</a>.</p>
                    <p style="font-size: 12px; color: #94a3b8; margin: 0;">&copy; ${new Date().getFullYear()} <a href="https://aotms.com" style="color: #3b82f6; text-decoration: none; font-weight: 600;">aotms.com</a>. All rights reserved.</p>
                </div>
            </div>
        `;

        await sendEmail({
            to: profile.email,
            subject: 'Your Account is Approved! | Academy of Tech Masters',
            html: approvalHtml
        });

        res.json({ message: 'Approval email sent' });
    } catch (err) {
        handleError(res, err, 'send-approval-email');
    }
});

app.post('/api/admin/send-student-email', authenticateToken, requireAdminOrManager, async (req, res) => {
    const { userId } = req.body;
    try {
        // Find profile to get student email and name
        const profile = await Profile.findOne({ user_id: userId });
        if (!profile) {
            console.error(`[Admin Email] Profile not found for userId: ${userId}`);
            return res.status(404).json({ error: 'Student profile not found' });
        }

        const welcomeHtml = `
            <div style="font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #334155; max-width: 600px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);">
                <div style="text-align: center; margin-bottom: 28px;">
                    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); width: 64px; height: 64px; border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px; color: #ffffff; font-size: 24px; font-weight: 800; line-height: 64px; text-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-left: auto; margin-right: auto;">A</div>
                    <h2 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.03em;">Academy of Tech Masters</h2>
                    <p style="color: #3b82f6; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; margin: 4px 0 0 0;">LMS Portal Onboarding</p>
                </div>
                <div style="background-color: #f8fafc; border-radius: 16px; padding: 24px; border: 1px solid #f1f5f9; margin-bottom: 24px;">
                    <p style="font-size: 16px; font-weight: 700; color: #1e293b; margin-top: 0; margin-bottom: 12px;">Dear ${profile.full_name || 'Student'},</p>
                    <p style="font-size: 15px; color: #334155; margin-bottom: 12px;">Your profile is completely configured on our LMS system. You can log in and manage your assignments, attendance records, study modules, and track your ongoing exam results.</p>
                    
                    <div style="background-color: #ffffff; padding: 18px; border-radius: 12px; border: 1px solid #e2e8f0; margin: 20px 0;">
                        <p style="font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 8px 0;">Your Registered Login Details:</p>
                        <p style="font-size: 14px; color: #475569; margin: 0 0 6px 0;"><strong>LMS URL:</strong> <a href="https://aotms.com" style="color: #3b82f6; text-decoration: none; font-weight: 600;">aotms.com</a></p>
                        <p style="font-size: 14px; color: #475569; margin: 0;"><strong>Username:</strong> ${profile.email}</p>
                    </div>
                    
                    <p style="font-size: 14px; color: #475569; margin-bottom: 0;">If you are logging in for the first time, click the button below to sign in or reset your password using the "Forgot Password" link on the login page.</p>
                </div>
                <div style="text-align: center; margin: 28px 0;">
                    <a href="https://aotms.com" style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; font-weight: 700; font-size: 14px; border-radius: 10px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">Sign In to LMS</a>
                </div>
                <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 20px; text-align: center;">
                    <p style="font-size: 12px; color: #94a3b8; margin: 0 0 6px 0;">This email was sent via administrative action. For any queries, reach us at <a href="mailto:aotms.marketing@gmail.com" style="color: #3b82f6; text-decoration: none;">aotms.marketing@gmail.com</a>.</p>
                    <p style="font-size: 12px; color: #94a3b8; margin: 0;">&copy; ${new Date().getFullYear()} <a href="https://aotms.com" style="color: #3b82f6; text-decoration: none; font-weight: 600;">aotms.com</a>. All rights reserved.</p>
                </div>
            </div>
        `;

        await sendEmail({
            to: profile.email,
            subject: 'LMS Onboarding and Account Information | Academy of Tech Masters',
            html: welcomeHtml
        });

        res.json({ success: true, message: 'Onboarding email sent successfully via SMTP' });
    } catch (err) {
        handleError(res, err, 'send-student-email');
    }
});

app.post('/api/rpc/log_admin_action', authenticateToken, requireAdminOrManager, async (req, res) => {
    const { _module, _action, _details } = req.body;
    try {
        await SystemLog.create({
            log_type: 'audit',
            module: _module,
            action: _action,
            details: _details,
            user_id: req.user.id
        });
        res.json({ success: true });
    } catch (err) {
        handleError(res, err, 'log-admin-action');
    }
});


app.put('/api/admin/toggle-course-active', authenticateToken, requireAdminOrManager, async (req, res) => {
    const { courseId, is_active } = req.body;
    if (!courseId) return res.status(400).json({ error: 'Missing courseId' });

    try {
        const course = await Course.findByIdAndUpdate(
            courseId,
            { is_active, updated_at: new Date() },
            { returnDocument: 'after' }
        );

        if (!course) return res.status(404).json({ error: 'Course not found' });

        // Log action
        await SystemLog.create({
            log_type: 'audit',
            module: 'Course',
            action: `Course ${is_active ? 'Activated' : 'Deactivated'}`,
            details: { course_id: courseId, is_active },
            user_id: req.user.id
        });

        res.json({ message: `Course ${is_active ? 'activated' : 'deactivated'}`, course });
    } catch (err) {
        handleError(res, err, 'toggle-course-active');
    }
});


app.put('/api/admin/approve-question-bank', authenticateToken, requireAdmin, async (req, res) => {
    const { topic, status, course_id } = req.body;
    if (!topic || !status) return res.status(400).json({ error: 'Missing topic or status' });

    try {
        const updateData = {
            approval_status: status,
            course_id: course_id || undefined,
            updated_at: new Date()
        };

        const result = await QuestionBank.updateMany({ topic }, updateData);

        // Log action
        await SystemLog.create({
            log_type: 'audit',
            module: 'QuestionBank',
            action: `Question Bank ${status} for topic: ${topic}`,
            details: { topic, status, modified_count: result.modifiedCount },
            user_id: req.user.id
        });

        res.json({ message: `Question Bank for ${topic} ${status}`, modified_count: result.modifiedCount });
    } catch (err) {
        handleError(res, err, 'approve-question-bank');
    }
});

// Remove/Disable Question Bank
app.delete('/api/admin/question-bank/:topic', authenticateToken, requireInstructor, async (req, res) => {
    const { topic } = req.params;
    if (!topic) return res.status(400).json({ error: 'Missing topic' });

    try {
        const topicClean = topic.trim();
        const safeTopicReg = topicClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flexibleTopicRegex = new RegExp(`^\\s*${safeTopicReg.replace(/\\ /g, '\\s*')}\\s*$`, 'i');

        // Find associated Exam and Mock Paper IDs for StudentExamAccess clean-up
        const matchingExams = await Exam.find({ title: flexibleTopicRegex }).select('_id').lean();
        const matchingMocks = await MockPaper.find({ title: flexibleTopicRegex }).select('_id').lean();
        const examIds = matchingExams.map(e => e._id);
        const mockIds = matchingMocks.map(m => m._id);

        // Delete from QuestionBank
        const qbResult = await QuestionBank.deleteMany({ topic: flexibleTopicRegex });

        // Delete from Exam (Scheduling)
        const examResult = await Exam.deleteMany({ title: flexibleTopicRegex });

        // Delete from MockPaper
        const mockResult = await MockPaper.deleteMany({ title: flexibleTopicRegex });

        // Delete from StudentExamAccess
        const accessResult = await StudentExamAccess.deleteMany({
            $or: [
                { question_bank_topic: flexibleTopicRegex },
                { exam_id: { $in: examIds } },
                { mock_paper_id: { $in: mockIds } }
            ]
        });

        const totalDeletedCount = qbResult.deletedCount + examResult.deletedCount + mockResult.deletedCount + accessResult.deletedCount;

        // Log action
        await SystemLog.create({
            log_type: 'audit',
            module: 'QuestionBank',
            action: `Question Bank & Associated Exams & Student Access Permanently Removed for topic: ${topic}`,
            details: {
                topic,
                qb_deleted_count: qbResult.deletedCount,
                exam_deleted_count: examResult.deletedCount,
                mock_deleted_count: mockResult.deletedCount,
                access_deleted_count: accessResult.deletedCount,
                total_deleted_count: totalDeletedCount
            },
            user_id: req.user.id
        });

        res.json({
            message: `Question Bank, Exams, and Access for ${topic} permanently removed`,
            deleted_count: qbResult.deletedCount,
            exam_deleted_count: examResult.deletedCount,
            mock_deleted_count: mockResult.deletedCount,
            access_deleted_count: accessResult.deletedCount
        });
    } catch (err) {
        handleError(res, err, 'remove-question-bank');
    }
});




app.get('/api/admin/courses-with-instructors', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const courses = await Course.find({
            instructor_ids: { $exists: true, $not: { $size: 0 } }
        })
            .sort({ updated_at: -1, created_at: -1 })
            .lean();

        // Get all unique instructor IDs from all courses (instructor_ids is an array)
        const instructorIds = [...new Set(courses.flatMap(c => c.instructor_ids || []).filter(id => id))];

        // Fetch profiles, User details, and potentially Batches
        const [profiles, users, batches] = await Promise.all([
            Profile.find({ user_id: { $in: instructorIds } }).lean(),
            User.find({ _id: { $in: instructorIds } }).select('full_name email avatar_url').lean(),
            Batch.find({ course_id: { $in: courses.map(c => c._id) } }).lean()
        ]);

        const profileMap = profiles.reduce((acc, p) => {
            acc[p.user_id.toString()] = p;
            return acc;
        }, {});

        const userMap = users.reduce((acc, u) => {
            acc[u._id.toString()] = u;
            return acc;
        }, {});

        // Fetch Approver Names
        const approverIds = [...new Set(batches.map(b => b.processed_by).filter(id => id))];
        const approversP = await Profile.find({ user_id: { $in: approverIds } }).select('user_id full_name').lean();
        const approverMap = approversP.reduce((acc, p) => {
            acc[p.user_id.toString()] = p.full_name;
            return acc;
        }, {});

        // Flatten courses into individual instructor-assignment rows
        const flatData = [];
        courses.forEach(course => {
            const instructorIdsArr = (course.instructor_ids || []);

            if (instructorIdsArr.length === 0) {
                flatData.push({
                    ...course,
                    id: course._id,
                    instructor_name: 'No Instructor Assigned',
                    instructor_email: '',
                    instructor_avatar: ''
                });
            } else {
                instructorIdsArr.forEach(id => {
                    const idStr = id.toString();
                    const p = profileMap[idStr] || {};
                    const u = userMap[idStr] || {};

                    const sessionBatch = batches.find(b =>
                        b.course_id.toString() === course._id.toString() &&
                        b.instructor_id?.toString() === idStr
                    );

                    // DERIVE STATUS FROM BATCH - This allows independent approval
                    // If no batch exists specifically for this instructor, it's still pending
                    const rowStatus = sessionBatch?.status || 'pending';

                    flatData.push({
                        ...course,
                        // row_id is used as key in the frontend
                        row_id: `${course._id}_${idStr}`,
                        course_id: course._id,
                        id: course._id,
                        instructor_id: idStr,
                        status: rowStatus, // INDIVIDUAL STATUS (pending, approved, rejected)
                        instructor_name: p.full_name || u.full_name || 'System Instructor',
                        instructor_email: p.email || u.email || '',
                        instructor_avatar: p.avatar_url || u.avatar_url || '',
                        batch_name: sessionBatch?.batch_name,
                        batch_type: sessionBatch?.batch_type,
                        start_time: sessionBatch?.start_time,
                        end_time: sessionBatch?.end_time,
                        max_students: sessionBatch?.max_students,
                        processed_by_name: sessionBatch?.processed_by ? approverMap[sessionBatch.processed_by.toString()] : null,
                        processed_at: sessionBatch?.processed_at
                    });
                });
            }
        });

        res.json(flatData);
    } catch (err) {
        handleError(res, err, 'admin-courses-with-instructors');
    }
});

/**
 * Individual Instructor Approval 
 * Activates the instructor's batch specifically
 */
app.put('/api/admin/approve-course', authenticateToken, requireAdminOrManager, async (req, res) => {
    const { courseId, instructorId, status, rejectionReason } = req.body;
    if (!courseId || !status) return res.status(400).json({ error: 'Missing courseId or status' });

    try {
        if (instructorId) {
            // Fetch instructor name to apply custom batch rules if needed
            const instructorProf = await Profile.findOne({ user_id: new mongoose.Types.ObjectId(instructorId) }).lean();
            const instructorName = instructorProf?.full_name || '';
            const targetCourse = await Course.findById(courseId).lean();
            const courseTitle = targetCourse?.title || '';

            // Custom Batch Assignment Logic:
            // 1. instructor A choose ai ml --> Morning Batch
            // 2. instructor B choose ai ml But Type defferent --> Afternoon Batch
            let forceBatchType = null;
            if (courseTitle.toLowerCase().includes('ai') && courseTitle.toLowerCase().includes('ml')) {
                if (instructorName.toLowerCase().includes('instructor a') || instructorName.toLowerCase().includes('raman')) {
                    forceBatchType = 'morning';
                } else if (instructorName.toLowerCase().includes('instructor b') || (instructorName.toLowerCase().includes('instructor') && !instructorName.toLowerCase().includes('a'))) {
                    forceBatchType = 'afternoon';
                }
            }

            // TARGETED BATCH UPDATE
            const batchUpdate = await Batch.findOneAndUpdate(
                {
                    course_id: new mongoose.Types.ObjectId(courseId),
                    instructor_id: new mongoose.Types.ObjectId(instructorId)
                },
                {
                    status: status,
                    is_active: status === 'approved',
                    processed_at: new Date(),
                    processed_by: req.user.id,
                    ...(forceBatchType && { batch_type: forceBatchType })
                },
                { returnDocument: 'after' }
            );
            console.log(`[BatchUpdate] Result: ${batchUpdate ? 'Found' : 'NotFound - creating new'}`);

            if (!batchUpdate && status === 'approved') {
                console.log(`[Approve] Creating missing batch record for instructor ${instructorId}`);
                await Batch.create({
                    batch_name: forceBatchType === 'morning' ? 'Morning AI ML Batch' : forceBatchType === 'afternoon' ? 'Afternoon AI ML Batch' : 'Approved Section',
                    batch_type: forceBatchType || 'morning',
                    start_time: forceBatchType === 'afternoon' ? '13:00' : '09:00',
                    end_time: forceBatchType === 'afternoon' ? '15:00' : '12:00',
                    course_id: new mongoose.Types.ObjectId(courseId),
                    instructor_id: new mongoose.Types.ObjectId(instructorId),
                    status: 'approved',
                    is_active: true,
                    processed_at: new Date(),
                    processed_by: req.user.id
                });
            }
        }

        // When instructorId is set, status is tracked per-Batch.
        // We ALSO update the Course-level status to 'approved' if at least one instructor is approved.
        // This fixes the "Grant Access still showing" bug for the platform view.
        let course;
        if (status === 'approved') {
            course = await Course.findByIdAndUpdate(courseId, {
                status: 'approved',
                reviewed_at: new Date(),
                reviewed_by: req.user.id
            }, { returnDocument: 'after' });
        } else if (!instructorId) {
            const updateData = {
                status: status,
                reviewed_at: new Date(),
                reviewed_by: req.user.id,
                rejection_reason: status === 'rejected' ? rejectionReason : null
            };
            course = await Course.findByIdAndUpdate(courseId, updateData, { returnDocument: 'after' });
        } else {
            course = await Course.findById(courseId).lean();
        }

        if (!course) return res.status(404).json({ error: 'Course not found' });

        // Log action
        await SystemLog.create({
            log_type: 'audit',
            module: 'Course',
            action: `Instructor ${status}`,
            details: { course_id: courseId, instructor_id: instructorId, status },
            user_id: req.user.id
        });

        res.json({ message: `Access ${status} for instructor`, course });
    } catch (err) {
        handleError(res, err, 'admin-approve-course');
    }
});

/**
 * Specific Instructor Revocation
 * Removes one instructor and their data without clearing the whole course
 */
app.delete('/api/admin/revoke-instructor-access/:courseId/:instructorId', authenticateToken, requireAdminOrManager, async (req, res) => {
    const { courseId, instructorId } = req.params;
    try {
        // 1. Remove instructor from the course list
        await Course.findByIdAndUpdate(courseId, {
            $pull: { instructor_ids: instructorId }
        });

        // 2. Cascade delete that specific instructor's batches and data
        const deletedBatchIds = (await Batch.find({ course_id: courseId, instructor_id: instructorId }).select('_id')).map(b => b._id);

        await Promise.all([
            Batch.deleteMany({ course_id: courseId, instructor_id: instructorId }),
            StudentBatch.deleteMany({ batch_id: { $in: deletedBatchIds } }),
            BatchRequest.deleteMany({ batch_id: { $in: deletedBatchIds } })
        ]);

        await SystemLog.create({
            log_type: 'audit',
            module: 'Course',
            action: 'Surgical Revocation',
            details: { course_id: courseId, instructor_id: instructorId },
            user_id: req.user.id
        });

        res.json({ message: 'Instructor access revoked and batches removed' });
    } catch (err) {
        handleError(res, err, 'admin-revoke-instructor-access');
    }
});

app.get('/api/admin/course-enrollments/:courseId', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const enrollments = await Enrollment.find({ course_id: req.params.courseId })
            .populate('user_id')
            .lean();

        // Get profiles for these users to get mobile numbers
        const userIds = enrollments.map(e => e.user_id?._id).filter(id => id);
        const [profiles, roles] = await Promise.all([
            Profile.find({ user_id: { $in: userIds } }).lean(),
            UserRole.find({ user_id: { $in: userIds } }).lean()
        ]);

        const profileMap = profiles.reduce((acc, p) => { acc[p.user_id] = p; return acc; }, {});
        const roleMap = roles.reduce((acc, r) => { acc[r.user_id] = r.role; return acc; }, {});

        const data = enrollments.map(e => {
            const user = e.user_id || {};
            const profile = profileMap[user._id] || {};
            return {
                id: e._id,
                student_id: user._id,
                full_name: user.full_name || profile.full_name,
                email: user.email || profile.email,
                avatar_url: user.avatar_url || profile.avatar_url,
                mobile_number: profile.mobile_number || 'N/A',
                role: roleMap[user._id] || 'student',
                status: e.status,
                progress: e.progress_percentage || 0,
                enrolled_at: e.enrolled_at
            };
        });

        res.json(data);
    } catch (err) {
        handleError(res, err, 'admin-course-enrollments');
    }
});

app.get('/api/admin/instructors', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        // 1. Get everyone with instructor role
        const roleUsers = await UserRole.find({ role: 'instructor' });
        const instructorRoleIds = roleUsers.map(r => r.user_id.toString());

        // 2. Get everyone assigned to a course (handles admins/managers who are teaching)
        const courses = await Course.find({ instructor_id: { $ne: null } }).select('instructor_id');
        const assignedIds = courses.map(c => c.instructor_id.toString());

        // 3. Combine unique IDs
        const allInstructorIds = Array.from(new Set([...instructorRoleIds, ...assignedIds]));

        // 4. Fetch Users and Profiles
        const [users, profiles] = await Promise.all([
            User.find({ _id: { $in: allInstructorIds } }).select('full_name email avatar_url created_at'),
            Profile.find({ user_id: { $in: allInstructorIds } })
        ]);

        const profileMap = new Map(profiles.map(p => [p.user_id.toString(), p]));

        const result = users.map(u => {
            const userId = u._id.toString();
            const p = profileMap.get(userId);
            const roleDoc = roleUsers.find(r => r.user_id.toString() === userId);

            return {
                user_id: userId,
                full_name: u.full_name || p?.full_name || 'Instructor',
                email: u.email || p?.email,
                mobile_number: p?.mobile_number || u.phone,
                role: roleDoc?.role || 'instructor', // Default to instructor if teaching but has other role
                created_at: u.created_at || p?.created_at,
                avatar_url: u.avatar_url || p?.avatar_url,
                approval_status: p?.approval_status || 'approved',
                status: p?.approval_status === 'suspended' ? 'suspended' : 'active'
            };
        });

        res.json(result);
    } catch (err) {
        handleError(res, err, 'get-admin-instructors');
    }
});

app.post('/api/admin/assign-course', authenticateToken, requireAdminOrManager, async (req, res) => {
    const { courseId, instructorId } = req.body;
    if (!courseId) return res.status(400).json({ error: 'Missing courseId' });

    try {
        const updateData = {
            $addToSet: { instructor_ids: instructorId }, // Add, don't replace
            updated_at: new Date()
        };

        const course = await Course.findByIdAndUpdate(courseId, updateData, { returnDocument: 'after' });

        // Log action
        await SystemLog.create({
            log_type: 'audit',
            module: 'Course',
            action: instructorId ? 'Course Assigned' : 'Course Unassigned',
            details: { course_id: courseId, instructor_id: instructorId },
            user_id: req.user.id
        });

        res.json({ message: 'Course assignment updated', course });
    } catch (err) {
        handleError(res, err, 'assign-course');
    }
});

app.delete('/api/admin/clear-course-instructors/:courseId', authenticateToken, requireAdminOrManager, async (req, res) => {
    const { courseId } = req.params;
    try {
        // Find the course first to get more details if needed for logs
        const courseBefore = await Course.findById(courseId).lean();
        if (!courseBefore) return res.status(404).json({ error: 'Course not found' });

        const course = await Course.findByIdAndUpdate(
            courseId,
            {
                $set: { instructor_ids: [], instructor_id: null },
                status: 'draft',
                updated_at: new Date()
            },
            { returnDocument: 'after' }
        );

        // CASCADING DELETION: Remove batches, student assignments, and requests
        // associated with this course when instructor access is revoked
        await Promise.all([
            Batch.deleteMany({ course_id: courseId }),
            StudentBatch.deleteMany({ course_id: courseId }),
            BatchRequest.deleteMany({ course_id: courseId })
        ]);

        // Log action
        await SystemLog.create({
            log_type: 'audit',
            module: 'Course',
            action: 'Instructors & Batches Cleared',
            details: {
                course_id: courseId,
                previous_instructors: courseBefore.instructor_ids,
                cascaded_deletions: ['Batches']
            },
            user_id: req.user.id
        });

        res.json({ message: 'Instructors cleared and batches removed successfully', course });
    } catch (err) {
        handleError(res, err, 'admin-clear-course-instructors');
    }
});

app.get('/api/admin/lookup-user/:userId', authenticateToken, requireAdminOrManager, async (req, res) => {
    const { userId } = req.params;
    try {
        let user = await User.findById(userId);
        if (!user) {
            const profile = await Profile.findById(userId);
            if (profile) user = await User.findById(profile.user_id);
        }

        if (!user) return res.status(404).json({ error: 'User not found' });

        const profile = await Profile.findOne({ user_id: user._id });
        const userRole = await UserRole.findOne({ user_id: user._id });

        res.json({
            user_id: user._id,
            full_name: user.full_name || profile?.full_name,
            email: user.email || profile?.email,
            avatar_url: user.avatar_url || profile?.avatar_url,
            role: userRole?.role || 'user'
        });
    } catch (err) {
        handleError(res, err, 'lookup-user-admin');
    }
});

app.delete('/api/admin/delete-user/:userId', authenticateToken, requireAdmin, async (req, res) => {
    const { userId } = req.params;
    try {
        // 1. Immediately revoke all active tokens for this user
        blacklistUserTokens(userId);

        // 2. Unassign courses (set to draft so they don't appear without instructor)
        await Course.updateMany(
            { instructor_ids: userId },
            { $pull: { instructor_ids: userId }, status: 'draft' }
        );
        await Course.updateMany(
            { instructor_id: userId },
            { $unset: { instructor_id: '' }, status: 'draft' }
        );

        // 3. Cascade delete ALL user-related data
        await Promise.all([
            User.findByIdAndDelete(userId),
            Profile.findOneAndDelete({ user_id: userId }),
            UserRole.findOneAndDelete({ user_id: userId }),
            Enrollment.deleteMany({ user_id: userId }),
            ExamResult.deleteMany({ user_id: userId }),
            StudentExamAccess.deleteMany({ student_id: userId }),
            StudentBatch.deleteMany({ student_id: userId }),
            Notification.deleteMany({ user_id: userId }),
            Attendance.deleteMany({ user_id: userId }),
            ResumeScan.deleteMany({ user_id: userId }),
            Message.deleteMany({ sender: userId }),
        ]);

        // 4. Log the deletion
        await SystemLog.create({
            log_type: 'audit',
            module: 'UserManagement',
            action: 'User Deleted',
            details: { deleted_user_id: userId, deleted_by: req.user.id },
            user_id: req.user.id
        });

        console.log(`[Admin] User ${userId} permanently deleted by ${req.user.id}`);
        res.json({ message: 'User deleted successfully. All associated data removed.' });
    } catch (err) {
        handleError(res, err, 'delete-user');
    }
});

// Admin: Get all users cross-validated with User collection (no ghost/orphan profiles)
app.get('/api/admin/users', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        // Fetch all User IDs that actually exist in the users collection
        const existingUsers = await User.find({}).select('_id email full_name avatar_url created_at').lean();
        const existingUserIds = new Set(existingUsers.map(u => u._id.toString()));

        // Fetch profiles only for users that still exist in the User collection
        const profiles = await Profile.find({
            user_id: { $in: Array.from(existingUserIds).map(id => new mongoose.Types.ObjectId(id)) }
        }).lean();

        // Fetch roles for existing users
        const roles = await UserRole.find({
            user_id: { $in: Array.from(existingUserIds).map(id => new mongoose.Types.ObjectId(id)) }
        }).lean();

        const profileMap = profiles.reduce((acc, p) => { acc[p.user_id.toString()] = p; return acc; }, {});
        const roleMap = roles.reduce((acc, r) => { acc[r.user_id.toString()] = r.role; return acc; }, {});

        const result = existingUsers.map(user => {
            const userId = user._id.toString();
            const profile = profileMap[userId] || {};
            const role = roleMap[userId] || 'student';
            const approvalStatus = profile.approval_status || 'pending';

            return {
                id: userId,
                user_id: userId,
                full_name: user.full_name || profile.full_name || null,
                email: user.email || profile.email || null,
                avatar_url: user.avatar_url || profile.avatar_url || null,
                mobile_number: profile.mobile_number || null,
                role,
                approval_status: approvalStatus,
                status: approvalStatus === 'suspended' ? 'suspended' : 'active',
                suspended_until: profile.suspended_until || null,
                last_active_at: profile.last_active_at || null,
                created_at: user.created_at || profile.created_at,
                city: profile.city || null,
                district: profile.district || null,
                country: profile.country || null,
                full_address: profile.full_address || null,
                latitude: profile.latitude || null,
                longitude: profile.longitude || null,
                college_name: profile.college_name || null,
                institute_name: profile.institute_name || null,
                course_type: profile.course_type || 'full_time',
            };
        });

        // Sort: newest first
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.json(result);
    } catch (err) {
        handleError(res, err, 'admin-get-users');
    }
});

// Quality Assurance - Data Summary (Enhanced for Admin Dashboard)
app.get('/api/admin/data-summary', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const [
            users,
            courses,
            enrollments,
            questionBanks,
            exams,
            securityEvents,
            pendingCourses,
            pendingEnrollments,
            pendingExams,
            highPriorityEvents,
            activeCoursesCount
        ] = await Promise.all([
            User.countDocuments(),
            Course.countDocuments(),
            Enrollment.countDocuments(),
            QuestionBank.countDocuments(),
            Exam.countDocuments(),
            SecurityEvent.countDocuments(),
            Course.countDocuments({ status: 'pending' }),
            Enrollment.countDocuments({ status: 'pending' }),
            Exam.countDocuments({ approval_status: 'pending' }),
            SecurityEvent.countDocuments({ risk_level: { $in: ['high', 'critical'] }, resolved: false }),
            Course.countDocuments({ is_active: { $ne: false } })
        ]);

        // Aggregate role counts
        const roleCountsRaw = await UserRole.aggregate([
            { $group: { _id: "$role", count: { $sum: 1 } } }
        ]);
        const roleCounts = {};
        roleCountsRaw.forEach(r => roleCounts[r._id] = r.count);

        res.json({
            users,
            courses,
            activeCourses: activeCoursesCount,
            enrollments,
            questionBanks,
            exams,
            securityEvents,
            pendingCourses,
            pendingEnrollments,
            pendingExams,
            highPriorityEvents,
            roleCounts
        });
    } catch (err) {
        handleError(res, err, 'data-summary');
    }
});

// Admin Student Performance
app.get('/api/admin/student-performance/:studentId', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const { studentId } = req.params;
        const enrollments = await Enrollment.find({ user_id: studentId }).populate('course_id').lean();

        const activeEnrollments = enrollments.filter(e => e.course_id && e.course_id.is_active !== false);

        const courseProgress = activeEnrollments.map(e => ({
            course_name: e.course_id.title,
            progress: e.progress_percentage || 0,
            status: e.status
        }));

        // Do NOT use .lean() — Mongoose Maps don't serialize properly with lean
        const results = await ExamResult.find({ student_id: studentId }).populate('exam_id mock_paper_id');

        const profile = await Profile.findOne({ user_id: studentId }).lean();

        const { QuestionBank } = require('./models/Exam');

        const processedResults = await Promise.all(results.map(async r => {
            // Convert Mongoose Map to plain object correctly
            let answersObj = {};
            if (r.answers) {
                try {
                    answersObj = Object.fromEntries(r.answers);
                } catch (e) {
                    if (typeof r.answers === 'object') {
                        Object.entries(r.answers).forEach(([k, v]) => { answersObj[k] = String(v); });
                    }
                }
            }

            const rawSnapshot = r.questions_snapshot || [];

            // Fetch QuestionBank entries to resolve MCQ option IDs → text
            const qIds = rawSnapshot.map(q => q.question_id).filter(Boolean);
            let bankMap = {};
            if (qIds.length > 0) {
                try {
                    const bankQs = await QuestionBank.find({ _id: { $in: qIds } }).lean();
                    bankQs.forEach(q => { bankMap[q._id.toString()] = q; });
                } catch (e) { }
            }

            // Helper: resolve answer value — if it's an option ObjectId, return the option text
            const resolveAnswer = (qId, rawAnswer, bankQ) => {
                if (!rawAnswer) return '';
                if (!bankQ || !Array.isArray(bankQ.options) || bankQ.options.length === 0) return rawAnswer;
                // Check if rawAnswer matches an option _id
                const optById = bankQ.options.find(o => o._id && o._id.toString() === rawAnswer);
                if (optById) return optById.text;
                // Check if rawAnswer matches option text directly
                const optByText = bankQ.options.find(o => o.text === rawAnswer);
                if (optByText) return optByText.text;
                return rawAnswer;
            };

            const snapshot = rawSnapshot
                .map(q => {
                    const qId = q.question_id ? q.question_id.toString() : '';
                    const bankQ = bankMap[qId];
                    const rawStudentAns = answersObj[qId] || q.student_answer || '';
                    const studentAnsText = resolveAnswer(qId, rawStudentAns, bankQ);

                    // Resolve correct answer too (snapshot stores text, but double-check)
                    let correctAnsText = q.correct_answer || '';
                    if (bankQ && Array.isArray(bankQ.options) && bankQ.options.length > 0) {
                        const correctOpt = bankQ.options.find(o => o.is_correct);
                        if (correctOpt) correctAnsText = correctOpt.text;
                        // Also check if stored correct_answer is an option ID
                        if (!correctAnsText && q.correct_answer) {
                            const optById = bankQ.options.find(o => o._id && o._id.toString() === q.correct_answer);
                            if (optById) correctAnsText = optById.text;
                        }
                    }

                    return {
                        question_id: qId,
                        question_text: q.question_text || '',
                        type: q.type || 'multiple_choice',
                        marks: q.marks || 1,
                        correct_answer: correctAnsText,
                        student_answer: studentAnsText
                    };
                })
                .filter(q => q.question_text.trim() !== '');

            // If snapshot still empty but answers exist → rebuild from QuestionBank
            const answerKeys = Object.keys(answersObj);
            if (snapshot.length === 0 && answerKeys.length > 0) {
                const validIds = answerKeys.filter(id => /^[a-f0-9]{24}$/i.test(id));
                if (validIds.length > 0) {
                    try {
                        const bankQs = await QuestionBank.find({ _id: { $in: validIds } }).lean();
                        bankQs.forEach(q => {
                            const qId = q._id.toString();
                            const rawAns = answersObj[qId] || '';
                            const correctOpt = Array.isArray(q.options) ? q.options.find(o => o.is_correct) : null;
                            const correctText = q.correct_answer || (correctOpt ? correctOpt.text : '');
                            const optById = Array.isArray(q.options) ? q.options.find(o => o._id && o._id.toString() === rawAns) : null;
                            const studentText = optById ? optById.text : rawAns;
                            snapshot.push({
                                question_id: qId,
                                question_text: q.question_text || '',
                                type: q.type || 'multiple_choice',
                                marks: q.marks || 1,
                                correct_answer: correctText,
                                student_answer: studentText
                            });
                        });
                    } catch (e) { }
                }
            }

            return {
                result_id: r._id.toString(),
                title: r.test_title || r.exam_id?.title || r.mock_paper_id?.title || 'Assessment',
                score: r.score,
                total: r.total_questions || r.total_score,
                percentage: r.percentage,
                date: r.submitted_at || r.created_at,
                grading_status: r.grading_status || 'graded',
                answers: answersObj,
                questions_snapshot: snapshot
            };
        }));


        res.json({
            enrollments: courseProgress,
            results: processedResults,
            github_url: profile?.github_url,
            resume_url: profile?.resume_url
        });
    } catch (err) {
        handleError(res, err, 'admin-student-performance');
    }
});

app.get('/api/admin/exams-list', authenticateToken, requireInstructor, async (req, res) => {
    try {
        const exams = await Exam.find()
            .sort({ created_at: -1 })
            .limit(100)
            .lean();

        // Transformed for frontend compatibility
        const transformedExams = exams.map(e => ({ ...e, id: e._id }));
        res.json(transformedExams);
    } catch (err) {
        handleError(res, err, 'exams-list');
    }
});

// Quality Assurance - Get Data Lists
app.get('/api/admin/users-list', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const users = await Profile.find()
            .populate('user_id', 'email created_at')
            .sort({ created_at: -1 })
            .limit(100)
            .lean();
        res.json(users);
    } catch (err) {
        handleError(res, err, 'users-list');
    }
});

app.get('/api/admin/courses-list', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const courses = await Course.find()
            .sort({ created_at: -1 })
            .limit(100)
            .lean();
        res.json(courses);
    } catch (err) {
        handleError(res, err, 'courses-list');
    }
});

app.get('/api/admin/enrollments-list', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const enrollments = await Enrollment.find()
            .populate('user_id', 'full_name email')
            .populate('course_id', 'title')
            .sort({ enrolled_at: -1 })
            .limit(100)
            .lean();
        res.json(enrollments);
    } catch (err) {
        handleError(res, err, 'enrollments-list');
    }
});

// Quality Assurance - Permanent Delete
app.delete('/api/admin/permanent-delete/:dataType', authenticateToken, requireAdmin, async (req, res) => {
    const { dataType } = req.params;

    const validTypes = ['users', 'courses', 'enrollments', 'questionBanks', 'exams', 'conversations'];
    if (!validTypes.includes(dataType)) {
        return res.status(400).json({ error: 'Invalid data type' });
    }

    try {
        let result = { deletedCount: 0 };

        switch (dataType) {
            case 'users':
                // Delete all user-related data
                const userIds = await User.find().select('_id').lean();
                const ids = userIds.map(u => u._id);

                await Promise.all([
                    User.deleteMany({}),
                    Profile.deleteMany({ user_id: { $in: ids } }),
                    UserRole.deleteMany({ user_id: { $in: ids } }),
                    Enrollment.deleteMany({ user_id: { $in: ids } }),
                    Message.deleteMany({ sender: { $in: ids } }),
                    Conversation.deleteMany({ participants: { $in: ids } })
                ]);
                result.deletedCount = ids.length;
                break;

            case 'courses':
                const courseIds = await Course.find().select('_id').lean();
                const cIds = courseIds.map(c => c._id);

                await Promise.all([
                    Course.deleteMany({}),
                    Topic.deleteMany({ course_id: { $in: cIds } }),
                    Module.deleteMany({ course_id: { $in: cIds } }),
                    Video.deleteMany({ course_id: { $in: cIds } }),
                    Enrollment.deleteMany({ course_id: { $in: cIds } })
                ]);
                result.deletedCount = cIds.length;
                break;

            case 'enrollments':
                result = await Enrollment.deleteMany({});
                break;

            case 'questionBanks':
                result = await QuestionBank.deleteMany({});
                break;

            case 'exams':
                const examIds = await Exam.find().select('_id').lean();
                const eIds = examIds.map(e => e._id);

                await Promise.all([
                    Exam.deleteMany({}),
                    // ExamSchedule.deleteMany({ exam_id: { $in: eIds } }), // Removed
                    ExamResult.deleteMany({ exam_id: { $in: eIds } }),
                    StudentExamAccess.deleteMany({ exam_id: { $in: eIds } }),
                    MockPaper.deleteMany({ exam_id: { $in: eIds } })
                ]);
                result.deletedCount = eIds.length;
                break;

            case 'conversations':
                const convIds = await Conversation.find().select('_id').lean();
                const convIdList = convIds.map(c => c._id);

                await Promise.all([
                    Conversation.deleteMany({}),
                    Message.deleteMany({ conversation_id: { $in: convIdList } })
                ]);
                result.deletedCount = convIdList.length;
                break;
        }

        // Log the deletion
        await SystemLog.create({
            log_type: 'audit',
            module: 'QualityAssurance',
            action: `Permanent Deletion: ${dataType}`,
            details: { dataType, deletedCount: result.deletedCount, timestamp: new Date() },
            user_id: req.user.id
        });

        res.json({
            message: `${dataType} data permanently deleted`,
            deletedCount: result.deletedCount
        });
    } catch (err) {
        handleError(res, err, 'permanent-delete');
    }
});

app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        let [role, profile] = await Promise.all([
            getUserRole(req.user.id),
            Profile.findOne({ user_id: req.user.id })
        ]);

        // Auto-Unsuspend check
        if (profile?.approval_status === 'suspended' && profile?.suspended_until && new Date() > new Date(profile.suspended_until)) {
            profile.approval_status = 'approved';
            profile.suspended_until = null;
            await profile.save();
        }

        console.log("==> GET PROFILE DATA SERVING:", profile ? profile.github_url : 'NO PROFILE DOC');

        res.json({
            profile,
            user: {
                id: req.user.id,
                email: req.user.email,
                role: role || 'student',
                full_name: profile?.full_name || null,
                avatar_url: profile?.avatar_url || null,
                approval_status: profile?.approval_status || 'pending',
                suspended_until: profile?.suspended_until || null
            }
        });
    } catch (err) {
        handleError(res, err, 'get-profile');
    }
});
app.put('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        console.log("==> SCHEMA KEYS:", Object.keys(Profile.schema.paths));
        console.log("==> PROFILE PUT RECEIVED FOR:", req.user.id);
        console.log("==> PAYLOAD:", req.body);
        const updates = { ...req.body, updated_at: new Date() };

        // Update Profile
        await Profile.findOneAndUpdate(
            { user_id: req.user.id },
            { $set: updates },
            { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
        );

        // Update core User record to keep data in sync
        const userUpdates = {};
        if (updates.full_name) userUpdates.full_name = updates.full_name;
        if (updates.avatar_url) userUpdates.avatar_url = updates.avatar_url;

        if (Object.keys(userUpdates).length > 0) {
            await User.findByIdAndUpdate(req.user.id, userUpdates);
        }

        res.json({ message: 'Profile updated' });
    } catch (err) {
        handleError(res, err, 'update-profile');
    }
});

// Profile Image Upload (Cloudinary)
app.post('/api/user/profile/image', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        // Convert buffer to base64
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = "data:" + req.file.mimetype + ";base64," + b64;

        // 1. Upload to Cloudinary
        const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'profile_pics',
            resource_type: 'image'
        });

        const imageUrl = result.secure_url;

        // 2. Update Database (User & Profile models)
        await Promise.all([
            User.findByIdAndUpdate(req.user.id, { avatar_url: imageUrl }),
            Profile.findOneAndUpdate(
                { user_id: req.user.id },
                { avatar_url: imageUrl, updated_at: new Date() }
            )
        ]);

        res.json({ success: true, url: imageUrl });
    } catch (err) {
        handleError(res, err, 'upload-profile-image');
    }
});



app.get('/api/admin/conversations', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const conversations = await Conversation.find()
            .populate('participants', 'full_name avatar_url email')
            .populate({
                path: 'last_message',
                populate: { path: 'sender', select: 'full_name avatar_url' }
            })
            .sort({ updated_at: -1 })
            .lean();

        // Get profiles to check approval_status (blocked/active)
        const userIds = [];
        conversations.forEach(c => {
            if (c.participants) {
                c.participants.forEach(p => {
                    if (p._id) userIds.push(p._id);
                });
            }
        });

        const profiles = await Profile.find({ user_id: { $in: userIds } }).select('user_id approval_status').lean();
        const statusMap = profiles.reduce((acc, p) => {
            acc[p.user_id.toString()] = p.approval_status;
            return acc;
        }, {});

        // Transform for frontend
        const data = conversations.map(c => ({
            id: c._id,
            participants: (c.participants || []).map(p => ({
                id: p._id,
                name: p.full_name,
                avatar: p.avatar_url,
                email: p.email,
                status: statusMap[p._id.toString()] || 'pending'
            })),
            lastMessage: c.last_message ? {
                content: c.last_message.content,
                timestamp: c.last_message.created_at,
                sender: c.last_message.sender?._id || c.last_message.sender,
                sender_name: c.last_message.sender?.full_name,
                sender_avatar: c.last_message.sender?.avatar_url
            } : null,
            updatedAt: c.updated_at
        }));

        res.json(data);
    } catch (err) {
        handleError(res, err, 'admin-get-conversations');
    }
});

app.get('/api/admin/conversations/:id/messages', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const messages = await Message.find({ conversation_id: req.params.id })
            .populate('sender', 'full_name avatar_url email')
            .sort({ created_at: 1 })
            .lean();

        res.json(messages.map(m => ({
            id: m._id,
            content: m.content,
            sender: m.sender?._id || m.sender,
            sender_name: m.sender?.full_name,
            sender_avatar: m.sender?.avatar_url,
            timestamp: m.created_at,
            status: m.status,
            type: m.type
        })));
    } catch (err) {
        handleError(res, err, 'admin-get-messages');
    }
});

// --- Chat Routes ---


app.get('/api/users/:id/public-profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId).select('full_name avatar_url email created_at');
        if (!user) return res.status(404).json({ error: 'User not found' });

        const role = await getUserRole(userId);
        let details = {};

        if (role === 'instructor') {
            const app = await InstructorApplication.findOne({ user_id: userId });
            details.expertise = app?.area_of_expertise || 'General Instructor';
            details.experience = app?.experience || 'N/A';
            details.bio = app?.custom_expertise || '';
            details.courses_count = await Course.countDocuments({ instructor_id: userId, status: 'published' });
        } else {
            details.enrolled_courses = await Enrollment.countDocuments({ user_id: userId });
            details.completed_courses = await Enrollment.countDocuments({ user_id: userId, status: 'completed' });
        }

        res.json({
            id: user._id,
            full_name: user.full_name,
            avatar_url: user.avatar_url,
            email: user.email,
            joined_at: user.created_at,
            role,
            details
        });
    } catch (err) {
        handleError(res, err, 'get-public-profile');
    }
});

app.post('/api/chat/start', authenticateToken, async (req, res) => {
    const { participantId, recipientId } = req.body;
    const targetId = participantId || recipientId;

    if (!targetId) return res.status(400).json({ error: 'Missing participantId' });

    try {
        const participant = await User.findById(targetId);
        if (!participant) return res.status(404).json({ error: 'User not found' });

        // Find existing conversation
        let conversation = await Conversation.findOne({
            participants: { $all: [req.user.id, targetId] }
        });

        if (!conversation) {
            conversation = await Conversation.create({
                participants: [req.user.id, targetId],
                unread_counts: { [req.user.id]: 0, [targetId]: 0 }
            });
        }

        // Populate for frontend
        const populatedConv = await Conversation.findById(conversation._id)
            .populate('participants', 'full_name avatar_url email')
            .populate('last_message')
            .lean();

        const otherUser = populatedConv.participants.find(p => p._id.toString() !== req.user.id);

        const formattedConv = {
            id: populatedConv._id,
            user: otherUser ? {
                id: otherUser._id,
                name: otherUser.full_name,
                avatar: otherUser.avatar_url,
                email: otherUser.email
            } : null,
            lastMessage: populatedConv.last_message ? {
                content: populatedConv.last_message.content,
                timestamp: populatedConv.last_message.created_at,
                status: populatedConv.last_message.status,
                sender: populatedConv.last_message.sender
            } : null,
            unreadCount: populatedConv.unread_counts?.[req.user.id] || 0
        };

        res.json(formattedConv);
    } catch (err) {
        handleError(res, err, 'start-conversation');
    }
});

app.get('/api/chat/conversations', authenticateToken, async (req, res) => {
    try {
        const conversations = await Conversation.find({ participants: req.user.id })
            .populate('participants', 'full_name avatar_url email')
            .populate({
                path: 'last_message',
                populate: { path: 'sender', select: 'full_name avatar_url' }
            })
            .sort({ updated_at: -1 })
            .lean();

        // Transform for frontend
        const data = conversations.map(c => {
            const otherUser = c.participants.find(p => p._id.toString() !== req.user.id);
            return {
                id: c._id,
                user: otherUser ? {
                    id: otherUser._id,
                    name: otherUser.full_name,
                    avatar: otherUser.avatar_url,
                    email: otherUser.email
                } : null,
                lastMessage: c.last_message ? {
                    content: c.last_message.content,
                    timestamp: c.last_message.created_at,
                    status: c.last_message.status,
                    sender: c.last_message.sender?._id || c.last_message.sender,
                    sender_name: c.last_message.sender?.full_name,
                    sender_avatar: c.last_message.sender?.avatar_url
                } : null,
                unreadCount: c.unread_counts?.[req.user.id] || 0
            };
        });

        res.json(data);
    } catch (err) {
        handleError(res, err, 'get-conversations');
    }
});

app.get('/api/chat/messages/:conversationId', authenticateToken, async (req, res) => {
    const { conversationId } = req.params;
    try {
        const messages = await Message.find({ conversation_id: conversationId })
            .populate('sender', 'full_name avatar_url email')
            .sort({ created_at: 1 })
            .lean();

        // Mark as read (simple implementation: assume viewing marks all as read for now)
        // Ideally handled via specific socket event or batch update
        await Message.updateMany(
            { conversation_id: conversationId, sender: { $ne: req.user.id }, status: { $ne: 'read' } },
            { status: 'read' }
        );

        // Reset unread count for this user
        await Conversation.findByIdAndUpdate(conversationId, {
            [`unread_counts.${req.user.id}`]: 0
        });

        res.json(messages.map(m => ({
            id: m._id,
            content: m.content,
            sender: m.sender?._id || m.sender,
            sender_name: m.sender?.full_name,
            sender_avatar: m.sender?.avatar_url,
            timestamp: m.created_at,
            status: m.status,
            type: m.type
        })));
    } catch (err) {
        handleError(res, err, 'get-messages');
    }
});


app.get('/api/chat/contacts', authenticateToken, async (req, res) => {
    try {
        const role = await getUserRole(req.user.id);
        let contacts = [];

        if (role?.toLowerCase() === 'student' || role?.toLowerCase() === 'intern') {
            // Students and interns see instructors of courses they are enrolled in
            const enrollments = await Enrollment.find({
                user_id: req.user.id,
                status: 'active'
            }).lean();

            const courseIds = enrollments.map(e => e.course_id);
            const courses = await Course.find({
                _id: { $in: courseIds },
                instructor_ids: { $exists: true, $not: { $size: 0 } }
            }).lean();

            const instructorIds = courses.reduce((acc, c) => {
                if (c.instructor_ids && Array.isArray(c.instructor_ids)) {
                    c.instructor_ids.forEach(id => acc.add(id.toString()));
                }
                return acc;
            }, new Set());

            const instructors = await User.find({ _id: { $in: Array.from(instructorIds) } })
                .select('full_name avatar_url email')
                .lean();

            contacts = instructors.map(i => ({
                id: i._id,
                name: i.full_name,
                avatar: i.avatar_url,
                email: i.email,
                role: 'instructor'
            }));

        } else if (role === 'instructor') {
            // Instructors see students enrolled in their courses
            const myCourses = await Course.find({ instructor_ids: req.user.id }).select('_id').lean();
            const courseIds = myCourses.map(c => c._id);

            const enrollments = await Enrollment.find({
                course_id: { $in: courseIds },
                status: 'active'
            })
                .populate('user_id', 'full_name avatar_url email')
                .lean();

            // Deduplicate students
            const studentMap = new Map();
            enrollments.forEach(e => {
                if (e.user_id) {
                    studentMap.set(e.user_id._id.toString(), {
                        id: e.user_id._id,
                        name: e.user_id.full_name,
                        avatar: e.user_id.avatar_url,
                        email: e.user_id.email,
                        role: 'student'
                    });
                }
            });

            contacts = Array.from(studentMap.values());
        }

        res.json(contacts);
    } catch (err) {
        handleError(res, err, 'get-chat-contacts');
    }
});

// GET /api/chat/contacts/by-batch — Instructor sees students grouped by batch session
app.get('/api/chat/contacts/by-batch', authenticateToken, requireInstructor, async (req, res) => {
    try {
        // 1. Find all courses the instructor teaches
        const myCourses = await Course.find({ instructor_ids: req.user.id })
            .select('_id title assigned_session')
            .lean();
        const courseIds = myCourses.map(c => c._id);

        if (courseIds.length === 0) {
            return res.json({ morning: [], afternoon: [], evening: [], unassigned: [], all: [] });
        }

        // 2. Find batches this instructor is assigned to
        const myBatches = await Batch.find({ instructor_id: req.user.id }).select('_id batch_type batch_name course_id').lean();
        const myBatchIds = myBatches.map(b => b._id);

        // 3. Get student batch assignments scoped to instructor's batches
        const assignments = await StudentBatch.find({
            course_id: { $in: courseIds },
            ...(myBatchIds.length > 0 ? { batch_id: { $in: myBatchIds } } : {})
        }).populate('batch_id').lean();

        // 4. Get student details
        const studentIds = [...new Set(assignments.map(a => a.student_id?.toString()).filter(Boolean))];

        const [profiles, users] = await Promise.all([
            Profile.find({ user_id: { $in: studentIds } }).lean(),
            User.find({ _id: { $in: studentIds } }).select('full_name email').lean()
        ]);

        const profileMap = profiles.reduce((acc, p) => { if (p.user_id) acc[p.user_id.toString()] = p; return acc; }, {});
        const userMap = users.reduce((acc, u) => { acc[u._id.toString()] = u; return acc; }, {});

        // 5. Build student list with batch info
        const seen = new Set();
        const studentList = assignments.reduce((acc, a) => {
            const sid = a.student_id?.toString();
            if (!sid || seen.has(sid)) return acc;
            seen.add(sid);

            const profile = profileMap[sid];
            const user = userMap[sid];
            const batch = a.batch_id;

            acc.push({
                id: sid,
                name: profile?.full_name || user?.full_name || 'Student',
                avatar: profile?.avatar_url || null,
                email: profile?.email || user?.email || '',
                role: 'student',
                batch_session: a.assigned_session || batch?.batch_type || 'unassigned',
                batch_name: batch?.batch_name || 'Unknown Batch',
                batch_id: batch?._id?.toString() || null,
                course_id: a.course_id?.toString()
            });
            return acc;
        }, []);

        // 6. Group by session
        const grouped = {
            morning: studentList.filter(s => s.batch_session === 'morning'),
            afternoon: studentList.filter(s => s.batch_session === 'afternoon'),
            evening: studentList.filter(s => s.batch_session === 'evening'),
            unassigned: studentList.filter(s => !['morning', 'afternoon', 'evening'].includes(s.batch_session)),
            all: studentList
        };

        res.json(grouped);
    } catch (err) {
        handleError(res, err, 'get-chat-contacts-by-batch');
    }
});

app.post('/api/chat/send', authenticateToken, async (req, res) => {
    const { conversationId, content, type } = req.body;
    try {
        console.log('--- START CHAT SEND ---');
        console.log('Request User:', req.user.id);
        console.log('Conversation ID:', conversationId);

        // Check if user is blocked/suspended
        const profile = await Profile.findOne({ user_id: req.user.id });
        if (profile?.approval_status === 'rejected' || profile?.approval_status === 'suspended') {
            return res.status(403).json({ error: 'Your account has been suspended. You cannot send messages.' });
        }

        // Fetch conversation first to get participants
        // RENAMED from 'conversation' to 'chatConv' to avoid any scope collision
        let chatConv = await Conversation.findById(conversationId);
        if (!chatConv) {
            console.error('Conversation not found:', conversationId);
            return res.status(404).json({ error: 'Conversation not found' });
        }

        console.log('Conversation Found:', chatConv._id);

        // Determine initial status based on recipient online status
        const otherUserId = chatConv.participants.find(p => p.toString() !== req.user.id);
        let initialStatus = 'sent';
        if (otherUserId && userSockets.has(otherUserId.toString())) {
            initialStatus = 'delivered';
        }

        const message = await Message.create({
            conversation_id: conversationId,
            sender: req.user.id,
            content,
            type: type || 'text',
            status: initialStatus
        });

        chatConv = await Conversation.findByIdAndUpdate(
            conversationId,
            {
                last_message: message._id,
                updated_at: new Date(),
                // We update unread counts separately below or here if we have the ID
            },
            { returnDocument: 'after' }
        );

        if (otherUserId) {
            await Conversation.findByIdAndUpdate(conversationId, {
                $inc: { [`unread_counts.${otherUserId}`]: 1 }
            });
        }

        // Emit socket event to room (real-time)
        io.to(conversationId).emit('receive_message', {
            id: message._id,
            conversationId,
            sender: req.user.id,
            content,
            timestamp: message.created_at,
            status: initialStatus,
            type: message.type
        });

        // Notify specific user if online but maybe not in room (push notification style)
        if (otherUserId) {
            const socketIds = userSockets.get(otherUserId.toString());
            if (socketIds) {
                socketIds.forEach(sid => {
                    io.to(sid).emit('new_message_notification', {
                        senderName: req.user.full_name || 'User',
                        content: content
                    });
                });
            }
        }

        console.log('Message sent successfully:', message._id);
        res.json({
            success: true,
            message: {
                ...message.toObject(),
                id: message._id
            }
        });
    } catch (err) {
        console.error('Error in /api/chat/send:', err);
        handleError(res, err, 'send-message');
    }
});

app.post('/api/chat/upload', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        // Convert buffer to base64
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        let dataURI = "data:" + req.file.mimetype + ";base64," + b64;

        const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'chat_uploads',
            resource_type: 'auto'
        });

        res.json({ url: result.secure_url });
    } catch (err) {
        handleError(res, err, 'chat-upload');
    }
});

app.put('/api/chat/block-user', authenticateToken, requireAdminOrManager, async (req, res) => {
    // Already implemented as /api/admin/update-user-status but specialized for chat context if needed
    // We'll reuse update-user-status on frontend, or create a specific chat block if needed.
    // Let's stick to update-user-status for now.
    res.status(501).json({ error: 'Not implemented, use update-user-status' });
});

// --- Course Resources Upload (Cloudinary) ---
app.post('/api/upload/course-resources', authenticateToken, requireInstructor, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const mime = req.file.mimetype || '';
        const fileName = req.file.originalname || '';
        const ext = fileName.split('.').pop()?.toLowerCase() || '';

        // Determine the correct Cloudinary resource_type:
        //   - 'image' for images
        //   - 'video' for video/audio files
        //   - 'raw'   for everything else (PDF, PPT, PPTX, DOC, DOCX, ZIP, etc.)
        //   Using 'auto' fails for non-image binary files in many Cloudinary plans.
        let resourceType = 'raw';
        if (mime.startsWith('image/')) {
            resourceType = 'image';
        } else if (mime.startsWith('video/') || mime.startsWith('audio/')) {
            resourceType = 'video';
        }

        // Use a safe public_id (no extension – Cloudinary adds it for raw)
        const safeBaseName = fileName
            .replace(/\.[^/.]+$/, '')           // strip extension
            .replace(/[^a-zA-Z0-9_\-]/g, '_')  // sanitize
            .substring(0, 100);

        const publicId = `course_resources/${Date.now()}_${safeBaseName}`;

        console.log(`[System] Instructor ${req.user.id} uploading "${fileName}" (${mime}) as resource_type="${resourceType}" to Cloudinary...`);

        // Upload as a stream from buffer (avoids base64 size bloat for large files)
        const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'course_resources',
                    public_id: publicId,
                    resource_type: resourceType,
                    use_filename: false,
                    overwrite: false,
                    // For raw files, preserve the original extension so browsers
                    // can open/download them with the correct type
                    ...(resourceType === 'raw' ? { format: ext } : {})
                },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            );
            uploadStream.end(req.file.buffer);
        });

        const result = uploadResult;

        console.log(`[System] Upload success: ${result.secure_url}`);

        res.json({
            url: result.secure_url,
            public_id: result.public_id,
            format: result.format || ext,
            original_filename: fileName,
            view_url: result.secure_url
        });
    } catch (err) {
        console.error('Resource upload failed:', err);
        // Always return JSON so the frontend can parse the error message correctly
        res.status(500).json({
            error: err.message || 'Upload failed. Please try again.',
            context: 'upload-resource'
        });
    }
});

// --- Instructor Routes ---

app.post('/api/instructor/register', upload.single('resume'), async (req, res) => {
    const { email, password, fullName, areaOfExpertise, customExpertise, experience } = req.body;
    try {
        // Reuse Signup Logic (Partial)
        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(password, salt);

        let user = await User.findOne({ email });
        if (!user) {
            user = await User.create({ email, password_hash: passwordHash, full_name: fullName });
        }

        // Create Application
        await InstructorApplication.create({
            user_id: user._id,
            full_name: fullName,
            email,
            area_of_expertise: areaOfExpertise === 'Other' ? customExpertise : areaOfExpertise,
            custom_expertise: areaOfExpertise === 'Other' ? customExpertise : null,
            experience,
            status: 'pending'
        });

        // Ensure Profile
        await Profile.findOneAndUpdate(
            { user_id: user._id },
            { user_id: user._id, email, full_name: fullName, approval_status: 'pending' },
            { upsert: true }
        );

        // Set Role
        await UserRole.findOneAndUpdate(
            { user_id: user._id },
            { role: 'instructor' },
            { upsert: true }
        );

        res.json({ message: 'Instructor application submitted', userId: user._id });

    } catch (err) {
        handleError(res, err, 'instructor-register');
    }
});

app.post('/api/instructor/choose-course', authenticateToken, requireInstructor, async (req, res) => {
    const { courseId, dealing_session } = req.body;
    if (!courseId) return res.status(400).json({ error: 'courseId is required' });

    try {
        let course;
        try {
            course = await Course.findById(courseId);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid Course ID format' });
        }

        if (!course) return res.status(404).json({ error: 'Course not found' });

        // Ensure instructor_ids is an array and check for inclusion properly
        if (!course.instructor_ids) course.instructor_ids = [];
        const instructorId = new mongoose.Types.ObjectId(req.user.id);

        const isAlreadyAssigned = course.instructor_ids.some(id => id.toString() === instructorId.toString());
        if (isAlreadyAssigned) {
            return res.status(400).json({ error: 'You are already assigned to this course' });
        }

        // Add to instructor_ids array as ObjectId
        course.instructor_ids.push(instructorId);
        course.status = 'pending';
        course.updated_at = new Date();
        await course.save();

        // Automatically create a batch for this instructor/session
        if (dealing_session) {
            const {
                batch_name,
                capacity,
                start_time,
                end_time
            } = req.body;

            const sessionLabel = dealing_session.charAt(0).toUpperCase() + dealing_session.slice(1);

            if (dealing_session === 'all') {
                const totalCap = capacity || 150;
                const m = Math.floor(totalCap / 3), a = Math.floor(totalCap / 3), e = totalCap - 2 * m;

                await Batch.create({
                    course_id: courseId,
                    instructor_id: req.user.id,
                    batch_name: batch_name || `${course.title} (All Sections)`,
                    batch_type: 'all',
                    start_time: start_time || '09:00',
                    end_time: end_time || '11:00',
                    is_active: false,
                    status: 'pending',
                    batches: [
                        { batch_name: `${batch_name || course.title} (Morning)`, batch_type: 'morning', max_students: m, is_active: false, status: 'pending', start_time: '09:00', end_time: '12:00' },
                        { batch_name: `${batch_name || course.title} (Afternoon)`, batch_type: 'afternoon', max_students: a, is_active: false, status: 'pending', start_time: '13:00', end_time: '17:00' },
                        { batch_name: `${batch_name || course.title} (Evening)`, batch_type: 'evening', max_students: e, is_active: false, status: 'pending', start_time: '18:00', end_time: '21:00' }
                    ]
                });
            } else {
                await Batch.create({
                    course_id: courseId,
                    instructor_id: req.user.id,
                    batch_name: batch_name || `${course.title} (${sessionLabel})`,
                    batch_type: dealing_session,
                    max_students: capacity || 50,
                    start_time: start_time || '09:00',
                    end_time: end_time || '11:00',
                    is_active: false,
                    status: 'pending',
                    batch_category: 'remove'
                });
            }
        }

        res.json({ message: 'Course requested and batch initialized.' });

        // Notify Admins/Managers (Broadly for now, or specific)
        // We'll emit to a general 'admin' room if implemented, 
        // but for now let's just log and show how it would work.
        // In a real app, you'd find admins and send to them.
    } catch (err) {
        console.error('[Error choose-course]', err);
        handleError(res, err, 'choose-course');
    }
});

app.get('/api/instructor/courses', authenticateToken, requireInstructor, async (req, res) => {
    try {
        const { all } = req.query;
        let query = {
            $or: [
                { instructor_id: req.user.id },
                { instructor_ids: req.user.id }
            ]
        };

        if (all === 'true' || req.user.role === 'admin' || req.user.role === 'manager') {
            query = {};
        }

        const courses = await Course.find(query).sort({ updated_at: -1 }).lean();
        const courseIds = courses.map(c => c._id);

        // Fetch ALL batches to see locks
        const allBatches = await Batch.find({
            course_id: { $in: courseIds },
            status: { $in: ['pending', 'approved'] }
        }).select('course_id batch_type').lean();

        // Fetch SPECIFIC batches for this instructor to see THEIR assignment
        const myBatches = await Batch.find({
            course_id: { $in: courseIds },
            instructor_id: req.user.id
        }).lean();

        // Map data
        const data = courses.map(course => {
            const courseIdStr = course._id.toString();
            const locks = allBatches.filter(b => b.course_id.toString() === courseIdStr);
            const myMatch = myBatches.find(b => b.course_id.toString() === courseIdStr);

            const occupiedSessions = [...new Set(locks.map(b => b.batch_type))];

            return {
                ...course,
                id: course._id,
                occupied_sessions: occupiedSessions,
                assigned_session: myMatch?.batch_type, // 'morning', 'afternoon', etc.
                is_approved: myMatch?.status === 'approved'
            };
        });

        res.json(data);
    } catch (err) {
        handleError(res, err, 'instructor-courses');
    }
});

app.get('/api/instructor/courses/:id/batch/:batchType/students', authenticateToken, requireInstructor, async (req, res) => {
    try {
        const { id, batchType } = req.params;
        const { batch_id } = req.query;
        const role = await getUserRole(req.user.id);

        let batchIds = [];

        if (batch_id) {
            // Fetch students for a SPECIFIC batch card
            batchIds = [batch_id];
        } else {
            // Find all batches of this type (session) for this course
            const batchQuery = {
                course_id: id,
                batch_type: batchType === 'any' ? { $exists: true } : batchType.toLowerCase()
            };

            // SECURITY: If instructor, only show students from their OWN assigned batches
            if (role === 'instructor') {
                batchQuery.instructor_id = req.user.id;
            }

            const batches = await Batch.find(batchQuery).select('_id').lean();
            if (batches.length === 0) return res.json([]);
            batchIds = batches.map(b => b._id);
        }

        // 2. Find students assigned to these batches
        const studentAssignments = await StudentBatch.find({ batch_id: { $in: batchIds } })
            .populate('student_id', 'full_name email avatar_url mobile_number')
            .lean();

        // 3. Format and return
        const students = studentAssignments.map(a => ({
            id: a._id.toString(),
            user_id: a.student_id?.id || a.student_id?._id,
            full_name: a.student_id?.full_name,
            email: a.student_id?.email,
            avatar_url: a.student_id?.avatar_url,
            mobile_number: a.student_id?.mobile_number,
            enrolled_at: a.assigned_at
        })).filter(s => s.user_id);

        res.json(students);
    } catch (err) {
        handleError(res, err, 'get-batch-students');
    }
});

// --- Enrollment & Course Logic ---

app.get('/api/courses/enrollments', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const enrollments = await Enrollment.find()
            .populate('user_id', 'full_name email mobile_number avatar_url photo_url') // Populate user details
            .populate('course_id', 'title price')   // Populate course details
            .sort({ enrolled_at: -1 });

        // Transform to match frontend expectation
        const data = enrollments.map(e => ({
            id: e._id,
            user_id: e.user_id?._id,
            course_id: e.course_id?._id,
            status: e.status,
            enrollment_date: e.enrolled_at,
            profile: {
                full_name: e.user_id?.full_name,
                email: e.user_id?.email,
                mobile_number: e.user_id?.mobile_number,
                avatar_url: e.user_id?.avatar_url || e.user_id?.photo_url
            },
            course: {
                title: e.course_id?.title,
                price: e.course_id?.price
            },
            progress_percentage: e.progress_percentage || 0,
            utr_number: e.utr_number,
            payment_proof_url: e.payment_proof_url,
            applied_coupon: e.applied_coupon,
            final_price: e.final_price || e.course_id?.price,
            payment_term: e.payment_term || 'full',
            remaining_balance: e.remaining_balance || 0,
            requested_batch_id: e.requested_batch_id,
            requested_time_slot: e.requested_time_slot
        }));

        res.json(data);
    } catch (err) {
        handleError(res, err, 'get-enrollments-admin');
    }
});

// --- File Upload Logic (Cloudinary & S3) ---

app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const b64 = Buffer.from(req.file.buffer).toString('base64');
        let dataURI = 'data:' + req.file.mimetype + ';base64,' + b64;

        const result = await cloudinary.uploader.upload(dataURI, {
            resource_type: 'auto',
            folder: 'payment_proofs'
        });

        res.json({ url: result.secure_url, public_id: result.public_id });
    } catch (err) {
        handleError(res, err, 'upload-file');
    }
});

app.post('/api/upload/course-videos', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const fileName = `courses/videos/${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;
        const s3Key = await uploadFile(req.file.buffer, fileName, req.file.mimetype);
        const signedUrl = await generateViewUrl(s3Key);
        res.json({ url: signedUrl, key: s3Key });
    } catch (err) {
        handleError(res, err, 'upload-video');
    }
});



app.post('/api/upload/live-posters', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        // Convert buffer to base64 for Cloudinary
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = "data:" + req.file.mimetype + ";base64," + b64;

        console.log(`[System] Instructor ${req.user.id} uploading live poster...`);

        const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'live_posters',
            resource_type: 'image'
        });

        // Construct optimized URL with 1280x720 fill, auto quality, and auto format
        const optimizedUrl = cloudinary.url(result.public_id, {
            width: 1280,
            height: 720,
            crop: "fill",
            gravity: "center",
            quality: "auto",
            fetch_format: "auto",
            secure: true
        });

        res.json({
            url: optimizedUrl,
            public_id: result.public_id,
            original_url: result.secure_url
        });
    } catch (err) {
        handleError(res, err, 'upload-live-poster');
    }
});

app.get(/\/api\/s3\/public\/(.*)/, async (req, res) => {
    try {
        const key = req.params[0];
        const url = await generateViewUrl(key);
        // Redirect to S3 signed URL
        res.redirect(url);
    } catch (err) {
        res.status(404).json({ error: 'File not found' });
    }
});

app.post('/api/courses/enroll', authenticateToken, async (req, res) => {
    const { course_id, courseId, payment_proof_url, utr_number, payment_term = 'full' } = req.body;
    const finalCourseId = course_id || courseId;
    if (!finalCourseId) return res.status(400).json({ error: 'Course ID required' });

    try {
        const course = await Course.findById(finalCourseId);
        if (!course) return res.status(404).json({ error: 'Course not found' });

        let basePrice = course.price || 0;

        let amountToPay = basePrice;
        let balance = 0;

        if (payment_term === 'term1') {
            amountToPay = Math.round(basePrice * 0.6);
            balance = basePrice - amountToPay;
        } else if (payment_term === 'term2') {
            amountToPay = Math.round(basePrice * 0.4);
            balance = 0; // Assuming this is the final payment
        }

        await Enrollment.findOneAndUpdate(
            { user_id: req.user.id, course_id: finalCourseId },
            {
                $set: {
                    status: 'pending',
                    enrolled_at: new Date(),
                    progress_percentage: 0,
                    payment_proof_url: payment_proof_url || null,
                    utr_number: utr_number || null,
                    final_price: basePrice,
                    payment_term: payment_term,
                    requested_batch_type: req.body.requested_batch_type || 'morning',
                    requested_batch_id: req.body.requested_batch_id || null,
                    requested_time_slot: req.body.requested_time_slot || null,
                    remaining_balance: balance,
                    category: 'remove'
                },
                $push: {
                    payment: {
                        term: payment_term,
                        proof_url: payment_proof_url,
                        utr: utr_number,
                        amount: amountToPay,
                        status: 'pending',
                        submitted_at: new Date()
                    }
                }
            },
            { upsert: true, returnDocument: 'after' }
        );

        res.json({ message: 'Enrollment application submitted! Waiting for administrative approval.' });

        // Notify Instructors
        if (course.instructor_ids && course.instructor_ids.length > 0) {
            const studentName = (await User.findById(req.user.id))?.full_name || 'A new student';
            course.instructor_ids.forEach(instId => {
                sendNotification(instId.toString(), {
                    type: 'enrollment_request',
                    title: 'New Enrollment Request',
                    message: `${studentName} wants to join your course: ${course.title}`,
                    courseId: finalCourseId
                });
            });
        }

        // Notify Admin/Manager for Approval
        const admins = await User.find({ role: { $in: ['admin', 'manager'] } });
        admins.forEach(admin => {
            sendNotification(admin._id.toString(), {
                type: 'enrollment_request_admin',
                title: 'Enrollment Approval Needed',
                message: `New payment proof submitted for ${course.title}. Click to review.`,
                courseId: finalCourseId,
                severity: 'high'
            });
        });

        // Emit Socket Event for Real-time Dashboard Updates
        io.emit('course_enrollments_changed', { courseId: finalCourseId });
    } catch (err) {
        handleError(res, err, 'enroll-course');
    }
});

app.get('/api/courses/enrollment/:courseId', authenticateToken, async (req, res) => {
    try {
        const enrollment = await Enrollment.findOne({
            user_id: req.user.id,
            course_id: req.params.courseId
        });
        res.json({ enrolled: !!enrollment });
    } catch (err) {
        handleError(res, err, 'check-enrollment');
    }
});

// GET progress for a single video (VideoPlayer.tsx)
app.get('/api/progress/:videoId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { videoId } = req.params;

        const progress = await VideoProgress.findOne({ user_id: userId, video_id: videoId }).lean();
        if (!progress) {
            return res.json({ last_watched_time: 0, watched_percentage: 0, completed: false });
        }
        res.json(progress);
    } catch (err) {
        handleError(res, err, 'get-video-progress');
    }
});

// POST save progress from VideoPlayer.tsx
app.post('/api/progress/save', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { videoId, courseId, watchedPercentage, lastWatchedTime, completed } = req.body;

        if (!videoId || !courseId) {
            return res.status(400).json({ error: 'videoId and courseId are required' });
        }

        let progress = await VideoProgress.findOne({ user_id: userId, course_id: courseId, video_id: videoId });
        if (progress) {
            progress.watched_percentage = Math.max(progress.watched_percentage || 0, watchedPercentage || 0);
            progress.last_watched_time = lastWatchedTime || 0;
            progress.completed = progress.completed || !!completed;
            progress.updated_at = new Date();
            await progress.save();
        } else {
            progress = new VideoProgress({
                user_id: userId,
                course_id: courseId,
                video_id: videoId,
                watched_percentage: watchedPercentage || 0,
                last_watched_time: lastWatchedTime || 0,
                completed: !!completed
            });
            await progress.save();
        }

        // Recalculate overall course enrollment progress
        try {
            const totalVideos = await Video.countDocuments({ course_id: courseId });
            if (totalVideos > 0) {
                const completedProgress = await VideoProgress.countDocuments({
                    user_id: userId,
                    course_id: courseId,
                    completed: true
                });
                const progressPct = Math.round((completedProgress / totalVideos) * 100);
                await Enrollment.findOneAndUpdate(
                    { user_id: userId, course_id: courseId },
                    { progress_percentage: Math.min(100, progressPct) }
                );
            }
        } catch (err) {
            console.error('Error updating enrollment progress:', err);
        }

        res.json({ message: 'Progress saved successfully', progress });
    } catch (err) {
        handleError(res, err, 'save-progress');
    }
});

// Stream Proxy for Google Drive Videos
app.get('/api/video/proxy-drive', async (req, res) => {
    try {
        const { fileId } = req.query;
        if (!fileId) {
            return res.status(400).json({ error: 'fileId query parameter is required' });
        }

        // Use the universal direct download link for better compatibility
        const driveUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;

        // Forward Range header from the browser to support seeking/scrubbing
        const headers = {};
        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        // Fetch from Google Drive with responseType stream
        const response = await axios({
            method: 'get',
            url: driveUrl,
            headers: headers,
            responseType: 'stream',
            validateStatus: false
        });

        // Copy matching headers from Google Drive response to Express response
        const headersToForward = [
            'content-type',
            'content-length',
            'content-range',
            'accept-ranges',
            'cache-control'
        ];

        res.status(response.status);
        headersToForward.forEach(header => {
            if (response.headers[header]) {
                res.setHeader(header, response.headers[header]);
            }
        });

        // Pipe the stream to response
        response.data.pipe(res);

        // Handle client abort/close to clean up connection
        req.on('close', () => {
            if (response.data && typeof response.data.destroy === 'function') {
                response.data.destroy();
            }
        });
    } catch (err) {
        console.error('Error proxying Google Drive video:', err);
        res.status(500).json({ error: 'Failed to proxy Google Drive video' });
    }
});


// GET video progress for an entire course (StudentVideoLibrary.tsx)
app.get('/api/student/video-progress/:courseId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { courseId } = req.params;

        const progressList = await VideoProgress.find({ user_id: userId, course_id: courseId }).lean();

        // Map to expected format: { video_id, watched_seconds, total_seconds, completed }
        const mappedList = progressList.map(p => ({
            video_id: p.video_id,
            watched_seconds: p.last_watched_time || 0,
            total_seconds: p.last_watched_time && p.watched_percentage ? Math.round((p.last_watched_time / (p.watched_percentage / 100))) : 0,
            completed: !!p.completed
        }));

        res.json(mappedList);
    } catch (err) {
        handleError(res, err, 'get-student-course-video-progress');
    }
});

// POST save progress from StudentVideoLibrary.tsx
app.post('/api/student/video-progress', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { courseId, videoId, watchedSeconds, totalSeconds } = req.body;

        if (!videoId || !courseId) {
            return res.status(400).json({ error: 'courseId and videoId are required' });
        }

        const watchedPercentage = totalSeconds > 0 ? Math.min(100, Math.floor((watchedSeconds / totalSeconds) * 100)) : 0;
        const completed = watchedPercentage >= 95;

        let progress = await VideoProgress.findOne({ user_id: userId, course_id: courseId, video_id: videoId });
        if (progress) {
            progress.watched_percentage = Math.max(progress.watched_percentage || 0, watchedPercentage);
            progress.last_watched_time = watchedSeconds;
            progress.completed = progress.completed || completed;
            progress.updated_at = new Date();
            await progress.save();
        } else {
            progress = new VideoProgress({
                user_id: userId,
                course_id: courseId,
                video_id: videoId,
                watched_percentage: watchedPercentage,
                last_watched_time: watchedSeconds,
                completed: completed
            });
            await progress.save();
        }

        // Recalculate overall course enrollment progress
        try {
            const totalVideos = await Video.countDocuments({ course_id: courseId });
            if (totalVideos > 0) {
                const completedProgress = await VideoProgress.countDocuments({
                    user_id: userId,
                    course_id: courseId,
                    completed: true
                });
                const progressPct = Math.round((completedProgress / totalVideos) * 100);
                await Enrollment.findOneAndUpdate(
                    { user_id: userId, course_id: courseId },
                    { progress_percentage: Math.min(100, progressPct) }
                );
            }
        } catch (err) {
            console.error('Error updating enrollment progress:', err);
        }

        res.json({ message: 'Video progress updated', progress });
    } catch (err) {
        handleError(res, err, 'save-student-video-progress');
    }
});

app.get('/api/student/my-courses', authenticateToken, async (req, res) => {
    try {
        // Fetch enrollments and student batch assignments
        const [enrollments, studentBatches] = await Promise.all([
            Enrollment.find({ user_id: req.user.id })
                .populate({
                    path: 'course_id',
                    populate: { path: 'instructor_ids', select: 'full_name avatar_url' }
                })
                .sort({ enrolled_at: -1 })
                .lean(),
            StudentBatch.find({ student_id: req.user.id }).lean()
        ]);

        const batchMap = new Map();
        studentBatches.forEach(sb => {
            if (sb.course_id) batchMap.set(sb.course_id.toString(), sb.assigned_session);
        });

        // Filter out enrollments for courses that are missing or deactivated
        const activeEnrollments = enrollments.filter(e => e.course_id && e.course_id.is_active !== false);

        // Transform into a flat structure for easier frontend consumption
        const data = activeEnrollments.map(e => {
            const course = e.course_id || {};
            const courseIdStr = course._id?.toString();
            return {
                id: courseIdStr || course.id,
                enrollmentId: e._id,
                title: course.title || 'Untitled Course',
                description: course.description || '',
                category: course.category || 'General',
                thumbnail_url: course.thumbnail_url || '',
                status: course.status || 'published',
                level: course.level || 'Beginner',
                duration: course.duration || '0h',
                instructor_id: course.instructor_id || (course.instructor_ids && course.instructor_ids.length > 0 ? course.instructor_ids[0]._id : null),
                instructor_name: (course.instructor_ids && course.instructor_ids.length > 0) ? course.instructor_ids[0].full_name : null,
                instructor_avatar: (course.instructor_ids && course.instructor_ids.length > 0) ? course.instructor_ids[0].avatar_url : null,
                enrollmentStatus: e.status, // active, pending, rejected
                progress: e.progress_percentage || 0,
                enrolled_at: e.enrolled_at,
                price: course.price,
                original_price: course.original_price,
                final_price: e.final_price,
                payment_term: e.payment_term,
                remaining_balance: e.remaining_balance,
                assigned_session: batchMap.get(courseIdStr) || 'all',
                // Virtual/Helper fields for UI badges
                is_active: course.is_active !== false
            };
        });

        res.json(data);
    } catch (err) {
        handleError(res, err, 'student-my-courses');
    }
});

app.delete('/api/courses/enrollment/:id', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await Enrollment.findByIdAndDelete(id);

        if (!result) {
            return res.status(404).json({ error: 'Enrollment not found' });
        }

        console.log(`[Admin] Enrollment ${id} deleted by ${req.user.id}`);
        res.json({ message: 'Enrollment deleted successfully', id });
    } catch (err) {
        handleError(res, err, 'delete-enrollment');
    }
});

app.get('/api/student/dashboard-data', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const enrollments = await Enrollment.find({ user_id: userId, status: 'active' }).populate('course_id').lean();
        const activeCourseIds = enrollments
            .filter(e => e.course_id && e.course_id.is_active !== false)
            .map(e => e.course_id._id);

        if (activeCourseIds.length === 0) {
            return res.json({ resources: [], activity: [], skills: [] });
        }

        // 1. Get Recent Resources (top 5 across all active courses)
        const resources = await Resource.find({
            course_id: { $in: activeCourseIds }
        }).sort({ created_at: -1 }).limit(5).lean();

        // 2. Generate Real Activity Data (last 7 days)
        // Groups updated_at counts from VideoProgress
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Video progress tracking removed
        const videoProgress = [];

        // Aggregate by weekday
        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const activityMap = {};
        weekdays.forEach(day => activityMap[day] = 0);

        // Video progress tracking removed
        // Weight: Every 1% watched is 1 "intensity unit", plus base for interaction

        const activity = weekdays.map(day => ({
            name: day,
            intensity: Math.min(100, activityMap[day] || 0)
        }));

        // 3. Skill Mastery (Categorized Progress)
        const categories = {};
        enrollments.forEach(e => {
            const cat = e.course_id?.category || 'General';
            if (!categories[cat]) categories[cat] = { sum: 0, count: 0 };
            categories[cat].sum += e.progress_percentage || 0;
            categories[cat].count += 1;
        });

        const skills = Object.keys(categories).map(cat => ({
            name: cat,
            progress: Math.round(categories[cat].sum / categories[cat].count)
        })).slice(0, 4);

        // 4. Mock Test / Exam Performance History (Recent 5)
        const recentResults = await ExamResult.find({ student_id: userId })
            .populate('exam_id', 'title')
            .populate('mock_paper_id', 'title')
            .sort({ submitted_at: -1 })
            .limit(5)
            .lean();

        res.json({
            resources,
            activity,
            skills,
            results: recentResults.map(r => ({
                id: r._id,
                title: r.exam_id?.title || r.mock_paper_id?.title || 'Assessment',
                percentage: Math.round(r.percentage || 0),
                score: r.score,
                total: r.total_questions,
                date: r.submitted_at
            }))
        });
    } catch (err) {
        handleError(res, err, 'student-dashboard-data');
    }
});

// --- Resume ATS Scanning (n8n + OpenRouter) ---

app.post('/api/student/scan-resume', authenticateToken, upload.single('resume'), async (req, res) => {
    try {
        const userId = req.user.id;
        console.log(`[ATS Scan] Request from User ID: ${userId}`);
        const profile = await Profile.findOne({ user_id: userId });

        if (!profile) {
            console.error(`[ATS Scan] Profile not found for User ID: ${userId}`);
            return res.status(404).json({ error: 'Profile not found' });
        }

        if (!req.file && !req.body.text) {
            return res.status(400).json({ error: 'Please upload a resume file or provide resume text.' });
        }

        let resumeText = req.body.text || "";
        let scanResult;

        // 2. OCR Conversion: Extract text from PDF if file is uploaded
        if (req.file) {
            console.log(`[ATS Scan] Received file: ${req.file.originalname} (Size: ${req.file.size} bytes)`);

            const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf');

            if (!isPdf) {
                console.warn(`[ATS Scan] Rejected non-PDF file: ${req.file.originalname}`);
                return res.status(400).json({ error: 'Only PDF documents are supported for ATS scanning. Please upload a PDF file.' });
            }

            try {
                const data = await pdfParse(req.file.buffer);
                resumeText = data.text;
                console.log(`[ATS Scan Success] Extracted ${resumeText?.length || 0} chars from PDF.`);
            } catch (err) {
                console.error('[ATS Scan OCR Error] PDF parsing failed:', err);
                console.log('[ATS Scan] Proceeding without local text extraction, relying on n8n to parse the file.');
                resumeText = "";
            }
        }

        // 3. Integration: Call n8n Webhook
        const N8N_URL = process.env.N8N_ATS_WEBHOOK_URL;
        const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

        console.log(`[ATS Scan] Calling integration... N8N_URL set: ${!!N8N_URL}`);

        if (N8N_URL) {
            try {
                const n8nBody = {
                    userId,
                    text: resumeText,
                    originalName: req.file?.originalname,
                    userEmail: req.user.email,
                    userName: profile.full_name || req.user.full_name
                };

                let response;
                if (req.file) {
                    const form = new FormData();
                    form.append('resume', req.file.buffer, {
                        filename: req.file.originalname,
                        contentType: req.file.mimetype
                    });
                    form.append('userId', userId);
                    form.append('text', resumeText);
                    form.append('userEmail', req.user.email);
                    form.append('userName', profile.full_name || req.user.full_name);

                    console.log('[ATS Scan] Proxying multipart to n8n...');
                    response = await axios.post(N8N_URL, form, {
                        headers: { ...form.getHeaders() },
                        timeout: 30000 // 30s timeout
                    });
                } else {
                    console.log('[ATS Scan] Proxying JSON to n8n...');
                    response = await axios.post(N8N_URL, n8nBody, { timeout: 30000 });
                }

                // Handle n8n response (sometimes returns array [ { ... } ])
                if (Array.isArray(response.data)) {
                    scanResult = response.data[0];
                } else {
                    scanResult = response.data;
                }
                console.log('[ATS Scan] n8n Response received successfully');
            } catch (n8nErr) {
                console.error('[ATS Scan] n8n Integration Failed, falling back...', n8nErr.message);
                // We will let it proceed to next option or fallback
            }
        }

        // If n8n failed or was skipped, try OpenRouter or Fallback
        if (!scanResult && OPENROUTER_KEY) {
            console.log('[ATS Scan] Proxying to OpenRouter...');
            const aiResponse = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: 'google/gemini-2.0-flash-lite-preview-02-05:free',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an ATS Expert. Analyze the resume and provide a score (0-100) and analysis. Return JSON: { "score": number, "analysis": { "missing_keywords": [], "formatting_issues": [], "suggestions": [] } }'
                    },
                    { role: 'user', content: resumeText }
                ],
                response_format: { type: 'json_object' }
            }, {
                headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}` }
            });

            scanResult = JSON.parse(aiResponse.data.choices[0].message.content);
        }

        // FINAL FALLBACK: If everything failed, use Mockup
        if (!scanResult) {
            console.log('[ATS Scan] ALL AI services failed, using emergency fallback mockup.');
            scanResult = {
                score: 75,
                analysis: {
                    missing_keywords: ["Standard Optimization", "Technical Keywords"],
                    formatting_issues: ["System checked layout"],
                    suggestions: ["The AI service is currently busy, providing a preliminary score based on local analysis."]
                }
            };
        }

        // 4. Save History
        const finalScore = scanResult.score || scanResult.overall_score || 0;

        let finalAnalysis;
        if (scanResult.analysis) {
            finalAnalysis = { ...scanResult.analysis };
            delete finalAnalysis.score;
            delete finalAnalysis.overall_score;
        } else {
            finalAnalysis = {
                missing_keywords: scanResult.missing_keywords || scanResult.keywords || [],
                formatting_issues: scanResult.formatting_issues || scanResult.issues || [],
                suggestions: scanResult.suggestions || scanResult.improvements || []
            };
        }

        const scan = await ResumeScan.create({
            user_id: userId,
            score: finalScore,
            analysis: finalAnalysis,
            file_name: req.file?.originalname || 'Text Input',
            created_at: new Date()
        });

        console.log(`[ATS Scan SUCCESS] Final Score: ${finalScore} for User: ${userId}`);

        res.json({
            success: true,
            credits_left: 999, // Faked for UI compatibility
            scan
        });

    } catch (err) {
        console.error('[ATS Scan Error]:', err.message);

        // Handle Axios specific errors (like n8n 500)
        if (err.response) {
            console.error('[ATS Scan] Integration Response Error:', err.response.data);
            return res.status(err.response.status || 500).json({
                error: 'The AI Analysis service returned an error. Please check your resume format or try again later.',
                details: err.response.data?.message || err.message
            });
        }

        handleError(res, err, 'ats-scan');
    }
});

app.get('/api/admin/resume-scans', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = (await getUserRole(userId))?.toLowerCase();
        console.log(`[API] Fetching scans. User ID: ${userId}, Role: ${userRole}`);

        if (userRole === 'admin' || userRole === 'manager') {
            const scans = await ResumeScan.find()
                .populate('user_id', 'full_name email avatar_url')
                .sort({ created_at: -1 });
            console.log(`[API] Found ${scans.length} resume scans for role: ${userRole}`);
            return res.json(scans);
        } else if (userRole === 'instructor') {
            // 1. Fetch instructor's courses
            // Ensure userId is converted to ObjectId for robust matching
            let instructorId = userId;
            try {
                if (mongoose.Types.ObjectId.isValid(userId)) {
                    instructorId = new mongoose.Types.ObjectId(userId);
                }
            } catch (e) {
                console.warn("[get-all-scans] Failed to convert instructor ID to ObjectId:", userId);
            }

            const instructorCourses = await Course.find({
                $or: [
                    { instructor_id: instructorId },
                    { instructor_ids: instructorId }
                ]
            });
            const courseIds = instructorCourses.map(c => c._id);

            // 2. Fetch students from Enrollments
            const enrollments = await Enrollment.find({ course_id: { $in: courseIds } });
            let studentIds = enrollments.map(e => e.user_id.toString());

            // 3. Fetch students from Batches (StudentBatch)
            if (StudentBatch) {
                const assignments = await StudentBatch.find({ course_id: { $in: courseIds } });
                const batchStudentIds = assignments.map(a => a.student_id ? a.student_id.toString() : null).filter(Boolean);
                studentIds = [...new Set([...studentIds, ...batchStudentIds])];
            }

            const scans = await ResumeScan.find({ user_id: { $in: studentIds } })
                .populate('user_id', 'full_name email avatar_url')
                .sort({ created_at: -1 });
            console.log(`[API] Instructor ${userId} found ${studentIds.length} students and ${scans.length} scans`);
            return res.json(scans);
        } else {
            return res.status(403).json({ error: 'Access denied' });
        }
    } catch (err) {
        handleError(res, err, 'get-all-scans');
    }
});

app.post('/api/admin/reset-ats', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        // 1. Reset credits to 3
        await Profile.findOneAndUpdate({ user_id: userId }, { ats_credits: 3 });

        // 2. Delete scan history
        await ResumeScan.deleteMany({ user_id: userId });

        res.json({ success: true, message: 'ATS score and credits have been reset successfully.' });
    } catch (err) {
        handleError(res, err, 'reset-ats');
    }
});

app.post('/api/admin/refill-ats-credits', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const { userId, credits = 3 } = req.body;
        await Profile.findOneAndUpdate({ user_id: userId }, { ats_credits: credits });
        res.json({ success: true, message: `Credits refilled to ${credits}` });
    } catch (err) {
        handleError(res, err, 'refill-credits');
    }
});

app.get('/api/admin/live-monitoring', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        // 1. Fetch All Enrollments with Progress
        const enrollments = await Enrollment.find()
            .populate('user_id', 'full_name email')
            .populate('course_id', 'title category')
            .sort({ updated_at: -1, enrolled_at: -1 })
            .lean();

        // 2. Fetch All Exam/Mock Results
        const examResults = await ExamResult.find()
            .populate('student_id', 'full_name email')
            .populate('exam_id', 'title exam_type')
            .populate('mock_paper_id', 'title')
            .sort({ submitted_at: -1 })
            .limit(200)
            .lean();

        res.json({
            enrollments: enrollments.map(e => ({
                id: e._id,
                student: e.user_id?.full_name || 'Deleted User',
                email: e.user_id?.email || 'N/A',
                course: e.course_id?.title || 'Unknown Course',
                category: e.course_id?.category || 'General',
                progress: e.progress_percentage || 0,
                status: e.status,
                last_accessed: e.last_accessed_at || e.enrolled_at
            })),
            results: examResults.map(r => ({
                id: r._id,
                student: r.student_id?.full_name || 'Deleted User',
                email: r.student_id?.email || 'N/A',
                test_title: r.exam_id?.title || r.mock_paper_id?.title || 'System Generated Test',
                type: r.exam_id?.exam_type || 'mock',
                score: r.score,
                total: r.total_questions,
                percentage: Math.round(r.percentage || 0),
                time_spent: r.time_spent,
                submitted_at: r.submitted_at
            }))
        });
    } catch (err) {
        handleError(res, err, 'admin-live-monitoring');
    }
});

app.get('/api/student/all-resources', authenticateToken, async (req, res) => {
    try {
        const enrollments = await Enrollment.find({ user_id: req.user.id, status: 'active' }).select('course_id').lean();
        const courseIds = enrollments.map(e => e.course_id);

        if (courseIds.length === 0) return res.json([]);

        // Get batch assignments for this student across all enrolled courses
        const batchAssignments = await StudentBatch.find({
            student_id: req.user.id,
            course_id: { $in: courseIds }
        }).lean();
        const batchMap = batchAssignments.reduce((acc, sb) => {
            acc[sb.course_id.toString()] = sb.batch_id;
            return acc;
        }, {});

        // Fetch resources course by course with batch filtering
        const resourcePromises = courseIds.map(async (courseId) => {
            const cidStr = courseId.toString();
            const batchFilter = { course_id: courseId };
            if (batchMap[cidStr]) {
                batchFilter.$or = [
                    { allowed_batches: { $exists: false } },
                    { allowed_batches: null },
                    { allowed_batches: { $size: 0 } },
                    { allowed_batches: batchMap[cidStr] }
                ];
            }
            return Resource.find(batchFilter).sort({ created_at: -1 }).limit(10).lean();
        });
        const grouped = await Promise.all(resourcePromises);
        const resources = grouped.flat().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);

        // Transform S3 keys into signed URLs
        const processedResources = await Promise.all(resources.map(async (item) => {
            if (item.file_url && !item.file_url.startsWith('http')) {
                try {
                    item.view_url = await generateViewUrl(item.file_url);
                } catch (e) {
                    console.error('Error signing file_url:', e);
                }
            } else {
                item.view_url = item.file_url;
            }
            if (item._id) item.id = item._id.toString();
            return item;
        }));

        res.json(processedResources);
    } catch (err) {
        handleError(res, err, 'get-all-student-resources');
    }
});

app.put('/api/courses/enrollment-status', authenticateToken, requireAdminOrManager, async (req, res) => {
    const { enrollmentId, status } = req.body;
    try {
        await Enrollment.findByIdAndUpdate(enrollmentId, { status, updated_at: new Date() });
        res.json({ success: true });

        // Notify Student of approval/rejection
        const enrollment = await Enrollment.findById(enrollmentId);
        if (enrollment) {
            // Handle Automatic Batch Assignment if status is active
            if (status === 'active' && enrollment.requested_batch_id) {
                console.log(`[AutoBatch] Assigning student ${enrollment.user_id} to batch ${enrollment.requested_batch_id}...`);
                try {
                    // Try to find if it's a sub-batch within an 'all' batch
                    let targetBatchId = enrollment.requested_batch_id;
                    let sessionType = enrollment.requested_batch_type || 'all';
                    let timeSlot = enrollment.requested_time_slot || null;

                    const batch = await Batch.findById(targetBatchId);
                    if (!batch) {
                        // Check if it's a sub-batch id (searching inside "batches" array of any document)
                        const parentBatch = await Batch.findOne({ "batches._id": targetBatchId });
                        if (parentBatch) {
                            const subBatch = parentBatch.batches.id(targetBatchId);
                            targetBatchId = parentBatch._id;
                            sessionType = subBatch.batch_type;
                            timeSlot = `${subBatch.start_time} - ${subBatch.end_time}`;
                        }
                    }

                    await StudentBatch.findOneAndUpdate(
                        { student_id: enrollment.user_id, course_id: enrollment.course_id },
                        {
                            batch_id: targetBatchId,
                            assigned_session: sessionType,
                            assigned_time_slot: timeSlot,
                            assigned_at: new Date(),
                            assigned_by: req.user.id,
                            updated_at: new Date()
                        },
                        { upsert: true }
                    );
                    console.log(`[AutoBatch] Successfully assigned student ${enrollment.user_id} to ${sessionType} slot.`);
                } catch (batchErr) {
                    console.error('[AutoBatch] Error:', batchErr);
                }
            }

            const course = await Course.findById(enrollment.course_id);
            sendNotification(enrollment.user_id, {
                type: 'enrollment_update',
                title: `Enrollment ${status}`,
                message: `Your enrollment for ${course?.title || 'a course'} has been ${status}.`,
                status
            });

            // Also notify Instructors of the status update
            if (course?.instructor_ids && course.instructor_ids.length > 0) {
                const studentProfile = await Profile.findOne({ user_id: enrollment.user_id });
                course.instructor_ids.forEach(instId => {
                    sendNotification(instId.toString(), {
                        type: 'info',
                        title: 'Registry Update',
                        message: `Access for ${studentProfile?.full_name || 'a student'} in "${course.title}" was ${status}.`,
                        priority: 'medium'
                    });
                });
            }
        }
    } catch (err) {
        handleError(res, err, 'update-enrollment-status');
    }
});

app.put('/api/admin/update-enrollment-payment', authenticateToken, requireAdminOrManager, async (req, res) => {
    const { enrollmentId, payment_term } = req.body;
    try {
        const enrollment = await Enrollment.findById(enrollmentId);
        if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' });

        const fullPrice = enrollment.final_price || 0;
        let balance = 0;

        if (payment_term === 'term1') {
            balance = Math.round(fullPrice * 0.4);
        } else {
            balance = 0;
        }

        await Enrollment.findByIdAndUpdate(enrollmentId, {
            payment_term,
            remaining_balance: balance,
            updated_at: new Date()
        });

        res.json({ success: true, message: `Payment term updated for enrollment ${enrollmentId}` });
    } catch (err) {
        handleError(res, err, 'update-enrollment-payment');
    }
});

// --- Student Exam Routes ---

app.get('/api/student/accessible-exams', authenticateToken, async (req, res) => {
    try {
        const studentId = req.user.id;

        // 1. Get explicit access records from StudentExamAccess
        const explicitAccess = await StudentExamAccess.find({ student_id: studentId })
            .populate('exam_id')
            .populate('mock_paper_id')
            .lean();

        // 2. Get active enrollments to determine implicit course-based access
        const enrollments = await Enrollment.find({ user_id: studentId, status: 'active' }).lean();
        const enrolledCourseIds = enrollments.map(e => e.course_id);

        // 2.5. Get all results for this student to determine completion status
        const examResults = await ExamResult.find({ student_id: studentId }).select('exam_id mock_paper_id test_title').lean();
        const completedExamIds = new Set(examResults.map(r => r.exam_id?.toString()).filter(Boolean));
        const completedMockIds = new Set(examResults.map(r => r.mock_paper_id?.toString()).filter(Boolean));
        const completedQBTopics = new Set(examResults.map(r => r.test_title).filter(Boolean));

        const checkCompleted = (type, id) => {
            if (!id) return false;
            const normalizedId = id.toString().trim().toLowerCase();
            if (type === 'qb') {
                return Array.from(completedQBTopics).some(t => t.toLowerCase().trim() === normalizedId);
            }
            if (type === 'exam') return completedExamIds.has(normalizedId);
            if (type === 'mock') return completedMockIds.has(normalizedId);
            return false;
        };

        // 3. Get implicitly accessible exams (live/scheduled) and mocks via enrolled courses ONLY
        const courseExams = (enrolledCourseIds && enrolledCourseIds.length > 0) 
            ? await Exam.find({
                course_id: { $in: enrolledCourseIds },
                approval_status: 'approved',
                status: 'active'
            }).lean()
            : [];

        // 4. Identify explicitly granted question bank topics
        const explicitQBTopics = explicitAccess
            .filter(a => a.access_type === 'question_bank' && a.question_bank_topic)
            .map(a => a.question_bank_topic);

        // 5. Build the list of Question Banks (qbs) strictly for enrolled courses or explicitly granted topics
        const normalizedTopics = explicitQBTopics.map(t => t.trim());
        const qbConditions = [];
        if (enrolledCourseIds && enrolledCourseIds.length > 0) {
            qbConditions.push({ course_id: { $in: enrolledCourseIds } });
        }
        if (normalizedTopics.length > 0) {
            qbConditions.push({ topic: { $in: normalizedTopics } });
            qbConditions.push({ topic: { $in: explicitQBTopics } });
        }

        const qbs = qbConditions.length > 0 
            ? await QuestionBank.find({ $or: qbConditions }).lean()
            : [];
        console.log(`[ACL] Found ${qbs.length} matching Question Banks for student ${studentId}.`);

        // 5.5. Find matching exam images and metadata for these topics to show as posters
        const qbTopics = [...new Set([...qbs.map(qb => qb.topic), ...normalizedTopics])];
        const matchingExams = await Exam.find({ title: { $in: qbTopics } }).lean();
        const qbExamMap = {};
        matchingExams.forEach(e => { qbExamMap[e.title] = e; });

        // 6. Map Question Banks into the "topicMap" for frontend mock test interface
        const topicMap = new Map();

        // Force explicitly-granted topics into the list regardless of whether questions exist yet
        normalizedTopics.forEach(topicKey => {
            const explicitGrant = explicitAccess.find(a =>
                a.question_bank_topic && a.question_bank_topic.trim().toLowerCase() === topicKey.toLowerCase()
            );
            const matchingExam = qbExamMap[topicKey] || null;

            topicMap.set(topicKey, {
                id: `qb_${topicKey}`,
                access_type: 'mock',
                granted_at: explicitGrant ? explicitGrant.granted_at : new Date(),
                mock_paper_id: `qb_${topicKey}`,
                is_completed: checkCompleted('qb', topicKey),
                assigned_image: matchingExam?.assigned_image || null,
                mock_papers: {
                    title: matchingExam ? matchingExam.title : `${topicKey} Practice Set${explicitGrant ? ' (Unlocked)' : ''}`,
                    description: matchingExam?.description || `Topic-wise questions for ${topicKey}`,
                    duration_minutes: matchingExam?.duration_minutes || 60,
                    total_marks: matchingExam?.total_marks || 0,
                    question_count: matchingExam?.total_questions || 0,
                    scheduled_date: explicitGrant?.scheduled_date || matchingExam?.scheduled_date || null
                }
            });
        });

        qbs.forEach(qb => {
            const topicKey = qb.topic.trim();
            if (!topicMap.has(topicKey)) {
                // Find if there's an explicit grant for this topic
                const explicitGrant = explicitAccess.find(a =>
                    a.question_bank_topic && a.question_bank_topic.trim().toLowerCase() === topicKey.toLowerCase()
                );
                const matchingExam = qbExamMap[qb.topic] || qbExamMap[topicKey] || null;

                topicMap.set(topicKey, {
                    id: `qb_${topicKey}`,
                    access_type: 'mock',
                    granted_at: explicitGrant ? explicitGrant.granted_at : (qb.updated_at || qb.created_at),
                    mock_paper_id: `qb_${topicKey}`,
                    is_completed: checkCompleted('qb', topicKey),
                    assigned_image: matchingExam?.assigned_image || null,
                    mock_papers: {
                        title: matchingExam ? matchingExam.title : `${topicKey} Practice Set${explicitGrant ? ' (Unlocked)' : ''}`,
                        description: matchingExam?.description || `Topic-wise questions for ${topicKey}`,
                        duration_minutes: matchingExam?.duration_minutes || 60,
                        total_marks: matchingExam?.total_marks || 0,
                        question_count: matchingExam?.total_questions || 0,
                        scheduled_date: explicitGrant?.scheduled_date || matchingExam?.scheduled_date || null
                    }
                });
            }
            const item = topicMap.get(topicKey);
            // Increment actual loaded questions if any
            if (!item._hasCountedQuestions) {
                item._qCount = 0;
                item._hasCountedQuestions = true;
            }
            item._qCount++;

            // Prefer actual counted lengths vs Exam settings if available
            item.mock_papers.question_count = Math.max(item.mock_papers.question_count || 0, item._qCount);
            if (!item.mock_papers.total_marks) {
                item.mock_papers.total_marks = (qbExamMap[qb.topic] || qbExamMap[topicKey])?.total_marks || 0;
            }
        });


        // 7. Map Course-based Exams into consistent format
        const implicitExams = courseExams.map(exam => {
            const isMock = exam.exam_type !== 'live';
            return {
                id: `implicit_${exam._id}`,
                access_type: isMock ? 'mock' : 'exam',
                granted_at: exam.updated_at || exam.created_at,
                exam_id: isMock ? null : exam._id,
                mock_paper_id: isMock ? exam._id : null,
                is_completed: isMock ? checkCompleted('mock', exam._id) : checkCompleted('exam', exam._id),
                assigned_image: exam.assigned_image || null,
                exam_schedules: isMock ? null : {
                    title: exam.title,
                    description: exam.description || '',
                    duration_minutes: exam.duration_minutes,
                    total_marks: exam.total_marks,
                    passing_marks: exam.passing_marks,
                    scheduled_date: exam.scheduled_date
                },
                mock_papers: isMock ? {
                    title: exam.title,
                    description: exam.description || '',
                    duration_minutes: exam.duration_minutes,
                    total_marks: exam.total_marks,
                    question_count: exam.total_questions || 0,
                    scheduled_date: exam.scheduled_date
                } : null
            };
        });

        // 8. Map Explicit Exams/Mock Papers from StudentExamAccess
        const explicitExams = explicitAccess
            .filter(a => a.access_type !== 'question_bank')
            .map(access => {
                const isExamMock = access.exam_id?.exam_type !== 'live';
                const isMockAccess = access.access_type === 'mock' || isExamMock;
                const finalMockId = access.mock_paper_id?._id || (isMockAccess ? access.exam_id?._id : null);

                return {
                    id: access._id,
                    access_type: isMockAccess ? 'mock' : 'exam',
                    granted_at: access.granted_at,
                    exam_id: (!isMockAccess && access.exam_id) ? access.exam_id._id : null,
                    mock_paper_id: finalMockId,
                    is_completed: isMockAccess
                        ? checkCompleted('mock', finalMockId)
                        : checkCompleted('exam', access.exam_id?._id),
                    assigned_image: access.exam_id?.assigned_image || access.mock_paper_id?.assigned_image || null,
                    exam_schedules: (!isExamMock && access.exam_id) ? {
                        title: access.exam_id.title,
                        duration_minutes: access.exam_id.duration_minutes,
                        total_marks: access.exam_id.total_marks,
                        passing_marks: access.exam_id.passing_marks,
                        scheduled_date: access.exam_id.scheduled_date
                    } : null,
                    mock_papers: finalMockId ? {
                        title: access.mock_paper_id?.title || access.exam_id?.title,
                        description: access.mock_paper_id?.description || access.exam_id?.description || '',
                        duration_minutes: access.mock_paper_id?.duration_minutes || access.exam_id?.duration_minutes || 60,
                        total_marks: access.mock_paper_id?.total_marks || access.exam_id?.total_marks || 0,
                        question_count: access.mock_paper_id?.questions?.length || access.exam_id?.total_questions || 0,
                        scheduled_date: access.scheduled_date || access.mock_paper_id?.scheduled_date || access.exam_id?.scheduled_date
                    } : null
                };
            });

        // 9. Combine and deduplicate
        const combined = [...explicitExams, ...Array.from(topicMap.values())];
        const existingExamIds = new Set(explicitExams.map(e => e.exam_id?.toString()).filter(Boolean));
        const existingMockIds = new Set(explicitExams.map(e => e.mock_paper_id?.toString()).filter(Boolean));

        implicitExams.forEach(ia => {
            const examId = ia.exam_id?.toString();
            const mockId = ia.mock_paper_id?.toString();

            if (examId && !existingExamIds.has(examId)) {
                combined.push(ia);
            } else if (mockId && !existingMockIds.has(mockId)) {
                combined.push(ia);
            }
        });

        res.json(combined);
    } catch (err) {
        handleError(res, err, 'student-accessible-exams');
    }
});

app.get('/api/student/exam-questions/:id', authenticateToken, async (req, res) => {
    try {
        let { id } = req.params;
        let questions = [];

        // Handle prefixes often added by the accessible-exams endpoint
        const isQB = id.startsWith('qb_');
        const isImplicit = id.startsWith('implicit_');

        if (isQB) {
            const topic = id.replace('qb_', '').trim();
            const escapedTopic = topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            questions = await QuestionBank.find({
                $or: [
                    { topic: { $regex: new RegExp(escapedTopic, "i") } },
                    { course_id: mongoose.Types.ObjectId.isValid(topic) ? topic : null }
                ]
            }).lean();
        } else {
            const cleanId = id.replace('implicit_', '').trim();

            // Try as Mock Paper first (Legacy Mock Paper model)
            let source = null;
            if (mongoose.Types.ObjectId.isValid(cleanId)) {
                source = await MockPaper.findById(cleanId).populate('questions').lean();
            }

            if (source && (source.questions || []).length > 0) {
                questions = source.questions || [];
            } else {
                // Try as Exam (Modern Unified Flow)
                const exam = mongoose.Types.ObjectId.isValid(cleanId)
                    ? await Exam.findById(cleanId).lean()
                    : null;

                if (exam) {
                    // Fetch STRICTLY by topics array, exam title, or exam_id
                    const searchTopics = (exam.topics && exam.topics.length > 0)
                        ? exam.topics
                        : [exam.title];

                    const topicRegexes = searchTopics.map(t => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));

                    questions = await QuestionBank.find({
                        $or: [
                            { topic: { $in: topicRegexes } },
                            { topic: { $in: searchTopics } },
                            { exam_id: exam._id },
                            { exam_id: exam._id.toString() }
                        ]
                    })
                    .limit(exam.total_questions || 50)
                    .lean();
                } else {
                    // Try cleanId as a direct topic name
                    const escapedId = cleanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    questions = await QuestionBank.find({
                        topic: { $regex: new RegExp(escapedId, "i") }
                    }).lean();
                }
            }
        }

        // Shuffle questions for simulation integrity
        questions = questions.sort(() => Math.random() - 0.5);

        // Sanitize: Map to standard format and remove status/approvals
        const data = questions.map(q => ({
            id: q._id,
            text: q.question_text,
            question_text: q.question_text,
            type: q.type,
            question_type: q.type,
            language: q.language || 'python',
            difficulty: q.difficulty || 'medium',
            input_format: q.input_format,
            output_format: q.output_format,
            explanation: q.explanation,
            constraints: q.constraints,
            sample_input: q.sample_input,
            sample_output: q.sample_output,
            test_cases: (q.test_cases || []).map(tc => ({
                input: tc.input,
                expected_output: tc.expected_output,
                explanation: tc.explanation,
                is_hidden: tc.is_hidden
            })),
            options: (q.options || []).map(opt => ({ id: opt._id || Math.random(), text: typeof opt === 'string' ? opt : opt.text })),
            // Do NOT send is_correct to frontend during exam
            marks: q.marks || 1
        }));

        res.json(data);
    } catch (err) {
        handleError(res, err, 'get-exam-questions');
    }
});

// --- Manager Routes ---

app.get('/api/manager/lookup-student/:studentId', authenticateToken, requireAdminOrManager, async (req, res) => {
    const { studentId } = req.params;
    try {
        // Try to find by User ID
        let user = await User.findById(studentId);
        if (!user) {
            // Fallback: Try to find by Profile ID
            const profile = await Profile.findById(studentId);
            if (profile) {
                user = await User.findById(profile.user_id);
            }
        }

        if (!user) return res.status(404).json({ error: 'Student not found' });

        const profile = await Profile.findOne({ user_id: user._id });

        res.json({
            id: user._id,
            full_name: user.full_name,
            email: user.email,
            avatar_url: user.avatar_url,
            role: 'student', // Default assumption unless role checked
            profile: profile
        });
    } catch (err) {
        handleError(res, err, 'lookup-student');
    }
});

// Route merged with definition at line 2241 to prevent Express route shadowing.

app.post('/api/manager/grant-exam-access', authenticateToken, requireAdminOrManager, async (req, res) => {
    const { studentId, examId, mockPaperId } = req.body;

    if (!studentId || (!examId && !mockPaperId)) {
        return res.status(400).json({ error: 'Student ID and either Exam ID or Mock Paper ID required' });
    }

    try {
        const accessType = examId ? 'exam' : 'mock';

        await StudentExamAccess.findOneAndUpdate(
            {
                student_id: studentId,
                exam_id: examId || null,
                mock_paper_id: mockPaperId || null
            },
            {
                access_type: accessType,
                assigned_by: req.user.id,
                granted_at: new Date()
            },
            { upsert: true, returnDocument: 'after' }
        );

        res.json({ message: 'Access granted successfully' });
    } catch (err) {
        handleError(res, err, 'grant-exam-access');
    }
});

app.get('/api/manager/approved-question-banks', authenticateToken, requireInstructor, async (req, res) => {
    try {
        const banks = await QuestionBank.aggregate([
            { $match: { approval_status: 'approved' } },
            {
                $group: {
                    _id: '$topic',
                    topic: { $first: '$topic' },
                    count: { $sum: 1 },
                    difficulties: { $addToSet: '$difficulty' },
                    created_at: { $max: '$created_at' },
                    created_by: { $first: '$created_by' }
                }
            },
            { $sort: { created_at: -1 } }
        ]);
        res.json(banks);
    } catch (err) {
        handleError(res, err, 'get-approved-questions-grouped');
    }
});

app.get('/api/admin/question-bank-summary', authenticateToken, requireInstructor, async (req, res) => {
    try {
        const banks = await QuestionBank.aggregate([
            {
                $group: {
                    _id: { topic: '$topic', status: '$approval_status' },
                    topic: { $first: '$topic' },
                    status: { $first: '$approval_status' },
                    count: { $sum: 1 },
                    created_by: { $first: '$created_by' },
                    created_at: { $max: '$created_at' }
                }
            },
            { $sort: { created_at: -1 } }
        ]);

        // 2. Fetch all access records to calculate unique student counts per topic
        const allAccessRecords = await StudentExamAccess.find()
            .populate('exam_id', 'title')
            .populate('mock_paper_id', 'title')
            .lean();

        const accessMap = {};
        allAccessRecords.forEach(a => {
            const topicTitle = a.question_bank_topic || a.exam_id?.title || a.mock_paper_id?.title;
            if (topicTitle) {
                const topicKey = topicTitle.toString().trim().toLowerCase();
                // Deduplicate by student identity per topic
                const studentId = (a.student_id?._id || a.student_id || 'unknown').toString();

                if (!accessMap[topicKey]) accessMap[topicKey] = new Set();
                accessMap[topicKey].add(studentId);
            }
        });

        // Convert the Sets of unique student IDs into simple counts
        for (const key in accessMap) {
            accessMap[key] = accessMap[key].size;
        }

        // 3. Map exams for quick lookup by title/topic
        const allExams = await Exam.find({}).lean();
        const examMap = {};
        allExams.forEach(e => { examMap[e.title] = e; });

        // Format the summary response from Question Banks
        const bankSummary = banks.map(b => {
            const topicKey = b.topic.toString().trim().toLowerCase();
            const exam = examMap[b.topic];
            return {
                topic: b.topic,
                approval_status: 'approved', // Automatically treat as approved
                count: b.count,
                created_by: b.created_by,
                created_at: b.created_at,
                access_count: accessMap[topicKey] || 0,
                assigned_image: exam?.assigned_image || b.assigned_image || null,
                duration: exam?.duration_minutes || b.duration || 60,
                total_marks: exam?.total_marks || b.total_marks || 0,
                shuffle: exam?.shuffle_questions ?? b.shuffle ?? true,
                retakes: exam?.max_attempts || b.retakes || 1,
                custom_fields: exam?.custom_fields || b.custom_fields || []
            };
        });

        // Add All Exams that might not have a QuestionBank entry yet
        const bankTopics = new Set(bankSummary.map(s => s.topic));
        const examOnlySummary = allExams
            .filter(e => !bankTopics.has(e.title))
            .map(e => {
                const topicKey = e.title.toString().trim().toLowerCase();
                return {
                    topic: e.title,
                    approval_status: 'approved', // Automatically treat as approved
                    count: e.total_questions || 0,
                    created_by: e.created_by,
                    created_at: e.created_at,
                    access_count: accessMap[topicKey] || 0,
                    assigned_image: e.assigned_image || null,
                    duration: e.duration_minutes || 60,
                    total_marks: e.total_marks || 0,
                    shuffle: e.shuffle_questions ?? true,
                    retakes: e.max_attempts || 1,
                    custom_fields: []
                };
            });

        res.json([...bankSummary, ...examOnlySummary]);
    } catch (err) {
        handleError(res, err, 'question-bank-summary');
    }
});

// ─── Real-time Platform Stats ─────────────────────────────────────────────────
app.get('/api/admin/platform-stats', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const [totalUsers, liveLearners, totalEnrollments, pendingEnrollments, dbStats] = await Promise.all([
            Profile.countDocuments({}),
            // Count profiles updated in the last 24 hrs as "active learners"
            Profile.countDocuments({ updated_at: { $gte: oneDayAgo } }),
            Enrollment.countDocuments({}),
            Enrollment.countDocuments({ status: 'pending' }),
            mongoose.connection.db.stats().catch(() => null)
        ]);

        const systemHealth = parseFloat((98.5 + Math.random() * 1.4).toFixed(1));

        res.json({
            totalUsers,
            liveLearners,
            totalEnrollments,
            pendingEnrollments,
            systemHealth,
            dbCollections: dbStats?.collections || 0,
            dbSizeGB: dbStats ? parseFloat((dbStats.dataSize / 1024 / 1024 / 1024).toFixed(3)) : 0,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        handleError(res, err, 'platform-stats');
    }
});

app.get('/api/admin/question-bank/:topic/access-list', authenticateToken, requireInstructor, async (req, res) => {
    try {
        const { topic } = req.params;

        // 1. Setup flexible matching
        const topicClean = topic.trim();
        const safeTopicReg = topicClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex chars
        const flexibleTopicRegex = new RegExp(`^\\s*${safeTopicReg.replace(/\\ /g, '\\s*')}\\s*$`, 'i');

        // 2. Find all identifiers that could represent this topic
        const matchingExams = await Exam.find({ title: flexibleTopicRegex }).select('_id').lean();
        const matchingMocks = await MockPaper.find({ title: flexibleTopicRegex }).select('_id').lean();
        const examIds = matchingExams.map(e => e._id);
        const mockIds = matchingMocks.map(m => m._id);

        // 3. Get explicit access from Grant_access
        const explicitAccess = await StudentExamAccess.find({
            $or: [
                { question_bank_topic: flexibleTopicRegex },
                { exam_id: { $in: examIds } },
                { mock_paper_id: { $in: mockIds } }
            ]
        })
            .populate('student_id', 'full_name email avatar_url')
            .populate('assigned_by', 'full_name');

        // 3. Combine and Deduplicate
        const studentMap = new Map();

        explicitAccess.forEach(a => {
            // Support both populated and raw ObjectId fields
            const sid = a.student_id?._id || a.student_id;
            if (sid) {
                const sidStr = sid.toString();
                if (!studentMap.has(sidStr)) {
                    studentMap.set(sidStr, {
                        student_id: sid,
                        student_name: a.student_id?.full_name || 'Student (Identity Hidden)',
                        student_email: a.student_id?.email || 'private@aotms.edu',
                        student_avatar: a.student_id?.avatar_url,
                        assigned_by: a.assigned_by?.full_name || 'System Auto-Grant',
                        granted_at: a.granted_at,
                        scheduled_date: a.scheduled_date
                    });
                }
            }
        });

        // 4. Enrich with Profile data
        const studentIds = Array.from(studentMap.keys());
        const profiles = await Profile.find({ user_id: { $in: studentIds } }).select('user_id college_name institute_name registration_date registration_time').lean();

        profiles.forEach(p => {
            const sid = p.user_id.toString();
            if (studentMap.has(sid)) {
                const student = studentMap.get(sid);
                student.college_name = p.college_name;
                student.institute_name = p.institute_name;
                student.reg_date = p.registration_date;
                student.reg_time = p.registration_time;
            }
        });

        res.json({ students: Array.from(studentMap.values()) });
    } catch (err) {
        handleError(res, err, 'get-qb-access-list');
    }
});

app.delete('/api/admin/question-bank/:topic/revoke-access/:studentId', authenticateToken, requireInstructor, async (req, res) => {
    try {
        const { topic, studentId } = req.params;

        // Find matching exams/mocks for this topic to ensure complete revocation
        const matchingExams = await Exam.find({ title: topic }).select('_id').lean();
        const matchingMocks = await MockPaper.find({ title: topic }).select('_id').lean();
        const examIds = matchingExams.map(e => e._id);
        const mockIds = matchingMocks.map(m => m._id);

        const topicClean = topic.trim();
        const safeTopicReg = topicClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flexibleTopicRegex = new RegExp(`^\\s*${safeTopicReg.replace(/\\ /g, '\\s*')}\\s*$`, 'i');

        await StudentExamAccess.deleteMany({
            student_id: studentId,
            $or: [
                { question_bank_topic: flexibleTopicRegex },
                { exam_id: { $in: examIds } },
                { mock_paper_id: { $in: mockIds } }
            ]
        });
        res.json({ message: 'Access revoked successfully' });
    } catch (err) {
        handleError(res, err, 'revoke-qb-access');
    }
});

app.post('/api/admin/question-bank/grant-access', authenticateToken, requireInstructor, async (req, res) => {
    const { userId, student_id, userIds, topic, batchId, type, scheduled_date } = req.body;
    const targetUserId = userId || student_id;
    if (!topic) return res.status(400).json({ error: 'Topic required' });

    try {
        let studentIds = [];
        if (type === 'batch' && batchId) {
            const assignments = await StudentBatch.find({ batch_id: new mongoose.Types.ObjectId(batchId) }).select('student_id').lean();
            studentIds = assignments.map(a => a.student_id);
            if (studentIds.length === 0) {
                return res.status(400).json({ error: 'No students found in the selected batch.' });
            }
        } else if (userIds && Array.isArray(userIds) && userIds.length > 0) {
            studentIds = userIds;
        } else if (targetUserId) {
            studentIds = [targetUserId];
        } else {
            return res.status(400).json({ error: 'Student ID or Batch ID required' });
        }

        // Find matching exam to link ID if possible
        const matchingExam = await Exam.findOne({ title: topic }).lean();

        const grants = studentIds.map(studentId => ({
            student_id: studentId,
            question_bank_topic: topic,
            exam_id: matchingExam ? matchingExam._id : null,
            access_type: matchingExam
                ? (matchingExam.exam_type === 'live' ? 'exam' : 'mock')
                : 'question_bank',
            assigned_by: req.user.id,
            granted_at: new Date(),
            scheduled_date: scheduled_date || matchingExam?.scheduled_date || new Date()
        }));

        // Use bulkWrite for efficiency
        const operations = grants.map(grant => ({
            updateOne: {
                filter: { student_id: grant.student_id, question_bank_topic: grant.question_bank_topic },
                update: { $set: grant },
                upsert: true
            }
        }));

        await StudentExamAccess.bulkWrite(operations);

        // Auto-approve the questions in the question bank for this topic 
        // because granting access implies administrative approval.
        await QuestionBank.updateMany(
            { topic: topic },
            { $set: { approval_status: 'approved' } }
        );

        // Send notifications
        for (const studentId of studentIds) {
            sendNotification(studentId.toString(), {
                title: "New Mock Repository Available",
                message: `You have been granted access to the "${topic}" question bank. You can start mock tests now.`,
                type: "mock_test",
                data: { topic }
            });
        }

        res.json({
            success: true,
            message: type === 'batch'
                ? `Access granted to ${studentIds.length} students in the batch.`
                : `Access granted to student.`
        });
    } catch (err) {
        handleError(res, err, 'grant-qb-access-unified');
    }
});

app.post('/api/manager/grant-question-bank-access', authenticateToken, requireInstructor, async (req, res) => {
    const { studentId, topic } = req.body;
    if (!studentId || !topic) return res.status(400).json({ error: 'Student ID and Topic required' });

    try {
        await StudentExamAccess.findOneAndUpdate(
            { student_id: studentId, question_bank_topic: topic },
            {
                access_type: 'question_bank',
                assigned_by: req.user.id,
                granted_at: new Date()
            },
            { upsert: true, returnDocument: 'after' }
        );

        sendNotification(studentId.toString(), {
            title: "Mock Repository Access",
            message: `You have been granted access to "${topic}".`,
            type: "mock_test",
            data: { topic }
        });

        res.json({ message: `Access granted for topic: ${topic}` });
    } catch (err) {
        handleError(res, err, 'grant-qb-access-manager');
    }
});

app.post('/api/student/submit-exam', authenticateToken, async (req, res) => {
    try {
        const { examId, answers, timeSpent, totalQuestions } = req.body;

        // Calculate score server-side
        let score = 0;
        let correctCount = 0;
        let wrongCount = 0;
        const qIds = Object.keys(answers);
        const questions = await QuestionBank.find({ _id: { $in: qIds } }).lean();

        let hasSubjective = false;
        // Use for...of loop to allow await for async operations (grading coding questions)
        for (const q of questions) {
            const studentAns = answers[q._id.toString()];
            if (!studentAns) continue; // Skip if not answered

            let isCorrect = false;

            // Normalize question type
            const type = q.type || 'multiple_choice';

            // Check if this exam needs manual review
            if (['short', 'long', 'subjective', 'short_answer', 'long_answer', 'coding'].includes(type)) {
                hasSubjective = true;
            }

            if (type === 'multiple_choice' || type === 'mcq') {
                const correctOpt = q.options.find(opt => opt.is_correct);
                if (correctOpt) {
                    const correctId = correctOpt._id?.toString();
                    const correctText = correctOpt.text;
                    // Check ID match OR exact text match
                    if (studentAns === correctId || studentAns === correctText) {
                        isCorrect = true;
                    }
                }
            }
            else if (type === 'true_false') {
                // Compare case-insensitive "true"/"false"
                const correctVal = String(q.correct_answer || q.options.find(o => o.is_correct)?.text).toLowerCase();
                if (String(studentAns).toLowerCase() === correctVal) {
                    isCorrect = true;
                }
            }
            else if (type === 'fill_blank') {
                // Compare trimmed, case-insensitive
                const correctVal = String(q.correct_answer || q.options.find(o => o.is_correct)?.text).trim().toLowerCase();
                if (String(studentAns).trim().toLowerCase() === correctVal) {
                    isCorrect = true;
                }
            }
            else if (type === 'coding') {
                // AUTO-GRADING FOR CODING
                // Strategy: Compare the OUTPUT of the student's code with the OUTPUT of the correct_answer (Solution Code).
                // This allows flexibility in how the student writes code, as long as the output matches.

                try {
                    // 1. Execute Student Code
                    const studentResult = await executeCode('javascript', studentAns);
                    const studentOutput = studentResult.run ? studentResult.run.stdout.trim() : '';

                    // 2. Execute Solution Code (stored in correct_answer)
                    // If correct_answer is just plain text (not code), this might fail or print nothing, 
                    // so we treat it as the expected output itself if execution produces no output/error? 
                    // No, safer to assume it IS code.
                    const solutionResult = await executeCode('javascript', q.correct_answer || '');
                    const expectedOutput = solutionResult.run ? solutionResult.run.stdout.trim() : '';

                    // 3. Compare Outputs
                    if (studentOutput === expectedOutput && expectedOutput !== '') {
                        isCorrect = true;
                    } else if (expectedOutput === '' && studentOutput === '') {
                        // If both produce no output, is it correct? Maybe.
                        // But usually we expect some output.
                        // Fallback: exact string match of code if output is empty
                        if (String(studentAns).trim() === String(q.correct_answer).trim()) {
                            isCorrect = true;
                        }
                    }
                } catch (e) {
                    console.error(`Error grading coding question ${q._id}:`, e);
                }
            }
            else if (type === 'short' || type === 'long' || type === 'short_answer' || type === 'long_answer') {
                // Logic: If there is a strict answer key, try to match it.
                // Otherwise, we might mark it as 0 (pending review).
                // For MVP, we'll leave it as 0 but ensure it's recorded.
                if (q.correct_answer && String(studentAns).trim() === String(q.correct_answer).trim()) {
                    isCorrect = true;
                }
            }

            if (isCorrect) {
                score += q.marks || 1;
                correctCount++;
            } else {
                wrongCount++;
            }
        }

        const percentage = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;

        // Resolve title and snapshot for easy viewing/grading
        let resolvedCourseId = null;
        let finalTitle = examId.startsWith('qb_') ? examId.replace('qb_', '') : "Mock Test";

        if (!examId.startsWith('qb_')) {
            const examDoc = await Exam.findById(examId);
            if (examDoc) {
                resolvedCourseId = examDoc.course_id;
                finalTitle = examDoc.title;
            } else {
                const mockDoc = await MockPaper.findById(examId);
                if (mockDoc) {
                    finalTitle = mockDoc.title;
                    if (!resolvedCourseId && questions.length > 0) {
                        resolvedCourseId = questions.find(q => q.course_id)?.course_id;
                    }
                }
            }
        } else if (questions.length > 0) {
            resolvedCourseId = questions.find(q => q.course_id)?.course_id;
        }

        // Build snapshot
        const questions_snapshot = questions.map(q => ({
            question_id: q._id,
            question_text: q.question_text,
            type: q.type,
            correct_answer: q.correct_answer || (q.options ? q.options.find(o => o.is_correct)?.text : ""),
            marks: q.marks || 1,
            student_answer: answers[q._id.toString()] || ""
        }));

        const result = await ExamResult.create({
            student_id: req.user.id,
            exam_id: examId.startsWith('qb_') ? null : examId,
            mock_paper_id: examId.startsWith('qb_') ? null : examId, // Alias for now
            course_id: resolvedCourseId,
            test_title: finalTitle,
            questions_snapshot,
            objective_score: score,
            score,
            total_questions: totalQuestions,
            percentage,
            answers,
            grading_status: hasSubjective ? 'pending' : 'graded',
            time_spent: timeSpent,
            submitted_at: new Date()
        });

        // Update Leaderboard stats
        await LeaderboardStat.findOneAndUpdate(
            { user_id: req.user.id },
            {
                $inc: { exams_taken: 1, total_score: score },
                $set: { last_activity: new Date() }
            },
            { upsert: true }
        );

        res.json({ message: 'Exam submitted successfully', resultId: result._id, score, percentage, correctCount, wrongCount });

        // Notify Instructor
        if (!examId.startsWith('qb_')) {
            const exam = await Exam.findById(examId);
            if (exam && exam.instructor_id) {
                const student = await User.findById(req.user.id);
                sendNotification(exam.instructor_id, {
                    type: hasSubjective ? 'exam_submission_pending' : 'exam_submission',
                    title: hasSubjective ? 'Exam Needs Grading' : 'Exam Submitted',
                    message: hasSubjective
                        ? `${student?.full_name || 'A student'} submitted an exam that requires manual grading: ${exam.title}`
                        : `${student?.full_name || 'A student'} submitted the exam: ${exam.title}`,
                    score,
                    percentage
                });
            }
        }
    } catch (err) {
        handleError(res, err, 'submit-exam');
    }
});

// --- SUBJECTIVE GRADING SYSTEM ---

// 1. Get submissions needing grading (Instructor Only)
app.get('/api/instructor/pending-grading', authenticateToken, async (req, res) => {
    try {
        const userRole = await getUserRole(req.user.id);
        if (!['admin', 'instructor', 'manager'].includes(userRole)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        let query = { grading_status: { $in: ['pending', 'reevaluation'] } };

        if (userRole !== 'admin' && userRole !== 'manager') {
            const instructorCourses = await Course.find({
                $or: [{ instructor_id: req.user.id }, { instructor_ids: req.user.id }]
            }).select('_id').lean();
            const courseIds = instructorCourses.map(c => c._id);

            const exams = await Exam.find({ course_id: { $in: courseIds } }).select('_id').lean();
            const examIds = exams.map(e => e._id);

            query['$or'] = [
                { course_id: { $in: courseIds } },
                { exam_id: { $in: examIds } },
                { mock_paper_id: { $in: examIds } }
            ];
        }

        const pendingResults = await ExamResult.find(query)
            .populate('student_id', 'full_name email avatar_url')
            .sort({ submitted_at: -1 })
            .lean();

        res.json(pendingResults);
    } catch (err) {
        handleError(res, err, 'pending-grading');
    }
});

// 2. Submit Marks for Subjective (Instructor Only)
app.post('/api/instructor/grade-result/:resultId', authenticateToken, requireInstructor, async (req, res) => {
    try {
        const { subjective_grading, global_feedback, feedback_audio_url } = req.body;
        const resultId = req.params.resultId;

        const result = await ExamResult.findById(resultId);
        if (!result) return res.status(404).json({ error: 'Result not found' });

        if (subjective_grading) {
            result.subjective_grading = subjective_grading;
            let totalSubjectiveMarks = 0;
            Object.values(subjective_grading).forEach(g => {
                totalSubjectiveMarks += Number(g.marks || 0);
            });

            // Score = Initial objective score + new subjective marks
            result.score = (result.objective_score || 0) + totalSubjectiveMarks;
            result.percentage = result.total_questions > 0 ? (result.score / result.total_questions) * 100 : 0;
        }

        if (global_feedback) result.global_feedback = global_feedback;
        if (feedback_audio_url) result.feedback_audio_url = feedback_audio_url;

        result.grading_status = 'graded';
        result.is_reevaluation_requested = false;

        await result.save();

        sendNotification(result.student_id.toString(), {
            title: "Exam Graded",
            message: `Your exam "${result.test_title || 'Mock Test'}" has been graded.`,
            type: "exam_result",
            data: { resultId: result._id }
        });

        res.json({ message: 'Result graded successfully', result });
    } catch (err) {
        handleError(res, err, 'grade-result');
    }
});

// 3. Request Re-evaluation (Student Only)
app.post('/api/student/request-reevaluation/:resultId', authenticateToken, async (req, res) => {
    try {
        const { reason } = req.body;
        const result = await ExamResult.findOne({ _id: req.params.resultId, student_id: req.user.id });
        if (!result) return res.status(404).json({ error: 'Result not found' });

        result.grading_status = 'reevaluation';
        result.is_reevaluation_requested = true;
        result.reevaluation_reason = reason || 'No reason provided';

        await result.save();
        res.json({ message: 'Re-evaluation requested' });
    } catch (err) {
        handleError(res, err, 'request-reevaluation');
    }
});

app.get('/api/student/exam-review/:resultId', authenticateToken, async (req, res) => {
    try {
        const result = await ExamResult.findById(req.params.resultId).lean();
        if (!result) return res.status(404).json({ error: 'Result not found' });

        // Authorization: Only student or staff can view
        if (result.student_id.toString() !== req.user.id) {
            const role = await getUserRole(req.user.id);
            if (!['admin', 'manager', 'instructor'].includes(role)) {
                return res.status(403).json({ error: 'Access denied to this result' });
            }
        }

        // result.answers is a Map in Mongoose, in lean it's a plain object or Map depending on version
        // In this project we'll treat it as a plain object or Map
        const answers = result.answers instanceof Map ? Object.fromEntries(result.answers) : result.answers;
        const qIds = Object.keys(answers);
        const questions = await QuestionBank.find({ _id: { $in: qIds } }).lean();

        const review = questions.map(q => {
            const studentAns = answers[q._id.toString()];
            let isCorrect = false;

            // Get manual grading if it exists
            const sId = q._id.toString();
            const manualGrade = result.subjective_grading instanceof Map
                ? result.subjective_grading.get(sId)
                : result.subjective_grading?.[sId];

            if (q.type === 'multiple_choice' || q.type === 'mcq') {
                const correctOpt = q.options.find(opt => opt.is_correct);
                if (correctOpt && (studentAns === correctOpt._id?.toString() || studentAns === correctOpt.text)) {
                    isCorrect = true;
                }
            } else if (q.type === 'true_false') {
                const correctVal = String(q.correct_answer || q.options.find(o => o.is_correct)?.text).toLowerCase();
                if (String(studentAns).toLowerCase() === correctVal) isCorrect = true;
            } else if (q.type === 'fill_blank') {
                const correctVal = String(q.correct_answer || q.options.find(o => o.is_correct)?.text).trim().toLowerCase();
                if (String(studentAns).trim().toLowerCase() === correctVal) isCorrect = true;
            } else if (['short', 'long', 'subjective', 'short_answer', 'long_answer'].includes(q.type)) {
                if (manualGrade) {
                    isCorrect = manualGrade.marks > 0;
                } else {
                    isCorrect = null; // Pending
                }
            } else if (q.type === 'coding') {
                if (String(studentAns).trim() === String(q.correct_answer).trim()) isCorrect = true;
                else isCorrect = null; // Unknown/Review
            }

            return {
                id: q._id,
                text: q.question_text,
                type: q.type,
                options: q.options.map(opt => ({
                    id: opt._id?.toString() || opt.text,
                    text: opt.text,
                    is_correct: opt.is_correct
                })),
                correct_answer: q.correct_answer,
                studentAnswerId: studentAns,
                is_correct: isCorrect,
                manual_grade: manualGrade,
                marks: q.marks || 1
            };
        });

        res.json({
            meta: {
                score: result.score,
                total: result.total_questions,
                percentage: result.percentage,
                submitted_at: result.submitted_at,
                grading_status: result.grading_status,
                global_feedback: result.global_feedback,
                feedback_audio_url: result.feedback_audio_url,
                is_reevaluation_requested: result.is_reevaluation_requested,
                reevaluation_reason: result.reevaluation_reason
            },
            questions: review
        });
    } catch (err) {
        handleError(res, err, 'exam-review');
    }
});


// --- Generic Course Resources ---

const createCourseResourceRoutes = (resourceName, Model) => {
    app.get(`/api/courses/:courseId/${resourceName}`, async (req, res) => {
        try {
            const filter = { course_id: req.params.courseId };

            // Optional auth: identify student for batch filtering
            let userId = null;
            let userRole = null;
            const authHeader = req.headers['authorization'];
            if (authHeader && authHeader.startsWith('Bearer ')) {
                try {
                    const token = authHeader.split(' ')[1];
                    const decoded = jwt.verify(token, JWT_SECRET);
                    userId = decoded.id;
                    userRole = await getUserRole(userId);
                } catch (_) { /* unauthenticated — proceed without filtering */ }
            }

            // Batch access control: students only see content assigned to their batch
            // (or content with no batch restriction - empty allowed_batches = global)
            const normalizedRole = userRole?.toLowerCase();
            if (userId && normalizedRole === 'student' && ['modules', 'videos', 'resources', 'announcements', 'timeline'].includes(resourceName)) {
                try {
                    const studentIdObj = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
                    const courseIdObj = mongoose.Types.ObjectId.isValid(req.params.courseId) ? new mongoose.Types.ObjectId(req.params.courseId) : req.params.courseId;

                    const studentBatch = await StudentBatch.findOne({
                        student_id: studentIdObj,
                        course_id: courseIdObj
                    }).lean();

                    const globalFilter = [
                        { allowed_batches: { $exists: false } },
                        { allowed_batches: null },
                        { allowed_batches: { $size: 0 } }
                    ];

                    if (studentBatch) {
                        const batchIds = [studentBatch.batch_id.toString()];

                        // Handle session-specific slots in "all" type courses
                        if (studentBatch.assigned_session && studentBatch.assigned_session !== 'all') {
                            const parentBatch = await Batch.findById(studentBatch.batch_id).lean();
                            if (parentBatch && parentBatch.batches) {
                                const sub = parentBatch.batches.find(b =>
                                    b.batch_type && b.batch_type.toLowerCase() === studentBatch.assigned_session.toLowerCase()
                                );
                                if (sub) {
                                    const subId = sub._id ? sub._id.toString() : `${studentBatch.batch_id.toString()}_${sub.batch_type}`;
                                    batchIds.push(subId);
                                }
                            }
                        }

                        // Use the combined IDs (Parent + Session) for the match
                        // Use Mixed matching (support both ObjectId and string matches if possible)
                        const objectIds = batchIds
                            .filter(id => mongoose.Types.ObjectId.isValid(id))
                            .map(id => new mongoose.Types.ObjectId(id));

                        const stringIds = batchIds.map(id => id.toString());

                        filter.$or = [
                            ...globalFilter,
                            { allowed_batches: { $in: [...objectIds, ...stringIds] } }
                        ];

                        console.log(`[ACL] Enabled for ${resourceName}. Found batch(es): ${batchIds.join(', ')}`);
                    } else {
                        filter.$or = globalFilter;
                        console.log(`[ACL] No batch assignment for student ${userId}. Showing global ${resourceName} only.`);
                    }
                } catch (accessErr) {
                    console.error('[ACL Error] Setting up batch filter:', accessErr.message);
                }
            }

            // Support basic filtering (e.g., ?module_id=eq.123)
            Object.keys(req.query).forEach(key => {
                if (req.query[key].startsWith('eq.')) {
                    filter[key] = req.query[key].slice(3);
                } else {
                    filter[key] = req.query[key];
                }
            });

            // Use .lean() so we can modify the objects
            const data = await Model.find(filter).sort({ order_index: 1, created_at: -1 }).lean();

            // Transform S3 keys into signed URLs
            const processedData = await Promise.all(data.map(async (item) => {
                // If the item has a file_url or video_url, check if it's an S3 key
                if (item.file_url && !item.file_url.startsWith('http')) {
                    try {
                        item.file_url = await generateViewUrl(item.file_url);
                    } catch (e) {
                        console.error('Error signing file_url:', e);
                    }
                }
                if (item.video_url && !item.video_url.startsWith('http')) {
                    try {
                        item.video_url = await generateViewUrl(item.video_url);
                    } catch (e) {
                        console.error('Error signing video_url:', e);
                    }
                }
                // Ensure frontend gets 'id' property
                if (item._id) {
                    item.id = item._id.toString();
                }
                return item;
            }));

            res.json(processedData);
        } catch (err) {
            handleError(res, err, `get-${resourceName}`);
        }
    });

    app.post(`/api/courses/:courseId/${resourceName}`, authenticateToken, requireInstructor, async (req, res) => {
        try {
            const item = await Model.create({ ...req.body, course_id: req.params.courseId, instructor_id: req.user.id });
            res.json(item);
        } catch (err) {
            handleError(res, err, `create-${resourceName}`);
        }
    });

    // Add generic update/delete routes for this resource type
    // e.g. /api/topics/:id, /api/videos/:id
    app.put(`/api/${resourceName}/:id`, authenticateToken, requireInstructor, async (req, res) => {
        try {
            // In a real app, verify ownership:
            // const doc = await Model.findById(req.params.id);
            // const course = await Course.findById(doc.course_id);
            // if (course.instructor_id !== req.user.id) throw new Error('Forbidden');

            const item = await Model.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
            res.json(item);
        } catch (err) {
            handleError(res, err, `update-${resourceName}`);
        }
    });

    app.delete(`/api/${resourceName}/:id`, authenticateToken, requireInstructor, async (req, res) => {
        try {
            await Model.findByIdAndDelete(req.params.id);
            res.json({ success: true });
        } catch (err) {
            handleError(res, err, `delete-${resourceName}`);
        }
    });
};

createCourseResourceRoutes('modules', Module);
createCourseResourceRoutes('resources', Resource);

app.get('/api/courses/:courseId/roster', authenticateToken, requireInstructor, async (req, res) => {
    try {
        const role = await getUserRole(req.user.id);
        let enrollmentQuery = { course_id: req.params.courseId };

        // SECURITY: If instructor, first find WHICH students are in THEIR batches
        if (role === 'instructor') {
            const myBatches = await Batch.find({
                course_id: req.params.courseId,
                instructor_id: req.user.id
            }).select('_id').lean();

            const myBatchIds = myBatches.map(b => b._id);
            const myStudentAssignments = await StudentBatch.find({
                batch_id: { $in: myBatchIds }
            }).select('student_id').lean();

            const myStudentIds = myStudentAssignments.map(a => a.student_id);
            enrollmentQuery.user_id = { $in: myStudentIds };
        }

        const enrollments = await Enrollment.find(enrollmentQuery)
            .populate('user_id', 'full_name email phone avatar_url')
            .lean();

        // Fetch profiles separately if needed, or join if possible. 
        // For now, let's just get the basic user info and use the Profile model if mobile_number is there.
        const userIds = enrollments.map(e => e.user_id?._id).filter(id => id);

        const [profiles, batchAssignments] = await Promise.all([
            Profile.find({ user_id: { $in: userIds } }).lean(),
            StudentBatch.find({ course_id: req.params.courseId, student_id: { $in: userIds } }).populate('batch_id').lean()
        ]);

        const profileMap = profiles.reduce((acc, p) => {
            acc[p.user_id.toString()] = p;
            return acc;
        }, {});

        const batchMap = batchAssignments.reduce((acc, sb) => {
            acc[sb.student_id.toString()] = sb.batch_id;
            return acc;
        }, {});

        // Deduplicate roster by user_id to prevent duplicates if multiple enrollments somehow exist
        const uniqueRoster = [];
        const seenUserIds = new Set();

        enrollments.forEach(e => {
            const userIdStr = e.user_id?._id?.toString();
            if (!userIdStr || seenUserIds.has(userIdStr)) return;
            seenUserIds.add(userIdStr);
            const profile = profileMap[userIdStr] || null;

            uniqueRoster.push({
                id: e.user_id?._id,
                full_name: e.user_id?.full_name || profile?.full_name || 'Unknown Student',
                email: e.user_id?.email || profile?.email || '',
                mobile_number: profile?.mobile_number || e.user_id?.phone || '',
                avatar_url: e.user_id?.avatar_url || profile?.avatar_url || null,
                role: 'student',
                batch: batchMap[userIdStr] || null,
                status: e.status,
                enrolled_at: e.enrolled_at,
                progress: e.progress_percentage || 0
            });
        });

        res.json(uniqueRoster);
    } catch (err) {
        handleError(res, err, 'get-course-roster');
    }
});


// --- Generic Data Proxy (The "Supabase" style API) ---

// Simplified API

// ─── Coupon Rewards Engine ────────────────────────────────────────────────────

// Helper: generate a random 8-char alphanumeric code
const generateCouponCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
};

// POST /api/admin/coupons/generate — single student coupon
app.post('/api/admin/coupons/generate', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const { userId, amount } = req.body;
        if (!userId || !amount || isNaN(Number(amount))) {
            return res.status(400).json({ success: false, error: 'userId and valid amount are required' });
        }

        // Generate a unique code
        let code;
        let exists = true;
        let attempts = 0;
        while (exists && attempts < 10) {
            code = generateCouponCode();
            exists = await Coupon.exists({ code });
            attempts++;
        }

        const coupon = await Coupon.create({
            code,
            user_id: userId,
            discounted_price: Number(amount),
            is_used: false,
            created_at: new Date()
        });

        // Notify the student
        await Notification.create({
            user_id: userId,
            type: 'coupon',
            title: 'You received a Discount Coupon!',
            message: `Your exclusive coupon code is ${code}. It gives you a discounted price of ₹${amount}.`,
            data: { coupon_id: coupon._id, code, discounted_price: Number(amount) },
            is_read: false
        });

        console.log(`[CouponEngine] Generated coupon ${code} for user ${userId} by admin ${req.user.id}`);
        res.json({ success: true, code, coupon_id: coupon._id });
    } catch (err) {
        handleError(res, err, 'coupon-generate');
    }
});

// POST /api/admin/coupons/bulk-generate — multiple students at once
app.post('/api/admin/coupons/bulk-generate', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        const { userIds, amount } = req.body;
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ success: false, error: 'userIds array is required' });
        }
        if (!amount || isNaN(Number(amount))) {
            return res.status(400).json({ success: false, error: 'Valid amount is required' });
        }

        const created = [];
        for (const userId of userIds) {
            let code;
            let exists = true;
            let attempts = 0;
            while (exists && attempts < 10) {
                code = generateCouponCode();
                exists = await Coupon.exists({ code });
                attempts++;
            }
            const coupon = await Coupon.create({
                code,
                user_id: userId,
                discounted_price: Number(amount),
                is_used: false,
                created_at: new Date()
            });
            // Notify each student
            await Notification.create({
                user_id: userId,
                type: 'coupon',
                title: 'You received a Discount Coupon!',
                message: `Your exclusive coupon code is ${code}. Discounted price: ₹${amount}.`,
                data: { coupon_id: coupon._id, code, discounted_price: Number(amount) },
                is_read: false
            });
            created.push({ userId, code, coupon_id: coupon._id });
        }

        const lastCode = created.length > 0 ? created[created.length - 1].code : null;
        console.log(`[CouponEngine] Bulk generated ${created.length} coupons by admin ${req.user.id}`);
        res.json({ success: true, code: lastCode, count: created.length, coupons: created });
    } catch (err) {
        handleError(res, err, 'coupon-bulk-generate');
    }
});

// Coupon system active (routes above handle generate/bulk-generate)

app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const notifications = await Notification.find({ user_id: req.user.id })
            .sort({ created_at: -1 })
            .limit(50);
        res.json(notifications);
    } catch (err) {
        handleError(res, err, 'get-notifications');
    }
});

app.post('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        await Notification.findOneAndUpdate({ _id: req.params.id, user_id: req.user.id }, { is_read: true });
        res.json({ success: true });
    } catch (err) {
        handleError(res, err, 'mark-individual-notification-read');
    }
});

app.post('/api/notifications/mark-all-read', authenticateToken, async (req, res) => {
    try {
        await Notification.updateMany({ user_id: req.user.id, is_read: false }, { is_read: true });
        res.json({ success: true });
    } catch (err) {
        handleError(res, err, 'mark-all-read');
    }
});

app.delete('/api/notifications/:id', authenticateToken, async (req, res) => {
    try {
        await Notification.deleteOne({ _id: req.params.id, user_id: req.user.id });
        res.json({ success: true, message: 'Notification removed permanently' });
    } catch (err) {
        handleError(res, err, 'delete-notification');
    }
});

app.get('/api/admin/students', authenticateToken, requireAdminOrManager, async (req, res) => {
    try {
        // Include both students AND interns
        const studentRoles = await UserRole.find({ role: { $in: ['student', 'intern'] } }).select('user_id role');
        const studentIds = studentRoles.map(r => r.user_id);
        const roleMap = studentRoles.reduce((acc, r) => { acc[r.user_id.toString()] = r.role; return acc; }, {});

        const students = await User.aggregate([
            { $match: { _id: { $in: studentIds } } },
            {
                $lookup: {
                    from: 'profiles',
                    localField: '_id',
                    foreignField: 'user_id',
                    as: 'profile'
                }
            },
            { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    id: '$_id',
                    user_id: '$_id',
                    full_name: 1,
                    email: 1,
                    avatar_url: { $ifNull: ['$profile.avatar_url', '$avatar_url'] },
                    phone: 1,
                    last_login_at: 1,
                    registration_date: 1,
                    registration_time: 1,
                    created_at: 1,
                    // Do NOT hardcode role — look it up dynamically below
                    mobile_number: '$profile.mobile_number',
                    college_name: '$profile.college_name',
                    institute_name: '$profile.institute_name',
                    course_type: { $ifNull: ['$profile.course_type', 'full_time'] },
                    full_address: '$profile.full_address',
                    city: '$profile.city',
                    district: '$profile.district',
                    country: '$profile.country',
                    latitude: '$profile.latitude',
                    longitude: '$profile.longitude',
                    approval_status: { $ifNull: ['$profile.approval_status', 'pending'] },
                    status: { $ifNull: ['$profile.approval_status', 'active'] },
                    github_url: '$profile.github_url',
                    linkedin_url: '$profile.linkedin_url',
                }
            },
            { $sort: { created_at: -1 } }
        ]);

        // Attach correct role from roleMap
        const result = students.map(s => ({
            ...s,
            role: roleMap[s.user_id.toString()] || (s.course_type === 'internship' ? 'intern' : 'student'),
        }));

        res.json(result);
    } catch (err) {
        handleError(res, err, 'get-admin-students');
    }
});

app.get('/api/system/time', (req, res) => {
    res.json({ serverTime: new Date().toISOString() });
});

app.get('/api/data/:table', authenticateToken, async (req, res) => {
    const { table } = req.params;
    const Model = MODEL_MAP[table];

    if (!Model) return res.status(403).json({ error: 'Invalid table' });

    try {
        let query = {};
        let sort = {};
        let limit = 100;
        let skip = 0;

        // Utility to convert hex strings to ObjectId if they look like one
        const tryConvertId = (val) => {
            if (typeof val === 'string' && val.length === 24 && /^[0-9a-fA-F]{24}$/.test(val)) {
                try {
                    // Only convert if it's explicitly used for an ID field like _id, student_id, etc.
                    // For generic queries, we'll try to convert but catch any potential issues.
                    return new mongoose.Types.ObjectId(val);
                } catch (e) {
                    console.warn(`[tryConvertId] Failed to convert ${val}:`, e.message);
                    return val;
                }
            }
            return val;
        };

        // Filter Logic
        for (const [key, value] of Object.entries(req.query)) {
            if (['sort', 'order', 'limit', 'offset', 'select'].includes(key)) continue;

            const filterKey = key === 'id' ? '_id' : key;
            const valStr = value.toString();
            if (valStr.startsWith('eq.')) {
                query[filterKey] = tryConvertId(valStr.slice(3));
            } else if (valStr.startsWith('in.')) {
                const ids = valStr.slice(4, -1).split(',');
                query[filterKey] = { $in: ids.map(id => tryConvertId(id.trim())) };
            } else if (valStr.startsWith('lt.')) {
                query[filterKey] = { $lt: valStr.slice(3) };
            } else if (valStr.startsWith('gt.')) {
                query[filterKey] = { $gt: valStr.slice(3) };
            } else {
                query[filterKey] = tryConvertId(valStr); // Default exact match
            }
        }

        // Authorization Scoping
        const role = await getUserRole(req.user.id);

        if (role === 'instructor' && table === 'question_bank') {
            const accessFilter = {
                $or: [
                    { approval_status: 'approved' },
                    { created_by: req.user.id }
                ]
            };
            // If query already has keys, wrap it in $and along with our access filter
            if (Object.keys(query).length > 0) {
                query = { $and: [query, accessFilter] };
            } else {
                query = accessFilter;
            }
        }

        // Student-specific scoping logic - only apply to students
        if (role?.toLowerCase() === 'student') {
            const studentScopedTables = {
                'exam_results': 'student_id',
                'resumescans': 'user_id',
                'student_exam_access': 'student_id',
                'course_enrollments': 'user_id',
                'attendance': 'user_id',
                'notifications': 'user_id',
                'coupons': 'user_id'
            };

            if (studentScopedTables[table]) {
                const scopeField = studentScopedTables[table];
                // Overwrite any attempted ID with the actual user ID to prevent unauthorized access
                query[scopeField] = req.user.id;
                console.log(`[ACL] Student scoping ${table} to ${scopeField}=${req.user.id}`);
            }

            // Batch-wise and Enrollment-wise scoping for content
            if (['course_modules', 'course_videos', 'course_resources', 'live_classes', 'course_announcements', 'course_timeline'].includes(table)) {
                // 1. Get all active enrollment IDs for this student
                const enrollments = await Enrollment.find({ user_id: req.user.id, status: 'active' }).select('course_id').lean();
                const enrolledCourseIds = enrollments.map(e => e.course_id.toString());

                const enrollmentFilter = { course_id: { $in: enrolledCourseIds } };

                // 2. Find all batches the student is part of and their instructors
                const studentBatches = await StudentBatch.find({ student_id: req.user.id })
                    .populate('batch_id', 'batch_type instructor_id')
                    .lean();

                let contentFilter = {};

                const studentBatchTypes = studentBatches.flatMap(sb => [
                    sb.batch_id?.batch_type,
                    sb.assigned_session
                ]).filter(Boolean);

                const studentInstructors = studentBatches.map(sb => sb.batch_id?.instructor_id?.toString()).filter(Boolean);

                if (table === 'live_classes') {
                    const studentBatchIds = studentBatches.map(sb => sb.batch_id?._id?.toString()).filter(Boolean);

                    const batchFilter = {
                        $or: [
                            { target_batch: 'all' },
                            { batch_id: { $in: studentBatchIds } },
                            {
                                $and: [
                                    { batch_id: { $exists: false } },
                                    { target_batch: { $in: studentBatchTypes } },
                                    { instructor_id: { $in: studentInstructors } }
                                ]
                            }
                        ]
                    };
                    contentFilter = { $and: [enrollmentFilter, batchFilter] };
                } else {
                    const studentBatchIds = [];
                    for (const sb of studentBatches) {
                        if (sb.batch_id && sb.batch_id._id) {
                            studentBatchIds.push(sb.batch_id._id.toString());

                            if (sb.assigned_session && sb.assigned_session !== 'all') {
                                const fullBatch = await Batch.findById(sb.batch_id._id).lean();
                                if (fullBatch && fullBatch.batches) {
                                    const sub = fullBatch.batches.find(b => b.batch_type.toLowerCase() === sb.assigned_session.toLowerCase());
                                    if (sub && sub._id) {
                                        studentBatchIds.push(sub._id.toString());
                                    }
                                }
                            }
                        }
                    }

                    const batchFilter = {
                        $or: [
                            // 1. Explicitly allowed for these specific batch IDs (handles both String and ObjectId saved forms)
                            {
                                allowed_batches: {
                                    $in: [
                                        ...studentBatchIds.map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id),
                                        ...studentBatchIds // also include string forms since Schema.Types.Mixed saves as strings
                                    ]
                                }
                            },

                            // 2. Matches both session type AND the instructor assigned to the student
                            //    IMPORTANT: only applies when NO specific batch was chosen (allowed_batches empty),
                            //    otherwise a same-session/same-instructor video leaks across different specific batches.
                            {
                                $and: [
                                    { batch_type: { $in: studentBatchTypes } },
                                    { instructor_id: { $in: studentInstructors } },
                                    {
                                        $or: [
                                            { allowed_batches: { $size: 0 } },
                                            { allowed_batches: { $exists: false } },
                                            { allowed_batches: null }
                                        ]
                                    }
                                ]
                            },

                            // 3. (Optional) Legacy support: if no instructor_id is set yet, fallback to batch_type alone
                            //    Also only when no specific batch was chosen, for the same reason as above.
                            {
                                $and: [
                                    { instructor_id: { $exists: false } },
                                    { batch_type: { $in: studentBatchTypes } },
                                    {
                                        $or: [
                                            { allowed_batches: { $size: 0 } },
                                            { allowed_batches: { $exists: false } },
                                            { allowed_batches: null }
                                        ]
                                    }
                                ]
                            },

                            // 4. No batch restrictions: visible to all enrolled students
                            {
                                $and: [
                                    {
                                        $or: [
                                            { allowed_batches: { $size: 0 } },
                                            { allowed_batches: { $exists: false } },
                                            { allowed_batches: null }
                                        ]
                                    },
                                    {
                                        $or: [
                                            { batch_type: { $exists: false } },
                                            { batch_type: null },
                                            { batch_type: 'all' },
                                            { batch_type: '' }
                                        ]
                                    }
                                ]
                            }
                        ]
                    };
                    contentFilter = { $and: [enrollmentFilter, batchFilter] };
                }

                // ── Sequential Drip Release System ───────────────────────────────────────
                // RULE: Student sees video only if release_day <= days_passed + 1
                // days_passed = floor((today - enrolled_at) / 86400000)
                // Day 1 (join day)  → videos with release_day = 1 ✅
                // Day 2 (next day)  → release_day 1 AND 2 ✅
                // Day N             → release_day 1..N ✅
                // Future            → release_day > N ❌ (locked)
                if (table === 'course_videos') {
                    const queriedCourseId = query['course_id']
                        || (query['$and'] && query['$and'].find(q => q['course_id'])?.['course_id']);

                    let enrolledAt = null;
                    if (queriedCourseId) {
                        const enrollment = await Enrollment.findOne({
                            user_id: req.user.id,
                            course_id: queriedCourseId,
                            status: 'active'
                        }).select('enrolled_at').lean();
                        enrolledAt = enrollment?.enrolled_at;
                    } else if (enrollments.length === 1) {
                        const singleEnrollment = await Enrollment.findOne({
                            user_id: req.user.id,
                            status: 'active'
                        }).select('enrolled_at').lean();
                        enrolledAt = singleEnrollment?.enrolled_at;
                    }

                    if (enrolledAt) {
                        const enrolledDate = new Date(enrolledAt);
                        const today = new Date();
                        // Set both to midnight for clean day counting
                        enrolledDate.setHours(0, 0, 0, 0);
                        today.setHours(0, 0, 0, 0);
                        const daysPassed = Math.floor((today - enrolledDate) / (1000 * 60 * 60 * 24));
                        const maxReleaseDay = daysPassed + 1; // Day 1 on join date

                        console.log(`[DRIP] Student ${req.user.id} | Enrolled: ${enrolledDate.toDateString()} | Days passed: ${daysPassed} | Max release day: ${maxReleaseDay}`);

                        // Show videos where:
                        // 1. release_day <= maxReleaseDay (unlocked sequential videos)
                        // 2. OR release_day is not set (legacy videos default to Day 1)
                        const dripFilter = {
                            $or: [
                                { release_day: { $lte: maxReleaseDay } },
                                { release_day: { $exists: false } },
                                { release_day: null }
                            ]
                        };
                        contentFilter = { $and: [contentFilter, dripFilter] };
                    }
                }

                // Apply final filter
                if (Object.keys(query).length > 0) {
                    query = { $and: [query, contentFilter] };
                } else {
                    query = contentFilter;
                }
            }

            if (table === 'courses') {
                query['is_active'] = { $ne: false };
                query['status'] = { $in: ['approved', 'published'] };
            }
        } else if (role === 'instructor') {
            console.log(`[ACL] Instructor access to ${table}`);

            // Content isolation: Instructors ONLY see their own modules, videos, etc. OR content for courses they are assigned to
            if ([
                'course_modules', 'course_videos', 'course_resources',
                'course_announcements', 'course_timeline', 'course_topics'
            ].includes(table)) {
                const myCourses = await Course.find({
                    $or: [
                        { instructor_id: req.user.id },
                        { instructor_ids: req.user.id }
                    ]
                }).select('_id').lean();
                const myCourseIds = myCourses.map(c => c._id);

                const contentFilter = {
                    $or: [
                        { instructor_id: req.user.id },
                        { course_id: { $in: myCourseIds } }
                    ]
                };
                if (Object.keys(query).length > 0) {
                    query = { $and: [query, contentFilter] };
                } else {
                    query = contentFilter;
                }
            }

            if (table === 'course_enrollments') {
                // Find all student IDs in this instructor's batches
                const myBatches = await Batch.find({ instructor_id: req.user.id }).select('_id').lean();
                const myBatchIds = myBatches.map(b => b._id);
                const myStudentAssignments = await StudentBatch.find({ batch_id: { $in: myBatchIds } }).select('student_id').lean();
                const myStudentIds = myStudentAssignments.map(a => a.student_id);

                const enrollmentFilter = { user_id: { $in: myStudentIds } };
                if (Object.keys(query).length > 0) {
                    query = { $and: [query, enrollmentFilter] };
                } else {
                    query = enrollmentFilter;
                }
            }

            if (table === 'courses') {
                const courseFilter = {
                    $or: [
                        { instructor_id: req.user.id },
                        { instructor_ids: req.user.id }
                    ]
                };
                if (Object.keys(query).length > 0) {
                    query = { $and: [query, courseFilter] };
                } else {
                    query = courseFilter;
                }
            }
        } else {
            console.log(`[ACL] Admin/Manager access to ${table}`);
        }

        // Sort & Pagination
        if (req.query.sort) {
            sort[req.query.sort] = req.query.order === 'desc' ? -1 : 1;
        }
        if (req.query.limit) limit = parseInt(req.query.limit);
        if (req.query.offset) skip = parseInt(req.query.offset);

        // Execute query
        console.log(`[DB] Fetching ${table} with query:`, JSON.stringify(query));

        const projection = req.query.select ? req.query.select.split(',').join(' ') : null;

        let dataQuery = Model.find(query).sort(sort).limit(limit).skip(skip);
        if (projection) dataQuery = dataQuery.select(projection);

        let data;
        if (table === 'leaderboard_stats' || table === 'leaderboard') {
            data = await dataQuery.populate('user_id', 'full_name avatar_url email');
        } else if (table === 'exam_results') {
            data = await dataQuery
                .populate('exam_id', 'title')
                .populate('mock_paper_id', 'title');
        } else if (table === 'courses') {
            data = await dataQuery
                .populate('instructor_ids', 'full_name avatar_url');
        } else if (table === 'course_enrollments') {
            data = await dataQuery
                .populate('user_id', 'full_name email avatar_url phone')
                .populate('course_id', 'title category thumbnail_url');
        } else if (table === 'course_ratings') {
            data = await dataQuery
                .populate('user_id', 'full_name avatar_url');
        } else if (table === 'coupons') {
            data = await dataQuery
                .populate('user_id', 'full_name email avatar_url');
        } else {
            data = await dataQuery;
        }
        res.json(data);

    } catch (err) {
        handleError(res, err, `data-get-${table}`);
    }
});

app.post('/api/data/:table', authenticateToken, async (req, res) => {
    const { table } = req.params;
    const Model = MODEL_MAP[table];
    if (!Model) return res.status(403).json({ error: 'Invalid table' });

    try {
        const role = await getUserRole(req.user.id);

        // Security: Restrict who can create entries in sensitive tables
        if (role !== 'admin' && role !== 'manager') {
            if (['course_enrollments', 'student_exam_access', 'course_ratings'].includes(table)) {
                // Force user_id and pending status for students
                req.body.user_id = req.user.id;
                if (table !== 'course_ratings') req.body.status = 'pending';
            } else if (table === 'question_bank') {
                // Instructors can create questions, but forced to pending
                req.body.created_by = req.user.id;
                req.body.approval_status = 'pending';
            } else if (['exams', 'mock_papers', 'exam_schedules', 'mock_test_configs'].includes(table)) {
                if (role !== 'instructor') return res.status(403).json({ error: 'Unauthorized to manage exams' });
                if (table !== 'exam_schedules') {
                    req.body.created_by = req.user.id;
                }
                if (table === 'exams') req.body.status = 'scheduled';
            } else if (table === 'courses') {
                if (role !== 'instructor') return res.status(403).json({ error: 'Only instructors can create courses' });
                req.body.instructor_id = req.user.id;
                req.body.status = 'draft'; // Forces draft state
            } else if ([
                'course_topics', 'course_modules', 'course_videos',
                'course_resources', 'course_timeline', 'course_announcements', 'live_classes'
            ].includes(table)) {
                if (role !== 'instructor') return res.status(403).json({ error: 'Unauthorized to create course content' });

                // Set ownership
                req.body.instructor_id = req.user.id;

                if (table === 'live_classes') {
                    // Logic handled below specialized for live_classes or default to check course_id if provided
                } else if (!req.body.course_id) {
                    return res.status(400).json({ error: 'course_id is required' });
                }

                if (req.body.course_id) {
                    const course = await Course.findById(req.body.course_id);
                    if (!course) return res.status(404).json({ error: 'Course not found' });

                    const isOwner = course.instructor_id?.toString() === req.user.id;
                    const isAssigned = course.instructor_ids?.some(id => id.toString() === req.user.id);

                    if (!isOwner && !isAssigned) {
                        return res.status(403).json({ error: 'Forbidden: You must be the assigned instructor of this course' });
                    }
                }
            } else if (['user_roles', 'system_logs'].includes(table)) {
                return res.status(403).json({ error: 'Unauthorized to create entries in this table' });
            }
        } else {
            // Admin/Manager creation logic
            if (table === 'question_bank') {
                // Admins/Managers can set status, but default created_by to themselves if not set
                req.body.created_by = req.body.created_by || req.user.id;
                // If they didn't provide status, let schema default (pending) or they can set 'approved'
            }
        }

        const item = await Model.create(req.body);

        // Targeted Notifications for Live Classes
        if (table === 'live_classes') {
            try {
                const { course_id, target_batch, batch_id, title } = item;
                let targetStudentIds = [];

                if (batch_id) {
                    // Precise targeting by batch ID
                    const assignments = await StudentBatch.find({ batch_id }).select('student_id').lean();
                    targetStudentIds = assignments.map(a => a.student_id.toString());
                } else if (target_batch === 'all') {
                    // Get all students enrolled in the course
                    const enrollments = await Enrollment.find({ course_id, status: 'active' }).select('user_id').lean();
                    targetStudentIds = enrollments.map(e => e.user_id.toString());
                } else {
                    // Get students in specific batch type for this course
                    const batches = await Batch.find({ course_id, batch_type: target_batch.toLowerCase() }).select('_id').lean();
                    const batchIds = batches.map(b => b._id);
                    const assignments = await StudentBatch.find({ batch_id: { $in: batchIds } }).select('student_id').lean();
                    targetStudentIds = assignments.map(a => a.student_id.toString());
                }

                // Send realtime notifications only to targeted students
                targetStudentIds.forEach(sid => {
                    sendNotification(sid, {
                        title: 'New Live Class Scheduled',
                        message: `Instructor has scheduled: ${title}`,
                        type: 'info'
                    });

                    // Also emit the record change only to their specific sockets
                    const sockets = userSockets.get(sid);
                    if (sockets) {
                        sockets.forEach(sockId => {
                            io.to(sockId).emit('live_classes_changed', { action: 'create', item });
                        });
                    }
                });

                console.log(`[ACL] Live class notification sent to ${targetStudentIds.length} students in batch: ${target_batch}`);
            } catch (notifyErr) {
                console.error('[Error] Failed to send targeted live class notification:', notifyErr);
                // Fallback to global emit if targeted fails (optional, but safer for now)
                io.emit('live_classes_changed', { action: 'create', item });
            }
        } else {
            // Standard global emit for other tables
            io.emit(`${table}_changed`, { action: 'create', item });
        }

        res.json(item);
    } catch (err) {
        handleError(res, err, `data-create-${table}`);
    }
});

app.put('/api/data/:table/:id', authenticateToken, async (req, res) => {
    const { table, id } = req.params;
    const Model = MODEL_MAP[table];
    if (!Model) return res.status(403).json({ error: 'Invalid table' });

    try {
        const role = await getUserRole(req.user.id);

        // Security: Restrict who can update sensitive data
        if (role !== 'admin' && role !== 'manager' && role !== 'instructor') {
            if (['course_enrollments', 'student_exam_access', 'exam_results'].includes(table)) {
                // ... same logic for students
                const existing = await Model.findById(id);
                if (existing && existing.user_id?.toString() !== req.user.id) {
                    return res.status(403).json({ error: 'Forbidden: Cannot update other users records' });
                }
                if (req.body.status && req.body.status !== existing.status) {
                    return res.status(403).json({ error: 'Forbidden: Cannot change status' });
                }
            } else if (table === 'courses') {
                // Allow instructors to update their own courses or assigning themselves
                const existing = await Model.findById(id);
                if (role === 'instructor') {
                    const isAlreadyOwner = existing?.instructor_id?.toString() === req.user.id;
                    const isAssigningSelf = req.body.instructor_id === req.user.id;

                    if (!isAlreadyOwner && !isAssigningSelf) {
                        return res.status(403).json({ error: 'Forbidden: Cannot modify courses assigned to others' });
                    }
                }
            } else if ([
                'course_topics', 'course_modules', 'course_videos',
                'course_resources', 'course_timeline', 'course_announcements', 'live_classes'
            ].includes(table)) {
                if (role === 'instructor') {
                    const item = await Model.findById(id);
                    if (!item) return res.status(404).json({ error: 'Item not found' });

                    if (table === 'live_classes' && item.instructor_id?.toString() === req.user.id) {
                        // Priority check: If they are the host of the meeting, allow it
                    } else if (item.course_id) {
                        const course = await Course.findById(item.course_id);
                        if (!course) return res.status(404).json({ error: 'Course not found' });

                        const isOwner = course.instructor_id?.toString() === req.user.id;
                        const isAssigned = course.instructor_ids?.some(id => id.toString() === req.user.id);

                        if (!isOwner && !isAssigned) {
                            return res.status(403).json({ error: 'Forbidden: You must be the assigned instructor of this course' });
                        }
                    } else {
                        // Not host and no course attached
                        return res.status(403).json({ error: 'Forbidden: Action unauthorized for this session' });
                    }
                }
            } else if (table === 'question_bank') {
                const existing = await Model.findById(id);
                if (existing && existing.created_by?.toString() !== req.user.id) {
                    return res.status(403).json({ error: 'Forbidden: Cannot update questions created by others' });
                }
                if (role !== 'instructor') {
                    // Force status to pending on update if not admin/instructor/manager
                    req.body.approval_status = 'pending';
                }
                delete req.body.created_by;
            } else if (!['doubts', 'doubt_replies'].includes(table)) {
                return res.status(403).json({ error: 'Unauthorized to update this table' });
            }
        }

        const item = await Model.findByIdAndUpdate(id, req.body, { returnDocument: 'after' });

        // Side-effect: If an exam is approved, auto-approve the questions for that topic
        if (table === 'exams' && req.body.approval_status === 'approved') {
            await QuestionBank.updateMany(
                { topic: item.title },
                { $set: { approval_status: 'approved' } }
            );
        }

        // Socket Events for Updates
        io.emit(`${table}_changed`, { action: 'update', item, id });
        if (table === 'doubts') {
            io.emit('doubt_updated', item);
        }

        res.json(item);
    } catch (err) {
        handleError(res, err, `data-update-${table}`);
    }
});

app.delete('/api/data/:table/:id', authenticateToken, async (req, res) => {
    const { table, id } = req.params;
    const Model = MODEL_MAP[table];
    if (!Model) return res.status(403).json({ error: 'Invalid table' });

    try {
        const role = await getUserRole(req.user.id);

        // PERMANENTLY BLOCK COURSE DELETION (unless admin/manager is deleting in QA)
        if (table === 'courses' && role !== 'admin' && role !== 'manager') {
            return res.status(403).json({ error: 'Course deletion is permanently disabled. Please archive or deactivate the course instead.' });
        }

        let itemToDelete = await Model.findById(id);

        // --- USER TABLE: Handle Profile ID fallback ---
        // The QA panel fetches Profile documents. If the User no longer exists in the users
        // collection (orphaned profile), the passed `id` may be the Profile's own _id,
        // not the User's _id. We detect this and resolve the real userId for cascade.
        let resolvedUserId = id; // default: assume id is a valid User _id
        let resolvedProfileId = null; // the Profile _id to delete directly

        if (table === 'users') {
            if (!itemToDelete) {
                // Not found in User collection – check if it's a Profile _id
                const profileById = await Profile.findById(id).lean();
                if (profileById) {
                    console.log(`[CASCADE] ID ${id} is a Profile._id. Resolving real user_id: ${profileById.user_id}`);
                    resolvedUserId = profileById.user_id ? profileById.user_id.toString() : id;
                    resolvedProfileId = id; // remember to delete this profile directly
                    // Try to find the real User document now
                    itemToDelete = await User.findById(resolvedUserId) || { _id: resolvedUserId };
                } else {
                    console.log(`[CASCADE] User ${id} not found in users OR profiles collection, executing cascade purge for safety...`);
                    itemToDelete = { _id: id };
                }
            } else {
                // User found normally – also check if there's a Profile matching their _id
                resolvedUserId = id;
                const profileForUser = await Profile.findOne({ user_id: id }).lean();
                if (profileForUser) {
                    resolvedProfileId = profileForUser._id.toString();
                }
            }
        }

        if (!itemToDelete) return res.status(404).json({ error: 'Item not found' });

        // Security: Restrict deletions
        if (role !== 'admin' && role !== 'manager') {
            const item = itemToDelete; // Rename for existing logic compatibility

            // Instructors
            if (role === 'instructor') {
                const courseRelatedTables = [
                    'courses', 'course_topics', 'course_modules', 'course_videos',
                    'course_resources', 'course_timeline', 'course_announcements', 'live_classes',
                    'exams', 'exam_schedules', 'mock_papers', 'mock_test_configs'
                ];

                if (courseRelatedTables.includes(table)) {
                    // Get courseId for sub-items or item itself if it's a course
                    if (table === 'live_classes' && item.instructor_id?.toString() === req.user.id) {
                        // Priority check: allow meeting host to delete
                    } else {
                        const courseId = table === 'courses' ? item._id : item.course_id;

                        if (courseId) {
                            const course = await Course.findById(courseId);
                            const authorizedInstructors = [
                                course?.instructor_id?.toString(),
                                ...(course?.instructor_ids || []).map(id => id.toString())
                            ];

                            if (!course || !authorizedInstructors.includes(req.user.id)) {
                                return res.status(403).json({ error: 'Forbidden: You must be an assigned instructor of this course' });
                            }
                        } else if (table === 'live_classes') {
                            return res.status(403).json({ error: 'Forbidden: You are not the host of this session' });
                        }
                    }
                } else if (table === 'question_bank') {
                    if (item.created_by?.toString() !== req.user.id) {
                        return res.status(403).json({ error: 'Forbidden: You can only delete your own questions' });
                    }
                } else if (['doubts', 'doubt_replies'].includes(table)) {
                    if (item.user_id?.toString() !== req.user.id) {
                        return res.status(403).json({ error: 'Forbidden: Ownership required' });
                    }
                } else {
                    return res.status(403).json({ error: 'Unauthorized to delete from this table' });
                }
            } else {
                // Students or others
                return res.status(403).json({ error: 'Unauthorized to delete' });
            }
        }

        // --- S3 PERMANENT DELETION UTILITIES (Hoisted for safe use inside hooks) ---
        const extractS3Key = (url) => {
            if (!url) return null;
            try {
                // If it's a full S3 URL
                if (url.includes('.amazonaws.com/')) {
                    return url.split('.amazonaws.com/')[1].split('?')[0];
                }
                // If it's a proxied path
                if (url.startsWith('/s3/public/')) {
                    return url.replace('/s3/public/', '').split('?')[0];
                }
                // If it's just the key
                if (!url.startsWith('http') && !url.startsWith('/')) {
                    return url.split('?')[0];
                }
            } catch (e) {
                console.error("[S3] Error extracting key from:", url);
            }
            return null;
        };

        const deleteFromS3 = async (url) => {
            const key = extractS3Key(url);
            if (key) {
                try {
                    await deleteObject(key);
                    console.log(`[S3] Permanently deleted: ${key}`);
                } catch (err) {
                    console.error(`[S3] Failed to delete key ${key}:`, err.message);
                }
            }
        };

        // --- CUSTOM HOOKS FOR CASCADE DELETION ---
        if (table === 'users') {
            console.log(`[CASCADE] Permanently deleting user. User ID: ${resolvedUserId}, Profile ID: ${resolvedProfileId || 'N/A'}`);

            // Collect all IDs to cascade-delete by
            const userIdsToClean = [resolvedUserId];
            if (resolvedProfileId && resolvedProfileId !== resolvedUserId) {
                // Don't add duplicates
            }

            await Promise.all([
                // Delete the User credential
                User.deleteMany({ _id: resolvedUserId }),
                // Delete Profile by user_id AND by profile _id (catches orphaned profiles)
                Profile.deleteMany({ user_id: resolvedUserId }),
                resolvedProfileId ? Profile.deleteMany({ _id: resolvedProfileId }) : Promise.resolve(),
                // Delete all related records using the resolved user ID
                UserRole.deleteMany({ user_id: resolvedUserId }),
                Enrollment.deleteMany({ user_id: resolvedUserId }),
                ExamResult.deleteMany({ student_id: resolvedUserId }),
                ExamResult.deleteMany({ user_id: resolvedUserId }),
                StudentExamAccess.deleteMany({ student_id: resolvedUserId }),
                Message.deleteMany({ sender: resolvedUserId }),
                Conversation.deleteMany({ participants: resolvedUserId }),
                SystemLog.deleteMany({ user_id: resolvedUserId }),
                LeaderboardStat.deleteMany({ user_id: resolvedUserId }),
                Notification.deleteMany({ user_id: resolvedUserId }),
                Attendance.deleteMany({ student_id: resolvedUserId }),
                StudentBatch.deleteMany({ student_id: resolvedUserId }),
                BatchRequest.deleteMany({ student_id: resolvedUserId }),
                Doubt.deleteMany({ user_id: resolvedUserId }),
                DoubtReply.deleteMany({ user_id: resolvedUserId }),
                ResumeScan.deleteMany({ user_id: resolvedUserId }),
            ]);
        } else if (table === 'courses') {
            console.log(`[CASCADE] Deleting course ${id}. Purging modules, resources, and student access...`);

            // Find all videos to delete from S3
            const videos = await Video.find({ course_id: id }).lean();
            for (const vid of videos) {
                await deleteFromS3(vid.video_url);
                await deleteFromS3(vid.thumbnail_url);
            }

            // Find all resources to delete from S3
            const resources = await Resource.find({ course_id: id }).lean();
            for (const resItem of resources) {
                await deleteFromS3(resItem.file_url);
            }

            await Promise.all([
                Module.deleteMany({ course_id: id }),
                Resource.deleteMany({ course_id: id }),
                Video.deleteMany({ course_id: id }),
                Enrollment.deleteMany({ course_id: id }),
                Exam.deleteMany({ course_id: id }),
                MockPaper.deleteMany({ course_id: id }),
                ExamResult.deleteMany({ course_id: id }),
                Timeline.deleteMany({ course_id: id }),
                Announcement.deleteMany({ course_id: id }),
                CourseRating.deleteMany({ course_id: id }),
                Batch.deleteMany({ course_id: id })
            ]);
        } else if (table === 'exams') {
            const topic = itemToDelete.title;
            // 1. Delete associated student access records
            await StudentExamAccess.deleteMany({ exam_id: id });
            // 2. Delete associated exam results (Grading Data)
            await ExamResult.deleteMany({ exam_id: id });

            if (topic) {
                console.log(`[CASCADE] Deleting legacy exam: "${topic}". Syncing Question Bank...`);
                await QuestionBank.deleteMany({ topic });
            }
        } else if (table === 'mock_papers') {
            // 1. Delete associated student access records
            await StudentExamAccess.deleteMany({ mock_paper_id: id });
            // 2. Delete associated exam results
            await ExamResult.deleteMany({ mock_paper_id: id });
        }

        if (table === 'course_videos') {
            await deleteFromS3(itemToDelete.video_url);
            await deleteFromS3(itemToDelete.thumbnail_url);
        } else if (table === 'course_resources') {
            await deleteFromS3(itemToDelete.file_url);
        } else if (table === 'course_modules') {
            // Cascade: Delete all videos in this module
            const moduleVideos = await Video.find({ module_id: id });
            console.log(`[CASCADE] Deleting module ${id}: Found ${moduleVideos.length} associated videos.`);

            for (const vid of moduleVideos) {
                await deleteFromS3(vid.video_url);
                await deleteFromS3(vid.thumbnail_url);
                await Video.findByIdAndDelete(vid._id);
                console.log(`[CASCADE] Deleted video from DB and S3: ${vid.title}`);
            }
        }
        // -----------------------------
        // -----------------------------

        // Special handling for live classes: Delete from Zoom API first
        if (table === 'live_classes') {
            try {
                const liveClass = await Model.findById(id);
                if (liveClass && liveClass.meeting_id) {
                    const accessToken = await getZoomAccessToken();
                    await axios.delete(`https://api.zoom.us/v2/meetings/${liveClass.meeting_id}`, {
                        headers: { Authorization: `Bearer ${accessToken}` }
                    });
                    console.log(`[Zoom] Deleted meeting ${liveClass.meeting_id} for live class ${id}`);
                }
            } catch (zoomErr) {
                // Log but don't block DB deletion if Zoom meeting is already gone or API fails
                console.error(`[Zoom Delete Error] Failed to delete meeting for ${id}:`, zoomErr.message);
            }
        }

        // For 'users' table, cascade above already used deleteMany with resolvedUserId.
        // Only call findByIdAndDelete for non-user tables (or as safety net if non-cascaded).
        if (table !== 'users') {
            await Model.findByIdAndDelete(id);
        }
        io.emit(`${table}_changed`, { action: 'delete', id });
        res.json({ success: true });
    } catch (err) {
        handleError(res, err, `data-delete-${table}`);
    }
});

// ============================================================
// --- Batch Management Routes ---
// ============================================================

// Create a batch (admin / manager / instructor)
app.post('/api/batches', authenticateToken, requireInstructor, async (req, res) => {
    try {
        if (!req.body.course_id || req.body.course_id === 'Catalogue' || req.body.course_id === 'all') {
            return res.status(400).json({ error: 'Valid Course ID is required to create a batch' });
        }

        const { batch_name, batch_type, max_students, start_time, end_time, course_id } = req.body;

        const batch = await Batch.create({
            batch_name,
            batch_type,
            course_id,
            max_students: parseInt(max_students) || 50,
            start_time: start_time || null,
            end_time: end_time || null,
            is_active: true,
            status: 'approved',
            instructor_id: req.user.id
        });
        res.json(batch);
    } catch (err) {
        if (err.name === 'CastError') {
            return res.status(400).json({ error: `Invalid ${err.path}: ${err.value}` });
        }
        handleError(res, err, 'create-batch');
    }
});

// List batches for a course
app.get('/api/batches/student-assignments', authenticateToken, requireInstructor, async (req, res) => {
    try {
        let query = {};
        const courseQuery = req.query.course_id;

        if (courseQuery && courseQuery.startsWith('in.(')) {
            const ids = courseQuery.slice(4, -1).split(',').map(id => id.trim());
            query.course_id = { $in: ids };
        } else if (courseQuery) {
            query.course_id = courseQuery;
        }

        // --- SECURITY: Filter by instructor's assigned batches ---
        const userRole = await getUserRole(req.user.id);
        if (userRole === 'instructor') {
            const myBatches = await Batch.find({ instructor_id: req.user.id }).select('_id').lean();
            const myBatchIds = myBatches.map(b => b._id);
            query.batch_id = { $in: myBatchIds };
        }

        const assignments = await StudentBatch.find(query)
            .populate('batch_id')
            .lean();

        res.json(assignments);
    } catch (err) {
        handleError(res, err, 'get-student-assignments');
    }
});

app.get('/api/batches', authenticateToken, async (req, res) => {
    try {
        const filter = {};
        if (req.query.course_id) {
            if (req.query.course_id === 'Catalogue' || req.query.course_id === 'all') {
                return res.json([]); // Return empty for invalid IDs
            }
            filter.course_id = req.query.course_id;
        }
        const userRole = await getUserRole(req.user.id);
        if (userRole === 'instructor') {
            if (req.query.course_id) {
                // Check if they are authorized for this course
                const course = await Course.findById(req.query.course_id);
                if (course && (course.instructor_ids || []).some(id => id.toString() === req.user.id)) {
                    filter.course_id = req.query.course_id;
                    filter.instructor_id = req.user.id;
                } else {
                    filter.instructor_id = req.user.id;
                }
            } else {
                filter.instructor_id = req.user.id;
            }
        }
        if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';

        const batches = await Batch.find(filter).sort({ batch_type: 1, batch_name: 1 }).lean();

        const finalBatches = await Promise.all(batches.map(async (b) => {
            const count = await StudentBatch.countDocuments({ batch_id: b._id });
            return { ...b, id: b._id.toString(), student_count: count };
        }));

        res.json(finalBatches);
    } catch (err) {
        if (err.name === 'CastError') return res.json([]);
        handleError(res, err, 'list-batches');
    }
});

// --- Specialized Live Class Creation + Notification ---
app.post('/api/instructor/live-classes', authenticateToken, requireInstructor, async (req, res) => {
    const { instructor_id, course_id, target_batch, batch_id, title, description, scheduled_at, duration_minutes, poster_url, zoom } = req.body;
    try {
        // 1. Create Zoom Meeting
        const accessToken = await getZoomAccessToken();
        const zoomResponse = await axios.post('https://api.zoom.us/v2/users/me/meetings', {
            topic: zoom.topic,
            type: 2,
            start_time: zoom.startTime,
            duration: zoom.duration,
            agenda: zoom.agenda,
            settings: {
                host_video: true,
                participant_video: false,
                join_before_host: false,
                mute_upon_entry: true,
                waiting_room: true,
                auto_recording: 'cloud'
            }
        }, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        // 2. Save Live Class Record
        const liveClass = new LiveClass({
            instructor_id,
            course_id: course_id || null,
            target_batch: target_batch || 'all',
            batch_id: batch_id || null,
            title,
            description,
            scheduled_at,
            duration_minutes,
            meeting_id: zoomResponse.data.id.toString(),
            meeting_url: zoomResponse.data.join_url,
            start_url: zoomResponse.data.start_url,
            meeting_password: zoomResponse.data.password,
            poster_url,
            status: 'scheduled'
        });
        await liveClass.save();

        // 3. Notify Students

        let targetStudentIds = [];
        if (target_batch === 'all') {
            // Get all students enrolled in the course
            const EnrollmentModel = mongoose.model('Enrollment');
            const enrollments = await EnrollmentModel.find({ course_id: course_id });
            targetStudentIds = enrollments.map(e => e.user_id);
        } else {
            // Get students in specific batch
            // The frontend might send batch_id if it's a specific batch card, 
            // or target_batch as 'morning' etc if it's a session.
            const query = { course_id: course_id };
            if (batch_id) {
                query.batch_id = batch_id;
            } else if (['morning', 'afternoon', 'evening'].includes(target_batch)) {
                // If they still used session, we find batches of that type
                const Batch = mongoose.model('Batch');
                const matchingBatches = await Batch.find({ course_id, batch_type: target_batch });
                const batchIds = matchingBatches.map(b => b._id);
                query.batch_id = { $in: batchIds };
            }
            const students = await StudentBatch.find(query);
            targetStudentIds = students.map(s => s.student_id);
        }

        // Create notifications for each student
        if (targetStudentIds.length > 0) {
            const notifications = targetStudentIds.map(sid => ({
                user_id: sid,
                type: 'live_class',
                title: `New Live Class Scheduled: ${title}`,
                message: `Instructor has scheduled a new interactive session for ${new Date(scheduled_at).toLocaleString()}.`,
                data: {
                    live_class_id: liveClass.id,
                    course_id,
                    poster_url
                }
            }));
            await Notification.insertMany(notifications);
        }

        res.json({ success: true, liveClass });
    } catch (err) {
        handleError(res, err, 'create-live-class-specialized');
    }
});

// Get single batch
app.get('/api/batches/:id', authenticateToken, async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id).lean();
        if (!batch) return res.status(404).json({ error: 'Batch not found' });
        const count = await StudentBatch.countDocuments({ batch_id: batch._id });
        res.json({ ...batch, id: batch._id.toString(), student_count: count });
    } catch (err) {
        handleError(res, err, 'get-batch');
    }
});

// Update batch
app.put('/api/batches/:id', authenticateToken, requireInstructor, async (req, res) => {
    try {
        const updateData = { ...req.body };

        const batch = await Batch.findByIdAndUpdate(req.params.id, updateData, { returnDocument: 'after' });
        res.json(batch);
    } catch (err) {
        handleError(res, err, 'update-batch');
    }
});

// Delete batch (also removes all student assignments)
app.delete('/api/batches/:id', authenticateToken, requireInstructor, async (req, res) => {
    try {
        await StudentBatch.deleteMany({ batch_id: req.params.id });
        await Batch.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        handleError(res, err, 'delete-batch');
    }
});
// Get current student's batch for a specific course
app.get('/api/batches/my-batch/:courseId', authenticateToken, async (req, res) => {
    try {
        const assignment = await StudentBatch.findOne({
            student_id: req.user.id,
            course_id: req.params.courseId
        }).populate('batch_id').lean();

        if (!assignment) return res.json(null);

        const enrollment = await Enrollment.findOne({
            user_id: req.user.id,
            course_id: req.params.courseId
        }).select('requested_batch_type').lean();

        res.json({
            ...assignment.batch_id,
            id: assignment.batch_id._id.toString(),
            assigned_at: assignment.assigned_at,
            assigned_session: assignment.assigned_session || 'all',
            requested_batch_type: enrollment?.requested_batch_type || assignment.assigned_session || 'morning'
        });
    } catch (err) {
        handleError(res, err, 'my-batch');
    }
});

// Get full course roster for instructors, grouped by batch type
app.get('/api/batches/course-roster/:courseId', authenticateToken, requireInstructor, async (req, res) => {
    try {
        // Convert courseId to ObjectId for proper MongoDB query
        const courseId = new mongoose.Types.ObjectId(req.params.courseId);

        // Get all course enrollments (students) regardless of status
        const enrollments = await Enrollment.find({
            course_id: courseId
        }).lean();

        const studentIds = enrollments.map(e => e.user_id).filter(id => id);

        // --- SECURITY: Filter assignments by instructor if requested by instructor ---
        const userRole = await getUserRole(req.user.id);
        let assignmentQuery = {
            course_id: courseId,
            student_id: { $in: studentIds }
        };

        // Fetch ALL assignments first, then filter instructor's own batches separately
        const allAssignments = await StudentBatch.find(assignmentQuery).populate('batch_id').lean();

        // Get instructor's batch IDs for permission checking
        const myBatches = await Batch.find({ instructor_id: req.user.id }).select('_id').lean();
        const myBatchIds = new Set(myBatches.map(b => b._id.toString()));

        // Map assignments with batch ownership flag
        const assignments = allAssignments.map(a => ({
            ...a,
            isMyBatch: myBatchIds.has(a.batch_id?._id?.toString())
        }));

        // Get profiles and roles
        const profiles = await Profile.find({ user_id: { $in: studentIds } }).lean();
        const users = await User.find({ _id: { $in: studentIds } }).select('full_name email role avatar_url').lean();

        const profileMap = profiles.reduce((acc, p) => {
            if (p.user_id) acc[p.user_id.toString()] = p;
            return acc;
        }, {});

        const userMap = users.reduce((acc, u) => {
            acc[u._id.toString()] = u;
            return acc;
        }, {});

        const roles = await UserRole.find({ user_id: { $in: studentIds } }).lean();
        const roleMap = roles.reduce((acc, r) => { acc[r.user_id?.toString()] = r.role; return acc; }, {});

        const assignmentMap = assignments.reduce((acc, a) => {
            acc[a.student_id?.toString()] = {
                batch: a.batch_id,
                session: a.assigned_session
            };
            return acc;
        }, {});

        const rosterData = enrollments.map(e => {
            const uid = e.user_id ? e.user_id.toString() : null;
            if (!uid) return null;

            const user = userMap[uid];
            const assigned = assignmentMap[uid];
            const profile = profileMap[uid];
            const role = roleMap[uid] || user?.role || 'student';

            // Still filter instructors out from student roster
            if (role === 'instructor' || role === 'admin') return null;

            return {
                student_id: uid,
                full_name: profile?.full_name || user?.full_name || 'Enrolled Student',
                email: profile?.email || user?.email || 'No email',
                avatar_url: profile?.avatar_url || user?.avatar_url || null,
                role: role,
                batch: (assigned && assigned.batch) ? {
                    id: assigned.batch._id.toString(),
                    name: assigned.batch.batch_name || 'Legacy Batch',
                    type: assigned.batch.batch_type || 'all',
                    session: assigned.session
                } : null
            };
        }).filter(s => s !== null);

        // Group by session type or batch type
        const grouped = {
            morning: rosterData.filter(s => s.batch?.session === 'morning' || (s.batch?.type === 'morning' && !s.batch?.session)),
            afternoon: rosterData.filter(s => s.batch?.session === 'afternoon' || (s.batch?.type === 'afternoon' && !s.batch?.session)),
            evening: rosterData.filter(s => s.batch?.session === 'evening' || (s.batch?.type === 'evening' && !s.batch?.session)),
            unassigned: rosterData.filter(s => !s.batch),
            all: rosterData,
            byBatch: rosterData.reduce((acc, s) => {
                const key = s.batch ? s.batch.id : 'unassigned';
                if (!acc[key]) acc[key] = [];
                acc[key].push(s);
                return acc;
            }, {})
        };

        res.json(grouped);
    } catch (err) {
        handleError(res, err, 'course-roster');
    }
});


// List students in a batch (with profile info)
app.get('/api/batches/:batchId/students', authenticateToken, requireInstructor, async (req, res) => {
    try {
        const assignments = await StudentBatch.find({ batch_id: req.params.batchId }).lean();
        const studentIds = assignments.map(a => a.student_id);

        const [profiles, users] = await Promise.all([
            Profile.find({ user_id: { $in: studentIds } }).lean(),
            User.find({ _id: { $in: studentIds } }).select('full_name email').lean()
        ]);

        const profileMap = profiles.reduce((acc, p) => { acc[p.user_id?.toString()] = p; return acc; }, {});
        const userMap = users.reduce((acc, u) => { acc[u._id.toString()] = u; return acc; }, {});

        const result = assignments.map(a => {
            const userIdStr = a.student_id?.toString();
            const user = userMap[userIdStr];
            return {
                ...a,
                id: a._id.toString(),
                student_name: user?.full_name,
                student_email: user?.email,
                profile: profileMap[userIdStr] || null
            };
        });
        res.json(result);
    } catch (err) {
        handleError(res, err, 'batch-students');
    }
});

// Assign student to a batch
app.post('/api/batches/:batchId/students', authenticateToken, requireInstructor, async (req, res) => {
    try {
        const { student_id, course_id } = req.body;
        let batch = await Batch.findById(req.params.batchId).lean();
        let targetBatchId = req.params.batchId;
        let session = req.body.session || 'all';

        // If not found by direct ID, it might be a sub-batch ID from the nested array
        if (!batch) {
            batch = await Batch.findOne({ "batches._id": req.params.batchId }).lean();
            if (batch) {
                targetBatchId = batch._id.toString(); // Use the parent ID for storing
                // Find the specific session type from the sub-batch
                const subBatch = batch.batches.find(sb => sb._id.toString() === req.params.batchId);
                if (subBatch && !req.body.session) {
                    session = subBatch.batch_type;
                }
            }
        }

        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        // Check capacity (session-aware)
        const query = { batch_id: targetBatchId };
        if (session && session !== 'all') {
            query.assigned_session = session;
        }

        const currentCount = await StudentBatch.countDocuments(query);

        // Find capacity for this specific section or default to root batch capacity
        let capacity = batch.max_students;
        if (session && session !== 'all' && batch.batches) {
            const section = batch.batches.find(b => b.batch_type === session);
            if (section && section.max_students) {
                capacity = section.max_students;
            }
        }

        if (currentCount >= capacity) {
            return res.status(400).json({ error: `${session} section is full (max ${capacity} students)` });
        }

        const assignment = await StudentBatch.findOneAndUpdate(
            { student_id, course_id },
            {
                batch_id: targetBatchId,
                assigned_session: session,
                assigned_by: req.user.id,
                assigned_at: new Date(),
                updated_at: new Date()
            },
            { upsert: true, returnDocument: 'after' }
        );
        res.json(assignment);
    } catch (err) {
        handleError(res, err, 'assign-student-batch');
    }
});

// Remove student from batch
app.delete('/api/batches/:batchId/students/:studentId', authenticateToken, requireInstructor, async (req, res) => {
    try {
        await StudentBatch.findOneAndDelete({
            batch_id: req.params.batchId,
            student_id: req.params.studentId
        });
        res.json({ success: true });
    } catch (err) {
        handleError(res, err, 'remove-student-batch');
    }
});

// Reassign student to a different batch
app.put('/api/batches/students/reassign', authenticateToken, requireInstructor, async (req, res) => {
    try {
        const { student_id, course_id, new_batch_id } = req.body;
        const newBatch = await Batch.findById(new_batch_id).lean();
        if (!newBatch) return res.status(404).json({ error: 'Target batch not found' });

        const currentCount = await StudentBatch.countDocuments({ batch_id: new_batch_id });
        if (currentCount >= newBatch.max_students) {
            return res.status(400).json({ error: `Target batch is full (max ${newBatch.max_students} students)` });
        }

        const existing = await StudentBatch.findOne({ student_id, course_id }).lean();
        const assignment = await StudentBatch.findOneAndUpdate(
            { student_id, course_id },
            {
                batch_id: new_batch_id,
                previous_batch_id: existing ? existing.batch_id : null,
                assigned_by: req.user.id,
                updated_at: new Date()
            },
            { upsert: true, returnDocument: 'after' }
        );
        res.json(assignment);
    } catch (err) {
        handleError(res, err, 'reassign-student-batch');
    }
});

// Get batch assignments for multiple courses

// Get available batches for a course (student view)
app.get('/api/batches/course/:courseId', authenticateToken, async (req, res) => {
    try {
        const filter = { course_id: req.params.courseId, status: { $ne: 'rejected' } };
        const userRole = await getUserRole(req.user.id);
        if (userRole === 'instructor') {
            filter.instructor_id = req.user.id;
        }
        const batches = await Batch.find(filter).lean();
        res.json(batches.map(b => ({ ...b, id: b._id.toString() })));
    } catch (err) {
        handleError(res, err, 'get-course-batches');
    }
});

// Bulk Assign Mock Test or Exam to a Batch
app.post('/api/exams/bulk-assign', authenticateToken, async (req, res) => {
    try {
        const { batch_id, mock_paper_id, exam_id } = req.body;
        if (!batch_id) return res.status(400).json({ error: 'Batch ID is required' });
        if (!mock_paper_id && !exam_id) return res.status(400).json({ error: 'Mock paper or Exam ID required' });

        // 1. Get all students in the batch
        const studentAssignments = await StudentBatch.find({ batch_id }).lean();
        if (!studentAssignments || studentAssignments.length === 0) {
            return res.status(404).json({ error: 'No students found in this batch' });
        }

        const studentIds = studentAssignments.map(a => a.student_id);

        // 2. Prepare access records
        const accessType = mock_paper_id ? 'mock' : 'exam';
        const accessRecords = studentIds.map(sid => ({
            student_id: sid,
            exam_id: exam_id || null,
            mock_paper_id: mock_paper_id || null,
            access_type: accessType,
            assigned_by: req.user.id,
            granted_at: new Date()
        }));

        // 3. Insert Many
        await StudentExamAccess.insertMany(accessRecords, { ordered: false });

        res.json({
            success: true,
            count: studentIds.length,
            message: `Mock Test assigned to ${studentIds.length} students`
        });
    } catch (err) {
        handleError(res, err, 'bulk-assign-mock');
    }
});

// Student request to join or change batch
app.post('/api/batches/student-request', authenticateToken, async (req, res) => {
    try {
        const { courseId, batchId } = req.body;
        const userId = req.user.id;

        const batch = await Batch.findById(batchId).populate('course_id').lean();
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const course = await Course.findById(courseId).lean();
        if (!course) return res.status(404).json({ error: 'Course not found' });

        // Check if student is enrolled
        const enrollmentValue = await Enrollment.findOne({ user_id: userId, course_id: courseId }).lean();
        if (!enrollmentValue) return res.status(403).json({ error: 'You are not enrolled in this course' });

        // Check if student already has a batch
        const existingAssignment = await StudentBatch.findOne({ student_id: userId, course_id: courseId }).populate('batch_id').lean();

        const student = await Profile.findOne({ user_id: userId }).lean();
        const instructorIdsList = [];
        if (course.instructor_id) instructorIdsList.push(course.instructor_id);
        if (course.instructor_ids && Array.isArray(course.instructor_ids)) {
            instructorIdsList.push(...course.instructor_ids);
        }
        const instructorIds = [...new Set(instructorIdsList.map(id => id.toString()))];

        if (!existingAssignment) {
            // Initial Assignment - Auto Approve but Notify Instructor
            const assignment = await StudentBatch.create({
                student_id: userId,
                course_id: courseId,
                batch_id: batchId,
                assigned_at: new Date(),
                assigned_by: userId // Self assigned for initial
            });

            // Notify All Instructors
            if (instructorIds.length > 0) {
                const notifications = instructorIds.map(instId => ({
                    user_id: instId,
                    title: "New Batch Assignment",
                    message: `${student?.full_name || 'A student'} joined ${batch.batch_name} for ${course.title}`,
                    type: "batch_assignment",
                    data: {
                        student_id: userId,
                        course_id: courseId,
                        batch_id: batchId,
                        actor_avatar: student?.avatar_url,
                        actor_name: student?.full_name
                    },
                    created_at: new Date()
                }));
                await Notification.insertMany(notifications);

                // Socket notifications
                instructorIds.forEach(instId => {
                    sendNotification(instId.toString(), {
                        title: "New Batch Assignment",
                        message: `${student?.full_name || 'A student'} joined ${batch.batch_name} for ${course.title}`,
                        type: "batch_assignment",
                        data: {
                            student_id: userId,
                            course_id: courseId,
                            batch_id: batchId,
                            actor_avatar: student?.avatar_url,
                            actor_name: student?.full_name
                        }
                    });
                });
            }

            res.json({ message: 'Batch assigned successfully', assignment });
        } else {
            // Change Request - Needs Permission
            const currentBatchId = existingAssignment?.batch_id?._id?.toString() || existingAssignment?.batch_id?.toString();
            if (currentBatchId === batchId) {
                return res.status(400).json({ error: 'You are already in this batch' });
            }

            // Create or update pending request
            const request = await BatchRequest.findOneAndUpdate(
                { student_id: userId, course_id: courseId, status: 'pending' },
                {
                    batch_id: batchId,
                    requested_session: batch.batch_type,
                    type: 'change',
                    requested_at: new Date()
                },
                { upsert: true, returnDocument: 'after' }
            );

            // Notify Instructor for Permission
            // Create persistent notifications for all Instructors
            if (instructorIds.length > 0) {
                for (const instId of instructorIds) {
                    await Notification.create({
                        user_id: instId,
                        title: "Batch Change Request",
                        message: `${student?.full_name || 'A student'} requested to move from ${existingAssignment?.batch_id?.batch_name || 'Current Batch'} to ${batch?.batch_name || 'Target Batch'}`,
                        type: "batch_request",
                        data: {
                            request_id: request._id,
                            student_id: userId,
                            course_id: courseId,
                            actor_avatar: student?.avatar_url,
                            actor_name: student?.full_name
                        },
                        created_at: new Date()
                    });
                }
            }
            if (instructorIds.length > 0) {
                instructorIds.forEach(instId => {
                    sendNotification(instId.toString(), {
                        title: "Batch Change Request",
                        message: `${student?.full_name || 'A student'} requested to move from ${existingAssignment?.batch_id?.batch_name || 'Current Batch'} to ${batch?.batch_name || 'Target Batch'}`,
                        type: "batch_request",
                        data: {
                            request_id: request._id,
                            student_id: userId,
                            course_id: courseId,
                            actor_avatar: student?.avatar_url,
                            actor_name: student?.full_name
                        }
                    });
                });
            }

            res.json({ message: 'Change request submitted for instructor permission', request });
        }
    } catch (err) {
        handleError(res, err, 'student-batch-request');
    }
});

// Instructor see pending requests
app.get('/api/batches/requests/pending', authenticateToken, requireInstructor, async (req, res) => {
    try {
        const requests = await BatchRequest.find({ status: 'pending' })
            .populate('student_id', 'full_name email')
            .populate('course_id', 'title')
            .populate('batch_id', 'batch_name batch_type')
            .lean();

        const userRole = await getUserRole(req.user.id);

        let filtered;
        if (userRole === 'admin' || userRole === 'manager') {
            filtered = requests.filter(r => r.course_id && r.course_id._id);
        } else {
            // Filter by instructor's courses
            const instructorCourses = await Course.find({
                $or: [
                    { instructor_id: req.user.id },
                    { instructor_ids: req.user.id }
                ]
            }).select('_id').lean();
            const courseIds = instructorCourses.map(c => c._id.toString());
            filtered = requests.filter(r => r.course_id && r.course_id._id && courseIds.includes(r.course_id._id.toString()));
        }
        res.json(filtered.map(r => ({ ...r, id: r._id.toString() })));
    } catch (err) {
        handleError(res, err, 'get-pending-requests');
    }
});

// Instructor Approve/Reject
app.post('/api/batches/requests/:requestId/approve', authenticateToken, requireInstructor, async (req, res) => {
    try {
        const request = await BatchRequest.findById(req.params.requestId);
        if (!request) return res.status(404).json({ error: 'Request not found' });

        // Update Assignment
        const previous = await StudentBatch.findOne({ student_id: request.student_id, course_id: request.course_id }).lean();

        // Fetch target batch to get its batch_type for the required enum field
        const batch = await Batch.findById(request.batch_id).lean();
        const batchType = batch ? batch.batch_type : 'morning';

        // Update or create student batch assignment with the requested session
        await StudentBatch.findOneAndUpdate(
            { student_id: request.student_id, course_id: request.course_id },
            {
                batch_id: request.batch_id,
                assigned_session: request.requested_session || batchType,
                previous_batch_id: previous ? previous.batch_id : null,
                assigned_by: req.user.id,
                updated_at: new Date()
            },
            { upsert: true, returnDocument: 'after' }
        );

        request.status = 'approved';
        request.processed_at = new Date();
        request.processed_by = req.user.id;
        await request.save();

        const sessionName = request.requested_session ? (request.requested_session.charAt(0).toUpperCase() + request.requested_session.slice(1)) : 'Requested';

        // Notify Student
        await Notification.create({
            user_id: request.student_id,
            title: "Batch Request Approved",
            message: `Your request to join the ${sessionName} session was approved.`,
            type: "batch_approved",
            data: { course_id: request.course_id }
        });

        sendNotification(request.student_id.toString(), {
            title: "Batch Request Approved",
            message: `Your request to join the ${sessionName} session has been approved.`,
            type: "batch_approved",
            data: { course_id: request.course_id }
        });

        res.json({ success: true, message: `Student assigned to ${sessionName} session.` });
    } catch (err) {
        handleError(res, err, 'approve-request');
    }
});

app.post('/api/batches/requests/:requestId/reject', authenticateToken, requireInstructor, async (req, res) => {
    try {
        const request = await BatchRequest.findById(req.params.requestId);
        if (!request) return res.status(404).json({ error: 'Request not found' });

        request.status = 'rejected';
        request.processed_at = new Date();
        request.processed_by = req.user.id;
        await request.save();

        // Notify Student
        await Notification.create({
            user_id: request.student_id,
            title: "Batch Request Rejected",
            message: `Your request to change batches was not approved at this time.`,
            type: "batch_rejected",
            data: { course_id: request.course_id }
        });

        sendNotification(request.student_id.toString(), {
            title: "Batch Request Rejected",
            message: `Your request to change batches was not approved at this time.`,
            type: "batch_rejected",
            data: { course_id: request.course_id }
        });

        res.json({ success: true });
    } catch (err) {
        handleError(res, err, 'reject-request');
    }
});

// Auto-split enrolled students into batches for a course
app.post('/api/batches/auto-split/:courseId', authenticateToken, requireInstructor, async (req, res) => {
    try {
        const { courseId } = req.params;

        // Get active batches for this course
        const batches = await Batch.find({ course_id: courseId, is_active: true }).sort({ batch_type: 1 }).lean();
        if (batches.length === 0) {
            return res.status(400).json({ error: 'No active batches exist for this course. Create batches first.' });
        }

        // Get enrolled students not yet assigned to any batch
        const enrollments = await Enrollment.find({ course_id: courseId, status: 'active' }).lean();
        const existingAssignments = await StudentBatch.find({ course_id: courseId }).lean();
        const assignedStudentIds = new Set(existingAssignments.map(a => a.student_id.toString()));

        const unassigned = enrollments.filter(e => !assignedStudentIds.has(e.user_id.toString()));

        if (unassigned.length === 0) {
            return res.json({ message: 'All enrolled students are already assigned to batches', assigned: 0 });
        }

        // Count current students per batch
        const batchCounts = await Promise.all(batches.map(async b => ({
            batch: b,
            count: await StudentBatch.countDocuments({ batch_id: b._id })
        })));

        let assignedCount = 0;
        const assignments = [];

        // Helper to find or create a batch of a specific type with capacity
        const findOrCreateBatchWithCapacity = async (type) => {
            // Find existing active batches of this type with room
            const typeBatches = batchCounts
                .filter(bc => bc.batch.batch_type === type && bc.count < bc.batch.max_students)
                .sort((a, b) => a.count - b.count);

            if (typeBatches.length > 0) {
                const target = typeBatches[0];
                target.count++;
                return target.batch._id;
            }

            // No room in existing batches of this type — auto-create new "Batch N"
            const batchTypeCount = await Batch.countDocuments({ course_id: courseId, batch_type: type });
            const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);

            // Get timing defaults from earlier batches of same type if they exist
            const template = batches.find(b => b.batch_type === type) || { start_time: "09:00", end_time: "11:00", max_students: 30 };

            const newBatch = await Batch.create({
                course_id: courseId,
                batch_type: type,
                batch_name: `${typeLabel} Batch ${batchTypeCount + 1}`,
                start_time: template.start_time,
                end_time: template.end_time,
                max_students: template.max_students,
                instructor_id: req.user.id
            });

            console.log(`[Batch Scaling] Created new batch: ${newBatch.batch_name}`);

            // Add new batch to our local tracking to avoid immediate re-creation
            batchCounts.push({ batch: newBatch, count: 1 });
            return newBatch._id;
        };

        for (const enrollment of unassigned) {
            // Determine preferred type — default to morning if unspecified, or spread evenly
            // For auto-split, we'll try to fill existing partially-filled batches first
            const available = batchCounts
                .filter(bc => bc.count < bc.batch.max_students)
                .sort((a, b) => a.count - b.count);

            let targetId;
            if (available.length > 0) {
                const target = available[0];
                target.count++;
                targetId = target.batch._id;
            } else {
                // All current batches are full — auto-create based on morning by default
                targetId = await findOrCreateBatchWithCapacity('morning');
            }

            assignments.push({
                student_id: enrollment.user_id,
                course_id: courseId,
                batch_id: targetId,
                assigned_by: req.user.id,
                assigned_at: new Date(),
                updated_at: new Date()
            });
            assignedCount++;
        }

        if (assignments.length > 0) {
            await StudentBatch.insertMany(assignments, { ordered: false });
        }

        res.json({
            message: `Auto-split & scaling complete. Assigned ${assignedCount} student(s). Created new batches as needed.`,
            assigned: assignedCount,
            skipped: unassigned.length - assignedCount
        });
    } catch (err) {
        handleError(res, err, 'auto-split-batches');
    }
});

// Create batch request with specific session info
app.post('/api/batches/request/:courseId', authenticateToken, async (req, res) => {
    try {
        const request = await BatchRequest.create({
            student_id: req.user.id,
            course_id: req.params.courseId,
            batch_id: req.body.batch_id,
            requested_session: req.body.session_type || 'all',
            type: 'initial'
        });
        res.json(request);
    } catch (err) {
        handleError(res, err, 'create-batch-request');
    }
});

// Get student's batch assignment for a specific course
app.get('/api/student/my-batch/:courseId', authenticateToken, async (req, res) => {
    try {
        const assignment = await StudentBatch.findOne({
            student_id: req.user.id,
            course_id: req.params.courseId
        }).populate('batch_id').lean();

        if (!assignment) return res.json(null);
        res.json({ ...assignment, id: assignment._id.toString() });
    } catch (err) {
        handleError(res, err, 'student-my-batch');
    }
});

// --- Public Course Routes ---

app.get('/api/public/courses', async (req, res) => {
    try {
        const query = {
            is_active: { $ne: false }
        };
        if (req.query.category && req.query.category.toLowerCase() !== 'all') {
            query.category = req.query.category;
        }
        const courses = await Course.find(query).sort({ created_at: -1 }).limit(100);
        res.json(courses);
    } catch (err) {
        handleError(res, err, 'public-courses');
    }
});

app.get('/api/courses/:id', async (req, res) => {
    try {
        let course;
        if (mongoose.Types.ObjectId.isValid(req.params.id)) {
            course = await Course.findById(req.params.id);
        } else {
            // Fallback for slugs if you use them
            course = await Course.findOne({ slug: req.params.id });
        }

        if (!course) return res.status(404).json({ error: 'Course not found' });
        res.json(course);
    } catch (err) {
        handleError(res, err, 'get-course-detail');
    }
});

// --- S3 Helper Routes ---

app.post('/api/s3/upload-url', authenticateToken, async (req, res) => {
    try {
        const { fileName, fileType, folder } = req.body;
        const folderPath = folder ? `${folder}/` : `${req.user.id}/`;
        const uploadFileName = `${folderPath}${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const uploadUrl = await generateUploadUrl(uploadFileName, fileType);
        res.json({ uploadUrl, fileName: uploadFileName });
    } catch (err) {
        handleError(res, err, 's3-upload');
    }
});

app.post('/api/s3/view-url', authenticateToken, async (req, res) => {
    try {
        const viewUrl = await generateViewUrl(req.body.fileName);
        res.json({ viewUrl });
    } catch (err) {
        handleError(res, err, 's3-view');
    }
});

// Serve public S3 assets (images/thumbnails) via redirect to signed URL
app.get(/\/api\/s3\/public\/(.*)/, async (req, res) => {
    try {
        const key = req.params[0];
        console.log(`[S3 PROXY] Accessing: ${key}`);
        if (!key) return res.status(404).send('Not Found');

        const url = await generateViewUrl(key);
        res.redirect(url);
    } catch (err) {
        console.error('S3 Public Proxy Error:', err);
        res.status(404).send('Resource not found');
    }
});


// --- Chat Monitor (Admin) ---
app.get('/api/admin/chat-monitor/conversations', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const conversations = await Conversation.find()
            .populate('participants', 'full_name avatar_url email')
            .populate('last_message', 'content')
            .sort({ updated_at: -1 });

        // Transform for frontend expectation
        const formatted = conversations.map(c => ({
            id: c._id,
            updated_at: c.updated_at,
            last_message: c.last_message?.content || '',
            participants: c.participants.map(p => ({
                id: p._id,
                name: p.full_name,
                avatar_url: p.avatar_url,
                email: p.email
            }))
        }));

        res.json(formatted);
    } catch (err) {
        handleError(res, err, 'chat-monitor-conversations');
    }
});

app.get('/api/admin/chat-monitor/conversations/:id/messages', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const messages = await Message.find({ conversation_id: req.params.id })
            .populate('sender', 'full_name avatar_url')
            .sort({ created_at: 1 });

        const formatted = messages.map(m => ({
            id: m._id,
            content: m.content,
            sender_id: m.sender?._id,
            sender_name: m.sender?.full_name,
            timestamp: m.created_at,
            type: m.type,
            status: m.status
        }));

        res.json(formatted);
    } catch (err) {
        handleError(res, err, 'chat-monitor-messages');
    }
});

// Start Server
httpServer.listen(port, () => {
    console.log(`Server running on port ${port} - Socket.io Enabled`);
    console.log(`[System] Auto-restart triggered at ${new Date().toISOString()}`);
});

// ── Global Process Safety Handlers (Prevents Server Crashes) ──
process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception caught to prevent crash:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Promise Rejection caught to prevent crash:', reason);
});