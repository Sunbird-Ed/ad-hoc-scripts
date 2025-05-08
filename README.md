# ad-hoc-scripts

This repository contains scripts for quiz creation and course enrollment in the Sunbird platform.

## Prerequisites

### Software Requirements
1. Node.js (v18.0.0 or higher)
   - Download from: https://nodejs.org/
   - Verify installation: `node --version`

2. npm (v9.0.0 or higher)
   - Included with Node.js installation
   - Verify installation: `npm --version`

3. TypeScript (v5.0.0 or higher)
   - Install globally: `npm install -g typescript`
   - Verify installation: `tsc --version`

### Environment Setup
1. Required environment variables configured (see Configuration section)
2. Valid Sunbird API credentials
3. Content creator account with appropriate permissions
4. Access to the organization's channel ID

## Configuration

### Required Environment Variables

Set the following environment variables in your `.env` file:

```env
# API Configuration
BASE_URL=sunbird_api_base_url
# The base URL of the Sunbird API endpoint

AUTH_KEY=api_key
# The authentication key for API requests

# Authentication Credentials
USERNAME=content_creator_username
# The username for content creator account

PASSWORD=content_creator_password
# The password for content creator account

TOKEN=user_access_token
# access token for user

CLIENT_ID=direct-grant
# Default: direct-grant
# OAuth client ID for authentication

CLIENT_SECRET=direct-grantfmps12345678
# Default: direct-grantfmps12345678
# OAuth client secret for authentication

GRANT_TYPE=password
# Default: password
# OAuth grant type for authentication

# Content Creation Settings
CHANNEL_ID=channel_id
# The channel ID for content creation

CREATED_BY=content_creator_id
# The ID of the content creator

ORGANISATION=FMPS Org
# The organization name for content creation

FRAMEWORK=FMPS
# The framework ID

CREATOR=Content Creator FMPS
# The name of the content creator

# Copyright Information
COPYRIGHT=FMPS Org
# Copyright holder for the content

# CSV File Paths
QUIZ_CSV_PATH=./data/assessment.csv
# Path to the quiz CSV file to create quiz

QUESTION_CSV_PATH=./data/questions.csv
# Path to the questions CSV file to create questions for quiz

LEARNER_COURSE_CSV_PATH=./data/learner-profile-course.csv
# Path to the learner course enrollment CSV file that contains courses to be enrolled

USER_LEARNER_PATH=./data/user-learner-profile.csv
# Path to the user learner profile CSV file that contains user information
```

## Installation

```bash
npm install
```

## Running the Scripts

### 1. Quiz Creation Script

To run the quiz creation script:

1. Place your CSV files in the `data` directory:
   - Quiz data: `data/quiz_data.csv`
   - Question data: `data/question_data.csv`

2. Set the required environment variables (see Configuration section)

3. Run the script:
```bash
npm run start:quiz
```

### 2. Course Enrollment Script

To run the course enrollment script:

1. Place your enrollment data CSV in the `data` directory:
   - Enrollment data: `data/enrollment_data.csv`

2. Set the required environment variables (see Configuration section)

3. Run the script:
```bash
npm run start:course
```

## Status Reports

The scripts will generate status reports in the following locations:

### Quiz Creation Reports
- `reports/question_status.csv`: Contains status of question creation status
- `reports/quiz_report.csv`: Contains status of quiz creation operations
- `reports/quiz_question_status.csv`: Contains status of question creation and attachment to quizzes

### Course Enrollment Reports
- `reports/course-enrollment-status.csv`: Contains status of course enrollment operations

These reports will contain detailed information about the success/failure of each operation, including any error messages if applicable.

## Troubleshooting

1. Check the generated status reports in the `reports` directory for detailed error information
2. Verify that all required environment variables are set correctly
3. Ensure the CSV files are properly formatted according to the expected schema

## CSV File Format

### Quiz Data CSV Format
```csv
quizId,quizName,description,category,framework
```

### Question Data CSV Format
```csv
questionId,quizId,questionText,options,correctAnswer,questionType
```

### Enrollment Data CSV Format
```csv
userId,courseId,enrollmentDate,status
```