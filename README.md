# ad-hoc-scripts

This repository contains scripts for quiz creation and user course enrollment.

## Prerequisites

### Software Requirements
1. Node.js (v18.0.0 or higher)
   - Download from: https://nodejs.org/
   - Verify installation: `node --version`

2. npm (v9.0.0 or higher)
   - Included with Node.js installation
   - Verify installation: `npm --version`


### Environment Setup
1. Required environment variables configured (see Configuration section)
2. Valid API credentials
3. Content creator account with appropriate permissions
4. Access to the organization's channel ID

## Configuration

### Required Environment Variables

Set the following environment variables in your `.env` file:

```env
# API Configuration
BASE_URL=api_base_url
# The base URL for the API endpoint

AUTH_KEY=api_key
# The authentication key for API requests

# Authentication Credentials
CREATOR_USERNAME=content_creator_username
# The username for content creator account

CREATOR_PASSWORD=content_creator_password
# The password for content creator account

REVIEWER_USERNAME=content_reviewer_username
# The username for content reviewer account

REVIEWER_PASSWORD=content_reviewer_password
# The password for content reviewer account

CLIENT_ID=client_id
# OAuth client ID for authentication

CLIENT_SECRET=client_secret
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

Ensure a data folder is created in the root directory of the project. This folder should contain the necessary CSV files used to create quizzes and questions.

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

Before running the scripts, you need to install the project dependencies. These are the software packages that the project requires to work correctly. To install them, open your terminal or command prompt, navigate to the project folder, and run:

```bash
npm install
```
This command will download and set up all necessary packages listed in the project’s configuration file (package.json).

## Running the Scripts

### 1. Quiz Creation Script

To run the quiz creation script:

1. Place your CSV files in the `data` directory located in the root:
   - Quiz data: `data/quiz_data.csv`
   - Question data: `data/question_data.csv`

2. Set the required environment variables (see Configuration section)

3. Run the script:
```bash
npm run start:quiz
```

### 2. Learner Profile Creation Script

To run the learner profile creation script:

1. Place your learner profile with course data CSV in the `data` directory in the root folder:
   - Learner Profile data: `data/learner-profile-course.csv`

2. Set the required environment variables (see Configuration section)

3. Run the script to create Learner Profile:
```bash
npm run start:learnerProfile
```

### 3. Course Enrollment Script

To run the course enrollment script:

1. Place your user to learner profile data CSV in the `data` directory in the root folder:
   - Enrollment data: `data/user-learner-profile.csv`

2. Set the required environment variables (see Configuration section)

3. Run the script to enroll user to the course:
```bash
npm run start:enroll
```

## CSV File Format

Each CSV file is like a spreadsheet with rows and columns. The first row contains column names. Below is a guide to what each column means for different CSV files.

### Questions Data CSV Columns

Used to upload questions with multiple options and answers.
```csv
code,question_text,score,option_1,option_1_is_correct,option_2,option_2_is_correct,...[n number of options with proper number]
```
This file is used to define questions that will appear in quizzes. Each row represents one question. You can add as many options as needed by continuing the pattern: option_3, option_3_is_correct, and so on.

| Column                | Description                                        |
| --------------------- | -------------------------------------------------- |
| `code`                | Unique codes for the question (e.g., `QZ101`)      |
| `question_text`       | The question text (e.g., *What is the capital...*) |
| `score`               | Points awarded for the correct answer              |
| `option_X`            | Answer choice text (X = 1, 2, 3...)                |
| `option_X_is_correct` | `TRUE` if correct, `FALSE` otherwise               |

Example row:
`QZ001, What is the capital of France?, 5, Paris, TRUE, Lyon, FALSE, ...`

### Quiz Data CSV Columns

Used to define quizzes and group questions together.
```csv
code,quiz_name,language,quiz_type,questions,max_attempts
```
This file describes a quiz, including its name, type, language, and which questions are included.

| Column         | Description                                          |
| -------------- | ---------------------------------------------------- |
| `code`         | Unique code for the quiz (e.g., `QUIZ001`)           |
| `quiz_name`    | Name/title of the quiz (e.g., *General Knowledge*)   |
| `language`     | Quiz Language (e.g., `English`, `Arabic`)            |
| `quiz_type`    | Type of quiz (e.g., `assess`, `practice`)            |
| `questions`    | Question codes used for quiz(e.g.,`QZ101,QZ102`)     |
| `max_attempts` | How many times a user can attempt the quiz           |

Example row:
`QUIZ001, Geography Quiz, en, practice, QZ001,QZ002,QZ003, 3`

### Learner Profile Data CSV Columns

Used to define the learner profile along with the courses to be attached.
```csv
learner_profile_code,learner_profile,course_code,expiry_date
```
This file links learner profiles to specific courses and when access expires.

| Column                 | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| `learner_profile_code` | Unique code for the profile (e.g., `LP001`)                 |
| `learner_profile`      | Name of the learner profile                                 |
| `course_code`          | Code of the course the profile can access                   |
| `expiry_date`          | Access end date in `YYYY-MM-DD` format (e.g., `2025-12-31`) |

Example row:
`LP001, Beginner, COURSE001, 2025-12-31`

### Course Enrollment Data CSV Columns

This file assigns individual users to learner profiles, which are used to enroll them into courses.
```csv
email,learner_profile_code
```
This file links user emails to specific learner profile codes for enrollment.

| Column                 | Description                                              |
| ---------------------- | -------------------------------------------------------- |
| `email`                | User's email address                                     |
| `learner_profile_code` | Learner profile codes used to enroll users in courses    |

Example row:
`user@example.com, LP001`


## Status Reports

The scripts will generate status reports in the following locations:

### Quiz Creation Reports
- `src/reports/question_status.csv`: Contains status of question creation status
- `src/reports/quiz_report.csv`: Contains status of quiz creation operations
- `src/reports/quiz_question_status.csv`: Contains status of question creation and attachment to quizzes

### Learner Profile Creation Report
- `src/reports/learner-profile-status.csv`: Contains the learner profile creation status.

### Course Enrollment Report
- `src/reports/enrollment-status.csv`: Contains the course enrollment status for the user.

These reports will contain detailed information about the success/failure of each operation, including any error messages if applicable.

## Troubleshooting

1. Check the generated status reports in the `src/reports` directory for detailed error information
2. Verify that all required environment variables are set correctly
3. Ensure the CSV files are properly formatted according to the expected schema