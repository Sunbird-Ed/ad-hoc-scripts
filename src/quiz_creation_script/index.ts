import fs from 'fs';
import path from 'path';
import parseCsv from "../services/csv";
import { createAssessment, updateContent, getAssessmentItem, reviewContent, publishContent } from './services/quizService';
import { createQuestion } from "./services/questionService";
import { assessmentConfig, assessmentDefaultValues } from './config/quizConfigs';
import { QuestionMapping, QuestionScoreMapping } from './types';
import { getAuthToken } from '../services/authService';

let questionNodeMap: QuestionMapping = {};
let questionScoreMap: QuestionScoreMapping = {};

async function saveQuestionMapping() {
    const mappingPath = path.join(__dirname, './../../data/question_mapping.json');
    await fs.promises.writeFile(
        mappingPath,
        JSON.stringify(questionNodeMap, null, 2),
        'utf8'
    );
    console.log(`Question mapping saved to ${mappingPath}`);
}

async function processQuestionCsv() {
    try {
        const rows = await parseCsv(assessmentConfig.questionCsvPath);
        const dataRows = rows.slice(1);

        // Create results directory if it doesn't exist
        const resultsDir = path.join(__dirname, '..', 'reports');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir);
        }

        // Prepare status report data
        const statusReport = [rows[0].concat(['status', 'reason'])]; // Add headers

        for (const row of dataRows) {
            try {
                if (row.length >= 3) {
                    const code = row[0];
                    const title = row[1];
                    const maxScore = parseInt(row[row.length - 1], 10);

                    questionScoreMap[code] = maxScore;

                    const optionPairs = [];
                    for (let i = 2; i < row.length - 1; i += 2) {
                        if (i + 1 < row.length - 1) {
                            optionPairs.push({
                                text: row[i],
                                isCorrect: row[i + 1].toLowerCase() === 'true'
                            });
                        }
                    }

                    const nodeId = await createQuestion(code, title, optionPairs, maxScore);
                    questionNodeMap[code] = nodeId;
                    console.log(`Mapped question code ${code} to node_id ${nodeId} with score ${maxScore}`);
                    statusReport.push(row.concat(['Success', 'none']));
                }
            } catch (error: any) {
                console.error(`Error processing question ${row[0]}:`, error);
                statusReport.push(row.concat(['Failure', error.message]));
            }
        }

        console.log('Question processing completed');
        // Save the question mapping to a JSON file
        await saveQuestionMapping();

        // Write the status report to CSV with proper quoting for fields containing commas
        const csvString = statusReport
            .map(row => row.map(cell =>
                cell.includes(',') ? `"${cell}"` : cell
            ).join(','))
            .join('\n');
        const outputPath = path.join(resultsDir, 'questions_status.csv');
        fs.writeFileSync(outputPath, csvString);
        console.log(`Question status report saved to ${outputPath}`);
    } catch (error: any) {
        console.error('Error processing question CSV:', error?.response);
        process.exit(1);
    }
}

