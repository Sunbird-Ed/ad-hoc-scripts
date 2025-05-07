export const assessmentConfig = {
    csvPath: process.env.CSV_PATH || './data/assessment_create.csv',
    questionCsvPath: process.env.QUESTION_CSV_PATH || './data/questions.csv',
    createdBy: process.env.CREATED_BY || '927c2094-987f-4e8f-8bd5-8bf93e3d2e8a',
    organisation: process.env.ORGANISATION ? [process.env.ORGANISATION] : ['Fmps'],
    framework: process.env.FRAMEWORK || 'FMPS',
    mimeType: process.env.MIME_TYPE || 'application/vnd.ekstep.ecml-archive',
    creator: process.env.CREATOR || 'Content Creator FMPS',
    channelId: process.env.CHANNEL_ID || '01429195271738982411',
    contentCsvPath: process.env.CONTENT_CSV_PATH || './data/assessment_create.csv'
};