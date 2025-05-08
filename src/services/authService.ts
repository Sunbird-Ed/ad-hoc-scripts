import axios from "axios";
import globalConfig from "../globalConfigs";
import { routes } from "../course_enrollment_script/config/routes";

export async function getAuthToken(): Promise<string> {
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': globalConfig.apiAuthKey
    };

    const tokenData = new URLSearchParams({
        'client_id': globalConfig.clientId,
        'client_secret': globalConfig.clientSecret,
        'grant_type': globalConfig.grant_type,
        'username': globalConfig.username,
        'password': globalConfig.password,
    });

    try {
        // Get initial token
        const tokenResponse = await axios.post(
            `${globalConfig.baseUrl}${routes.getRefeshToken}`,
            tokenData,
            { headers }
        );

        const refreshToken = tokenResponse.data.refresh_token;

        // Use refresh token to get access token
        const refreshData = new URLSearchParams({
            'refresh_token': refreshToken
        });

        const refreshResponse = await axios.post(
           `${globalConfig.baseUrl}${routes.getToken}`,
            refreshData,
            { headers }
        );

        const accessToken = refreshResponse.data.result.access_token;

        // Update the config file with the new token
        globalConfig.userToken = accessToken;

        return accessToken;
    } catch (error) {
        throw error;
    }
}