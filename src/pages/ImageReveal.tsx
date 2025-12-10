import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

function ImageReveal() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const text = searchParams.get('text') || '';
  const isCorrect = searchParams.get('isCorrect') === 'true';
  const [emojis] = useState<string[]>(['🎉', '🎊', '🎈', '✨', '🌟', '💫', '🔥', '👏', '🙌', '🥳']);

  useEffect(() => {
    // After 5 seconds, navigate to /today (which will show the reveal/results page)
    // Add a flag to indicate we're returning from image reveal
    const timer = setTimeout(() => {
      navigate('/today?fromReveal=true');
    }, 5000);

    return () => clearTimeout(timer);
  }, [navigate]);

  // Generate random positions for emojis
  const getRandomPosition = () => ({
    top: `${Math.random() * 80 + 10}%`,
    left: `${Math.random() * 80 + 10}%`,
  });

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center overflow-hidden">
      {/* Bouncing text */}
      <div
        className="text-6xl sm:text-8xl md:text-9xl font-bold text-white animate-bounce"
        style={{
          animation: 'bounce 0.5s infinite',
          textShadow: '0 0 20px rgba(255,255,255,0.5)',
        }}
      >
        {text}
      </div>

      {/* Bouncing emojis (only for correct answers) */}
      {isCorrect && emojis.map((emoji, index) => {
        const position = getRandomPosition();
        return (
          <div
            key={index}
            className="absolute text-4xl sm:text-6xl md:text-8xl animate-bounce"
            style={{
              top: position.top,
              left: position.left,
              animation: `bounce ${0.3 + Math.random() * 0.4}s infinite`,
              animationDelay: `${index * 0.1}s`,
            }}
          >
            {emoji}
          </div>
        );
      })}

      <style>{`
        @keyframes bounce {
          0%, 100% {
            transform: translateY(0) translateX(0);
          }
          25% {
            transform: translateY(-30px) translateX(20px);
          }
          50% {
            transform: translateY(0) translateX(-20px);
          }
          75% {
            transform: translateY(-20px) translateX(10px);
          }
        }
      `}</style>
    </div>
  );
}

export default ImageReveal;

