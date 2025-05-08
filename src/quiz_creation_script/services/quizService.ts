import axios from 'axios';
import { assessmentConfig } from '../config/quizConfigs';
import { routes } from '../config/routes';
import { questionConfig } from '../config/questionConfigs';
import { config } from '../config/config';
import globalConfig from '../../globalConfigs';

interface ContentRequestBody {
    request: {
        content: {
            code: string;
            name: string;
            maxAttempts: number;
            description: string;
            createdBy: string;
            organisation: string[];
            createdFor: string[];
            framework: string;
            mimeType: string;
            creator: string;
            contentType: string;
        }
    }
}

interface ContentUpdateRequestBody {
    request: {
        content: {
            versionKey: string;
            lastUpdatedBy: string;
            stageIcons: string;
            totalQuestions: number;
            totalScore: number;
            questions: Array<{ identifier: string }>;
            assets: any[];
            editorState: string;
            pragma: any[];
            plugins: Array<{
                identifier: string;
                semanticVersion: string;
            }>;
            body: string;
            copyright: string;
            organisation: string[];
        }
    }
}

export async function createAssessment(
    code: string,
    name: string,
    maxAttempts: number,
    contentType: string
): Promise<{ identifier: string; versionKey: string }> {
    const body: ContentRequestBody = {
        request: {
            content: {
                code,
                name,
                maxAttempts,
                description: "Enter description for Assessment",
                createdBy: assessmentConfig.createdBy,
                organisation: assessmentConfig.organisation,
                createdFor: [assessmentConfig.channelId],
                framework: assessmentConfig.framework,
                mimeType: assessmentConfig.mimeType,
                creator: assessmentConfig.creator,
                contentType
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
        const response = await axios.post(`${config.baseUrl}${routes.createContent}`, body, { headers });
        console.log('API Response:', response.data);
        return {
            identifier: response.data.result.content_id,
            versionKey: response.data.result.versionKey
        };
    } catch (error) {
        console.error('API Error:');
        throw error;
    }
}

export async function updateContent(
    nodeId: string,
    versionKey: string,
    updateData: Partial<ContentUpdateRequestBody['request']['content']>
): Promise<void> {
    const body = {
        request: {
            content: {
                versionKey,
                lastUpdatedBy: assessmentConfig.createdBy,
                stageIcons: updateData.stageIcons || "",
                totalQuestions: updateData.totalQuestions || 0,
                totalScore: updateData.totalScore || 0,
                questions: updateData.questions || [],
                assets: updateData.assets || [],
                editorState: updateData.editorState || "",
                pragma: updateData.pragma || [],
                plugins: updateData.plugins || [],
                body: updateData.body || "",
                copyright: questionConfig.metadata.copyright,
                organisation: assessmentConfig.organisation || [],
                consumerId: assessmentConfig.createdBy || ''
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
        const response = await axios.patch(`${config.baseUrl}${routes.updateContent}/${nodeId}`, body, { headers });
        console.log('Update API Response:', response.data);
    } catch (error) {
        console.error('Update API Error:');
        throw error;
    }
}

export async function getAssessmentItem(identifier: string): Promise<any> {
    const headers = {
        'Authorization': config.apiAuthKey,
    };

    try {
        const response = await axios.get(`${config.baseUrl}${routes.questionsRead}/${identifier}`, { headers });
        console.log(`Fetched assessment item ${identifier}`);
        return response.data;
    } catch (error) {
        console.error(`Error fetching assessment item ${identifier}:`);
        throw error;
    }
}

export async function reviewContent(identifier: string): Promise<void> {
    const headers = {
        'X-Channel-Id': assessmentConfig.channelId,
        'Content-Type': 'application/json',
        'Authorization': config.apiAuthKey,
        'x-authenticated-user-token': globalConfig.userToken
    };

    const body = {
        request: {
            content: {}
        }
    };

    try {
        const response = await axios.post(`${config.baseUrl}${routes.reviewContent}/${identifier}`, body, { headers });
        console.log('Review API Response:', response.data);
    } catch (error) {
        console.error('Review API Error:');
        throw error;
    }
}

export async function publishContent(identifier: string): Promise<void> {
    const headers = {
        'X-Channel-Id': assessmentConfig.channelId,
        'Content-Type': 'application/json',
        'Authorization': config.apiAuthKey,
        'x-authenticated-user-token': globalConfig.userToken
    };

    const body = {
        request: {
            content: {
                lastPublishedBy: assessmentConfig.createdBy
            }
        }
    };

    try {
        const response = await axios.post(`${config.baseUrl}${routes.publishContent}/${identifier}`, body, { headers });
        console.log('Publish API Response:', response.data);
    } catch (error) {
        console.error('Publish API Error:' );
        throw error;
    }
}