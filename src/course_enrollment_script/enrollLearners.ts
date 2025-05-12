import fs from 'fs';
import { getUserId } from './services/authService';
import parseCsv from "../services/csv";
import { enrollInCourse, getBatchList } from './services/courseService';
import { courseConfig } from './config/courseConfig';
import path from 'path';
import { getAuthToken } from '../services/authService';

interface CourseMapping {
    [key: string]: { [nodeId: string]: string };
}

interface BatchMapping {
    [key: string]: { [nodeId: string]: string | null };
}

interface NodeIdToCodeMapping {
    [nodeId: string]: string;
}

interface EnrollmentResult {
    userId: string;
    learnerProfile: string;
    courseCode: string;
    status: 'Success' | 'Failure' | 'Skipped';
    reason: string;
}

interface LearnerProfileStatus {
    learnerProfileCode: string;
    learnerProfile: string;
    courseCode: string;
    expiryDate: string;
    status: string;
    reason: string;
}

function parseLearnerProfileCodes(code: string): string[] {
    // Remove any quotes and split by comma
    return code.replace(/"/g, '').split(',').map(c => c.trim()).filter(c => c);
}

async function processEnrollments() {
    // Check if required environment variables are set
    if (!process.env.COURSE_MAPPING || !process.env.BATCH_MAPPING || !process.env.NODEID_TO_CODE_MAPPING) {
        console.error('Error: Required environment variables COURSE_MAPPING, BATCH_MAPPING, and NODEID_TO_CODE_MAPPING are not set.');
        console.error('Please run the learner profile creation script first and use the provided command.');
        process.exit(1);
    }

    // Check if learner profile status file exists
    const learnerProfileStatusPath = path.join(__dirname, '..', 'reports', 'learner-profile-status.csv');
    if (!fs.existsSync(learnerProfileStatusPath)) {
        console.error('Error: learner-profile-status.csv not found. Please run the learner profile creation script first.');
        process.exit(1);
    }

    // Read learner profile status
    const learnerProfileStatusRows = await parseCsv(learnerProfileStatusPath);
    const learnerProfileStatusData = learnerProfileStatusRows.slice(1);
    const learnerProfileStatus = new Map<string, LearnerProfileStatus>();
    
    // Create a map of learner profile statuses
    for (const row of learnerProfileStatusData) {
        const status: LearnerProfileStatus = {
            learnerProfileCode: row[0],
            learnerProfile: row[1],
            courseCode: row[2],
            expiryDate: row[3],
            status: row[4],
            reason: row[5]
        };
        // Only consider successfully created profiles
        if (status.status === 'Success') {
            learnerProfileStatus.set(status.learnerProfileCode, status);
        }
    }

    await getAuthToken()
    const rows = await parseCsv(courseConfig.userLearnerPath);
    const dataRows = rows.slice(1);
    const headerRow = ['userId', 'learnerProfile', 'courseCode', 'enrollmentStatus', 'reason'];
    const results: EnrollmentResult[] = [];

    // Load the mappings from environment variables
    let currentMapping: CourseMapping;
    let batchMapping: BatchMapping;
    let nodeIdToCodeMapping: NodeIdToCodeMapping;
    
    try {
        currentMapping = JSON.parse(process.env.COURSE_MAPPING);
        batchMapping = JSON.parse(process.env.BATCH_MAPPING);
        nodeIdToCodeMapping = JSON.parse(process.env.NODEID_TO_CODE_MAPPING);
        
        // Debug: Log the mappings
        console.log('\nLoaded Course Mappings:');
        Object.entries(currentMapping).forEach(([profile, courses]) => {
            console.log(`  ${profile}: ${Object.keys(courses).length} courses`);
        });
        
        console.log('\nLoaded Batch Mappings:');
        Object.entries(batchMapping).forEach(([profile, batches]) => {
            console.log(`  ${profile}: ${Object.keys(batches).length} batches`);
        });
        console.log('\n');
    } catch (error) {
        console.error('Error parsing mappings from environment variables:', error);
        process.exit(1);
    }

    // Track which courses each user has been enrolled in
    const userEnrollments = new Map<string, Set<string>>();

    for (const record of dataRows) {
        const email = record[0];
        const learnerProfileCodes = parseLearnerProfileCodes(record[1]);
        console.log(`Processing enrollments for user: ${email} with profiles: ${learnerProfileCodes.join(', ')}`);

        try {
            // Get auth token for the user
            const { userId, accessToken } = await getUserId(email);

            // Initialize set of enrolled courses for this user
            if (!userEnrollments.has(email)) {
                userEnrollments.set(email, new Set());
            }

            // Track if any profile was successfully processed
            let anyProfileSuccess = false;

            // Process each learner profile for this user
            for (const learnerProfileCode of learnerProfileCodes) {
                console.log(`  Processing learner profile: ${learnerProfileCode}`);

                // Check if this learner profile was successfully created
                const profileStatus = learnerProfileStatus.get(learnerProfileCode);
                if (!profileStatus) {
                    console.log(`  Learner profile ${learnerProfileCode} was not successfully created, skipping...`);
                    results.push({
                        userId: email,
                        learnerProfile: learnerProfileCode,
                        courseCode: 'none',
                        status: 'Skipped',
                        reason: 'Learner profile does not exist'
                    });
                    continue;
                }

                // Get course mappings for this learner profile
                const courseMap = currentMapping[learnerProfileCode];
                if (!courseMap || Object.keys(courseMap).length === 0) {
                    console.log(`  No course mappings found for profile ${learnerProfileCode}`);
                    results.push({
                        userId: email,
                        learnerProfile: learnerProfileCode,
                        courseCode: 'none',
                        status: 'Failure',
                        reason: 'No course codes found for the given learner code'
                    });
                    continue;
                }

                // Debug: Log the course mappings for this profile
                console.log(`  Found ${Object.keys(courseMap).length} courses for profile ${learnerProfileCode}:`);
                Object.entries(courseMap).forEach(([nodeId, courseName]) => {
                    const courseCode = nodeIdToCodeMapping[nodeId] || 'unknown';
                    console.log(`    - ${courseCode} (${nodeId})`);
                });

                // Track if this profile had any successful enrollments
                let profileSuccess = false;

                // Perform enrollments for each course
                for (const [nodeId, courseName] of Object.entries(courseMap)) {
                    const courseCode = nodeIdToCodeMapping[nodeId] || 'unknown';
                    
                    // Skip if user is already enrolled in this course
                    if (userEnrollments.get(email)?.has(nodeId)) {
                        console.log(`    User already enrolled in course ${courseCode} (${nodeId})`);
                        results.push({
                            userId: email,
                            learnerProfile: learnerProfileCode,
                            courseCode: courseCode,
                            status: 'Skipped',
                            reason: 'User has already enrolled to this course'
                        });
                        continue;
                    }

                    // Get batch ID for the course
                    const batchId = await getBatchList(nodeId);
                    if (!batchId) {
                        console.log(`    No batch found for course ${courseCode} (${nodeId})`);
                        results.push({
                            userId: email,
                            learnerProfile: learnerProfileCode,
                            courseCode: courseCode,
                            status: 'Failure',
                            reason: 'No batch found for course'
                        });
                        continue;
                    }

                    try {
                        await enrollInCourse(nodeId, batchId, userId, accessToken);
                        console.log(`    Enrolled in course ${courseCode} (${nodeId}), batch ${batchId}`);
                        // Mark course as enrolled for this user
                        userEnrollments.get(email)?.add(nodeId);
                        results.push({
                            userId: email,
                            learnerProfile: learnerProfileCode,
                            courseCode: courseCode,
                            status: 'Success',
                            reason: 'none'
                        });
                        profileSuccess = true;
                        anyProfileSuccess = true;
                    } catch (enrollError: any) {
                        let errorMessage;
                        if (enrollError?.response?.data?.params?.errmsg) {
                            errorMessage = enrollError.response.data.params.errmsg;
                        } else {
                            errorMessage = enrollError?.message || 'Failed to enroll to the course';
                        }
                        console.error(`    Failed to enroll in course ${courseCode}:`, enrollError.message);
                        
                        // Check if error indicates user is already enrolled
                        const isAlreadyEnrolled = errorMessage.toLowerCase().includes('user has already enrolled');
                        
                        results.push({
                            userId: email,
                            learnerProfile: learnerProfileCode,
                            courseCode: courseCode,
                            status: isAlreadyEnrolled ? 'Skipped' : 'Failure',
                            reason: errorMessage || 'Failed to enroll in course'
                        });
                    }
                }

                // If this profile had any successful enrollments, write intermediate results
                if (profileSuccess) {
                    writeResultsToCSV(headerRow, results);
                }
            }

        } catch (error: any) {
            let errorMessage;
            if (error?.response?.data?.params?.errmsg) {
                errorMessage = error.response.data.params.errmsg;
            } else {
                errorMessage = error?.message || 'Failed to process enrollments';
            }
            
            // Record failure for all learner profiles of this user
            for (const learnerProfileCode of learnerProfileCodes) {
                results.push({
                    userId: email,
                    learnerProfile: learnerProfileCode,
                    courseCode: 'none',
                    status: 'Failure',
                    reason: errorMessage
                });
            }
            
            console.error(`Error processing enrollments for ${email}:`, errorMessage);

            // Write intermediate results to CSV after each failure
            writeResultsToCSV(headerRow, results);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    writeResultsToCSV(headerRow, results);

    console.log('Finished processing all enrollments');
    console.log(`Results have been saved to ${path.join(__dirname, '..', 'reports', 'enrollment-status.csv')}`);
}

function writeResultsToCSV(headerRow: string[], results: EnrollmentResult[]) {
    const resultsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir);
    }
    const reportPath = path.join(resultsDir, 'enrollment-status.csv');

    // Convert rows to CSV format with proper escaping
    const csvRows = results.map(result => {
        const row = [
            result.userId,
            result.learnerProfile,
            result.courseCode,
            result.status,
            result.reason
        ];
        return row.map(field => {
            // If field contains comma or quotes, wrap it in quotes and escape existing quotes
            if (field.includes(',') || field.includes('"')) {
                return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
        }).join(',');
    });

    const csvContent = [headerRow.join(','), ...csvRows].join('\n');
    fs.writeFileSync(reportPath, csvContent);
}

// Run the script
processEnrollments().catch(console.error); 