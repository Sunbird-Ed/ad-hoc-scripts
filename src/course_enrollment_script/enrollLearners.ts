import fs from 'fs';
import { getUserId } from './services/authService';
import parseCsv from "../services/csv";
import { enrollInCourse, getBatchList } from './services/courseService';
import { courseConfig } from './config/courseConfig';
import path from 'path';
import { getAuthToken } from '../services/authService';
import axios from 'axios';
import globalConfig from '../globalConfigs';
import { config } from './config/config';
import { routes } from './config/routes';
interface EnrollmentResult {
    userId: string;
    learnerProfile: string;
    courseCode: string;
    status: 'Success' | 'Failure' | 'Skipped';
    reason: string;
}

function parseLearnerProfileCodes(code: string): string[] {
    // Remove any quotes and split by comma
    return code.replace(/"/g, '').split(',').map(c => c.trim()).filter(c => c);
}

async function searchLearnerProfile(profileCode: string): Promise<string | null> {
    const headers = {
        'Content-Type': 'application/json',
        'X-Channel-Id': config.channelId,
        'Authorization': config.apiAuthKey,
        'x-authenticated-user-token': globalConfig.creatorUserToken
    };

    const body = {
        request: {
            filters: {
                code: profileCode
            }
        }
    };

    try {
        const response = await axios.post(`${config.baseUrl}${routes.searchCourse}`, body, { headers });
        const content = response.data.result.content;
        const count = response.data.result.count;

        if (count === 0 || !content || content.length === 0) {
            console.log(`No content found for learner profile ${profileCode}`);
            return null;
        }

        const profile = content[0];
        if (profile.contentType !== 'Resource' || !profile.children) {
            console.log(`Invalid learner profile ${profileCode}: wrong content type or missing required fields`);
            return null;
        }

        return profile.identifier;
    } catch (error) {
        console.error(`Error searching for learner profile ${profileCode}:`, error);
        return null;
    }
}

async function getProfileCourses(profileId: string): Promise<string[]> {
    const headers = {
        'Content-Type': 'application/json',
        'X-Channel-Id': config.channelId,
        'Authorization': config.apiAuthKey,
        'x-authenticated-user-token': globalConfig.creatorUserToken
    };

    try {
        const response = await axios.get(`${config.baseUrl}${routes.readContent}/${profileId}`, { headers });
        const children = response.data.result.content.children;

        if (!children || !Array.isArray(children)) {
            console.log(`No courses found in learner profile ${profileId}`);
            return [];
        }

        return children.map(child => child.identifier);
    } catch (error) {
        console.error(`Error getting courses for profile ${profileId}:`, error);
        return [];
    }
}

async function getCourseNodeIds(courseIds: string[]): Promise<{ [nodeId: string]: string }> {
    const nodeIdToCourseCodeMap: { [nodeId: string]: string } = {};
    for (const courseId of courseIds) {
        const headers = {
            'Content-Type': 'application/json',
            'X-Channel-Id': config.channelId,
            'Authorization': config.apiAuthKey,
            'x-authenticated-user-token': globalConfig.creatorUserToken
        };

        try {
            const response = await axios.get(`${config.baseUrl}${routes.readContent}/${courseId}`, { headers });
            const {status, contentType, code} = response.data.result.content;
            if(status !== 'Live' || contentType !== 'Course' ||!code) {
                console.log(`Invalid course ${courseId}: wrong status or content type or missing required fields`);
                continue;
            }
            nodeIdToCourseCodeMap[courseId] = code;
        } catch (error) {
            console.error(`Error searching for course ${courseId}:`, error);
        }
    }
    return nodeIdToCourseCodeMap;
}

async function processEnrollments() {
    await getAuthToken();
    const rows = await parseCsv(courseConfig.userLearnerPath);
    const dataRows = rows.slice(1);
    const headerRow = ['userId', 'learnerProfile', 'courseCode', 'enrollmentStatus', 'reason'];
    const results: EnrollmentResult[] = [];

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

            // Process each learner profile for this user
            for (const learnerProfileCode of learnerProfileCodes) {
                console.log(`  Processing learner profile: ${learnerProfileCode}`);

                // Search for the learner profile
                const profileId = await searchLearnerProfile(learnerProfileCode);
                if (!profileId) {
                    results.push({
                        userId: email,
                        learnerProfile: learnerProfileCode,
                        courseCode: 'none',
                        status: 'Skipped',
                        reason: 'Learner profile does not exist'
                    });
                    continue;
                }

                // Get courses from the profile
                const courseNodeIds = await getProfileCourses(profileId);
                if (courseNodeIds.length === 0) {
                    results.push({
                        userId: email,
                        learnerProfile: learnerProfileCode,
                        courseCode: 'none',
                        status: 'Skipped',
                        reason: 'No courses found in learner profile'
                    });
                    continue;
                }

                // Get node IDs for course codes
                const nodeIdToCourseCodeMap = await getCourseNodeIds(courseNodeIds);
                const nodeIds = Object.keys(nodeIdToCourseCodeMap);
                if (nodeIds.length === 0) {
                    results.push({
                        userId: email,
                        learnerProfile: learnerProfileCode,
                        courseCode: 'none',
                        status: 'Skipped',
                        reason: 'No valid courses found for learner profile'
                    });
                    continue;
                }

                // Enroll in each course
                for (const nodeId of nodeIds) {
                    const courseCode = nodeIdToCourseCodeMap[nodeId];

                    // Skip if user is already enrolled in this course
                    if (userEnrollments.get(email)?.has(nodeId)) {
                        console.log(`    User already enrolled in course ${courseCode}`);
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
                        console.log(`    No batch found for course ${courseCode}`);
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
                        console.log(`    Enrolled in course ${courseCode}, batch ${batchId}`);
                        // Mark course as enrolled for this user
                        userEnrollments.get(email)?.add(nodeId);
                        results.push({
                            userId: email,
                            learnerProfile: learnerProfileCode,
                            courseCode: courseCode,
                            status: 'Success',
                            reason: 'none'
                        });
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
        }

        // Write intermediate results to CSV after each user
        writeResultsToCSV(headerRow, results);

        // Add delay between users
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

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