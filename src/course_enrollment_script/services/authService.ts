import axios from "axios";
import { config } from "../config/config";
import { routes } from "../config/routes";

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

export async function getUserId(userId: string): Promise<{ accessToken: string, userId: string }> {
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': config.apiAuthKey
    };

    const tokenData = new URLSearchParams({
        'client_id': config.clientId,
        'client_secret': config.clientSecret,
        'grant_type': config.grant_type,
        'username': userId // Using email from CSV instead of config
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