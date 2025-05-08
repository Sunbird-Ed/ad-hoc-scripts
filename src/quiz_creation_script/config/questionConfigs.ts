export const questionConfig = {
    plugin: {
        id: process.env.PLUGIN_ID || 'org.ekstep.questionunit.mcq',
        version: process.env.PLUGIN_VERSION || '1.3',
        templateId: process.env.TEMPLATE_ID || 'horizontalMCQ'
    },
    defaultValues: {
        template: 'NA',
        template_id: 'NA',
        version: 2,
        itemType: 'UNIT',
        objectType: 'AssessmentItem',
        category: 'MCQ',
        type: 'mcq'
    },
    metadata: {
        copyright: process.env.COPYRIGHT || 'FMPS Org',
        partial_scoring: process.env.PARTIAL_SCORING === 'false' ? false : true,
        layout: process.env.LAYOUT || 'Horizontal',
        isShuffleOption: process.env.IS_SHUFFLE_OPTION === 'true' ? true : false
    }
};