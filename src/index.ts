import fs from 'fs';
import path from 'path';
import { parseCsv } from './utils/csv';
import { makeApiCall, updateContent, getAssessmentItem, reviewContent, publishContent, getAuthToken } from './services/api';
import { createQuestion } from './services/questionService';
import { assessmentConfig } from './config/assessmentConfig';
import { QuestionMapping, QuestionScoreMapping } from './types';
import { config } from './config/config';

let questionNodeMap: QuestionMapping = {};
let questionScoreMap: QuestionScoreMapping = {};

async function saveQuestionMapping() {
    const mappingPath = path.join(__dirname, '../data/question_mapping.json');
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
        // Skip the first row (headers)
        const dataRows = rows.slice(1);

        // Create results directory if it doesn't exist
        const resultsDir = path.join(__dirname, '..', 'results');
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
                    statusReport.push(row.concat(['Success', '']));
                }
            } catch (error: any) {
                console.error(`Error processing question ${row[0]}:`, error);
                statusReport.push(row.concat(['Failure', error.message]));
            }
        }

        console.log('Question processing completed');
        await saveQuestionMapping();

        // Write the status report to CSV
        const csvString = statusReport.map(row => row.join(',')).join('\n');
        const outputPath = path.join(resultsDir, 'questions_status.csv');
        fs.writeFileSync(outputPath, csvString);
        console.log(`Status report saved to ${outputPath}`);
    } catch (error) {
        console.error('Error processing question CSV:', error);
        process.exit(1);
    }
}

