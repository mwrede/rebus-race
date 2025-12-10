import { useEffect, useRef, useState } from 'react';

interface BouncingRevealImageProps {
  date: string; // Date in YYYY-MM-DD format
  onComplete?: () => void;
}

function BouncingRevealImage({ date, onComplete }: BouncingRevealImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(true);
  const animationFrameRef = useRef<number>();

  // Convert date from YYYY-MM-DD to DD.MM.YYYY format
  const formatDateForReveal = (dateStr: string): string => {
    const [year, month, day] = dateStr.split('-');
    return `${day}.${month}.${year}_reveal.png`;
  };

  const revealImageSrc = formatDateForReveal(date);

  useEffect(() => {
    // Hide after 8 seconds
    const timer = setTimeout(() => {
      setVisible(false);
      if (onComplete) {
        onComplete();
      }
    }, 8000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  useEffect(() => {
    if (!imageRef.current || !containerRef.current || !visible) return;

    const image = imageRef.current;
    const container = containerRef.current;
    
    // Wait for image to load
    const handleImageLoad = () => {
      const containerRect = container.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      const imageWidth = imageRect.width;
      const imageHeight = imageRect.height;

      // Start position in center
      let x = (containerRect.width - imageWidth) / 2;
      let y = (containerRect.height - imageHeight) / 2;
      
      // Random initial velocity (2-4 pixels per frame)
      let vx = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 2);
      let vy = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 2);

      const animate = () => {
        if (!visible) {
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
          }
          return;
        }

        // Update position
        x += vx;
        y += vy;

        // Get current container dimensions
        const currentContainerRect = container.getBoundingClientRect();
        const containerWidth = currentContainerRect.width;
        const containerHeight = currentContainerRect.height;

        // Bounce off walls
        if (x <= 0) {
          vx = Math.abs(vx);
          x = 0;
        } else if (x + imageWidth >= containerWidth) {
          vx = -Math.abs(vx);
          x = containerWidth - imageWidth;
        }

        if (y <= 0) {
          vy = Math.abs(vy);
          y = 0;
        } else if (y + imageHeight >= containerHeight) {
          vy = -Math.abs(vy);
          y = containerHeight - imageHeight;
        }

        setPosition({ x, y });
        animationFrameRef.current = requestAnimationFrame(animate);
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    if (image.complete) {
      handleImageLoad();
    } else {
      image.addEventListener('load', handleImageLoad);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      image.removeEventListener('load', handleImageLoad);
    };
  }, [date, visible]);

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 overflow-hidden pointer-events-none"
    >
      <img
        ref={imageRef}
        src={`/${revealImageSrc}`}
        alt="Reveal"
        className="absolute"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          maxWidth: '300px',
          maxHeight: '300px',
          objectFit: 'contain',
        }}
        onError={() => {
          // If image doesn't exist, hide the component
          console.log('Reveal image not found:', revealImageSrc);
          setVisible(false);
        }}
      />
    </div>
  );
}

export default BouncingRevealImage;

