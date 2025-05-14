import axios from "axios";
import { config } from "../config/config";
import { routes } from "../config/routes";
import { courseConfig } from "../config/courseConfig";
import globalConfig from "../../globalConfigs";
import _ from "lodash";

export async function searchCourse(courseCode: string): Promise<{ identifier: string, name: string }> {
    try {
        const response = await axios({
            method: 'post',
            url: `${config.baseUrl}${routes.searchCourse}`,
            headers: {
                'Content-Type': 'application/json',
                'X-Channel-Id': config.channelId,
                'Authorization': config.apiAuthKey,
                'x-authenticated-user-token': globalConfig.creatorUserToken
            },
            data: {
                request: {
                    filters: {
                        status: [
                            "Draft",
                            "FlagDraft",
                            "Review",
                            "Processing",
                            "Live",
                            "Unlisted",
                            "FlagReview"
                        ],
                        code: courseCode,
                        createdBy: "927c2094-987f-4e8f-8bd5-8bf93e3d2e8a",
                        primaryCategory: [
                            "Course"
                        ],
                        objectType: "Content"
                    },
                    offset: 0,
                    query: "",
                    sort_by: {
                        lastUpdatedOn: "desc"
                    }
                }
            }
        });

        if (response.data.responseCode === 'OK' && response.data.result.content) {
            if (_.isArray(response.data.result.content)) {
                return { identifier: response.data.result.content[0].identifier, name: response.data.result.content[0].name };
            }
            return { identifier: response.data.result.content.identifier, name: response.data.result.content.name };
        }
        return { identifier: "", name: "" };
    } catch (error) {
        console.error(`Error searching for course ${courseCode}:`);
        throw error;
    }
}

export async function createLearnerProfile(learnerCode: string, nodeIds: string[], record: Record<string,any>) {
    try {
        const children = nodeIds.map((nodeId, index) => ({
            identifier: nodeId,
            index: index
        }));

        const response = await axios({
            method: 'post',
            url: `${config.baseUrl}${routes.createLearnerProfile}`,
            headers: {
                'Content-Type': 'application/json',
                'X-Channel-Id': config.channelId,
                'Authorization': config.apiAuthKey,
                'x-authenticated-user-token': globalConfig.creatorUserToken
            },
            data: {
                request: {
                    collection: {
                        name: record['learner_profile'], // Using 2nd row from CSV for name
                        code: learnerCode,
                        description: "Enter description for Learner Profile",
                        createdBy: courseConfig.createdBy,
                        organisation: courseConfig.organisation,
                        createdFor: [courseConfig.channelId],
                        framework: courseConfig.framework,
                        mimeType: "application/vnd.ekstep.content-collection",
                        creator: courseConfig.creator,
                        expiry_date: record['expiry_date'], // Using 4th row from CSV for expiry_date
                        primaryCategory: "Learner Profile",
                        children: children
                    }
                }
            }
        });

        console.log(`Created learner profile for ${learnerCode}:`, JSON.stringify(response.data));
        return response.data.result.identifier;
    } catch (error) {
        console.error(`Error creating learner profile for ${learnerCode}:`);
        throw error;
    }
}

export async function updateLearnerProfile(
    learnerCode: string,
    learnerId: string,
    courseMapping: Map<any, string>,
    record: Record<string,any>
) {
    try {
        const children: string[] = [];
        const hierarchyNodes: Record<string, any> = {};

        // Build the child nodes from the courseMapping
        for (const [nodeId, name] of courseMapping.entries()) {
            const stringNodeId = String(nodeId); // convert all keys to string
            children.push(stringNodeId);

            hierarchyNodes[stringNodeId] = {
                name,
                children: [],
                root: false
            };
        }

        // Create the PATCH payload structure
        const payload = {
            request: {
                data: {
                    nodesModified: {
                        [learnerId]: {
                            root: true,
                            objectType: "Content",
                            metadata: {
                                name: record["learner_profile"],
                                code: learnerCode,
                                description: "Learner Profile for course enrollment",
                                createdBy: courseConfig.createdBy,
                                organisation: courseConfig.organisation,
                                createdFor: [config.channelId],
                                framework: courseConfig.framework,
                                mimeType: "application/vnd.ekstep.content-collection",
                                creator: courseConfig.creator,
                                expiry_date: record["expiry_date"],
                                primaryCategory: "Learner Profile"
                            },
                            isNew: false
                        }
                    },
                    hierarchy: {
                        [learnerId]: {
                            name: record[1],
                            children,
                            root: true
                        },
                        ...hierarchyNodes
                    },
                    lastUpdatedBy: courseConfig.createdBy
                }
            }
        };

        // Send PATCH request
        const response = await axios({
            method: 'patch',
            url: `${config.baseUrl}${routes.updateLearnerProfile}`, // should be /api/collection/v1/hierarchy/update
            headers: {
                'Content-Type': 'application/json',
                'X-Channel-Id': config.channelId,
                'Authorization': config.apiAuthKey,
                'x-authenticated-user-token': globalConfig.creatorUserToken
            },
            data: payload
        });

        console.log(`Updated learner profile for ${learnerCode}:`, JSON.stringify(response.data));
        return response.data;
    } catch (error) {
        console.error(`Error updating learner profile for ${learnerCode}:`, error);
        throw error;
    }
}