async function processContentCsv() {
    try {
        const resultsDir = path.join(__dirname, '..', 'results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir);
        }
        const rows = await parseCsv(assessmentConfig.csvPath);
        // Skip the first row (headers)
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
                    statusReport.push([
                        ...row,
                        'Failed',
                        `${missingQuestions.join(', ')} does not exist.`
                    ]);
                    continue;
                }
                try {
                    // Create content and get identifier and versionKey
                    const { identifier, versionKey } = await makeApiCall(code, name, maxAttempts, contentType);

                    statusReport.push([
                        ...row,
                        'Draft',
                        ''
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
                        editorState: JSON.stringify({ "plugin": { "noOfExtPlugins": 12, "extPlugins": [{ "plugin": "org.ekstep.contenteditorfunctions", "version": "1.2" }, { "plugin": "org.ekstep.keyboardshortcuts", "version": "1.0" }, { "plugin": "org.ekstep.richtext", "version": "1.0" }, { "plugin": "org.ekstep.iterator", "version": "1.0" }, { "plugin": "org.ekstep.navigation", "version": "1.0" }, { "plugin": "org.ekstep.reviewercomments", "version": "1.0" }, { "plugin": "org.ekstep.questionunit.mtf", "version": "1.2" }, { "plugin": "org.ekstep.questionunit.mcq", "version": "1.3" }, { "plugin": "org.ekstep.keyboard", "version": "1.1" }, { "plugin": "org.ekstep.questionunit.reorder", "version": "1.1" }, { "plugin": "org.ekstep.questionunit.sequence", "version": "1.1" }, { "plugin": "org.ekstep.questionunit.ftb", "version": "1.1" }] }, "stage": { "noOfStages": 1, "currentStage": "d9ae4d48-389a-4757-867c-dc6a4beae92e", "selectedPluginObject": "6d187a84-6ee0-4513-96ce-1d856e187c9b" }, "sidebar": { "selectedMenu": "settings" } }),
                        plugins: [
                            {
                                "identifier": "org.ekstep.stage",
                                "semanticVersion": "1.0"
                            },
                            {
                                "identifier": "org.ekstep.questionset",
                                "semanticVersion": "1.0"
                            },
                            {
                                "identifier": "org.ekstep.navigation",
                                "semanticVersion": "1.0"
                            },
                            {
                                "identifier": "org.ekstep.questionset.quiz",
                                "semanticVersion": "1.0"
                            },
                            {
                                "identifier": "org.ekstep.iterator",
                                "semanticVersion": "1.0"
                            },
                            {
                                "identifier": "org.ekstep.questionunit",
                                "semanticVersion": "1.2"
                            },
                            {
                                "identifier": "org.ekstep.questionunit.mcq",
                                "semanticVersion": "1.3"
                            },
                            {
                                "identifier": "org.ekstep.summary",
                                "semanticVersion": "1.0"
                            }
                        ],
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
                                    {
                                        "x": 0,
                                        "y": 0,
                                        "w": 100,
                                        "h": 100,
                                        "rotate": null,
                                        "config": {
                                            "__cdata": "{\"opacity\":100,\"strokeWidth\":1,\"stroke\":\"rgba(255, 255, 255, 0)\",\"autoplay\":false,\"visible\":true,\"color\":\"#FFFFFF\",\"genieControls\":false,\"instructions\":\"\"}"
                                        },
                                        "id": "summary_stage_id",
                                        "manifest": {
                                            "media": [
                                                {
                                                    "assetId": "summaryImage"
                                                }
                                            ]
                                        },
                                        "org.ekstep.summary": [
                                            {
                                                "config": {
                                                    "__cdata": "{\"opacity\":100,\"strokeWidth\":1,\"stroke\":\"rgba(255, 255, 255, 0)\",\"autoplay\":false,\"visible\":true}"
                                                },
                                                "id": "summary_plugin_id",
                                                "rotate": 0,
                                                "x": 6.69,
                                                "y": -27.9,
                                                "w": 77.45,
                                                "h": 125.53,
                                                "z-index": 0
                                            }
                                        ]
                                    }
                                ],
                                "manifest": {
                                    "media": [
                                        {
                                            "id": "1c499403-a81c-4abe-be55-93cdae5904dd",
                                            "plugin": "org.ekstep.navigation",
                                            "ver": "1.0",
                                            "src": "/content-plugins/org.ekstep.navigation-1.0/renderer/controller/navigation_ctrl.js",
                                            "type": "js"
                                        },
                                        {
                                            "id": "d6b2cca6-5cb4-4120-b65d-64aed2725866",
                                            "plugin": "org.ekstep.navigation",
                                            "ver": "1.0",
                                            "src": "/content-plugins/org.ekstep.navigation-1.0/renderer/templates/navigation.html",
                                            "type": "js"
                                        },
                                        {
                                            "id": "org.ekstep.navigation",
                                            "plugin": "org.ekstep.navigation",
                                            "ver": "1.0",
                                            "src": "/content-plugins/org.ekstep.navigation-1.0/renderer/plugin.js",
                                            "type": "plugin"
                                        },
                                        {
                                            "id": "org.ekstep.navigation_manifest",
                                            "plugin": "org.ekstep.navigation",
                                            "ver": "1.0",
                                            "src": "/content-plugins/org.ekstep.navigation-1.0/manifest.json",
                                            "type": "json"
                                        },
                                        {
                                            "id": "org.ekstep.questionset.quiz",
                                            "plugin": "org.ekstep.questionset.quiz",
                                            "ver": "1.0",
                                            "src": "/content-plugins/org.ekstep.questionset.quiz-1.0/renderer/plugin.js",
                                            "type": "plugin"
                                        },
                                        {
                                            "id": "org.ekstep.questionset.quiz_manifest",
                                            "plugin": "org.ekstep.questionset.quiz",
                                            "ver": "1.0",
                                            "src": "/content-plugins/org.ekstep.questionset.quiz-1.0/manifest.json",
                                            "type": "json"
                                        },
                                        {
                                            "id": "org.ekstep.iterator",
                                            "plugin": "org.ekstep.iterator",
                                            "ver": "1.0",
                                            "src": "/content-plugins/org.ekstep.iterator-1.0/renderer/plugin.js",
                                            "type": "plugin"
                                        },
                                        {
                                            "id": "org.ekstep.iterator_manifest",
                                            "plugin": "org.ekstep.iterator",
                                            "ver": "1.0",
                                            "src": "/content-plugins/org.ekstep.iterator-1.0/manifest.json",
                                            "type": "json"
                                        },
                                        {
                                            "id": "541627db-4bda-4335-b2ae-163bb2495d23",
                                            "plugin": "org.ekstep.questionset",
                                            "ver": "1.0",
                                            "src": "/content-plugins/org.ekstep.questionset-1.0/renderer/utils/telemetry_logger.js",
                                            "type": "js"
                                        },
                                        {
                                            "id": "c3929e02-3c24-45da-aaa5-433e4ee3839d",
                                            "plugin": "org.ekstep.questionset",
                                            "ver": "1.0",
                                            "src": "/content-plugins/org.ekstep.questionset-1.0/renderer/utils/html_audio_plugin.js",
                                            "type": "js"
                                        },
                                        {
                                            "id": "501b3b4b-b355-4e91-8d7d-bade53c084aa",
                                            "plugin": "org.ekstep.questionset",
                                            "ver": "1.0",
                                            "src": "/content-plugins/org.ekstep.questionset-1.0/renderer/utils/qs_feedback_popup.js",
                                            "type": "js"
                                        },
                                        {
                                            "id": "org.ekstep.questionset",
                                            "plugin": "org.ekstep.questionset",
                                            "ver": "1.0",
                                            "src": "/content-plugins/org.ekstep.questionset-1.0/renderer/plugin.js",
                                            "type": "plugin"
                                        },
                                        {
                                            "id": "org.ekstep.questionset_manifest",
                                            "plugin": "org.ekstep.questionset",
                                            "ver": "1.0",
                                            "src": "/content-plugins/org.ekstep.questionset-1.0/manifest.json",
                                            "type": "json"
                                        },
                                        {
                                            "id": "org.ekstep.questionunit.renderer.audioicon",
                                            "plugin": "org.ekstep.questionunit",
                                            "ver": "1.2",
                                            "src": "/content-plugins/org.ekstep.questionunit-1.2/renderer/assets/audio-icon.png",
                                            "type": "image"
                                        },
                                        {
                                            "id": "org.ekstep.questionunit.renderer.downarrow",
                                            "plugin": "org.ekstep.questionunit",
                                            "ver": "1.2",
                                            "src": "/content-plugins/org.ekstep.questionunit-1.2/renderer/assets/down_arrow.png",
                                            "type": "image"
                                        },
                                        {
                                            "id": "org.ekstep.questionunit.renderer.zoom",
                                            "plugin": "org.ekstep.questionunit",
                                            "ver": "1.2",
                                            "src": "/content-plugins/org.ekstep.questionunit-1.2/renderer/assets/zoom.png",
                                            "type": "image"
                                        },
                                        {
                                            "id": "org.ekstep.questionunit.renderer.audio-icon1",
                                            "plugin": "org.ekstep.questionunit",
                                            "ver": "1.2",
                                            "src": "/content-plugins/org.ekstep.questionunit-1.2/renderer/assets/audio-icon1.png",
                                            "type": "image"
                                        },
                                        {
                                            "id": "00cb2678-927c-4dc8-8dc8-64c514292323",
                                            "plugin": "org.ekstep.questionunit",
                                            "ver": "1.2",
                                            "src": "/content-plugins/org.ekstep.questionunit-1.2/renderer/components/js/components.js",
                                            "type": "js"
                                        },
                                        {
                                            "id": "4581b978-5c83-43a9-ae71-0a4c12b5baba",
                                            "plugin": "org.ekstep.questionunit",
                                            "ver": "1.2",
                                            "src": "/content-plugins/org.ekstep.questionunit-1.2/renderer/components/css/components.css",
                                            "type": "css"
                                        },
                                        {
                                            "id": "org.ekstep.questionunit",
                                            "plugin": "org.ekstep.questionunit",
                                            "ver": "1.2",
                                            "src": "/content-plugins/org.ekstep.questionunit-1.2/renderer/plugin.js",
                                            "type": "plugin"
                                        },
                                        {
                                            "id": "org.ekstep.questionunit_manifest",
                                            "plugin": "org.ekstep.questionunit",
                                            "ver": "1.2",
                                            "src": "/content-plugins/org.ekstep.questionunit-1.2/manifest.json",
                                            "type": "json"
                                        },
                                        {
                                            "id": "201c600a-c3c1-4533-ac95-6c661375b37b",
                                            "plugin": "org.ekstep.questionunit.mcq",
                                            "ver": "1.3",
                                            "src": "/content-plugins/org.ekstep.questionunit.mcq-1.3/renderer/styles/style.css",
                                            "type": "css"
                                        },
                                        {
                                            "id": "cc0c0c0c-e2db-46c4-9d77-3b9ad98a8cdb",
                                            "plugin": "org.ekstep.questionunit.mcq",
                                            "ver": "1.3",
                                            "src": "/content-plugins/org.ekstep.questionunit.mcq-1.3/renderer/styles/horizontal_and_vertical.css",
                                            "type": "css"
                                        },
                                        {
                                            "id": "eada0494-d192-41bb-9a77-0a5bd1e61016",
                                            "plugin": "org.ekstep.questionunit.mcq",
                                            "ver": "1.3",
                                            "src": "/content-plugins/org.ekstep.questionunit.mcq-1.3/renderer/template/mcq-layouts.js",
                                            "type": "js"
                                        },
                                        {
                                            "id": "7809725a-9c5a-4e2b-bda0-a237c68c5ab4",
                                            "plugin": "org.ekstep.questionunit.mcq",
                                            "ver": "1.3",
                                            "src": "/content-plugins/org.ekstep.questionunit.mcq-1.3/renderer/template/template_controller.js",
                                            "type": "js"
                                        },
                                        {
                                            "id": "e9ce59a8-3c65-47c0-a8b3-d2e719180385",
                                            "plugin": "org.ekstep.questionunit.mcq",
                                            "ver": "1.3",
                                            "src": "/content-plugins/org.ekstep.questionunit.mcq-1.3/renderer/template/question-component.js",
                                            "type": "js"
                                        },
                                        {
                                            "id": "241a9681-7610-4ecb-8610-82a09199d892",
                                            "plugin": "org.ekstep.questionunit.mcq",
                                            "ver": "1.3",
                                            "src": "/content-plugins/org.ekstep.questionunit.mcq-1.3/renderer/assets/tick_icon.png",
                                            "type": "image"
                                        },
                                        {
                                            "id": "a06c760d-9a4d-47cd-8ce9-d0397a8c1799",
                                            "plugin": "org.ekstep.questionunit.mcq",
                                            "ver": "1.3",
                                            "src": "/content-plugins/org.ekstep.questionunit.mcq-1.3/renderer/assets/audio-icon2.png",
                                            "type": "image"
                                        },
                                        {
                                            "id": "8079a389-2ea8-4d7c-a3e0-81e6c94d2ee2",
                                            "plugin": "org.ekstep.questionunit.mcq",
                                            "ver": "1.3",
                                            "src": "/content-plugins/org.ekstep.questionunit.mcq-1.3/renderer/assets/music-blue.png",
                                            "type": "image"
                                        },
                                        {
                                            "id": "org.ekstep.questionunit.mcq",
                                            "plugin": "org.ekstep.questionunit.mcq",
                                            "ver": "1.3",
                                            "src": "/content-plugins/org.ekstep.questionunit.mcq-1.3/renderer/plugin.js",
                                            "type": "plugin"
                                        },
                                        {
                                            "id": "org.ekstep.questionunit.mcq_manifest",
                                            "plugin": "org.ekstep.questionunit.mcq",
                                            "ver": "1.3",
                                            "src": "/content-plugins/org.ekstep.questionunit.mcq-1.3/manifest.json",
                                            "type": "json"
                                        },
                                        {
                                            "id": "org.ekstep.summary_template_js",
                                            "plugin": "org.ekstep.summary",
                                            "src": "/content-plugins/org.ekstep.summary-1.0/renderer/summary-template.js",
                                            "type": "js",
                                            "ver": "1.0"
                                        },
                                        {
                                            "id": "org.ekstep.summary_template_css",
                                            "plugin": "org.ekstep.summary",
                                            "src": "/content-plugins/org.ekstep.summary-1.0/renderer/style.css",
                                            "type": "css",
                                            "ver": "1.0"
                                        },
                                        {
                                            "id": "org.ekstep.summary",
                                            "plugin": "org.ekstep.summary",
                                            "src": "/content-plugins/org.ekstep.summary-1.0/renderer/plugin.js",
                                            "type": "plugin",
                                            "ver": "1.0"
                                        },
                                        {
                                            "id": "org.ekstep.summary_manifest",
                                            "plugin": "org.ekstep.summary",
                                            "src": "/content-plugins/org.ekstep.summary-1.0/manifest.json",
                                            "type": "json",
                                            "ver": "1.0"
                                        },
                                        {
                                            "assetId": "summaryImage",
                                            "id": "org.ekstep.summary_summaryImage",
                                            "preload": true,
                                            "src": "/content-plugins/org.ekstep.summary-1.0/assets/summary-icon.jpg",
                                            "type": "image"
                                        },
                                        {
                                            "id": "QuizImage",
                                            "src": "/content-plugins/org.ekstep.questionset-1.0/editor/assets/quizimage.png",
                                            "assetId": "QuizImage",
                                            "type": "image",
                                            "preload": true
                                        }
                                    ]
                                },
                                "plugin-manifest": {
                                    "plugin": [
                                        {
                                            "id": "org.ekstep.navigation",
                                            "ver": "1.0",
                                            "type": "plugin",
                                            "depends": ""
                                        },
                                        {
                                            "id": "org.ekstep.questionset.quiz",
                                            "ver": "1.0",
                                            "type": "plugin",
                                            "depends": ""
                                        },
                                        {
                                            "id": "org.ekstep.iterator",
                                            "ver": "1.0",
                                            "type": "plugin",
                                            "depends": ""
                                        },
                                        {
                                            "id": "org.ekstep.questionset",
                                            "ver": "1.0",
                                            "type": "plugin",
                                            "depends": "org.ekstep.questionset.quiz,org.ekstep.iterator"
                                        },
                                        {
                                            "id": "org.ekstep.questionunit",
                                            "ver": "1.2",
                                            "type": "plugin",
                                            "depends": ""
                                        },
                                        {
                                            "id": "org.ekstep.questionunit.mcq",
                                            "ver": "1.3",
                                            "type": "plugin",
                                            "depends": "org.ekstep.questionunit"
                                        },
                                        {
                                            "depends": "",
                                            "id": "org.ekstep.summary",
                                            "type": "plugin",
                                            "ver": "1.0"
                                        }
                                    ]
                                },
                                "compatibilityVersion": 2
                            }
                        })
                    }

                    // Call updateContent with the prepared data
                    await updateContent(identifier, versionKey, updateData);
                    statusReport[statusReport.length - 1][statusReport[0].length - 2] = 'Draft';
                    console.log(`Content ${code} created and updated successfully with total score ${totalScore}`);

                    // Send content for review
                    await reviewContent(identifier);
                    statusReport[statusReport.length - 1][statusReport[0].length - 2] = 'In Review';
                    console.log(`Content ${code} sent for review`);

                    // Publish the content
                    await publishContent(identifier);
                    statusReport[statusReport.length - 1][statusReport[0].length - 2] = 'Live';
                    console.log(`Content ${code} published successfully`);
                } catch (error: any) {
                    const currentStatus = statusReport[statusReport.length - 1];
                    currentStatus[currentStatus.length - 1] = error.message;
                    if (!currentStatus[currentStatus.length - 2]) {
                        currentStatus[currentStatus.length - 2] = 'Draft';
                    }
                }
            }
        }
        console.log('Content processing completed');
    } catch (error) {
        console.error('Error processing content CSV:', error);
        process.exit(1);
    }
}

async function generateQuizQuestionStatus() {
    try {
        // Create results directory if it doesn't exist
        const resultsDir = path.join(__dirname, '..', 'results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir);
        }

        // Get all content data
        const contentRows = await parseCsv(assessmentConfig.contentCsvPath);
        const quizQuestionStatus = [['quiz_code', 'question_code', 'question_creation_status', 'question_attachment_status', 'error_message']];

        for (const row of contentRows.slice(1)) { // Skip header
            if (row.length >= 3) {
                const code = row[0];
                const questionCodes = row[2].split(',');

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
    } catch (error) {
        console.error('Error generating quiz-question status:', error);
        process.exit(1);
    }
}


async function main() {
    try {
        // First process questions and build the mapping
        await getAuthToken()
        
        console.log('Starting question processing...');
        await processQuestionCsv();

        await generateQuizQuestionStatus();

        // Then process content
        console.log('Starting content processing...');
        await processContentCsv();
    } catch (error) {
        console.error('Processing failed:', error);
        process.exit(1);
    }
}

main();