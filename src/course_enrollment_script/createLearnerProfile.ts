import fs from 'fs';
import parseCsv from "../services/csv";
import { createLearnerProfile, getBatchList, publishContent, searchCourse, updateLearnerProfile } from './services/courseService';
import { courseConfig } from './config/courseConfig';
import path from 'path';
import { getAuthToken } from '../services/authService';
import { searchContent } from '../services/contentService';

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
    await getAuthToken()
    
    // Read user-learner mapping
    const userLearnerRows = await parseCsv(courseConfig.userLearnerPath);
    const userLearnerData = userLearnerRows.slice(1);
    
    // Read learner-course mapping
    const learnerCourseRows = await parseCsv(courseConfig.learnerCoursePath);
    const learnerCourseData = learnerCourseRows.slice(1);
    
    const headerRow = ['user_id', 'learner_profile_code', 'status', 'reason'];
    let currentMapping: CourseMapping = {};
    let batchMapping: BatchMapping = {};
    let nodeIdToCodeMapping: NodeIdToCodeMapping = {};
    const results: ProcessingResult[] = [];
    const createdProfiles = new Set<string>();

    // First, get all unique learner profile codes and their associated courses
    const learnerProfileCourses = new Map<string, Set<string>>();
    for (const record of userLearnerData) {
        const learnerProfileCodes = parseLearnerProfileCodes(record[1]);
        learnerProfileCodes.forEach(code => {
            if (!learnerProfileCourses.has(code)) {
                learnerProfileCourses.set(code, new Set());
            }
        });
    }

    // Get courses for each learner profile and ensure uniqueness
    for (const record of learnerCourseData) {
        const learnerProfileCode = record[0];
        if (learnerProfileCourses.has(learnerProfileCode)) {
            const courseCodes = parseLearnerProfileCodes(record[2]);
            // Add only unique course codes
            courseCodes.forEach(code => {
                const existingCourses = learnerProfileCourses.get(learnerProfileCode);
                if (existingCourses) {
                    // Check if this course code is already associated with this learner profile
                    if (!existingCourses.has(code)) {
                        existingCourses.add(code);
                        console.log(`  Added unique course ${code} to learner profile ${learnerProfileCode}`);
                    } else {
                        console.log(`  Skipped duplicate course ${code} for learner profile ${learnerProfileCode}`);
                    }
                }
            });
        }
    }

    // Process each learner profile with its unique courses
    for (const [learnerProfileCode, courseCodes] of learnerProfileCourses) {
        console.log(`Processing learner profile: ${learnerProfileCode}`);
        console.log(`  Unique courses: ${Array.from(courseCodes).join(', ')}`);

        try {
            // Check if learner profile already exists
            const { exists } = await searchContent(learnerProfileCode);
            if (exists) {
                console.log(`  Learner profile ${learnerProfileCode} already exists, skipping...`);
                
                // Record success status for each user associated with this learner profile
                const usersWithThisProfile = userLearnerData.filter(record => 
                    parseLearnerProfileCodes(record[1]).includes(learnerProfileCode)
                );
                
                for (const userRecord of usersWithThisProfile) {
                    results.push({
                        userId: userRecord[0],
                        learnerProfileCode: learnerProfileCode,
                        status: 'Skipped',
                        reason: `Content with the code ${learnerProfileCode} already exists`
                    });
                }
                continue; // Skip to next learner profile
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

            // Get the learner profile data
            const learnerProfileRow = learnerCourseData.find(row => row[0] === learnerProfileCode);
            if (!learnerProfileRow) {
                throw new Error(`No courses found for learner profile: ${learnerProfileCode}`);
            }

            // Create and update learner profile
            const learnerProfileIdentifier = await createLearnerProfile(learnerProfileCode, nodeIdsStringArray, learnerProfileRow);
            await updateLearnerProfile(learnerProfileCode, learnerProfileIdentifier, currentMapping[learnerProfileCode], learnerProfileRow);
            await publishContent(learnerProfileIdentifier);

            console.log(`Successfully published learner profile for ${learnerProfileCode}`);
            createdProfiles.add(learnerProfileCode);

            // Record successful processing for each user associated with this learner profile
            const usersWithThisProfile = userLearnerData.filter(record => 
                parseLearnerProfileCodes(record[1]).includes(learnerProfileCode)
            );
            
            for (const userRecord of usersWithThisProfile) {
                results.push({
                    userId: userRecord[0],
                    learnerProfileCode: learnerProfileCode,
                    status: 'Success',
                    reason: 'none'
                });
            }

        } catch (error: any) {
            let errorMessage;
            if (error?.response?.data?.params?.errmsg) {
                errorMessage = error.response.data.params.errmsg;
            } else {
                errorMessage = error?.message || 'Failed to create learner profile';
            }

            // Record failed processing for each user associated with this learner profile
            const usersWithThisProfile = userLearnerData.filter(record => 
                parseLearnerProfileCodes(record[1]).includes(learnerProfileCode)
            );
            
            for (const userRecord of usersWithThisProfile) {
                results.push({
                    userId: userRecord[0],
                    learnerProfileCode: learnerProfileCode,
                    status: 'Failure',
                    reason: errorMessage
                });
            }
            
            console.error(`Error processing learner profile ${learnerProfileCode}:`, errorMessage);

            // Write intermediate results to CSV after each failure
            writeResultsToCSV(headerRow, results);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    writeResultsToCSV(headerRow, results);

    // Convert mappings to string format and save to .env file
    const courseMappingStr = JSON.stringify(Object.fromEntries(
        Object.entries(currentMapping).map(([key, map]) => [key, Object.fromEntries(map)])
    ));
    const batchMappingStr = JSON.stringify(batchMapping);
    const nodeIdToCodeMappingStr = JSON.stringify(nodeIdToCodeMapping);

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
        .filter(line => !line.startsWith('COURSE_MAPPING=') && !line.startsWith('BATCH_MAPPING=') && !line.startsWith('NODEID_TO_CODE_MAPPING='))
        .join('\n');

    // Add new mapping lines
    envContent += `\nCOURSE_MAPPING='${courseMappingStr}'\nBATCH_MAPPING='${batchMappingStr}'\nNODEID_TO_CODE_MAPPING='${nodeIdToCodeMappingStr}'`;

    // Write back to .env file
    fs.writeFileSync('.env', envContent);

    console.log('\nFinished processing all learner profiles');
    console.log(`Results have been saved to ${path.join(__dirname, '..', 'reports', 'learner-profile-status.csv')}`);
    console.log('You can now run: npm run start:enroll');
}

function writeResultsToCSV(headerRow: string[], results: ProcessingResult[]) {
    const resultsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir);
    }
    const reportPath = path.join(resultsDir, 'learner-profile-status.csv');

    // Convert rows to CSV format with proper escaping
    const csvRows = results.map(result => {
        const row = [
            result.userId,
            result.learnerProfileCode,
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
processLearnerProfiles().catch(console.error); 