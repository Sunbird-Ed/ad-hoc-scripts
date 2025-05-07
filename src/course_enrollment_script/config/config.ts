import globalConfig from "../../globalConfigs"

export const config = {
    baseUrl: globalConfig.baseUrl || 'https://dev-fmps.sunbirded.org',
    apiAuthKey: globalConfig.apiAuthKey || 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhcGlfYWRtaW4ifQ.-qfZEwBAoHFhxNqhGq7Vy_SNVcwB1AtMX8xbiVHF5FQ',
    username: globalConfig.username || 'contentcreator-fmps@yopmail.com',
    password: globalConfig.password || 'CreatorFmps@123',
    userToken: globalConfig.userToken || '',
    clientId: globalConfig.clientId || 'direct-grant',
    clientSecret: globalConfig.clientSecret || 'direct-grantfmps12345678',
    grant_type: globalConfig.grant_type || 'password',
    channelId: globalConfig.channelId || '01429195271738982411'
}