export async function getBatchList(courseId: string): Promise<string | null> {
    try {
        const response = await axios({
            method: 'post',
            url: `${config.baseUrl}${routes.listBatch}`,
            headers: {
                'Content-Type': 'application/json',
                'X-Channel-Id': config.channelId,
                'Authorization': config.apiAuthKey,
                'x-authenticated-user-token': globalConfig.creatorUserToken
            },
            data: {
                request: {
                    filters: {
                        status: "1",
                        courseId: courseId,
                        enrollmentType: "open"
                    },
                    sort_by: {
                        createdDate: "desc"
                    }
                }
            }
        });

        if (response.data.responseCode === 'OK' &&
            response.data.result.response &&
            response.data.result.response.content &&
            response.data.result.response.content.length > 0) {
            // Return only the first batch ID
            return response.data.result.response.content[0].id;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching batch list for ${courseId}:`);
        return null;
    }
}

export async function enrollInCourse(courseId: string, batchId: string, userId: string, userToken: string) {
    try {
        const response = await axios({
            method: 'post',
            url: `${config.baseUrl}${routes.enrollUser}`,
            headers: {
                'Content-Type': 'application/json',
                'X-Channel-Id': config.channelId,
                'Authorization': config.apiAuthKey,
                'x-authenticated-user-token': userToken
            },
            data: {
                request: {
                    courseId: courseId,
                    batchId: batchId,
                    userId: userId
                }
            }
        });
        console.log(`Successfully enrolled in course ${courseId}, batch ${batchId}`);
        return response.data;
    } catch (error) {
        console.error(`Error enrolling in course ${courseId}, batch ${batchId}:`);
        throw error;
    }
}

export async function publishContent(identifier: string): Promise<void> {
    const headers = {
        'X-Channel-Id': courseConfig.channelId,
        'Content-Type': 'application/json',
        'Authorization': config.apiAuthKey,
        'x-authenticated-user-token': globalConfig.reviewerUserToken
    };

    const body = {
        request: {
            content: {
                lastPublishedBy: courseConfig.createdBy
            }
        }
    };

    try {
        const response = await axios.post(`${config.baseUrl}${routes.publishContent}/${identifier}`, body, { headers });
    } catch (error) {
        console.error('Publish API Error:');
        throw error;
    }
}

export async function searchLearnerProfile(profileCode: string): Promise<string | null> {
    const headers = {
        'Content-Type': 'application/json',
        'X-Channel-Id': config.channelId,
        'Authorization': config.apiAuthKey,
        'x-authenticated-user-token': globalConfig.creatorUserToken
    };

    const body = {
        request: {
            filters: {
                code: profileCode
            }
        }
    };

    try {
        const response = await axios.post(`${config.baseUrl}${routes.searchCourse}`, body, { headers });
        const content = response.data.result.content;
        const count = response.data.result.count;

        if (count === 0 || !content || content.length === 0) {
            console.log(`No content found for learner profile ${profileCode}`);
            return null;
        }

        const profile = content[0];
        if (profile.contentType !== 'Resource' || !profile.children || profile.primaryCategory !== 'Learner Profile') {
            console.log(`Invalid learner profile ${profileCode}: wrong content type or missing required fields`);
            return null;
        }

        return profile.identifier;
    } catch (error) {
        console.error(`Error searching for learner profile ${profileCode}:`, error);
        return null;
    }
}

export async function getProfileCourses(profileId: string): Promise<string[]> {
    const headers = {
        'Content-Type': 'application/json',
        'X-Channel-Id': config.channelId,
        'Authorization': config.apiAuthKey,
        'x-authenticated-user-token': globalConfig.creatorUserToken
    };

    try {
        const response = await axios.get(`${config.baseUrl}${routes.readContent}/${profileId}`, { headers });
        const children = response.data.result.content.children;

        if (!children || !Array.isArray(children)) {
            console.log(`No courses found in learner profile ${profileId}`);
            return [];
        }

        return children.map(child => child.identifier);
    } catch (error) {
        console.error(`Error getting courses for profile ${profileId}:`, error);
        return [];
    }
}

export async function getCourseNodeIds(courseIds: string[]): Promise<{ [nodeId: string]: string }> {
    const nodeIdToCourseCodeMap: { [nodeId: string]: string } = {};
    for (const courseId of courseIds) {
        const headers = {
            'Content-Type': 'application/json',
            'X-Channel-Id': config.channelId,
            'Authorization': config.apiAuthKey,
            'x-authenticated-user-token': globalConfig.creatorUserToken
        };

        try {
            const response = await axios.get(`${config.baseUrl}${routes.readContent}/${courseId}`, { headers });
            const { status, contentType, code } = response.data.result.content;
            if (status !== 'Live' || contentType !== 'Course' || !code) {
                console.log(`Invalid course ${courseId}: wrong status or content type or missing required fields`);
                continue;
            }
            nodeIdToCourseCodeMap[courseId] = code;
        } catch (error) {
            console.error(`Error searching for course ${courseId}:`, error);
        }
    }
    return nodeIdToCourseCodeMap;
}