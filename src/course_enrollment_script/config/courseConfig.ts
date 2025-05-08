import globalConfig from "../../globalConfigs";

export const courseConfig = {
    learnerCoursePath: process.env.LEARNER_COURSE_CSV_PATH || './data/learner-profile-course.csv',
    userLearnerPath: process.env.USER_LEARNER_PATH || './data/user-learner-profile.csv',
    createdBy: globalConfig.createdBy || '927c2094-987f-4e8f-8bd5-8bf93e3d2e8a',
    organisation: globalConfig.organisation || ['FMPS Org'],
    framework: globalConfig.framework || 'FMPS',
    creator: globalConfig.creator || 'Content Creator FMPS',
    channelId: globalConfig.channelId || '01429195271738982411'
}