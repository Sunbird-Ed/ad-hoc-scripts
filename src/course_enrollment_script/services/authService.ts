import axios from "axios";
import { config } from "../config/config";
import { routes } from "../config/routes";
import parseCsv from "../../services/csv";
import { courseConfig } from "../config/courseConfig";

function extractUserIdFromToken(token: string): string {
    try {
        // Get the payload part of the JWT (second part)
        const payload = token.split('.')[1];
        // Decode the base64 string
        const decodedPayload = Buffer.from(payload, 'base64').toString();
        // Parse the JSON
        const tokenData = JSON.parse(decodedPayload);
        // Extract userId from sub claim
        const userId = tokenData.sub.split(':').pop();
        return userId;
    } catch (error) {
        console.error('Error extracting user ID from token:');
        throw error;
    }
}

async function getEmailFromCsv(learnerCode: string): Promise<string | null> {
    try {
        const rows = await parseCsv(courseConfig.userLearnerPath);
        const dataRows = rows.slice(1);
        for (const record of dataRows) {
            const email = record[0];
            const csvLearnerCode = record[1];

            if (csvLearnerCode === learnerCode) {
                return email;
            }
        }
        return null;
    } catch (error) {
        console.error('Error reading CSV:');
        throw error;
    }
}

export async function getUserId(learnerCode: string): Promise<{ accessToken: string, userId: string }> {
    const email = await getEmailFromCsv(learnerCode);
    if (!email) {
        throw new Error(`No email found for learner code: ${learnerCode}`);
    }

    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': config.apiAuthKey
    };

    const tokenData = new URLSearchParams({
        'client_id': config.clientId,
        'client_secret': config.clientSecret,
        'grant_type': config.grant_type,
        'username': email // Using email from CSV instead of config
    });

    try {
        // Get initial token
        const tokenResponse = await axios.post(
            `${config.baseUrl}${routes.getRefeshToken}`,
            tokenData,
            { headers }
        );

        const refreshToken = tokenResponse.data.refresh_token;

        // Use refresh token to get access token
        const refreshData = new URLSearchParams({
            'refresh_token': refreshToken
        });

        const refreshResponse = await axios.post(
            `${config.baseUrl}${routes.getToken}`,
            refreshData,
            { headers }
        );

        const accessToken = refreshResponse.data.result.access_token;
        const userId = extractUserIdFromToken(accessToken);

        return { accessToken, userId };
    } catch (error) {
        console.error('Invalid user credentials for course enrollment');
        throw error;
    }
}