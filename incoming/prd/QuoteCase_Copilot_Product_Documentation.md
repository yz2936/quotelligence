# QuoteCase Copilot Product Documentation

## Overview
QuoteCase Copilot is a lightweight enterprise quoting support system for manufacturers. It helps sales and technical teams intake RFQs, organize them into a structured quote case, and compare case requirements against past quotes, capability files, certificates, and compliance documentation.

The product is intentionally narrow in scope. It is not a CRM, ERP, or full CPQ platform. It is a focused quote intake and review workspace.

---

## Product Goal
Build a simple, structured system that helps manufacturing sales teams answer:

- What is the customer asking for?
- What product and commercial details can be extracted automatically?
- What information is still missing?
- What questions should we ask before quoting?
- Do our existing files suggest we can support the request?
- What is the current status of this quote case?

---

## Core Workflow
The product has three layers.

### Layer 1: Chat Intake
A simple chat-based intake screen where users can:
- upload RFQ files
- paste email content
- optionally connect email threads

The system should acknowledge receipt, parse the files, and create a quote case.

### Layer 2: Case Workspace
A single structured workspace where one RFQ becomes one case.

The workspace should show:
- extracted product details
- commercial and technical requirements
- missing information
- suggested customer questions
- current case status
- source files
- AI summary

### Layer 3: Knowledge Base Comparison
A validation layer where users can upload:
- past quotes
- capability matrices
- certificates
- compliance documents
- standards reference files
- inspection templates

The system should compare current case requirements against those files and return:
- matching support
- partial support
- missing support
- status analysis
- caution areas

---

## Primary Users

### Sales / Commercial User
- uploads RFQ files
- reviews extracted fields
- checks suggested questions
- uses case status before quoting

### Technical Sales / Compliance User
- reviews standards and document requirements
- uploads supporting files
- validates system analysis

### Admin User
- manages workspace settings
- manages knowledge base files
- configures email integration

---

## Scope

### In Scope for V1
- chat intake
- file upload
- optional email integration
- automatic case creation
- extracted details view
- editable extracted fields
- suggested clarifying questions
- knowledge file upload
- comparison analysis
- status analysis

### Out of Scope for V1
- pricing engine
- formal quote generation
- order management
- ERP writeback
- CRM workflows
- approval chains
- advanced dashboard analytics

---

## Main Screens

### 1. Chat Intake Screen
Purpose:
- allow user to begin naturally
- upload files
- connect email
- create a case quickly

Required UI elements:
- product header
- chat message area
- file upload button
- connect email button
- attached file list
- parse progress state
- create case confirmation

Expected behavior:
- user uploads one or more RFQ files
- system parses files
- system responds with a short intake summary
- system creates a case and routes user to Case Workspace

Example system response:
> I found 3 files and extracted a likely RFQ for stainless seamless pipe. A quote case has been created with product details, required documents, and follow-up questions.

---

### 2. Case Workspace Screen
Purpose:
- central place to review one quote request

Required sections:
- Case Header
- Extracted Details
- Missing / Unclear Information
- Suggested Questions
- Source Files
- AI Summary
- Case Status

#### Case Header
Fields:
- case ID
- customer name
- project name
- owner
- created date
- updated date
- current status

#### Extracted Details
Fields:
- product type
- material / grade
- dimensions
- quantity
- requested standards
- inspection requirements
- documentation requirements
- delivery request
- destination
- special notes

All fields should be editable.

#### Missing / Unclear Information
System should list:
- missing fields
- ambiguous requirements
- low-confidence extracted items

#### Suggested Questions
System should generate 3 to 8 concise questions that block quoting or need clarification.

#### AI Summary
System should generate a short enterprise-style summary:
- what the customer likely needs
- what appears straightforward
- what needs clarification
- what should be checked in the knowledge base

#### Case Status
Allowed statuses:
- New
- Parsing
- Ready for Review
- Needs Clarification
- Under Knowledge Review
- Partially Supported
- Ready to Quote
- Escalate Internally

---

### 3. Knowledge Comparison Screen
Purpose:
- compare the current case against uploaded internal files

Required sections:
- upload area
- knowledge file list
- matched support
- partial support
- missing support
- analysis summary

Accepted knowledge files:
- past quotes
- quote spreadsheets
- capability matrices
- compliance files
- certificates
- standards notes
- inspection templates
- sample documentation

Comparison output should be grouped into:

#### Matching Support
Requirements that appear supported by the available files.

#### Partial Support
Requirements that may be supported but still need manual confirmation.

#### Missing Support
Requirements with no supporting evidence found.

#### Suggested Review Areas
Items that deserve manual review before the quote is sent.

Comparison statuses:
- Supported
- Likely Supported
- Unclear
- Not Found

---

## Core Functional Requirements