async function processContentCsv() {
    try {
        const resultsDir = path.join(__dirname, '..', 'reports');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir);
        }
        const rows = await parseCsv(assessmentConfig.csvPath);
        const dataRows = rows.slice(1);

        const statusReport = [rows[0].concat(['status', 'error_message'])];
        for (const row of dataRows) {
            if (row.length >= 6) {
                const code = row[0];
                const name = row[1];
                const maxAttempts = parseInt(row[2], 10);
                const contentType = row[4];
                const questionCodes = row[5].split(',').map(code => code.trim());

                const missingQuestions = questionCodes.filter(qCode => !questionNodeMap[qCode]);
                if (missingQuestions.length > 0) {
                    // Ensure questions field is properly quoted if it contains commas
                    const questionsField = row[5].includes(',') ? `"${row[5]}"` : row[5];
                    statusReport.push([
                        code,
                        name,
                        maxAttempts.toString(),
                        row[3],
                        contentType,
                        questionsField,
                        'Failed',
                        `${missingQuestions.join(', ')} does not exist.`
                    ]);
                    continue;
                }
                try {
                    // Create content and get identifier and versionKey
                    const { identifier, versionKey } = await createAssessment(code, name, maxAttempts, contentType);

                    // Ensure questions field is properly quoted if it contains commas
                    const questionsField = row[5].includes(',') ? `"${row[5]}"` : row[5];
                    statusReport.push([
                        code,
                        name,
                        maxAttempts.toString(),
                        row[3],
                        contentType,
                        questionsField,
                        'Draft',
                        'none'
                    ]);

                    // Map question codes to their node IDs and calculate total score
                    const questionIdentifiers = [];
                    let totalScore = 0;
                    const assessmentItems = [];
                    const formattedAssessmentItems = [];

                    for (const qCode of questionCodes) {
                        if (questionNodeMap[qCode]) {
                            const nodeId = questionNodeMap[qCode];
                            questionIdentifiers.push({ identifier: nodeId });
                            totalScore += questionScoreMap[qCode] || 0;

                            try {
                                const assessmentData = await getAssessmentItem(nodeId);
                                if (assessmentData?.result?.assessment_item) {
                                    const item = assessmentData.result.assessment_item;
                                    // Store original assessment item
                                    assessmentItems.push(item);

                                    // Parse the stringified body
                                    const body = JSON.parse(item.body);

                                    const formattedItem = {
                                        "id": nodeId,
                                        "type": "mcq",
                                        "pluginId": "org.ekstep.questionunit.mcq",
                                        "pluginVer": "1.3",
                                        "templateId": "horizontalMCQ",
                                        "data": {
                                            "__cdata": JSON.stringify(body.data.data)
                                        },
                                        "config": {
                                            "__cdata": JSON.stringify(body.data.config)
                                        },
                                        "w": 80,
                                        "h": 85,
                                        "x": 9,
                                        "y": 6
                                    };

                                    formattedAssessmentItems.push(formattedItem);
                                }
                            } catch (error) {
                                console.error(`Failed to fetch or process assessment item for ${nodeId}:`, error);
                            }
                        }
                    }

                    // Prepare update data
                    const updateData = {
                        versionKey,
                        totalQuestions: questionIdentifiers.length,
                        totalScore,
                        questions: questionIdentifiers,
                        editorState: JSON.stringify(assessmentDefaultValues.editorState),
                        plugins: assessmentDefaultValues.plugins,
                        body: JSON.stringify({
                            "theme": {
                                "id": "theme",
                                "version": "1.0",
                                "startStage": "d9ae4d48-389a-4757-867c-dc6a4beae92e",
                                "stage": [
                                    {
                                        "x": 0,
                                        "y": 0,
                                        "w": 100,
                                        "h": 100,
                                        "id": "d9ae4d48-389a-4757-867c-dc6a4beae92e",
                                        "rotate": null,
                                        "config": {
                                            "__cdata": "{\"opacity\":100,\"strokeWidth\":1,\"stroke\":\"rgba(255, 255, 255, 0)\",\"autoplay\":false,\"visible\":true,\"color\":\"#FFFFFF\",\"genieControls\":false,\"instructions\":\"\"}"
                                        },
                                        "param": [
                                            {
                                                "name": "next",
                                                "value": "summary_stage_id"
                                            }
                                        ],
                                        "manifest": {
                                            "media": []
                                        },
                                        "org.ekstep.questionset": [
                                            {
                                                "x": 9,
                                                "y": 6,
                                                "w": 80,
                                                "h": 85,
                                                "rotate": 0,
                                                "z-index": 0,
                                                "id": "6d187a84-6ee0-4513-96ce-1d856e187c9b",
                                                "data": {
                                                    "__cdata": JSON.stringify(assessmentItems)
                                                },
                                                "config": {
                                                    "__cdata": JSON.stringify({ "title": name, "max_score": totalScore, "allow_skip": true, "show_feedback": false, "shuffle_questions": false, "shuffle_options": false, "total_items": questionIdentifiers.length, "btn_edit": "Edit" })
                                                },
                                                "org.ekstep.question": formattedAssessmentItems
                                            }]
                                    },
                                    { "x": 0, "y": 0, "w": 100, "h": 100, "rotate": null, "config": { "__cdata": "{\"opacity\":100,\"strokeWidth\":1,\"stroke\":\"rgba(255, 255, 255, 0)\",\"autoplay\":false,\"visible\":true,\"color\":\"#FFFFFF\",\"genieControls\":false,\"instructions\":\"\"}" }, "id": "summary_stage_id", "manifest": { "media": [{ "assetId": "summaryImage" }] }, "org.ekstep.summary": [{ "config": { "__cdata": "{\"opacity\":100,\"strokeWidth\":1,\"stroke\":\"rgba(255, 255, 255, 0)\",\"autoplay\":false,\"visible\":true}" }, "id": "summary_plugin_id", "rotate": 0, "x": 6.69, "y": -27.9, "w": 77.45, "h": 125.53, "z-index": 0 }] }
                                ],
                                "manifest": assessmentDefaultValues.manifest,
                                "plugin-manifest": assessmentDefaultValues.pluginManifest,
                                "compatibilityVersion": 2
                            }
                        })
                    }

                    // Call updateContent with the prepared data
                    await updateContent(identifier, versionKey, updateData);
                    statusReport[statusReport.length - 1][statusReport[0].length - 2] = 'Draft';
                    console.log(`Quiz ${code} created and updated successfully with total score ${totalScore}`);

                    // Send content for review
                    await reviewContent(identifier);
                    statusReport[statusReport.length - 1][statusReport[0].length - 2] = 'In Review';
                    console.log(`Quiz ${code} sent for review`);

                    // Publish the content
                    await publishContent(identifier);
                    statusReport[statusReport.length - 1][statusReport[0].length - 2] = 'Live';
                    console.log(`Quiz ${code} published successfully`);
                } catch (error: any) {
                    const currentStatus = statusReport[statusReport.length - 1];
                    currentStatus[currentStatus.length - 1] = error.message;
                    if (!currentStatus[currentStatus.length - 2]) {
                        currentStatus[currentStatus.length - 2] = 'Draft';
                    }
                }
            }
        }
        const csvString = statusReport.map(row => row.join(',')).join('\n');
        const quizReportPath = path.join(resultsDir, 'quiz_report.csv');
        fs.writeFileSync(quizReportPath, csvString);
        console.log(`Quiz status report saved to ${quizReportPath}`);
        console.log('Content processing completed');
    } catch (error: any) {
        console.error('Error processing content CSV:', error?.response);
        process.exit(1);
    }
}

