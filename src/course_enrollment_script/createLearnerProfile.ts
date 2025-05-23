import fs from 'fs';
import parseCsv from "../services/csv";
import { createLearnerProfile, getBatchList, publishContent, searchCourse, updateLearnerProfile } from './services/courseService';
import { courseConfig } from './config/courseConfig';
import path from 'path';
import { getAuthToken } from '../services/authService';
import { searchContent } from '../services/contentService';
import globalConfig from '../globalConfigs';
import _ from 'lodash';

interface CourseMapping {
    [key: string]: Map<string, string>;
}

interface BatchMapping {
    [key: string]: { [nodeId: string]: string | null };
}

interface NodeIdToCodeMapping {
    [nodeId: string]: string;
}

interface ProcessingResult {
    userId: string;
    learnerProfileCode: string;
    status: 'Success' | 'Failure' | 'Skipped';
    reason: string;
}

function parseLearnerProfileCodes(code: string): string[] {
    // Remove any quotes and split by comma
    return code.replace(/"/g, '').split(',').map(c => c.trim()).filter(c => c);
}

async function processLearnerProfiles() {
    await getAuthToken();

    // Read learner-course mapping
    const learnerCourseRows = await parseCsv(courseConfig.learnerCoursePath);
    const headerRow = learnerCourseRows[0];
    const updatedHeaderRow = ['learner_profile_code', 'status', 'reason'];
    const dataRows = learnerCourseRows.slice(1);

    const learnerCourseData = dataRows.map(row =>
        headerRow.reduce((acc, header, i) => {
            acc[header] = row[i];
            return acc;
        }, {} as Record<string, string>)
    );


    let currentMapping: CourseMapping = {};
    let batchMapping: BatchMapping = {};
    let nodeIdToCodeMapping: NodeIdToCodeMapping = {};
    const results: any[] = [];
    const createdProfiles = new Set<string>();

    // Get all unique learner profile codes and their associated courses
    const learnerProfileCourses = new Map<string, Set<string>>();
    for (const record of learnerCourseData) {
        const learnerProfileCode = record['learner_profile_code'];
        if (!learnerProfileCode) {
            results.push([
                record["learner_profile_code"],
                'Failure',
                `Learner Profile code input is missing`
            ]);
            continue;
        }
        if (!learnerProfileCourses.has(learnerProfileCode)) {
            learnerProfileCourses.set(learnerProfileCode, new Set());
        }
        const courseCodes = parseLearnerProfileCodes(record['course_code']);
        if (_.isEmpty(courseCodes)) {
            results.push([
                record["learner_profile_code"],
                'Failure',
                `Course codes input is missing`
            ]);
            continue;
        }
        // Add only unique course codes
        courseCodes.forEach(code => {
            const existingCourses = learnerProfileCourses.get(learnerProfileCode);
            if (existingCourses) {
                if (!existingCourses.has(code)) {
                    existingCourses.add(code);
                    console.log(` Adding course ${code} to learner profile ${learnerProfileCode} is in progress`);
                } else {
                    console.log(`Skipping duplicate course ${code} for learner profile ${learnerProfileCode}`);
                }
            }
        });
    }

    // Process each learner profile with its unique courses
    for (const [learnerProfileCode, courseCodes] of learnerProfileCourses) {
        console.log(`Processing learner profile: ${learnerProfileCode}`);

        try {
            // Check if learner profile already exists
            const { exists } = await searchContent(learnerProfileCode);
            if (exists) {
                console.log(`  Learner profile ${learnerProfileCode} already exists, skipping...`);
                // Add a result row for each course in the original data
                const profileRows = learnerCourseData.filter(row => row['learner_profile_code'] === learnerProfileCode);
                for (const row of profileRows) {
                    results.push([
                        row["learner_profile_code"],
                        'Skipped',
                        `Content with the code ${learnerProfileCode} already exists`
                    ]);
                }
                continue;
            }

            // Initialize mappings for this learner
            currentMapping[learnerProfileCode] = new Map();
            batchMapping[learnerProfileCode] = {};

            // Process each unique course code for this learner profile
            for (const courseCode of courseCodes) {
                try {
                    console.log(`  Searching for course code: ${courseCode}`);
                    const { identifier: nodeId, name } = await searchCourse(courseCode);
                    if (!nodeId) {
                        throw new Error(`Course not found for code: ${courseCode}`);
                    }
                    currentMapping[learnerProfileCode].set(nodeId, name);
                    // Save the nodeId to courseCode mapping
                    nodeIdToCodeMapping[nodeId] = courseCode;
                } catch (courseError: any) {
                    throw new Error(`Failed processing course ${courseCode}: ${courseError.message}`);
                }
            }

            const nodeIdsStringArray = Array.from(currentMapping[learnerProfileCode].keys()).map(String);

            // Get the learner profile data
            const learnerProfileRow = learnerCourseData.find(row => row['learner_profile_code'] === learnerProfileCode);
            if (!learnerProfileRow) {
                throw new Error(`No courses found for learner profile: ${learnerProfileCode}`);
            }

            // Create and update learner profile
            const { learnerProfileIdentifier, children } = await createLearnerProfile(learnerProfileCode, nodeIdsStringArray, learnerProfileRow);
            await updateLearnerProfile(learnerProfileCode, learnerProfileIdentifier, currentMapping[learnerProfileCode], learnerProfileRow, children);
            await publishContent(learnerProfileIdentifier);

            console.log(`Successfully published learner profile for ${learnerProfileCode}`);
            createdProfiles.add(learnerProfileCode);

            // Add a result row for each course in the original data
            const profileRows = learnerCourseData.filter(row => row['learner_profile_code'] === learnerProfileCode);
            for (const row of profileRows) {
                results.push([
                    row["learner_profile_code"],
                    'Success',
                    'none'
                ]);
            }

        } catch (error: any) {
            let errorMessage;
            if (error?.response?.data?.params?.errmsg) {
                errorMessage = error.response.data.params.errmsg;
            } else {
                errorMessage = error?.message || 'Failed to create learner profile';
            }

            // Add a result row for each course in the original data
            const profileRows = learnerCourseData.filter(row => row['learner_profile_code'] === learnerProfileCode);
            for (const row of profileRows) {
                results.push([
                    row["learner_profile_code"],
                    'Failure',
                    errorMessage
                ]);
            }

            console.error(`Error processing learner profile ${learnerProfileCode}:`, errorMessage);

            // Write intermediate results to CSV after each failure
            writeResultsToCSV(updatedHeaderRow, results);
        }

        await new Promise(resolve => setTimeout(resolve, globalConfig.waitInterval));
    }

    // Update writeResultsToCSV calls to include headerRow
    writeResultsToCSV(updatedHeaderRow, results);

    // Convert mappings to string format and save to .env file
    const courseMappingStr = JSON.stringify(Object.fromEntries(
        Object.entries(currentMapping).map(([key, map]) => [key, Object.fromEntries(map)])
    ));
    const batchMappingStr = JSON.stringify(batchMapping);

    // Read existing .env file
    let envContent = '';
    try {
        envContent = fs.readFileSync('.env', 'utf-8');
    } catch (error) {
        // .env file doesn't exist, that's okay
    }

    // Remove any existing mapping lines
    envContent = envContent
        .split('\n')
        .filter(line => !line.startsWith('COURSE_MAPPING=') && !line.startsWith('BATCH_MAPPING='))
        .join('\n');

    // Add new mapping lines
    envContent += `\nCOURSE_MAPPING='${courseMappingStr}'\nBATCH_MAPPING='${batchMappingStr}'`;

    // Write back to .env file
    fs.writeFileSync('.env', envContent);

    console.log('\nFinished processing all learner profiles');
    console.log(`Learner profile creation status reports have been saved to ${path.join(__dirname, '..', 'reports', 'learner-profile-status.csv')}`);
}

function writeResultsToCSV(headerRow: string[], results: any[]) {
    const resultsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir);
    }
    const reportPath = path.join(resultsDir, 'learner-profile-status.csv');

    // Convert rows to CSV format with proper escaping
    const csvRows = results.map((row: string[]) => {
        return row.map((field: string) => {
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
processLearnerProfiles().catch(console.error);