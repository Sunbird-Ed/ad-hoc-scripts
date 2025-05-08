import axios from 'axios';
import { assessmentConfig } from '../config/quizConfigs';
import { questionConfig } from '../config/questionConfigs';
import { routes } from '../config/routes';
import { QuestionResponse } from '../types';
import { config } from '../config/config';
import globalConfig from '../../globalConfigs';

interface Option {
    text: string;
    image: string;
    audio: string;
    audioName: string;
    hint: string;
    isCorrect: boolean;
}

interface QuestionBody {
    data: {
        plugin: {
            id: string;
            version: string;
            templateId: string;
        };
        data: {
            question: {
                text: string;
                image: string;
                audio: string;
                audioName: string;
                hint: string;
            };
            options: Option[];
            questionCount: number;
            media: any[];
        };
        config: {
            metadata: {
                max_score: number;
                isShuffleOption: boolean;
                isPartialScore: boolean;
                evalUnordered: boolean;
                templateType: string;
                name: string;
                title: string;
                copyright: string;
                qlevel: string;
                category: string;
            };
            max_time: number;
            max_score: number;
            partial_scoring: boolean;
            layout: string;
            isShuffleOption: boolean;
            questionCount: number;
            evalUnordered: boolean;
        };
        media: any[];
    };
}

export async function createQuestion(
    code: string,
    title: string,
    optionPairs: { text: string; isCorrect: boolean }[],
    maxScore: number
): Promise<string> {
    const options: Option[] = optionPairs.map((pair, index) => ({
        text: `<p>${pair.text}</p>\n`,
        image: "",
        audio: "",
        audioName: "",
        hint: "",
        isCorrect: pair.isCorrect
    }));

    const questionBody: QuestionBody = {
        data: {
            plugin: questionConfig.plugin,
            data: {
                question: {
                    text: `<p>${title}</p>\n`,
                    image: "",
                    audio: "",
                    audioName: "",
                    hint: ""
                },
                options,
                questionCount: 0,
                media: []
            },
            config: {
                metadata: {
                    max_score: maxScore,
                    isShuffleOption: questionConfig.metadata.isShuffleOption,
                    isPartialScore: questionConfig.metadata.partial_scoring,
                    evalUnordered: false,
                    templateType: questionConfig.metadata.layout,
                    name: `${title}\n`,
                    title: `${title}\n`,
                    copyright: questionConfig.metadata.copyright,
                    qlevel: "EASY",
                    category: "MCQ"
                },
                max_time: 0,
                max_score: maxScore,
                partial_scoring: questionConfig.metadata.partial_scoring,
                layout: questionConfig.metadata.layout,
                isShuffleOption: questionConfig.metadata.isShuffleOption,
                questionCount: 1,
                evalUnordered: false
            },
            media: []
        }
    };

    const requestBody = {
        request: {
            assessment_item: {
                objectType: questionConfig.defaultValues.objectType,
                metadata: {
                    code,
                    isShuffleOption: questionConfig.metadata.isShuffleOption,
                    body: JSON.stringify(questionBody),
                    itemType: questionConfig.defaultValues.itemType,
                    version: questionConfig.defaultValues.version,
                    category: questionConfig.defaultValues.category,
                    createdBy: assessmentConfig.createdBy,
                    channel: assessmentConfig.channelId,
                    type: questionConfig.defaultValues.type,
                    template: questionConfig.defaultValues.template,
                    template_id: questionConfig.defaultValues.template_id,
                    framework: assessmentConfig.framework,
                    max_score: maxScore,
                    isPartialScore: questionConfig.metadata.partial_scoring,
                    evalUnordered: false,
                    templateType: questionConfig.metadata.layout,
                    name: `${title}\n`,
                    title: `${title}\n`,
                    copyright: questionConfig.metadata.copyright,
                    qlevel: "EASY",
                    options: [
                        {
                            answer: true,
                            value: {
                                type: "text",
                                asset: "1"
                            }
                        }
                    ]
                },
                outRelations: []
            }
        }
    };

    const headers = {
        'X-Channel-Id': assessmentConfig.channelId,
        'Content-Type': 'application/json',
        'Authorization': config.apiAuthKey,
        'x-authenticated-user-token': globalConfig.userToken
    };

    try {
        const response = await axios.post<QuestionResponse>(`${config.baseUrl}${routes.createQuestion}`, requestBody, { headers });
        console.log('Question Creation Response:', response.data);
        return response.data.result.node_id;
    } catch (error) {
        throw error;
    }
}