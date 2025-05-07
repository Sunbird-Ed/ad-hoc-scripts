export const config = {
    baseUrl: process.env.BASE_URL || 'https://dev-fmps.sunbirded.org',
    apiAuthKey: process.env.API_KEY || 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhcGlfYWRtaW4ifQ.-qfZEwBAoHFhxNqhGq7Vy_SNVcwB1AtMX8xbiVHF5FQ',
    username: process.env.USERNAME || 'admin',
    password: process.env.PASSWORD || 'admin',
    userToken: process.env.TOKEN || '',
    clientId: process.env.CLIENT_ID || 'direct-grant',
    clientSecret: process.env.CLIENT_SECRET || 'direct-grantfmps12345678',
    grant_type: process.env.GRANT_TYPE || 'password',
}