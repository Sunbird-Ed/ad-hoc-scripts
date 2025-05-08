import fs from 'fs';
import { getUserId } from './services/authService';
import parseCsv from "../services/csv";
import { createLearnerProfile, enrollInCourse, getBatchList, publishContent, searchCourse, updateLearnerProfile } from './services/courseService';
import { courseConfig } from './config/courseConfig';
import path from 'path';
import { getAuthToken } from '../services/authService';

interface CourseMapping {
    [key: string]: Map<string, string>;
}

interface BatchMapping {
    [key: string]: { [nodeId: string]: string | null };
}

interface ProcessingResult {
    originalRow: string[];
    status: 'Success' | 'Failure';
    errorMessage: string;
}

async function processCourseEnrollments() {
    await getAuthToken()
    const rows = await parseCsv(courseConfig.learnerCoursePath);
    const dataRows = rows.slice(1);
    const headerRow = [...rows[0], 'status', 'errorMessage'];
    let currentMapping: CourseMapping = {};
    let batchMapping: BatchMapping = {};
    const results: ProcessingResult[] = [];

    for (const record of dataRows) {
        const learnerProfileCode = record[0];
        console.log(`Processing learner profile: ${learnerProfileCode}`);

        try {
            // Initialize mappings for this learner
            currentMapping[learnerProfileCode] = new Map();
            batchMapping[learnerProfileCode] = {};

            // Get auth token
            const { userId, accessToken } = await getUserId(learnerProfileCode);
            const courseCodes = record[2].split(',').map((code: string) => code.trim());

            // Process each course code
            for (const courseCode of courseCodes) {
                try {
                    console.log(`  Searching for course code: ${courseCode}`);
                    const { identifier: nodeId, name } = await searchCourse(courseCode);
                    if (!nodeId) {
                        throw new Error(`Course not found for code: ${courseCode}`);
                    }
                    currentMapping[learnerProfileCode].set(nodeId, name);

                    const batchId = await getBatchList(nodeId);
                    if (!batchId) {
                        throw new Error(`No batch found for course: ${nodeId}`);
                    }
                    batchMapping[learnerProfileCode][nodeId] = batchId;
                    console.log(`Found batch ID ${batchId} for course ${nodeId}`);
                } catch (courseError: any) {
                    throw new Error(`Failed processing course ${courseCode}: ${courseError.message}`);
                }
            }

            const nodeIdsStringArray = Array.from(currentMapping[learnerProfileCode].keys()).map(String);

            // Create and update learner profile
            const learnerProfileIdentifier = await createLearnerProfile(learnerProfileCode, nodeIdsStringArray, record);
            await updateLearnerProfile(learnerProfileCode, learnerProfileIdentifier, currentMapping[learnerProfileCode], record);
            await publishContent(learnerProfileIdentifier);

            console.log(`Successfully published learner profile for ${learnerProfileCode}`);

            // Perform enrollments
            for (const [nodeId, _] of currentMapping[learnerProfileCode]) {
                const batchId = batchMapping[learnerProfileCode][nodeId];
                if (batchId) {
                    await enrollInCourse(nodeId, batchId, userId, accessToken);
                    console.log(`  Enrolled in course ${nodeId}, batch ${batchId}`);
                }
            }

            // Record successful processing
            results.push({
                originalRow: record,
                status: 'Success',
                errorMessage: 'none'
            });

        } catch (error: any) {
            let errorMessage;
            if (error?.response?.data?.params?.errmsg) {
                errorMessage = error.response.data.params.errmsg;
            } else {
                errorMessage = error?.message || 'Failed to enrol to the course';
            }
            // Record failed processing with error message
            results.push({
                originalRow: record,
                status: 'Failure',
                errorMessage: errorMessage
            });
            console.error(`Error processing learner profile ${learnerProfileCode}:`, errorMessage);

            // Write intermediate results to CSV after each failure
            writeResultsToCSV(headerRow, results);
        }

        // Save mappings after each record (success or failure)
        fs.writeFileSync('course-mappings.json', JSON.stringify(currentMapping, null, 2));
        fs.writeFileSync('batch-mappings.json', JSON.stringify(batchMapping, null, 2));

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    writeResultsToCSV(headerRow, results);

    console.log('Finished processing all learner profiles');
    console.log(`Results have been saved to ${path.join(__dirname, '..', 'reports', 'course-enrollment-status.csv')}`);
}

function writeResultsToCSV(headerRow: string[], results: ProcessingResult[]) {
    const resultsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir);
    }
    const reportPath = path.join(resultsDir, 'course-enrollment-status.csv');

    // Convert rows to CSV format with proper escaping
    const csvRows = results.map(result => {
        const row = [...result.originalRow, result.status, result.errorMessage];
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
processCourseEnrollments().catch(console.error);