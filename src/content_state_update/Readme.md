## Input Data

The script processes a CSV file containing user email addresses and their corresponding course codes. The CSV should have the following format:

```csv
email,course_code
exampleuser1@gmail.com,"fmps-course-001, fmps-course-002"
exampleuser2@gmail.com,fmps-course-001
```

### Assumptions

1. Each email address in the CSV must correspond to a valid user in the system
2. The course_code must be valid and exist in the system
3. Each user must be enrolled in the course specified by the course_code

## Prerequisites

Before using these APIs, ensure you have the following credentials:
- Host URL (`{{host}}`)
- API Key (`{{apikey}}`)
- Client ID (`{{client_id}}`)
- Client Secret (`{{client_secret}}`)
- Grant Type (`{{grant_type}}`)
- Channel ID (`{{channel_id}}`)
- Valid user credentials (username/password)

## API Workflow

### 1. Getting the User ID

#### Step 1: Generate User Keycloak Token
```bash
curl --location --request POST '{{host}}/auth/realms/sunbird/protocol/openid-connect/token' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--header 'Authorization: Bearer {{apikey}}' \
--data-urlencode 'client_id={{client_id}}' \
--data-urlencode 'client_secret={{client_secret}}' \
--data-urlencode 'grant_type={{grant_type}}' \
--data-urlencode 'username={{username}}' \
--data-urlencode 'password={{password}}'
```

#### Step 2: Generate New Access Token using Refresh Token
```bash
curl --location --request POST '{{host}}/auth/v1/refresh/token' \
--header 'Authorization: Bearer {{apikey}}'\
--header 'Content-Type: application/x-www-form-urlencoded' \
--data-urlencode 'refresh_token={{user_refresh_token}}'
```

#### Step 3: Retrieve User ID
```bash
curl --location --request POST '{{host}}/api/user/v1/search' \
--header 'Authorization: Bearer {{apikey}}' \
--header 'x-authenticated-user-token: {{user_access_token}}' \
--header 'Content-Type: application/json' \
--data-raw '{
    "request": {
        "filters": {
        "email": "{{email}}"
        }
    }
}'
```

### 2. Course and Content Information Retrieval

#### Step 1: Generate Creator Keycloak Token
```bash
curl --location --request POST '{{host}}/auth/realms/sunbird/protocol/openid-connect/token' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--header 'Authorization: Bearer {{apikey}}' \
--data-urlencode 'client_id={{client_id}}' \
--data-urlencode 'client_secret={{client_secret}}' \
--data-urlencode 'grant_type={{grant_type}}' \
--data-urlencode 'username=contentcreator@yopmail.com' \
--data-urlencode 'password={{password}}'
```

#### Step 2: Generate New Creator Access Token
```bash
curl --location --request POST '{{host}}/auth/v1/refresh/token' \
--header 'Authorization: Bearer {{apikey}}' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--data-urlencode 'refresh_token={{creator_refresh_token}}'
```

#### Step 3: Search for Course
```bash
curl --location '{{host}}/api/composite/v1/search' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json' \
--header 'X-Channel-Id: {{channel_id}}' \
--header 'Authorization: Bearer {{creator_access_token}}' \
--header 'x-authenticated-user-token: {{user_token}}' \
--data '{
    "request": {
        "filters": {
            "code": "{{course_code}}"
        }
    }
}'
```

**Note:** From the response, extract:
- The `identifier` field as the `course_id`
- The `batchId` field from the list of `batches`

#### Step 4: Retrieve Course Hierarchy
```bash
curl --location --request GET '{{host}}/api/collection/v1/hierarchy/{{course_id}}' \
--header 'Accept: application/json' \
--header 'Authorization: Bearer {{apikey}}' \
--header 'x-authenticated-user-token: {{creator_access_token}}'
```

**Note:** The course hierarchy follows this structure:
- Course
  - CourseUnit
    - Content

Extract the `identifier` from the nested children in the response, which will be the content_id

### 3. Update Content State

```bash
curl --location --request PATCH '{{host}}/api/course/v1/content/state/update' \
--header 'Content-Type: application/json' \
--header 'X-Channel-Id: {{channel_id}}' \
--header 'Authorization: Bearer {{apikey}}' \
--header 'x-authenticated-user-token: {{user_access_token}}' \
--data '{
    "request": {
        "userId": "{{user_id}}",
        "contents": [
            {
                "contentId": "{{content_id}}",
                "batchId": "{{batch_id}}",
                "status": 2,
                "courseId": "{{course_id}}",
                "lastAccessTime": "2025-05-19 16:39:17:412+0530"
            }
        ]
    }
}'
```