async function generateQuizQuestionStatus() {
    try {
        // Create results directory if it doesn't exist
        const resultsDir = path.join(__dirname, '..', 'reports');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir);
        }

        // Get all content data
        const contentRows = await parseCsv(assessmentConfig.csvPath);
        const quizQuestionStatus = [['quiz_code', 'question_code', 'question_creation_status', 'question_attachment_status', 'error_message']];

        for (const row of contentRows.slice(1)) { // Skip header
            if (row.length >= 6) {
                const code = row[0];
                const questionCodes = row[5].split(',').map(code => code.trim());

                for (const qCode of questionCodes) {
                    const questionExists = questionNodeMap[qCode] !== undefined;
                    const status = questionExists ? 'TRUE' : 'FALSE';
                    const errorMessage = questionExists ? 'none' : `[\"QUESTION ${qCode} NOT FOUND\"]`;

                    quizQuestionStatus.push([
                        code,
                        qCode,
                        status,
                        status, // Attachment status is same as creation status
                        errorMessage
                    ]);
                }
            }
        }

        // Write the status report to CSV
        const csvString = quizQuestionStatus.map(row => row.join(',')).join('\n');
        const outputPath = path.join(resultsDir, 'quiz_question_status.csv');
        fs.writeFileSync(outputPath, csvString);
        console.log(`Quiz-question status report saved to ${outputPath}`);
    } catch (error: any) {
        console.error('Error generating quiz-question status:', error?.response);
        process.exit(1);
    }
}


async function main() {
    try {
        // Get the user Token
        await getAuthToken()

        //Process questions and build the mapping
        console.log('Starting question processing...');
        await processQuestionCsv();

        // Generate quiz-question status report
        await generateQuizQuestionStatus();

        // Then process assessment
        console.log('Starting quiz processing...');
        await processContentCsv();
    } catch (error) {
        console.error('Processing failed:', error);
        process.exit(1);
    }
}

main();