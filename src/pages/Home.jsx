import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import "./MyQuizzes.css"; // 모달 스타일 재사용하려면(없으면 지워도 됨)

// CRA 기준: public/에 pdf.worker.min.mjs 두면 접근 가능
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const Home = () => {
  const navigate = useNavigate();

  // 모달 상태
  const [open, setOpen] = useState(false);

  // 메타 입력
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState("easy");
  const [tagsText, setTagsText] = useState("");

  // PDF 업로드 & 텍스트
  const [pdfFile, setPdfFile] = useState(null);
  const [extractedText, setExtractedText] = useState("");

  // 상태
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const tags = useMemo(() => {
    return tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }, [tagsText]);

  const resetModal = () => {
    setTitle("");
    setDifficulty("easy");
    setTagsText("");
    setPdfFile(null);
    setExtractedText("");
    setLoading(false);
    setError("");
  };

  const closeModal = () => {
    setOpen(false);
    resetModal();
  };

  const onPickFile = (e) => {
    const file = e.target.files?.[0] || null;
    setPdfFile(file);
    setExtractedText("");
    setError("");
  };

  // ✅ 프론트에서 PDF → 텍스트 추출
  const extractPdfText = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const strings = content.items.map((item) => item.str);
      fullText += strings.join(" ") + "\n\n";
    }
    return fullText.trim();
  };

  // ✅ 생성하기 버튼(모달 내부)
  const handleGenerate = async () => {
    setError("");

    if (!title.trim()) {
      setError("퀴즈 이름(제목)을 입력해 주세요.");
      return;
    }
    if (!pdfFile) {
      setError("PDF 파일을 업로드해 주세요.");
      return;
    }

    setLoading(true);

    try {
      // 1) 텍스트 추출 (이미 추출돼있으면 재사용)
      const text = extractedText.trim()
        ? extractedText
        : await extractPdfText(pdfFile);

      if (!text.trim()) {
        throw new Error("PDF에서 텍스트를 추출하지 못했습니다. (스캔본 PDF일 수 있어요)");
      }

      setExtractedText(text);

      // 2) 서버리스 호출 (Vercel)
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          meta: {
            title: title.trim(),
            difficulty,
            tags,
          },
        }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload?.detail || `요청 실패 (HTTP ${res.status})`);
      }

      // 3) 업로드 결과에서 "첫 번째 저장된 퀴즈 id" 찾기
      // uploaded: [{ ok:true, saved:{ id: "..." } }, ...]
      const firstSavedId =
        payload?.uploaded?.find((x) => x?.ok && x?.saved?.id)?.saved?.id || null;

      // 4) 모달 닫고 이동
      setOpen(false);
      resetModal();

      // 바로 디테일로 보내고 싶으면:
      if (firstSavedId) {
        navigate(`/quizzes/${firstSavedId}`);
      } else {
        // fallback: 목록 페이지
        navigate("/my-quizzes");
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>나만의 AI 퀴즈 스튜디오</h1>
      <p>LLM으로 만드는 맞춤형 학습 서비스</p>

      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "15px 30px",
          fontSize: "18px",
          cursor: "pointer",
          backgroundColor: "#58cc02",
          color: "white",
          border: "none",
          borderRadius: "10px",
        }}
      >
        퀴즈 생성하기
      </button>

      {/* ✅ 모달 */}
      {open && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>AI 퀴즈 생성</h3>

            <div className="modal-group">
              <div className="modal-label">퀴즈 이름</div>
              <input
                className="modal-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예) Discrete Math 중간고사 대비"
              />
            </div>

            <div className="modal-group">
              <div className="modal-label">난이도</div>
              <select
                className="modal-select"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
            </div>

            <div className="modal-group">
              <div className="modal-label">태그 (쉼표로 구분)</div>
              <input
                className="modal-input"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="예) 수학, 확률, 기말"
              />
            </div>

            <div className="modal-group">
              <div className="modal-label">PDF 업로드</div>
              <input
                type="file"
                accept="application/pdf"
                onChange={onPickFile}
              />
              {pdfFile && (
                <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
                  📄 {pdfFile.name}
                </div>
              )}
            </div>

            {/* (선택) 추출 텍스트 미리보기: 너무 길면 UI 지저분하면 지워도 됨 */}
            {extractedText && (
              <div className="modal-group" style={{ textAlign: "left" }}>
                <div className="modal-label">추출된 텍스트(미리보기)</div>
                <textarea
                  className="modal-input"
                  style={{ height: 120 }}
                  value={extractedText}
                  onChange={(e) => setExtractedText(e.target.value)}
                />
              </div>
            )}

            {error && (
              <div style={{ color: "crimson", marginTop: 10, fontSize: 14 }}>
                ⚠ {error}
              </div>
            )}

            <div className="modal-actions">
              <button className="cancel-btn" onClick={closeModal} disabled={loading}>
                취소
              </button>

              <button className="save-btn" onClick={handleGenerate} disabled={loading}>
                {loading ? "생성 중..." : "생성하기"}
              </button>
            </div>

            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
              생성하면 자동으로 MockAPI에 저장되고, 생성된 퀴즈 페이지로 이동합니다.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;