require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer'); 
const path = require('path'); 
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); 

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/api/analyze', upload.single('document'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded. Please send an image." });
    }

    try {
        console.log(`📄 1. Image received in memory. Passing directly to Gemini Vision...`);
        
        // Convert the image buffer to a base64 string for Gemini
        const base64Image = req.file.buffer.toString("base64");
        const mimeType = req.file.mimetype;

        // Ask Gemini to do BOTH the reading and the structuring
        const prompt = `
        You are a highly accurate data extraction API. 
        I am providing you with an image of a document.
        Your job is to read the image and return a JSON object with exactly two keys:
        1. "rawText": A string containing all the raw text you can read from the image.
        2. "structuredData": A JSON object containing the logical data points you extracted, cleaned up and categorized.
        
        Return ONLY the raw JSON object. Do not include any markdown formatting or code blocks.
        `;

        const aiResponse = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [
                { text: prompt }, // Strictly define this as text
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: mimeType
                    }
                }
            ],
            config: {
                responseMimeType: "application/json", 
            }
        });

        // Parse Gemini's combined response
        const result = JSON.parse(aiResponse.text);
        console.log("🧠 2. AI Vision & Parsing Complete!");

        res.json({
            status: "success",
            message: "Document successfully analyzed and structured!",
            rawText: result.rawText,           // Sent back to your UI
            data: result.structuredData        // Sent back to your UI
        });

    } catch (error) {
        console.error("❌ Process Error:", error);
        // 🚨 UPGRADE: Send the EXACT error message to the frontend UI
        res.status(500).json({ error: `Backend Error: ${error.message}` });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

module.exports = app;