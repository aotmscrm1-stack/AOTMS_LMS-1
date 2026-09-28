const mongoose = require('mongoose');
require('dotenv').config({ path: __dirname + '/../.env' });

async function inspectProfiles() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const Profile = mongoose.model('Profile', new mongoose.Schema({}, { strict: false }));
        const profiles = await Profile.find().limit(20).lean();
        console.log(`Found ${profiles.length} total sample profiles.`);
        profiles.forEach((p, idx) => {
            console.log(`\n--- Profile #${idx+1} ---`);
            console.log("Keys:", Object.keys(p));
            console.log("full_name:", p.full_name);
            console.log("email:", p.email);
            console.log("role:", p.role);
            console.log("approval_status:", p.approval_status);
            console.log("course:", p.course);
            console.log("course_id:", p.course_id);
            console.log("course_title:", p.course_title);
            console.log("batch:", p.batch);
            console.log("batch_id:", p.batch_id);
            console.log("batch_name:", p.batch_name);
        });
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

inspectProfiles();