### Intake Requirements
- support multiple file upload
- support pasted email text
- optionally support connected email thread selection
- support PDF, DOCX, XLSX, TXT, EML
- parse uploaded content
- create one case per RFQ
- show loading and parsing status

### Case Requirements
- store extracted fields in structured format
- allow user edits
- preserve source references when possible
- generate suggested questions
- generate short AI summary
- display status badge clearly

### Knowledge Base Requirements
- allow case-level file uploads
- optionally allow workspace/global file uploads
- index uploaded documents
- retrieve relevant files
- compare case requirements to document content
- produce analysis summary
- avoid overclaiming support

---

## AI Behavior Requirements
The AI should behave like a professional enterprise assistant, not a consumer chatbot.

It should:
- be concise
- use structured language
- separate fact from inference
- clearly mark uncertainty
- avoid definitive compliance claims without evidence

Preferred phrases:
- appears supported by available files
- requires manual confirmation
- no evidence found in current knowledge base
- likely needs clarification before quoting

It should never state final compliance unless the documentation strongly supports that conclusion.

---

## Data Model

### Case Object
- case_id
- title
- customer_name
- project_name
- owner
- status
- created_at
- updated_at
- source_files
- extracted_fields
- ai_summary
- suggested_questions
- comparison_results
- knowledge_files

### Extracted Field Object
- field_name
- value
- confidence
- source_reference
- is_user_edited
- notes

### Knowledge File Object
- file_id
- name
- type
- upload_scope
- uploaded_at
- parsed_text
- tags

### Comparison Result Object
- result_id
- category
- requirement
- status
- supporting_files
- explanation
- manual_review_required

---

## Backend Requirements

### Core Services
- file upload service
- document parsing service
- case creation service
- case storage service
- knowledge indexing service
- retrieval and comparison service
- AI orchestration service

### Suggested Stack
- frontend: React or Next.js with TypeScript
- backend: Node.js or Python
- database: relational database for metadata and cases
- storage: object storage for uploaded files
- retrieval: vector index or document retrieval service

---

## Prompt Modules

### Prompt 1: RFQ Extraction
Goal:
Extract structured quote information from uploaded files.

Output:
JSON only

Fields:
- customer_name
- project_name
- product_type
- material
- dimensions (Wall thickness, outside dimension, length per piece)
- quantity
- requested_standards
- inspection_requirements
- documentation_requirements
- delivery_request
- destination
- special_requirements
- missing_information
- unclear_items

### Prompt 2: Clarifying Questions
Goal:
Generate concise customer follow-up questions.

Rules:
- prioritize blockers to quoting
- use professional tone
- return 3 to 8 questions

### Prompt 3: Knowledge Comparison
Goal:
Compare quote case requirements against uploaded knowledge files.

Rules:
- classify as supported / likely supported / unclear / not found
- cite file names when possible
- do not overstate support

### Prompt 4: Status Analysis
Goal:
Generate a short business-style summary.

Output:
- summary
- main risks
- recommended next step
- current status

---

## Example Case

### Example Extracted Details
- Customer: HeatEx Procurement Team
- Product: Seamless Pipe
- Material: ASTM A312 TP316L
- Spec: 2” SCH40, 6m
- Quantity: 1,200 meters
- Documents: EN 10204 3.1
- Inspection: PMI, Hydrotest
- Delivery: 6 weeks
- Destination: Singapore
- Missing: exact NACE requirement
- Unclear: whether third-party witness is required

### Example Suggested Questions
- Please confirm whether NACE compliance is required and to which exact standard.
- Please confirm whether third-party inspection witness is required.
- Please confirm whether partial shipment is acceptable.

### Example Comparison Analysis
- Material requirement appears supported by capability matrix.
- EN 10204 3.1 appears supported by prior certificate documentation.
- Exact NACE requirement is unclear based on current files.
- No evidence found yet for third-party witness requirement.

### Example Status
**Needs Clarification**

---

## MVP Acceptance Criteria
The MVP is successful if a user can:

1. upload RFQ files from the intake screen
2. create a structured quote case automatically
3. review extracted details in the case workspace
4. edit extracted fields
5. receive suggested clarifying questions
6. upload knowledge files
7. run comparison analysis
8. receive a clear status and AI summary

---

## Build Guidance for Google AI Studio / Codex
Build this as a desktop-first enterprise web app.

Design principles:
- structured and minimal
- professional enterprise SaaS
- not visually noisy
- no consumer-style AI gimmicks
- case-centric workflow
- mock data first, then AI wiring
- reusable components
- clear status design
- editable extracted fields
- modular prompts
- simple navigation

Suggested build order:
1. app shell and routing
2. chat intake screen
3. case workspace screen
4. knowledge comparison screen
5. AI extraction and question generation
6. comparison analysis
7. persistence and polish
