const globalConfig = {
    baseUrl: process.env.BASE_URL || 'https://dev-fmps.sunbirded.org',
    apiAuthKey: process.env.AUTH_KEY || '',
    username: process.env.USERNAME || 'contentcreator-fmps@yopmail.com',
    password: process.env.PASSWORD || 'CreatorFmps@123',
    userToken: process.env.TOKEN || '',
    clientId: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',
    grant_type: process.env.GRANT_TYPE || 'password',
    channelId: process.env.CHANNEL_ID || '01429195271738982411',
    createdBy: process.env.CREATED_BY || '927c2094-987f-4e8f-8bd5-8bf93e3d2e8a',
    organisation: process.env.ORGANISATION ? [process.env.ORGANISATION] : ['FMPS Org'],
    framework: process.env.FRAMEWORK || 'FMPS',
    mimeType: process.env.MIME_TYPE || 'application/vnd.ekstep.ecml-archive',
    creator: process.env.CREATOR || 'Content Creator FMPS',
}

export default globalConfig;