const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },
    full_name: { type: String },
    avatar_url: { type: String },
    phone: { type: String },
    failed_login_attempts: { type: Number, default: 0 },
    last_login_ip: { type: String },
    last_login_at: { type: Date },
    registration_date: { type: String },
    registration_time: { type: String },
    created_at: { type: Date, default: Date.now }
});

// Transform _id to id
UserSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) { ret.id = ret._id; delete ret._id; delete ret.password_hash; }
});

const ProfileSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true }, // Changed to ObjectId reference
    email: { type: String },
    full_name: { type: String },
    avatar_url: { type: String },
    mobile_number: { type: String },
    college_name: { type: String }, // User requested
    institute_name: { type: String }, // User requested
    course_type: { type: String, default: 'full_time' },
    github_url: { type: String },
    linkedin_url: { type: String },
    title: { type: String },
    description: { type: String },
    social_handles: { type: String },
    global_experience: { type: String },
    impact: { type: String },
    core_expertise: { type: String },
    bio: { type: String },
    resume_url: { type: String },
    ats_credits: { type: Number, default: 3 }, // Added for resume scans
    approval_status: { type: String, default: 'pending' }, // pending, approved, suspended
    suspended_until: { type: Date }, // For account suspension timers
    city: { type: String },
    district: { type: String },
    country: { type: String },
    full_address: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
    registration_date: { type: String },
    registration_time: { type: String },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date }
});
ProfileSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (doc, ret) => { ret.id = ret.user_id; delete ret._id; } });

const ResumeScanSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    score: { type: Number, required: true },
    analysis: { type: Object, required: true },
    resume_url: { type: String },
    file_name: { type: String },
    created_at: { type: Date, default: Date.now, index: true }
}, { collection: 'resumescans' });
ResumeScanSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (doc, ret) => { ret.id = ret._id; delete ret._id; } });


const UserRoleSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    role: { type: String, default: 'student' }, // student, instructor, manager, admin
    updated_at: { type: Date, default: Date.now }
});
UserRoleSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (doc, ret) => { ret.id = ret.user_id; delete ret._id; } });

const OTPSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true }, // acts as ID
    otp: { type: String, required: true },
    full_name: { type: String },
    expires_at: { type: Date, required: true },
    failed_attempts: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now }
});

const VerifiedEmailSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    verified: { type: Boolean, default: false },
    verified_at: { type: Date }
});

module.exports = {
    User: mongoose.model('User', UserSchema),
    Profile: mongoose.model('Profile', ProfileSchema, 'profiles'),
    UserRole: mongoose.model('UserRole', UserRoleSchema, 'user_roles'),
    OTP: mongoose.model('OTP', OTPSchema),
    VerifiedEmail: mongoose.model('VerifiedEmail', VerifiedEmailSchema),
    ResumeScan: mongoose.model('ResumeScan', ResumeScanSchema, 'resumescans')
};