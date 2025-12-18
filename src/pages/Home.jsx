import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const navigate = useNavigate();

  // ✅ 모달 on/off
  const [open, setOpen] = useState(false);

  // ✅ 입력값
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState("easy");
  const [tagsText, setTagsText] = useState(""); // "태그1, 태그2" 형태

  // ✅ PDF
  const [pdfFile, setPdfFile] = useState(null);

  // ✅ 상태
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 배포/로컬 대응(필요 없으면 "" 그대로 두면 됨)
  const API_BASE = useMemo(() => {
    const base = process.env.REACT_APP_API_BASE?.trim();
    if (!base) return "";
    return base.replace(/\/+$/, "");
  }, []);

  const resetModal = () => {
    setTitle("");
    setDifficulty("easy");
    setTagsText("");
    setPdfFile(null);
    setError("");
    setLoading(false);
  };

  const closeModal = () => {
    setOpen(false);
    resetModal();
  };

  const parseTags = (txt) =>
    txt
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

  // ✅ 생성 요청
  const handleGenerate = async () => {
    if (!title.trim()) {
      setError("퀴즈 이름을 입력해 주세요.");
      return;
    }
    if (!pdfFile) {
      setError("PDF 파일을 업로드해 주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // PDF -> base64 (서버로 전송)
      const arrayBuffer = await pdfFile.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      // Uint8Array -> base64
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);

      const endpoint = `${API_BASE}/api/generate`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ✅ 메타데이터 + PDF(base64)
        body: JSON.stringify({
          title: title.trim(),
          difficulty,
          tags: parseTags(tagsText),
          pdfBase64: base64, // 서버에서 PDF 텍스트 추출하도록
          filename: pdfFile.name,
        }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload?.detail || payload?.message || `요청 실패 (HTTP ${res.status})`);
      }

      // ✅ 업로드 성공 시 이동
      // payload.uploaded: [{ ok, saved: {...mockapi응답...} }, ...]
      const uploaded = Array.isArray(payload?.uploaded) ? payload.uploaded : [];
      const firstSaved = uploaded.find((x) => x?.ok && x?.saved)?.saved;

      // 모달 닫기
      closeModal();

      // ✅ detail 페이지가 있다면 그쪽으로
      if (firstSaved?.id) {
        // 예: /quiz/123 같은 라우트가 있으면 여기 바꾸면 됨
        // navigate(`/quiz/${firstSaved.id}`);
        navigate("/myquizzes");
      } else {
        navigate("/myquizzes");
      }
    } catch (e) {
      console.error(e);
      setError(e.message || "생성 중 오류가 발생했습니다.");
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
        <div
          onClick={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 95vw)",
              background: "white",
              borderRadius: 16,
              padding: 20,
              textAlign: "left",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>퀴즈 생성 설정</h2>
              <button
                onClick={closeModal}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 22,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
                aria-label="close"
              >
                ×
              </button>
            </div>

            <p style={{ marginTop: 8, color: "#555" }}>
              이름/난이도/태그를 정하고 PDF를 업로드하면 자동으로 퀴즈를 생성해 저장합니다.
            </p>

            {/* 이름 */}
            <div style={{ marginTop: 14 }}>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>퀴즈 이름</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 이산수학 중간고사 대비"
                style={{
                  width: "100%",
                  padding: "12px 10px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  outline: "none",
                }}
              />
            </div>

            {/* 난이도 */}
            <div style={{ marginTop: 14 }}>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>난이도</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 10px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  outline: "none",
                  background: "white",
                }}
              >
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
            </div>

            {/* 태그 */}
            <div style={{ marginTop: 14 }}>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>태그(쉼표로 구분)</label>
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="예: 그래프, 오일러, 해밀턴"
                style={{
                  width: "100%",
                  padding: "12px 10px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  outline: "none",
                }}
              />
            </div>

            {/* PDF */}
            <div style={{ marginTop: 14 }}>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>PDF 업로드</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              />
              {pdfFile && <div style={{ marginTop: 8 }}>📄 {pdfFile.name}</div>}
            </div>

            {error && (
              <div style={{ marginTop: 12, color: "#c62828", fontWeight: 600 }}>
                ⚠ {error}
              </div>
            )}

            {/* 버튼 */}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                onClick={closeModal}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "white",
                  cursor: "pointer",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                취소
              </button>

              <button
                onClick={handleGenerate}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#58cc02",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 700,
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "생성 중..." : "생성 시작"}
              </button>
            </div>

            <div style={{ marginTop: 10, color: "#777", fontSize: 12 }}>
              * 배포(Vercel)에서는 <code>/api/generate</code> 서버리스 함수와 <code>UPSTAGE_API_KEY</code> 환경변수가 필요합니다.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
