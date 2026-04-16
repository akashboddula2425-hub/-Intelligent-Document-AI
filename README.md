# -Intelligent-Document-AI
It extract the text from the images
<img width="1915" height="926" alt="Screenshot 2026-04-16 222046" src="https://github.com/user-attachments/assets/90be754a-09d0-4491-9d34-2cd94d3736ab" />

Markdown
# 📄 Intelligent Document Analytics API

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Google_Gemini-8E75B2?style=for-the-badge&logo=google&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

A full-stack, serverless application that processes unstructured document images (receipts, charts, invoices) using Optical Character Recognition (OCR) and formats the extracted text into structured, database-ready JSON using Google's Gemini AI.

**🚀 Live Demo:** [Insert Your Vercel URL Here]

## ✨ Key Features
- **Serverless File Uploading:** Handles `multipart/form-data` securely via Express & Multer, utilizing memory storage specifically optimized for Vercel deployment.
- **Local OCR Extraction:** Utilizes `tesseract.js` to extract raw text directly on the server without relying on paid third-party OCR APIs.
- **LLM Data Structuring:** Integrates the cutting-edge `@google/genai` SDK (Gemini 2.0 Flash) to intelligently parse messy text into predictable JSON.
- **Rate-Limit Protection:** Implements data truncation ("data dieting") to gracefully handle massive documents without triggering API 429 Quota errors on free tiers.
- **Modern Dual-Pane UI:** Includes a responsive frontend with one-click clipboard copying for both raw OCR data and structured JSON outputs.

## 🛠️ Tech Stack
- **Backend:** Node.js, Express.js
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (Fetch API)
- **AI/ML:** Tesseract.js (OCR), Google Gemini 2.0 Flash API
- **Deployment:** Vercel (Serverless Functions)

## 💻 Local Setup Instructions

Follow these steps to run the API on your local machine.

### 1. Clone the repository
```bash
git clone [https://github.com/YOUR-USERNAME/-Intelligent-Document-AI.git](https://github.com/YOUR-USERNAME/-Intelligent-Document-AI.git)
cd -Intelligent-Document-AI
2. Install Dependencies
Bash
npm install
3. Setup Environment Variables
Create a file named .env in the root directory of the project and add your Google Gemini API key:

Code snippet
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
(You can get a free Gemini API key from Google AI Studio)

4. Run the Server
Bash
npm run dev
5. Use the App
Open your browser and navigate to:
http://localhost:3000

🧠 System Architecture
Client submits an image via the web UI.

Express Server catches the image in a memory buffer.

Tesseract.js reads the pixel data and extracts raw English text.

Node.js truncates the text to protect API token limits and constructs a strict prompt.

Gemini 2.0 Flash processes the prompt and returns a dynamically formatted JSON object.

Client receives and renders the dual-pane result.
