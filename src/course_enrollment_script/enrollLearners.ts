import fs from 'fs';
import { getUserId } from './services/authService';
import parseCsv from "../services/csv";
import { enrollInCourse, getBatchList, getCourseNodeIds, getProfileCourses, searchLearnerProfile } from './services/courseService';
import { courseConfig } from './config/courseConfig';
import path from 'path';
import { getAuthToken } from '../services/authService';
import globalConfig from '../globalConfigs';
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

async function processEnrollments() {
    await getAuthToken();
    const rows = await parseCsv(courseConfig.userLearnerPath);
    const dataRows = rows.slice(1);
    const initialHeaderRow = rows[0];
    const enrollData = dataRows.map(row =>
        initialHeaderRow.reduce((acc, header, i) => {
            acc[header] = row[i];
            return acc;
        }, {} as Record<string, string>)
    );
    const updatedheaderRow = ['userId', 'learnerProfile', 'courseCode', 'enrollmentStatus', 'reason'];
    const results: EnrollmentResult[] = [];

    const userEnrollments = new Map<string, Set<string>>();

    for (const record of enrollData) {
        const email = record['email'];
        const learnerProfileCodes = parseLearnerProfileCodes(record['learner_profile_code']);
        console.log(`Processing enrollments for user: ${email} with profiles: ${learnerProfileCodes.join(', ')}`);

        try {
            const { userId, accessToken } = await getUserId(email);

            if (!userEnrollments.has(email)) {
                userEnrollments.set(email, new Set());
            }

            for (const learnerProfileCode of learnerProfileCodes) {
                console.log(`  Processing learner profile: ${learnerProfileCode}`);

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

                for (const nodeId of nodeIds) {
                    const courseCode = nodeIdToCourseCodeMap[nodeId];

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

        writeResultsToCSV(updatedheaderRow, results);

        await new Promise(resolve => setTimeout(resolve, globalConfig.waitInterval));
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

    const csvRows = results.map(result => {
        const row = [
            result.userId,
            result.learnerProfile,
            result.courseCode,
            result.status,
            result.reason
        ];
        return row.map(field => {
            if (field.includes(',') || field.includes('"')) {
                return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
        }).join(',');
    });

    const csvContent = [headerRow.join(','), ...csvRows].join('\n');
    fs.writeFileSync(reportPath, csvContent);
}

processEnrollments().catch(console.error);