const mongoose = require('mongoose');
require('dotenv').config({ path: __dirname + '/../.env' });

const { Course, Enrollment } = require('../models/Course');
const { Batch, StudentBatch } = require('../models/Batch');

async function syncExistingApprovedProfiles() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const Profile = mongoose.model('Profile', new mongoose.Schema({}, { strict: false }));

        // Find all profiles that have course_title, course_id, batch_name or batch set
        const profiles = await Profile.find({
            $or: [
                { course_title: { $exists: true, $ne: null, $ne: "" } },
                { course_id: { $exists: true, $ne: null } },
                { batch_name: { $exists: true, $ne: null, $ne: "" } },
                { batch: { $exists: true, $ne: null, $ne: "" } }
            ]
        }).lean();

        console.log(`Found ${profiles.length} profiles with course/batch metadata.`);

        let syncedEnrollments = 0;
        let syncedBatches = 0;

        for (const p of profiles) {
            const userId = p.user_id || p._id;
            if (!userId) continue;

            const uObjId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
            const cId = p.course_id;
            const cTitle = p.course_title;
            const bName = p.batch_name || p.batch;

            let targetCourse = null;
            if (cId && mongoose.Types.ObjectId.isValid(cId)) {
                targetCourse = await Course.findById(cId).lean();
            }
            if (!targetCourse && cTitle) {
                targetCourse = await Course.findOne({
                    $or: [
                        { title: cTitle },
                        { title: new RegExp('^' + cTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }
                    ]
                }).lean();
            }

            if (targetCourse) {
                // Upsert into course_enrollments
                await Enrollment.findOneAndUpdate(
                    { user_id: uObjId, course_id: targetCourse._id },
                    {
                        $set: {
                            user_id: uObjId,
                            course_id: targetCourse._id,
                            status: 'active',
                            updated_at: new Date()
                        },
                        $setOnInsert: {
                            progress_percentage: 0,
                            enrolled_at: new Date()
                        }
                    },
                    { upsert: true, new: true }
                );
                syncedEnrollments++;

                // Upsert into student_batches if batch is specified
                if (bName) {
                    let targetBatch = await Batch.findOne({
                        course_id: targetCourse._id,
                        $or: [
                            { batch_name: bName },
                            { batch_name: new RegExp('^' + bName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }
                        ]
                    }).lean();

                    if (!targetBatch) {
                        targetBatch = await Batch.findOne({
                            $or: [
                                { batch_name: bName },
                                { batch_name: new RegExp('^' + bName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }
                            ]
                        }).lean();
                    }

                    if (targetBatch) {
                        await StudentBatch.findOneAndUpdate(
                            { student_id: uObjId, course_id: targetCourse._id },
                            {
                                $set: {
                                    student_id: uObjId,
                                    course_id: targetCourse._id,
                                    batch_id: targetBatch._id,
                                    updated_at: new Date()
                                },
                                $setOnInsert: {
                                    assigned_at: new Date()
                                }
                            },
                            { upsert: true, new: true }
                        );
                        syncedBatches++;
                    }
                }
            }
        }

        console.log(`Sync complete! Synced ${syncedEnrollments} enrollments and ${syncedBatches} student batches.`);
        process.exit(0);
    } catch (err) {
        console.error("Sync error:", err);
        process.exit(1);
    }
}

syncExistingApprovedProfiles();
