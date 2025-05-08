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
                'x-authenticated-user-token': globalConfig.userToken
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

export async function createLearnerProfile(learnerCode: string, nodeIds: string[], record: string[]) {
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
                'x-authenticated-user-token': globalConfig.userToken
            },
            data: {
                request: {
                    collection: {
                        name: record[1], // Using 2nd row from CSV for name
                        code: learnerCode,
                        description: "Enter description for Learner Profile",
                        createdBy: courseConfig.createdBy,
                        organisation: courseConfig.organisation,
                        createdFor: [courseConfig.channelId],
                        framework: courseConfig.framework,
                        mimeType: "application/vnd.ekstep.content-collection",
                        creator: courseConfig.creator,
                        expiry_date: record[3], // Using 4th row from CSV for expiry_date
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
    record: string[]
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
                  name: record[1],
                  code: learnerCode,
                  description: "Learner Profile for course enrollment",
                  createdBy: courseConfig.createdBy,
                  organisation: courseConfig.organisation,
                  createdFor: [config.channelId],
                  framework: courseConfig.framework,
                  mimeType: "application/vnd.ekstep.content-collection",
                  creator: courseConfig.creator,
                  expiry_date: record[3],
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
          'x-authenticated-user-token': globalConfig.userToken
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
                'x-authenticated-user-token': globalConfig.userToken
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
        'x-authenticated-user-token': globalConfig.userToken
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
        console.log('Publish API Response:', response.data);
    } catch (error) {
        console.error('Publish API Error:');
        throw error;
    }
}