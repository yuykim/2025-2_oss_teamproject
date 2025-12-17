import React from 'react';
import { useNavigate } from 'react-router-dom';

const Home = () => {
  const navigate = useNavigate();

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>나만의 AI 퀴즈 스튜디오</h1>
      <p>LLM으로 만드는 맞춤형 학습 서비스</p>
      <button 
        onClick={() => navigate('/generate')}
        style={{ padding: '15px 30px', fontSize: '18px', cursor: 'pointer', backgroundColor: '#58cc02', color: 'white', border: 'none', borderRadius: '10px' }}
      >
        퀴즈 생성하기
      </button>
    </div>
  );
};

export default Home;