require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer'); 
const Tesseract = require('tesseract.js'); 
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_OCR_CHARS = 1500;
const MIN_OCR_CHARS_FOR_CONFIDENCE = 20;
const AI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
const MAX_AI_RETRIES = 2;
const AI_RETRY_DELAY_MS = 1200;

let aiClient;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); 

// 🚨 CRITICAL FOR VERCEL: Use Memory Storage instead of Disk Storage
// Serverless functions don't have permanent hard drives!
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are supported.'));
        }
        cb(null, true);
    }
});

function parseModelJson(text) {
    const normalized = (text || '')
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

    return JSON.parse(normalized);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableAiError(error) {
    const message = (error && error.message ? error.message : '').toLowerCase();
    return (
        message.includes('429') ||
        message.includes('quota') ||
        message.includes('rate') ||
        message.includes('503') ||
        message.includes('unavailable') ||
        message.includes('overloaded') ||
        message.includes('timeout')
    );
}

function getAiClient() {
    if (!aiClient) {
        aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return aiClient;
}

function normalizeExtractedText(text) {
    return (text || '')
        .replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function extractTextWithVisionFallback(imageBuffer, mimeType) {
    const ai = getAiClient();
    const visionResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
            role: 'user',
            parts: [
                { text: 'Extract all readable text from this image exactly as written. Return plain text only.' },
                {
                    inlineData: {
                        data: imageBuffer.toString('base64'),
                        mimeType: mimeType || 'image/png'
                    }
                }
            ]
        }]
    });
    return normalizeExtractedText(visionResponse.text);
}

async function generateStructuredData(prompt) {
    const ai = getAiClient();
    let lastError;

    for (const model of AI_MODELS) {
        for (let attempt = 1; attempt <= MAX_AI_RETRIES; attempt += 1) {
            try {
                const aiResponse = await ai.models.generateContent({
                    model,
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                    }
                });
                return parseModelJson(aiResponse.text);
            } catch (error) {
                lastError = error;
                const retryable = isRetryableAiError(error);
                if (!retryable || attempt === MAX_AI_RETRIES) {
                    break;
                }
                await sleep(AI_RETRY_DELAY_MS * attempt);
            }
        }
    }

    throw lastError || new Error('AI structuring failed.');
}

function buildFallbackData(extractedText) {
    const lines = extractedText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    const keyValuePairs = {};
    for (const line of lines) {
        const match = line.match(/^([A-Za-z0-9 _./()-]{2,40})\s*[:\-]\s*(.+)$/);
        if (match) {
            const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
            if (key && !Object.prototype.hasOwnProperty.call(keyValuePairs, key)) {
                keyValuePairs[key] = match[2].trim();
            }
        }
    }

    return {
        extracted_lines: lines,
        key_values: keyValuePairs
    };
}

async function extractTextFromImage(imageBuffer) {
    const worker = await Tesseract.createWorker('eng');
    try {
        const runPass = async (psm) => {
            await worker.setParameters({
                preserve_interword_spaces: '1',
                user_defined_dpi: '300',
                tessedit_pageseg_mode: psm
            });
            return worker.recognize(imageBuffer, { rotateAuto: true });
        };

        const sparseResult = await runPass(Tesseract.PSM.SPARSE_TEXT);
        const autoResult = await runPass(Tesseract.PSM.AUTO);
        const blockResult = await runPass(Tesseract.PSM.SINGLE_BLOCK);

        const scoreResult = (result) => {
            const text = (result.data.text || '').trim();
            const confidence = Number(result.data.confidence || 0);
            return confidence + (text.length / 18);
        };

        const bestResult = [sparseResult, autoResult, blockResult]
            .sort((a, b) => scoreResult(b) - scoreResult(a))[0];

        return bestResult.data.text || '';
    } finally {
        await worker.terminate();
    }
}

app.post('/api/analyze', upload.single('document'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded. Please send an image." });
    }

    try {
        console.log(`📄 1. Image received in memory. Starting OCR...`);
        
        // --- 1. OCR EXTRACTION (Read from memory buffer instead of file path) ---
        const ocrText = await extractTextFromImage(req.file.buffer);
        
        // 🛡️ DATA DIET: Slice the text to a maximum of 1500 characters to prevent 429 Quota Errors
        let extractedText = normalizeExtractedText(ocrText).substring(0, MAX_OCR_CHARS);
        const looksWeak = extractedText.replace(/\s/g, '').length < MIN_OCR_CHARS_FOR_CONFIDENCE;

        if (looksWeak && process.env.GEMINI_API_KEY) {
            try {
                const visionText = (await extractTextWithVisionFallback(req.file.buffer, req.file.mimetype))
                    .substring(0, MAX_OCR_CHARS);
                if (visionText.replace(/\s/g, '').length > extractedText.replace(/\s/g, '').length) {
                    extractedText = visionText;
                }
            } catch (visionError) {
                console.warn("⚠️ Vision OCR fallback failed:", visionError.message || visionError);
            }
        }

        if (!extractedText.trim()) {
            return res.json({
                status: "partial_success",
                message: "OCR finished with very low confidence.",
                warning: "Could not confidently read text. Try a sharper screenshot or crop closer to the text area.",
                rawText: "No readable text detected from this image.",
                data: buildFallbackData("")
            });
        }
        
        console.log("✅ 2. OCR Complete. Passing truncated raw text to AI...");

        if (!process.env.GEMINI_API_KEY) {
            return res.json({
                status: "success",
                message: "Text extracted successfully.",
                rawText: extractedText,
                data: buildFallbackData(extractedText)
            });
        }

        // --- 2. AI STRUCTURING ---
        const prompt = `
        You are a highly accurate data extraction API. 
        I will provide you with messy, raw text extracted from an image via OCR.
        Your job is to clean it up, extract the logical data points, and return a clean JSON object.
        
        Raw OCR Text:
        """
        ${extractedText}
        """

        Return ONLY a raw JSON object containing the data you found. Do not include any markdown formatting or code blocks.
        `;

        try {
            const structuredData = await generateStructuredData(prompt);
            console.log("🧠 3. AI Parsing Complete!");

            // --- 3. SEND FINAL RESPONSE ---
            return res.json({
                status: "success",
                message: "Document successfully analyzed and structured!",
                rawText: extractedText,
                data: structuredData
            });
        } catch (aiError) {
            console.error("❌ AI Structuring Error:", aiError);
            return res.json({
                status: "success",
                message: "Text extracted successfully.",
                rawText: extractedText,
                data: buildFallbackData(extractedText)
            });
        }

    } catch (error) {
        console.error("❌ Process Error:", error);
        const message = error && error.message ? error.message : "Failed to process the document.";
        if (message.includes('Only image files are supported')) {
            return res.status(400).json({ error: message });
        }
        res.status(500).json({ error: "Failed to process the document image." });
    }
});

app.use((err, _req, res, next) => {
    if (!err) {
        return next();
    }
    if (err.message && err.message.includes('Only image files are supported')) {
        return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

// Export the app for Vercel Serverless
module.exports = app;
