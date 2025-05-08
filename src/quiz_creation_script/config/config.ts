import globalConfig from "../../globalConfigs"

export const config = {
    baseUrl: globalConfig.baseUrl || 'https://dev-fmps.sunbirded.org',
    apiAuthKey: globalConfig.apiAuthKey || '',
    username: globalConfig.username || 'contentcreator-fmps@yopmail.com',
    password: globalConfig.password || 'CreatorFmps@123',
    userToken: globalConfig.userToken || '',
    clientId: globalConfig.clientId || '',
    clientSecret: globalConfig.clientSecret || '',
    grant_type: globalConfig.grant_type || 'password',
    channelId: globalConfig.channelId || '01429195271738982411'
}