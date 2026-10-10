const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { v4: uuidv4 } = require('uuid');

const ExamSchema = new Schema({
    uuid: { type: String, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String },
    exam_type: { type: String, default: 'mock' },
    course_id: { type: Schema.Types.ObjectId, ref: 'Course' }, 
    target_batches: [{ type: Schema.Types.ObjectId, ref: 'Batch' }], // Link to specific batches for tracking
    duration_minutes: { type: Number, required: true },
    total_marks: { type: Number, required: true },
    passing_marks: { type: Number, required: true },
    negative_marking: { type: Number, default: 0 },
    max_attempts: { type: Number, default: 1 },
    scheduled_date: { type: Date, index: true },
    shuffle_questions: { type: Boolean, default: true },
    show_results: { type: Boolean, default: true },
    proctoring_enabled: { type: Boolean, default: false },
    browser_security: { type: Boolean, default: false },
    assigned_image: { type: String },
    status: { type: String, default: 'scheduled', index: true }, // scheduled, active, completed, cancelled
    approval_status: { type: String, default: 'pending', index: true }, // pending, approved, rejected
    total_questions: { type: Number, default: 0 },
    topics: [String],
    ai_generated: { type: Boolean, default: false },
    source_topic: { type: String },
    created_by: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    is_active: { type: Boolean, default: true },
    custom_fields: [{ label: String, value: String }],
    created_at: { type: Date, default: Date.now, index: true },
    updated_at: { type: Date }
});


ExamSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (doc, ret) => { ret.id = ret._id; delete ret._id; } });

const QuestionBankSchema = new Schema({
    topic: { type: String, required: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    question_text: { type: String, required: true },
    options: [{ text: String, is_correct: Boolean }], // Array of options
    correct_answer: { type: String }, // Stored answer for T/F, Short, etc.
    type: { 
        type: String, 
        enum: ['multiple_choice', 'true_false', 'subjective', 'short_answer', 'long_answer', 'fill_blank', 'coding', 'practical'], 
        default: 'multiple_choice' 
    },
    language: { type: String, default: 'javascript' }, // For coding type questions
    input_format: { type: String },
    output_format: { type: String },
    explanation: { type: String },
    constraints: { type: String },
    sample_input: { type: String },
    sample_output: { type: String },
    test_cases: [{
        input: { type: String },
        expected_output: { type: String },
        explanation: { type: String },
        weight: { type: Number, default: 1 },
        is_hidden: { type: Boolean, default: false }
    }],
    marks: { type: Number, default: 1 },
    course_id: { type: Schema.Types.ObjectId, ref: 'Course' }, // Optional course link
    approval_status: { type: String, default: 'pending' }, // pending, approved, rejected
    created_by: { type: Schema.Types.ObjectId, ref: 'User' },
    created_at: { type: Date, default: Date.now, index: true },
    updated_at: { type: Date }
});
QuestionBankSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (doc, ret) => { ret.id = ret._id; delete ret._id; } });

// Exam Schedule removed

const StudentExamAccessSchema = new Schema({
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    exam_id: { type: Schema.Types.ObjectId, ref: 'Exam' }, // Nullable if mock
    mock_paper_id: { type: Schema.Types.ObjectId, ref: 'MockPaper' }, // Nullable if exam
    question_bank_topic: { type: String }, // Optional access to QB
    access_type: { type: String, default: 'exam' }, // exam, mock, question_bank
    assigned_by: { type: Schema.Types.ObjectId, ref: 'User' }, // Instructor/Manager
    scheduled_date: { type: Date }, // Time-gated access
    granted_at: { type: Date, default: Date.now, index: true }
});
StudentExamAccessSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (doc, ret) => { ret.id = ret._id; delete ret._id; } });

const ExamResultSchema = new Schema({
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    exam_id: { type: Schema.Types.ObjectId, ref: 'Exam' },
    mock_paper_id: { type: Schema.Types.ObjectId, ref: 'MockPaper' },
    course_id: { type: Schema.Types.ObjectId, ref: 'Course' }, // Link to course for instructor access
    test_title: { type: String, required: true }, // Captured at submission
    questions_snapshot: [new Schema({
        question_id: { type: Schema.Types.ObjectId, ref: 'QuestionBank' },
        question_text: { type: String },
        type: { type: String },
        correct_answer: { type: String },
        marks: { type: Number },
        earned_marks: { type: Number, default: 0 },
        student_answer: { type: String },
        coding_evaluation: { type: Schema.Types.Mixed }
    }, { _id: false })],
    objective_score: { type: Number, default: 0 },
    score: { type: Number, required: true },
    total_questions: { type: Number },
    percentage: { type: Number },
    answers: { type: Map, of: String }, // Map of questionId -> studentAnswer
    subjective_grading: { type: Map, of: Schema.Types.Mixed }, // { questionId: { marks, feedback, rubrics: { crit1: true } } }
    grading_status: { type: String, enum: ['graded', 'pending', 'reevaluation'], default: 'graded' },
    feedback_audio_url: { type: String },
    global_feedback: { type: String },
    is_reevaluation_requested: { type: Boolean, default: false },
    reevaluation_reason: { type: String },
    time_spent: { type: Number }, // seconds
    submitted_at: { type: Date, default: Date.now, index: true }
});
ExamResultSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (doc, ret) => { ret.id = ret._id; delete ret._id; } });

const MockPaperSchema = new Schema({
    title: { type: String, required: true },
    description: { type: String },
    created_by: { type: Schema.Types.ObjectId, ref: 'User' },
    questions: [{ type: Schema.Types.ObjectId, ref: 'QuestionBank' }], // References to questions
    created_at: { type: Date, default: Date.now, index: true }
});
MockPaperSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (doc, ret) => { ret.id = ret._id; delete ret._id; } });

// Exam Rule removed

const MockTestConfigSchema = new Schema({
    title: { type: String, required: true },
    description: { type: String },
    course_id: { type: Schema.Types.ObjectId, ref: 'Course' },
    topics: [String],
    question_count: { type: Number, default: 0 },
    duration_minutes: { type: Number, default: 60 },
    difficulty_mix: { type: Map, of: Number }, // easy: 30, medium: 40, hard: 30
    is_active: { type: Boolean, default: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'User' },
    created_at: { type: Date, default: Date.now, index: true }
});
MockTestConfigSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (doc, ret) => { ret.id = ret._id; delete ret._id; } });

ExamSchema.pre('save', async function() {
    if (!this.uuid) {
        this.uuid = uuidv4();
    }
});

module.exports = {
    Exam: mongoose.model('Exam', ExamSchema, 'exam_schedulings'),
    QuestionBank: mongoose.model('QuestionBank', QuestionBankSchema),
    StudentExamAccess: mongoose.model('StudentExamAccess', StudentExamAccessSchema, 'Grant_access'),
    ExamResult: mongoose.model('ExamResult', ExamResultSchema),
    MockPaper: mongoose.model('MockPaper', MockPaperSchema),
    MockTestConfig: mongoose.model('MockTestConfig', MockTestConfigSchema)
};
