require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

/**
 * Summarize an array of comment texts using Gemini.
 * Returns a short summary string, or null if summarization is not available.
 *
 * @param {string[]} comments
 * @returns {Promise<string|null>}
 */
async function summarizeComments(comments) {
  try {
    if (!GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY is not set – skipping feedback summarization.');
      return null;
    }

    if (!Array.isArray(comments) || comments.length === 0) {
      return null;
    }

    const joinedComments = comments
      .filter(Boolean)
      .map((c, idx) => `${idx + 1}. ${c}`)
      .join('\n');

    if (!joinedComments.trim()) {
      return null;
    }

    const prompt = `
You are a helpful assistant summarizing guest feedback for a rental home.
Read the comments below and produce:
- A short, friendly summary (2–3 sentences)
- Focus on the main positives and any common issues
- Do not mention that you are an AI or that this is a summary.
- Write in simple and easy to understand language.
- Give it a human like tone.
Guest comments:
${joinedComments}
    `.trim();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('Gemini API error status:', response.status, await response.text());
      return null;
    }

    const data = await response.json();

    const summary =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      Array.isArray(data.candidates[0].content.parts)
        ? data.candidates[0].content.parts.map((p) => p.text || '').join(' ').trim()
        : null;

    return summary || null;
  } catch (err) {
    console.error('Error while calling Gemini for comment summary:', err);
    return null;
  }
}

/**
 * Generate a short property description from the first uploaded photo.
 * The image is read from disk and sent to Gemini together with a prompt.
 *
 * @param {string} imagePath - filesystem path to the image (e.g. "uploads/xyz.jpg")
 * @returns {Promise<string|null>}
 */
async function generateDescriptionFromImage(imagePath) {
  try {
    if (!GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY is not set – skipping description generation.');
      return null;
    }

    if (!imagePath) {
      return null;
    }

    // Resolve path relative to project root to be safe
    const absolutePath = path.resolve(imagePath);

    const fileData = await fs.readFile(absolutePath);
    const base64Data = fileData.toString('base64');

    const prompt = `
You are helping a host write a listing description for a rental home.
Look at the photo and write a short, attractive description (2–3 sentences)
that describes the style of the home, atmosphere, and what guests might like.
Do not mention that you are looking at a photo.
`.trim();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  data: base64Data,
                  mimeType: 'image/jpeg', // works for most jpg/png; Gemini is flexible here
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('Gemini image API error status:', response.status, await response.text());
      return null;
    }

    const data = await response.json();

    const description =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      Array.isArray(data.candidates[0].content.parts)
        ? data.candidates[0].content.parts.map((p) => p.text || '').join(' ').trim()
        : null;

    return description || null;
  } catch (err) {
    console.error('Error while calling Gemini for description generation:', err);
    return null;
  }
}

/**
 * Generate a description from raw base64 image data (for client-side uploads).
 *
 * @param {string} base64Data
 * @param {string} mimeType
 * @returns {Promise<string|null>}
 */
async function generateDescriptionFromImageData(base64Data, mimeType = 'image/jpeg') {
  try {
    if (!GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY is not set – skipping description generation.');
      return null;
    }

    if (!base64Data) {
      return null;
    }

    const prompt = `
You are helping a host write a listing description for a rental home.
Look at the photo and write a short, attractive description (2–3 sentences)
that describes the style of the home, atmosphere, and what guests might like.
Do not mention that you are looking at a photo.
`.trim();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  data: base64Data,
                  mimeType,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('Gemini image API error status:', response.status, await response.text());
      return null;
    }

    const data = await response.json();

    const description =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      Array.isArray(data.candidates[0].content.parts)
        ? data.candidates[0].content.parts.map((p) => p.text || '').join(' ').trim()
        : null;

    return description || null;
  } catch (err) {
    console.error('Error while calling Gemini for description generation (inline data):', err);
    return null;
  }
}

async function generateDescriptionFromContext(base64Data, mimeType, keywords = [], furnished, bhk) {
  try {
    if (!GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY is not set – skipping description generation.');
      return null;
    }

    // Normalize keywords
    const kwArray = Array.isArray(keywords) ? keywords.filter(Boolean) : (typeof keywords === 'string' ? keywords.split(',').map(k => k.trim()).filter(Boolean) : []);

    // Build prompt with text context
    let prompt = `\nYou are helping a host write a listing description for a rental home.\n`;
    if (furnished) {
      prompt += `Furnishing: ${String(furnished)}.\n`;
    }
    if (bhk) {
      prompt += `Bedrooms: ${String(bhk)}.\n`;
    }
    if (kwArray.length > 0) {
      prompt += `Keywords: ${kwArray.join(', ')}.\n`;
    }
    prompt += `Write a short, attractive description (2–3 sentences) that highlights these features and what guests might like. Keep it friendly and concise. Do not mention that you are an AI.`.trim();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    // Prepare body: include inline image data if provided
    const parts = [{ text: prompt }];
    if (base64Data) {
      parts.push({ inlineData: { data: base64Data, mimeType: mimeType || 'image/jpeg' } });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contents: [{ parts }] }),
    });

    if (!response.ok) {
      console.error('Gemini context API error status:', response.status, await response.text());
      return null;
    }

    const data = await response.json();

    const description =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      Array.isArray(data.candidates[0].content.parts)
        ? data.candidates[0].content.parts.map((p) => p.text || '').join(' ').trim()
        : null;

    return description || null;
  } catch (err) {
    console.error('Error while calling Gemini for description generation (context):', err);
    return null;
  }
}

module.exports = {
  summarizeComments,
  generateDescriptionFromImage,
  generateDescriptionFromImageData,
  generateDescriptionFromContext,
};

