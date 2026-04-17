require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer'); 
const path = require('path'); // <-- Added to resolve Vercel file paths
const Tesseract = require('tesseract.js'); 
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Explicitly tell Vercel where the public folder is
app.use(express.static(path.join(__dirname, 'public'))); 

// Explicitly serve the index.html file when someone visits the main URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serverless memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/api/analyze', upload.single('document'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded. Please send an image." });
    }

    try {
        console.log(`📄 1. Image received in memory. Starting OCR...`);
        
        const ocrResult = await Tesseract.recognize(req.file.buffer, 'eng');
        const extractedText = ocrResult.data.text.substring(0, 1500);
        
        console.log("✅ 2. OCR Complete. Passing truncated raw text to AI...");

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

        const aiResponse = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json", 
            }
        });

        const structuredData = JSON.parse(aiResponse.text);
        console.log("🧠 3. AI Parsing Complete!");

        res.json({
            status: "success",
            message: "Document successfully analyzed and structured!",
            rawText: extractedText,
            data: structuredData
        });

    } catch (error) {
        console.error("❌ Process Error:", error);
        res.status(500).json({ error: "Failed to process the document. Rate limit or server error." });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

module.exports = app;