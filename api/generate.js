// api/generate.js
// Vercel Serverless Function
// POST /api/generate
// body: { title, difficulty, tags, pdfBase64, filename }
// return: { quizzes, uploaded }

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const MOCKAPI_URL =
  process.env.MOCKAPI_URL ||
  "https://69423e10686bc3ca8169004a.mockapi.io/Questions";

const MAX_TEXT_CHARS = 120_000;

function clampText(text) {
  const s = String(text || "");
  if (s.length <= MAX_TEXT_CHARS) return s;
  return s.slice(0, MAX_TEXT_CHARS) + "\n\n[...텍스트가 너무 길어 일부가 잘렸습니다...]";
}

function isoNow() {
  return new Date().toISOString();
}

function base64ToUint8Array(base64) {
  const cleaned = String(base64 || "").replace(/^data:application\/pdf;base64,/, "");
  const buf = Buffer.from(cleaned, "base64");
  return new Uint8Array(buf);
}

async function extractTextFromPdfBytes(pdfBytes) {
  const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;

  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items.map((item) => item.str);
    fullText += strings.join(" ") + "\n\n";
  }
  return fullText.trim();
}

function extractJsonCandidate(s) {
  const text = String(s || "").trim();
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const fenced2 = text.match(/```\s*([\s\S]*?)\s*```/);
  if (fenced2?.[1]) return fenced2[1].trim();
  return text;
}

function safeParseJsonArray(maybeJson) {
  const raw = extractJsonCandidate(maybeJson);

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.quizzes)) return parsed.quizzes;
    if (Array.isArray(parsed?.data)) return parsed.data;
  } catch {}

  const first = raw.indexOf("[");
  const last = raw.lastIndexOf("]");
  if (first !== -1 && last !== -1 && last > first) {
    const slice = raw.slice(first, last + 1);
    try {
      const parsed = JSON.parse(slice);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }

  return null;
}

function normalizeQuizArray(arr, meta) {
  const now = isoNow();
  const { title, difficulty, tags } = meta;

  return (arr || []).map((qz, idx) => {
    const quizId = String(qz?.id ?? idx + 1);
    const qTitle = String(qz?.title ?? title ?? `퀴즈 ${idx + 1}`);
    const topic = String(qz?.topic ?? "General");
    const qDifficulty = String(qz?.difficulty ?? difficulty ?? "medium");
    const createdAt = String(qz?.createdAt ?? now);
    const qTags = Array.isArray(qz?.tags)
      ? qz.tags.map(String)
      : Array.isArray(tags)
      ? tags.map(String)
      : [];
    const isFavorite = Boolean(qz?.isFavorite ?? false);

    const questions = Array.isArray(qz?.questions) ? qz.questions : [];
    const normalizedQuestions = questions.map((qq, qidx) => {
      const qid = Number.isFinite(qq?.id) ? qq.id : qidx + 1;
      const text = String(qq?.text ?? "");
      const options = Array.isArray(qq?.options) ? qq.options.map(String) : [];
      const answer = String(qq?.answer ?? "");
      const explanation = String(qq?.explanation ?? "");
      return { id: qid, text, options, answer, explanation };
    });

    return {
      id: quizId,
      title: qTitle,
      topic,
      difficulty: qDifficulty,
      createdAt,
      tags: qTags,
      isFavorite,
      questions: normalizedQuestions,
    };
  });
}

function buildPrompt({ extractedText, title, difficulty, tags }) {
  const tagsLine = Array.isArray(tags) && tags.length ? tags.join(", ") : "";
  const safeTitle = title ? `퀴즈 제목은 "${title}"로 해.` : "";
  const safeDifficulty = difficulty ? `난이도는 "${difficulty}"로 맞춰.` : "";
  const safeTags = tagsLine ? `tags는 [${tagsLine}]를 반영해.` : "";

  return `
너는 퀴즈 제작기야.
아래 텍스트를 바탕으로 "반드시" JSON만 출력해.

[출력 규칙]
- 출력은 JSON "배열" 하나만 출력 (추가 설명/문장/코드블록 금지)
- 각 퀴즈는 아래 스키마를 반드시 지켜
- createdAt은 ISO8601 문자열
- questions는 최소 5문항
- options는 객관식 4개
- answer는 options 중 하나의 값과 정확히 일치
- explanation은 한두 문장
- difficulty는 easy|medium|hard 중 하나

[추가 요구]
${safeTitle}
${safeDifficulty}
${safeTags}

[스키마]
[
  {
    "id": "1",
    "title": "퀴즈 제목",
    "topic": "General",
    "difficulty": "easy",
    "createdAt": "2024-12-17T11:00:00Z",
    "tags": ["태그1","태그2"],
    "isFavorite": false,
    "questions": [
      {
        "id": 1,
        "text": "문제",
        "options": ["A","B","C","D"],
        "answer": "정답(보기 중 하나)",
        "explanation": "해설"
      }
    ]
  }
]

[텍스트]
${extractedText}
`.trim();
}

async function callUpstageChat({ apiKey, prompt }) {
  const url = "https://api.upstage.ai/v1/chat/completions";

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "solar-pro",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    const detail =
      data?.error?.message ||
      data?.message ||
      data?.detail ||
      `Upstage API error (HTTP ${resp.status})`;
    const err = new Error(detail);
    err.status = resp.status;
    err.raw = data;
    throw err;
  }

  return data?.choices?.[0]?.message?.content ?? "";
}

async function uploadToMockAPI(quizzes) {
  const results = await Promise.all(
    quizzes.map(async (quiz) => {
      const r = await fetch(MOCKAPI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quiz),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, status: r.status, error: data, sent: quiz };
      return { ok: true, status: r.status, saved: data };
    })
  );

  return results;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ detail: "Method not allowed" });

  try {
    const apiKey = process.env.UPSTAGE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        detail: "UPSTAGE_API_KEY 환경변수가 없습니다. (Vercel Environment Variables에 추가하세요)",
      });
    }

    const { title, difficulty, tags, pdfBase64 } = req.body || {};

    if (!pdfBase64 || !String(pdfBase64).trim()) {
      return res.status(400).json({ detail: "pdfBase64가 비어있습니다." });
    }

    // 1) PDF 텍스트 추출
    const pdfBytes = base64ToUint8Array(pdfBase64);
    const extractedTextRaw = await extractTextFromPdfBytes(pdfBytes);
    const extractedText = clampText(extractedTextRaw);

    // 2) Upstage로 퀴즈 JSON 생성
    const prompt = buildPrompt({
      extractedText,
      title: String(title || "").trim(),
      difficulty: String(difficulty || "").trim() || "medium",
      tags: Array.isArray(tags) ? tags : [],
    });

    const content = await callUpstageChat({ apiKey, prompt });
    const parsed = safeParseJsonArray(content);

    if (!parsed) {
      return res.status(500).json({
        detail: "Upstage가 JSON 배열을 올바르게 생성하지 못했습니다. (모델 출력 형식을 확인하세요)",
        raw: content,
      });
    }

    const quizzes = normalizeQuizArray(parsed, {
      title: String(title || "").trim(),
      difficulty: String(difficulty || "").trim() || "medium",
      tags: Array.isArray(tags) ? tags : [],
    });

    // 3) MockAPI 업로드
    const uploaded = await uploadToMockAPI(quizzes);

    return res.status(200).json({ quizzes, uploaded });
  } catch (e) {
    console.error(e);
    return res.status(e.status || 500).json({
      detail: e.message || "서버 오류",
      raw: e.raw,
    });
  }
}
