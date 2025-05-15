import fs from 'fs';
import path from 'path';
import parseCsv from "../services/csv";
import { createAssessment, updateContent, getAssessmentItem, reviewContent, publishContent } from './services/quizService';
import { createQuestion } from "./services/questionService";
import { assessmentConfig, assessmentDefaultValues } from './config/quizConfigs';
import { QuestionMapping, QuestionScoreMapping } from './types';
import { getAuthToken } from '../services/authService';
import { searchContent } from '../services/contentService';
import globalConfig from '../globalConfigs';
import _ from 'lodash';

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
        const headers = rows[0];
        const dataRows = rows.slice(1);

        // Convert each row into an object using the headers
        const parsedRows = dataRows.map(row =>
            headers.reduce((acc, header, i) => {
                acc[header] = row[i];
                return acc;
            }, {} as Record<string, string>)
        );

        // Create results directory if it doesn't exist
        const resultsDir = path.join(__dirname, '..', 'reports');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir);
        }

        // Prepare status report data
        const statusReport = [rows[0].concat(['status', 'reason'])]; // Add headers

        for (const row of parsedRows) {
            try {
                if (Object.keys(row).length >= 3) {
                    const code = row.code;
                    if (!code) {
                        throw new Error('Question Code input is missing');
                    }
                    const { exists, question = false, identifier, score } = await searchContent(code, true);
                    if (exists) {
                        if (question && identifier) {
                            questionNodeMap[`${code}`] = identifier;
                            questionScoreMap[`${code}`] = score;
                            statusReport.push(headers.map(h => row[h]).concat(['Skipped', `Question with code ${code} already exists`]));
                            continue;
                        }
                        statusReport.push(headers.map(h => row[h]).concat(['Skipped', `Content with code ${code} already exists`]));
                        continue;
                    }

                    const title = row.question_text;
                    if (!title) {
                        throw new Error('Question name input is missing');
                    }
                    const maxScore = parseInt(row.score, 10);
                    if (!maxScore || isNaN(maxScore)) {
                        throw new Error('Question Max score input is invalid');
                    }

                    questionScoreMap[`${code}`] = maxScore;

                    const optionPairs = [];
                    for (let i = 0; i < headers.length; i++) {
                        const textKey = headers[i];
                        const match = /^option_(\d+)$/.exec(textKey);
                        if (match) {
                            const number = match[1];
                            const isCorrectKey = `option_${number}_is_correct`;

                            if (headers.includes(isCorrectKey)) {
                                optionPairs.push({
                                    text: row[textKey],
                                    isCorrect: String(row[isCorrectKey]).toLowerCase() === 'true'
                                });
                            }
                        }
                    }

                    const nodeId = await createQuestion(code, title, optionPairs, maxScore);
                    questionNodeMap[`${code}`] = nodeId;
                    console.log(`Mapped question code ${code} to node_id ${nodeId} with score ${maxScore}`);
                    statusReport.push(headers.map(h => row[h]).concat(['Success', 'none']));
                }
            } catch (error: any) {
                console.error(`Error processing question ${row.code}:`, error);
                statusReport.push(headers.map(h => row[h]).concat(['Failure', error.message]));
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
        const headers = rows[0];
        const dataRows = rows.slice(1);

        // Convert each row into an object using the headers
        const parsedRows = dataRows.map(row =>
            headers.reduce((acc, header, i) => {
                acc[header] = row[i];
                return acc;
            }, {} as Record<string, string>)
        );

        const statusReport = [headers.concat(['status', 'error_message'])];
        for (const row of parsedRows) {
            if (Object.keys(row).length >= 6) {
                const code = row.code;
                const questionsField = row.questions.includes(',') ? `"${row.questions}"` : row.questions;
                const baseRow = headers.map(h => {
                    if (h === 'questions') return questionsField;
                    return row[h] ?? '';
                });
                if (!code) {
                    statusReport.push([
                        ...baseRow,
                        'Failed',
                        `Quiz code input is missing`
                    ]);
                    continue
                }
                const name = row.quiz_name;
                if (!name) {
                    statusReport.push([
                        ...baseRow,
                        'Failed',
                        `Quiz name is missing`
                    ]);
                    continue
                }
                const maxAttempts = parseInt(row.max_attempts, 10);
                if (!maxAttempts || isNaN(maxAttempts)) {
                    statusReport.push([
                        ...baseRow,
                        'Failed',
                        `Quiz max attempts input is missing`
                    ]);
                    continue
                }
                const language = row.language || "English";
                const contentType = row.quiz_type;
                if (!contentType) {
                    statusReport.push([
                        ...baseRow,
                        'Failed',
                        `Quiz content type input is missing`
                    ]);
                    continue
                }
                const questionCodes = row.questions.split(',').map(code => code.trim());

                console.log(questionCodes);
                
                if (_.isEmpty(_.compact(questionCodes))) {
                    statusReport.push([
                        ...baseRow,
                        'Failed',
                        `Question codes input are missing`
                    ]);
                    continue
                }

                const missingQuestions = questionCodes.filter(qCode => !questionNodeMap[qCode]);
                if (missingQuestions.length > 0) {
                    const questionsField = row.questions.includes(',') ? `"${row.questions}"` : row.questions;
                    const baseRow = headers.map(h => {
                        if (h === 'questions') return questionsField;
                        return row[h] ?? '';
                    });

                    statusReport.push([
                        ...baseRow,
                        'Failed',
                        `question with code ${missingQuestions[0]} does not exist.`
                    ]);

                    continue;
                }

                try {
                    const { exists } = await searchContent(code, false, true);
                    if (exists) {
                        const questionCode = row.questions.includes(',') ? `"${row.questions}"` : row.questions;

                        const baseRow = headers.map(h => {
                            if (h === 'questions') return questionCode;
                            return row[h] ?? '';
                        });

                        statusReport.push([
                            ...baseRow,
                            'Skipped',
                            `Content with code ${code} already exists`
                        ]);
                        continue;
                    }

                    // Create content and get identifier and versionKey
                    const { identifier, versionKey } = await createAssessment(code, name, maxAttempts, contentType, language);

                    // Ensure questions field is properly quoted if it contains commas
                    const questionsField = row.questions.includes(',') ? `"${row.questions}"` : row.questions;
                    const baseRow = headers.map(h => {
                        if (h === 'questions') return questionsField;
                        return row[h] ?? '';
                    });

                    statusReport.push([
                        ...baseRow,
                        'Draft',
                        `none`
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

                    // Add delay after publishing to prevent rate limiting
                    await new Promise(resolve => setTimeout(resolve, globalConfig.waitInterval));
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
        const resultsDir = path.join(__dirname, '..', 'reports');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir);
        }

        const contentRows = await parseCsv(assessmentConfig.csvPath);
        const headers = contentRows[0];
        const dataRows = contentRows.slice(1);

        // Convert each row into an object using the headers
        const parsedRows = dataRows.map(row =>
            headers.reduce((acc, header, i) => {
                acc[header] = row[i];
                return acc;
            }, {} as Record<string, string>)
        );

        const quizQuestionStatus = [['quiz_code', 'question_code', 'question_creation_status', 'question_attachment_status', 'error_message']];

        for (const row of parsedRows) {
            if (Object.keys(row).length >= 6) {
                const code = row.code;
                const questionCodes = row.questions.split(',').map(code => code.trim());

                for (const qCode of questionCodes) {
                    const questionExists = questionNodeMap[qCode] !== undefined;
                    const status = questionExists ? 'TRUE' : 'FALSE';
                    const errorMessage = questionExists ? 'none' : `[\"QUESTION ${qCode} NOT FOUND\"]`;

                    quizQuestionStatus.push([
                        code,
                        qCode,
                        status,
                        status,
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